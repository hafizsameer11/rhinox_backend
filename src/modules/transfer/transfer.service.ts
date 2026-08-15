import { randomBytes } from 'crypto';
import { Decimal, type Decimal as DecimalType } from 'decimal.js';
import bcrypt from 'bcryptjs';
import prisma from '../../core/config/database.js';
import { WalletService } from '../wallet/wallet.service.js';
import { KYCService } from '../kyc/kyc.service.js';
import { PaymentSettingsService } from '../payment-settings/payment-settings.service.js';
import { decryptPrivateKey } from '../../core/utils/encryption.js';
import { PalmPayPayoutService } from '../../services/palmpay/palmpay.payout.service.js';
import { mapPalmPayStatus } from '../../services/palmpay/palmpay.utils.js';
import {
  FlutterwavePayoutService,
  isFlutterwaveMomoSupported,
} from '../../services/flutterwave/index.js';
import { logApplicationEvent } from '../../core/utils/application-log.service.js';
import {
  notifyTransferReceived,
  notifyTransferSent,
} from '../../core/utils/notification.events.js';
import { assertTransactionSecurity } from '../../core/utils/transactionSecurity.js';
import {
  UnifiedStablecoinService,
  getBaseSymbol,
  isUnifiedStable,
} from '../../services/crypto/unified-stablecoin.service.js';
import { normalizeBlockchain } from '../../services/tatum/tatum-blockchain.util.js';
import {
  ensureRhinoxPayId,
  isRhinoxPayId,
  normalizeRhinoxPayId,
} from '../../core/utils/rhinox-pay-id.service.js';

/**
 * Transfer Service
 * Handles fiat transfers (RhionX user, bank account, mobile money)
 */
export class TransferService {
  private walletService: WalletService;
  private kycService: KYCService;
  private paymentSettingsService: PaymentSettingsService;
  private palmPayPayoutService: PalmPayPayoutService;
  private flutterwavePayoutService: FlutterwavePayoutService;
  private unifiedStablecoinService = new UnifiedStablecoinService();

  constructor() {
    this.walletService = new WalletService();
    this.kycService = new KYCService();
    this.paymentSettingsService = new PaymentSettingsService();
    this.palmPayPayoutService = new PalmPayPayoutService();
    this.flutterwavePayoutService = new FlutterwavePayoutService();
  }

  /**
   * Check if user can send funds (KYC verification required)
   */
  async checkTransferEligibility(userId: string) {
    const kycStatus = await this.kycService.getKYCStatus(userId);
    
    if (!kycStatus.hasKYC || kycStatus.status !== 'verified') {
      return {
        eligible: false,
        reason: 'KYC_NOT_COMPLETE',
        message: 'You cannot complete your transaction because you are yet to complete your KYC',
        kycStatus: {
          hasKYC: kycStatus.hasKYC,
          status: kycStatus.status,
        },
      };
    }

    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }

    // Check if PIN is set
    const user = await prisma.user.findUnique({
      where: { id: parsedUserId },
      select: { pinHash: true },
    });

    if (!user?.pinHash) {
      return {
        eligible: false,
        reason: 'PIN_NOT_SET',
        message: 'Please setup your PIN to use for your transactions',
      };
    }

