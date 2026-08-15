import { randomBytes } from 'crypto';
import { Decimal } from 'decimal.js';
import prisma from '../../core/config/database.js';
import {
  normalizeBlockchain,
  tokenContractMatches,
} from '../../services/tatum/tatum-blockchain.util.js';
import { notifyCryptoDeposit } from '../../core/utils/notification.events.js';

export type WebhookProcessResult = {
  processed: boolean;
  reason?: string;
};

function normalizeAddress(addr: string | null | undefined): string | null {
  if (!addr) return null;
  const trimmed = addr.trim();
  if (trimmed.startsWith('0x')) {
    return trimmed.toLowerCase();
  }
  return trimmed;
}

async function findDepositAddressByWebhookAddress(webhookAddr: string) {
  const normalized = normalizeAddress(webhookAddr);
  if (!normalized) return null;

  const candidates = await prisma.depositAddress.findMany({
    include: {
      virtualAccount: {
        include: { walletCurrency: true },
      },
    },
  });

  return (
    candidates.find((da) => normalizeAddress(da.address) === normalized) ?? null
  );
}

async function resolveWalletCurrencyForToken(
  blockchain: string,
  contractAddress: string
) {
  const chain = normalizeBlockchain(blockchain);
  const tokens = await prisma.walletCurrency.findMany({
    where: {
      isToken: true,
      contractAddress: { not: null },
    },
  });

  return (
    tokens.find(
      (wc) =>
        normalizeBlockchain(wc.blockchain) === chain &&
        tokenContractMatches(wc.contractAddress, contractAddress)
    ) ?? null
  );
}

/**
 * Process inbound Tatum v4 address webhooks and credit virtual_accounts.
 */
export async function processBlockchainWebhook(
  webhookData: Record<string, unknown>
): Promise<WebhookProcessResult> {
  const subscriptionType = String(webhookData.subscriptionType ?? '');
  const webhookAddress = String(webhookData.address ?? webhookData.to ?? '');
  const txId = webhookData.txId ? String(webhookData.txId) : null;
  const counterAddress = String(
    webhookData.counterAddress ?? webhookData.from ?? ''
  );

  if (webhookAddress) {
    const masterWallets = await prisma.masterWallet.findMany({
      where: { address: { not: null } },
    });
    const isMasterDeposit = masterWallets.some(
      (mw) => normalizeAddress(mw.address) === normalizeAddress(webhookAddress)
    );
    if (isMasterDeposit) {
      return { processed: false, reason: 'master_wallet' };
    }
  }

  const isAddressWebhook =
    subscriptionType === 'INCOMING_NATIVE_TX' ||
    subscriptionType === 'INCOMING_FUNGIBLE_TX' ||
    subscriptionType === 'ADDRESS_EVENT';

  if (isAddressWebhook && !webhookData.accountId) {
    const depositRecord = await findDepositAddressByWebhookAddress(webhookAddress);
    if (!depositRecord) {
      return { processed: false, reason: 'deposit_address_not_found' };
    }

    let currency = depositRecord.virtualAccount.currency;
    const contractAddress = webhookData.contractAddress
      ? String(webhookData.contractAddress)
      : null;
    const isFungible =
      subscriptionType === 'INCOMING_FUNGIBLE_TX' && Boolean(contractAddress);

    if (isFungible && contractAddress) {
      const matched = await resolveWalletCurrencyForToken(
        depositRecord.virtualAccount.blockchain,
        contractAddress
      );
      if (matched) {
        currency = matched.currency;
      } else {
        return { processed: false, reason: 'token_contract_not_supported' };
      }
    }

    const targetVa = await prisma.virtualAccount.findFirst({
      where: {
        userId: depositRecord.virtualAccount.userId,
        currency,
        blockchain: depositRecord.virtualAccount.blockchain,
      },
    });

    if (!targetVa) {
      return { processed: false, reason: 'virtual_account_not_found' };
    }

    webhookData.accountId = targetVa.accountId;
    webhookData.currency = currency;
    webhookData.from = counterAddress;
    webhookData.to = webhookAddress;
  }

  if (counterAddress) {
    const masterWallets = await prisma.masterWallet.findMany({
      where: { address: { not: null } },
    });
    const fromMaster = masterWallets.some(
      (mw) => normalizeAddress(mw.address) === normalizeAddress(counterAddress)
    );
    if (fromMaster) {
      return { processed: false, reason: 'from_master_wallet' };
    }
  }

  if (txId) {
    const duplicate = await prisma.webhookResponse.findFirst({
      where: { txId },
    });
    if (duplicate) {
      return { processed: false, reason: 'duplicate_tx' };
    }
  }

  const accountId = webhookData.accountId ? String(webhookData.accountId) : null;
  if (!accountId) {
    return { processed: false, reason: 'account_not_found' };
  }

  const virtualAccount = await prisma.virtualAccount.findUnique({
    where: { accountId },
  });

  if (!virtualAccount) {
    return { processed: false, reason: 'virtual_account_not_found' };
  }

  const amountRaw = webhookData.amount;
  if (amountRaw == null || amountRaw === '') {
    return { processed: false, reason: 'missing_amount' };
  }

  const depositAmount = new Decimal(String(amountRaw));
  if (depositAmount.lte(0)) {
    return { processed: false, reason: 'invalid_amount' };
  }

  const currentBalance = new Decimal(virtualAccount.accountBalance || '0');
  const currentAvailable = new Decimal(virtualAccount.availableBalance || '0');
  const newBalance = currentBalance.plus(depositAmount);
  const newAvailable = currentAvailable.plus(depositAmount);

  await prisma.virtualAccount.update({
    where: { id: virtualAccount.id },
    data: {
      accountBalance: newBalance.toString(),
      availableBalance: newAvailable.toString(),
    },
  });

  let cryptoWallet = await prisma.wallet.findFirst({
    where: {
      userId: virtualAccount.userId,
      currency: virtualAccount.currency,
      type: 'crypto',
    },
  });
  if (!cryptoWallet) {
    cryptoWallet = await prisma.wallet.create({
      data: {
        userId: virtualAccount.userId,
        currency: virtualAccount.currency,
        type: 'crypto',
        balance: 0,
        lockedBalance: 0,
      },
    });
  }

  const reference = `DEP-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`;
  await prisma.transaction.create({
    data: {
      walletId: cryptoWallet.id,
      type: 'deposit',
      status: 'completed',
      amount: depositAmount.toNumber(),
      currency: virtualAccount.currency,
      fee: 0,
      reference,
      channel: 'crypto',
      description: `Crypto deposit ${depositAmount.toString()} ${virtualAccount.currency}`,
      completedAt: new Date(),
      metadata: {
        blockchain: virtualAccount.blockchain,
        txId: txId ?? null,
        virtualAccountId: virtualAccount.id,
        source: 'tatum_webhook',
      },
    },
  }).catch((err) => {
    console.error('[Tatum webhook] Failed to record deposit transaction:', err);
  });

  notifyCryptoDeposit(virtualAccount.userId, {
    amount: depositAmount.toString(),
    currency: virtualAccount.currency,
    txId: txId ?? null,
    blockchain: virtualAccount.blockchain,
  });

  return {
    processed: true,
  };
}
