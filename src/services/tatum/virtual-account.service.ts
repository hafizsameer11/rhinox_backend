/* 
 * TATUM VIRTUAL ACCOUNT SERVICE - COMMENTED OUT FOR MOCK TESTING
 * This service will be used when Tatum account is available
 */

/*
import { randomUUID } from 'crypto';
import prisma from '../../core/config/database.js';

/**
 * Virtual Account Service
 * Manages virtual accounts for users (one per currency per user)
 */
export class VirtualAccountService {
  /**
   * Create virtual accounts for all supported currencies for a user
   */
  async createVirtualAccountsForUser(userId: string) {
    // Get all supported currencies
    const walletCurrencies = await prisma.walletCurrency.findMany({
      where: { isActive: true },
    });

    const createdAccounts = [];

    for (const currency of walletCurrencies) {
      // Check if exists
      const existing = await prisma.virtualAccount.findFirst({
        where: {
          userId,
          currency: currency.currency,
          blockchain: currency.blockchain,
        },
      });

      if (existing) {
        createdAccounts.push(existing);
        continue;
      }

      // Generate account ID
      const accountId = randomUUID();
      const accountCode = `user_${userId}_${currency.currency}`;

      // Create virtual account
      const virtualAccount = await prisma.virtualAccount.create({
        data: {
          userId,
          blockchain: currency.blockchain,
          currency: currency.currency,
          customerId: userId,
          accountId,
          accountCode,
          active: true,
          frozen: false,
          accountBalance: '0',
          availableBalance: '0',
          accountingCurrency: 'USD',
          currencyId: currency.id,
        },
      });

      createdAccounts.push(virtualAccount);
    }

    return createdAccounts;
  }

  /**
   * Get user's virtual accounts
   */
  async getUserVirtualAccounts(userId: string) {
    return prisma.virtualAccount.findMany({
      where: { userId },
      include: {
        walletCurrency: true,
        depositAddresses: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get virtual account by ID
   */
  async getVirtualAccountById(id: string) {
    return prisma.virtualAccount.findUnique({
      where: { id },
      include: {
        walletCurrency: true,
        depositAddresses: true,
      },
    });
  }

  /**
   * Get virtual account by accountId
   */
  async getVirtualAccountByAccountId(accountId: string) {
    return prisma.virtualAccount.findUnique({
      where: { accountId },
      include: {
        walletCurrency: true,
        depositAddresses: true,
      },
    });
  }

  /**
   * Update virtual account balance
   */
  async updateBalance(accountId: string, amount: string, operation: 'add' | 'subtract' = 'add') {
    const virtualAccount = await prisma.virtualAccount.findUnique({
      where: { accountId },
    });

    if (!virtualAccount) {
      throw new Error('Virtual account not found');
    }

    const currentBalance = parseFloat(virtualAccount.accountBalance || '0');
    const amountNum = parseFloat(amount);
    const newBalance = operation === 'add' 
      ? currentBalance + amountNum 
      : currentBalance - amountNum;

    if (newBalance < 0) {
      throw new Error('Insufficient balance');
    }

    return prisma.virtualAccount.update({
      where: { accountId },
      data: {
        accountBalance: newBalance.toString(),
        availableBalance: newBalance.toString(),
      },
    });
  }
}
*/

