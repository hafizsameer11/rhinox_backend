import prisma from '../../core/config/database.js';
import { normalizeBlockchain } from './tatum-blockchain.util.js';
import { DepositAddressService } from './deposit-address.service.js';
import { UserWalletService } from './user-wallet.service.js';

export type CryptoLinkIssue = {
  virtualAccountId?: number;
  depositAddressId?: number;
  code: string;
  message: string;
};

/**
 * Keeps the crypto stack wired correctly:
 *
 *   User
 *     └── UserWallet (one per chain — Tatum HD / keypair, on-chain keys)
 *           └── DepositAddress (receive address + encrypted key, shared per chain)
 *                 └── VirtualAccount (per currency — **ledger only**, balances in DB)
 *
 * Virtual account balances are never on-chain; webhooks and P2P only update DB fields.
 */
export class CryptoWalletLinkService {
  private readonly depositAddressService = new DepositAddressService();
  private readonly userWalletService = new UserWalletService();

  /**
   * Ensure every virtual account has a deposit row linked to the user's chain wallet.
   */
  async ensureUserCryptoLinks(userId: number): Promise<{ issues: CryptoLinkIssue[] }> {
    const virtualAccounts = await prisma.virtualAccount.findMany({
      where: { userId },
      orderBy: [{ blockchain: 'asc' }, { currency: 'asc' }],
    });

    for (const va of virtualAccounts) {
      await this.depositAddressService.generateAndAssignToVirtualAccount(va.id);
      await this.syncVirtualAccountMetadata(va.id);
    }

    await this.repairOrphanDepositAddresses(userId);

    const issues = await this.validateUserCryptoLinks(userId);
    return { issues };
  }

  /**
   * Attach userWalletId where missing; confirm deposit belongs to same user.
   */
  private async repairOrphanDepositAddresses(userId: number) {
    const deposits = await prisma.depositAddress.findMany({
      where: { virtualAccount: { userId } },
      include: { virtualAccount: true },
    });

    for (const da of deposits) {
      if (!da.virtualAccount) {
        continue;
      }

      const chain = normalizeBlockchain(da.virtualAccount.blockchain);

      if (!da.userWalletId) {
        const userWallet = await this.userWalletService.getOrCreateUserWallet(userId, chain);
        await prisma.depositAddress.update({
          where: { id: da.id },
          data: { userWalletId: userWallet.id },
        });
        continue;
      }

      const wallet = await prisma.userWallet.findUnique({
        where: { id: da.userWalletId },
      });

      if (!wallet || wallet.userId !== userId) {
        const userWallet = await this.userWalletService.getOrCreateUserWallet(userId, chain);
        await prisma.depositAddress.update({
          where: { id: da.id },
          data: { userWalletId: userWallet.id },
        });
      }
    }
  }

  /**
   * customerId + optional xpub reference on ledger row (balances unchanged).
   */
  private async syncVirtualAccountMetadata(virtualAccountId: number) {
    const va = await prisma.virtualAccount.findUnique({
      where: { id: virtualAccountId },
    });
    if (!va) {
      return;
    }

    const chain = normalizeBlockchain(va.blockchain);
    const userWallet = await prisma.userWallet.findUnique({
      where: {
        userId_blockchain: {
          userId: va.userId,
          blockchain: chain,
        },
      },
    });

    await prisma.virtualAccount.update({
      where: { id: virtualAccountId },
      data: {
        customerId: va.customerId || String(va.userId),
        ...(userWallet?.xpub ? { xpub: userWallet.xpub } : {}),
      },
    });
  }

  async validateUserCryptoLinks(userId: number): Promise<CryptoLinkIssue[]> {
    const issues: CryptoLinkIssue[] = [];

    const virtualAccounts = await prisma.virtualAccount.findMany({
      where: { userId },
      include: {
        depositAddresses: true,
      },
    });

    for (const va of virtualAccounts) {
      const chainDeposits = va.depositAddresses.filter(
        (da) =>
          normalizeBlockchain(da.blockchain || '') === normalizeBlockchain(va.blockchain)
      );

      if (chainDeposits.length === 0) {
        issues.push({
          virtualAccountId: va.id,
          code: 'missing_deposit_address',
          message: `No deposit address for ${va.currency} on ${va.blockchain}`,
        });
        continue;
      }

      const deposit = chainDeposits[0];
      if (!deposit) {
        continue;
      }

      if (!deposit.userWalletId) {
        issues.push({
          virtualAccountId: va.id,
          depositAddressId: deposit.id,
          code: 'missing_user_wallet_link',
          message: `Deposit address ${deposit.id} not linked to user_wallets`,
        });
      } else {
        const wallet = await prisma.userWallet.findUnique({
          where: { id: deposit.userWalletId },
        });
        if (!wallet || wallet.userId !== userId) {
          issues.push({
            virtualAccountId: va.id,
            depositAddressId: deposit.id,
            code: 'user_wallet_user_mismatch',
            message: `Deposit address wallet does not belong to user ${userId}`,
          });
        }
      }
    }

    return issues;
  }
}
