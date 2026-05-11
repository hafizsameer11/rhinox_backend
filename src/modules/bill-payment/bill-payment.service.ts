import { Decimal } from 'decimal.js';
import { randomBytes } from 'crypto';
import prisma from '../../core/config/database.js';
import { WalletService } from '../wallet/wallet.service.js';
import bcrypt from 'bcryptjs';
import { PalmPayBillPaymentService } from '../../services/palmpay/palmpay.billpayment.service.js';
import {
  createMaintenanceError,
  createProviderUnavailableError,
  isSupportedPalmPayScene,
  mapPalmPayStatus,
} from '../../services/palmpay/palmpay.utils.js';

/**
 * Bill Payment Service
 * Handles bill payments (airtime, data, electricity, cable TV, betting, internet)
 */
export class BillPaymentService {
  private walletService: WalletService;
  private palmPayBillPaymentService: PalmPayBillPaymentService;

  constructor() {
    this.walletService = new WalletService();
    this.palmPayBillPaymentService = new PalmPayBillPaymentService();
  }

  /**
   * Generate unique reference number
   */
  private generateReference(): string {
    const timestamp = Date.now().toString(36);
    const random = randomBytes(4).toString('hex');
    return `BILL${timestamp}${random}`.toUpperCase();
  }

  private parsePalmPayProviderId(providerId: string, categoryCode?: string) {
    const [embeddedSceneCode, embeddedBillerId] = providerId.includes(':')
      ? providerId.split(':')
      : [categoryCode, providerId];

    if (!embeddedSceneCode || !embeddedBillerId) {
      throw new Error('Invalid PalmPay provider id');
    }

    if (!isSupportedPalmPayScene(embeddedSceneCode)) {
      throw createMaintenanceError();
    }

    return {
      sceneCode: embeddedSceneCode,
      billerId: embeddedBillerId,
    };
  }

