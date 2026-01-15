import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from '../../core/config/database.js';
import { WalletService } from '../wallet/wallet.service.js';
import { sendDepositInitiatedEmail, sendDepositSuccessEmail } from '../../core/utils/transaction-email.service.js';

/**
 * Deposit Service
 * Handles fiat wallet deposits via bank transfer
 */
export class DepositService {
  private walletService: WalletService;

  constructor() {
    this.walletService = new WalletService();
  }

  /**
   * Get bank account details for deposit
   * Returns the first active bank account for the given country and currency
   */
  async getBankAccountDetails(countryCode: string, currency: string) {
    const bankAccount = await prisma.bankAccount.findFirst({
      where: {
        countryCode,
        currency,
        isActive: true,
      },
      orderBy: {
        createdAt: 'asc', // Get the first created account
      },
    });

    if (!bankAccount) {
      throw new Error(`Bank account not available for ${currency} in ${countryCode}`);
    }

    return {
      bankName: bankAccount.bankName,
      accountNumber: bankAccount.accountNumber,
      accountName: bankAccount.accountName,
      currency: bankAccount.currency,
      countryCode: bankAccount.countryCode,
    };
  }

  /**
   * Get mobile money providers for a country
   */
  async getMobileMoneyProviders(countryCode: string, currency: string) {
    const providers = await prisma.mobileMoneyProvider.findMany({
      where: {
        countryCode,
        currency,
        isActive: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    return providers.map((provider: any) => ({
      id: provider.id,
      name: provider.name,
      code: provider.code,
      logoUrl: provider.logoUrl,
    }));
  }

  /**
   * Initiate deposit (create pending transaction)
   */
  async initiateDeposit(
    userId: string,
    data: {
      amount: string;
      currency: string;
      countryCode: string;
      channel: string;
      providerId?: string; // Optional for mobile money
    }
  ) {
    // Parse userId to integer
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }

    // Get or create wallet
    let wallet;
    try {
      wallet = await this.walletService.getWalletByCurrency(parsedUserId, data.currency);
    } catch (error) {
      // Create wallet if it doesn't exist
      wallet = await this.walletService.createWallet(parsedUserId, data.currency, 'fiat');
    }

    // Generate unique reference
    const reference = this.generateReference();

    // Calculate fee (you can make this configurable)
    const fee = this.calculateFee(parseFloat(data.amount), data.currency);

    // Determine payment method and get related data
    let bankAccountId: number | undefined;
    let providerId: number | undefined;
    let paymentMethod: string;
    let bankAccountData: any = null;
    let providerData: any = null;

    if (data.channel === 'mobile_money') {
      // Mobile money deposit
      if (!data.providerId) {
        throw new Error('Provider ID is required for mobile money deposits');
      }

      // Verify provider exists and is active (parse ID to integer)
      const parsedProviderId = typeof data.providerId === 'string' ? parseInt(data.providerId, 10) : data.providerId;
      if (isNaN(parsedProviderId) || parsedProviderId <= 0) {
        throw new Error('Invalid provider ID format');
      }
      const provider = await prisma.mobileMoneyProvider.findUnique({
        where: { id: parsedProviderId },
      });

      if (!provider || !provider.isActive) {
        throw new Error('Invalid or inactive mobile money provider');
      }

      if (provider.countryCode !== data.countryCode || provider.currency !== data.currency) {
        throw new Error('Provider does not support this country/currency combination');
      }

      // Store providerId as integer for database
      providerId = parsedProviderId;
      paymentMethod = 'Mobile Money';
      providerData = {
        name: provider.name,
        code: provider.code,
      };
    } else {
      // Bank transfer deposit
      const bankAccountDataResult = await this.getBankAccountDetails(data.countryCode, data.currency);
      
      // Get full bank account record for ID
      const bankAccount = await prisma.bankAccount.findFirst({
        where: {
          countryCode: data.countryCode,
          currency: data.currency,
          isActive: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      if (!bankAccount) {
        throw new Error('Bank account not found');
      }

      bankAccountId = bankAccount.id;
      paymentMethod = 'Bank Transfer';
      bankAccountData = {
        bankName: bankAccount.bankName,
        accountNumber: bankAccount.accountNumber,
        accountName: bankAccount.accountName,
      };
    }

    // Create pending transaction
    const transaction = await prisma.transaction.create({
      data: {
        walletId: wallet.id,
        type: 'deposit',
        status: 'pending',
        amount: parseFloat(data.amount),
        currency: data.currency,
        fee: fee,
        reference,
        channel: data.channel,
        country: data.countryCode,
        bankAccountId: bankAccountId ?? null,
        providerId: providerId ?? null,
        paymentMethod,
        description: `Deposit ${data.amount} ${data.currency} via ${data.channel}`,
      },
      include: {
        bankAccount: true,
        provider: true,
      },
    });

    // Get user email
    const user = await prisma.user.findUnique({
      where: { id: parsedUserId },
      select: { email: true, firstName: true },
    });

    // Send email notification
    if (user) {
      if (data.channel === 'mobile_money') {
        // Mobile money email (different template if needed)
        await sendDepositInitiatedEmail(user.email, {
          amount: data.amount,
          currency: data.currency,
          reference,
          providerName: providerData.name,
        });
      } else {
        // Bank transfer email
        await sendDepositInitiatedEmail(user.email, {
          amount: data.amount,
          currency: data.currency,
          reference,
          bankName: bankAccountData.bankName,
          accountNumber: bankAccountData.accountNumber,
          accountName: bankAccountData.accountName,
        });
      }
    }

    return {
      id: transaction.id,
      reference: transaction.reference,
      amount: transaction.amount.toString(),
      currency: transaction.currency,
      fee: transaction.fee.toString(),
      status: transaction.status,
      bankAccount: bankAccountData,
      provider: providerData,
      createdAt: transaction.createdAt,
    };
  }

  /**
   * Confirm deposit with PIN verification
   */
  async confirmDeposit(
    userId: string,
    transactionId: string,
    pin: string
  ) {
    // Parse transactionId to integer
    const parsedTransactionId = typeof transactionId === 'string' ? parseInt(transactionId, 10) : transactionId;
    if (isNaN(parsedTransactionId) || parsedTransactionId <= 0) {
      throw new Error('Invalid transaction ID format');
    }

    // Parse userId to integer
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }

    // Get transaction
    const transaction = await prisma.transaction.findUnique({
      where: { id: parsedTransactionId },
      include: {
        wallet: {
          include: {
            user: true,
          },
        },
        bankAccount: true,
      },
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    if (transaction.wallet.userId !== parsedUserId) {
      throw new Error('Unauthorized access to transaction');
    }

    if (transaction.status !== 'pending') {
      throw new Error(`Transaction is already ${transaction.status}`);
    }

    // Verify PIN
    if (!transaction.wallet.user.pinHash) {
      throw new Error('PIN not set. Please setup your PIN first.');
    }

    const isValidPin = await bcrypt.compare(pin, transaction.wallet.user.pinHash);
    if (!isValidPin) {
      throw new Error('Invalid PIN');
    }

    // Update transaction status to completed
    const updatedTransaction = await prisma.transaction.update({
      where: { id: parsedTransactionId },
      data: {
        status: 'completed',
        completedAt: new Date(),
      },
      include: {
        wallet: {
          include: {
            user: true,
          },
        },
        bankAccount: true,
        provider: true,
      },
    });

    // Update wallet balance
    const currentBalance = Number(updatedTransaction.wallet.balance);
    const depositAmount = Number(updatedTransaction.amount);
    const fee = Number(updatedTransaction.fee);
    const creditedAmount = depositAmount - fee;

    await prisma.wallet.update({
      where: { id: updatedTransaction.walletId },
      data: {
        balance: currentBalance + creditedAmount,
      },
    });

    // Send success email
    if (updatedTransaction.wallet.user.email) {
      await sendDepositSuccessEmail(updatedTransaction.wallet.user.email, {
        amount: updatedTransaction.amount.toString(),
        currency: updatedTransaction.currency,
        creditedAmount: creditedAmount.toString(),
        fee: updatedTransaction.fee.toString(),
        reference: updatedTransaction.reference,
        transactionId: updatedTransaction.id.toString(),
        country: updatedTransaction.country || 'N/A',
        channel: updatedTransaction.channel || 'N/A',
        paymentMethod: updatedTransaction.paymentMethod || 'Bank Transfer',
        provider: updatedTransaction.provider?.name || null,
        date: updatedTransaction.completedAt?.toLocaleString() || new Date().toLocaleString(),
      });
    }

    return {
      id: updatedTransaction.id,
      reference: updatedTransaction.reference,
      amount: updatedTransaction.amount.toString(),
      currency: updatedTransaction.currency,
      fee: updatedTransaction.fee.toString(),
      creditedAmount: creditedAmount.toString(),
      status: updatedTransaction.status,
      country: updatedTransaction.country,
      channel: updatedTransaction.channel,
      paymentMethod: updatedTransaction.paymentMethod,
      provider: updatedTransaction.provider ? {
        name: updatedTransaction.provider.name,
        code: updatedTransaction.provider.code,
      } : null,
      transactionId: updatedTransaction.id,
      date: updatedTransaction.completedAt,
      createdAt: updatedTransaction.createdAt,
    };
  }

  /**
   * Get transaction receipt
   */
  async getTransactionReceipt(userId: string, transactionId: string) {
    // Parse transactionId to integer
    const parsedTransactionId = typeof transactionId === 'string' ? parseInt(transactionId, 10) : transactionId;
    if (isNaN(parsedTransactionId) || parsedTransactionId <= 0) {
      throw new Error('Invalid transaction ID format');
    }

    // Parse userId to integer
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }

    const transaction = await prisma.transaction.findUnique({
      where: { id: parsedTransactionId },
      include: {
        wallet: {
          include: {
            user: true,
            currencyRef: true,
          },
        },
        bankAccount: true,
        provider: true,
      },
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    if (transaction.wallet.userId !== parsedUserId) {
      throw new Error('Unauthorized access to transaction');
    }

    const fee = Number(transaction.fee);
    const amount = Number(transaction.amount);
    const creditedAmount = amount - fee;

    return {
      id: transaction.id,
      reference: transaction.reference,
      type: transaction.type,
      status: transaction.status,
      amount: transaction.amount.toString(),
      currency: transaction.currency,
      fee: transaction.fee.toString(),
      creditedAmount: creditedAmount.toString(),
      country: transaction.country,
      channel: transaction.channel,
      paymentMethod: transaction.paymentMethod,
      provider: transaction.provider ? {
        name: transaction.provider.name,
        code: transaction.provider.code,
      } : null,
      description: transaction.description,
      transactionId: transaction.id,
      date: transaction.completedAt || transaction.createdAt,
      createdAt: transaction.createdAt,
      bankAccount: transaction.bankAccount ? {
        bankName: transaction.bankAccount.bankName,
        accountNumber: transaction.bankAccount.accountNumber,
        accountName: transaction.bankAccount.accountName,
      } : null,
    };
  }

  /**
   * Generate unique reference number
   */
  private generateReference(): string {
    const timestamp = Date.now().toString(36);
    const random = randomBytes(4).toString('hex');
    return `${timestamp}${random}`.toUpperCase();
  }

  /**
   * Calculate deposit fee
   */
  private calculateFee(amount: number, currency: string): number {
    // Simple fee calculation - you can make this more sophisticated
    // For now: 0.1% or minimum fee based on currency
    const feePercent = 0.001; // 0.1%
    const calculatedFee = amount * feePercent;
    
    // Minimum fees by currency
    const minFees: { [key: string]: number } = {
      NGN: 200,
      KES: 50,
      GHS: 5,
      ZAR: 20,
      USD: 1,
      EUR: 1,
    };

    const minFee = minFees[currency] || 1;
    return Math.max(calculatedFee, minFee);
  }
}

