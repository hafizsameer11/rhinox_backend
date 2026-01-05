import Decimal from 'decimal.js';
import prisma from '../../core/config/database.js';

/**
 * Home Service
 * Business logic for user home/dashboard
 */
export class HomeService {
  /**
   * Get user home data (wallets, balances, etc.)
   */
  async getUserHome(userId: string | number) {
    // Parse userId to integer for Prisma queries
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }
    // Get user with country
    const user = await prisma.user.findUnique({
      where: { id: userIdNum },
      include: {
        country: true,
        kyc: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Get all active fiat wallets with currency info
    const wallets = await prisma.wallet.findMany({
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

    // Calculate total balance across all wallets
    let totalBalance = 0;
    const walletList = wallets.map((wallet) => {
      const balance = Number(wallet.balance);
      totalBalance += balance;

      return {
        id: wallet.id,
        currency: wallet.currency,
        currencyName: wallet.currencyName || wallet.currencyRef?.name,
        symbol: wallet.currencyRef?.symbol,
        type: wallet.type,
        balance: wallet.balance.toString(),
        lockedBalance: wallet.lockedBalance.toString(),
        availableBalance: (Number(wallet.balance) - Number(wallet.lockedBalance)).toString(),
        flag: wallet.currencyRef?.flag || wallet.currencyRef?.country?.flag,
        isActive: wallet.isActive,
        createdAt: wallet.createdAt,
      };
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

    // Format crypto balances and convert to USDT
    let totalCryptoInUSDT = new Decimal(0);
    const cryptoWallets = virtualAccounts.map((va) => {
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
        currency: va.currency,
        blockchain: va.blockchain,
        currencyName: va.walletCurrency?.name || va.currency,
        symbol: va.walletCurrency?.symbol || va.currency,
        type: 'crypto' as const,
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

    // Get recent transactions count
    const recentTransactionsCount = await prisma.transaction.count({
      where: {
        wallet: {
          userId: userIdNum,
        },
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        },
      },
    });

    return {
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        country: user.country
          ? {
              id: user.country.id,
              name: user.country.name,
              code: user.country.code,
              flag: user.country.flag ? `/uploads/flags/${user.country.flag}` : null,
            }
          : null,
        kycStatus: user.kyc
          ? {
              tier: user.kyc.tier,
              status: user.kyc.status,
              faceVerificationSuccessful: user.kyc.faceVerificationSuccessful,
            }
          : null,
      },
      wallets: walletList,
      cryptoWallets: cryptoWallets,
      totalBalance: totalBalance.toString(),
      totalCryptoInUSDT: totalCryptoInUSDT.toString(),
      totalCryptoInNGN: totalCryptoInNGN?.toString() || null,
      usdtToNgnRate: usdtToNgnRate?.rate.toString() || null,
      activeWalletsCount: wallets.length,
      activeCryptoWalletsCount: cryptoWallets.length,
      recentTransactionsCount,
    };
  }

  /**
   * Get wallet balances summary
   */
  async getWalletBalances(userId: string) {
    const wallets = await prisma.wallet.findMany({
      where: {
        userId,
        isActive: true,
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

    return wallets.map((wallet) => ({
      id: wallet.id,
      currency: wallet.currency,
      currencyName: wallet.currencyName || wallet.currencyRef?.name,
      symbol: wallet.currencyRef?.symbol,
      type: wallet.type,
      balance: wallet.balance.toString(),
      lockedBalance: wallet.lockedBalance.toString(),
      availableBalance: (Number(wallet.balance) - Number(wallet.lockedBalance)).toString(),
      flag: wallet.currencyRef?.flag 
        ? `/uploads/flags/${wallet.currencyRef.flag}` 
        : wallet.currencyRef?.country?.flag 
          ? `/uploads/flags/${wallet.currencyRef.country.flag}` 
          : null,
    }));
  }

  /**
   * Get home transactions (fiat and crypto)
   * Returns total balances and recent transactions for both types
   */
  async getHomeTransactions(
    userId: string | number,
    filters?: {
      limit?: number;
      fiatLimit?: number;
      cryptoLimit?: number;
    }
  ) {
    // Parse userId to integer
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }

    const fiatLimit = filters?.fiatLimit || filters?.limit || 10;
    const cryptoLimit = filters?.cryptoLimit || filters?.limit || 10;

    // ============================================
    // FIAT SECTION
    // ============================================
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
    });

    // Calculate total fiat balance
    let totalFiatBalance = new Decimal(0);
    fiatWallets.forEach((wallet) => {
      totalFiatBalance = totalFiatBalance.plus(new Decimal(wallet.balance));
    });

    // Get recent fiat transactions
    const fiatWalletIds = fiatWallets.map(w => w.id);
    const recentFiatTransactions = await prisma.transaction.findMany({
      where: {
        walletId: { in: fiatWalletIds },
      },
      include: {
        wallet: {
          include: {
            currencyRef: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: fiatLimit,
    });

    // Format fiat transactions
    const formattedFiatTransactions = recentFiatTransactions.map((tx) => {
      const amount = new Decimal(tx.amount);
      const isPositive = tx.type === 'deposit' || tx.type === 'transfer';
      
      return {
        id: tx.id,
        type: tx.type,
        status: tx.status,
        amount: amount.toString(),
        currency: tx.currency,
        currencySymbol: tx.wallet.currencyRef?.symbol || tx.currency,
        description: tx.description || `${tx.type} ${tx.currency}`,
        reference: tx.reference,
        channel: tx.channel,
        isPositive,
        formattedAmount: `${isPositive ? '+' : ''}${tx.wallet.currencyRef?.symbol || ''}${amount.toString()}`,
        createdAt: tx.createdAt,
        completedAt: tx.completedAt,
      };
    });

    // ============================================
    // CRYPTO SECTION
    // ============================================
    // Get all crypto virtual accounts
    const cryptoVirtualAccounts = await prisma.virtualAccount.findMany({
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
          },
        },
      },
    });

    // Calculate total crypto balance in USDT
    let totalCryptoInUSDT = new Decimal(0);
    const cryptoBalances = cryptoVirtualAccounts.map((va) => {
      const balance = new Decimal(va.accountBalance || '0');
      const priceInUSDT = va.walletCurrency?.price 
        ? new Decimal(va.walletCurrency.price.toString())
        : new Decimal(0);
      const balanceInUSDT = balance.times(priceInUSDT);
      totalCryptoInUSDT = totalCryptoInUSDT.plus(balanceInUSDT);
      
      return {
        currency: va.currency,
        blockchain: va.blockchain,
        balance: balance.toString(),
        balanceInUSDT: balanceInUSDT.toString(),
        priceInUSDT: priceInUSDT.toString(),
      };
    });

    // Get recent crypto transactions
    // Crypto transactions are stored in Transaction table with wallets that have type: 'crypto'
    // Also check for crypto currencies in any wallet
    const cryptoWalletIds = await prisma.wallet.findMany({
      where: {
        userId: userIdNum,
        type: 'crypto',
      },
      select: { id: true },
    });

    const cryptoCurrencyList = cryptoVirtualAccounts.map(va => va.currency);

    const recentCryptoTransactions = await prisma.transaction.findMany({
      where: {
        OR: [
          // Transactions from crypto wallets
          { walletId: { in: cryptoWalletIds.map(w => w.id) } },
          // Transactions with crypto currencies (even if wallet type is fiat, e.g., P2P)
          { currency: { in: cryptoCurrencyList.length > 0 ? cryptoCurrencyList : ['BTC', 'ETH', 'USDT', 'BNB', 'SOL', 'XRP', 'TRX', 'DOGE', 'MATIC'] } },
          // Transactions with crypto channel
          { channel: 'crypto' },
        ],
        wallet: {
          userId: userIdNum,
        },
      },
      include: {
        wallet: {
          include: {
            currencyRef: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: cryptoLimit,
    });

    // Format crypto transactions
    const formattedCryptoTransactions = recentCryptoTransactions.map((tx) => {
      const amount = new Decimal(tx.amount);
      const isPositive = tx.type === 'deposit';
      
      // Try to get crypto price for USDT conversion
      let amountInUSDT: string | null = null;
      if (tx.currency && ['BTC', 'ETH', 'USDT', 'BNB', 'SOL', 'XRP', 'TRX', 'DOGE', 'MATIC'].includes(tx.currency)) {
        // Find wallet currency for this crypto
        const cryptoBalance = cryptoBalances.find(cb => cb.currency === tx.currency);
        if (cryptoBalance && cryptoBalance.priceInUSDT) {
          const priceInUSDT = new Decimal(cryptoBalance.priceInUSDT);
          amountInUSDT = amount.times(priceInUSDT).toString();
        }
      }
      
      return {
        id: tx.id,
        type: tx.type,
        status: tx.status,
        amount: amount.toString(),
        currency: tx.currency,
        currencySymbol: tx.wallet.currencyRef?.symbol || tx.currency,
        amountInUSDT,
        description: tx.description || `${tx.type} ${tx.currency}`,
        reference: tx.reference,
        channel: tx.channel,
        isPositive,
        formattedAmount: `${isPositive ? '+' : ''}${amount.toString()} ${tx.currency}`,
        createdAt: tx.createdAt,
        completedAt: tx.completedAt,
      };
    });

    return {
      fiat: {
        totalBalance: totalFiatBalance.toString(),
        walletsCount: fiatWallets.length,
        recentTransactions: formattedFiatTransactions,
        transactionsCount: formattedFiatTransactions.length,
      },
      crypto: {
        totalBalanceInUSDT: totalCryptoInUSDT.toString(),
        walletsCount: cryptoVirtualAccounts.length,
        recentTransactions: formattedCryptoTransactions,
        transactionsCount: formattedCryptoTransactions.length,
        balances: cryptoBalances,
      },
    };
  }
}

