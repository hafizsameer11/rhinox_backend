import { Decimal } from 'decimal.js';
import prisma from '../../core/config/database.js';
import { ensureRhinoxPayId } from '../../core/utils/rhinox-pay-id.service.js';
import { BushaAppService, isBushaEnabled } from '../../services/busha/index.js';

/**
 * Home Service
 * Business logic for user home/dashboard
 */
export class HomeService {
  private readonly bushaService = new BushaAppService();

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

    const rhinoxPayId = await ensureRhinoxPayId(userIdNum);

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
    const walletList = wallets.map((wallet: any) => {
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

    // Get USDT to NGN exchange rate
    const usdtToNgnRate = await prisma.exchangeRate.findUnique({
      where: {
        fromCurrency_toCurrency: {
          fromCurrency: 'USDT',
          toCurrency: 'NGN',
        },
      },
    });

    // Crypto balances: Busha when live (never serve legacy Tatum virtual_account ledger)
    let totalCryptoInUSDT = new Decimal(0);
    let cryptoWallets: Array<Record<string, unknown>> = [];

    if (isBushaEnabled()) {
      cryptoWallets = await this.bushaService.tryMapBalancesForWallet(userIdNum);
      for (const row of cryptoWallets) {
        totalCryptoInUSDT = totalCryptoInUSDT.plus(new Decimal(String(row.balanceInUSDT || '0')));
      }
    } else {
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
              price: true,
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

      cryptoWallets = virtualAccounts.map((va: any) => {
        const balance = new Decimal(va.accountBalance || '0');
        const availableBalance = new Decimal(va.availableBalance || '0');
        const lockedBalance = balance.minus(availableBalance);
        const priceInUSDT = va.walletCurrency?.price
          ? new Decimal(va.walletCurrency.price.toString())
          : new Decimal(0);
        const balanceInUSDT = balance.times(priceInUSDT);
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
    }

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
        rhinoxPayId,
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
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }

    const wallets = await prisma.wallet.findMany({
      where: {
        userId: parsedUserId,
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

    return wallets.map((wallet: any) => ({
      id: wallet.id,
      currency: wallet.currency,
      currencyName: wallet.currencyName || wallet.currencyRef?.name || null,
      symbol: wallet.currencyRef?.symbol || null,
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
    fiatWallets.forEach((wallet: { balance: any }) => {
      totalFiatBalance = totalFiatBalance.plus(new Decimal(wallet.balance));
    });

    // Get recent fiat transactions
    const fiatWalletIds = fiatWallets.map((w: { id: number }) => w.id);
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
        bankAccount: true,
        palmPayVirtualAccounts: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: fiatLimit,
    });

    // Format fiat transactions (exclude Busha/crypto ledger rows — they belong in crypto)
    const formattedFiatTransactions = recentFiatTransactions
      .filter((tx: any) => {
        const channel = String(tx.channel || '').toLowerCase();
        if (channel === 'busha' || channel === 'crypto') return false;
        if (['crypto_buy', 'crypto_sell', 'crypto_deposit', 'crypto_withdrawal'].includes(tx.type)) {
          return false;
        }
        return true;
      })
      .map((tx: any) => {
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
        country: tx.country,
        paymentMethod: tx.paymentMethod,
        metadata: tx.metadata,
        bankAccount: tx.bankAccount ? {
          bankName: tx.bankAccount.bankName,
          accountNumber: tx.bankAccount.accountNumber,
          accountName: tx.bankAccount.accountName,
        } : null,
        virtualAccount: tx.palmPayVirtualAccounts?.[0] ? {
          bankName: tx.palmPayVirtualAccounts[0].payerBankName,
          accountNumber: tx.palmPayVirtualAccounts[0].payerVirtualAccNo,
          accountName: tx.palmPayVirtualAccounts[0].payerAccountName,
          orderNo: tx.palmPayVirtualAccounts[0].palmpayOrderNo,
          merchantOrderId: tx.palmPayVirtualAccounts[0].merchantOrderId,
        } : null,
        isPositive,
        formattedAmount: `${isPositive ? '+' : ''}${tx.wallet.currencyRef?.symbol || ''}${amount.toString()}`,
        createdAt: tx.createdAt,
        completedAt: tx.completedAt,
        walletType: 'fiat',
      };
    });

    // ============================================
    // CRYPTO SECTION
    // ============================================
    // Busha when live — never return legacy Tatum virtual_account ledger balances
    let totalCryptoInUSDT = new Decimal(0);
    let cryptoBalances: Array<{
      currency: string;
      blockchain: string;
      balance: string;
      balanceInUSDT: string;
      priceInUSDT: string;
    }> = [];
    let cryptoCurrencyList: string[] = [];

    if (isBushaEnabled()) {
      const bushaRows = await this.bushaService.tryMapBalancesForWallet(userIdNum);
      cryptoBalances = bushaRows.map((row) => {
        const balanceInUSDT = String(row.balanceInUSDT || '0');
        totalCryptoInUSDT = totalCryptoInUSDT.plus(new Decimal(balanceInUSDT));
        return {
          currency: row.currency,
          blockchain: row.blockchain,
          balance: String(row.balance || '0'),
          balanceInUSDT,
          priceInUSDT: String(row.priceInUSDT || '0'),
        };
      });
      cryptoCurrencyList = cryptoBalances.map((cb) => cb.currency);
    } else {
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
              price: true,
              icon: true,
            },
          },
        },
      });

      cryptoBalances = cryptoVirtualAccounts.map((va: any) => {
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
      cryptoCurrencyList = cryptoVirtualAccounts.map((va: { currency: string }) => va.currency);
    }

    // Crypto ledger: crypto wallets OR Busha channel rows (buy/sell on NGN wallet)
    const cryptoWalletIds = await prisma.wallet.findMany({
      where: {
        userId: userIdNum,
        type: 'crypto',
      },
      select: { id: true },
    });

    const recentCryptoTransactions = await prisma.transaction.findMany({
      where: {
        wallet: { userId: userIdNum },
        OR: [
          { walletId: { in: cryptoWalletIds.map((w: { id: number }) => w.id) } },
          { channel: 'busha' },
          { channel: 'crypto' },
          { type: { in: ['crypto_buy', 'crypto_sell', 'crypto_deposit', 'crypto_withdrawal'] } },
          {
            currency: {
              in:
                cryptoCurrencyList.length > 0
                  ? cryptoCurrencyList
                  : ['BTC', 'ETH', 'USDT', 'BNB', 'SOL', 'XRP', 'TRX', 'DOGE', 'MATIC', 'TON', 'USDC'],
            },
          },
        ],
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

    const bushaTrades = await prisma.bushaTradeLog.findMany({
      where: {
        userId: userIdNum,
        side: { in: ['cryptoSend', 'cryptoRecv', 'buy', 'sell'] },
      },
      orderBy: { createdAt: 'desc' },
      take: cryptoLimit,
    });

    const tradeByFiatTxId = new Map(
      bushaTrades
        .filter((t) => t.fiatTransactionId != null)
        .map((t) => [t.fiatTransactionId as number, t])
    );

    // Format crypto transactions
    const formattedCryptoTransactions = recentCryptoTransactions.map((tx: any) => {
      const amount = new Decimal(tx.amount);
      const isPositive = tx.type === 'deposit' || tx.type === 'crypto_sell' || tx.type === 'crypto_recv';
      const label =
        tx.type === 'crypto_buy'
          ? 'Buy Crypto'
          : tx.type === 'crypto_sell'
            ? 'Sell Crypto'
            : tx.description || `${tx.type} ${tx.currency}`;

      let amountInUSDT: string | null = null;
      if (tx.currency && ['BTC', 'ETH', 'USDT', 'BNB', 'SOL', 'XRP', 'TRX', 'DOGE', 'MATIC', 'USDC'].includes(tx.currency)) {
        const cryptoBalance = cryptoBalances.find((cb: { currency: string }) => cb.currency === tx.currency);
        if (cryptoBalance && cryptoBalance.priceInUSDT) {
          const priceInUSDT = new Decimal(cryptoBalance.priceInUSDT);
          amountInUSDT = amount.times(priceInUSDT).toString();
        }
      }

      const linkedTrade = tradeByFiatTxId.get(tx.id);
      let status = tx.status;
      if (linkedTrade) {
        if (['completed', 'wallet_credited'].includes(linkedTrade.status)) status = 'completed';
        else if (['busha_failed', 'palmpay_failed', 'buy_reversed'].includes(linkedTrade.status)) {
          status = 'failed';
        }
      }

      return {
        id: tx.id,
        type: tx.type,
        status,
        amount: amount.toString(),
        currency: tx.currency,
        currencySymbol: tx.wallet.currencyRef?.symbol || tx.currency,
        amountInUSDT,
        description: label,
        reference: tx.reference,
        channel: tx.channel || 'busha',
        isPositive,
        formattedAmount: `${isPositive ? '+' : '-'}${amount.toString()} ${tx.currency}`,
        createdAt: tx.createdAt,
        completedAt: tx.completedAt,
        walletType: 'crypto',
        metadata: {
          ...((tx.metadata as object) || {}),
          ...(linkedTrade
            ? {
                bushaTradeId: linkedTrade.id,
                sourceAmount: linkedTrade.sourceAmount,
                targetAmount: linkedTrade.targetAmount,
                sourceCurrency: linkedTrade.sourceCurrency,
                targetCurrency: linkedTrade.targetCurrency,
                side: linkedTrade.side,
              }
            : {}),
        },
      };
    });

    const seenRefs = new Set(
      formattedCryptoTransactions.map((t) => String(t.reference || t.id)).filter(Boolean)
    );
    for (const trade of bushaTrades) {
      if (trade.fiatTransactionId && seenRefs.has(String(trade.fiatTransactionId))) continue;
      const transferRef = trade.bushaTransferId || `busha_${trade.id}`;
      if (seenRefs.has(transferRef)) continue;
      seenRefs.add(transferRef);

      const isDeposit = trade.side === 'cryptoRecv' || trade.side === 'buy';
      const isSell = trade.side === 'sell';
      const amount = String(isSell || trade.side === 'buy' ? trade.sourceAmount || trade.targetAmount : trade.sourceAmount || '0');
      const currency =
        trade.side === 'buy'
          ? trade.targetCurrency
          : trade.side === 'sell'
            ? trade.sourceCurrency
            : trade.sourceCurrency;
      const label =
        trade.side === 'buy'
          ? `Buy ${trade.targetCurrency}`
          : trade.side === 'sell'
            ? `Sell ${trade.sourceCurrency}`
            : trade.side === 'cryptoSend'
              ? `Withdraw ${trade.sourceCurrency}`
              : `Deposit ${trade.targetCurrency || trade.sourceCurrency}`;

      formattedCryptoTransactions.push({
        id: trade.fiatTransactionId || (`busha_${trade.id}` as any),
        type:
          trade.side === 'buy'
            ? 'crypto_buy'
            : trade.side === 'sell'
              ? 'crypto_sell'
              : trade.side === 'cryptoSend'
                ? 'crypto_send'
                : 'crypto_recv',
        status:
          trade.status === 'completed' || trade.status === 'wallet_credited'
            ? 'completed'
            : trade.status,
        amount,
        currency,
        currencySymbol: currency,
        amountInUSDT: null,
        description: label,
        reference: transferRef,
        channel: 'busha',
        isPositive: isDeposit,
        formattedAmount: `${isDeposit ? '+' : '-'}${amount} ${currency}`,
        createdAt: trade.createdAt,
        completedAt: trade.updatedAt,
        walletType: 'crypto',
        metadata: {
          bushaTradeId: trade.id,
          network: trade.network,
          destinationAddress: trade.destinationAddress,
        },
      });
    }

    formattedCryptoTransactions.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return {
      fiat: {
        totalBalance: totalFiatBalance.toString(),
        walletsCount: fiatWallets.length,
        recentTransactions: formattedFiatTransactions,
        transactionsCount: formattedFiatTransactions.length,
      },
      crypto: {
        totalBalanceInUSDT: totalCryptoInUSDT.toString(),
        walletsCount: cryptoBalances.length,
        recentTransactions: formattedCryptoTransactions,
        transactionsCount: formattedCryptoTransactions.length,
        balances: cryptoBalances,
      },
    };
  }
}

