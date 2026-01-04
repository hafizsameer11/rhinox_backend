import Decimal from 'decimal.js';
import { randomBytes } from 'crypto';
import prisma from '../../core/config/database.js';
import { WalletService } from '../wallet/wallet.service.js';
import bcrypt from 'bcryptjs';

/**
 * Bill Payment Service
 * Handles bill payments (airtime, data, electricity, cable TV, betting, internet)
 */
export class BillPaymentService {
  private walletService: WalletService;

  constructor() {
    this.walletService = new WalletService();
  }

  /**
   * Generate unique reference number
   */
  private generateReference(): string {
    const timestamp = Date.now().toString(36);
    const random = randomBytes(4).toString('hex');
    return `BILL${timestamp}${random}`.toUpperCase();
  }

  /**
   * Calculate bill payment fee
   */
  private calculateFee(amount: number, currency: string): number {
    // Simple fee calculation - 1% or minimum fee
    const feePercent = 0.01;
    const calculatedFee = amount * feePercent;
    
    // Minimum fees by currency
    const minFees: { [key: string]: number } = {
      NGN: 20,
      USD: 0.1,
      KES: 2,
      GHS: 0.5,
    };

    const minFee = minFees[currency] || 0.1;
    return Math.max(calculatedFee, minFee);
  }

  /**
   * Get all bill payment categories
   */
  async getCategories() {
    const categories = await prisma.billPaymentCategory.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    return categories.map((cat) => ({
      id: cat.id,
      code: cat.code,
      name: cat.name,
      description: cat.description,
    }));
  }

  /**
   * Get providers by category
   */
  async getProvidersByCategory(categoryCode: string, countryCode?: string) {
    const category = await prisma.billPaymentCategory.findUnique({
      where: { code: categoryCode },
    });

    if (!category) {
      throw new Error('Category not found');
    }

    const where: any = {
      categoryId: category.id,
      isActive: true,
    };

    if (countryCode) {
      where.countryCode = countryCode;
    }

    const providers = await prisma.billPaymentProvider.findMany({
      where,
      include: {
        category: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    return providers.map((provider) => ({
      id: provider.id,
      code: provider.code,
      name: provider.name,
      logoUrl: provider.logoUrl,
      countryCode: provider.countryCode,
      currency: provider.currency,
      category: provider.category,
      metadata: provider.metadata,
    }));
  }

  /**
   * Get plans/bundles by provider
   */
  async getPlansByProvider(providerId: number) {
    const provider = await prisma.billPaymentProvider.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new Error('Provider not found');
    }

    const plans = await prisma.billPaymentPlan.findMany({
      where: {
        providerId,
        isActive: true,
      },
      orderBy: {
        amount: 'asc',
      },
    });

    return plans.map((plan) => ({
      id: plan.id,
      code: plan.code,
      name: plan.name,
      amount: plan.amount.toString(),
      currency: plan.currency,
      dataAmount: plan.dataAmount,
      validity: plan.validity,
      description: plan.description,
    }));
  }

  /**
   * Validate meter number (electricity)
   */
  async validateMeterNumber(providerId: number, meterNumber: string, accountType: 'prepaid' | 'postpaid') {
    const provider = await prisma.billPaymentProvider.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new Error('Provider not found');
    }

    // For now, validate format and return random name
    // In production, this would call the provider's API
    if (!meterNumber || meterNumber.length < 8) {
      throw new Error('Invalid meter number format');
    }

    // Generate random account name for demo
    const names = [
      'Qamardeen Abdulmalik',
      'John Doe',
      'Jane Smith',
      'Adebisi Lateefat',
      'Chukwuemeka Okafor',
      'Amina Hassan',
    ];
    const randomName = names[Math.floor(Math.random() * names.length)];

    return {
      isValid: true,
      accountName: randomName,
      meterNumber,
      accountType,
      provider: {
        id: provider.id,
        name: provider.name,
        code: provider.code,
      },
    };
  }

  /**
   * Validate account number (betting)
   */
  async validateAccountNumber(providerId: number, accountNumber: string) {
    const provider = await prisma.billPaymentProvider.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new Error('Provider not found');
    }

    // For now, validate format and return validation
    // In production, this would call the provider's API
    if (!accountNumber || accountNumber.length < 5) {
      throw new Error('Invalid account number format');
    }

    return {
      isValid: true,
      accountNumber,
      provider: {
        id: provider.id,
        name: provider.name,
        code: provider.code,
      },
    };
  }