  /**
   * Calculate bill payment fee
   */
  private calculateFee(amount: number, currency: string): number {
    if (currency === 'NGN') {
      return 0;
    }

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

    return categories.map((cat: { id: number; code: string; name: string; description: string | null }) => ({
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
    if (countryCode && countryCode !== 'NG') {
      throw new Error('Only Nigerian bill payments are currently supported');
    }
    if (!isSupportedPalmPayScene(categoryCode)) {
      throw createMaintenanceError();
    }

    try {
      const billers = await this.palmPayBillPaymentService.queryBillers(categoryCode);
      return billers.map((biller) => ({
        id: `${categoryCode}:${biller.billerId}`,
        code: biller.billerId,
        billerId: biller.billerId,
        name: biller.billerName,
        logoUrl: biller.billerIcon || null,
        countryCode: 'NG',
        currency: 'NGN',
        provider: 'palmpay',
        category: {
          code: categoryCode,
        },
        metadata: biller.raw || biller,
      }));
    } catch (error: any) {
      if (error.code === 'BILL_SERVICE_UNDER_MAINTENANCE') throw error;
      throw createProviderUnavailableError(error.message || 'PalmPay billers are unavailable');
    }
  }

  /**
   * Get plans/bundles by provider
   */
  async getPlansByProvider(providerId: string, categoryCode?: string) {
    const { sceneCode, billerId } = this.parsePalmPayProviderId(providerId, categoryCode);
    if (!isSupportedPalmPayScene(sceneCode)) {
      throw createMaintenanceError();
    }

    try {
      const items = await this.palmPayBillPaymentService.queryItems(sceneCode, billerId);
      return items.map((item) => ({
        id: item.itemId,
        code: item.itemId,
        itemId: item.itemId,
        providerId: `${sceneCode}:${billerId}`,
        name: item.itemName,
        amount: item.amount !== undefined ? (item.amount / 100).toString() : undefined,
        minAmount: item.minAmount !== undefined ? (item.minAmount / 100).toString() : undefined,
        maxAmount: item.maxAmount !== undefined ? (item.maxAmount / 100).toString() : undefined,
        currency: 'NGN',
        dataAmount: item.raw?.dataAmount || null,
        validity: item.raw?.validity || null,
        description: item.raw?.description || item.itemName,
        metadata: item.raw || item,
      }));
    } catch (error: any) {
      throw createProviderUnavailableError(error.message || 'PalmPay bill payment items are unavailable');
    }
  }

  /**
   * Validate meter number (electricity)
   */
  async validateMeterNumber(providerId: number, meterNumber: string, accountType: 'prepaid' | 'postpaid') {
    throw createMaintenanceError('Electricity bill payments are temporarily unavailable.');
  }

  /**
   * Validate account number (betting)
   */
  async validateAccountNumber(providerId: number, accountNumber: string) {
    if (!accountNumber || accountNumber.length < 5) {
      throw new Error('Invalid account number format');
    }

    const { sceneCode, billerId } = this.parsePalmPayProviderId(providerId.toString(), 'betting');
    const verification = await this.palmPayBillPaymentService.verifyRechargeAccount({
      sceneCode,
      billerId,
      rechargeAccount: accountNumber,
    });

    return {
      isValid: true,
      accountNumber,
      provider: {
        id: providerId,
        code: billerId,
      },
      verification,
    };
  }

  /**
   * Initiate bill payment (creates pending transaction, returns transaction ID)
   */
  async initiateBillPayment(
    userId: string | number,
    data: {
      categoryCode: string;
      providerId: string | number;
      currency: string;
      amount: string;
      accountNumber?: string; // Phone number, meter number, account number
      accountType?: string; // prepaid, postpaid (for electricity)
      planId?: string | number; // PalmPay itemId for supported bill scenes
      beneficiaryId?: number; // If using saved beneficiary
    }
  ) {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }

    if (!isSupportedPalmPayScene(data.categoryCode)) {
      throw createMaintenanceError();
    }
    if (data.currency !== 'NGN') {
      throw new Error('Only NGN bill payments are currently supported');
    }

    const { sceneCode, billerId } = this.parsePalmPayProviderId(data.providerId.toString(), data.categoryCode);
    const category = await prisma.billPaymentCategory.findUnique({
      where: { code: sceneCode },
    });
    const categoryName = category?.name || sceneCode;

    let biller;
    let item;
    try {
      const billers = await this.palmPayBillPaymentService.queryBillers(sceneCode);
      biller = billers.find((entry) => entry.billerId === billerId);
      if (!biller) {
        throw new Error('Selected PalmPay biller is unavailable');
      }

      const items = await this.palmPayBillPaymentService.queryItems(sceneCode, billerId);
      item = data.planId
        ? items.find((entry) => entry.itemId === data.planId?.toString())
        : items[0];
      if (!item) {
        throw new Error('Selected PalmPay bill item is unavailable');
      }
    } catch (error: any) {
      throw createProviderUnavailableError(error.message || 'PalmPay bill payment service is unavailable');
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
          categoryId: category?.id,
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

    // Calculate amount
    let amount = new Decimal(data.amount);
    if (item.amount !== undefined && item.amount > 0) {
      amount = new Decimal(item.amount).dividedBy(100);
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
    if (sceneCode === 'betting') {
      const validation = await this.palmPayBillPaymentService.verifyRechargeAccount({
        sceneCode,
        billerId,
        itemId: item.itemId,
        rechargeAccount: accountNumber,
      });
      accountName = (validation as any)?.accountName || accountName;
    }

    // Create pending transaction
    const reference = this.generateReference();
    const transaction = await prisma.transaction.create({
      data: {
        walletId: wallet.id,
        type: 'bill_payment',
        status: 'pending',
        amount: amount.toNumber(),
        currency: data.currency,
        fee: fee,
        reference,
        description: `${categoryName} - ${biller.billerName}`,
        channel: sceneCode,
        country: 'NG',
        metadata: {
          provider: 'palmpay',
          categoryCode: sceneCode,
          categoryName,
          providerId: `${sceneCode}:${biller.billerId}`,
          billerId: biller.billerId,
          providerCode: biller.billerId,
          providerName: biller.billerName,
          accountNumber,
          accountName,
          accountType,
          planId: item.itemId,
          itemId: item.itemId,
          planCode: item.itemId,
          planName: item.itemName,
          planDataAmount: item.raw?.dataAmount || null,
          beneficiaryId: beneficiary?.id || null,
        },
      },
    });

    return {
      transactionId: transaction.id,
      reference: transaction.reference,
      category: {
        id: category?.id || 0,
        code: sceneCode,
        name: categoryName,
      },
      provider: {
        id: `${sceneCode}:${biller.billerId}`,
        code: biller.billerId,
        name: biller.billerName,
        logoUrl: biller.billerIcon,
      },
      plan: {
        id: item.itemId,
        code: item.itemId,
        name: item.itemName,
        dataAmount: item.raw?.dataAmount || null,
        validity: item.raw?.validity || null,
      },
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
   * Confirm bill payment (completes pending transaction)
   */
  async confirmBillPayment(
    userId: string | number,
    transactionId: string | number,
    pin: string
  ) {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    const txIdNum = typeof transactionId === 'string' ? parseInt(transactionId, 10) : transactionId;

    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }
    if (isNaN(txIdNum) || txIdNum <= 0) {
      throw new Error(`Invalid transactionId: ${transactionId}`);
    }

    // Get transaction
    const transaction = await prisma.transaction.findUnique({
      where: { id: txIdNum },
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

    if (transaction.wallet.userId !== userIdNum) {
      throw new Error('Unauthorized access to transaction');
    }

    if (transaction.type !== 'bill_payment') {
      throw new Error('Transaction is not a bill payment');
    }

    if (transaction.status !== 'pending') {
      throw new Error(`Transaction is already ${transaction.status}`);
    }

    // Verify PIN
    if (!transaction.wallet.user.pinHash) {
      throw new Error('PIN not set. Please setup your PIN first.');
    }

    const isPINValid = await bcrypt.compare(pin, transaction.wallet.user.pinHash);
    if (!isPINValid) {
      throw new Error('Invalid PIN');
    }

    const metadata = transaction.metadata as any;
    const amount = new Decimal(transaction.amount);
    const fee = new Decimal(transaction.fee);
    const totalAmount = amount.plus(fee);

    // Check balance
    const walletBalance = new Decimal(transaction.wallet.balance);
    if (walletBalance.lessThan(totalAmount)) {
      throw new Error('Insufficient balance');
    }

    if (!isSupportedPalmPayScene(metadata?.categoryCode)) {
      throw createMaintenanceError();
    }

    const palmPayOrderId = `bill_${transaction.reference.toLowerCase()}`;

    const debitedTransaction = await prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { id: transaction.walletId },
        data: {
          balance: {
            decrement: totalAmount.toNumber(),
          },
        },
      });

      return tx.transaction.update({
        where: { id: txIdNum },
        data: {
          status: 'processing',
          metadata: {
            ...metadata,
            palmpayOrderId: palmPayOrderId,
            walletDebited: true,
            walletDebitedAt: new Date().toISOString(),
          },
        },
        include: {
          wallet: {
            include: {
              currencyRef: true,
            },
          },
        },
      });
    });

    let palmPayOrder;
    try {
      palmPayOrder = await this.palmPayBillPaymentService.createOrder({
        outOrderNo: palmPayOrderId,
        sceneCode: metadata.categoryCode,
        billerId: metadata.billerId,
        itemId: metadata.itemId,
        rechargeAccount: metadata.accountNumber,
        amount: amount.toString(),
        userId: userIdNum,
      });
    } catch (error: any) {
      await prisma.$transaction(async (tx) => {
        await tx.wallet.update({
          where: { id: transaction.walletId },
          data: {
            balance: {
              increment: totalAmount.toNumber(),
            },
          },
        });
        await tx.transaction.update({
          where: { id: txIdNum },
          data: {
            status: 'failed',
            metadata: {
              ...metadata,
              palmpayOrderId: palmPayOrderId,
              refunded: true,
              refundReason: error.message || 'PalmPay bill payment failed',
              providerError: error.providerResponse || error.message,
            },
          },
        });
      });
      throw createProviderUnavailableError(error.message || 'PalmPay bill payment failed');
    }

    const mappedStatus = mapPalmPayStatus(palmPayOrder.orderStatus);
    const updatedTransaction = await prisma.transaction.update({
      where: { id: txIdNum },
      data: {
        status: mappedStatus === 'pending' ? 'processing' : mappedStatus,
        completedAt: mappedStatus === 'completed' ? new Date() : null,
        metadata: {
          ...metadata,
          palmpayOrderId: palmPayOrderId,
          palmpayOrderNo: palmPayOrder.orderNo,
          palmpayStatus: palmPayOrder.orderStatus,
          palmpayRequestId: palmPayOrder.requestId,
          providerResponse: palmPayOrder,
          walletDebited: true,
        },
      },
      include: {
        wallet: {
          include: {
            currencyRef: true,
          },
        },
      },
    });

    return {
      id: updatedTransaction.id,
      reference: updatedTransaction.reference,
      status: updatedTransaction.status,
      amount: amount.toString(),
      currency: transaction.currency,
      fee: fee.toString(),
      totalAmount: totalAmount.toString(),
      accountNumber: metadata?.accountNumber || null,
      accountName: metadata?.accountName || null,
      orderId: palmPayOrderId,
      orderNo: palmPayOrder.orderNo,
      category: {
        code: metadata?.categoryCode || null,
        name: metadata?.categoryName || null,
      },
      provider: {
        id: metadata?.providerId || null,
        code: metadata?.providerCode || null,
        name: metadata?.providerName || null,
      },
      plan: metadata?.planId ? {
        id: metadata.planId,
        code: metadata.planCode,
        name: metadata.planName,
        dataAmount: metadata.planDataAmount,
      } : null,
      completedAt: updatedTransaction.completedAt,
      createdAt: debitedTransaction.createdAt,
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

    return beneficiaries.map((ben: any) => ({
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
        name: data.name ?? null,
        accountNumber: data.accountNumber,
        accountType: data.accountType ?? null,
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

