import prisma from '../../core/config/database.js';
import { encryptPrivateKey, decryptPrivateKey } from '../../core/utils/encryption.js';
import { PalmPayPayoutService } from '../../services/palmpay/palmpay.payout.service.js';
import { createProviderUnavailableError } from '../../services/palmpay/palmpay.utils.js';

/**
 * Payment Settings Service
 * Manages user payment methods (bank accounts, mobile money)
 */
export class PaymentSettingsService {
  private palmPayPayoutService = new PalmPayPayoutService();

  /**
   * Get all payment methods for a user
   */
  async getUserPaymentMethods(userId: string, type?: 'bank_account' | 'mobile_money' | 'rhinoxpay_id') {
    // Parse userId to integer
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }

    const where: any = {
      userId: parsedUserId,
      isActive: true,
    };

    if (type) {
      where.type = type;
    }

    const paymentMethods = await prisma.userPaymentMethod.findMany({
      where,
      include: {
        provider: {
          select: {
            id: true,
            name: true,
            code: true,
            logoUrl: true,
          },
        },
      },
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    // Decrypt account numbers
    return paymentMethods.map((method: any) => ({
      id: method.id,
      type: method.type,
      accountType: method.accountType,
      bankName: method.bankName,
      bankCode: method.bankCode,
      accountNumber: method.accountNumber ? this.maskAccountNumber(decryptPrivateKey(method.accountNumber)) : null,
      accountName: method.accountName,
      provider: method.provider,
      phoneNumber: method.phoneNumber ? this.maskPhoneNumber(method.phoneNumber) : null,
      countryCode: method.countryCode,
      currency: method.currency,
      isDefault: method.isDefault,
      isActive: method.isActive,
      createdAt: method.createdAt,
      updatedAt: method.updatedAt,
    }));
  }

  /**
   * Get a single payment method by ID
   */
  async getPaymentMethod(userId: string, paymentMethodId: string) {
    // Parse IDs to integers
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    const parsedPaymentMethodId = typeof paymentMethodId === 'string' ? parseInt(paymentMethodId, 10) : paymentMethodId;
    
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }
    if (isNaN(parsedPaymentMethodId) || parsedPaymentMethodId <= 0) {
      throw new Error('Invalid payment method ID format');
    }

    const paymentMethod = await prisma.userPaymentMethod.findFirst({
      where: {
        id: parsedPaymentMethodId,
        userId: parsedUserId,
        isActive: true,
      },
      include: {
        provider: {
          select: {
            id: true,
            name: true,
            code: true,
            logoUrl: true,
          },
        },
      },
    });

    if (!paymentMethod) {
      throw new Error('Payment method not found');
    }

    return {
      id: paymentMethod.id,
      type: paymentMethod.type,
      accountType: paymentMethod.accountType,
      bankName: paymentMethod.bankName,
      bankCode: paymentMethod.bankCode,
      accountNumber: paymentMethod.accountNumber ? this.maskAccountNumber(decryptPrivateKey(paymentMethod.accountNumber)) : null,
      accountName: paymentMethod.accountName,
      provider: paymentMethod.provider,
      phoneNumber: paymentMethod.phoneNumber ? this.maskPhoneNumber(paymentMethod.phoneNumber) : null,
      countryCode: paymentMethod.countryCode,
      currency: paymentMethod.currency,
      isDefault: paymentMethod.isDefault,
      isActive: paymentMethod.isActive,
      createdAt: paymentMethod.createdAt,
      updatedAt: paymentMethod.updatedAt,
    };
  }

  /**
   * Add a new bank account payment method
   */
  async addBankAccount(
    userId: string,
    data: {
      accountType: string;
      bankName: string;
      accountNumber: string;
      bankCode: string;
      accountName: string;
      countryCode: string;
      currency: string;
      isDefault?: boolean;
    }
  ) {
    // Parse userId to integer
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }

    // Validate account number
    if (!data.accountNumber || data.accountNumber.length < 8) {
      throw new Error('Invalid account number');
    }
    if (data.countryCode !== 'NG' || data.currency !== 'NGN') {
      throw new Error('Only Nigerian NGN bank accounts are currently supported');
    }
    if (!data.bankCode) {
      throw new Error('Bank code is required');
    }

    let palmPayBanks;
    try {
      palmPayBanks = await this.palmPayPayoutService.getBanks();
    } catch (error: any) {
      throw createProviderUnavailableError(error.message || 'Bank list is unavailable');
    }

