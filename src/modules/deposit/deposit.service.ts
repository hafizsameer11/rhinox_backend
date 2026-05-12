import { randomBytes } from 'crypto';
import prisma from '../../core/config/database.js';
import { WalletService } from '../wallet/wallet.service.js';
import { sendDepositInitiatedEmail } from '../../core/utils/transaction-email.service.js';
import { PalmPayDepositService } from '../../services/palmpay/palmpay.deposit.service.js';
import { createProviderUnavailableError } from '../../services/palmpay/palmpay.utils.js';

/**
 * Deposit Service
 * Handles fiat wallet deposits via bank transfer
 */
export class DepositService {
  private walletService: WalletService;
  private palmPayDepositService: PalmPayDepositService;

  constructor() {
    this.walletService = new WalletService();
    this.palmPayDepositService = new PalmPayDepositService();
  }

  private toNullableString(value: unknown): string | null {
    return value === null || value === undefined ? null : String(value);
  }

  private normalizeVirtualAccount(order: any) {
    return {
      accountType: order.payerAccountType ?? order.accountType ?? order.virtualAccountType ?? null,
      accountId: order.payerAccountId ?? order.accountId ?? order.virtualAccountId ?? null,
      bankName: order.payerBankName ?? order.bankName ?? order.bank_name ?? order.bank ?? null,
      accountName: order.payerAccountName ?? order.accountName ?? order.account_name ?? order.virtualAccountName ?? null,
      accountNumber: order.payerVirtualAccNo ?? order.accountNumber ?? order.accountNo ?? order.virtualAccountNo ?? order.virtualAccountNumber ?? order.virtualAccNo ?? null,
    };
  }

  /**
   * Static deposit accounts are disabled for NGN. A PalmPay virtual account
   * is created per deposit through initiateDeposit.
   */
  async getBankAccountDetails(countryCode: string, currency: string) {
    if (countryCode !== 'NG' || currency !== 'NGN') {
      throw new Error('Only NGN bank transfer deposits are currently supported');
    }

    return {
      provider: 'palmpay',
      currency: 'NGN',
      countryCode: 'NG',
      message: 'Enter an amount to generate bank transfer details for this deposit.',
    };
  }

  /**
   * Get mobile money providers for a country
   */
  async getMobileMoneyProviders(countryCode: string, currency: string) {
    if (countryCode === 'NG' && currency === 'NGN') {
      return [];
    }

    throw new Error('Mobile money deposits are currently unavailable');
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

    if (data.currency !== 'NGN' || data.countryCode !== 'NG' || data.channel !== 'bank_transfer') {
      throw new Error('Only NGN bank transfer deposits are currently supported');
    }

    const amount = parseFloat(data.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }
    if (amount < 100) {
      throw new Error('Minimum deposit amount is 100 NGN');
    }

    // Get or create wallet
    let wallet;
    try {
      wallet = await this.walletService.getWalletByCurrency(parsedUserId, data.currency);
    } catch (error) {
      // Create wallet if it doesn't exist
      wallet = await this.walletService.createWallet(parsedUserId, data.currency, 'fiat');
    }

    const reference = this.generateReference();
    const merchantOrderId = `deposit_${reference.toLowerCase()}`;
    const fee = 0;

    const transaction = await prisma.transaction.create({
      data: {
        walletId: wallet.id,
        type: 'deposit',
        status: 'pending',
        amount,
        currency: 'NGN',
        fee,
        reference,
        channel: 'bank_transfer',
        country: 'NG',
        paymentMethod: 'Bank Transfer',
        description: `Deposit ${data.amount} NGN via bank transfer`,
        metadata: {
          provider: 'palmpay',
          merchantOrderId,
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

    let palmPayOrder;
    try {
      palmPayOrder = await this.palmPayDepositService.createVirtualAccountOrder({
        orderId: merchantOrderId,
        amount,
        userId: parsedUserId,
        userMobileNo: transaction.wallet.user.phone,
      });
      const virtualAccount = this.normalizeVirtualAccount(palmPayOrder);

      await prisma.palmPayVirtualAccount.create({
        data: {
          transactionId: transaction.id,
          merchantOrderId,
          palmpayOrderNo: this.toNullableString(palmPayOrder.orderNo),
          payerAccountType: this.toNullableString(virtualAccount.accountType),
          payerAccountId: this.toNullableString(virtualAccount.accountId),
          payerBankName: this.toNullableString(virtualAccount.bankName),
          payerAccountName: this.toNullableString(virtualAccount.accountName),
          payerVirtualAccNo: this.toNullableString(virtualAccount.accountNumber),
          orderStatus: palmPayOrder.orderStatus ?? null,
          metadata: palmPayOrder as any,
        },
      });
    } catch (error: any) {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'failed',
          metadata: {
            provider: 'palmpay',
            merchantOrderId,
            error: error.providerResponse || error.message,
          },
        },
      });
      throw createProviderUnavailableError(error.message || 'Unable to create bank transfer details');
    }

    const virtualAccount = this.normalizeVirtualAccount(palmPayOrder);

    if (transaction.wallet.user.email) {
      await sendDepositInitiatedEmail(transaction.wallet.user.email, {
        amount: data.amount,
        currency: 'NGN',
        reference,
        bankName: virtualAccount.bankName || undefined,
        accountNumber: virtualAccount.accountNumber || undefined,
        accountName: virtualAccount.accountName || undefined,
      });
    }

    return {
      id: transaction.id,
      reference: transaction.reference,
      merchantOrderId,
      orderNo: palmPayOrder.orderNo,
      amount: transaction.amount.toString(),
      currency: transaction.currency,
      fee: transaction.fee.toString(),
      status: transaction.status,
      provider: 'palmpay',
      virtualAccount,
      checkoutUrl: palmPayOrder.checkoutUrl,
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
    throw new Error('Bank transfer deposits are confirmed automatically. Manual deposit confirmation is disabled.');
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
        palmPayVirtualAccounts: true,
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
      virtualAccount: transaction.palmPayVirtualAccounts[0] ? {
        bankName: transaction.palmPayVirtualAccounts[0].payerBankName,
        accountNumber: transaction.palmPayVirtualAccounts[0].payerVirtualAccNo,
        accountName: transaction.palmPayVirtualAccounts[0].payerAccountName,
        orderNo: transaction.palmPayVirtualAccounts[0].palmpayOrderNo,
        merchantOrderId: transaction.palmPayVirtualAccounts[0].merchantOrderId,
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

}