  /**
   * Initiate bill payment (returns summary, does not create transaction)
   */
  async initiateBillPayment(
    userId: string | number,
    data: {
      categoryCode: string;
      providerId: number;
      currency: string;
      amount: string;
      accountNumber?: string; // Phone number, meter number, account number
      accountType?: string; // prepaid, postpaid (for electricity)
      planId?: number; // For data and cable TV
      beneficiaryId?: number; // If using saved beneficiary
    }
  ) {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }

    // Get category
    const category = await prisma.billPaymentCategory.findUnique({
      where: { code: data.categoryCode },
    });

    if (!category) {
      throw new Error('Category not found');
    }

    // Get provider
    const provider = await prisma.billPaymentProvider.findUnique({
      where: { id: data.providerId },
      include: {
        category: true,
      },
    });

    if (!provider || provider.categoryId !== category.id) {
      throw new Error('Provider not found or does not belong to category');
    }

    // Get wallet
    const wallet = await this.walletService.getWalletByCurrency(userIdNum, data.currency);
    if (!wallet) {
      throw new Error(`Wallet for ${data.currency} not found`);
    }

    // Get beneficiary if provided
    let beneficiary = null;
    if (data.beneficiaryId) {
      beneficiary = await prisma.beneficiary.findFirst({
        where: {
          id: data.beneficiaryId,
          userId: userIdNum,
          categoryId: category.id,
          providerId: data.providerId,
          isActive: true,
        },
        include: {
          provider: true,
        },
      });

      if (!beneficiary) {
        throw new Error('Beneficiary not found');
      }
    }

    // Determine account number
    let accountNumber = data.accountNumber;
    let accountName = null;
    let accountType = data.accountType;

    if (beneficiary) {
      accountNumber = beneficiary.accountNumber;
      accountName = beneficiary.name;
      accountType = beneficiary.accountType || accountType;
    }

    if (!accountNumber) {
      throw new Error('Account number is required');
    }

    // Get plan if provided
    let plan = null;
    if (data.planId) {
      plan = await prisma.billPaymentPlan.findUnique({
        where: { id: data.planId },
      });

      if (!plan || plan.providerId !== data.providerId) {
        throw new Error('Plan not found');
      }
    }

    // Calculate amount
    let amount = new Decimal(data.amount);
    if (plan) {
      amount = new Decimal(plan.amount);
    }

    // Calculate fee
    const fee = this.calculateFee(amount.toNumber(), data.currency);
    const totalAmount = amount.plus(fee);

    // Check balance
    const walletBalance = new Decimal(wallet.balance);
    if (walletBalance.lessThan(totalAmount)) {
      throw new Error('Insufficient balance');
    }

    // Validate account number based on category
    if (category.code === 'electricity' && accountType) {
      const validation = await this.validateMeterNumber(data.providerId, accountNumber, accountType as 'prepaid' | 'postpaid');
      accountName = validation.accountName;
    } else if (category.code === 'betting') {
      await this.validateAccountNumber(data.providerId, accountNumber);
    }