    const bank = palmPayBanks.find((item) => item.bankCode === data.bankCode);
    if (!bank) {
      throw new Error('Selected bank is not available');
    }

    let verifiedAccount;
    try {
      verifiedAccount = await this.palmPayPayoutService.verifyBankAccount(data.bankCode, data.accountNumber);
    } catch (error: any) {
      throw createProviderUnavailableError(error.message || 'Bank account verification is unavailable');
    }
    if (!verifiedAccount.isValid || !verifiedAccount.accountName) {
      throw new Error(verifiedAccount.errorMessage || 'Could not verify this bank account');
    }

    // Encrypt account number
    const encryptedAccountNumber = encryptPrivateKey(data.accountNumber);

    // If this is set as default, unset other defaults for the same type
    if (data.isDefault) {
      await prisma.userPaymentMethod.updateMany({
        where: {
          userId: parsedUserId,
          type: 'bank_account',
          isDefault: true,
        },
        data: {
          isDefault: false,
        },
      });
    }

    // Create payment method
    const paymentMethod = await prisma.userPaymentMethod.create({
      data: {
        userId: parsedUserId,
        type: 'bank_account',
        accountType: data.accountType,
        bankName: bank.bankName,
        bankCode: data.bankCode,
        accountNumber: encryptedAccountNumber,
        accountName: verifiedAccount.accountName,
        countryCode: data.countryCode,
        currency: data.currency,
        isDefault: data.isDefault || false,
      },
    });

