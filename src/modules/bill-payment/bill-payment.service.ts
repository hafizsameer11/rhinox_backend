import { Decimal } from 'decimal.js';
import { randomBytes } from 'crypto';
import prisma from '../../core/config/database.js';
import { WalletService } from '../wallet/wallet.service.js';
import { PalmPayBillPaymentService } from '../../services/palmpay/palmpay.billpayment.service.js';
import {
  createMaintenanceError,
  createProviderUnavailableError,
  isSupportedPalmPayScene,
  mapPalmPayStatus,
} from '../../services/palmpay/palmpay.utils.js';
import {
  FlutterwaveBillPaymentService,
  type FlutterwaveBillItem,
  type FlutterwaveBiller,
} from '../../services/flutterwave/flutterwave.billpayment.service.js';
import { FlutterwaveWebhookService } from '../../services/flutterwave/flutterwave.webhook.service.js';
import {
  type MappedBillStatus,
} from '../../services/flutterwave/flutterwave.bill-status.js';
import {
  decodeFlutterwaveItemId,
  decodeFlutterwaveProviderId,
  encodeFlutterwaveItemId,
  encodeFlutterwaveProviderId,
  isFlutterwaveBillCategory,
  isFlutterwaveProviderId,
  requiresFlutterwaveCustomerValidation,
} from '../../services/flutterwave/flutterwave.bill-map.js';
import { resolveFlutterwaveBillerLogo } from '../../services/flutterwave/flutterwave.bill-logos.js';
import { notifyBillPayment } from '../../core/utils/notification.events.js';
import { assertTransactionSecurity } from '../../core/utils/transactionSecurity.js';
import { RewardFulfillmentService } from '../rewards/reward-fulfillment.service.js';

/**
 * Bill Payment Service
 * Betting → PalmPay; airtime/data/electricity/cable_tv/internet → Flutterwave (NG/NGN)
 */
export class BillPaymentService {
  private walletService: WalletService;
  private palmPayBillPaymentService: PalmPayBillPaymentService;
  private flutterwaveBillPaymentService: FlutterwaveBillPaymentService;
  private flutterwaveWebhookService: FlutterwaveWebhookService;
  private rewardFulfillmentService: RewardFulfillmentService;

  constructor() {
    this.walletService = new WalletService();
    this.palmPayBillPaymentService = new PalmPayBillPaymentService();
    this.flutterwaveBillPaymentService = new FlutterwaveBillPaymentService();
    this.flutterwaveWebhookService = new FlutterwaveWebhookService();
    this.rewardFulfillmentService = new RewardFulfillmentService();
  }

  private generateReference(): string {
    const timestamp = Date.now().toString(36);
    const random = randomBytes(4).toString('hex');
    return `BILL${timestamp}${random}`.toUpperCase();
  }

  private getBillCallbackUrl(): string | undefined {
    const base = (process.env.BASE_URL || process.env.API_PUBLIC_URL || '').replace(/\/$/, '');
    return base ? `${base}/api/webhooks/flutterwave` : undefined;
  }

  private parsePalmPayProviderId(providerId: string, categoryCode?: string) {
    const [embeddedSceneCode, embeddedBillerId] = providerId.includes(':')
      ? providerId.split(':')
      : [categoryCode, providerId];

    if (!embeddedSceneCode || !embeddedBillerId) {
      throw new Error('Invalid provider id');
    }

    if (embeddedSceneCode !== 'betting' || !isSupportedPalmPayScene(embeddedSceneCode)) {
      throw createMaintenanceError();
    }

    return {
      sceneCode: embeddedSceneCode,
      billerId: embeddedBillerId,
    };
  }

  private calculateFee(amount: number, currency: string): number {
    if (currency === 'NGN') {
      return 0;
    }

    const feePercent = 0.01;
    const calculatedFee = amount * feePercent;

    const minFees: { [key: string]: number } = {
      NGN: 20,
      USD: 0.1,
      KES: 2,
      GHS: 0.5,
    };

    const minFee = minFees[currency] || 0.1;
    return Math.max(calculatedFee, minFee);
  }

  private isFixedAmountItem(item: { isFixAmount?: number; raw?: { isFixAmount?: number } }): boolean {
    return item.isFixAmount === 1 || item.raw?.isFixAmount === 1;
  }

