import { randomBytes } from 'crypto';
import Decimal from 'decimal.js';
import bcrypt from 'bcryptjs';
import prisma from '../../core/config/database.js';
import { WalletService } from '../wallet/wallet.service.js';
import { ExchangeService } from '../exchange/exchange.service.js';
import { sendDepositSuccessEmail } from '../../core/utils/transaction-email.service.js';

/**
 * Conversion Service
 * Handles currency conversion between fiat wallets
 */
export class ConversionService {
  private walletService: WalletService;
  private exchangeService: ExchangeService;

  constructor() {
    this.walletService = new WalletService();
    this.exchangeService = new ExchangeService();
  }

  /**
   * Calculate conversion preview (amount, fee, received amount)
   */
  async calculateConversion(
    userId: string,
    fromCurrency: string,
    toCurrency: string,
    amount: string
  ) {
    // Validate currencies are different
    if (fromCurrency === toCurrency) {
      throw new Error('Cannot convert to the same currency');
    }

    // Get or create source wallet
    let fromWallet;
    try {
      fromWallet = await this.walletService.getWalletByCurrency(userId, fromCurrency);
    } catch (error) {
      throw new Error(`Source wallet for ${fromCurrency} not found. Please create it first.`);
    }

    // Check available balance
    const availableBalance = new Decimal(fromWallet.balance).minus(new Decimal(fromWallet.lockedBalance));
    const amountDecimal = new Decimal(amount);

    if (amountDecimal.greaterThan(availableBalance)) {
      throw new Error(`Insufficient balance. Available: ${availableBalance.toString()} ${fromCurrency}`);
    }

    // Get exchange rate
    const exchangeRate = await this.exchangeService.getExchangeRate(fromCurrency, toCurrency);
    const rate = new Decimal(exchangeRate.rate);

    // Calculate converted amount (before fee)
    const convertedAmount = amountDecimal.times(rate);

    // Calculate fee (in destination currency)
    const fee = this.calculateConversionFee(convertedAmount, toCurrency);

    // Calculate received amount (after fee)
    const receivedAmount = convertedAmount.minus(fee);

    // Get or check destination wallet exists
    let toWallet;
    try {
      toWallet = await this.walletService.getWalletByCurrency(userId, toCurrency);
    } catch (error) {
      // Wallet doesn't exist, but we can still calculate
      toWallet = null;
    }

    return {
      fromCurrency,
      fromAmount: amount,
      fromWalletBalance: fromWallet.balance,
      toCurrency,
      toAmount: convertedAmount.toString(),
      receivedAmount: receivedAmount.toString(),
      fee: fee.toString(),
      feeCurrency: toCurrency,
      exchangeRate: exchangeRate.rate,
      inverseRate: exchangeRate.inverseRate,
      toWalletExists: !!toWallet,
    };
  }

  /**
   * Initiate conversion (create pending transactions)
   */
  async initiateConversion(
    userId: string,
    data: {
      fromCurrency: string;
      toCurrency: string;
      amount: string;
    }
  ) {
    // Calculate conversion details
    const calculation = await this.calculateConversion(
      userId,
      data.fromCurrency,
      data.toCurrency,
      data.amount
    );

    // Get or create wallets
    let fromWallet;
    try {
      fromWallet = await this.walletService.getWalletByCurrency(userId, data.fromCurrency);
    } catch (error) {
      throw new Error(`Source wallet for ${data.fromCurrency} not found`);
    }

    let toWallet;
    try {
      toWallet = await this.walletService.getWalletByCurrency(userId, data.toCurrency);
    } catch (error) {
      // Create destination wallet if it doesn't exist
      toWallet = await this.walletService.createWallet(userId, data.toCurrency, 'fiat');
    }

    // Generate unique reference
    const reference = this.generateReference();

    // Create debit transaction (from wallet)
    const debitTransaction = await prisma.transaction.create({
      data: {
        walletId: fromWallet.id,
        type: 'withdrawal', // Debit from source
        status: 'pending',
        amount: new Decimal(data.amount).toNumber(),
        currency: data.fromCurrency,
        fee: 0, // Fee is charged in destination currency
        reference: `${reference}-DEBIT`,
        channel: 'conversion',
        description: `Convert ${data.amount} ${data.fromCurrency} to ${data.toCurrency}`,
        metadata: {
          conversionReference: reference,
          toCurrency: data.toCurrency,
          toWalletId: toWallet.id,
        },
      },
    });

    // Create credit transaction (to wallet)
    const creditTransaction = await prisma.transaction.create({
      data: {
        walletId: toWallet.id,
        type: 'deposit', // Credit to destination
        status: 'pending',
        amount: new Decimal(calculation.toAmount).toNumber(),
        currency: data.toCurrency,
        fee: new Decimal(calculation.fee).toNumber(),
        reference: `${reference}-CREDIT`,
        channel: 'conversion',
        description: `Received ${calculation.receivedAmount} ${data.toCurrency} from conversion`,
        metadata: {
          conversionReference: reference,
          fromCurrency: data.fromCurrency,
          fromWalletId: fromWallet.id,
          debitTransactionId: debitTransaction.id,
          exchangeRate: calculation.exchangeRate,
        },
      },
    });

    // Update debit transaction with credit transaction ID
    await prisma.transaction.update({
      where: { id: debitTransaction.id },
      data: {
        metadata: {
          ...(debitTransaction.metadata as any),
          creditTransactionId: creditTransaction.id,
        },
      },
    });

    return {
      conversionReference: reference,
      debitTransaction: {
        id: debitTransaction.id,
        reference: debitTransaction.reference,
        amount: debitTransaction.amount.toString(),
        currency: debitTransaction.currency,
        status: debitTransaction.status,
      },
      creditTransaction: {
        id: creditTransaction.id,
        reference: creditTransaction.reference,
        amount: creditTransaction.amount.toString(),
        currency: creditTransaction.currency,
        fee: creditTransaction.fee.toString(),
        receivedAmount: calculation.receivedAmount,
        status: creditTransaction.status,
      },
      exchangeRate: calculation.exchangeRate,
      fee: calculation.fee,
      feeCurrency: calculation.feeCurrency,
    };
  }