    return {
      eligible: true,
    };
  }

  /**
   * Validate recipient (for RhionX user transfers)
   * Accepts either userId or email
   */
  async validateRhionXUser(recipientIdentifier: string) {
    const normalized = recipientIdentifier.trim();
    const normalizedPayId = normalizeRhinoxPayId(normalized);

    let user = null;

    if (normalizedPayId && isRhinoxPayId(normalizedPayId)) {
      user = await prisma.user.findUnique({
        where: { rhinoxPayId: normalizedPayId },
        select: {
          id: true,
          email: true,
          rhinoxPayId: true,
          firstName: true,
          lastName: true,
          phone: true,
          isActive: true,
        },
      });
    }

    if (!user && normalized.includes('@')) {
      user = await prisma.user.findUnique({
        where: { email: normalized.toLowerCase() },
        select: {
          id: true,
          email: true,
          rhinoxPayId: true,
          firstName: true,
          lastName: true,
          phone: true,
          isActive: true,
        },
      });
    }

    if (!user) {
      const userId = typeof normalized === 'string' ? parseInt(normalized, 10) : normalized;
      if (!isNaN(userId) && userId > 0) {
        user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            email: true,
            rhinoxPayId: true,
            firstName: true,
            lastName: true,
            phone: true,
            isActive: true,
          },
        });
      }
    }

    if (!user) {
      throw new Error('Recipient user not found');
    }

    if (!user.isActive) {
      throw new Error('Recipient account is not active');
    }

    const rhinoxPayId = user.rhinoxPayId || (await ensureRhinoxPayId(user.id));

    return {
      userId: user.id,
      email: user.email,
      rhinoxPayId,
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'RhionX User',
      phone: user.phone,
    };
  }

  /**
   * Validate a direct bank withdrawal account against PalmPay before payout.
   */
  async validateBankAccount(accountNumber: string, bankName: string, countryCode: string, bankCode?: string, userId?: string | number) {
    const numericAccountNumber = accountNumber.replace(/\D/g, '');
    if (!numericAccountNumber || numericAccountNumber.length < 8) {
      throw new Error('Invalid account number');
    }

    if (countryCode !== 'NG') {
      throw new Error('Only Nigerian bank withdrawals are currently supported');
    }

    if (!bankCode) {
      throw new Error('Bank code is required');
    }

    let palmPayBanks;
    try {
      palmPayBanks = await this.palmPayPayoutService.getBanks();
    } catch (error: any) {
      throw new Error(error.message || 'Bank list is unavailable');
    }

    const bank = palmPayBanks.find((item) => item.bankCode === bankCode);
    if (!bank) {
      throw new Error('Selected bank is not available');
    }

    let verifiedAccount;
    try {
      verifiedAccount = await this.palmPayPayoutService.verifyBankAccount(bankCode, numericAccountNumber);
    } catch (error: any) {
      await logApplicationEvent({
        level: 'error',
        source: 'transfer.bank_account_verification',
        message: error.message || 'Bank account verification failed',
        userId,
        statusCode: error.statusCode,
        errorName: error.name,
        stackTrace: error.stack,
        context: {
          bankCode,
          bankName,
          accountNumber: numericAccountNumber,
          countryCode,
          providerResponse: error.providerResponse,
        },
      });
      console.error('[TransferService] Bank account verification failed during transfer initiation', {
        bankCode,
        accountNumber: numericAccountNumber.length <= 4 ? numericAccountNumber : `****${numericAccountNumber.slice(-4)}`,
        message: error.message,
        statusCode: error.statusCode,
        providerResponse: error.providerResponse,
      });
      throw new Error('Unable to verify this bank account right now. Please try again later or use another bank account.');
    }

    if (!verifiedAccount.isValid || !verifiedAccount.accountName) {
      throw new Error(verifiedAccount.errorMessage || 'Could not verify this bank account');
    }

    return {
      accountNumber: numericAccountNumber,
      bankName: bank.bankName || bankName,
      accountName: verifiedAccount.accountName,
      bankCode,
      countryCode,
      isValid: true,
    };
  }

  /**
   * Calculate transfer fee
   */
  private calculateTransferFee(amount: DecimalType, currency: string, channel: string): DecimalType {
    if (channel === 'bank_account' && currency === 'NGN') {
      return new Decimal(0);
    }
    if (channel === 'mobile_money') {
      return new Decimal(0);
    }

    // Fee structure: 0.1% or minimum fee
    const feePercent = 0.001; // 0.1%
    const calculatedFee = amount.times(feePercent);
    
    // Minimum fees by currency
    const minFees: { [key: string]: number } = {
      NGN: 20,
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
    return calculatedFee.greaterThan(minFee) ? calculatedFee : minFee;
  }

  /**
   * Initiate transfer
   */
  async initiateTransfer(
    userId: string,
    data: {
      amount: string;
      currency: string;
      countryCode: string;
      channel: 'rhionx_user' | 'bank_account' | 'mobile_money';
      recipientUserId?: string; // For RhionX user transfers (legacy support)
      recipientEmail?: string; // Legacy email lookup
      recipientRhinoxPayId?: string; // Preferred Rhinox Pay ID lookup
      blockchain?: string; // For crypto: network to send from (ethereum, tron, bsc, …)
      paymentMethodId?: number; // For bank_account withdrawals - ID from payment settings
      accountNumber?: string; // For bank account transfers (legacy - use paymentMethodId instead)
      bankName?: string; // For bank account transfers (legacy - use paymentMethodId instead)
      bankCode?: string; // PalmPay bank code for direct bank account withdrawals
      providerId?: string; // For mobile money transfers
      phoneNumber?: string; // For mobile money transfers
    }
  ) {
    // Parse userId to integer
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID');
    }

    // Check transfer eligibility (KYC + PIN)
    const eligibility = await this.checkTransferEligibility(userId);
    if (!eligibility.eligible) {
      throw new Error(eligibility.message);
    }

    const currencyUpper = data.currency.toUpperCase();
    const baseSymbol = getBaseSymbol(currencyUpper);

    let walletCurrency = await prisma.walletCurrency.findFirst({
      where: { currency: currencyUpper },
    });

    if (!walletCurrency && data.blockchain) {
      walletCurrency = await prisma.walletCurrency.findFirst({
        where: {
          blockchain: data.blockchain.toLowerCase(),
          OR: [
            { currency: currencyUpper },
            { symbol: baseSymbol },
          ],
        },
      });
    }

    if (!walletCurrency && isUnifiedStable(currencyUpper)) {
      walletCurrency = await prisma.walletCurrency.findFirst({
        where: {
          OR: [
            { currency: currencyUpper },
            { currency: { startsWith: `${baseSymbol}_` } },
            { symbol: baseSymbol },
          ],
        },
      });
    }

    const isCrypto = !!walletCurrency;
    let sourceWallet;
    let sourceVirtualAccount = null;
    let availableBalance: Decimal;
    let ledgerCurrency = currencyUpper;
    let ledgerBlockchain = data.blockchain?.toLowerCase();

    if (isCrypto) {
      if (isUnifiedStable(currencyUpper)) {
        const unified = await this.unifiedStablecoinService.getUnifiedBalance(
          parsedUserId,
          baseSymbol
        );
        availableBalance = new Decimal(unified.totalAvailable);

        if (ledgerBlockchain) {
          const network = unified.networks.find(
            (n) => normalizeBlockchain(n.blockchain) === normalizeBlockchain(ledgerBlockchain!)
          );
          if (network) {
            ledgerCurrency = network.currency;
            ledgerBlockchain = network.blockchain;
          }
        } else if (unified.networks.length > 0) {
          const richest = [...unified.networks].sort((a, b) =>
            parseFloat(b.available) > parseFloat(a.available) ? 1 : -1
          )[0];
          if (richest) {
            ledgerCurrency = richest.currency;
            ledgerBlockchain = richest.blockchain;
          }
        }

        sourceVirtualAccount = await this.unifiedStablecoinService.resolveVirtualAccountForCurrency(
          parsedUserId,
          ledgerCurrency,
          ledgerBlockchain
        );
      } else {
        sourceVirtualAccount = await prisma.virtualAccount.findFirst({
          where: {
            userId: parsedUserId,
            currency: currencyUpper,
            ...(ledgerBlockchain ? { blockchain: ledgerBlockchain } : {}),
            active: true,
          },
        });

        if (!sourceVirtualAccount) {
          throw new Error(
            `Source crypto wallet for ${data.currency} not found. Please initialize your crypto wallets.`
          );
        }
        ledgerCurrency = sourceVirtualAccount.currency;
        ledgerBlockchain = sourceVirtualAccount.blockchain;
        availableBalance = new Decimal(sourceVirtualAccount.availableBalance || '0');
      }

      if (!sourceVirtualAccount) {
        throw new Error(`Source crypto wallet for ${data.currency} not found. Please initialize your crypto wallets.`);
      }

      const accountBalance = new Decimal(sourceVirtualAccount.accountBalance || '0');
      const lockedAmount = new Decimal(sourceVirtualAccount.accountBalance || '0').minus(
        new Decimal(sourceVirtualAccount.availableBalance || '0')
      );

      if (!isUnifiedStable(currencyUpper)) {
        availableBalance = new Decimal(sourceVirtualAccount.availableBalance || '0');
      }

      sourceWallet = await prisma.wallet.findFirst({
        where: {
          userId: parsedUserId,
          currency: baseSymbol,
          type: 'crypto',
        },
      });

      if (!sourceWallet) {
        sourceWallet = await prisma.wallet.create({
          data: {
            userId: parsedUserId,
            currency: baseSymbol,
            type: 'crypto',
            balance: accountBalance.toNumber(),
            lockedBalance: lockedAmount.toNumber(),
          },
        });
      }
    } else {
      // For fiat, use Wallet
      try {
        sourceWallet = await this.walletService.getWalletByCurrency(userId, data.currency);
      } catch (error) {
        throw new Error(`Source wallet for ${data.currency} not found`);
      }
      availableBalance = new Decimal(sourceWallet.balance).minus(new Decimal(sourceWallet.lockedBalance));
    }

    const amountDecimal = new Decimal(data.amount);
    const fee = this.calculateTransferFee(amountDecimal, data.currency, data.channel);
    const totalDeduction = amountDecimal.plus(fee);

    if (totalDeduction.greaterThan(availableBalance)) {
      throw new Error(`Insufficient balance. Available: ${availableBalance.toString()} ${data.currency}`);
    }

    // Validate recipient based on channel
    let recipientInfo: any = {};
    
    if (data.channel === 'rhionx_user') {
      const recipientIdentifier =
        data.recipientRhinoxPayId || data.recipientEmail || data.recipientUserId;
      if (!recipientIdentifier) {
        throw new Error('Recipient Rhinox Pay ID is required for RhionX user transfers');
      }
      recipientInfo = await this.validateRhionXUser(recipientIdentifier);
      
      // Prevent self-transfer
      if (Number(recipientInfo.userId) === parsedUserId) {
        throw new Error('You cannot transfer funds to yourself');
      }
    } else if (data.channel === 'bank_account') {
      if (data.currency !== 'NGN' || data.countryCode !== 'NG') {
        throw new Error('Only NGN withdrawals to Nigerian bank accounts are currently supported');
      }
      // For withdrawals, use payment method from payment settings
      if (data.paymentMethodId) {
        const paymentMethod = await this.paymentSettingsService.getPaymentMethod(userId, data.paymentMethodId.toString());
        if (paymentMethod.type !== 'bank_account') {
          throw new Error('Payment method must be a bank account');
        }
        // Get decrypted account number for validation
        const fullPaymentMethod = await prisma.userPaymentMethod.findFirst({
          where: {
            id: data.paymentMethodId,
            userId: parsedUserId,
            type: 'bank_account',
            isActive: true,
          },
        });
        if (!fullPaymentMethod || !fullPaymentMethod.accountNumber) {
          throw new Error('Payment method not found or invalid');
        }
        if (!fullPaymentMethod.bankCode) {
          throw new Error('Bank account must be verified before withdrawal');
        }
        const decryptedAccountNumber = decryptPrivateKey(fullPaymentMethod.accountNumber);
        recipientInfo = {
          accountNumber: decryptedAccountNumber,
          bankName: paymentMethod.bankName || '',
          accountName: paymentMethod.accountName || '',
          bankCode: fullPaymentMethod.bankCode,
          countryCode: paymentMethod.countryCode,
          paymentMethodId: data.paymentMethodId,
        };
      } else if (data.accountNumber && data.bankCode) {
        recipientInfo = await this.validateBankAccount(data.accountNumber, data.bankName || '', data.countryCode, data.bankCode, parsedUserId);
      } else {
        throw new Error('Bank and account number are required for bank account withdrawals.');
      }
    } else if (data.channel === 'mobile_money') {
      const countryCode = data.countryCode.toUpperCase();
      const currency = data.currency.toUpperCase();

      if (countryCode === 'NG' || currency === 'NGN') {
        throw new Error('Mobile money withdrawals are not available in Nigeria. Use bank transfer.');
      }

      if (!isFlutterwaveMomoSupported(countryCode, currency)) {
        throw new Error('Mobile money withdrawals are currently unavailable for this country');
      }

      if (!data.providerId) {
        throw new Error('Provider ID is required for mobile money transfers');
      }
      if (!data.phoneNumber || String(data.phoneNumber).replace(/\D/g, '').length < 9) {
        throw new Error('A valid mobile money phone number is required');
      }

      const providerId =
        typeof data.providerId === 'string' ? parseInt(data.providerId, 10) : Number(data.providerId);
      if (isNaN(providerId) || providerId <= 0) {
        throw new Error('Invalid provider ID');
      }

      const provider = await prisma.mobileMoneyProvider.findFirst({
        where: {
          id: providerId,
          isActive: true,
          countryCode,
          currency,
        },
      });

      if (!provider) {
        throw new Error('Mobile money provider not found for this country/currency');
      }

      recipientInfo = {
        phoneNumber: String(data.phoneNumber).trim(),
        providerId: provider.id,
        providerCode: provider.code,
        providerName: provider.name,
        countryCode,
        currency,
      };
    }

    // Generate unique reference
    const reference = this.generateReference();

    // Bank and MoMo off-ramp are withdrawals; P2P remains transfer
    const transactionType =
      data.channel === 'bank_account' || data.channel === 'mobile_money' ? 'withdrawal' : 'transfer';

    // Create pending transaction
    const transaction = await prisma.transaction.create({
      data: {
        walletId: sourceWallet.id,
        type: transactionType,
        status: 'pending',
        amount: amountDecimal.toNumber(),
        currency: data.currency,
        fee: fee.toNumber(),
        reference,
        channel: data.channel,
        country: data.countryCode,
        paymentMethod: this.getPaymentMethodName(data.channel),
        description: this.getTransferDescription(data.channel, recipientInfo, data.amount, data.currency),
        metadata: {
          recipientUserId: recipientInfo.userId || data.recipientUserId, // Store validated userId
          recipientEmail: data.recipientEmail, // Legacy email lookup
          recipientRhinoxPayId: data.recipientRhinoxPayId || recipientInfo.rhinoxPayId,
          paymentMethodId: recipientInfo.paymentMethodId || data.paymentMethodId, // For bank withdrawals
          accountNumber: recipientInfo.accountNumber || data.accountNumber, // For bank transfers
          bankName: recipientInfo.bankName || data.bankName, // For bank transfers
          accountName: recipientInfo.accountName, // For bank transfers (from validation/payment method)
          bankCode: recipientInfo.bankCode,
          phoneNumber: data.phoneNumber, // For mobile money
          providerId: data.providerId, // For mobile money
          recipientInfo, // Full recipient information
          // Additional fields for future bank API integration
          countryCode: data.countryCode,
          transferType: data.channel, // rhionx_user, bank_account, mobile_money
          integrationStatus: 'pending', // pending, processing, completed, failed - for external API integration
          // Crypto transfer fields
          isCrypto: isCrypto,
          sourceVirtualAccountId: sourceVirtualAccount?.id || null,
          ledgerCurrency: isCrypto ? ledgerCurrency : undefined,
          blockchain: isCrypto ? ledgerBlockchain : undefined,
          baseSymbol: isCrypto ? baseSymbol : undefined,
          isUnifiedStable: isCrypto ? isUnifiedStable(currencyUpper) : false,
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

    return {
      id: transaction.id,
      reference: transaction.reference,
      amount: transaction.amount.toString(),
      currency: transaction.currency,
      fee: transaction.fee.toString(),
      totalDeduction: totalDeduction.toString(),
      status: transaction.status,
      channel: transaction.channel,
      recipientInfo,
      createdAt: transaction.createdAt,
    };
  }

  /**
   * Verify transfer with PIN
   */
  async verifyTransfer(
    userId: string,
    transactionId: string,
    pin?: string,
    emailOtp?: string
  ) {
    const parsedTransactionId = typeof transactionId === 'string' ? parseInt(transactionId, 10) : transactionId;
    if (isNaN(parsedTransactionId) || parsedTransactionId <= 0) {
      throw new Error('Invalid transaction ID format');
    }

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

    if (transaction.type !== 'transfer' && transaction.type !== 'withdrawal') {
      throw new Error('Invalid transaction type');
    }

    // Verify configured security requirements
    await assertTransactionSecurity(transaction.wallet.user, { pin, emailOtp });

    // Get metadata to check if it's crypto
    const metadata = transaction.metadata as any;
    const isCrypto = metadata?.isCrypto || false;
    const sourceVirtualAccountId = metadata?.sourceVirtualAccountId;

    // Check balance again (in case it changed)
    const wallet = await prisma.wallet.findUnique({
      where: { id: transaction.walletId },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const amountDecimal = new Decimal(transaction.amount);
    const fee = new Decimal(transaction.fee);
    const totalDeduction = amountDecimal.plus(fee);

    let availableBalance: Decimal;
    let sourceVirtualAccount = null;

    if (isCrypto && sourceVirtualAccountId) {
      const metaLedger = metadata?.ledgerCurrency as string | undefined;
      const metaBlockchain = metadata?.blockchain as string | undefined;
      const metaBase = metadata?.baseSymbol as string | undefined;
      const metaUnified = metadata?.isUnifiedStable === true;

      if (metaUnified && metaBase) {
        const unified = await this.unifiedStablecoinService.getUnifiedBalance(
          parsedUserId,
          metaBase
        );
        availableBalance = new Decimal(unified.totalAvailable);

        const allocatedId = await this.unifiedStablecoinService.allocateUnifiedBalance(
          parsedUserId,
          metaBase,
          metaLedger || transaction.currency,
          metaBlockchain,
          totalDeduction
        );
        sourceVirtualAccount = await prisma.virtualAccount.findUnique({
          where: { id: allocatedId },
        });
      } else {
        sourceVirtualAccount = await prisma.virtualAccount.findUnique({
          where: { id: sourceVirtualAccountId },
        });

        if (!sourceVirtualAccount) {
          throw new Error('Source crypto wallet not found');
        }

        availableBalance = new Decimal(sourceVirtualAccount.availableBalance || '0');
      }

      if (!sourceVirtualAccount) {
        throw new Error('Source crypto wallet not found');
      }
    } else {
      // For fiat, check Wallet balance
      availableBalance = new Decimal(wallet.balance).minus(new Decimal(wallet.lockedBalance));
    }

    if (totalDeduction.greaterThan(availableBalance)) {
      throw new Error('Insufficient balance');
    }

    if (transaction.type === 'withdrawal' && transaction.channel === 'bank_account') {
      const recipientInfo = metadata?.recipientInfo || {};
      if (!recipientInfo.bankCode || !recipientInfo.accountNumber || !recipientInfo.accountName) {
        throw new Error('Verified bank account details are required for withdrawal');
      }

      const now = new Date();
      const palmPayOrderId = `payout_${transaction.reference.toLowerCase()}`;
      let payoutResponse: any;

      try {
        payoutResponse = await this.palmPayPayoutService.initiatePayout({
          orderId: palmPayOrderId,
          amount: transaction.amount.toString(),
          accountNumber: recipientInfo.accountNumber,
          accountName: recipientInfo.accountName,
          bankCode: recipientInfo.bankCode,
          phoneNumber: transaction.wallet.user.phone,
          userId: parsedUserId,
        });
      } catch (error: any) {
        await prisma.transaction.update({
          where: { id: parsedTransactionId },
          data: {
            status: 'failed',
            metadata: {
              ...metadata,
              integrationStatus: 'failed',
              palmpayOrderId: palmPayOrderId,
              palmpayError: error.providerResponse || error.message,
            },
          },
        });
        throw new Error(error.message || 'Withdrawal processing failed');
      }

      const updatedTransaction = await prisma.$transaction(async (tx) => {
        const updated = await tx.transaction.update({
          where: { id: parsedTransactionId },
          data: {
            status: 'processing',
            metadata: {
              ...metadata,
              provider: 'palmpay',
              integrationStatus: 'accepted',
              palmpayOrderId: palmPayOrderId,
              palmpayOrderNo: payoutResponse.orderNo,
              palmpayStatus: payoutResponse.orderStatus,
              palmpaySessionId: payoutResponse.sessionId,
              payoutResponse,
              walletDebited: true,
              walletDebitedAt: now.toISOString(),
            },
          },
        });

        await tx.wallet.update({
          where: { id: transaction.walletId },
          data: {
            balance: {
              decrement: totalDeduction.toNumber(),
            },
          },
        });

        return updated;
      });

      return {
        id: updatedTransaction.id,
        reference: updatedTransaction.reference,
        amount: updatedTransaction.amount.toString(),
        currency: updatedTransaction.currency,
        fee: updatedTransaction.fee.toString(),
        status: updatedTransaction.status,
        channel: updatedTransaction.channel,
        provider: 'palmpay',
        orderId: palmPayOrderId,
        orderNo: payoutResponse.orderNo,
        recipientInfo,
        date: updatedTransaction.completedAt,
        createdAt: updatedTransaction.createdAt,
      };
    }

    if (transaction.type === 'withdrawal' && transaction.channel === 'mobile_money') {
      const recipientInfo = metadata?.recipientInfo || {};
      if (!recipientInfo.phoneNumber || !recipientInfo.providerCode) {
        throw new Error('Mobile money provider and phone number are required for withdrawal');
      }

      const now = new Date();
      const flwPayoutReference = `flw_payout_${transaction.reference.toLowerCase()}`;
      let payoutResponse: any;

      const user = transaction.wallet.user;
      const beneficiaryName =
        [user.firstName, user.lastName].filter(Boolean).join(' ') ||
        user.email ||
        'RhinoxPay User';

      try {
        payoutResponse = await this.flutterwavePayoutService.initiateMobileMoneyTransfer({
          reference: flwPayoutReference,
          amount: Number(transaction.amount),
          currency: transaction.currency,
          countryCode: transaction.country || recipientInfo.countryCode,
          providerCode: recipientInfo.providerCode,
          phoneNumber: recipientInfo.phoneNumber,
          beneficiaryName,
          senderName: beneficiaryName,
          senderCountry: transaction.country || recipientInfo.countryCode || 'KE',
          senderMobile: user.phone || recipientInfo.phoneNumber,
          narration: `RhinoxPay withdrawal ${transaction.reference}`,
        });
      } catch (error: any) {
        await prisma.transaction.update({
          where: { id: parsedTransactionId },
          data: {
            status: 'failed',
            metadata: {
              ...metadata,
              provider: 'flutterwave',
              integrationStatus: 'failed',
              flwPayoutReference,
              flwError: error.providerResponse || error.message,
            },
          },
        });
        throw new Error(error.message || 'Mobile money withdrawal processing failed');
      }

      const updatedTransaction = await prisma.$transaction(async (tx) => {
        const updated = await tx.transaction.update({
          where: { id: parsedTransactionId },
          data: {
            status: 'processing',
            metadata: {
              ...metadata,
              provider: 'flutterwave',
              integrationStatus: 'accepted',
              flwPayoutReference,
              flwTransferId: payoutResponse.id,
              flwStatus: payoutResponse.status,
              payoutResponse: payoutResponse.raw,
              walletDebited: true,
              walletDebitedAt: now.toISOString(),
            },
          },
        });

        await tx.wallet.update({
          where: { id: transaction.walletId },
          data: {
            balance: {
              decrement: totalDeduction.toNumber(),
            },
          },
        });

        return updated;
      });

      return {
        id: updatedTransaction.id,
        reference: updatedTransaction.reference,
        amount: updatedTransaction.amount.toString(),
        currency: updatedTransaction.currency,
        fee: updatedTransaction.fee.toString(),
        status: updatedTransaction.status,
        channel: updatedTransaction.channel,
        provider: 'flutterwave',
        flwPayoutReference,
        flwTransferId: payoutResponse.id,
        recipientInfo,
        date: updatedTransaction.completedAt,
        createdAt: updatedTransaction.createdAt,
      };
    }

    // Update transaction status to completed
    // Note: For bank_account and mobile_money transfers, external API integration
    // will be added later. Transaction is marked as completed after wallet debit.
    const now = new Date();
    const updatedMetadata = {
      ...metadata,
      integrationStatus: 'pending', // Will be updated when external API is integrated
      walletDebited: true,
      walletDebitedAt: now.toISOString(),
      // For bank transfers, these fields will be populated by external API later:
      // externalTransactionId: null,
      // externalReference: null,
      // bankResponse: null,
    };

    const updatedTransaction = await prisma.transaction.update({
      where: { id: parsedTransactionId },
      data: {
        status: 'completed',
        completedAt: now,
        metadata: updatedMetadata,
      },
      include: {
        wallet: {
          include: {
            user: true,
          },
        },
      },
    });

    // Debit source wallet/VirtualAccount
    if (isCrypto && sourceVirtualAccount) {
      // For crypto, update VirtualAccount
      const currentBalance = new Decimal(sourceVirtualAccount.accountBalance || '0');
      const currentAvailable = new Decimal(sourceVirtualAccount.availableBalance || '0');
      const newBalance = currentBalance.minus(totalDeduction);
      const newAvailable = currentAvailable.minus(totalDeduction);

      await prisma.virtualAccount.update({
        where: { id: sourceVirtualAccountId },
        data: {
          accountBalance: newBalance.toString(),
          availableBalance: newAvailable.toString(),
        },
      });

      // Also update Wallet for transaction tracking
      await prisma.wallet.update({
        where: { id: transaction.walletId },
        data: {
          balance: newBalance.toNumber(),
          lockedBalance: wallet.lockedBalance, // Keep locked balance same
        },
      });
    } else {
      // For fiat, update Wallet
      const newBalance = new Decimal(wallet.balance).minus(totalDeduction);
      await prisma.wallet.update({
        where: { id: transaction.walletId },
        data: {
          balance: newBalance.toNumber(),
        },
      });
    }

    // Credit recipient wallet/VirtualAccount if it's a RhionX user transfer
    if (metadata?.recipientUserId) {
      try {
        const recipientUserId = typeof metadata.recipientUserId === 'string' 
          ? parseInt(metadata.recipientUserId, 10) 
          : metadata.recipientUserId;

        let recipientWallet;

        if (isCrypto) {
          const metaLedger = metadata?.ledgerCurrency as string | undefined;
          const creditCurrency = metaLedger || transaction.currency.toUpperCase();

          let recipientVirtualAccount = await prisma.virtualAccount.findFirst({
            where: {
              userId: recipientUserId,
              currency: creditCurrency,
              active: true,
            },
          });

          if (!recipientVirtualAccount && metadata?.isUnifiedStable) {
            recipientVirtualAccount =
              await this.unifiedStablecoinService.resolveVirtualAccountForCurrency(
                recipientUserId,
                creditCurrency,
                metadata?.blockchain as string | undefined
              );
          }

          if (!recipientVirtualAccount) {
            throw new Error(`Recipient crypto wallet for ${transaction.currency} not found`);
          }

          const recipientBalance = new Decimal(recipientVirtualAccount.accountBalance || '0');
          const recipientAvailable = new Decimal(recipientVirtualAccount.availableBalance || '0');
          const newRecipientBalance = recipientBalance.plus(amountDecimal);
          const newRecipientAvailable = recipientAvailable.plus(amountDecimal);

          await prisma.virtualAccount.update({
            where: { id: recipientVirtualAccount.id },
            data: {
              accountBalance: newRecipientBalance.toString(),
              availableBalance: newRecipientAvailable.toString(),
            },
          });

          // Get or create recipient Wallet for transaction tracking
          recipientWallet = await prisma.wallet.findFirst({
            where: {
              userId: recipientUserId,
              currency: transaction.currency.toUpperCase(),
              type: 'crypto',
            },
          });

          if (!recipientWallet) {
            recipientWallet = await prisma.wallet.create({
              data: {
                userId: recipientUserId,
                currency: transaction.currency.toUpperCase(),
                type: 'crypto',
                balance: newRecipientBalance.toNumber(),
                lockedBalance: new Decimal(0).toNumber(),
              },
            });
          } else {
            await prisma.wallet.update({
              where: { id: recipientWallet.id },
              data: {
                balance: newRecipientBalance.toNumber(),
              },
            });
          }
        } else {
          // For fiat, credit recipient's Wallet
          try {
            recipientWallet = await this.walletService.getWalletByCurrency(
              metadata.recipientUserId,
              transaction.currency
            );
          } catch (error) {
            recipientWallet = await this.walletService.createWallet(
              metadata.recipientUserId,
              transaction.currency,
              'fiat'
            );
          }

          // Credit recipient wallet
          const recipientBalance = new Decimal(recipientWallet.balance);
          const newRecipientBalance = recipientBalance.plus(amountDecimal);

          await prisma.wallet.update({
            where: { id: recipientWallet.id },
            data: {
              balance: newRecipientBalance.toNumber(),
            },
          });
        }

        // Create credit transaction for recipient
        const senderUser = updatedTransaction.wallet?.user;
        const senderName = senderUser
          ? `${senderUser.firstName || ''} ${senderUser.lastName || ''}`.trim()
          : 'RhionX User';
        const senderRhinoxPayId = senderUser
          ? senderUser.rhinoxPayId || (await ensureRhinoxPayId(senderUser.id))
          : undefined;

        await prisma.transaction.create({
          data: {
            walletId: recipientWallet.id,
            type: 'deposit',
            status: 'completed',
            amount: amountDecimal.toNumber(),
            currency: transaction.currency,
            fee: 0,
            reference: `${transaction.reference}-CREDIT`,
            channel: 'rhionx_user',
            paymentMethod: this.getPaymentMethodName('rhionx_user'),
            description: `Received ${transaction.amount} ${transaction.currency} from ${senderName}`,
            metadata: {
              senderUserId: parsedUserId,
              senderTransactionId: transaction.id,
              senderInfo: {
                userId: parsedUserId,
                name: senderName,
                email: senderUser?.email || null,
                rhinoxPayId: senderRhinoxPayId || null,
                phone: senderUser?.phone || null,
              },
              transferType: 'rhionx_user',
            },
            completedAt: now,
          },
        });
      } catch (error) {
        console.error('Failed to credit recipient wallet:', error);
        // Transaction is still marked as completed for sender
        // In production, you might want to handle this differently
      }
    }

    // Send success email
    // TODO: Add transfer success email

    const parsedSenderId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    const recipientInfo = metadata?.recipientInfo || {};
    const recipientLabel =
      recipientInfo?.accountName ||
      recipientInfo?.name ||
      recipientInfo?.email ||
      undefined;

    notifyTransferSent(parsedSenderId, {
      amount: updatedTransaction.amount.toString(),
      currency: updatedTransaction.currency,
      reference: updatedTransaction.reference,
      channel: updatedTransaction.channel ?? undefined,
      recipientLabel,
    });

    if (metadata?.recipientUserId) {
      const recipientUserId =
        typeof metadata.recipientUserId === 'string'
          ? parseInt(metadata.recipientUserId, 10)
          : metadata.recipientUserId;
      const senderName = updatedTransaction.wallet?.user
        ? `${updatedTransaction.wallet.user.firstName || ''} ${updatedTransaction.wallet.user.lastName || ''}`.trim()
        : undefined;
      notifyTransferReceived(recipientUserId, {
        amount: updatedTransaction.amount.toString(),
        currency: updatedTransaction.currency,
        reference: `${updatedTransaction.reference}-CREDIT`,
        senderLabel: senderName || undefined,
      });
    }

    return {
      id: updatedTransaction.id,
      reference: updatedTransaction.reference,
      amount: updatedTransaction.amount.toString(),
      currency: updatedTransaction.currency,
      fee: updatedTransaction.fee.toString(),
      status: updatedTransaction.status,
      channel: updatedTransaction.channel,
      paymentMethod: updatedTransaction.paymentMethod,
      country: updatedTransaction.country,
      recipientInfo,
      date: updatedTransaction.completedAt,
      createdAt: updatedTransaction.createdAt,
    };
  }

  /**
   * Get transfer receipt
   */
  async getTransferReceipt(userId: string, transactionId: string) {
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
      },
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    if (transaction.wallet.userId !== parsedUserId) {
      throw new Error('Unauthorized access to transaction');
    }

    if (transaction.type !== 'transfer' && transaction.type !== 'withdrawal') {
      throw new Error('Invalid transaction type');
    }

    let receiptTransaction = transaction;
    let metadata = receiptTransaction.metadata as any;

    if (
      receiptTransaction.type === 'withdrawal' &&
      receiptTransaction.channel === 'bank_account' &&
      ['pending', 'processing'].includes(receiptTransaction.status) &&
      metadata?.palmpayOrderId
    ) {
      try {
        const payoutStatus = await this.palmPayPayoutService.queryPayoutStatus(metadata.palmpayOrderId);
        const mappedStatus = mapPalmPayStatus(payoutStatus.orderStatus);
        receiptTransaction = await prisma.transaction.update({
          where: { id: receiptTransaction.id },
          data: {
            status: mappedStatus === 'completed' ? 'completed' : mappedStatus,
            completedAt: mappedStatus === 'completed' ? new Date() : receiptTransaction.completedAt,
            metadata: {
              ...metadata,
              palmpayOrderNo: payoutStatus.orderNo,
              palmpayStatus: payoutStatus.orderStatus,
              palmpaySessionId: payoutStatus.sessionId,
              payoutStatusResponse: payoutStatus,
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
        metadata = receiptTransaction.metadata as any;
      } catch (error) {
        console.error('Failed to refresh PalmPay payout status:', error);
      }
    }

    const totalAmount = new Decimal(receiptTransaction.amount).plus(new Decimal(receiptTransaction.fee));

    return {
      id: receiptTransaction.id,
      reference: receiptTransaction.reference,
      type: receiptTransaction.type,
      status: receiptTransaction.status,
      amount: receiptTransaction.amount.toString(),
      currency: receiptTransaction.currency,
      fee: receiptTransaction.fee.toString(),
      totalAmount: totalAmount.toString(),
      country: receiptTransaction.country,
      channel: receiptTransaction.channel,
      paymentMethod: receiptTransaction.paymentMethod,
      recipientInfo: {
        ...(metadata?.recipientInfo || {}),
        rhinoxPayId:
          metadata?.recipientRhinoxPayId ||
          metadata?.recipientInfo?.rhinoxPayId ||
          null,
        email: metadata?.recipientInfo?.email || metadata?.recipientEmail || null,
        phone: metadata?.recipientInfo?.phone || metadata?.phoneNumber || null,
        bankName: metadata?.bankName || metadata?.recipientInfo?.bankName,
        accountNumber: metadata?.accountNumber || metadata?.recipientInfo?.accountNumber,
        accountName: metadata?.accountName || metadata?.recipientInfo?.accountName,
        name: metadata?.recipientInfo?.name || metadata?.accountName || metadata?.recipientInfo?.accountName,
      },
      metadata,
      provider: metadata?.provider,
      orderId: metadata?.palmpayOrderId,
      orderNo: metadata?.palmpayOrderNo,
      description: receiptTransaction.description,
      transactionId: receiptTransaction.id,
      date: receiptTransaction.completedAt || receiptTransaction.createdAt,
      createdAt: receiptTransaction.createdAt,
    };
  }

  /**
   * Get payment method name
   */
  private getPaymentMethodName(channel: string): string {
    const methods: { [key: string]: string } = {
      rhionx_user: 'RhionX User Transfer',
      bank_account: 'Bank Transfer',
      mobile_money: 'Mobile Money',
    };
    return methods[channel] || 'Transfer';
  }

  /**
   * Get transfer description
   */
  private getTransferDescription(
    channel: string,
    recipientInfo: any,
    amount: string,
    currency: string
  ): string {
    if (channel === 'rhionx_user') {
      return `Transfer ${amount} ${currency} to ${recipientInfo.name || 'RhionX User'}`;
    } else if (channel === 'bank_account') {
      return `Transfer ${amount} ${currency} to ${recipientInfo.accountName || 'Bank Account'}`;
    } else if (channel === 'mobile_money') {
      return `Transfer ${amount} ${currency} via ${recipientInfo.provider || 'Mobile Money'}`;
    }
    return `Transfer ${amount} ${currency}`;
  }

  /**
   * Generate unique reference number
   */
  private generateReference(): string {
    const timestamp = Date.now().toString(36);
    const random = randomBytes(4).toString('hex');
    return `TRF${timestamp}${random}`.toUpperCase();
  }
}

