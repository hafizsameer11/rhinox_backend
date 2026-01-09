import { Decimal, type Decimal as DecimalType } from 'decimal.js';
import prisma from '../../core/config/database.js';

/**
 * Transaction History Service
 * Business logic for transaction history with chart data and filtering
 */
export class TransactionHistoryService {
  /**
   * Normalize transaction type to UI-friendly label
   */
  private normalizeTransactionType(type: string, walletType: string): string {
    if (walletType === 'crypto') {
      if (type === 'deposit') return 'Crypto Deposit';
      if (type === 'withdrawal') return 'Crypto Withdrawals';
      if (type === 'p2p') return 'P2P Transactions';
      return 'Crypto Transaction';
    } else {
      if (type === 'transfer') return 'Send Transactions';
      if (type === 'deposit') return 'Fund Transaction';
      if (type === 'withdrawal') return 'Withdrawals';
      if (type === 'bill_payment') return 'Bill Payments';
      if (type === 'p2p') return 'P2P Transactions';
      return 'Transaction';
    }
  }

  /**
   * Get date range based on filter type
   */
  private getDateRange(filter: 'D' | 'W' | 'M' | 'Custom', startDate?: Date, endDate?: Date): { start: Date; end: Date } {
    const now = new Date();
    now.setHours(23, 59, 59, 999); // End of today

    let start: Date;

    switch (filter) {
      case 'D': // Daily - today
        start = new Date();
        start.setHours(0, 0, 0, 0);
        return { start, end: now };

      case 'W': // Weekly - last 7 days
        start = new Date();
        start.setDate(start.getDate() - 7);
        start.setHours(0, 0, 0, 0);
        return { start, end: now };

      case 'M': // Monthly - last 30 days
        start = new Date();
        start.setDate(start.getDate() - 30);
        start.setHours(0, 0, 0, 0);
        return { start, end: now };

      case 'Custom':
        if (!startDate || !endDate) {
          // Default to last 30 days if custom dates not provided
          start = new Date();
          start.setDate(start.getDate() - 30);
          start.setHours(0, 0, 0, 0);
          return { start, end: now };
        }
        start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        return { start, end };

      default:
        // Default to last 30 days
        start = new Date();
        start.setDate(start.getDate() - 30);
        start.setHours(0, 0, 0, 0);
        return { start, end: now };
    }
  }

  /**
   * Generate chart data (hourly breakdown)
   */
  private generateChartData(transactions: Array<{ createdAt: Date; amount: DecimalType }>, startDate: Date, endDate: Date): Array<{ hour: string; amount: string }> {
    // Initialize hourly buckets (24 hours)
    const hourlyData: Map<number, DecimalType> = new Map();
    
    // Initialize all hours to 0
    for (let i = 0; i < 24; i++) {
      hourlyData.set(i, new Decimal(0));
    }

    // Group transactions by hour
    transactions.forEach((tx) => {
      const hour = tx.createdAt.getHours();
      const currentAmount = hourlyData.get(hour) || new Decimal(0);
      hourlyData.set(hour, currentAmount.plus(Math.abs(Number(tx.amount))));
    });

    // Format hours for display (e.g., "12-1 AM", "1-2 AM", etc.)
    const formatHour = (hour: number): string => {
      const nextHour = (hour + 1) % 24;
      const formatHourNumber = (h: number): string => {
        if (h === 0) return '12 AM';
        if (h < 12) return `${h} AM`;
        if (h === 12) return '12 PM';
        return `${h - 12} PM`;
      };
      return `${formatHourNumber(hour)}-${formatHourNumber(nextHour)}`;
    };

    // Convert to array and format
    const chartData: Array<{ hour: string; amount: string }> = [];
    for (let i = 0; i < 24; i++) {
      const amount = hourlyData.get(i) || new Decimal(0);
      chartData.push({
        hour: formatHour(i),
        amount: amount.toString(),
      });
    }

    return chartData;
  }

  /**
   * Get transaction history with chart data and filters
   */
  async getTransactionHistory(
    userId: string | number,
    filters: {
      period?: 'D' | 'W' | 'M' | 'Custom';
      startDate?: Date;
      endDate?: Date;
      currency?: string; // Optional: filter by currency
    } = {}
  ) {
    // Parse userId to integer
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }

    // Get date range
    const { start, end } = this.getDateRange(filters.period || 'M', filters.startDate, filters.endDate);

    // Get all user wallets
    const wallets = await prisma.wallet.findMany({
      where: {
        userId: userIdNum,
        isActive: true,
      },
    });

    if (wallets.length === 0) {
      return {
        summary: {
          total: '0',
          incoming: '0',
          outgoing: '0',
        },
        chartData: [],
        fiat: [],
        crypto: [],
      };
    }

    let walletIds = wallets.map((w) => w.id);

    // Optional currency filter - filter wallets first if currency specified
    if (filters.currency) {
      const filteredWallets = wallets.filter((w) => w.currency === filters.currency);
      walletIds = filteredWallets.map((w) => w.id);
      if (walletIds.length === 0) {
        // No wallets for this currency, return empty result
        return {
          summary: {
            total: '0',
            incoming: '0',
            outgoing: '0',
          },
          chartData: [],
          fiat: [],
          crypto: [],
        };
      }
    }

    // Build where clause
    const where: any = {
      walletId: { in: walletIds },
      createdAt: {
        gte: start,
        lte: end,
      },
    };

    // Get all transactions in date range
    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        wallet: {
          select: {
            id: true,
            type: true,
            currency: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Separate fiat and crypto transactions
    const fiatTransactions = transactions.filter((tx) => tx.wallet.type === 'fiat');
    const cryptoTransactions = transactions.filter((tx) => tx.wallet.type === 'crypto');

    // Calculate summary (total, incoming, outgoing)
    let totalIncoming = new Decimal(0);
    let totalOutgoing = new Decimal(0);

    transactions.forEach((tx) => {
      const amount = new Decimal(tx.amount);
      const absAmount = amount.abs();
      
      // Categorize transactions as incoming or outgoing
      if (tx.type === 'deposit') {
        // Deposits are always incoming
        totalIncoming = totalIncoming.plus(absAmount);
      } else if (tx.type === 'withdrawal' || tx.type === 'transfer' || tx.type === 'bill_payment') {
        // Withdrawals, transfers, and bill payments are always outgoing
        totalOutgoing = totalOutgoing.plus(absAmount);
      } else if (tx.type === 'p2p') {
        // For P2P, check metadata to determine direction
        const metadata = tx.metadata as any;
        if (metadata?.p2pStep === 'crypto_credited') {
          // User received crypto (incoming)
          totalIncoming = totalIncoming.plus(absAmount);
        } else if (metadata?.p2pStep === 'crypto_debited' || metadata?.p2pStep === 'crypto_frozen') {
          // User sent crypto (outgoing)
          totalOutgoing = totalOutgoing.plus(absAmount);
        }
        // If p2pStep is not available, skip (shouldn't happen in practice)
      }
      // Note: Conversion transactions might create both debit and credit transactions
      // They are handled separately based on type (withdrawal for debit, deposit for credit)
    });

    const total = totalIncoming.minus(totalOutgoing);

    // Generate chart data (using all transactions)
    const chartData = this.generateChartData(
      transactions.map((tx) => ({
        createdAt: tx.createdAt,
        amount: new Decimal(tx.amount),
      })),
      start,
      end
    );

    // Normalize and format transactions
    const normalizeTransaction = (tx: any) => {
      const normalizedType = this.normalizeTransactionType(tx.type, tx.wallet.type);
      const amount = new Decimal(tx.amount);
      
      return {
        id: tx.id,
        type: tx.type,
        normalizedType,
        status: tx.status,
        amount: amount.abs().toString(),
        currency: tx.currency,
        fee: new Decimal(tx.fee).toString(),
        reference: tx.reference,
        description: tx.description || normalizedType,
        channel: tx.channel,
        paymentMethod: tx.paymentMethod,
        metadata: tx.metadata,
        completedAt: tx.completedAt,
        createdAt: tx.createdAt,
        walletType: tx.wallet.type,
      };
    };

    // Generate summary grouped by transaction type
    const typeSummary = await this.generateTypeSummary(transactions);

    return {
      summary: {
        total: total.toString(),
        incoming: totalIncoming.toString(),
        outgoing: totalOutgoing.toString(),
      },
      typeSummary,
      chartData,
      fiat: fiatTransactions.map(normalizeTransaction),
      crypto: cryptoTransactions.map(normalizeTransaction),
    };
  }

  /**
   * Generate summary grouped by transaction type with currency and USD amounts
   */
  private async generateTypeSummary(transactions: any[]): Promise<Array<{
    type: string;
    normalizedType: string;
    currency: string;
    amount: string;
    amountInUSD: string;
    count: number;
  }>> {
    // Group transactions by normalized type and currency
    const typeMap = new Map<string, {
      normalizedType: string;
      currency: string;
      totalAmount: DecimalType;
      count: number;
      walletType: string;
    }>();

    transactions.forEach((tx) => {
      const normalizedType = this.normalizeTransactionType(tx.type, tx.wallet.type);
      const key = `${normalizedType}_${tx.currency}_${tx.wallet.type}`;
      const amount = new Decimal(tx.amount).abs();

      if (typeMap.has(key)) {
        const existing = typeMap.get(key)!;
        existing.totalAmount = existing.totalAmount.plus(amount);
        existing.count += 1;
      } else {
        typeMap.set(key, {
          normalizedType,
          currency: tx.currency,
          totalAmount: amount,
          count: 1,
          walletType: tx.wallet.type,
        });
      }
    });

    // Convert to USD and format
    const typeSummary: Array<{
      type: string;
      normalizedType: string;
      currency: string;
      amount: string;
      amountInUSD: string;
      count: number;
    }> = [];

    for (const [key, data] of typeMap.entries()) {
      let amountInUSD = new Decimal(0);

      try {
        if (data.walletType === 'crypto') {
          // For crypto, get price from WalletCurrency (price is in USDT, which is ~USD)
          const walletCurrency = await prisma.walletCurrency.findFirst({
            where: {
              currency: data.currency,
            },
          });

          if (walletCurrency?.price) {
            const priceInUSDT = new Decimal(walletCurrency.price.toString());
            amountInUSD = data.totalAmount.times(priceInUSDT);
          } else {
            // Fallback: try to get exchange rate from ExchangeRate table
            const rate = await prisma.exchangeRate.findUnique({
              where: {
                fromCurrency_toCurrency: {
                  fromCurrency: data.currency.toUpperCase(),
                  toCurrency: 'USD',
                },
              },
            });

            if (rate && rate.isActive) {
              amountInUSD = data.totalAmount.times(new Decimal(rate.rate.toString()));
            }
          }
        } else {
          // For fiat, use ExchangeRate table
          if (data.currency.toUpperCase() === 'USD') {
            amountInUSD = data.totalAmount;
          } else {
            const rate = await prisma.exchangeRate.findUnique({
              where: {
                fromCurrency_toCurrency: {
                  fromCurrency: data.currency.toUpperCase(),
                  toCurrency: 'USD',
                },
              },
            });

            if (rate && rate.isActive) {
              amountInUSD = data.totalAmount.times(new Decimal(rate.rate.toString()));
            } else {
              // Try inverse rate
              const inverseRate = await prisma.exchangeRate.findUnique({
                where: {
                  fromCurrency_toCurrency: {
                    fromCurrency: 'USD',
                    toCurrency: data.currency.toUpperCase(),
                  },
                },
              });

              if (inverseRate && inverseRate.isActive && inverseRate.inverseRate) {
                amountInUSD = data.totalAmount.div(new Decimal(inverseRate.rate.toString()));
              }
            }
          }
        }
      } catch (error) {
        // If conversion fails, set to 0
        console.error(`Failed to convert ${data.currency} to USD for type ${data.normalizedType}:`, error);
        amountInUSD = new Decimal(0);
      }

      typeSummary.push({
        type: key.split('_')[0] || key, // Original transaction type
        normalizedType: data.normalizedType,
        currency: data.currency,
        amount: data.totalAmount.toString(),
        amountInUSD: amountInUSD.toString(),
        count: data.count,
      });
    }

    // Sort by normalized type
    typeSummary.sort((a, b) => a.normalizedType.localeCompare(b.normalizedType));

    return typeSummary;
  }

  /**
   * Get fiat deposit/fund transactions with filters
   */
  async getFiatDeposits(
    userId: string | number,
    filters: {
      currency?: string;
      status?: string;
      type?: string; // bank_transfer, mobile_money, conversion, p2p
      period?: 'D' | 'W' | 'M' | 'Custom';
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    } = {}
  ) {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }

    // Get date range
    const { start, end } = this.getDateRange(filters.period || 'M', filters.startDate, filters.endDate);

    // Get user fiat wallets
    const wallets = await prisma.wallet.findMany({
      where: {
        userId: userIdNum,
        isActive: true,
        type: 'fiat',
      },
    });

    if (wallets.length === 0) {
      return {
        summary: { incoming: '0', count: 0 },
        transactions: [],
      };
    }

    let walletIds = wallets.map((w) => w.id);

    // Filter by currency if provided
    if (filters.currency) {
      const filteredWallets = wallets.filter((w) => w.currency === filters.currency);
      walletIds = filteredWallets.map((w) => w.id);
      if (walletIds.length === 0) {
        return {
          summary: { incoming: '0', count: 0 },
          transactions: [],
        };
      }
    }

    // Build where clause
    const where: any = {
      walletId: { in: walletIds },
      type: 'deposit',
      createdAt: {
        gte: start,
        lte: end,
      },
    };

    // Filter by status
    if (filters.status && filters.status !== 'All') {
      where.status = filters.status.toLowerCase();
    }

    // Filter by type (channel)
    if (filters.type && filters.type !== 'All') {
      const typeMap: { [key: string]: string } = {
        'Bank Transfer': 'bank_transfer',
        'Mobile Money': 'mobile_money',
        'Conversion': 'conversion',
        'P2P Transaction': 'p2p',
      };
      const channel = typeMap[filters.type] || filters.type.toLowerCase();
      where.channel = channel;
    }

    // Get transactions
    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        wallet: {
          select: {
            id: true,
            currency: true,
            type: true,
          },
        },
        bankAccount: true,
        provider: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: filters.limit || 50,
      skip: filters.offset || 0,
    });

    // Calculate summary
    let totalIncoming = new Decimal(0);
    transactions.forEach((tx) => {
      totalIncoming = totalIncoming.plus(new Decimal(tx.amount).abs());
    });

    // Normalize transactions
    const normalizedTransactions = transactions.map((tx) => {
      const normalizedType = this.getDepositTypeLabel(tx.channel || '');
      const amount = new Decimal(tx.amount);
      const fee = new Decimal(tx.fee);
      const creditedAmount = amount.minus(fee);

      return {
        id: tx.id,
        type: tx.type,
        normalizedType,
        status: tx.status,
        amount: amount.toString(),
        currency: tx.currency,
        fee: fee.toString(),
        creditedAmount: creditedAmount.toString(),
        reference: tx.reference,
        description: tx.description || normalizedType,
        channel: tx.channel,
        paymentMethod: tx.paymentMethod,
        country: tx.country,
        provider: tx.provider ? {
          name: tx.provider.name,
          code: tx.provider.code,
        } : null,
        bankAccount: tx.bankAccount ? {
          bankName: tx.bankAccount.bankName,
          accountNumber: tx.bankAccount.accountNumber,
          accountName: tx.bankAccount.accountName,
        } : null,
        metadata: tx.metadata,
        completedAt: tx.completedAt,
        createdAt: tx.createdAt,
      };
    });

    return {
      summary: {
        incoming: totalIncoming.toString(),
        count: transactions.length,
      },
      transactions: normalizedTransactions,
    };
  }

  /**
   * Get deposit type label
   */
  private getDepositTypeLabel(channel: string | null): string {
    if (!channel) return 'Fund Transaction';
    const labelMap: { [key: string]: string } = {
      bank_transfer: 'Fund Wallet - Transfer',
      mobile_money: 'Fund Wallet - Mobile Money',
      conversion: 'Fund Wallet - Conversion',
      p2p: 'Fund Wallet - P2P',
    };
    return labelMap[channel] || 'Fund Transaction';
  }

  /**
   * Get fiat withdrawal/send transactions with filters
   */
  async getFiatWithdrawals(
    userId: string | number,
    filters: {
      currency?: string;
      status?: string;
      type?: string; // transfer, withdrawal
      period?: 'D' | 'W' | 'M' | 'Custom';
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    } = {}
  ) {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }

    // Get date range
    const { start, end } = this.getDateRange(filters.period || 'M', filters.startDate, filters.endDate);

    // Get user fiat wallets
    const wallets = await prisma.wallet.findMany({
      where: {
        userId: userIdNum,
        isActive: true,
        type: 'fiat',
      },
    });

    if (wallets.length === 0) {
      return {
        summary: { outgoing: '0', count: 0 },
        transactions: [],
      };
    }

    let walletIds = wallets.map((w) => w.id);

    // Filter by currency if provided
    if (filters.currency) {
      const filteredWallets = wallets.filter((w) => w.currency === filters.currency);
      walletIds = filteredWallets.map((w) => w.id);
      if (walletIds.length === 0) {
        return {
          summary: { outgoing: '0', count: 0 },
          transactions: [],
        };
      }
    }

    // Build where clause
    const where: any = {
      walletId: { in: walletIds },
      type: { in: ['transfer', 'withdrawal'] },
      createdAt: {
        gte: start,
        lte: end,
      },
    };

    // Filter by status
    if (filters.status && filters.status !== 'All') {
      where.status = filters.status.toLowerCase();
    }

    // Filter by type
    if (filters.type && filters.type !== 'All') {
      const typeMap: { [key: string]: string } = {
        'Send': 'transfer',
        'Withdraw': 'withdrawal',
      };
      const txType = typeMap[filters.type] || filters.type.toLowerCase();
      where.type = txType;
    }

    // Get transactions
    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        wallet: {
          select: {
            id: true,
            currency: true,
            type: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: filters.limit || 50,
      skip: filters.offset || 0,
    });

    // Calculate summary
    let totalOutgoing = new Decimal(0);
    transactions.forEach((tx) => {
      totalOutgoing = totalOutgoing.plus(new Decimal(tx.amount).abs());
    });

    // Normalize transactions
    const normalizedTransactions = transactions.map((tx) => {
      const normalizedType = tx.type === 'transfer' ? 'Send Transactions' : 'Withdrawals';
      const amount = new Decimal(tx.amount);
      const fee = new Decimal(tx.fee);
      const totalAmount = amount.plus(fee);
      const metadata = tx.metadata as any;

      return {
        id: tx.id,
        type: tx.type,
        normalizedType,
        status: tx.status,
        amount: amount.toString(),
        currency: tx.currency,
        fee: fee.toString(),
        totalAmount: totalAmount.toString(),
        reference: tx.reference,
        description: tx.description || normalizedType,
        channel: tx.channel,
        paymentMethod: tx.paymentMethod,
        country: tx.country,
        recipientInfo: metadata?.recipientInfo || null,
        metadata: tx.metadata,
        completedAt: tx.completedAt,
        createdAt: tx.createdAt,
      };
    });

    return {
      summary: {
        outgoing: totalOutgoing.toString(),
        count: transactions.length,
      },
      transactions: normalizedTransactions,
    };
  }

  /**
   * Get fiat P2P transactions with filters
   */
  async getFiatP2PTransactions(
    userId: string | number,
    filters: {
      currency?: string;
      status?: string;
      period?: 'D' | 'W' | 'M' | 'Custom';
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    } = {}
  ) {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }

    // Get date range
    const { start, end } = this.getDateRange(filters.period || 'M', filters.startDate, filters.endDate);

    // Get user fiat wallets
    const wallets = await prisma.wallet.findMany({
      where: {
        userId: userIdNum,
        isActive: true,
        type: 'fiat',
      },
    });

    if (wallets.length === 0) {
      return {
        summary: { total: '0', count: 0 },
        transactions: [],
      };
    }

    let walletIds = wallets.map((w) => w.id);

    // Filter by currency if provided
    if (filters.currency) {
      const filteredWallets = wallets.filter((w) => w.currency === filters.currency);
      walletIds = filteredWallets.map((w) => w.id);
      if (walletIds.length === 0) {
        return {
          summary: { total: '0', count: 0 },
          transactions: [],
        };
      }
    }

    // Build where clause - P2P transactions on fiat wallets
    const where: any = {
      walletId: { in: walletIds },
      type: 'p2p',
      channel: 'p2p',
      createdAt: {
        gte: start,
        lte: end,
      },
    };

    // Filter by status
    if (filters.status && filters.status !== 'All') {
      where.status = filters.status.toLowerCase();
    }

    // Get transactions
    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        wallet: {
          select: {
            id: true,
            currency: true,
            type: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: filters.limit || 50,
      skip: filters.offset || 0,
    });

    // Calculate summary
    let totalAmount = new Decimal(0);
    transactions.forEach((tx) => {
      totalAmount = totalAmount.plus(new Decimal(tx.amount).abs());
    });

    // Normalize transactions
    const normalizedTransactions = transactions.map((tx) => {
      const metadata = tx.metadata as any;
      const amount = new Decimal(tx.amount);
      const isIncoming = metadata?.p2pStep === 'fiat_received' || metadata?.p2pStep === 'fiat_credited';
      const isOutgoing = metadata?.p2pStep === 'fiat_sent' || metadata?.p2pStep === 'fiat_debited';

      return {
        id: tx.id,
        type: tx.type,
        normalizedType: 'P2P Transactions',
        status: tx.status,
        amount: amount.abs().toString(),
        currency: tx.currency,
        fee: new Decimal(tx.fee).toString(),
        reference: tx.reference,
        description: tx.description || 'P2P Transaction',
        direction: isIncoming ? 'incoming' : isOutgoing ? 'outgoing' : 'unknown',
        metadata: tx.metadata,
        orderId: metadata?.orderId || null,
        adId: metadata?.adId || null,
        completedAt: tx.completedAt,
        createdAt: tx.createdAt,
      };
    });

    return {
      summary: {
        total: totalAmount.toString(),
        count: transactions.length,
      },
      transactions: normalizedTransactions,
    };
  }

  /**
   * Get transaction details by ID
   */
  async getTransactionDetails(userId: string | number, transactionId: string | number) {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    const txIdNum = typeof transactionId === 'string' ? parseInt(transactionId, 10) : transactionId;

    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }
    if (isNaN(txIdNum) || txIdNum <= 0) {
      throw new Error(`Invalid transactionId: ${transactionId}`);
    }

    // Get transaction with all related data
    const transaction = await prisma.transaction.findUnique({
      where: { id: txIdNum },
      include: {
        wallet: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
            currencyRef: {
              include: {
                country: true,
              },
            },
          },
        },
        bankAccount: true,
        provider: true,
      },
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    // Verify user owns the wallet
    if (transaction.wallet.userId !== userIdNum) {
      throw new Error('Unauthorized access to transaction');
    }

    const amount = new Decimal(transaction.amount);
    const fee = new Decimal(transaction.fee);
    const metadata = transaction.metadata as any;
    const normalizedType = this.normalizeTransactionType(transaction.type, transaction.wallet.type);

    // Build transaction details based on type
    const details: any = {
      id: transaction.id,
      reference: transaction.reference,
      type: transaction.type,
      normalizedType,
      status: transaction.status,
      amount: amount.abs().toString(),
      currency: transaction.currency,
      fee: fee.toString(),
      description: transaction.description || normalizedType,
      channel: transaction.channel,
      paymentMethod: transaction.paymentMethod,
      country: transaction.country,
      metadata: transaction.metadata,
      completedAt: transaction.completedAt,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
      wallet: {
        id: transaction.wallet.id,
        currency: transaction.wallet.currency,
        currencyName: transaction.wallet.currencyRef?.name,
        symbol: transaction.wallet.currencyRef?.symbol,
        type: transaction.wallet.type,
      },
    };

    // Add type-specific details
    if (transaction.type === 'deposit') {
      const creditedAmount = amount.minus(fee);
      details.creditedAmount = creditedAmount.toString();
      details.provider = transaction.provider ? {
        name: transaction.provider.name,
        code: transaction.provider.code,
      } : null;
      details.bankAccount = transaction.bankAccount ? {
        bankName: transaction.bankAccount.bankName,
        accountNumber: transaction.bankAccount.accountNumber,
        accountName: transaction.bankAccount.accountName,
      } : null;
    } else if (transaction.type === 'transfer' || transaction.type === 'withdrawal') {
      const totalAmount = amount.plus(fee);
      details.totalAmount = totalAmount.toString();
      details.recipientInfo = metadata?.recipientInfo || null;
    } else if (transaction.type === 'p2p') {
      details.orderId = metadata?.orderId || null;
      details.adId = metadata?.adId || null;
      details.p2pStep = metadata?.p2pStep || null;
      details.direction = metadata?.p2pStep === 'fiat_received' || metadata?.p2pStep === 'crypto_credited' 
        ? 'incoming' 
        : 'outgoing';
    }

    return details;
  }

  /**
   * Get bill payment transactions with filters
   */
  async getBillPaymentTransactions(
    userId: string | number,
    filters: {
      currency?: string;
      status?: string;
      categoryCode?: string; // Filter by bill payment category
      period?: 'D' | 'W' | 'M' | 'Custom';
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    } = {}
  ) {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }

    // Get date range
    const { start, end } = this.getDateRange(filters.period || 'M', filters.startDate, filters.endDate);

    // Get user fiat wallets
    const wallets = await prisma.wallet.findMany({
      where: {
        userId: userIdNum,
        isActive: true,
        type: 'fiat',
      },
    });

    if (wallets.length === 0) {
      return {
        summary: { total: '0', count: 0 },
        transactions: [],
      };
    }

    let walletIds = wallets.map((w) => w.id);

    // Filter by currency if provided
    if (filters.currency) {
      const filteredWallets = wallets.filter((w) => w.currency === filters.currency);
      walletIds = filteredWallets.map((w) => w.id);
      if (walletIds.length === 0) {
        return {
          summary: { total: '0', count: 0 },
          transactions: [],
        };
      }
    }

    // Build where clause - Bill payment transactions
    const where: any = {
      walletId: { in: walletIds },
      type: 'bill_payment',
      createdAt: {
        gte: start,
        lte: end,
      },
    };

    // Filter by status
    if (filters.status && filters.status !== 'All') {
      where.status = filters.status.toLowerCase();
    }

    // Get transactions (fetch all first, then filter by category if needed)
    // Note: Category filtering done after fetch since Prisma doesn't support JSON path queries in MySQL
    let transactions = await prisma.transaction.findMany({
      where,
      include: {
        wallet: {
          select: {
            id: true,
            currency: true,
            type: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Filter by category if provided (after fetching, since Prisma doesn't support JSON path queries in MySQL)
    if (filters.categoryCode) {
      transactions = transactions.filter((tx) => {
        const metadata = tx.metadata as any;
        return metadata?.categoryCode === filters.categoryCode;
      });
    }

    // Apply pagination after filtering
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    const paginatedTransactions = transactions.slice(offset, offset + limit);

    // Calculate summary
    let totalAmount = new Decimal(0);
    paginatedTransactions.forEach((tx) => {
      totalAmount = totalAmount.plus(new Decimal(tx.amount).abs());
    });

    // Normalize transactions
    const normalizedTransactions = paginatedTransactions.map((tx) => {
      const metadata = tx.metadata as any;
      const amount = new Decimal(tx.amount);
      const fee = new Decimal(tx.fee);
      const totalAmount = amount.plus(fee);

      // Get category name from metadata
      const categoryName = metadata?.categoryName || 'Bill Payment';
      const providerName = metadata?.providerName || '';
      const normalizedType = `${categoryName}${providerName ? ` - ${providerName}` : ''}`;

      return {
        id: tx.id,
        type: tx.type,
        normalizedType,
        status: tx.status,
        amount: amount.toString(),
        currency: tx.currency,
        fee: fee.toString(),
        totalAmount: totalAmount.toString(),
        reference: tx.reference,
        description: tx.description || normalizedType,
        channel: tx.channel,
        paymentMethod: tx.paymentMethod,
        country: tx.country,
        category: {
          code: metadata?.categoryCode || null,
          name: metadata?.categoryName || null,
        },
        provider: {
          id: metadata?.providerId || null,
          code: metadata?.providerCode || null,
          name: metadata?.providerName || null,
        },
        accountNumber: metadata?.accountNumber || null,
        accountName: metadata?.accountName || null,
        accountType: metadata?.accountType || null,
        plan: metadata?.planId ? {
          id: metadata.planId,
          code: metadata.planCode,
          name: metadata.planName,
        } : null,
        rechargeToken: metadata?.rechargeToken || null,
        metadata: tx.metadata,
        completedAt: tx.completedAt,
        createdAt: tx.createdAt,
      };
    });

    return {
      summary: {
        total: totalAmount.toString(),
        count: paginatedTransactions.length,
        totalCount: transactions.length, // Total count before pagination
      },
      transactions: normalizedTransactions,
    };
  }
}