  /**
   * Confirm conversion with PIN verification
   */
  async confirmConversion(
    userId: string,
    conversionReference: string,
    pin: string
  ) {
    // Find both transactions by conversion reference
    const transactions = await prisma.transaction.findMany({
      where: {
        metadata: {
          path: ['conversionReference'],
          equals: conversionReference,
        },
      },
      include: {
        wallet: {
          include: {
            user: true,
          },
        },
      },
    });

    if (transactions.length !== 2) {
      throw new Error('Conversion transactions not found or incomplete');
    }

    // Identify debit and credit transactions
    const debitTx = transactions.find(tx => tx.type === 'withdrawal');
    const creditTx = transactions.find(tx => tx.type === 'deposit');

    if (!debitTx || !creditTx) {
      throw new Error('Invalid conversion transaction structure');
    }

    // Verify user owns both wallets
    if (debitTx.wallet.userId !== userId || creditTx.wallet.userId !== userId) {
      throw new Error('Unauthorized access to conversion');
    }

    // Verify both transactions are pending
    if (debitTx.status !== 'pending' || creditTx.status !== 'pending') {
      throw new Error(`Conversion is already ${debitTx.status}`);
    }

    // Verify PIN
    if (!debitTx.wallet.user.pinHash) {
      throw new Error('PIN not set. Please setup your PIN first.');
    }

    const isValidPin = await bcrypt.compare(pin, debitTx.wallet.user.pinHash);
    if (!isValidPin) {
      throw new Error('Invalid PIN');
    }

    // Check source wallet balance
    const fromBalance = new Decimal(debitTx.wallet.balance);
    const fromLocked = new Decimal(debitTx.wallet.lockedBalance);
    const fromAmount = new Decimal(debitTx.amount);
    const availableBalance = fromBalance.minus(fromLocked);

    if (fromAmount.greaterThan(availableBalance)) {
      throw new Error('Insufficient balance for conversion');
    }

    // Update both transactions to completed
    const now = new Date();
    
    const updatedDebitTx = await prisma.transaction.update({
      where: { id: debitTx.id },
      data: {
        status: 'completed',
        completedAt: now,
      },
      include: {
        wallet: {
          include: {
            user: true,
          },
        },
      },
    });

    const updatedCreditTx = await prisma.transaction.update({
      where: { id: creditTx.id },
      data: {
        status: 'completed',
        completedAt: now,
      },
      include: {
        wallet: {
          include: {
            user: true,
          },
        },
      },
    });

    // Update source wallet (debit)
    const newFromBalance = fromBalance.minus(fromAmount);
    await prisma.wallet.update({
      where: { id: debitTx.walletId },
      data: {
        balance: newFromBalance.toNumber(),
      },
    });

    // Update destination wallet (credit)
    const toBalance = new Decimal(creditTx.wallet.balance);
    const toFee = new Decimal(creditTx.fee);
    const toAmount = new Decimal(creditTx.amount);
    const creditedAmount = toAmount.minus(toFee);
    const newToBalance = toBalance.plus(creditedAmount);

    await prisma.wallet.update({
      where: { id: creditTx.walletId },
      data: {
        balance: newToBalance.toNumber(),
      },
    });

    // Send success email
    if (updatedCreditTx.wallet.user.email) {
      await sendDepositSuccessEmail(updatedCreditTx.wallet.user.email, {
        amount: updatedCreditTx.amount.toString(),
        currency: updatedCreditTx.currency,
        creditedAmount: creditedAmount.toString(),
        fee: updatedCreditTx.fee.toString(),
        reference: updatedCreditTx.reference,
        transactionId: updatedCreditTx.id,
        country: debitTx.country || 'N/A',
        channel: 'conversion',
        paymentMethod: 'Currency Conversion',
        provider: null,
        date: now.toLocaleString(),
      });
    }

    return {
      conversionReference,
      fromTransaction: {
        id: updatedDebitTx.id,
        reference: updatedDebitTx.reference,
        amount: updatedDebitTx.amount.toString(),
        currency: updatedDebitTx.currency,
        status: updatedDebitTx.status,
      },
      toTransaction: {
        id: updatedCreditTx.id,
        reference: updatedCreditTx.reference,
        amount: updatedCreditTx.amount.toString(),
        currency: updatedCreditTx.currency,
        fee: updatedCreditTx.fee.toString(),
        receivedAmount: creditedAmount.toString(),
        status: updatedCreditTx.status,
      },
      exchangeRate: (updatedCreditTx.metadata as any)?.exchangeRate || null,
      date: now,
    };
  }

