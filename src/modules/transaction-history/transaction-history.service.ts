import { Decimal, type Decimal as DecimalType } from 'decimal.js';
import prisma from '../../core/config/database.js';
import { getBaseSymbol } from '../../services/crypto/unified-stablecoin.service.js';
import { ensureRhinoxPayId } from '../../core/utils/rhinox-pay-id.service.js';

const BUSHA_CRYPTO_TX_TYPES = new Set([
  'crypto_buy',
  'crypto_sell',
  'crypto_deposit',
  'crypto_withdrawal',
  'crypto_send',
  'crypto_recv',
]);

/**
 * Transaction History Service
 * Business logic for transaction history with chart data and filtering
 */
export class TransactionHistoryService {
  /** Busha buy/sell post to NGN fiat wallet but must show under crypto history */
  private isCryptoHistoryTx(tx: {
    type?: string | null;
    channel?: string | null;
    currency?: string | null;
    wallet?: { type?: string | null } | null;
  }): boolean {
    if (tx.wallet?.type === 'crypto') return true;
    const channel = String(tx.channel || '').toLowerCase();
    if (channel === 'busha' || channel === 'crypto') return true;
    if (BUSHA_CRYPTO_TX_TYPES.has(String(tx.type || ''))) return true;
    return false;
  }

  private resolveP2PRoles(orderType: string, vendorId: string | number, userId: string | number) {
    if (orderType === 'buy') {
      return { buyerId: String(vendorId), sellerId: String(userId) };
    }
    return { buyerId: String(userId), sellerId: String(vendorId) };
  }

  private formatUserName(user?: any) {
    if (!user) return null;
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return name || user.name || user.email || null;
  }

  private async resolveSenderInfo(metadata: any) {
    if (!metadata) return null;

    const embedded = metadata.senderInfo;
    if (embedded?.name) {
      return {
        userId: embedded.userId || metadata.senderUserId || null,
        name: embedded.name,
        email: embedded.email || null,
        phone: embedded.phone || null,
        rhinoxPayId: embedded.rhinoxPayId || metadata.senderRhinoxPayId || null,
      };
    }

    const senderUserId = metadata.senderUserId;
    if (!senderUserId) return null;

    const parsedSenderId =
      typeof senderUserId === 'string' ? parseInt(senderUserId, 10) : senderUserId;
    if (isNaN(parsedSenderId) || parsedSenderId <= 0) return null;

    const user = await prisma.user.findUnique({
      where: { id: parsedSenderId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        rhinoxPayId: true,
      },
    });
    if (!user) return null;

    const rhinoxPayId = user.rhinoxPayId || (await ensureRhinoxPayId(user.id));
    return {
      userId: user.id,
      name: this.formatUserName(user) || user.email || 'RhionX User',
      email: user.email,
      phone: user.phone,
      rhinoxPayId,
    };
  }

  private summarizeP2POrder(order: any, currentUserId: number) {
    if (!order) return null;

    const metadata = order.metadata as any;
    const roleIds = metadata?.buyerId && metadata?.sellerId
      ? { buyerId: String(metadata.buyerId), sellerId: String(metadata.sellerId) }
      : this.resolveP2PRoles(order.type, order.vendorId, order.userId);

    const buyer = String(order.vendorId) === roleIds.buyerId ? order.vendor : order.user;
    const seller = String(order.vendorId) === roleIds.sellerId ? order.vendor : order.user;
    const peer = Number(order.vendorId) === currentUserId ? order.user : order.vendor;
    const isUserBuyer = Number(roleIds.buyerId) === currentUserId;

    return {
      id: order.id,
      chatId: order.id,
      type: order.type,
      status: order.status,
      userAction: isUserBuyer ? 'buy' : 'sell',
      p2pType: isUserBuyer ? 'Crypto Buy' : 'Crypto Sell',
      cryptoCurrency: order.cryptoCurrency,
      fiatCurrency: order.fiatCurrency,
      cryptoAmount: order.cryptoAmount?.toString(),
      fiatAmount: order.fiatAmount?.toString(),
      price: order.price?.toString(),
      createdAt: order.createdAt,
      buyer: {
        id: buyer?.id,
        name: this.formatUserName(buyer),
        email: buyer?.email,
        phone: buyer?.phone,
      },
      seller: {
        id: seller?.id,
        name: this.formatUserName(seller),
        email: seller?.email,
        phone: seller?.phone,
      },
      peer: {
        id: peer?.id,
        name: this.formatUserName(peer),
        email: peer?.email,
        phone: peer?.phone,
      },
      paymentMethod: order.paymentMethod ? {
        id: order.paymentMethod.id,
        type: order.paymentMethod.type,
        bankName: order.paymentMethod.bankName,
        accountName: order.paymentMethod.accountName,
        provider: order.paymentMethod.provider ? {
          id: order.paymentMethod.provider.id,
          name: order.paymentMethod.provider.name,
          code: order.paymentMethod.provider.code,
        } : null,
      } : null,
    };
  }

