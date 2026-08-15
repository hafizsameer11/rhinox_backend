import { randomUUID } from 'crypto';
import prisma from '../../core/config/database.js';

export class VirtualAccountService {
  /**
   * Create one virtual_accounts row per wallet_currency (DB ledger only — no Tatum Ledger).
   */
  async createVirtualAccountsForUser(userId: number) {
    const walletCurrencies = await prisma.walletCurrency.findMany({
      orderBy: [{ blockchain: 'asc' }, { currency: 'asc' }],
    });

    const createdAccounts = [];

    for (const wc of walletCurrencies) {
      const blockchainKey = wc.blockchain.toLowerCase();

      const existing = await prisma.virtualAccount.findFirst({
        where: {
          userId,
          currency: wc.currency,
          blockchain: blockchainKey,
        },
      });

      if (existing) {
        createdAccounts.push(existing);
        continue;
      }

      const virtualAccount = await prisma.virtualAccount.create({
        data: {
          userId,
          blockchain: blockchainKey,
          currency: wc.currency,
          customerId: String(userId),
          accountId: randomUUID(),
          accountCode: `user_${userId}_${wc.currency}`,
          active: true,
          frozen: false,
          accountBalance: '0',
          availableBalance: '0',
          accountingCurrency: 'USD',
          currencyId: wc.id,
        },
      });

      createdAccounts.push(virtualAccount);
    }

    return createdAccounts;
  }
}
