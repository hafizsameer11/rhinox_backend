import { randomBytes } from 'crypto';
import prisma from '../../core/config/database.js';
import { WalletService } from '../wallet/wallet.service.js';
import { sendDepositInitiatedEmail } from '../../core/utils/transaction-email.service.js';
import { PalmPayDepositService } from '../../services/palmpay/palmpay.deposit.service.js';
import { PalmPayWebhookService } from '../../services/palmpay/palmpay.webhook.service.js';
import { createProviderUnavailableError } from '../../services/palmpay/palmpay.utils.js';
import { assertTransactionSecurity } from '../../core/utils/transactionSecurity.js';
import {
  FlutterwaveDepositService,
  FlutterwaveWebhookService,
  isFlutterwaveMomoSupported,
} from '../../services/flutterwave/index.js';

/**
 * Deposit Service
 * Handles fiat wallet deposits via bank transfer (NG/PalmPay) and
 * mobile money (KE/GH/UG/TZ via Flutterwave).
 */
export class DepositService {
  private walletService: WalletService;
  private palmPayDepositService: PalmPayDepositService;
  private palmPayWebhookService: PalmPayWebhookService;
  private flutterwaveDepositService: FlutterwaveDepositService;
  private flutterwaveWebhookService: FlutterwaveWebhookService;

  constructor() {
    this.walletService = new WalletService();
    this.palmPayDepositService = new PalmPayDepositService();
    this.palmPayWebhookService = new PalmPayWebhookService();
    this.flutterwaveDepositService = new FlutterwaveDepositService();
    this.flutterwaveWebhookService = new FlutterwaveWebhookService();
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

  async getMobileMoneyProviders(countryCode: string, currency: string) {
    const cc = countryCode.toUpperCase();
    const cur = currency.toUpperCase();

    if (cc === 'NG' || cur === 'NGN') {
      return [];
    }

    if (!isFlutterwaveMomoSupported(cc, cur)) {
      throw new Error('Mobile money deposits are currently unavailable for this country');
    }

    return prisma.mobileMoneyProvider.findMany({
      where: {
        isActive: true,
        countryCode: cc,
        currency: cur,
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        code: true,
        logoUrl: true,
        countryCode: true,
        currency: true,
      },
    });
  }

  async initiateDeposit(
    userId: string,
    data: {
      amount: string;
      currency: string;
      countryCode: string;
      channel: string;
      providerId?: string | number;
      phoneNumber?: string;
    }
  ) {
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }

    const countryCode = data.countryCode.toUpperCase();
    const currency = data.currency.toUpperCase();
    const channel = data.channel;

    if (currency === 'NGN' && countryCode === 'NG' && channel === 'bank_transfer') {
      return this.initiatePalmPayBankDeposit(parsedUserId, data.amount);
    }

    if (channel === 'mobile_money' && isFlutterwaveMomoSupported(countryCode, currency)) {
      return this.initiateFlutterwaveMomoDeposit(parsedUserId, {
        amount: data.amount,
        currency,
        countryCode,
        providerId: data.providerId,
        phoneNumber: data.phoneNumber,
      });
    }

    throw new Error(
      'Unsupported deposit method. Use NGN bank transfer (Nigeria) or mobile money for KE/GH/UG/TZ.'
    );
  }

  private async initiatePalmPayBankDeposit(parsedUserId: number, amountStr: string) {
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }
    if (amount < 100) {
      throw new Error('Minimum deposit amount is 100 NGN');
    }