  /**
   * Classify P2P ledger row direction for the viewing user.
   */
  private resolveP2PDirection(
    p2pStep: string | undefined,
    userId: number,
    order: any | null,
    walletType: string
  ): 'incoming' | 'outgoing' | 'neutral' {
    const step = (p2pStep || 'unknown').toLowerCase();

    const neutralSteps = new Set([
      'order_created',
      'order_accepted',
      'payment_confirmed',
      'unknown',
    ]);
    if (neutralSteps.has(step)) {
      return 'neutral';
    }

    let buyerId: string | null = null;
    let sellerId: string | null = null;
    if (order) {
      const roles = this.resolveP2PRoles(order.type, order.vendorId, order.userId);
      buyerId = roles.buyerId;
      sellerId = roles.sellerId;
    }

    const isBuyer = buyerId !== null && Number(buyerId) === userId;
    const isSeller = sellerId !== null && Number(sellerId) === userId;

    if (step === 'payment_completed_rhinoxpay') {
      return isBuyer ? 'outgoing' : isSeller ? 'incoming' : 'outgoing';
    }
    if (step === 'payment_received_rhinoxpay' || step === 'payment_received') {
      return isSeller ? 'incoming' : isBuyer ? 'outgoing' : 'incoming';
    }
    if (step === 'fiat_received' || step === 'fiat_credited') {
      return 'incoming';
    }
    if (step === 'fiat_sent' || step === 'fiat_debited') {
      return 'outgoing';
    }
    if (step === 'crypto_credited') {
      return walletType === 'crypto' ? 'incoming' : isBuyer ? 'incoming' : 'neutral';
    }
    if (step === 'crypto_debited' || step === 'crypto_frozen') {
      return walletType === 'crypto' ? 'outgoing' : isSeller ? 'outgoing' : 'neutral';
    }

    return 'neutral';
  }

  private formatCurrencySymbol(currency: string): string {
    const upper = (currency || '').toUpperCase();
    if (upper === 'NGN') return '₦';
    if (upper === 'USD' || upper.startsWith('USDT') || upper.startsWith('USDC')) return '$';
    return upper;
  }

