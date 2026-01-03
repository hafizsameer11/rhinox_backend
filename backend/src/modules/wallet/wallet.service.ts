import prisma from '../../core/config/database.js';

/**
 * Wallet Service
 * Business logic for wallet operations
 */
export class WalletService {

  /**
   * Create a new wallet for user
   */
  async createWallet(userId: string, currency: string, type: 'fiat' | 'crypto' = 'fiat') {
    // Check if wallet already exists
    const existing = await prisma.wallet.findUnique({
      where: {
        userId_currency: {
          userId,
          currency,
        },
      },
    });
    if (existing) {
      throw new Error(`Wallet for ${currency} already exists`);
    }

    // Create wallet
    const wallet = await prisma.wallet.create({
      data: {
        userId,
        currency,
        type,
      },
    });

    return {
      id: wallet.id,
      userId: wallet.userId,
      currency: wallet.currency,
      type: wallet.type,
      balance: wallet.balance.toString(),
      lockedBalance: wallet.lockedBalance.toString(),
      isActive: wallet.isActive,
      createdAt: wallet.createdAt,
    };
  }

  /**
   * Get user wallets
   */
  async getUserWallets(userId: string) {
    const wallets = await prisma.wallet.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return wallets.map((wallet) => ({
      id: wallet.id,
      currency: wallet.currency,
      type: wallet.type,
      balance: wallet.balance.toString(),
      lockedBalance: wallet.lockedBalance.toString(),
      isActive: wallet.isActive,
      createdAt: wallet.createdAt,
    }));
  }

  /**
   * Get wallet by currency
   */
  async getWalletByCurrency(userId: string, currency: string) {
    const wallet = await prisma.wallet.findUnique({
      where: {
        userId_currency: {
          userId,
          currency,
        },
      },
    });
    if (!wallet) {
      throw new Error(`Wallet for ${currency} not found`);
    }

    return {
      id: wallet.id,
      currency: wallet.currency,
      type: wallet.type,
      balance: wallet.balance.toString(),
      lockedBalance: wallet.lockedBalance.toString(),
      isActive: wallet.isActive,
      createdAt: wallet.createdAt,
    };
  }

  /**
   * Get wallet balance
   */
  async getBalance(walletId: string, userId: string) {
    const wallet = await prisma.wallet.findUnique({
      where: { id: walletId },
    });
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    if (wallet.userId !== userId) {
      throw new Error('Unauthorized access to wallet');
    }

    return {
      id: wallet.id,
      currency: wallet.currency,
      balance: wallet.balance.toString(),
      lockedBalance: wallet.lockedBalance.toString(),
      availableBalance: (Number(wallet.balance) - Number(wallet.lockedBalance)).toString(),
    };
  }

  /**
   * Get wallet transactions
   */
  async getTransactions(walletId: string, userId: string, limit = 50, offset = 0) {
    const wallet = await prisma.wallet.findUnique({
      where: { id: walletId },
    });
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    if (wallet.userId !== userId) {
      throw new Error('Unauthorized access to wallet');
    }

    const transactions = await prisma.transaction.findMany({
      where: { walletId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    return transactions.map((tx) => ({
      id: tx.id,
      type: tx.type,
      status: tx.status,
      amount: tx.amount.toString(),
      currency: tx.currency,
      fee: tx.fee.toString(),
      reference: tx.reference,
      description: tx.description,
      createdAt: tx.createdAt,
    }));
  }
}

