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
}

