import prisma from '../../core/config/database.js';
import { encryptPrivateKey, decryptPrivateKey } from '../../core/utils/encryption.js';

/**
 * Payment Settings Service
 * Manages user payment methods (bank accounts, mobile money)
 */
export class PaymentSettingsService {
  /**
   * Get all payment methods for a user
   */
  async getUserPaymentMethods(userId: string, type?: 'bank_account' | 'mobile_money') {
    const where: any = {
      userId,
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
    return paymentMethods.map(method => ({
      id: method.id,
      type: method.type,
      accountType: method.accountType,
      bankName: method.bankName,
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
    const paymentMethod = await prisma.userPaymentMethod.findFirst({
      where: {
        id: paymentMethodId,
        userId,
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
      accountName: string;
      countryCode: string;
      currency: string;
      isDefault?: boolean;
    }
  ) {
    // Validate account number
    if (!data.accountNumber || data.accountNumber.length < 8) {
      throw new Error('Invalid account number');
    }

    // Encrypt account number
    const encryptedAccountNumber = encryptPrivateKey(data.accountNumber);

    // If this is set as default, unset other defaults for the same type
    if (data.isDefault) {
      await prisma.userPaymentMethod.updateMany({
        where: {
          userId,
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
        userId,
        type: 'bank_account',
        accountType: data.accountType,
        bankName: data.bankName,
        accountNumber: encryptedAccountNumber,
        accountName: data.accountName,
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
    // Validate provider
    const provider = await prisma.mobileMoneyProvider.findUnique({
      where: { id: data.providerId },
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
        userId,
        type: 'mobile_money',
        phoneNumber: data.phoneNumber,
        providerId: data.providerId,
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
          userId,
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
        userId,
        type: 'mobile_money',
        providerId: data.providerId,
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
    const paymentMethod = await prisma.userPaymentMethod.findFirst({
      where: {
        id: paymentMethodId,
        userId,
        isActive: true,
      },
    });

    if (!paymentMethod) {
      throw new Error('Payment method not found');
    }

    const updateData: any = {};

    if (data.accountType !== undefined) updateData.accountType = data.accountType;
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
          userId,
          type: paymentMethod.type,
          id: { not: paymentMethodId },
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
      where: { id: paymentMethodId },
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
    const paymentMethod = await prisma.userPaymentMethod.findFirst({
      where: {
        id: paymentMethodId,
        userId,
        isActive: true,
      },
    });

    if (!paymentMethod) {
      throw new Error('Payment method not found');
    }

    // Unset other defaults for the same type
    await prisma.userPaymentMethod.updateMany({
      where: {
        userId,
        type: paymentMethod.type,
        id: { not: paymentMethodId },
        isDefault: true,
      },
      data: {
        isDefault: false,
      },
    });

    // Set this as default
    const updated = await prisma.userPaymentMethod.update({
      where: { id: paymentMethodId },
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
    const paymentMethod = await prisma.userPaymentMethod.findFirst({
      where: {
        id: paymentMethodId,
        userId,
        isActive: true,
      },
    });

    if (!paymentMethod) {
      throw new Error('Payment method not found');
    }

    // Soft delete
    await prisma.userPaymentMethod.update({
      where: { id: paymentMethodId },
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

    const providers = await prisma.mobileMoneyProvider.findMany({
      where,
      orderBy: [
        { name: 'asc' },
      ],
    });

    return providers.map(provider => ({
      id: provider.id,
      name: provider.name,
      code: provider.code,
      countryCode: provider.countryCode,
      currency: provider.currency,
      logoUrl: provider.logoUrl,
    }));
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