  private resolvePalmPayAmount(
    sceneCode: string,
    userAmount: string,
    item: { amount?: number; isFixAmount?: number; raw?: { isFixAmount?: number } }
  ): Decimal {
    const parsedUserAmount = new Decimal(userAmount);
    if (parsedUserAmount.lte(0)) {
      throw new Error('Invalid amount');
    }

    if (sceneCode === 'airtime' || sceneCode === 'betting') {
      return parsedUserAmount;
    }

    if (this.isFixedAmountItem(item) && item.amount !== undefined && Number(item.amount) > 0) {
      return new Decimal(item.amount).dividedBy(100);
    }

    return parsedUserAmount;
  }

  private resolveFlutterwaveAmount(
    categoryCode: string,
    userAmount: string,
    item: FlutterwaveBillItem
  ): Decimal {
    const parsedUserAmount = new Decimal(userAmount);
    if (parsedUserAmount.lte(0)) {
      throw new Error('Invalid amount');
    }

    if (categoryCode === 'airtime' || categoryCode === 'electricity') {
      return parsedUserAmount;
    }

    if (!item.isAirtime && item.amount > 0) {
      return new Decimal(item.amount);
    }

    return parsedUserAmount;
  }

  private normalizeNgPhoneForFlutterwave(accountNumber: string): string {
    const digitsOnly = String(accountNumber).replace(/\D/g, '');
    if (digitsOnly.length < 10) {
      throw new Error('Invalid phone number');
    }
    return `0${digitsOnly.slice(-10)}`;
  }

  private normalizeNgPhoneForPalmPay(accountNumber: string): string {
    const digitsOnly = String(accountNumber).replace(/\D/g, '');
    if (digitsOnly.length < 10) {
      throw new Error('Invalid phone number');
    }
    return `02340${digitsOnly.slice(-10)}`;
  }

  private pickFlutterwaveItem(
    items: FlutterwaveBillItem[],
    opts: { planId?: string | number; accountType?: string; categoryCode: string }
  ): FlutterwaveBillItem {
    const decodedItemCode = decodeFlutterwaveItemId(opts.planId);
    if (decodedItemCode) {
      const matched = items.find((entry) => entry.itemCode === decodedItemCode);
      if (matched) return matched;
      throw new Error('Selected bill payment plan is unavailable');
    }

    if (opts.categoryCode === 'airtime') {
      return items.find((entry) => entry.isAirtime) || items[0];
    }

    if (opts.categoryCode === 'electricity' && opts.accountType) {
      const needle = opts.accountType.toLowerCase();
      const byType = items.find((entry) => {
        const hay = `${entry.name} ${entry.shortName || ''} ${entry.groupName || ''}`.toLowerCase();
        return hay.includes(needle);
      });
      if (byType) return byType;
    }

    if (!items[0]) {
      throw new Error('Selected bill payment plan is unavailable');
    }
    return items[0];
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

    if (categoryCode === 'betting') {
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
        throw createProviderUnavailableError(error.message || 'Bill payment providers are unavailable');
      }
    }

    if (!isFlutterwaveBillCategory(categoryCode)) {
      throw createMaintenanceError();
    }