  /**
   * Normalize transaction type to UI-friendly label
   */
  private normalizeTransactionType(type: string, walletType: string, channel?: string | null): string {
    if (type === 'crypto_buy') return 'Buy Crypto';
    if (type === 'crypto_sell') return 'Sell Crypto';
    if (type === 'crypto_deposit') return 'Crypto Deposit';
    if (type === 'crypto_withdrawal' || type === 'crypto_send') return 'Crypto Withdrawal';
    if (type === 'crypto_recv') return 'Crypto Deposit';

    const isCrypto =
      walletType === 'crypto' ||
      channel === 'busha' ||
      channel === 'crypto' ||
      BUSHA_CRYPTO_TX_TYPES.has(type);

    if (isCrypto) {
      if (type === 'deposit') return 'Crypto Deposit';
      if (type === 'withdrawal' || type === 'transfer') return 'Crypto Withdrawal';
      if (type === 'p2p') return 'P2P Transactions';
      return 'Crypto Transaction';
    }

    if (type === 'transfer') return 'Send Transactions';
    if (type === 'deposit') return 'Fund Transaction';
    if (type === 'withdrawal') return 'Withdrawals';
    if (type === 'bill_payment') return 'Bill Payments';
    if (type === 'p2p') return 'P2P Transactions';
    return 'Transaction';
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
    
    // Log date range for debugging
    console.log(`[TransactionHistoryService] Date range: ${start.toISOString()} to ${end.toISOString()}`);

    // Get all user wallets
    const wallets = await prisma.wallet.findMany({
      where: {
        userId: userIdNum,
        isActive: true,
      },
    });
    
    console.log(`[TransactionHistoryService] Found ${wallets.length} active wallets for user ${userIdNum}`);

    if (wallets.length === 0) {
      return {
        summary: {
          total: '0',
          incoming: '0',
          outgoing: '0',
        },
        typeSummary: [],
        chartData: [],
        fiat: [],
        crypto: [],
      };
    }
    
    // Debug: Check total transactions for user (regardless of date)
    const totalTxCount = await prisma.transaction.count({
      where: {
        walletId: { in: wallets.map((w: { id: number }) => w.id) },
      },
    });
    console.log(`[TransactionHistoryService] Total transactions for user (all time): ${totalTxCount}`);

    let walletIds = wallets.map((w: { id: number }) => w.id);

    // Optional currency filter - filter wallets first if currency specified
    if (filters.currency) {
      const filteredWallets = wallets.filter((w: { currency: string }) => w.currency === filters.currency);
      walletIds = filteredWallets.map((w: { id: number }) => w.id);
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
    console.log(`[TransactionHistoryService] Querying transactions with walletIds: [${walletIds.join(', ')}]`);
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
    
    console.log(`[TransactionHistoryService] Found ${transactions.length} transactions in date range`);

    // Separate fiat and crypto (Busha buy/sell live on NGN wallet but belong in crypto)
    const fiatTransactions = transactions.filter((tx: any) => !this.isCryptoHistoryTx(tx));
    const cryptoFromLedger = transactions.filter((tx: any) => this.isCryptoHistoryTx(tx));

    // Resolve buy/sell status from Busha trade log (ledger often stays pending until settle)
    const cryptoLedgerIds = cryptoFromLedger
      .filter((tx: any) => tx.type === 'crypto_buy' || tx.type === 'crypto_sell' || tx.channel === 'busha')
      .map((tx: any) => tx.id);
    const buySellTrades =
      cryptoLedgerIds.length > 0
        ? await prisma.bushaTradeLog.findMany({
            where: {
              userId: userIdNum,
              fiatTransactionId: { in: cryptoLedgerIds },
            },
          })
        : [];
    const tradeStatusByFiatTxId = new Map<number, string>();
    for (const trade of buySellTrades) {
      if (!trade.fiatTransactionId) continue;
      if (['completed', 'wallet_credited'].includes(trade.status)) {
        tradeStatusByFiatTxId.set(trade.fiatTransactionId, 'completed');
      } else if (['busha_failed', 'palmpay_failed', 'buy_reversed'].includes(trade.status)) {
        tradeStatusByFiatTxId.set(trade.fiatTransactionId, 'failed');
      } else if (trade.status && !tradeStatusByFiatTxId.has(trade.fiatTransactionId)) {
        tradeStatusByFiatTxId.set(trade.fiatTransactionId, trade.status);
      }
    }

    // Persist obvious mismatches so list + wallet stay consistent
    for (const [fiatTxId, status] of tradeStatusByFiatTxId) {
      const tx = cryptoFromLedger.find((t: any) => t.id === fiatTxId);
      if (!tx) continue;
      if (status === 'completed' && tx.status === 'pending') {
        try {
          await prisma.transaction.update({
            where: { id: fiatTxId },
            data: { status: 'completed', completedAt: tx.completedAt || new Date() },
          });
          tx.status = 'completed';
        } catch {
          tx.status = 'completed';
        }
      } else if (status === 'failed' && tx.status === 'pending') {
        try {
          await prisma.transaction.update({
            where: { id: fiatTxId },
            data: { status: 'failed' },
          });
          tx.status = 'failed';
        } catch {
          tx.status = 'failed';
        }
      } else if (status && tx.status === 'pending' && status !== 'pending') {
        // Surface trade status on the list item even if we don't rewrite DB
        tx.status = ['awaiting_busha', 'awaiting_palmpay', 'awaiting_crypto_deposit', 'settling', 'quoted'].includes(
          status
        )
          ? 'pending'
          : status;
      }
    }

    // Busha crypto send/recv often have no Transaction row — include trade log
    const bushaTrades = await prisma.bushaTradeLog.findMany({
      where: {
        userId: userIdNum,
        createdAt: { gte: start, lte: end },
        side: { in: ['cryptoSend', 'cryptoRecv'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const bushaAsCrypto = bushaTrades.map((trade) => {
      const isDeposit = trade.side === 'cryptoRecv';
      const amount = new Decimal(trade.sourceAmount || trade.targetAmount || '0').abs();
      const type = isDeposit ? 'crypto_recv' : 'crypto_send';
      const normalizedType = this.normalizeTransactionType(type, 'crypto', 'busha');
      return {
        id: trade.fiatTransactionId || `busha_${trade.id}`,
        type,
        normalizedType,
        status: trade.status === 'completed' || trade.status === 'wallet_credited' ? 'completed' : trade.status,
        amount: amount.toString(),
        currency: isDeposit ? trade.targetCurrency : trade.sourceCurrency,
        fee: '0',
        reference: trade.bushaTransferId || `busha_${trade.id}`,
        description: trade.destinationAddress
          ? `${normalizedType} · ${trade.destinationAddress.slice(0, 10)}…`
          : normalizedType,
        channel: 'busha',
        paymentMethod: trade.network || null,
        metadata: {
          provider: 'busha',
          bushaTradeId: trade.id,
          side: trade.side,
          network: trade.network,
          destinationAddress: trade.destinationAddress,
          sourceAmount: trade.sourceAmount,
          targetAmount: trade.targetAmount,
        },
        completedAt: trade.updatedAt,
        createdAt: trade.createdAt,
        walletType: 'crypto' as const,
      };
    });

    // Calculate summary (total, incoming, outgoing)
    let totalIncoming = new Decimal(0);
    let totalOutgoing = new Decimal(0);

    transactions.forEach((tx: any) => {
      const amount = new Decimal(tx.amount);
      const absAmount = amount.abs();
      
      // Categorize transactions as incoming or outgoing
      if (tx.type === 'deposit' || tx.type === 'crypto_sell' || tx.type === 'crypto_recv') {
        totalIncoming = totalIncoming.plus(absAmount);
      } else if (
        tx.type === 'withdrawal' ||
        tx.type === 'transfer' ||
        tx.type === 'bill_payment' ||
        tx.type === 'crypto_buy' ||
        tx.type === 'crypto_send' ||
        tx.type === 'crypto_withdrawal'
      ) {
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
      transactions.map((tx: any) => ({
        createdAt: tx.createdAt,
        amount: new Decimal(tx.amount),
      })),
      start,
      end
    );

    // Normalize and format transactions
    const normalizeTransaction = (tx: any) => {
      const normalizedType = this.normalizeTransactionType(tx.type, tx.wallet.type, tx.channel);
      const amount = new Decimal(tx.amount);
      
      return {
        id: tx.id,
        type: tx.type,
        normalizedType,
        status: tx.status,
        amount: amount.abs().toString(),
        currency: tx.currency,
        fee: new Decimal(tx.fee || 0).toString(),
        reference: tx.reference,
        description: tx.description || normalizedType,
        channel: tx.channel,
        paymentMethod: tx.paymentMethod,
        metadata: tx.metadata,
        completedAt: tx.completedAt,
        createdAt: tx.createdAt,
        walletType: this.isCryptoHistoryTx(tx) ? 'crypto' : tx.wallet.type,
      };
    };

    // Generate summary grouped by transaction type
    const typeSummary = await this.generateTypeSummary(transactions);

    const cryptoNormalized = [
      ...cryptoFromLedger.map((tx: any) => normalizeTransaction(tx)),
      ...bushaAsCrypto,
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      summary: {
        total: total.toString(),
        incoming: totalIncoming.toString(),
        outgoing: totalOutgoing.toString(),
      },
      typeSummary,
      chartData,
      fiat: fiatTransactions.map((tx: any) => normalizeTransaction(tx)),
      crypto: cryptoNormalized,
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
      const normalizedType = this.normalizeTransactionType(tx.type, tx.wallet.type, tx.channel);
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

    let walletIds = wallets.map((w: { id: number }) => w.id);

    // Filter by currency if provided
    if (filters.currency) {
      const filteredWallets = wallets.filter((w: { currency: string }) => w.currency === filters.currency);
      walletIds = filteredWallets.map((w: { id: number }) => w.id);
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
        palmPayVirtualAccounts: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: filters.limit || 50,
      skip: filters.offset || 0,
    });

    // Calculate summary
    let totalIncoming = new Decimal(0);
    transactions.forEach((tx: any) => {
      totalIncoming = totalIncoming.plus(new Decimal(tx.amount).abs());
    });

    const rhinoxDeposits = transactions.filter(
      (tx: any) =>
        tx.channel === 'rhionx_user' || (tx.metadata as any)?.senderUserId || (tx.metadata as any)?.senderInfo
    );
    const senderIds = [
      ...new Set(
        rhinoxDeposits
          .map((tx: any) => {
            const metadata = (tx.metadata as any) || {};
            return metadata.senderInfo?.userId || metadata.senderUserId;
          })
          .filter(Boolean)
          .map((id: string | number) => Number(id))
          .filter((id: number) => !isNaN(id) && id > 0)
      ),
    ];
    const senderUsers =
      senderIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: senderIds } },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              rhinoxPayId: true,
            },
          })
        : [];
    const senderMap = new Map(senderUsers.map((user) => [user.id, user]));

    const buildSenderInfo = (metadata: any) => {
      if (!metadata) return null;
      if (metadata.senderInfo?.name) {
        return metadata.senderInfo;
      }
      const senderUserId = metadata.senderUserId;
      if (!senderUserId) return null;
      const parsedSenderId = Number(senderUserId);
      if (isNaN(parsedSenderId) || parsedSenderId <= 0) return null;
      const user = senderMap.get(parsedSenderId);
      if (!user) return null;
      return {
        userId: user.id,
        name: this.formatUserName(user) || user.email || 'RhionX User',
        email: user.email,
        phone: user.phone,
        rhinoxPayId: user.rhinoxPayId,
      };
    };

    // Normalize transactions
    const normalizedTransactions = transactions.map((tx: any) => {
      const normalizedType = this.getDepositTypeLabel(tx.channel || '');
      const amount = new Decimal(tx.amount);
      const fee = new Decimal(tx.fee);
      const creditedAmount = amount.minus(fee);
      const metadata = (tx.metadata as any) || {};
      const senderInfo =
        tx.channel === 'rhionx_user' || metadata.senderUserId || metadata.senderInfo
          ? buildSenderInfo(metadata)
          : null;

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
        paymentMethod:
          tx.paymentMethod ||
          (tx.channel === 'rhionx_user' ? 'RhionX User Transfer' : undefined),
        country: tx.country,
        senderInfo,
        provider: tx.provider ? {
          name: tx.provider.name,
          code: tx.provider.code,
        } : null,
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
      rhionx_user: 'RhinoxPay Transfer Received',
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

    let walletIds = wallets.map((w: { id: number }) => w.id);

    // Filter by currency if provided
    if (filters.currency) {
      const filteredWallets = wallets.filter((w: { currency: string }) => w.currency === filters.currency);
      walletIds = filteredWallets.map((w: { id: number }) => w.id);
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
    transactions.forEach((tx: any) => {
      totalOutgoing = totalOutgoing.plus(new Decimal(tx.amount).abs());
    });

    // Normalize transactions
    const normalizedTransactions = transactions.map((tx: any) => {
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

    // Fiat + crypto wallets (P2P fiat legs and crypto release legs)
    const wallets = await prisma.wallet.findMany({
      where: {
        userId: userIdNum,
        isActive: true,
        type: { in: ['fiat', 'crypto'] },
      },
    });

    if (wallets.length === 0) {
      return {
        summary: { total: '0', count: 0, incoming: '0', outgoing: '0' },
        transactions: [],
      };
    }

    const walletTypeById = new Map(wallets.map((w) => [w.id, w.type]));
    let walletIds = wallets.map((w: { id: number }) => w.id);

    if (filters.currency) {
      const filterUpper = filters.currency.toUpperCase();
      const filteredWallets = wallets.filter((w: { currency: string }) => {
        const c = w.currency.toUpperCase();
        return c === filterUpper || getBaseSymbol(c) === filterUpper;
      });
      walletIds = filteredWallets.map((w: { id: number }) => w.id);
      if (walletIds.length === 0) {
        return {
          summary: { total: '0', count: 0, incoming: '0', outgoing: '0' },
          transactions: [],
        };
      }
    }

    // Build where clause - P2P transactions on fiat and crypto wallets
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

    const orderIds = Array.from(new Set(
      transactions
        .map((tx: any) => {
          const metadata = tx.metadata as any;
          const orderId = metadata?.orderId;
          return orderId ? Number(orderId) : null;
        })
        .filter((orderId: number | null) => orderId && !isNaN(orderId))
    )) as number[];

    const p2pOrders = orderIds.length > 0
      ? await prisma.p2POrder.findMany({
          where: { id: { in: orderIds } },
          include: {
            vendor: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
            paymentMethod: {
              include: {
                provider: true,
              },
            },
          },
        })
      : [];
    const p2pOrderMap = new Map(p2pOrders.map((order: any) => [order.id, order]));

    let totalAmount = new Decimal(0);
    let incomingTotal = new Decimal(0);
    let outgoingTotal = new Decimal(0);

    const normalizedTransactions = transactions.map((tx: any) => {
      const metadata = tx.metadata as any;
      const amount = new Decimal(tx.amount);
      const order = metadata?.orderId ? p2pOrderMap.get(Number(metadata.orderId)) : null;
      const p2pOrder = this.summarizeP2POrder(order, userIdNum);
      const walletType = walletTypeById.get(tx.walletId) || 'fiat';
      const direction = this.resolveP2PDirection(
        metadata?.p2pStep,
        userIdNum,
        order,
        walletType
      );
      const absAmount = amount.abs();

      totalAmount = totalAmount.plus(absAmount);
      if (direction === 'incoming') {
        incomingTotal = incomingTotal.plus(absAmount);
      } else if (direction === 'outgoing') {
        outgoingTotal = outgoingTotal.plus(absAmount);
      }

      const baseCrypto = p2pOrder?.cryptoCurrency
        ? getBaseSymbol(p2pOrder.cryptoCurrency)
        : getBaseSymbol(tx.currency);

      return {
        id: tx.id,
        type: tx.type,
        normalizedType: 'P2P Transactions',
        status: tx.status,
        amount: absAmount.toString(),
        currency: tx.currency,
        currencySymbol: this.formatCurrencySymbol(tx.currency),
        baseSymbol: getBaseSymbol(tx.currency),
        fee: new Decimal(tx.fee).toString(),
        reference: tx.reference,
        description: tx.description || 'P2P Transaction',
        direction,
        walletType,
        metadata: tx.metadata,
        orderId: metadata?.orderId || null,
        adId: metadata?.adId || null,
        p2pOrder,
        p2pType: p2pOrder?.p2pType,
        merchantName: p2pOrder?.peer?.name,
        merchantContact: p2pOrder?.peer?.email || p2pOrder?.peer?.phone,
        chatName: p2pOrder?.peer?.name,
        chatEmail: p2pOrder?.peer?.email,
        price: p2pOrder?.price,
        totalQty: p2pOrder?.cryptoAmount && p2pOrder?.cryptoCurrency
          ? `${p2pOrder.cryptoAmount} ${baseCrypto}`
          : undefined,
        transferAmount: p2pOrder?.fiatAmount && p2pOrder?.fiatCurrency
          ? `${p2pOrder.fiatCurrency}${p2pOrder.fiatAmount}`
          : amount.abs().toString(),
        paymentMethod: p2pOrder?.paymentMethod?.bankName ||
          p2pOrder?.paymentMethod?.provider?.name ||
          p2pOrder?.paymentMethod?.type,
        completedAt: tx.completedAt,
        createdAt: tx.createdAt,
      };
    });

    return {
      summary: {
        total: totalAmount.toString(),
        count: transactions.length,
        incoming: incomingTotal.toString(),
        outgoing: outgoingTotal.toString(),
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
        palmPayVirtualAccounts: true,
      },
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    // Verify user owns the wallet
    if (transaction.wallet.userId !== userIdNum) {
      throw new Error('Unauthorized access to transaction');
    }

    // Refresh in-flight bill payments from Flutterwave when details are viewed
    if (
      transaction.type === 'bill_payment' &&
      ['pending', 'processing'].includes(transaction.status)
    ) {
      const meta = (transaction.metadata as any) || {};
      if (meta.provider === 'flutterwave' || String(meta.flwReference || '').startsWith('flw_bill_')) {
        try {
          const { FlutterwaveWebhookService } = await import(
            '../../services/flutterwave/flutterwave.webhook.service.js'
          );
          await new FlutterwaveWebhookService().syncBillPaymentStatus(txIdNum);
          const refreshed = await prisma.transaction.findUnique({
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
              palmPayVirtualAccounts: true,
            },
          });
          if (refreshed) {
            Object.assign(transaction, refreshed);
          }
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          console.error('[TransactionHistory] Failed to sync Flutterwave bill status:', message);
        }
      }
    }

    const amount = new Decimal(transaction.amount);
    const fee = new Decimal(transaction.fee);
    const metadata = transaction.metadata as any;
    const normalizedType = this.normalizeTransactionType(
      transaction.type,
      transaction.wallet.type,
      transaction.channel
    );

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
      walletType: this.isCryptoHistoryTx(transaction) ? 'crypto' : transaction.wallet.type,
      wallet: {
        id: transaction.wallet.id,
        currency: transaction.wallet.currency,
        currencyName: transaction.wallet.currencyRef?.name,
        symbol: transaction.wallet.currencyRef?.symbol,
        type: this.isCryptoHistoryTx(transaction) ? 'crypto' : transaction.wallet.type,
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
      details.virtualAccount = transaction.palmPayVirtualAccounts?.[0] ? {
        bankName: transaction.palmPayVirtualAccounts[0].payerBankName,
        accountNumber: transaction.palmPayVirtualAccounts[0].payerVirtualAccNo,
        accountName: transaction.palmPayVirtualAccounts[0].payerAccountName,
        orderNo: transaction.palmPayVirtualAccounts[0].palmpayOrderNo,
        merchantOrderId: transaction.palmPayVirtualAccounts[0].merchantOrderId,
      } : null;

      if (
        transaction.channel === 'rhionx_user' ||
        metadata?.senderUserId ||
        metadata?.senderInfo
      ) {
        details.senderInfo = await this.resolveSenderInfo(metadata);
        details.paymentMethod = details.paymentMethod || 'RhionX User Transfer';
      }
    } else if (transaction.type === 'transfer' || transaction.type === 'withdrawal') {
      const totalAmount = amount.plus(fee);
      details.totalAmount = totalAmount.toString();
      const recipientInfo = metadata?.recipientInfo || {};
      details.recipientInfo = {
        ...recipientInfo,
        rhinoxPayId:
          recipientInfo.rhinoxPayId ||
          metadata?.recipientRhinoxPayId ||
          null,
        email: recipientInfo.email || metadata?.recipientEmail || null,
        phone: recipientInfo.phone || metadata?.phoneNumber || null,
        name: recipientInfo.name || recipientInfo.accountName || metadata?.accountName || null,
        accountName: recipientInfo.accountName || recipientInfo.name || metadata?.accountName || null,
      };
      details.accountNumber = metadata?.accountNumber || recipientInfo.accountNumber || null;
      details.accountName =
        recipientInfo.accountName ||
        recipientInfo.name ||
        metadata?.accountName ||
        null;
      details.bankName = metadata?.bankName || recipientInfo.bankName || null;
      details.phoneNumber = metadata?.phoneNumber || recipientInfo.phoneNumber || recipientInfo.phone || null;
      if (transaction.channel === 'rhionx_user') {
        details.rhinoxPayId = details.recipientInfo.rhinoxPayId;
      }
    } else if (transaction.type === 'p2p') {
      details.orderId = metadata?.orderId || null;
      details.adId = metadata?.adId || null;
      details.p2pStep = metadata?.p2pStep || null;
      let order: any = null;
      if (details.orderId) {
        order = await prisma.p2POrder.findUnique({
          where: { id: Number(details.orderId) },
          include: {
            vendor: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
            paymentMethod: {
              include: {
                provider: true,
              },
            },
          },
        });
        const p2pOrder = this.summarizeP2POrder(order, userIdNum);
        details.p2pOrder = p2pOrder;
        details.p2pType = p2pOrder?.p2pType;
        details.merchantName = p2pOrder?.peer?.name;
        details.merchantContact = p2pOrder?.peer?.email || p2pOrder?.peer?.phone;
        details.chatName = p2pOrder?.peer?.name;
        details.chatEmail = p2pOrder?.peer?.email;
        details.price = p2pOrder?.price;
        details.totalQty = p2pOrder?.cryptoAmount && p2pOrder?.cryptoCurrency
          ? `${p2pOrder.cryptoAmount} ${p2pOrder.cryptoCurrency}`
          : undefined;
        details.transferAmount = p2pOrder?.fiatAmount && p2pOrder?.fiatCurrency
          ? `${p2pOrder.fiatCurrency}${p2pOrder.fiatAmount}`
          : amount.abs().toString();
        details.paymentMethod = p2pOrder?.paymentMethod?.bankName ||
          p2pOrder?.paymentMethod?.provider?.name ||
          p2pOrder?.paymentMethod?.type ||
          details.paymentMethod;
      }
      details.direction = this.resolveP2PDirection(
        metadata?.p2pStep,
        userIdNum,
        order,
        transaction.wallet.type
      );
    } else if (transaction.type === 'bill_payment') {
      details.category = {
        code: metadata?.categoryCode || transaction.channel,
        name: metadata?.categoryName || transaction.channel,
      };
      details.provider = {
        id: metadata?.providerId,
        code: metadata?.providerCode || metadata?.billerId,
        name: metadata?.providerName,
      };
      details.plan = {
        id: metadata?.itemId,
        name: metadata?.itemName,
        amount: metadata?.itemAmount,
      };
      details.accountNumber = metadata?.accountNumber;
      details.accountName = metadata?.accountName;
      details.billerType = metadata?.providerName || metadata?.categoryName;
      details.mobileNumber = metadata?.accountNumber;
      details.rechargeToken = metadata?.rechargeToken || null;
      details.providerType = metadata?.provider || null;
    }

    // Attach Busha trade details for crypto buy/sell/send receipts
    if (
      transaction.type === 'crypto_buy' ||
      transaction.type === 'crypto_sell' ||
      transaction.channel === 'busha'
    ) {
      let trade = await prisma.bushaTradeLog.findFirst({
        where: {
          userId: userIdNum,
          OR: [
            { fiatTransactionId: transaction.id },
            ...(transaction.reference
              ? [{ bushaTransferId: String(transaction.reference) }]
              : []),
          ],
        },
        orderBy: { createdAt: 'desc' },
      });

      // Refresh in-flight buy/sell from Busha when details are opened
      if (
        trade &&
        ['quoted', 'settling', 'awaiting_busha', 'awaiting_crypto_deposit', 'awaiting_palmpay'].includes(
          trade.status
        )
      ) {
        try {
          const { BushaAppService } = await import('../../services/busha/busha.app.service.js');
          await new BushaAppService().settleTrade(trade.id);
          const refreshedTrade = await prisma.bushaTradeLog.findUnique({ where: { id: trade.id } });
          if (refreshedTrade) trade = refreshedTrade;
          const refreshedTx = await prisma.transaction.findUnique({ where: { id: transaction.id } });
          if (refreshedTx) {
            Object.assign(transaction, refreshedTx);
            details.status = refreshedTx.status;
            details.completedAt = refreshedTx.completedAt;
            details.amount = new Decimal(refreshedTx.amount).abs().toString();
          }
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          console.error('[TransactionHistory] Failed to settle Busha trade:', message);
        }
      }

      // If trade already finished but fiat tx still pending, sync ledger status for display
      if (
        trade &&
        ['completed', 'wallet_credited'].includes(trade.status) &&
        transaction.status === 'pending' &&
        trade.fiatTransactionId === transaction.id
      ) {
        try {
          await prisma.transaction.update({
            where: { id: transaction.id },
            data: { status: 'completed', completedAt: transaction.completedAt || new Date() },
          });
          details.status = 'completed';
          details.completedAt = details.completedAt || new Date();
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          console.error('[TransactionHistory] Failed to sync Busha tx status:', message);
          details.status = 'completed';
        }
      }

      if (trade) {
        const providerResponse = (trade.providerResponse as any) || {};
        const quote = providerResponse.quote || {};
        const remote = providerResponse.remote || {};
        const fees = providerResponse.fees || quote.fees || metadata?.fees || [];
        const feeTotal =
          providerResponse.feeTotal ??
          metadata?.feeTotal ??
          (Array.isArray(fees)
            ? fees.reduce(
                (s: number, f: any) => s + Number(f?.amount?.amount ?? f?.amount ?? 0),
                0
              )
            : null);

        const sourceAmount =
          trade.sourceAmount ||
          remote.source_amount ||
          quote.source_amount ||
          amount.abs().toString();
        const targetAmount =
          trade.targetAmount ||
          remote.target_amount ||
          quote.target_amount ||
          metadata?.targetAmount ||
          null;

        const src = Number(sourceAmount);
        const tgt = Number(targetAmount);
        let rate: string | null = null;
        if (Number.isFinite(src) && Number.isFinite(tgt) && src > 0 && tgt > 0) {
          rate =
            trade.side === 'buy'
              ? (src / tgt).toFixed(2)
              : trade.side === 'sell'
                ? (tgt / src).toFixed(2)
                : null;
        }

        const resolvedStatus =
          ['completed', 'wallet_credited'].includes(trade.status) || details.status === 'completed'
            ? 'completed'
            : trade.status;

        details.cryptoReceipt = {
          kind:
            trade.side === 'buy'
              ? 'buy'
              : trade.side === 'sell'
                ? 'sell'
                : trade.side === 'cryptoSend'
                  ? 'withdraw'
                  : 'deposit',
          provider: 'Busha',
          sourceCurrency: trade.sourceCurrency,
          targetCurrency: trade.targetCurrency,
          sourceAmount: String(sourceAmount),
          targetAmount: targetAmount != null ? String(targetAmount) : null,
          network: trade.network,
          destinationAddress: trade.destinationAddress,
          bushaTradeId: trade.id,
          bushaTransferId: trade.bushaTransferId,
          bushaQuoteId: trade.bushaQuoteId,
          bushaStatus: trade.bushaStatus,
          tradeStatus: trade.status,
          status: resolvedStatus,
          fees,
          feeTotal: feeTotal != null && feeTotal !== '' ? String(feeTotal) : null,
          rate,
        };
      } else if (metadata) {
        details.cryptoReceipt = {
          kind:
            transaction.type === 'crypto_buy'
              ? 'buy'
              : transaction.type === 'crypto_sell'
                ? 'sell'
                : 'deposit',
          provider: 'Busha',
          sourceCurrency: transaction.currency,
          targetCurrency: metadata.targetCurrency || null,
          sourceAmount: amount.abs().toString(),
          targetAmount: metadata.netNgn || metadata.targetAmount || null,
          network: metadata.network || null,
          destinationAddress: metadata.destinationAddress || null,
          fees: metadata.fees || [],
          feeTotal: metadata.feeTotal != null ? String(metadata.feeTotal) : null,
          rate: null,
          status: details.status,
          bushaTransferId: transaction.reference,
        };
      }
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

    let walletIds = wallets.map((w: { id: number }) => w.id);

    // Filter by currency if provided
    if (filters.currency) {
      const filteredWallets = wallets.filter((w: { currency: string }) => w.currency === filters.currency);
      walletIds = filteredWallets.map((w: { id: number }) => w.id);
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
      transactions = transactions.filter((tx: any) => {
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
    paginatedTransactions.forEach((tx: any) => {
      totalAmount = totalAmount.plus(new Decimal(tx.amount).abs());
    });

    // Normalize transactions
    const normalizedTransactions = paginatedTransactions.map((tx: any) => {
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

