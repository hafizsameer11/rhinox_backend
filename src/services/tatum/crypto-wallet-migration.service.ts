import prisma from '../../core/config/database.js';
import { DepositAddressService } from './deposit-address.service.js';
import { VirtualAccountService } from './virtual-account.service.js';

/**
 * Replace user on-chain wallet material (Tatum deposit addresses + HD wallets)
 * while keeping virtual_accounts ledger balances (P2P, buy/sell, internal credits).
 *
 * Model:
 * - virtual_accounts = in-app balance (system ledger)
 * - deposit_addresses = real receive addresses (Tatum webhooks credit ledger)
 * - customer send = master wallet signs (hot liquidity)
 */
export class CryptoWalletMigrationService {
  private readonly virtualAccountService = new VirtualAccountService();
  private readonly depositAddressService = new DepositAddressService();

  /**
   * Remove old deposit_addresses and user_wallets only. Does not touch virtual_accounts.
   */
  async clearOnChainWalletRows(userId: number): Promise<{ depositAddresses: number; userWallets: number }> {
    const deletedAddresses = await prisma.depositAddress.deleteMany({
      where: { virtualAccount: { userId } },
    });
    const deletedWallets = await prisma.userWallet.deleteMany({
      where: { userId },
    });
    return {
      depositAddresses: deletedAddresses.count,
      userWallets: deletedWallets.count,
    };
  }

  /**
   * Ensure virtual_accounts exist, then assign fresh Tatum deposit addresses + webhooks.
   */
  async reprovisionDepositAddresses(userId: number) {
    const virtualAccounts = await this.virtualAccountService.createVirtualAccountsForUser(userId);
    const results: Array<{ virtualAccountId: number; currency: string; blockchain: string; address: string }> = [];

    for (const va of virtualAccounts) {
      const deposit = await this.depositAddressService.generateAndAssignToVirtualAccount(va.id);
      results.push({
        virtualAccountId: va.id,
        currency: va.currency,
        blockchain: va.blockchain,
        address: deposit.address,
      });
    }

    return results;
  }

  /**
   * Full on-chain wallet refresh for one user (ledger balances preserved).
   */
  async replaceUserOnChainWallets(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isEmailVerified: true },
    });
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    const balancesBefore = await prisma.virtualAccount.findMany({
      where: { userId },
      select: {
        currency: true,
        blockchain: true,
        accountBalance: true,
        availableBalance: true,
      },
    });

    const cleared = await this.clearOnChainWalletRows(userId);
    const deposits = await this.reprovisionDepositAddresses(userId);

    const balancesAfter = await prisma.virtualAccount.findMany({
      where: { userId },
      select: {
        currency: true,
        blockchain: true,
        accountBalance: true,
        availableBalance: true,
      },
    });

    return {
      userId,
      cleared,
      depositCount: deposits.length,
      balancesBefore,
      balancesAfter,
      deposits,
    };
  }
}
