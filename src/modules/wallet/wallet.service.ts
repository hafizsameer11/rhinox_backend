import { Decimal } from 'decimal.js';
import prisma from '../../core/config/database.js';

/**
 * Wallet Service
 * Business logic for wallet operations
 */
export class WalletService {

  /**
   * Create a new wallet for user
   */
  async createWallet(userId: string | number, currency: string, type: 'fiat' | 'crypto' = 'fiat') {
    // Parse userId to integer for Prisma queries
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }

    // Check if wallet already exists
    const existing = await prisma.wallet.findUnique({
      where: {
        userId_currency: {
          userId: userIdNum,
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
        userId: userIdNum,
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
  async getUserWallets(userId: string | number) {
    // Parse userId to integer for Prisma queries
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }

    const wallets = await prisma.wallet.findMany({
      where: { userId: userIdNum },
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
  async getWalletByCurrency(userId: string | number, currency: string) {
    // Parse userId to integer for Prisma queries
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }

    const wallet = await prisma.wallet.findUnique({
      where: {
        userId_currency: {
          userId: userIdNum,
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
  async getBalance(walletId: string | number, userId: string | number) {
    // Parse IDs to integers for Prisma queries
    const walletIdNum = typeof walletId === 'string' ? parseInt(walletId, 10) : walletId;
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    
    if (isNaN(walletIdNum) || walletIdNum <= 0) {
      throw new Error(`Invalid walletId: ${walletId}`);
    }
    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }

    const wallet = await prisma.wallet.findUnique({
      where: { id: walletIdNum },
    });
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    if (wallet.userId !== userIdNum) {
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
  async getTransactions(walletId: string | number, userId: string | number, limit = 50, offset = 0) {
    // Parse IDs to integers for Prisma queries
    const walletIdNum = typeof walletId === 'string' ? parseInt(walletId, 10) : walletId;
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    
    if (isNaN(walletIdNum) || walletIdNum <= 0) {
      throw new Error(`Invalid walletId: ${walletId}`);
    }
    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }

    const wallet = await prisma.wallet.findUnique({
      where: { id: walletIdNum },
    });
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    if (wallet.userId !== userIdNum) {
      throw new Error('Unauthorized access to wallet');
    }

    const transactions = await prisma.transaction.findMany({
      where: { walletId: walletIdNum },
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

  /**
   * Get all balances (fiat + crypto) with USDT conversion
   */
  async getAllBalances(userId: string | number) {
    // Parse userId to integer for Prisma queries
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }

    // Get all fiat wallets
    const fiatWallets = await prisma.wallet.findMany({
      where: {
        userId: userIdNum,
        isActive: true,
        type: 'fiat',
      },
      include: {
        currencyRef: {
          include: {
            country: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get all crypto virtual accounts
    const virtualAccounts = await prisma.virtualAccount.findMany({
      where: {
        userId: userIdNum,
        active: true,
      },
      include: {
        walletCurrency: {
          select: {
            id: true,
            blockchain: true,
            currency: true,
            symbol: true,
            name: true,
            price: true, // Price in USDT
            icon: true,
            isToken: true,
          },
        },
      },
      orderBy: [
        { blockchain: 'asc' },
        { currency: 'asc' },
      ],
    });

    // Get USDT to NGN exchange rate
    const usdtToNgnRate = await prisma.exchangeRate.findUnique({
      where: {
        fromCurrency_toCurrency: {
          fromCurrency: 'USDT',
          toCurrency: 'NGN',
        },
      },
    });

    // Format fiat wallets
    const fiatBalances = fiatWallets.map((wallet) => ({
      id: wallet.id,
      type: 'fiat' as const,
      currency: wallet.currency,
      currencyName: wallet.currencyName || wallet.currencyRef?.name,
      symbol: wallet.currencyRef?.symbol,
      balance: wallet.balance.toString(),
      lockedBalance: wallet.lockedBalance.toString(),
      availableBalance: (Number(wallet.balance) - Number(wallet.lockedBalance)).toString(),
      flag: wallet.currencyRef?.flag || wallet.currencyRef?.country?.flag,
      isActive: wallet.isActive,
    }));

    // Format crypto balances and convert to USDT
    let totalCryptoInUSDT = new Decimal(0);
    const cryptoBalances = virtualAccounts.map((va) => {
      const balance = new Decimal(va.accountBalance || '0');
      const availableBalance = new Decimal(va.availableBalance || '0');
      const lockedBalance = balance.minus(availableBalance);

      // Get price in USDT from walletCurrency
      const priceInUSDT = va.walletCurrency?.price 
        ? new Decimal(va.walletCurrency.price.toString())
        : new Decimal(0);

      // Convert balance to USDT
      const balanceInUSDT = balance.times(priceInUSDT);

      // Add to total
      totalCryptoInUSDT = totalCryptoInUSDT.plus(balanceInUSDT);

      return {
        id: va.id,
        type: 'crypto' as const,
        currency: va.currency,
        blockchain: va.blockchain,
        currencyName: va.walletCurrency?.name || va.currency,
        symbol: va.walletCurrency?.symbol || va.currency,
        balance: balance.toString(),
        lockedBalance: lockedBalance.toString(),
        availableBalance: availableBalance.toString(),
        balanceInUSDT: balanceInUSDT.toString(),
        priceInUSDT: priceInUSDT.toString(),
        icon: va.walletCurrency?.icon,
        isToken: va.walletCurrency?.isToken || false,
        active: va.active,
        frozen: va.frozen,
      };
    });

    // Convert total crypto to NGN if rate exists
    const totalCryptoInNGN = usdtToNgnRate
      ? totalCryptoInUSDT.times(new Decimal(usdtToNgnRate.rate.toString()))
      : null;

    return {
      fiat: fiatBalances,
      crypto: cryptoBalances,
      totals: {
        cryptoInUSDT: totalCryptoInUSDT.toString(),
        cryptoInNGN: totalCryptoInNGN?.toString() || null,
        usdtToNgnRate: usdtToNgnRate?.rate.toString() || null,
      },
    };
  }
}

