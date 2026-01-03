import prisma from '../../core/config/database.js';

/**
 * Home Service
 * Business logic for user home/dashboard
 */
export class HomeService {
  /**
   * Get user home data (wallets, balances, etc.)
   */
  async getUserHome(userId: string) {
    // Get user with country
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        country: true,
        kyc: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Get all active wallets with currency info
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

    // Get recent transactions count
    const recentTransactionsCount = await prisma.transaction.count({
      where: {
        wallet: {
          userId,
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
      totalBalance: totalBalance.toString(),
      activeWalletsCount: wallets.length,
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

