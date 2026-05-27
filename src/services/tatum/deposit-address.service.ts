import prisma from '../../core/config/database.js';
import { getTatumWebhookUrl } from '../../core/config/tatum.config.js';
import { decryptPrivateKey, encryptPrivateKey } from '../../core/utils/encryption.js';
import {
  isNonHdBlockchain,
  normalizeBlockchain,
} from './tatum-blockchain.util.js';
import { getTatumService } from './tatum.service.js';
import { UserWalletService } from './user-wallet.service.js';

export class DepositAddressService {
  private readonly userWalletService = new UserWalletService();

  /**
   * Assign a deposit address to a virtual account (reuse per chain, register webhooks once).
   */
  async generateAndAssignToVirtualAccount(virtualAccountId: number) {
    const virtualAccount = await prisma.virtualAccount.findUnique({
      where: { id: virtualAccountId },
      include: { walletCurrency: true },
    });

    if (!virtualAccount) {
      throw new Error(`Virtual account ${virtualAccountId} not found`);
    }

    const blockchain = virtualAccount.blockchain.toLowerCase();
    const normalizedBlockchain = normalizeBlockchain(blockchain);

    const existingForVa = await prisma.depositAddress.findFirst({
      where: {
        virtualAccountId,
        currency: virtualAccount.currency,
        blockchain,
      },
    });

    if (existingForVa) {
      return existingForVa;
    }

    const allUserAddresses = await prisma.depositAddress.findMany({
      where: {
        virtualAccount: { userId: virtualAccount.userId },
      },
    });

    const reused = allUserAddresses.find(
      (addr) => normalizeBlockchain(addr.blockchain || '') === normalizedBlockchain
    );

    if (reused) {
      return prisma.depositAddress.create({
        data: {
          virtualAccountId,
          userWalletId: reused.userWalletId,
          blockchain,
          currency: virtualAccount.currency,
          address: reused.address,
          index: reused.index ?? 0,
          privateKey: reused.privateKey,
        },
      });
    }

    const userWallet = await this.userWalletService.getOrCreateUserWallet(
      virtualAccount.userId,
      normalizedBlockchain
    );

    const isNoXpub = isNonHdBlockchain(normalizedBlockchain);
    const tatumService = getTatumService();

    let address: string;
    let privateKey: string;

    if (isNoXpub) {
      if (userWallet.xpub) {
        address = userWallet.xpub;
        if (!userWallet.mnemonic) {
          throw new Error('User wallet missing encrypted key material');
        }
        privateKey = decryptPrivateKey(userWallet.mnemonic);
      } else {
        const walletData = await tatumService.createWallet(normalizedBlockchain);
        address = walletData.address || '';
        privateKey = walletData.privateKey || walletData.secret || '';

        if (!address || !privateKey) {
          throw new Error('Failed to generate wallet address');
        }

        await prisma.userWallet.update({
          where: { id: userWallet.id },
          data: { xpub: address },
        });
      }
    } else {
      if (!userWallet.xpub || !userWallet.mnemonic) {
        throw new Error('User wallet missing xpub or mnemonic');
      }
      const mnemonic = decryptPrivateKey(userWallet.mnemonic);
      address = await tatumService.generateAddress(normalizedBlockchain, userWallet.xpub, 0);
      privateKey = await tatumService.generatePrivateKey(normalizedBlockchain, mnemonic, 0);
    }

    const encryptedPrivateKey = encryptPrivateKey(privateKey);

    const depositAddress = await prisma.depositAddress.create({
      data: {
        virtualAccountId,
        userWalletId: userWallet.id,
        blockchain,
        currency: virtualAccount.currency,
        address,
        index: 0,
        privateKey: encryptedPrivateKey,
      },
    });

    await this.registerWebhooksForAddress(address, normalizedBlockchain);

    return depositAddress;
  }

  private async registerWebhooksForAddress(address: string, normalizedBlockchain: string) {
    const webhookUrl = getTatumWebhookUrl();
    const tatumService = getTatumService();

    await tatumService.registerAddressWebhookV4(address, normalizedBlockchain, webhookUrl, {
      type: 'INCOMING_NATIVE_TX',
    });

    const tokenRows = await prisma.walletCurrency.findMany({
      where: {
        isToken: true,
        contractAddress: { not: null },
      },
    });
    const hasFungibleTokens = tokenRows.some(
      (wc) => normalizeBlockchain(wc.blockchain) === normalizedBlockchain
    );

    if (hasFungibleTokens) {
      await tatumService.registerAddressWebhookV4(address, normalizedBlockchain, webhookUrl, {
        type: 'INCOMING_FUNGIBLE_TX',
      });
    }
  }
}