    return {
      id: paymentMethod.id,
      type: paymentMethod.type,
      accountType: paymentMethod.accountType,
      bankName: paymentMethod.bankName,
      bankCode: paymentMethod.bankCode,
      accountNumber: this.maskAccountNumber(data.accountNumber),
      accountName: paymentMethod.accountName,
      countryCode: paymentMethod.countryCode,
      currency: paymentMethod.currency,
      isDefault: paymentMethod.isDefault,
      message: 'Bank account added successfully',
    };
  }

  /**
   * Add a new mobile money payment method
   */
  async addMobileMoney(
    userId: string,
    data: {
      providerId: string;
      phoneNumber: string;
      countryCode: string;
      currency: string;
      isDefault?: boolean;
    }
  ) {
    // Parse userId to integer
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }

    // Parse providerId to integer
    const parsedProviderId = typeof data.providerId === 'string' ? parseInt(data.providerId, 10) : data.providerId;
    if (isNaN(parsedProviderId) || parsedProviderId <= 0) {
      throw new Error('Invalid provider ID format');
    }

    // Validate provider
    const provider = await prisma.mobileMoneyProvider.findUnique({
      where: { id: parsedProviderId },
    });

    if (!provider || !provider.isActive) {
      throw new Error('Invalid or inactive mobile money provider');
    }

    // Validate phone number format (basic)
    if (!data.phoneNumber || data.phoneNumber.length < 10) {
      throw new Error('Invalid phone number');
    }

    // Check if this phone number already exists for this user
    const existing = await prisma.userPaymentMethod.findFirst({
      where: {
        userId: parsedUserId,
        type: 'mobile_money',
        phoneNumber: data.phoneNumber,
        providerId: parsedProviderId,
        isActive: true,
      },
    });

    if (existing) {
      throw new Error('This mobile money account is already added');
    }

    // If this is set as default, unset other defaults for the same type
    if (data.isDefault) {
      await prisma.userPaymentMethod.updateMany({
        where: {
          userId: parsedUserId,
          type: 'mobile_money',
          isDefault: true,
        },
        data: {
          isDefault: false,
        },
      });
    }

    // Create payment method
    const paymentMethod = await prisma.userPaymentMethod.create({
      data: {
        userId: parsedUserId,
        type: 'mobile_money',
        providerId: parsedProviderId,
        phoneNumber: data.phoneNumber,
        countryCode: data.countryCode,
        currency: data.currency,
        isDefault: data.isDefault || false,
      },
      include: {
        provider: {
          select: {
            id: true,
            name: true,
            code: true,
            logoUrl: true,
          },
        },
      },
    });

    return {
      id: paymentMethod.id,
      type: paymentMethod.type,
      provider: paymentMethod.provider,
      phoneNumber: this.maskPhoneNumber(paymentMethod.phoneNumber!),
      countryCode: paymentMethod.countryCode,
      currency: paymentMethod.currency,
      isDefault: paymentMethod.isDefault,
      message: 'Mobile money account added successfully',
    };
  }

  /**
   * Add Rhinox Pay ID as a payment method
   * Rhinox Pay ID allows users to receive payments directly to their Rhinox Pay wallet
   */
  async addRhinoxPayID(
    userId: string,
    data: {
      countryCode: string;
      currency: string;
      isDefault?: boolean;
    }
  ) {
    // Parse userId to integer
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }

    // Check if user already has a Rhinox Pay ID payment method for this currency
    const existing = await prisma.userPaymentMethod.findFirst({
      where: {
        userId: parsedUserId,
        type: 'rhinoxpay_id',
        countryCode: data.countryCode,
        currency: data.currency,
        isActive: true,
      },
    });

    if (existing) {
      throw new Error('Rhinox Pay ID payment method already exists for this currency');
    }

    // Get user email for display
    const user = await prisma.user.findUnique({
      where: { id: parsedUserId },
      select: { email: true, firstName: true, lastName: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // If this is set as default, unset other defaults for the same type
    if (data.isDefault) {
      await prisma.userPaymentMethod.updateMany({
        where: {
          userId: parsedUserId,
          type: 'rhinoxpay_id',
          isDefault: true,
        },
        data: {
          isDefault: false,
        },
      });
    }

    // Create payment method
    const paymentMethod = await prisma.userPaymentMethod.create({
      data: {
        userId: parsedUserId,
        type: 'rhinoxpay_id',
        accountName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
        countryCode: data.countryCode,
        currency: data.currency,
        isDefault: data.isDefault || false,
      },
    });

    return {
      id: paymentMethod.id,
      type: paymentMethod.type,
      accountName: paymentMethod.accountName,
      countryCode: paymentMethod.countryCode,
      currency: paymentMethod.currency,
      isDefault: paymentMethod.isDefault,
      message: 'Rhinox Pay ID added successfully',
    };
  }

  /**
   * Update a payment method
   */
  async updatePaymentMethod(
    userId: string,
    paymentMethodId: string,
    data: {
      accountType?: string;
      bankName?: string;
      accountNumber?: string;
      accountName?: string;
      phoneNumber?: string;
      isDefault?: boolean;
    }
  ) {
    // Parse IDs to integers
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    const parsedPaymentMethodId = typeof paymentMethodId === 'string' ? parseInt(paymentMethodId, 10) : paymentMethodId;
    
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }
    if (isNaN(parsedPaymentMethodId) || parsedPaymentMethodId <= 0) {
      throw new Error('Invalid payment method ID format');
    }

    const paymentMethod = await prisma.userPaymentMethod.findFirst({
      where: {
        id: parsedPaymentMethodId,
        userId: parsedUserId,
        isActive: true,
      },
    });

    if (!paymentMethod) {
      throw new Error('Payment method not found');
    }

    const updateData: any = {};

    if (data.accountType !== undefined) updateData.accountType = data.accountType;
    if (data.bankName !== undefined || data.accountName !== undefined || data.accountNumber !== undefined) {
      if (paymentMethod.type === 'bank_account') {
        throw new Error('Create a new verified bank account to change bank details');
      }
    }
    if (data.bankName !== undefined) updateData.bankName = data.bankName;
    if (data.accountName !== undefined) updateData.accountName = data.accountName;
    if (data.phoneNumber !== undefined) updateData.phoneNumber = data.phoneNumber;

    // Handle account number encryption
    if (data.accountNumber !== undefined) {
      if (data.accountNumber.length < 8) {
        throw new Error('Invalid account number');
      }
      updateData.accountNumber = encryptPrivateKey(data.accountNumber);
    }

    // Handle default flag
    if (data.isDefault === true) {
      // Unset other defaults for the same type
      await prisma.userPaymentMethod.updateMany({
        where: {
          userId: parsedUserId,
          type: paymentMethod.type,
          id: { not: parsedPaymentMethodId },
          isDefault: true,
        },
        data: {
          isDefault: false,
        },
      });
      updateData.isDefault = true;
    } else if (data.isDefault === false) {
      updateData.isDefault = false;
    }

    const updated = await prisma.userPaymentMethod.update({
      where: { id: parsedPaymentMethodId },
      data: updateData,
      include: {
        provider: {
          select: {
            id: true,
            name: true,
            code: true,
            logoUrl: true,
          },
        },
      },
    });

    return {
      id: updated.id,
      type: updated.type,
      accountType: updated.accountType,
      bankName: updated.bankName,
      bankCode: updated.bankCode,
      accountNumber: updated.accountNumber ? this.maskAccountNumber(decryptPrivateKey(updated.accountNumber)) : null,
      accountName: updated.accountName,
      provider: updated.provider,
      phoneNumber: updated.phoneNumber ? this.maskPhoneNumber(updated.phoneNumber) : null,
      countryCode: updated.countryCode,
      currency: updated.currency,
      isDefault: updated.isDefault,
      message: 'Payment method updated successfully',
    };
  }

  /**
   * Set a payment method as default
   */
  async setDefaultPaymentMethod(userId: string, paymentMethodId: string) {
    // Parse IDs to integers
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    const parsedPaymentMethodId = typeof paymentMethodId === 'string' ? parseInt(paymentMethodId, 10) : paymentMethodId;
    
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }
    if (isNaN(parsedPaymentMethodId) || parsedPaymentMethodId <= 0) {
      throw new Error('Invalid payment method ID format');
    }

    const paymentMethod = await prisma.userPaymentMethod.findFirst({
      where: {
        id: parsedPaymentMethodId,
        userId: parsedUserId,
        isActive: true,
      },
    });

    if (!paymentMethod) {
      throw new Error('Payment method not found');
    }

    // Unset other defaults for the same type
    await prisma.userPaymentMethod.updateMany({
      where: {
        userId: parsedUserId,
        type: paymentMethod.type,
        id: { not: parsedPaymentMethodId },
        isDefault: true,
      },
      data: {
        isDefault: false,
      },
    });

    // Set this as default
    const updated = await prisma.userPaymentMethod.update({
      where: { id: parsedPaymentMethodId },
      data: { isDefault: true },
    });

    return {
      id: updated.id,
      isDefault: updated.isDefault,
      message: 'Default payment method updated successfully',
    };
  }

  /**
   * Delete (soft delete) a payment method
   */
  async deletePaymentMethod(userId: string, paymentMethodId: string) {
    // Parse IDs to integers
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    const parsedPaymentMethodId = typeof paymentMethodId === 'string' ? parseInt(paymentMethodId, 10) : paymentMethodId;
    
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }
    if (isNaN(parsedPaymentMethodId) || parsedPaymentMethodId <= 0) {
      throw new Error('Invalid payment method ID format');
    }

    const paymentMethod = await prisma.userPaymentMethod.findFirst({
      where: {
        id: parsedPaymentMethodId,
        userId: parsedUserId,
        isActive: true,
      },
    });

    if (!paymentMethod) {
      throw new Error('Payment method not found');
    }

    // Soft delete
    await prisma.userPaymentMethod.update({
      where: { id: parsedPaymentMethodId },
      data: { isActive: false },
    });

    return {
      message: 'Payment method deleted successfully',
    };
  }

  /**
   * Get available mobile money providers for a country/currency
   */
  async getMobileMoneyProviders(countryCode?: string, currency?: string) {
    const where: any = {
      isActive: true,
    };

    if (countryCode) {
      where.countryCode = countryCode;
    }

    if (currency) {
      where.currency = currency;
    }

    if ((!countryCode || countryCode === 'NG') && (!currency || currency === 'NGN')) {
      return [];
    }

    throw new Error('Mobile money providers are currently unavailable');
  }

  /**
   * Get available PalmPay banks for Nigerian NGN withdrawals
   */
  async getBanks(countryCode?: string, currency?: string) {
    if ((countryCode && countryCode !== 'NG') || (currency && currency !== 'NGN')) {
      throw new Error('Only NGN withdrawals to Nigerian banks are currently supported');
    }

    try {
      const banks = await this.palmPayPayoutService.getBanks();
      return banks.map((bank) => ({
        name: bank.bankName,
        bankName: bank.bankName,
        bankCode: bank.bankCode,
        code: bank.bankCode,
        logoUrl: bank.bankUrl,
        countryCode: 'NG',
        currency: 'NGN',
      }));
    } catch (error: any) {
      throw createProviderUnavailableError(error.message || 'Bank list is unavailable');
    }
  }

  /**
   * Mask account number (show only last 4 digits)
   */
  private maskAccountNumber(accountNumber: string): string {
    if (accountNumber.length <= 4) {
      return accountNumber;
    }
    return '****' + accountNumber.slice(-4);
  }

  /**
   * Mask phone number (show only last 4 digits)
   */
  private maskPhoneNumber(phoneNumber: string): string {
    if (phoneNumber.length <= 4) {
      return phoneNumber;
    }
    return '****' + phoneNumber.slice(-4);
  }
}