    return {
      category: {
        id: category.id,
        code: category.code,
        name: category.name,
      },
      provider: {
        id: provider.id,
        code: provider.code,
        name: provider.name,
        logoUrl: provider.logoUrl,
      },
      plan: plan ? {
        id: plan.id,
        code: plan.code,
        name: plan.name,
        dataAmount: plan.dataAmount,
        validity: plan.validity,
      } : null,
      accountNumber,
      accountName,
      accountType,
      amount: amount.toString(),
      currency: data.currency,
      fee: fee.toString(),
      totalAmount: totalAmount.toString(),
      wallet: {
        id: wallet.id,
        currency: wallet.currency,
        balance: wallet.balance,
      },
    };
  }

  /**
   * Confirm bill payment (creates transaction)
   */
  async confirmBillPayment(
    userId: string | number,
    data: {
      categoryCode: string;
      providerId: number;
      currency: string;
      amount: string;
      accountNumber: string;
      accountType?: string;
      planId?: number;
      beneficiaryId?: number;
      pin: string;
    }
  ) {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }

    // Verify PIN
    const user = await prisma.user.findUnique({
      where: { id: userIdNum },
    });

    if (!user || !user.pinHash) {
      throw new Error('User not found or PIN not set');
    }

    const isPINValid = await bcrypt.compare(data.pin, user.pinHash);
    if (!isPINValid) {
      throw new Error('Invalid PIN');
    }

    // Get wallet
    const wallet = await this.walletService.getWalletByCurrency(userIdNum, data.currency);
    if (!wallet) {
      throw new Error(`Wallet for ${data.currency} not found`);
    }

    // Get category and provider
    const category = await prisma.billPaymentCategory.findUnique({
      where: { code: data.categoryCode },
    });

    if (!category) {
      throw new Error('Category not found');
    }

    const provider = await prisma.billPaymentProvider.findUnique({
      where: { id: data.providerId },
    });

    if (!provider || provider.categoryId !== category.id) {
      throw new Error('Provider not found');
    }

    // Get plan if provided
    let plan = null;
    let amount = new Decimal(data.amount);
    if (data.planId) {
      plan = await prisma.billPaymentPlan.findUnique({
        where: { id: data.planId },
      });

      if (!plan || plan.providerId !== data.providerId) {
        throw new Error('Plan not found');
      }
      amount = new Decimal(plan.amount);
    }

    // Calculate fee and total
    const fee = this.calculateFee(amount.toNumber(), data.currency);
    const totalAmount = amount.plus(fee);

    // Check balance
    const walletBalance = new Decimal(wallet.balance);
    if (walletBalance.lessThan(totalAmount)) {
      throw new Error('Insufficient balance');
    }

    // Validate account
    let accountName = null;
    let rechargeToken = null;

    if (category.code === 'electricity' && data.accountType) {
      const validation = await this.validateMeterNumber(data.providerId, data.accountNumber, data.accountType as 'prepaid' | 'postpaid');
      accountName = validation.accountName;
      
      // For prepaid, generate a recharge token
      if (data.accountType === 'prepaid') {
        rechargeToken = Math.random().toString(36).substring(2, 15).toUpperCase();
      }
    } else if (category.code === 'betting') {
      await this.validateAccountNumber(data.providerId, data.accountNumber);
    }

    // Generate reference
    const reference = this.generateReference();

    // Create transaction
    const transaction = await prisma.transaction.create({
      data: {
        walletId: wallet.id,
        type: 'bill_payment',
        status: 'completed', // For demo, mark as completed. In production, this would be 'pending' until provider confirms
        amount: amount.toNumber(),
        currency: data.currency,
        fee: fee,
        reference,
        channel: 'bill_payment',
        description: `${category.name} - ${provider.name} - ${data.accountNumber}`,
        country: provider.countryCode,
        metadata: {
          categoryCode: data.categoryCode,
          categoryName: category.name,
          providerId: data.providerId,
          providerCode: provider.code,
          providerName: provider.name,
          accountNumber: data.accountNumber,
          accountName,
          accountType: data.accountType,
          planId: data.planId,
          planCode: plan?.code,
          planName: plan?.name,
          beneficiaryId: data.beneficiaryId,
          rechargeToken,
        },
        completedAt: new Date(),
      },
      include: {
        wallet: {
          include: {
            currencyRef: true,
          },
        },
      },
    });

    // Deduct from wallet
    await prisma.wallet.update({
      where: { id: wallet.id },
      data: {
        balance: {
          decrement: totalAmount.toNumber(),
        },
      },
    });

    return {
      id: transaction.id,
      reference: transaction.reference,
      status: transaction.status,
      amount: amount.toString(),
      currency: data.currency,
      fee: fee.toString(),
      totalAmount: totalAmount.toString(),
      accountNumber: data.accountNumber,
      accountName,
      rechargeToken,
      category: {
        code: data.categoryCode,
        name: category.name,
      },
      provider: {
        id: provider.id,
        code: provider.code,
        name: provider.name,
      },
      plan: plan ? {
        id: plan.id,
        name: plan.name,
        dataAmount: plan.dataAmount,
      } : null,
      completedAt: transaction.completedAt,
      createdAt: transaction.createdAt,
    };
  }

  /**
   * Get user's beneficiaries
   */
  async getBeneficiaries(userId: string | number, categoryCode?: string) {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }

    const where: any = {
      userId: userIdNum,
      isActive: true,
    };

    if (categoryCode) {
      const category = await prisma.billPaymentCategory.findUnique({
        where: { code: categoryCode },
      });
      if (category) {
        where.categoryId = category.id;
      }
    }

    const beneficiaries = await prisma.beneficiary.findMany({
      where,
      include: {
        category: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        provider: {
          select: {
            id: true,
            code: true,
            name: true,
            logoUrl: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return beneficiaries.map((ben) => ({
      id: ben.id,
      name: ben.name,
      accountNumber: ben.accountNumber,
      accountType: ben.accountType,
      category: ben.category,
      provider: ben.provider,
      createdAt: ben.createdAt,
    }));
  }

  /**
   * Create beneficiary
   */
  async createBeneficiary(
    userId: string | number,
    data: {
      categoryCode: string;
      providerId: number;
      name?: string;
      accountNumber: string;
      accountType?: string;
    }
  ) {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }

    // Get category
    const category = await prisma.billPaymentCategory.findUnique({
      where: { code: data.categoryCode },
    });

    if (!category) {
      throw new Error('Category not found');
    }

    // Get provider
    const provider = await prisma.billPaymentProvider.findUnique({
      where: { id: data.providerId },
    });

    if (!provider || provider.categoryId !== category.id) {
      throw new Error('Provider not found');
    }

    // Check if beneficiary already exists
    const existing = await prisma.beneficiary.findFirst({
      where: {
        userId: userIdNum,
        categoryId: category.id,
        providerId: data.providerId,
        accountNumber: data.accountNumber,
        isActive: true,
      },
    });

    if (existing) {
      throw new Error('Beneficiary already exists');
    }

    // Create beneficiary
    const beneficiary = await prisma.beneficiary.create({
      data: {
        userId: userIdNum,
        categoryId: category.id,
        providerId: data.providerId,
        name: data.name,
        accountNumber: data.accountNumber,
        accountType: data.accountType,
      },
      include: {
        category: true,
        provider: true,
      },
    });

    return {
      id: beneficiary.id,
      name: beneficiary.name,
      accountNumber: beneficiary.accountNumber,
      accountType: beneficiary.accountType,
      category: beneficiary.category,
      provider: beneficiary.provider,
      createdAt: beneficiary.createdAt,
    };
  }

  /**
   * Update beneficiary
   */
  async updateBeneficiary(
    userId: string | number,
    beneficiaryId: number,
    data: {
      name?: string;
      accountNumber?: string;
      accountType?: string;
    }
  ) {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }

    const beneficiary = await prisma.beneficiary.findFirst({
      where: {
        id: beneficiaryId,
        userId: userIdNum,
        isActive: true,
      },
    });

    if (!beneficiary) {
      throw new Error('Beneficiary not found');
    }

    const updated = await prisma.beneficiary.update({
      where: { id: beneficiaryId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.accountNumber !== undefined && { accountNumber: data.accountNumber }),
        ...(data.accountType !== undefined && { accountType: data.accountType }),
      },
      include: {
        category: true,
        provider: true,
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      accountNumber: updated.accountNumber,
      accountType: updated.accountType,
      category: updated.category,
      provider: updated.provider,
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * Delete beneficiary
   */
  async deleteBeneficiary(userId: string | number, beneficiaryId: number) {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }

    const beneficiary = await prisma.beneficiary.findFirst({
      where: {
        id: beneficiaryId,
        userId: userIdNum,
        isActive: true,
      },
    });

    if (!beneficiary) {
      throw new Error('Beneficiary not found');
    }

    await prisma.beneficiary.update({
      where: { id: beneficiaryId },
      data: {
        isActive: false,
      },
    });

    return {
      success: true,
      message: 'Beneficiary deleted successfully',
    };
  }
}