    let wallet;
    try {
      wallet = await this.walletService.getWalletByCurrency(parsedUserId, 'NGN');
    } catch {
      wallet = await this.walletService.createWallet(parsedUserId, 'NGN', 'fiat');
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
        description: `Deposit ${amountStr} NGN via bank transfer`,
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
        amount: amountStr,
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

  private async initiateFlutterwaveMomoDeposit(
    parsedUserId: number,
    data: {
      amount: string;
      currency: string;
      countryCode: string;
      providerId?: string | number;
      phoneNumber?: string;
    }
  ) {
    const amount = parseFloat(data.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }

    if (!data.providerId) {
      throw new Error('Provider ID is required for mobile money deposits');
    }
    if (!data.phoneNumber || String(data.phoneNumber).replace(/\D/g, '').length < 9) {
      throw new Error('A valid mobile money phone number is required');
    }

    const providerId =
      typeof data.providerId === 'string' ? parseInt(data.providerId, 10) : data.providerId;
    if (isNaN(providerId) || providerId <= 0) {
      throw new Error('Invalid provider ID');
    }

    const provider = await prisma.mobileMoneyProvider.findFirst({
      where: {
        id: providerId,
        isActive: true,
        countryCode: data.countryCode,
        currency: data.currency,
      },
    });

    if (!provider) {
      throw new Error('Mobile money provider not found for this country/currency');
    }

    let wallet;
    try {
      wallet = await this.walletService.getWalletByCurrency(parsedUserId, data.currency);
    } catch {
      wallet = await this.walletService.createWallet(parsedUserId, data.currency, 'fiat');
    }

    const user = await prisma.user.findUnique({ where: { id: parsedUserId } });
    if (!user?.email) {
      throw new Error('A verified email is required for mobile money deposits');
    }

    const reference = this.generateReference();
    const flwTxRef = `flw_deposit_${reference.toLowerCase()}`;
    const fee = 0;
    const phoneNumber = String(data.phoneNumber).trim();

    const transaction = await prisma.transaction.create({
      data: {
        walletId: wallet.id,
        type: 'deposit',
        status: 'pending',
        amount,
        currency: data.currency,
        fee,
        reference,
        channel: 'mobile_money',
        country: data.countryCode,
        paymentMethod: 'Mobile Money',
        providerId: provider.id,
        description: `Deposit ${data.amount} ${data.currency} via ${provider.name}`,
        metadata: {
          provider: 'flutterwave',
          flwTxRef,
          phoneNumber,
          network: provider.code,
          providerId: provider.id,
          providerCode: provider.code,
          providerName: provider.name,
        },
      },
      include: {
        wallet: {
          include: {
            user: true,
          },
        },
        provider: true,
      },
    });

    let charge;
    try {
      charge = await this.flutterwaveDepositService.createMobileMoneyCharge({
        txRef: flwTxRef,
        amount,
        currency: data.currency,
        countryCode: data.countryCode,
        providerCode: provider.code,
        phoneNumber,
        email: user.email,
        fullName: [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined,
      });
    } catch (error: any) {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'failed',
          metadata: {
            provider: 'flutterwave',
            flwTxRef,
            phoneNumber,
            error: error.providerResponse || error.message,
          },
        },
      });
      throw createProviderUnavailableError(
        error.message || 'Unable to initiate mobile money deposit'
      );
    }

    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        metadata: {
          provider: 'flutterwave',
          flwTxRef,
          flwRef: charge.flwRef,
          flwId: charge.flwId,
          flwStatus: charge.status,
          phoneNumber,
          network: provider.code,
          providerId: provider.id,
          providerCode: provider.code,
          providerName: provider.name,
          chargeResponse: charge.raw,
        },
      },
    });

    if (user.email) {
      await sendDepositInitiatedEmail(user.email, {
        amount: data.amount,
        currency: data.currency,
        reference,
      });
    }

    return {
      id: transaction.id,
      reference: transaction.reference,
      amount: transaction.amount.toString(),
      currency: transaction.currency,
      fee: transaction.fee.toString(),
      status: transaction.status,
      provider: 'flutterwave',
      channel: 'mobile_money',
      flwTxRef,
      nextAction: charge.redirectUrl
        ? { type: 'redirect', url: charge.redirectUrl }
        : { type: 'payment_instruction', message: charge.message },
      message: charge.message,
      createdAt: transaction.createdAt,
    };
  }

  async confirmDeposit(
    userId: string,
    transactionId: string,
    pin?: string,
    emailOtp?: string
  ) {
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    const parsedTransactionId =
      typeof transactionId === 'string' ? parseInt(transactionId, 10) : transactionId;

    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }
    if (isNaN(parsedTransactionId) || parsedTransactionId <= 0) {
      throw new Error('Invalid transaction ID format');
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
      },
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    if (transaction.wallet.userId !== parsedUserId) {
      throw new Error('Unauthorized access to transaction');
    }

    if (transaction.type !== 'deposit') {
      throw new Error('Transaction is not a deposit');
    }

    if (transaction.status !== 'pending') {
      throw new Error(`Transaction is already ${transaction.status}`);
    }

    await assertTransactionSecurity(transaction.wallet.user, { pin, emailOtp });

    throw new Error(
      'Deposits are confirmed automatically after payment. Manual deposit confirmation is disabled.'
    );
  }

  async checkDepositStatus(userId: string, transactionId: string) {
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    const parsedTransactionId =
      typeof transactionId === 'string' ? parseInt(transactionId, 10) : transactionId;

    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }
    if (isNaN(parsedTransactionId) || parsedTransactionId <= 0) {
      throw new Error('Invalid transaction ID format');
    }

    let transaction = await prisma.transaction.findUnique({
      where: { id: parsedTransactionId },
      include: {
        wallet: {
          include: {
            user: true,
          },
        },
        palmPayVirtualAccounts: true,
      },
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    if (transaction.wallet.userId !== parsedUserId) {
      throw new Error('Unauthorized access to transaction');
    }

    if (transaction.type !== 'deposit') {
      throw new Error('Transaction is not a deposit');
    }

    if (transaction.status === 'pending') {
      const metadata = (transaction.metadata as any) || {};
      const provider = metadata.provider;

      if (provider === 'flutterwave' && metadata.flwTxRef) {
        try {
          await this.flutterwaveWebhookService.syncDepositStatus(metadata.flwTxRef);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          console.error('[DepositService] Failed to sync Flutterwave deposit status:', message);
        }
      } else {
        const merchantOrderId =
          transaction.palmPayVirtualAccounts[0]?.merchantOrderId || metadata.merchantOrderId;

        if (merchantOrderId) {
          try {
            await this.palmPayWebhookService.syncDepositStatus(merchantOrderId);
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('[DepositService] Failed to sync PalmPay deposit status:', message);
          }
        }
      }

      transaction = await prisma.transaction.findUnique({
        where: { id: parsedTransactionId },
        include: {
          wallet: {
            include: {
              user: true,
            },
          },
          palmPayVirtualAccounts: true,
        },
      });

      if (!transaction) {
        throw new Error('Transaction not found');
      }
    }

    const fee = Number(transaction.fee);
    const amount = Number(transaction.amount);
    const creditedAmount = amount - fee;
    const isMomo = transaction.channel === 'mobile_money';

    return {
      id: transaction.id,
      reference: transaction.reference,
      status: transaction.status,
      amount: transaction.amount.toString(),
      currency: transaction.currency,
      fee: transaction.fee.toString(),
      creditedAmount: creditedAmount.toString(),
      completedAt: transaction.completedAt,
      message:
        transaction.status === 'completed'
          ? 'Payment received and wallet credited'
          : transaction.status === 'failed' || transaction.status === 'cancelled'
          ? 'Payment was not completed'
          : isMomo
          ? 'Waiting for mobile money authorization'
          : 'Waiting for bank transfer confirmation',
    };
  }

  async getTransactionReceipt(userId: string, transactionId: string) {
    const parsedTransactionId = typeof transactionId === 'string' ? parseInt(transactionId, 10) : transactionId;
    if (isNaN(parsedTransactionId) || parsedTransactionId <= 0) {
      throw new Error('Invalid transaction ID format');
    }

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
      provider: transaction.provider
        ? {
            name: transaction.provider.name,
            code: transaction.provider.code,
          }
        : null,
      description: transaction.description,
      transactionId: transaction.id,
      date: transaction.completedAt || transaction.createdAt,
      createdAt: transaction.createdAt,
      bankAccount: transaction.bankAccount
        ? {
            bankName: transaction.bankAccount.bankName,
            accountNumber: transaction.bankAccount.accountNumber,
            accountName: transaction.bankAccount.accountName,
          }
        : null,
      virtualAccount: transaction.palmPayVirtualAccounts[0]
        ? {
            bankName: transaction.palmPayVirtualAccounts[0].payerBankName,
            accountNumber: transaction.palmPayVirtualAccounts[0].payerVirtualAccNo,
            accountName: transaction.palmPayVirtualAccounts[0].payerAccountName,
            orderNo: transaction.palmPayVirtualAccounts[0].palmpayOrderNo,
            merchantOrderId: transaction.palmPayVirtualAccounts[0].merchantOrderId,
          }
        : null,
    };
  }

  private generateReference(): string {
    const timestamp = Date.now().toString(36);
    const random = randomBytes(4).toString('hex');
    return `${timestamp}${random}`.toUpperCase();
  }
}
