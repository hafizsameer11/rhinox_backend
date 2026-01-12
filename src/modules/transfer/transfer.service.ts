import { randomBytes } from 'crypto';
import { Decimal, type Decimal as DecimalType } from 'decimal.js';
import bcrypt from 'bcryptjs';
import prisma from '../../core/config/database.js';
import { WalletService } from '../wallet/wallet.service.js';
import { KYCService } from '../kyc/kyc.service.js';
import { generateOTP, sendOTPEmail } from '../../core/utils/email.service.js';
import { PaymentSettingsService } from '../payment-settings/payment-settings.service.js';
import { decryptPrivateKey } from '../../core/utils/encryption.js';

/**
 * Transfer Service
 * Handles fiat transfers (RhionX user, bank account, mobile money)
 */
export class TransferService {
  private walletService: WalletService;
  private kycService: KYCService;
  private paymentSettingsService: PaymentSettingsService;

  constructor() {
    this.walletService = new WalletService();
    this.kycService = new KYCService();
    this.paymentSettingsService = new PaymentSettingsService();
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
    // Try to find user by email first (from QR scan), then by userId
    let user = await prisma.user.findUnique({
      where: { email: recipientIdentifier },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        isActive: true,
      },
    });

    // If not found by email, try by userId (parse to integer)
    if (!user) {
      const userId = typeof recipientIdentifier === 'string' ? parseInt(recipientIdentifier, 10) : recipientIdentifier;
      if (!isNaN(userId) && userId > 0) {
        user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            email: true,
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

    return {
      userId: user.id,
      email: user.email,
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'RhionX User',
      phone: user.phone,
    };
  }

  /**
   * Validate bank account (basic validation - in production, integrate with bank API)
   */
  async validateBankAccount(accountNumber: string, bankName: string, countryCode: string) {
    // In production, this would call a bank API to validate account
    // For now, we'll do basic validation
    
    if (!accountNumber || accountNumber.length < 8) {
      throw new Error('Invalid account number');
    }

    if (!bankName) {
      throw new Error('Bank name is required');
    }

    // Return mock account name (in production, get from bank API)
    return {
      accountNumber,
      bankName,
      accountName: 'Account Holder Name', // Would come from bank API
      countryCode,
      isValid: true,
    };
  }

  /**
   * Calculate transfer fee
   */
  private calculateTransferFee(amount: DecimalType, currency: string, channel: string): DecimalType {
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
      recipientEmail?: string; // For RhionX user transfers (from QR scan)
      paymentMethodId?: number; // For bank_account withdrawals - ID from payment settings
      accountNumber?: string; // For bank account transfers (legacy - use paymentMethodId instead)
      bankName?: string; // For bank account transfers (legacy - use paymentMethodId instead)
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

    // Check if currency is crypto by checking WalletCurrency table
    const walletCurrency = await prisma.walletCurrency.findFirst({
      where: {
        currency: data.currency.toUpperCase(),
      },
    });

    const isCrypto = !!walletCurrency;
    let sourceWallet;
    let sourceVirtualAccount = null;
    let availableBalance: Decimal;

    if (isCrypto) {
      // For crypto, use VirtualAccount
      sourceVirtualAccount = await prisma.virtualAccount.findFirst({
        where: {
          userId: parsedUserId,
          currency: data.currency.toUpperCase(),
          active: true,
        },
      });

      if (!sourceVirtualAccount) {
        throw new Error(`Source crypto wallet for ${data.currency} not found. Please initialize your crypto wallets.`);
      }

      // Check available balance from VirtualAccount
      const accountBalance = new Decimal(sourceVirtualAccount.accountBalance || '0');
      const lockedAmount = new Decimal(sourceVirtualAccount.accountBalance || '0').minus(new Decimal(sourceVirtualAccount.availableBalance || '0'));
      availableBalance = new Decimal(sourceVirtualAccount.availableBalance || '0');

      // Get or create Wallet with type='crypto' for transaction tracking
      sourceWallet = await prisma.wallet.findFirst({
        where: {
          userId: parsedUserId,
          currency: data.currency.toUpperCase(),
          type: 'crypto',
        },
      });

      if (!sourceWallet) {
        sourceWallet = await prisma.wallet.create({
          data: {
            userId: parsedUserId,
            currency: data.currency.toUpperCase(),
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
      // Accept either email (from QR scan) or userId
      const recipientIdentifier = data.recipientEmail || data.recipientUserId;
      if (!recipientIdentifier) {
        throw new Error('Recipient email or user ID is required for RhionX user transfers');
      }
      recipientInfo = await this.validateRhionXUser(recipientIdentifier);
      
      // Prevent self-transfer
      if (recipientInfo.userId === userId) {
        throw new Error('You cannot transfer funds to yourself');
      }
    } else if (data.channel === 'bank_account') {
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
        const decryptedAccountNumber = decryptPrivateKey(fullPaymentMethod.accountNumber);
        recipientInfo = {
          accountNumber: decryptedAccountNumber,
          bankName: paymentMethod.bankName || '',
          accountName: paymentMethod.accountName || '',
          countryCode: paymentMethod.countryCode,
          paymentMethodId: data.paymentMethodId,
        };
      } else if (data.accountNumber && data.bankName) {
        // Legacy support - direct account number and bank name
        recipientInfo = await this.validateBankAccount(data.accountNumber, data.bankName, data.countryCode);
      } else {
        throw new Error('Payment method ID is required for bank account withdrawals. Use payment method from payment settings.');
      }
    } else if (data.channel === 'mobile_money') {
      if (!data.providerId || !data.phoneNumber) {
        throw new Error('Provider ID and phone number are required for mobile money transfers');
      }
      // Validate provider (parse ID to integer)
      const providerId = typeof data.providerId === 'string' ? parseInt(data.providerId, 10) : data.providerId;
      if (isNaN(providerId) || providerId <= 0) {
        throw new Error('Invalid provider ID format');
      }
      const provider = await prisma.mobileMoneyProvider.findUnique({
        where: { id: providerId },
      });
      if (!provider || !provider.isActive) {
        throw new Error('Invalid or inactive mobile money provider');
      }
      recipientInfo = {
        phoneNumber: data.phoneNumber,
        provider: provider.name,
        providerCode: provider.code,
      };
    }

    // Generate unique reference
    const reference = this.generateReference();

    // Determine transaction type: 'withdrawal' for bank_account, 'transfer' for others
    const transactionType = data.channel === 'bank_account' ? 'withdrawal' : 'transfer';

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
          recipientEmail: data.recipientEmail, // Store original email if provided
          paymentMethodId: recipientInfo.paymentMethodId || data.paymentMethodId, // For bank withdrawals
          accountNumber: recipientInfo.accountNumber || data.accountNumber, // For bank transfers
          bankName: recipientInfo.bankName || data.bankName, // For bank transfers
          accountName: recipientInfo.accountName, // For bank transfers (from validation/payment method)
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

    // Send email OTP for verification
    if (transaction.wallet.user.email) {
      const otpCode = generateOTP();
      // Store OTP in database
      await prisma.oTP.create({
        data: {
          userId: parsedUserId,
          code: otpCode,
          type: 'email',
          expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
        },
      });
      await sendOTPEmail(transaction.wallet.user.email, otpCode, 'email');
    }

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
   * Verify transfer with email code and PIN
   */
  async verifyTransfer(
    userId: string,
    transactionId: string,
    emailCode: string,
    pin: string
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

    // Verify email OTP
    const otp = await prisma.oTP.findFirst({
      where: {
        userId: parsedUserId,
        type: 'email',
        code: emailCode,
        isUsed: false,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!otp) {
      throw new Error('Invalid or expired email verification code');
    }

    // Mark OTP as used
    await prisma.oTP.update({
      where: { id: otp.id },
      data: { isUsed: true },
    });

    // Verify PIN
    if (!transaction.wallet.user.pinHash) {
      throw new Error('PIN not set');
    }

    const isValidPin = await bcrypt.compare(pin, transaction.wallet.user.pinHash);
    if (!isValidPin) {
      throw new Error('Invalid PIN');
    }

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

    let availableBalance: Decimal;
    let sourceVirtualAccount = null;

    if (isCrypto && sourceVirtualAccountId) {
      // For crypto, check VirtualAccount balance
      sourceVirtualAccount = await prisma.virtualAccount.findUnique({
        where: { id: sourceVirtualAccountId },
      });

      if (!sourceVirtualAccount) {
        throw new Error('Source crypto wallet not found');
      }

      availableBalance = new Decimal(sourceVirtualAccount.availableBalance || '0');
    } else {
      // For fiat, check Wallet balance
      availableBalance = new Decimal(wallet.balance).minus(new Decimal(wallet.lockedBalance));
    }

    const amountDecimal = new Decimal(transaction.amount);
    const fee = new Decimal(transaction.fee);
    const totalDeduction = amountDecimal.plus(fee);

    if (totalDeduction.greaterThan(availableBalance)) {
      throw new Error('Insufficient balance');
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
          // For crypto, credit recipient's VirtualAccount
          let recipientVirtualAccount = await prisma.virtualAccount.findFirst({
            where: {
              userId: recipientUserId,
              currency: transaction.currency.toUpperCase(),
              active: true,
            },
          });

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
            description: `Received ${transaction.amount} ${transaction.currency} from ${transaction.wallet?.user?.firstName || 'User'}`,
            metadata: {
              senderUserId: userId,
              senderTransactionId: transaction.id,
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

    return {
      id: updatedTransaction.id,
      reference: updatedTransaction.reference,
      amount: updatedTransaction.amount.toString(),
      currency: updatedTransaction.currency,
      fee: updatedTransaction.fee.toString(),
      status: updatedTransaction.status,
      channel: updatedTransaction.channel,
      recipientInfo: metadata?.recipientInfo || {},
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

    const metadata = transaction.metadata as any;
    const totalAmount = new Decimal(transaction.amount).plus(new Decimal(transaction.fee));

    return {
      id: transaction.id,
      reference: transaction.reference,
      type: transaction.type,
      status: transaction.status,
      amount: transaction.amount.toString(),
      currency: transaction.currency,
      fee: transaction.fee.toString(),
      totalAmount: totalAmount.toString(),
      country: transaction.country,
      channel: transaction.channel,
      paymentMethod: transaction.paymentMethod,
      recipientInfo: metadata?.recipientInfo || {},
      description: transaction.description,
      transactionId: transaction.id,
      date: transaction.completedAt || transaction.createdAt,
      createdAt: transaction.createdAt,
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