    try {
      const billers = await this.flutterwaveBillPaymentService.getBillers(categoryCode, 'NG');
      return billers.map((biller: FlutterwaveBiller) => ({
        id: encodeFlutterwaveProviderId(categoryCode, biller.billerCode),
        code: biller.billerCode,
        billerId: biller.billerCode,
        name: biller.name,
        logoUrl: resolveFlutterwaveBillerLogo({
          logo: biller.logo,
          billerCode: biller.billerCode,
          name: biller.name,
          shortName: biller.shortName,
        }),
        countryCode: 'NG',
        currency: 'NGN',
        provider: 'flutterwave',
        category: {
          code: categoryCode,
        },
        metadata: biller.raw || biller,
      }));
    } catch (error: any) {
      throw createProviderUnavailableError(error.message || 'Bill payment providers are unavailable');
    }
  }

  /**
   * Get plans/bundles by provider
   */
  async getPlansByProvider(providerId: string, categoryCode?: string) {
    if (isFlutterwaveProviderId(providerId) || (categoryCode && isFlutterwaveBillCategory(categoryCode))) {
      const decoded = isFlutterwaveProviderId(providerId)
        ? decodeFlutterwaveProviderId(providerId)
        : {
            categoryCode: categoryCode as any,
            billerCode: providerId,
          };

      try {
        const items = await this.flutterwaveBillPaymentService.getBillItems(decoded.billerCode);
        return items.map((item: FlutterwaveBillItem) => ({
          id: encodeFlutterwaveItemId(item.itemCode),
          code: item.itemCode,
          itemId: item.itemCode,
          providerId: encodeFlutterwaveProviderId(decoded.categoryCode, decoded.billerCode),
          name: item.name,
          amount: item.amount > 0 ? item.amount.toString() : undefined,
          currency: 'NGN',
          dataAmount: item.raw?.dataAmount || null,
          validity: item.raw?.validity || null,
          description: item.raw?.description || item.name,
          metadata: item.raw || item,
        }));
      } catch (error: any) {
        throw createProviderUnavailableError(error.message || 'Bill payment plans are unavailable');
      }
    }

    const { sceneCode, billerId } = this.parsePalmPayProviderId(providerId, categoryCode);

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
      throw createProviderUnavailableError(error.message || 'Bill payment plans are unavailable');
    }
  }

  /**
   * Validate meter number (electricity via Flutterwave)
   */
  async validateMeterNumber(
    providerId: string | number,
    meterNumber: string,
    accountType: 'prepaid' | 'postpaid'
  ) {
    const providerIdStr = String(providerId);
    if (!isFlutterwaveProviderId(providerIdStr)) {
      throw createMaintenanceError('Electricity bill payments require a Flutterwave provider.');
    }

    const { categoryCode, billerCode } = decodeFlutterwaveProviderId(providerIdStr);
    if (categoryCode !== 'electricity') {
      throw new Error('Provider is not an electricity biller');
    }

    try {
      const items = await this.flutterwaveBillPaymentService.getBillItems(billerCode);
      const item = this.pickFlutterwaveItem(items, {
        categoryCode,
        accountType,
      });
      const validation = await this.flutterwaveBillPaymentService.validateCustomer(
        item.itemCode,
        meterNumber
      );

      return {
        isValid: true,
        meterNumber,
        accountType,
        accountName: validation.name || null,
        provider: {
          id: providerIdStr,
          code: billerCode,
        },
        plan: {
          id: encodeFlutterwaveItemId(item.itemCode),
          code: item.itemCode,
          name: item.name,
        },
        verification: validation,
      };
    } catch (error: any) {
      throw createProviderUnavailableError(error.message || 'Meter validation failed');
    }
  }

  /**
   * Validate account number (betting via PalmPay; cable/internet via Flutterwave when flw ids)
   */
  async validateAccountNumber(providerId: string | number, accountNumber: string) {
    if (!accountNumber || accountNumber.length < 5) {
      throw new Error('Invalid account number format');
    }

    const providerIdStr = String(providerId);

    if (isFlutterwaveProviderId(providerIdStr)) {
      const { categoryCode, billerCode } = decodeFlutterwaveProviderId(providerIdStr);
      if (!requiresFlutterwaveCustomerValidation(categoryCode)) {
        return {
          isValid: true,
          accountNumber,
          provider: { id: providerIdStr, code: billerCode },
        };
      }

      const items = await this.flutterwaveBillPaymentService.getBillItems(billerCode);
      const item = this.pickFlutterwaveItem(items, { categoryCode });
      const validation = await this.flutterwaveBillPaymentService.validateCustomer(
        item.itemCode,
        accountNumber
      );

      return {
        isValid: true,
        accountNumber,
        accountName: validation.name || null,
        provider: {
          id: providerIdStr,
          code: billerCode,
        },
        verification: validation,
      };
    }

    const { sceneCode, billerId } = this.parsePalmPayProviderId(providerIdStr, 'betting');
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
      accountNumber?: string;
      accountType?: string;
      planId?: string | number;
      beneficiaryId?: number;
      rewardClaimId?: number;
    }
  ) {
    if (data.categoryCode === 'betting') {
      return this.initiatePalmPayBillPayment(userId, data);
    }
    if (isFlutterwaveBillCategory(data.categoryCode)) {
      return this.initiateFlutterwaveBillPayment(userId, data);
    }
    throw createMaintenanceError();
  }

  private async initiatePalmPayBillPayment(
    userId: string | number,
    data: {
      categoryCode: string;
      providerId: string | number;
      currency: string;
      amount: string;
      accountNumber?: string;
      accountType?: string;
      planId?: string | number;
      beneficiaryId?: number;
      rewardClaimId?: number;
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

    let rewardContext: Awaited<ReturnType<RewardFulfillmentService['validatePendingClaim']>> | null = null;
    if (data.rewardClaimId) {
      rewardContext = await this.rewardFulfillmentService.validatePendingClaim(
        userIdNum,
        data.rewardClaimId
      );
      this.rewardFulfillmentService.assertCategoryMatchesReward(
        rewardContext.reward,
        data.categoryCode
      );
    }

    const { sceneCode, billerId } = this.parsePalmPayProviderId(
      data.providerId.toString(),
      data.categoryCode
    );
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
        throw new Error('Selected biller is unavailable');
      }

      const items = await this.palmPayBillPaymentService.queryItems(sceneCode, billerId);
      item = data.planId
        ? items.find((entry) => entry.itemId === data.planId?.toString())
        : sceneCode === 'airtime'
          ? items.find((entry) => !this.isFixedAmountItem(entry)) || items[0]
          : items[0];
      if (!item) {
        throw new Error('Selected bill payment plan is unavailable');
      }
    } catch (error: any) {
      throw createProviderUnavailableError(error.message || 'Bill payment service is unavailable');
    }

    const wallet = await this.walletService.getWalletByCurrency(userIdNum, data.currency);
    if (!wallet) {
      throw new Error(`Wallet for ${data.currency} not found`);
    }

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

    if (sceneCode === 'airtime' || sceneCode === 'data') {
      accountNumber = this.normalizeNgPhoneForPalmPay(accountNumber);
    }

    const isRewardFulfillment = Boolean(rewardContext);
    const resolvedAmountInput = rewardContext
      ? this.rewardFulfillmentService.resolveRewardAmount(
          rewardContext.reward,
          data.amount,
          sceneCode
        )
      : data.amount;

    const amount = this.resolvePalmPayAmount(sceneCode, resolvedAmountInput, item);
    const fee = isRewardFulfillment ? 0 : this.calculateFee(amount.toNumber(), data.currency);
    const totalAmount = amount.plus(fee);

    if (!isRewardFulfillment) {
      const walletBalance = new Decimal(wallet.balance);
      if (walletBalance.lessThan(totalAmount)) {
        throw new Error('Insufficient balance');
      }
    }

    if (sceneCode === 'betting') {
      const validation = await this.palmPayBillPaymentService.verifyRechargeAccount({
        sceneCode,
        billerId,
        itemId: item.itemId,
        rechargeAccount: accountNumber,
      });
      accountName = (validation as any)?.accountName || accountName;
    }

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
          ...(isRewardFulfillment && rewardContext
            ? {
                isRewardFulfillment: true,
                rewardClaimId: rewardContext.claim.id,
                rewardCode: rewardContext.claim.rewardCode,
                rewardAmountNgn: amount.toNumber(),
              }
            : {}),
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

  private async initiateFlutterwaveBillPayment(
    userId: string | number,
    data: {
      categoryCode: string;
      providerId: string | number;
      currency: string;
      amount: string;
      accountNumber?: string;
      accountType?: string;
      planId?: string | number;
      beneficiaryId?: number;
      rewardClaimId?: number;
    }
  ) {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }

    if (!isFlutterwaveBillCategory(data.categoryCode)) {
      throw createMaintenanceError();
    }
    if (data.currency !== 'NGN') {
      throw new Error('Only NGN bill payments are currently supported');
    }

    let rewardContext: Awaited<ReturnType<RewardFulfillmentService['validatePendingClaim']>> | null = null;
    if (data.rewardClaimId) {
      rewardContext = await this.rewardFulfillmentService.validatePendingClaim(
        userIdNum,
        data.rewardClaimId
      );
      this.rewardFulfillmentService.assertCategoryMatchesReward(
        rewardContext.reward,
        data.categoryCode
      );
    }

    const providerIdStr = String(data.providerId);
    const { categoryCode, billerCode } = isFlutterwaveProviderId(providerIdStr)
      ? decodeFlutterwaveProviderId(providerIdStr)
      : { categoryCode: data.categoryCode as any, billerCode: providerIdStr };

    if (categoryCode !== data.categoryCode) {
      throw new Error('Provider does not match selected category');
    }

    const category = await prisma.billPaymentCategory.findUnique({
      where: { code: categoryCode },
    });
    const categoryName = category?.name || categoryCode;
    const encodedProviderId = encodeFlutterwaveProviderId(categoryCode, billerCode);

    let billerName = billerCode;
    let item: FlutterwaveBillItem;
    try {
      const billers = await this.flutterwaveBillPaymentService.getBillers(categoryCode, 'NG');
      const biller = billers.find((entry: FlutterwaveBiller) => entry.billerCode === billerCode);
      if (!biller) {
        throw new Error('Selected biller is unavailable');
      }
      billerName = biller.name;

      const items = await this.flutterwaveBillPaymentService.getBillItems(billerCode);
      item = this.pickFlutterwaveItem(items, {
        planId: data.planId,
        accountType: data.accountType,
        categoryCode,
      });
    } catch (error: any) {
      throw createProviderUnavailableError(error.message || 'Bill payment service is unavailable');
    }

    const wallet = await this.walletService.getWalletByCurrency(userIdNum, data.currency);
    if (!wallet) {
      throw new Error(`Wallet for ${data.currency} not found`);
    }

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

    if (categoryCode === 'airtime' || categoryCode === 'data') {
      accountNumber = this.normalizeNgPhoneForFlutterwave(accountNumber);
    }

    const isRewardFulfillment = Boolean(rewardContext);
    const resolvedAmountInput = rewardContext
      ? this.rewardFulfillmentService.resolveRewardAmount(
          rewardContext.reward,
          data.amount,
          categoryCode
        )
      : data.amount;

    const amount = this.resolveFlutterwaveAmount(categoryCode, resolvedAmountInput, item);
    const fee = isRewardFulfillment ? 0 : this.calculateFee(amount.toNumber(), data.currency);
    const totalAmount = amount.plus(fee);

    if (!isRewardFulfillment) {
      const walletBalance = new Decimal(wallet.balance);
      if (walletBalance.lessThan(totalAmount)) {
        throw new Error('Insufficient balance');
      }
    }

    if (requiresFlutterwaveCustomerValidation(categoryCode)) {
      try {
        const validation = await this.flutterwaveBillPaymentService.validateCustomer(
          item.itemCode,
          accountNumber
        );
        accountName = validation.name || accountName;
      } catch (error: any) {
        throw createProviderUnavailableError(error.message || 'Customer validation failed');
      }
    }

    const reference = this.generateReference();
    const encodedItemId = encodeFlutterwaveItemId(item.itemCode);
    const transaction = await prisma.transaction.create({
      data: {
        walletId: wallet.id,
        type: 'bill_payment',
        status: 'pending',
        amount: amount.toNumber(),
        currency: data.currency,
        fee: fee,
        reference,
        description: `${categoryName} - ${billerName}`,
        channel: categoryCode,
        country: 'NG',
        metadata: {
          provider: 'flutterwave',
          categoryCode,
          categoryName,
          providerId: encodedProviderId,
          billerId: billerCode,
          billerCode,
          providerCode: billerCode,
          providerName: billerName,
          accountNumber,
          accountName,
          accountType,
          planId: encodedItemId,
          itemId: item.itemCode,
          itemCode: item.itemCode,
          planCode: item.itemCode,
          planName: item.name,
          planDataAmount: item.raw?.dataAmount || null,
          beneficiaryId: beneficiary?.id || null,
          ...(isRewardFulfillment && rewardContext
            ? {
                isRewardFulfillment: true,
                rewardClaimId: rewardContext.claim.id,
                rewardCode: rewardContext.claim.rewardCode,
                rewardAmountNgn: amount.toNumber(),
              }
            : {}),
        },
      },
    });

    return {
      transactionId: transaction.id,
      reference: transaction.reference,
      category: {
        id: category?.id || 0,
        code: categoryCode,
        name: categoryName,
      },
      provider: {
        id: encodedProviderId,
        code: billerCode,
        name: billerName,
        logoUrl: null,
      },
      plan: {
        id: encodedItemId,
        code: item.itemCode,
        name: item.name,
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
    pin?: string,
    emailOtp?: string
  ) {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    const txIdNum = typeof transactionId === 'string' ? parseInt(transactionId, 10) : transactionId;

    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }
    if (isNaN(txIdNum) || txIdNum <= 0) {
      throw new Error(`Invalid transactionId: ${transactionId}`);
    }

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

    await assertTransactionSecurity(transaction.wallet.user, { pin, emailOtp });

    const metadata = transaction.metadata as any;
    if (metadata?.provider === 'flutterwave' || isFlutterwaveBillCategory(metadata?.categoryCode)) {
      return this.confirmFlutterwaveBillPayment(userIdNum, txIdNum, transaction, metadata);
    }

    return this.confirmPalmPayBillPayment(userIdNum, txIdNum, transaction, metadata);
  }

  private async confirmPalmPayBillPayment(
    userIdNum: number,
    txIdNum: number,
    transaction: any,
    metadata: any
  ) {
    const amount = new Decimal(transaction.amount);
    const fee = new Decimal(transaction.fee);
    const totalAmount = amount.plus(fee);
    const isRewardFulfillment = Boolean(metadata?.isRewardFulfillment && metadata?.rewardClaimId);

    if (!isRewardFulfillment) {
      const walletBalance = new Decimal(transaction.wallet.balance);
      if (walletBalance.lessThan(totalAmount)) {
        throw new Error('Insufficient balance');
      }
    }

    if (metadata?.categoryCode !== 'betting' || !isSupportedPalmPayScene(metadata?.categoryCode)) {
      throw createMaintenanceError();
    }

    const palmPayOrderId = `bill_${transaction.reference.toLowerCase()}`;

    const debitedTransaction = isRewardFulfillment
      ? await prisma.transaction.update({
          where: { id: txIdNum },
          data: {
            status: 'processing',
            metadata: {
              ...metadata,
              palmpayOrderId: palmPayOrderId,
              walletDebited: false,
              rewardFulfillment: true,
            },
          },
          include: {
            wallet: {
              include: {
                currencyRef: true,
              },
            },
          },
        })
      : await prisma.$transaction(async (tx) => {
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
      if (isRewardFulfillment && metadata?.rewardClaimId) {
        await this.rewardFulfillmentService.failRewardClaim(
          metadata.rewardClaimId,
          error.message || 'Bill payment failed'
        );
        await prisma.transaction.update({
          where: { id: txIdNum },
          data: {
            status: 'failed',
            metadata: {
              ...metadata,
              palmpayOrderId: palmPayOrderId,
              providerError: error.providerResponse || error.message,
            },
          },
        });
      } else {
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
                refundReason: error.message || 'Bill payment failed',
                providerError: error.providerResponse || error.message,
              },
            },
          });
        });
      }
      throw createProviderUnavailableError(error.message || 'Bill payment failed');
    }

    const mappedStatus = mapPalmPayStatus(palmPayOrder.orderStatus);

    if (isRewardFulfillment && metadata?.rewardClaimId) {
      if (mappedStatus === 'completed') {
        await this.rewardFulfillmentService.completeRewardClaim(
          metadata.rewardClaimId,
          txIdNum
        );
      } else if (mappedStatus === 'failed' || mappedStatus === 'cancelled') {
        await this.rewardFulfillmentService.failRewardClaim(
          metadata.rewardClaimId,
          'Bill payment provider returned failed status'
        );
      }
    }

    // Immediate refund when PalmPay returns failed/cancelled after debit
    if (
      (mappedStatus === 'failed' || mappedStatus === 'cancelled') &&
      !isRewardFulfillment
    ) {
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
            status: mappedStatus,
            metadata: {
              ...metadata,
              palmpayOrderId: palmPayOrderId,
              palmpayOrderNo: palmPayOrder.orderNo,
              palmpayStatus: palmPayOrder.orderStatus,
              palmpayRequestId: palmPayOrder.requestId,
              providerResponse: palmPayOrder,
              walletDebited: true,
              refunded: true,
              refundReason: `PalmPay returned ${mappedStatus} status`,
            },
          },
        });
      });

      this.notifyBillResult(
        userIdNum,
        amount,
        transaction,
        { reference: transaction.reference, status: mappedStatus },
        metadata,
        mappedStatus
      );

      return {
        id: txIdNum,
        reference: transaction.reference,
        status: mappedStatus,
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
        plan: metadata?.planId
          ? {
              id: metadata.planId,
              code: metadata.planCode,
              name: metadata.planName,
              dataAmount: metadata.planDataAmount,
            }
          : null,
        completedAt: null,
        createdAt: debitedTransaction.createdAt,
      };
    }

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
          walletDebited: !isRewardFulfillment,
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

    this.notifyBillResult(userIdNum, amount, transaction, updatedTransaction, metadata, mappedStatus);

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
      plan: metadata?.planId
        ? {
            id: metadata.planId,
            code: metadata.planCode,
            name: metadata.planName,
            dataAmount: metadata.planDataAmount,
          }
        : null,
      completedAt: updatedTransaction.completedAt,
      createdAt: debitedTransaction.createdAt,
    };
  }

  private async confirmFlutterwaveBillPayment(
    userIdNum: number,
    txIdNum: number,
    transaction: any,
    metadata: any
  ) {
    const amount = new Decimal(transaction.amount);
    const fee = new Decimal(transaction.fee);
    const totalAmount = amount.plus(fee);
    const isRewardFulfillment = Boolean(metadata?.isRewardFulfillment && metadata?.rewardClaimId);

    if (!isRewardFulfillment) {
      const walletBalance = new Decimal(transaction.wallet.balance);
      if (walletBalance.lessThan(totalAmount)) {
        throw new Error('Insufficient balance');
      }
    }

    if (!isFlutterwaveBillCategory(metadata?.categoryCode)) {
      throw createMaintenanceError();
    }

    const flwReference = `flw_bill_${transaction.reference.toLowerCase()}`;
    const billerCode = metadata.billerCode || metadata.billerId;
    const itemCode = metadata.itemCode || metadata.itemId;

    if (!billerCode || !itemCode) {
      throw new Error('Missing Flutterwave biller or item details');
    }

    const debitedTransaction = isRewardFulfillment
      ? await prisma.transaction.update({
          where: { id: txIdNum },
          data: {
            status: 'processing',
            metadata: {
              ...metadata,
              provider: 'flutterwave',
              flwReference,
              walletDebited: false,
              rewardFulfillment: true,
            },
          },
          include: {
            wallet: {
              include: {
                currencyRef: true,
              },
            },
          },
        })
      : await prisma.$transaction(async (tx) => {
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
                provider: 'flutterwave',
                flwReference,
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

    let flwResult: any;
    try {
      flwResult = await this.flutterwaveBillPaymentService.createBillPayment({
        billerCode,
        itemCode,
        country: 'NG',
        customerId: metadata.accountNumber,
        amount: amount.toNumber(),
        reference: flwReference,
        callbackUrl: this.getBillCallbackUrl(),
      });
    } catch (error: any) {
      if (isRewardFulfillment && metadata?.rewardClaimId) {
        await this.rewardFulfillmentService.failRewardClaim(
          metadata.rewardClaimId,
          error.message || 'Bill payment failed'
        );
        await prisma.transaction.update({
          where: { id: txIdNum },
          data: {
            status: 'failed',
            metadata: {
              ...metadata,
              provider: 'flutterwave',
              flwReference,
              providerError: error.providerResponse || error.message,
            },
          },
        });
      } else {
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
                provider: 'flutterwave',
                flwReference,
                refunded: true,
                refundReason: error.message || 'Bill payment failed',
                providerError: error.providerResponse || error.message,
              },
            },
          });
        });
      }
      throw createProviderUnavailableError(error.message || 'Bill payment failed');
    }

    let mappedStatus = (flwResult.mappedStatus || 'pending') as MappedBillStatus;

    // Always try a status poll once after create — FLW often returns pending first.
    try {
      const status = await this.flutterwaveBillPaymentService.getBillStatus(flwReference);
      if (status.mappedStatus !== 'pending') {
        mappedStatus = status.mappedStatus;
      }
      flwResult = { ...flwResult, statusPoll: status };
    } catch {
      // Keep create-response status; webhook/sync may finalize later
    }

    // Persist provider refs before finalize so webhooks/sync can find the tx.
    await prisma.transaction.update({
      where: { id: txIdNum },
      data: {
        metadata: {
          ...metadata,
          provider: 'flutterwave',
          flwReference,
          flwTxRef: flwResult.txRef,
          flwProviderReference: flwResult.reference,
          rechargeToken: flwResult.rechargeToken || null,
          providerResponse: flwResult,
          walletDebited: !isRewardFulfillment,
        },
      },
    });

    if (mappedStatus !== 'pending') {
      await this.flutterwaveWebhookService.finalizeFlutterwaveBillPayment(
        txIdNum,
        mappedStatus,
        {
          source: 'confirm',
          ...flwResult.raw,
          tx_ref: flwResult.txRef,
          reference: flwResult.reference,
          recharge_token: flwResult.rechargeToken,
          mappedStatus,
        }
      );
    } else {
      await prisma.transaction.update({
        where: { id: txIdNum },
        data: {
          status: 'processing',
          metadata: {
            ...metadata,
            provider: 'flutterwave',
            flwReference,
            flwTxRef: flwResult.txRef,
            flwProviderReference: flwResult.reference,
            rechargeToken: flwResult.rechargeToken || null,
            providerResponse: flwResult,
            walletDebited: !isRewardFulfillment,
          },
        },
      });
      this.notifyBillResult(
        userIdNum,
        amount,
        transaction,
        { reference: transaction.reference, status: 'processing' },
        metadata,
        'pending'
      );
    }

    const updatedTransaction = await prisma.transaction.findUnique({
      where: { id: txIdNum },
      include: {
        wallet: {
          include: {
            currencyRef: true,
          },
        },
      },
    });

    if (!updatedTransaction) {
      throw new Error('Transaction not found after confirm');
    }

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
      orderId: flwReference,
      orderNo: flwResult.txRef || flwResult.reference,
      rechargeToken:
        (updatedTransaction.metadata as any)?.rechargeToken || flwResult.rechargeToken || null,
      category: {
        code: metadata?.categoryCode || null,
        name: metadata?.categoryName || null,
      },
      provider: {
        id: metadata?.providerId || null,
        code: metadata?.providerCode || null,
        name: metadata?.providerName || null,
      },
      plan: metadata?.planId
        ? {
            id: metadata.planId,
            code: metadata.planCode,
            name: metadata.planName,
            dataAmount: metadata.planDataAmount,
          }
        : null,
      completedAt: updatedTransaction.completedAt,
      createdAt: debitedTransaction.createdAt,
    };
  }

  /**
   * Sync bill payment status from provider (Flutterwave poll / idempotent finalize).
   */
  async syncBillPaymentStatus(userId: string | number, transactionId: string | number) {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    const txIdNum = typeof transactionId === 'string' ? parseInt(transactionId, 10) : transactionId;

    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }
    if (isNaN(txIdNum) || txIdNum <= 0) {
      throw new Error(`Invalid transactionId: ${transactionId}`);
    }

    const transaction = await prisma.transaction.findUnique({
      where: { id: txIdNum },
      include: { wallet: true },
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

    const metadata = (transaction.metadata as any) || {};

    if (
      (metadata.provider === 'flutterwave' || isFlutterwaveBillCategory(metadata.categoryCode)) &&
      ['pending', 'processing'].includes(transaction.status)
    ) {
      await this.flutterwaveWebhookService.syncBillPaymentStatus(txIdNum);
    }

    const updated = await prisma.transaction.findUnique({
      where: { id: txIdNum },
      include: { wallet: true },
    });

    if (!updated) {
      throw new Error('Transaction not found');
    }

    const meta = (updated.metadata as any) || {};
    return {
      id: updated.id,
      reference: updated.reference,
      status: updated.status,
      amount: updated.amount.toString(),
      currency: updated.currency,
      fee: updated.fee?.toString?.() || String(updated.fee || 0),
      accountNumber: meta.accountNumber || null,
      accountName: meta.accountName || null,
      rechargeToken: meta.rechargeToken || null,
      category: {
        code: meta.categoryCode || null,
        name: meta.categoryName || null,
      },
      provider: {
        id: meta.providerId || null,
        code: meta.providerCode || null,
        name: meta.providerName || null,
        type: meta.provider || null,
      },
      completedAt: updated.completedAt,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  private notifyBillResult(
    userIdNum: number,
    amount: Decimal,
    transaction: any,
    updatedTransaction: any,
    metadata: any,
    mappedStatus: string
  ) {
    if (mappedStatus === 'completed') {
      notifyBillPayment(userIdNum, {
        amount: amount.toString(),
        currency: transaction.currency,
        reference: updatedTransaction.reference,
        status: 'success',
        categoryName: metadata?.categoryName,
      });
    } else if (mappedStatus === 'failed' || mappedStatus === 'cancelled') {
      notifyBillPayment(userIdNum, {
        amount: amount.toString(),
        currency: transaction.currency,
        reference: updatedTransaction.reference,
        status: 'error',
        categoryName: metadata?.categoryName,
        message:
          mappedStatus === 'cancelled'
            ? 'Your bill payment was cancelled.'
            : 'Your bill payment could not be completed.',
      });
    } else {
      notifyBillPayment(userIdNum, {
        amount: amount.toString(),
        currency: transaction.currency,
        reference: updatedTransaction.reference,
        status: 'info',
        categoryName: metadata?.categoryName,
        message: 'Your bill payment is being processed.',
      });
    }
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