  /**
   * Get conversion receipt
   */
  async getConversionReceipt(userId: string, conversionReference: string) {
    const transactions = await prisma.transaction.findMany({
      where: {
        metadata: {
          path: ['conversionReference'],
          equals: conversionReference,
        },
      },
      include: {
        wallet: {
          include: {
            user: true,
            currencyRef: true,
          },
        },
      },
    });

    if (transactions.length !== 2) {
      throw new Error('Conversion transactions not found');
    }

    const debitTx = transactions.find(tx => tx.type === 'withdrawal');
    const creditTx = transactions.find(tx => tx.type === 'deposit');

    if (!debitTx || !creditTx) {
      throw new Error('Invalid conversion transaction structure');
    }

    // Verify user owns both wallets
    if (debitTx.wallet.userId !== userId || creditTx.wallet.userId !== userId) {
      throw new Error('Unauthorized access to conversion');
    }

    const fee = Number(creditTx.fee);
    const receivedAmount = Number(creditTx.amount) - fee;

    // Get exchange rate from metadata or calculate
    let exchangeRate = null;
    if (creditTx.metadata && typeof creditTx.metadata === 'object') {
      exchangeRate = (creditTx.metadata as any).exchangeRate;
    }

    return {
      conversionReference,
      fromTransaction: {
        id: debitTx.id,
        reference: debitTx.reference,
        amount: debitTx.amount.toString(),
        currency: debitTx.currency,
        status: debitTx.status,
        date: debitTx.completedAt || debitTx.createdAt,
      },
      toTransaction: {
        id: creditTx.id,
        reference: creditTx.reference,
        amount: creditTx.amount.toString(),
        currency: creditTx.currency,
        fee: creditTx.fee.toString(),
        receivedAmount: receivedAmount.toString(),
        status: creditTx.status,
        date: creditTx.completedAt || creditTx.createdAt,
      },
      exchangeRate,
      channel: 'conversion',
      paymentMethod: 'Currency Conversion',
      date: creditTx.completedAt || creditTx.createdAt,
    };
  }

  /**
   * Calculate conversion fee
   */
  private calculateConversionFee(amount: Decimal, currency: string): Decimal {
    // Fee calculation: 0.25% or minimum fee based on currency
    const feePercent = 0.0025; // 0.25%
    const calculatedFee = amount.times(feePercent);
    
    // Minimum fees by currency
    const minFees: { [key: string]: number } = {
      NGN: 500,
      KES: 50,
      GHS: 5,
      ZAR: 20,
      TZS: 500,
      UGX: 2000,
      USD: 1,
      EUR: 1,
      GBP: 1,
    };

    const minFee = new Decimal(minFees[currency] || 1);
    return Decimal.max(calculatedFee, minFee);
  }

  /**
   * Generate unique reference number
   */
  private generateReference(): string {
    const timestamp = Date.now().toString(36);
    const random = randomBytes(4).toString('hex');
    return `CONV${timestamp}${random}`.toUpperCase();
  }
}

