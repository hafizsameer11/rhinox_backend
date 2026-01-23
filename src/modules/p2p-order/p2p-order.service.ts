import { Decimal } from 'decimal.js';
import prisma from '../../core/config/database.js';
import { Prisma } from '@prisma/client';
import { generateOTP } from '../../core/utils/email.service.js';
import { sendOTPEmail } from '../../core/utils/email.service.js';

/**
 * P2P Order Service
 * Manages P2P orders with Binance/Bybit-style role-based logic
 * 
 * CORE INVARIANT: Crypto ALWAYS moves from SELLER → BUYER
 * 
 * ROLE RESOLUTION:
 * - ad.type = 'BUY' → Vendor is BUYER, User is SELLER
 * - ad.type = 'SELL' → Vendor is SELLER, User is BUYER
 */
export class P2POrderService {
  /**
   * Generate unique transaction reference
   */
  private generateReference(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `P2P-${timestamp}-${random}`;
  }

  /**
   * Resolve buyer and seller based on ad type
   * @param adType - 'buy' or 'sell' (from ad perspective)
   * @param vendorId - Ad owner (vendor)
   * @param userId - User creating the order
   * @returns {buyerId, sellerId}
   */
  private resolveRoles(adType: string, vendorId: string, userId: string): { buyerId: string; sellerId: string } {
    if (adType === 'buy') {
      // Vendor BUY ad: Vendor wants to BUY crypto
      // Vendor is BUYER, User is SELLER
      return { buyerId: vendorId, sellerId: userId };
    } else {
      // Vendor SELL ad: Vendor wants to SELL crypto
      // Vendor is SELLER, User is BUYER
      return { buyerId: userId, sellerId: vendorId };
    }
  }

  /**
   * Get user-facing action label (for API responses only)
   * @param adType - 'buy' or 'sell' (from ad perspective)
   * @returns 'buy' or 'sell' (from user perspective)
   */
  private getUserAction(adType: string): 'buy' | 'sell' {
    // Vendor BUY ad → User sees as SELL action
    // Vendor SELL ad → User sees as BUY action
    return adType === 'buy' ? 'sell' : 'buy';
  }

  /**
   * Record P2P transaction
   * For crypto, finds or creates a Wallet for the user/currency
   */
  private async recordTransaction(
    walletIdOrUserId: string,
    orderId: string,
    adId: string,
    data: {
      type: 'p2p';
      status: string;
      amount: Decimal;
      currency: string;
      description: string;
      metadata: any;
      isCrypto?: boolean; // If true, walletIdOrUserId is userId
    }
  ) {
    let walletId = walletIdOrUserId;

    // If crypto, find or create Wallet
    if (data.isCrypto) {
      const parsedUserId = typeof walletIdOrUserId === 'string' ? parseInt(walletIdOrUserId, 10) : walletIdOrUserId;
      if (isNaN(parsedUserId) || parsedUserId <= 0) {
        throw new Error('Invalid user ID format');
      }

      // Find existing crypto wallet
      let wallet = await prisma.wallet.findFirst({
        where: {
          userId: parsedUserId,
          currency: data.currency,
          type: 'crypto',
        },
      });

      // Create if doesn't exist
      if (!wallet) {
        wallet = await prisma.wallet.create({
          data: {
            userId: parsedUserId,
            currency: data.currency,
            type: 'crypto',
            balance: new Decimal(0).toNumber(),
            lockedBalance: new Decimal(0).toNumber(),
          },
        });
      }

      walletId = wallet.id.toString();
    }

    const parsedWalletId = typeof walletId === 'string' ? parseInt(walletId, 10) : walletId;
    if (isNaN(parsedWalletId) || parsedWalletId <= 0) {
      throw new Error('Invalid wallet ID format');
    }

    const parsedOrderId = typeof orderId === 'string' ? parseInt(orderId, 10) : orderId;
    if (isNaN(parsedOrderId) || parsedOrderId <= 0) {
      throw new Error('Invalid order ID format');
    }

    const parsedAdId = typeof adId === 'string' ? parseInt(adId, 10) : adId;
    if (isNaN(parsedAdId) || parsedAdId <= 0) {
      throw new Error('Invalid ad ID format');
    }

    const reference = this.generateReference();
    
    return await prisma.transaction.create({
      data: {
        walletId: parsedWalletId,
        type: 'p2p',
        status: data.status,
        amount: data.amount.toNumber(),
        currency: data.currency,
        fee: new Decimal(0).toNumber(),
        reference,
        channel: 'p2p',
        description: data.description,
        metadata: {
          ...data.metadata,
          orderId,
          adId,
          p2pStep: data.metadata.p2pStep || 'unknown',
        },
      },
    });
  }

  /**
   * Browse all available ads (public)
   * API Visibility: Transform ad.type to user perspective
   */
  async browseAds(filters: {
    type?: 'buy' | 'sell'; // User perspective: what action they want to take
    cryptoCurrency?: string;
    fiatCurrency?: string;
    countryCode?: string;
    minPrice?: string;
    maxPrice?: string;
    limit?: number;
    offset?: number;
  }) {
    const where: any = {
      status: 'available',
      isOnline: true,
    };

    // Convert user perspective to ad perspective
    // User wants to BUY → Show vendor SELL ads
    // User wants to SELL → Show vendor BUY ads
    if (filters.type) {
      where.type = filters.type === 'buy' ? 'sell' : 'buy';
    }

    if (filters.cryptoCurrency) {
      where.cryptoCurrency = filters.cryptoCurrency.toUpperCase();
    }

    if (filters.fiatCurrency) {
      where.fiatCurrency = filters.fiatCurrency.toUpperCase();
    }

    if (filters.countryCode) {
      where.countryCode = filters.countryCode.toUpperCase();
    }

    if (filters.minPrice || filters.maxPrice) {
      where.price = {};
      if (filters.minPrice) {
        where.price.gte = new Decimal(filters.minPrice);
      }
      if (filters.maxPrice) {
        where.price.lte = new Decimal(filters.maxPrice);
      }
    }

    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const ads = await prisma.p2PAd.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: [
        { createdAt: 'desc' },
      ],
      take: limit,
      skip: offset,
    });

    // Get all payment method IDs from all ads to fetch in one query
    const allPaymentMethodIds = new Set<number>();
    ads.forEach((ad: any) => {
      const paymentMethodIdsRaw = ad.paymentMethodIds as any;
      if (Array.isArray(paymentMethodIdsRaw)) {
        paymentMethodIdsRaw.forEach((id: any) => {
          const num = typeof id === 'string' ? parseInt(id, 10) : id;
          if (!isNaN(num) && num > 0) {
            allPaymentMethodIds.add(num);
          }
        });
      }
    });

    // Fetch all payment methods in one query
    const allPaymentMethods = await prisma.userPaymentMethod.findMany({
      where: {
        id: { in: Array.from(allPaymentMethodIds) },
        isActive: true,
      },
      include: {
        provider: true,
      },
    });

    // Create a map for quick lookup
    const paymentMethodsMap = new Map(
      allPaymentMethods.map((pm: any) => [pm.id, pm])
    );

    return ads.map((ad: any) => {
      // Transform to user perspective
      const userAction = this.getUserAction(ad.type);
      
      // Parse payment method IDs for consistency (same logic as getAdDetails and createOrder)
      const paymentMethodIdsRaw = ad.paymentMethodIds as any;
      let parsedPaymentMethodIds: number[] = [];
      
      if (Array.isArray(paymentMethodIdsRaw)) {
        parsedPaymentMethodIds = paymentMethodIdsRaw.map((id: any) => {
          const num = typeof id === 'string' ? parseInt(id, 10) : id;
          return isNaN(num) ? null : num;
        }).filter((id: any) => id !== null) as number[];
      }

      // Get payment methods for this ad
      const paymentMethods = parsedPaymentMethodIds
        .map((id: number) => paymentMethodsMap.get(id))
        .filter((pm: any) => pm !== undefined)
        .map((pm: any) => ({
          id: pm.id,
          type: pm.type,
          accountType: pm.accountType,
          bankName: pm.bankName,
          accountNumber: pm.accountNumber ? this.maskAccountNumber(pm.accountNumber) : null,
          accountName: pm.accountName,
          provider: pm.provider ? {
            id: pm.provider.id,
            name: pm.provider.name,
            code: pm.provider.code,
          } : null,
          phoneNumber: pm.phoneNumber ? this.maskPhoneNumber(pm.phoneNumber) : null,
          countryCode: pm.countryCode,
          currency: pm.currency,
        }));
      
      return {
        id: ad.id,
        type: ad.type, // Keep original for internal use
        userAction, // User-facing: what action user can take
        cryptoCurrency: ad.cryptoCurrency,
        fiatCurrency: ad.fiatCurrency,
        price: ad.price.toString(),
        volume: ad.volume.toString(),
        minOrder: ad.minOrder.toString(),
        maxOrder: ad.maxOrder.toString(),
        autoAccept: ad.autoAccept,
        paymentMethodIds: parsedPaymentMethodIds, // Return parsed numbers for consistency
        paymentMethods: paymentMethods, // Return full payment method objects
        status: ad.status,
        isOnline: ad.isOnline,
        ordersReceived: ad.ordersReceived,
        responseTime: ad.responseTime,
        processingTime: ad.processingTime,
        score: ad.score?.toString(),
        countryCode: ad.countryCode,
        description: ad.description,
        vendor: {
          id: ad.user.id,
          name: `${ad.user.firstName} ${ad.user.lastName}`,
          email: ad.user.email,
          phone: ad.user.phone,
        },
        createdAt: ad.createdAt,
        updatedAt: ad.updatedAt,
      };
    });
  }

  /**
   * Get ad details (public)
   * API Visibility: Transform ad.type to user perspective
   */
  async getAdDetails(adId: string) {
    const parsedAdId = typeof adId === 'string' ? parseInt(adId, 10) : adId;
    if (isNaN(parsedAdId) || parsedAdId <= 0) {
      throw new Error('Invalid ad ID format');
    }

    const ad = await prisma.p2PAd.findUnique({
      where: { id: parsedAdId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    if (!ad) {
      throw new Error('Ad not found');
    }

    // Get payment methods for this ad
    // paymentMethodIds is stored as JSON, could be array of numbers or strings
    const paymentMethodIdsRaw = ad.paymentMethodIds as any;
    let parsedPaymentMethodIds: number[] = [];
    
    if (Array.isArray(paymentMethodIdsRaw)) {
      // Convert all to numbers for consistent comparison
      parsedPaymentMethodIds = paymentMethodIdsRaw.map((id: any) => {
        const num = typeof id === 'string' ? parseInt(id, 10) : id;
        return isNaN(num) ? null : num;
      }).filter((id: any) => id !== null) as number[];
    }
    
    const paymentMethods = await prisma.userPaymentMethod.findMany({
      where: {
        id: { in: parsedPaymentMethodIds },
        isActive: true,
      },
      include: {
        provider: true,
      },
    });

    // Transform to user perspective
    const userAction = this.getUserAction(ad.type);

    return {
      id: ad.id,
      type: ad.type, // Keep original
      userAction, // User-facing
      cryptoCurrency: ad.cryptoCurrency,
      fiatCurrency: ad.fiatCurrency,
      price: ad.price.toString(),
      volume: ad.volume.toString(),
      minOrder: ad.minOrder.toString(),
      maxOrder: ad.maxOrder.toString(),
      autoAccept: ad.autoAccept,
      paymentMethodIds: parsedPaymentMethodIds, // Return parsed numbers for consistency
      // IMPORTANT: These are the VENDOR's payment methods (for display only)
      // User must select their OWN payment method that matches one of these types
      // For RhinoxPay ID: User needs their own RhinoxPay ID payment method
      // For bank accounts: User needs a bank account with the same bank name
      // For mobile money: User needs mobile money with the same provider
      paymentMethods: paymentMethods.map((pm: any) => ({
        id: pm.id, // VENDOR's payment method ID - DO NOT USE THIS for order creation
        type: pm.type,
        accountType: pm.accountType,
        bankName: pm.bankName,
        accountNumber: pm.accountNumber ? this.maskAccountNumber(pm.accountNumber) : null,
        accountName: pm.accountName,
        provider: pm.provider ? {
          id: pm.provider.id,
          name: pm.provider.name,
          code: pm.provider.code,
        } : null,
        phoneNumber: pm.phoneNumber ? this.maskPhoneNumber(pm.phoneNumber) : null,
        countryCode: pm.countryCode,
        currency: pm.currency,
        _isVendorMethod: true, // Flag to indicate this is vendor's method
      })),
      status: ad.status,
      isOnline: ad.isOnline,
      ordersReceived: ad.ordersReceived,
      responseTime: ad.responseTime,
      processingTime: ad.processingTime,
      score: ad.score?.toString(),
      countryCode: ad.countryCode,
      description: ad.description,
      vendor: {
        id: ad.user.id,
        name: `${ad.user.firstName} ${ad.user.lastName}`,
        email: ad.user.email,
        phone: ad.user.phone,
      },
      createdAt: ad.createdAt,
      updatedAt: ad.updatedAt,
    };
  }

  /**
   * Create order from ad
   * User enters cryptoAmount (quantity they want to buy/sell)
   */
  async createOrder(
    userId: string,
    data: {
      adId: string;
      cryptoAmount: string; // Quantity user wants to buy/sell
      paymentMethodId: string;
    }
  ) {
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }

    const parsedAdId = typeof data.adId === 'string' ? parseInt(data.adId, 10) : data.adId;
    if (isNaN(parsedAdId) || parsedAdId <= 0) {
      throw new Error('Invalid ad ID format');
    }

    // Get ad
    const ad = await prisma.p2PAd.findUnique({
      where: { id: parsedAdId },
      include: {
        user: true,
      },
    });

    if (!ad) {
      throw new Error('Ad not found');
    }

    if (ad.status !== 'available') {
      throw new Error('Ad is not available');
    }

    if (!ad.isOnline) {
      throw new Error('Vendor is offline');
    }

    // Resolve roles
    const { buyerId, sellerId } = this.resolveRoles(ad.type, ad.userId.toString(), parsedUserId.toString());

    // Parse payment method ID
    const parsedPaymentMethodId = typeof data.paymentMethodId === 'string' ? parseInt(data.paymentMethodId, 10) : data.paymentMethodId;
    if (isNaN(parsedPaymentMethodId) || parsedPaymentMethodId <= 0) {
      throw new Error('Invalid payment method ID format');
    }

    // Get vendor's accepted payment methods from ad
    const paymentMethodIdsRaw = ad.paymentMethodIds as any;
    let vendorPaymentMethodIds: number[] = [];
    
    if (Array.isArray(paymentMethodIdsRaw)) {
      vendorPaymentMethodIds = paymentMethodIdsRaw.map((id: any) => {
        const num = typeof id === 'string' ? parseInt(id, 10) : id;
        return isNaN(num) ? null : num;
      }).filter((id: any) => id !== null) as number[];
    }

    // Get vendor's payment methods to match against
    const vendorPaymentMethods = await prisma.userPaymentMethod.findMany({
      where: {
        id: { in: vendorPaymentMethodIds },
        isActive: true,
      },
    });

    // Get user's payment method (the one they want to use)
    const userPaymentMethod = await prisma.userPaymentMethod.findUnique({
      where: { id: parsedPaymentMethodId },
    });

    if (!userPaymentMethod) {
      throw new Error(`Payment method with ID ${parsedPaymentMethodId} not found. Please select a valid payment method.`);
    }

    if (!userPaymentMethod.isActive) {
      throw new Error('Payment method is inactive. Please select an active payment method.');
    }

    // Validate user's payment method belongs to them
    // Convert both to numbers for comparison to avoid type mismatch issues
    const userPaymentMethodUserId = typeof userPaymentMethod.userId === 'string' 
      ? parseInt(userPaymentMethod.userId, 10) 
      : userPaymentMethod.userId;
    
    if (userPaymentMethodUserId !== parsedUserId) {
      // User selected vendor's payment method - help them find their own
      // Check if user has a matching payment method type
      const userMatchingMethods = await prisma.userPaymentMethod.findMany({
        where: {
          userId: parsedUserId,
          type: userPaymentMethod.type,
          isActive: true,
        },
      });

      let helpfulMessage = '';
      if (userMatchingMethods.length > 0) {
        // User has matching payment methods - suggest using one of those
        helpfulMessage = `You selected the vendor's ${userPaymentMethod.type} payment method. ` +
          `You have ${userMatchingMethods.length} ${userPaymentMethod.type} payment method(s) of your own. ` +
          `Please select one of your own payment methods (IDs: ${userMatchingMethods.map((m: any) => m.id).join(', ')}) instead.`;
      } else {
        // User doesn't have a matching payment method - guide them to create one
        if (userPaymentMethod.type === 'rhinoxpay_id') {
          helpfulMessage = `You selected the vendor's RhinoxPay ID payment method. ` +
            `You need to create your own RhinoxPay ID payment method first. ` +
            `Please go to Payment Settings and add your RhinoxPay ID, then select it when creating the order.`;
        } else if (userPaymentMethod.type === 'bank_account') {
          helpfulMessage = `You selected the vendor's bank account payment method. ` +
            `You need to add a bank account with the same bank (${userPaymentMethod.bankName || 'same bank'}) to your payment methods first.`;
        } else {
          helpfulMessage = `You selected the vendor's ${userPaymentMethod.type} payment method. ` +
            `You need to add your own ${userPaymentMethod.type} payment method first.`;
        }
      }
      
      console.error('[P2P Order] Payment method ownership check failed:', {
        userId: parsedUserId,
        paymentMethodId: parsedPaymentMethodId,
        paymentMethodUserId: userPaymentMethodUserId,
        paymentMethodType: userPaymentMethod.type,
        userHasMatchingMethods: userMatchingMethods.length,
        userMatchingMethodIds: userMatchingMethods.map((m: any) => m.id),
      });
      
      throw new Error(helpfulMessage);
    }

    // Match user's payment method with vendor's accepted payment methods
    // Match by: bankName (for bank_account) or provider (for mobile_money) or type (for rhinoxpay_id)
    // This allows users to use their own payment method as long as it matches vendor's accepted type/bank/provider
    
    console.log('[P2P Order] Payment method matching:', {
      userId: parsedUserId,
      userPaymentMethodId: parsedPaymentMethodId,
      userPaymentMethodType: userPaymentMethod.type,
      userPaymentMethodBank: userPaymentMethod.bankName,
      userPaymentMethodProvider: userPaymentMethod.providerId,
      vendorPaymentMethodsCount: vendorPaymentMethods.length,
      vendorPaymentMethods: vendorPaymentMethods.map((pm: any) => ({
        id: pm.id,
        type: pm.type,
        bankName: pm.bankName,
        providerId: pm.providerId,
      })),
    });

    const matchedVendorMethod = vendorPaymentMethods.find((vendorPm: any) => {
      // For bank accounts: match by bankName (case-insensitive)
      if (userPaymentMethod.type === 'bank_account' && vendorPm.type === 'bank_account') {
        const userBank = (userPaymentMethod.bankName || '').toLowerCase().trim();
        const vendorBank = (vendorPm.bankName || '').toLowerCase().trim();
        return userBank === vendorBank && userBank !== '';
      }
      // For mobile money: match by provider
      if (userPaymentMethod.type === 'mobile_money' && vendorPm.type === 'mobile_money') {
        return userPaymentMethod.providerId === vendorPm.providerId;
      }
      // For rhinoxpay_id: match by type (both must be rhinoxpay_id)
      // Note: For RhinoxPay ID, we only match by type since each user has their own RhinoxPay ID
      // The actual payment will use the user's wallet, but we match to ensure vendor accepts RhinoxPay ID
      if (userPaymentMethod.type === 'rhinoxpay_id' && vendorPm.type === 'rhinoxpay_id') {
        // Additional validation: ensure currency matches if specified
        // This ensures user's RhinoxPay ID currency matches vendor's accepted currency
        if (userPaymentMethod.currency && vendorPm.currency) {
          return userPaymentMethod.currency === vendorPm.currency;
        }
        // If currency not specified, just match by type
        return true;
      }
      return false;
    });

    console.log('[P2P Order] Matching result:', {
      matched: !!matchedVendorMethod,
      matchedVendorMethodId: matchedVendorMethod?.id,
    });

    if (!matchedVendorMethod) {
      const vendorMethodTypes = vendorPaymentMethods.map((pm: any) => {
        if (pm.type === 'bank_account') return pm.bankName || 'Unknown Bank';
        if (pm.type === 'mobile_money') return `Mobile Money (Provider ID: ${pm.providerId})`;
        if (pm.type === 'rhinoxpay_id') {
          return `RhinoxPay ID${pm.currency ? ` (${pm.currency})` : ''}`;
        }
        return pm.type;
      }).join(', ');
      
      const userMethodDisplay = userPaymentMethod.type === 'bank_account' 
        ? (userPaymentMethod.bankName || 'Unknown Bank')
        : userPaymentMethod.type === 'rhinoxpay_id'
        ? `RhinoxPay ID${userPaymentMethod.currency ? ` (${userPaymentMethod.currency})` : ''}`
        : userPaymentMethod.type;
      
      // Special message for RhinoxPay ID
      if (userPaymentMethod.type === 'rhinoxpay_id') {
        const vendorHasRhinoxPay = vendorPaymentMethods.some((pm: any) => pm.type === 'rhinoxpay_id');
        if (!vendorHasRhinoxPay) {
          throw new Error(
            `You selected RhinoxPay ID as your payment method, but the vendor does not accept RhinoxPay ID. ` +
            `Vendor accepts: ${vendorMethodTypes}. Please select a different payment method or choose a different ad.`
          );
        } else {
          // Vendor accepts RhinoxPay ID but currency might not match
          throw new Error(
            `Your RhinoxPay ID payment method${userPaymentMethod.currency ? ` (${userPaymentMethod.currency})` : ''} ` +
            `does not match the vendor's accepted RhinoxPay ID payment methods. ` +
            `Vendor accepts: ${vendorMethodTypes}. ` +
            `Please ensure your RhinoxPay ID currency matches the vendor's accepted currency.`
          );
        }
      }
      
      throw new Error(
        `Your payment method (${userMethodDisplay}) does not match any of the vendor's accepted payment methods. ` +
        `Vendor accepts: ${vendorMethodTypes}. Please use a payment method that matches one of these (same bank for bank accounts, same provider for mobile money, same currency for RhinoxPay ID).`
      );
    }

    // Use the matched vendor payment method ID for the order
    // This ensures the order references the vendor's payment method
    const paymentMethod = matchedVendorMethod;
    const vendorPaymentMethodId = matchedVendorMethod.id;

    // Store user's payment method in metadata for reference
    const userPaymentMethodInfo = {
      id: userPaymentMethod.id,
      type: userPaymentMethod.type,
      bankName: userPaymentMethod.bankName,
      accountName: userPaymentMethod.accountName,
      accountNumber: userPaymentMethod.accountNumber ? this.maskAccountNumber(userPaymentMethod.accountNumber) : null,
    };

    // Check if payment method is RhinoxPay ID
    const isRhinoxPayID = paymentMethod.type === 'rhinoxpay_id';

    // Calculate amounts
    const price = new Decimal(ad.price);
    const cryptoAmount = new Decimal(data.cryptoAmount);
    const fiatAmount = cryptoAmount.mul(price);

    // Validate order limits
    const minOrder = new Decimal(ad.minOrder);
    const maxOrder = new Decimal(ad.maxOrder);

    if (fiatAmount.lt(minOrder)) {
      throw new Error(`Order amount must be at least ${minOrder.toString()} ${ad.fiatCurrency}`);
    }

    if (fiatAmount.gt(maxOrder)) {
      throw new Error(`Order amount must not exceed ${maxOrder.toString()} ${ad.fiatCurrency}`);
    }

    // Validate vendor has sufficient crypto balance (SELLER must have crypto)
    // For SELL ads: Vendor is SELLER, must have crypto
    // For BUY ads: User is SELLER, must have crypto
    const parsedSellerId = typeof sellerId === 'string' ? parseInt(sellerId, 10) : sellerId;
    const sellerVirtualAccount = await prisma.virtualAccount.findFirst({
      where: {
        userId: parsedSellerId,
        currency: ad.cryptoCurrency,
      },
    });

    if (!sellerVirtualAccount) {
      throw new Error('Seller crypto wallet not found');
    }

    const sellerBalance = new Decimal(sellerVirtualAccount.accountBalance || '0');
    const sellerAvailable = new Decimal(sellerVirtualAccount.availableBalance || '0');

    if (sellerAvailable.lt(cryptoAmount)) {
      throw new Error('Insufficient crypto balance available');
    }

    // Validate vendor has sufficient balance for the order
    if (ad.type === 'sell') {
      // Vendor is SELLER, must have crypto balance
      // Validate maxOrder doesn't exceed their crypto balance (ad limit check)
      const maxOrderCrypto = maxOrder.div(price);
      if (sellerBalance.lt(maxOrderCrypto)) {
        throw new Error(`Maximum order amount exceeds vendor's available crypto balance`);
      }
      // Actual order amount is already validated above (sellerAvailable.lt(cryptoAmount))
    } else {
      // For BUY ads: Vendor is BUYER, they need fiat to pay
      // Validate vendor has sufficient fiat balance for THIS ORDER (not maxOrder)
      const parsedBuyerId = typeof buyerId === 'string' ? parseInt(buyerId, 10) : buyerId;
      const buyerFiatWallet = await prisma.wallet.findFirst({
        where: {
          userId: parsedBuyerId, // vendor is buyer for BUY ads
          currency: ad.fiatCurrency,
        },
      });

      if (!buyerFiatWallet) {
        throw new Error('Buyer fiat wallet not found');
      }

      const buyerFiatBalance = new Decimal(buyerFiatWallet.balance || '0');
      const buyerLockedBalance = new Decimal(buyerFiatWallet.lockedBalance || '0');
      const buyerAvailableBalance = buyerFiatBalance.minus(buyerLockedBalance);
      
      // Check actual order amount, not maxOrder
      if (buyerAvailableBalance.lt(fiatAmount)) {
        console.log('[P2P Order] Fiat balance check:', {
          adId: parsedAdId,
          adType: ad.type,
          buyerId: parsedBuyerId,
          fiatCurrency: ad.fiatCurrency,
          fiatAmount: fiatAmount.toString(),
          buyerFiatBalance: buyerFiatBalance.toString(),
          buyerLockedBalance: buyerLockedBalance.toString(),
          buyerAvailableBalance: buyerAvailableBalance.toString(),
          maxOrder: maxOrder.toString(),
        });
        throw new Error(`Insufficient fiat balance. You need ${fiatAmount.toString()} ${ad.fiatCurrency}, but you have ${buyerAvailableBalance.toString()} ${ad.fiatCurrency} available.`);
      }
    }

    // Determine initial status
    let initialStatus = 'pending';
    if (ad.autoAccept) {
      initialStatus = 'awaiting_payment';
    }

    // Create order
    // Store vendorId (ad owner) and userId (order creator)
    // Buyer/seller roles are derived from ad type in resolveRoles()
    const order = await prisma.p2POrder.create({
      data: {
        adId: ad.id,
        vendorId: ad.userId, // Ad owner
        userId: parsedUserId, // User who created the order
        type: ad.type, // Keep ad.type for internal reference
        cryptoCurrency: ad.cryptoCurrency,
        fiatCurrency: ad.fiatCurrency,
        cryptoAmount: cryptoAmount.toString(),
        fiatAmount: fiatAmount.toString(),
        price: price.toString(),
        paymentMethodId: vendorPaymentMethodId, // Use vendor's payment method ID (matched from user's payment method)
        paymentChannel: isRhinoxPayID ? 'rhinoxpay_id' : 'offline',
        status: initialStatus,
        metadata: {
          sellerId,
          buyerId,
          roles: {
            vendorIsBuyer: ad.type === 'buy',
            vendorIsSeller: ad.type === 'sell',
          },
          userPaymentMethod: userPaymentMethodInfo, // Store user's payment method for reference
        },
      },
      include: {
        ad: true,
        vendor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        paymentMethod: true,
      },
    });

    // Record transaction: Order created
    await this.recordTransaction(
      sellerId.toString(), // userId for crypto
      order.id.toString(),
      ad.id.toString(),
      {
        type: 'p2p',
        status: 'pending',
        amount: cryptoAmount,
        currency: ad.cryptoCurrency,
        description: `P2P order created: ${cryptoAmount.toString()} ${ad.cryptoCurrency}`,
        metadata: {
          p2pStep: 'order_created',
          orderId: order.id,
          adId: ad.id,
          buyerId,
          sellerId,
        },
        isCrypto: true,
      }
    ).catch(err => {
      console.error('Failed to record transaction:', err);
      // Don't fail order creation if transaction recording fails
    });

    // Update ad orders received count
    await prisma.p2PAd.update({
      where: { id: ad.id },
      data: {
        ordersReceived: ad.ordersReceived + 1,
      },
    });

    // Initialize chat with welcome message
    await prisma.p2PChatMessage.create({
      data: {
        orderId: order.id,
        senderId: parsedUserId,
        receiverId: ad.userId,
        message: `Order created for ${cryptoAmount.toString()} ${ad.cryptoCurrency} at ${price.toString()} ${ad.fiatCurrency} per unit.`,
      },
    });

    // Auto-accept if enabled
    if (ad.autoAccept) {
      await this.acceptOrder(order.id.toString(), ad.userId.toString());
    }

    // Resolve buyer and seller for response
    const { buyerId: resolvedBuyerId, sellerId: resolvedSellerId } = this.resolveRoles(
      order.type,
      order.vendorId.toString(),
      order.userId.toString()
    );
    
    // Get buyer and seller user objects
    const buyerUser = resolvedBuyerId === order.vendorId.toString() ? order.vendor : order.user;
    const sellerUser = resolvedSellerId === order.vendorId.toString() ? order.vendor : order.user;

    return {
      id: order.id,
      adId: order.adId,
      type: order.type,
      userAction: this.getUserAction(order.type), // User-facing
      cryptoCurrency: order.cryptoCurrency,
      fiatCurrency: order.fiatCurrency,
      cryptoAmount: order.cryptoAmount.toString(),
      fiatAmount: order.fiatAmount.toString(),
      price: order.price.toString(),
      paymentMethodId: order.paymentMethodId,
      paymentChannel: order.paymentChannel,
      status: order.status,
      buyer: buyerUser,
      seller: sellerUser,
      vendor: order.vendor,
      user: order.user,
      paymentMethod: order.paymentMethod ? {
        id: order.paymentMethod.id,
        type: order.paymentMethod.type,
        bankName: order.paymentMethod.bankName,
        accountNumber: order.paymentMethod.accountNumber ? this.maskAccountNumber(order.paymentMethod.accountNumber) : null,
        accountName: order.paymentMethod.accountName,
        phoneNumber: order.paymentMethod.phoneNumber ? this.maskPhoneNumber(order.paymentMethod.phoneNumber) : null,
      } : null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  /**
   * Vendor accepts order
   * Freezes crypto from seller's VirtualAccount
   */
  async acceptOrder(orderId: string, vendorId: string) {
    const parsedOrderId = typeof orderId === 'string' ? parseInt(orderId, 10) : orderId;
    if (isNaN(parsedOrderId) || parsedOrderId <= 0) {
      throw new Error('Invalid order ID format');
    }

    const parsedVendorId = typeof vendorId === 'string' ? parseInt(vendorId, 10) : vendorId;
    if (isNaN(parsedVendorId) || parsedVendorId <= 0) {
      throw new Error('Invalid vendor ID format');
    }

    const order = await prisma.p2POrder.findUnique({
      where: { id: parsedOrderId },
      include: {
        ad: true,
      },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    if (order.vendorId !== parsedVendorId) {
      throw new Error('Only vendor can accept this order');
    }

    if (order.status !== 'pending') {
      throw new Error(`Cannot accept order. Current status: ${order.status}`);
    }

    // Resolve roles - now we have vendorId and userId, derive buyer/seller from ad type
    const { buyerId, sellerId } = this.resolveRoles(
      order.type,
      order.vendorId.toString(),
      order.userId.toString()
    );

    console.log('[P2P Accept Order] Role resolution:', {
      orderId: parsedOrderId,
      orderType: order.type,
      vendorId: order.vendorId,
      userId: order.userId,
      resolvedBuyerId: buyerId,
      resolvedSellerId: sellerId,
      cryptoCurrency: order.cryptoCurrency,
      cryptoAmount: order.cryptoAmount,
    });

    // Get seller's VirtualAccount
    const parsedSellerId = typeof sellerId === 'string' ? parseInt(sellerId, 10) : sellerId;
    const sellerVirtualAccount = await prisma.virtualAccount.findFirst({
      where: {
        userId: parsedSellerId,
        currency: order.cryptoCurrency,
      },
    });

    if (!sellerVirtualAccount) {
      console.log('[P2P Accept Order] Seller VirtualAccount not found:', {
        sellerId: parsedSellerId,
        cryptoCurrency: order.cryptoCurrency,
      });
      throw new Error(`Seller crypto wallet not found for ${order.cryptoCurrency}`);
    }

    const cryptoAmount = new Decimal(order.cryptoAmount);
    const sellerBalance = new Decimal(sellerVirtualAccount.accountBalance || '0');
    const sellerAvailable = new Decimal(sellerVirtualAccount.availableBalance || '0');

    console.log('[P2P Accept Order] Balance check:', {
      sellerId: parsedSellerId,
      cryptoCurrency: order.cryptoCurrency,
      requiredAmount: cryptoAmount.toString(),
      accountBalance: sellerBalance.toString(),
      availableBalance: sellerAvailable.toString(),
      hasEnough: sellerAvailable.gte(cryptoAmount),
    });

    if (sellerAvailable.lt(cryptoAmount)) {
      throw new Error(
        `Insufficient crypto balance available. Seller needs ${cryptoAmount.toString()} ${order.cryptoCurrency}, ` +
        `but has ${sellerAvailable.toString()} ${order.cryptoCurrency} available.`
      );
    }

    // Freeze crypto: Move from availableBalance to locked (via availableBalance reduction)
    const newAvailableBalance = sellerAvailable.minus(cryptoAmount);

    await prisma.virtualAccount.update({
      where: { id: sellerVirtualAccount.id },
      data: {
        availableBalance: newAvailableBalance.toString(),
        // Note: VirtualAccount doesn't have lockedBalance, we track via availableBalance
      },
    });

    // Calculate expiration time
    const processingTimeMinutes = order.ad.processingTime || 30; // Default 30 minutes
    const expiresAt = new Date(Date.now() + processingTimeMinutes * 60 * 1000);

    // Update order status
    const updated = await prisma.p2POrder.update({
      where: { id: parsedOrderId },
      data: {
        status: 'awaiting_payment',
        acceptedAt: new Date(),
        processingTimeMinutes,
        expiresAt,
      },
    });

    // Record transaction: Order accepted, crypto frozen
    await this.recordTransaction(
      sellerId.toString(), // userId for crypto
      order.id.toString(),
      order.adId.toString(),
      {
        type: 'p2p',
        status: 'processing',
        amount: cryptoAmount,
        currency: order.cryptoCurrency,
        description: `P2P order accepted: ${cryptoAmount.toString()} ${order.cryptoCurrency} frozen`,
        metadata: {
          p2pStep: 'order_accepted',
          orderId: order.id,
          adId: order.adId,
          buyerId,
          sellerId,
          frozen: true,
        },
        isCrypto: true,
      }
    ).catch(err => {
      console.error('Failed to record transaction:', err);
    });

    // Send notification message
    await prisma.p2PChatMessage.create({
      data: {
        orderId: order.id,
        senderId: parsedVendorId,
        receiverId: order.userId,
        message: 'Order accepted. Please make payment within the specified time.',
      },
    });

    return {
      id: updated.id,
      status: updated.status,
      acceptedAt: updated.acceptedAt,
      expiresAt: updated.expiresAt,
    };
  }

  /**
   * Vendor declines order
   */
  async declineOrder(orderId: string, vendorId: string) {
    const parsedOrderId = typeof orderId === 'string' ? parseInt(orderId, 10) : orderId;
    if (isNaN(parsedOrderId) || parsedOrderId <= 0) {
      throw new Error('Invalid order ID format');
    }

    const parsedVendorId = typeof vendorId === 'string' ? parseInt(vendorId, 10) : vendorId;
    if (isNaN(parsedVendorId) || parsedVendorId <= 0) {
      throw new Error('Invalid vendor ID format');
    }

    const order = await prisma.p2POrder.findUnique({
      where: { id: parsedOrderId },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    if (order.vendorId !== parsedVendorId) {
      throw new Error('Only vendor can decline this order');
    }

    if (order.status !== 'pending') {
      throw new Error(`Cannot decline order. Current status: ${order.status}`);
    }

    const updated = await prisma.p2POrder.update({
      where: { id: parsedOrderId },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
      },
    });

    // Send notification message
    await prisma.p2PChatMessage.create({
      data: {
        orderId: order.id,
        senderId: parsedVendorId,
        receiverId: order.userId,
        message: 'Order has been declined.',
      },
    });

    return {
      id: updated.id,
      status: updated.status,
      cancelledAt: updated.cancelledAt,
    };
  }

  /**
   * Get order details
   */
  async getOrderDetails(orderId: string, userId: string) {
    const parsedOrderId = typeof orderId === 'string' ? parseInt(orderId, 10) : orderId;
    if (isNaN(parsedOrderId) || parsedOrderId <= 0) {
      throw new Error('Invalid order ID format');
    }

    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }

    const order = await prisma.p2POrder.findUnique({
      where: { id: parsedOrderId },
      include: {
        ad: true,
        vendor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        paymentMethod: {
          include: {
            provider: true,
          },
        },
        chatMessages: {
          orderBy: {
            createdAt: 'asc',
          },
          include: {
            sender: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        reviews: {
          include: {
            reviewer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    // Check if user is vendor (ad owner) or user (order creator)
    const isVendor = order.vendorId === parsedUserId;
    const isUser = order.userId === parsedUserId;
    
    if (!isVendor && !isUser) {
      throw new Error('Unauthorized to view this order');
    }

    // Resolve roles for display - derive from vendorId and userId
    const { buyerId, sellerId } = this.resolveRoles(
      order.type,
      order.vendorId.toString(),
      order.userId.toString()
    );
    
    const parsedBuyerId = typeof buyerId === 'string' ? parseInt(buyerId, 10) : buyerId;
    const parsedSellerId = typeof sellerId === 'string' ? parseInt(sellerId, 10) : sellerId;
    const isUserBuyer = parsedBuyerId === parsedUserId;
    const isUserSeller = parsedSellerId === parsedUserId;

    return {
      id: order.id,
      chatId: order.id, // Chat ID is same as order ID (chat messages are linked via orderId)
      adId: order.adId,
      type: order.type,
      userAction: this.getUserAction(order.type), // User-facing
      cryptoCurrency: order.cryptoCurrency,
      fiatCurrency: order.fiatCurrency,
      cryptoAmount: order.cryptoAmount.toString(),
      fiatAmount: order.fiatAmount.toString(),
      price: order.price.toString(),
      paymentMethodId: order.paymentMethodId,
      paymentChannel: order.paymentChannel,
      status: order.status,
      acceptedAt: order.acceptedAt,
      expiresAt: order.expiresAt,
      paymentConfirmedAt: order.paymentConfirmedAt,
      paymentReceivedAt: order.paymentReceivedAt,
      coinReleasedAt: order.coinReleasedAt,
      completedAt: order.completedAt,
      cancelledAt: order.cancelledAt,
      txId: order.txId,
      buyer: parsedBuyerId === order.vendorId ? order.vendor : order.user,
      seller: parsedSellerId === order.vendorId ? order.vendor : order.user,
      vendor: order.vendor,
      user: order.user,
      isUserBuyer,
      isUserSeller,
      paymentMethod: order.paymentMethod ? {
        id: order.paymentMethod.id,
        type: order.paymentMethod.type,
        bankName: order.paymentMethod.bankName,
        accountNumber: order.paymentMethod.accountNumber ? this.maskAccountNumber(order.paymentMethod.accountNumber) : null,
        accountName: order.paymentMethod.accountName,
        provider: order.paymentMethod.provider ? {
          id: order.paymentMethod.provider.id,
          name: order.paymentMethod.provider.name,
          code: order.paymentMethod.provider.code,
        } : null,
        phoneNumber: order.paymentMethod.phoneNumber ? this.maskPhoneNumber(order.paymentMethod.phoneNumber) : null,
        countryCode: order.paymentMethod.countryCode,
        currency: order.paymentMethod.currency,
      } : null,
      chatMessages: order.chatMessages.map((msg: any) => ({
        id: msg.id,
        message: msg.message,
        senderId: msg.senderId,
        sender: msg.sender,
        receiverId: msg.receiverId,
        isRead: msg.isRead,
        readAt: msg.readAt,
        createdAt: msg.createdAt,
      })),
      reviews: order.reviews.map((review: any) => ({
        id: review.id,
        type: review.type,
        comment: review.comment,
        reviewer: review.reviewer,
        createdAt: review.createdAt,
      })),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  /**
   * Buyer confirms payment made (for offline payments)
   * For RhinoxPay ID, this is automatic
   */
  async confirmPayment(orderId: string, userId: string) {
    const parsedOrderId = typeof orderId === 'string' ? parseInt(orderId, 10) : orderId;
    if (isNaN(parsedOrderId) || parsedOrderId <= 0) {
      throw new Error('Invalid order ID format');
    }

    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }

    const order = await prisma.p2POrder.findUnique({
      where: { id: parsedOrderId },
      include: {
        ad: true,
      },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    // Resolve roles
    const { buyerId } = this.resolveRoles(order.type, order.vendorId.toString(), order.userId.toString());
    const parsedBuyerId = typeof buyerId === 'string' ? parseInt(buyerId, 10) : buyerId;

    if (parsedBuyerId !== parsedUserId) {
      throw new Error('Only buyer can confirm payment');
    }

    if (order.status !== 'awaiting_payment') {
      throw new Error(`Cannot confirm payment. Current status: ${order.status}`);
    }

    // For RhinoxPay ID, payment is automatic - skip to payment_made
    if (order.paymentChannel === 'rhinoxpay_id') {
      // Handle RhinoxPay ID payment automatically
      return await this.handleRhinoxPayPayment(orderId, userId);
    }

    // For offline payments, mark as payment_made
    const updated = await prisma.p2POrder.update({
      where: { id: parsedOrderId },
      data: {
        status: 'payment_made',
        paymentConfirmedAt: new Date(),
      },
    });

    // Record transaction: Payment confirmed
    const buyerWallet = await prisma.wallet.findFirst({
      where: {
        userId: parsedBuyerId,
        currency: order.fiatCurrency,
      },
    });

    if (buyerWallet) {
      await this.recordTransaction(
        buyerWallet.id.toString(),
        order.id.toString(),
        order.adId.toString(),
        {
          type: 'p2p',
          status: 'processing',
          amount: new Decimal(order.fiatAmount),
          currency: order.fiatCurrency,
          description: `P2P payment confirmed: ${order.fiatAmount} ${order.fiatCurrency}`,
          metadata: {
            p2pStep: 'payment_confirmed',
            orderId: order.id,
            adId: order.adId,
            paymentChannel: 'offline',
          },
        }
      ).catch(err => {
        console.error('Failed to record transaction:', err);
      });
    }

    // Send notification message
    await prisma.p2PChatMessage.create({
      data: {
        orderId: order.id,
        senderId: parsedUserId,
        receiverId: order.vendorId,
        message: 'I have made the payment. Please confirm receipt.',
      },
    });

    return {
      id: updated.id,
      status: updated.status,
      paymentConfirmedAt: updated.paymentConfirmedAt,
    };
  }

  /**
   * Handle RhinoxPay ID payment (automatic)
   */
  private async handleRhinoxPayPayment(orderId: string, userId: string) {
    const parsedOrderId = typeof orderId === 'string' ? parseInt(orderId, 10) : orderId;
    if (isNaN(parsedOrderId) || parsedOrderId <= 0) {
      throw new Error('Invalid order ID format');
    }

    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }

    const order = await prisma.p2POrder.findUnique({
      where: { id: parsedOrderId },
      include: {
        ad: true,
      },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    // Resolve roles
    const { buyerId, sellerId } = this.resolveRoles(order.type, order.vendorId.toString(), order.userId.toString());
    const parsedBuyerId = typeof buyerId === 'string' ? parseInt(buyerId, 10) : buyerId;
    const parsedSellerId = typeof sellerId === 'string' ? parseInt(sellerId, 10) : sellerId;

    // Get buyer's fiat wallet
    const buyerWallet = await prisma.wallet.findFirst({
      where: {
        userId: parsedBuyerId,
        currency: order.fiatCurrency,
      },
    });

    if (!buyerWallet) {
      throw new Error('Buyer wallet not found');
    }

    const fiatAmount = new Decimal(order.fiatAmount);
    const buyerBalance = new Decimal(buyerWallet.balance || '0');

    if (buyerBalance.lt(fiatAmount)) {
      throw new Error('Insufficient fiat balance');
    }

    // Get seller's fiat wallet (to receive payment)
    // For SELL ads: seller is vendor, buyer is user
    // For BUY ads: seller is user, buyer is vendor
    const sellerWallet = await prisma.wallet.findFirst({
      where: {
        userId: parsedSellerId, // Seller receives payment
        currency: order.fiatCurrency,
      },
    });

    if (!sellerWallet) {
      throw new Error('Seller wallet not found');
    }

    // Transfer fiat: Buyer → Seller
    const newBuyerBalance = buyerBalance.minus(fiatAmount);
    const newSellerBalance = new Decimal(sellerWallet.balance || '0').plus(fiatAmount);

    await prisma.wallet.update({
      where: { id: buyerWallet.id },
      data: {
        balance: newBuyerBalance.toString(),
      },
    });

    await prisma.wallet.update({
      where: { id: sellerWallet.id },
      data: {
        balance: newSellerBalance.toString(),
      },
    });

    // Record transactions
    await this.recordTransaction(
      buyerWallet.id.toString(),
      order.id.toString(),
      order.adId.toString(),
      {
        type: 'p2p',
        status: 'completed',
        amount: fiatAmount,
        currency: order.fiatCurrency,
        description: `P2P payment (RhinoxPay ID): ${fiatAmount.toString()} ${order.fiatCurrency} to seller`,
        metadata: {
          p2pStep: 'payment_completed_rhinoxpay',
          orderId: order.id,
          adId: order.adId,
          paymentChannel: 'rhinoxpay_id',
          recipientUserId: sellerId,
        },
      }
    ).catch(err => {
      console.error('Failed to record transaction:', err);
    });

    await this.recordTransaction(
      sellerWallet.id.toString(),
      order.id.toString(),
      order.adId.toString(),
      {
        type: 'p2p',
        status: 'completed',
        amount: fiatAmount,
        currency: order.fiatCurrency,
        description: `P2P payment received (RhinoxPay ID): ${fiatAmount.toString()} ${order.fiatCurrency} from buyer`,
        metadata: {
          p2pStep: 'payment_received_rhinoxpay',
          orderId: order.id,
          adId: order.adId,
          paymentChannel: 'rhinoxpay_id',
          senderUserId: buyerId,
        },
      }
    ).catch(err => {
      console.error('Failed to record transaction:', err);
    });

    // Update order: Payment automatically confirmed and received
    const updated = await prisma.p2POrder.update({
      where: { id: parsedOrderId },
      data: {
        status: 'awaiting_coin_release',
        paymentConfirmedAt: new Date(),
        paymentReceivedAt: new Date(),
      },
    });

    // Auto-release crypto
    await this.releaseCrypto(orderId);

    return {
      id: updated.id,
      status: updated.status,
      paymentConfirmedAt: updated.paymentConfirmedAt,
      paymentReceivedAt: updated.paymentReceivedAt,
    };
  }

  /**
   * Mark payment as received (for offline payments)
   * For SELL ads: Vendor (seller) marks payment received
   * For BUY ads: User (seller) marks payment received
   */
  async markPaymentReceived(orderId: string, userId: string) {
    const parsedOrderId = typeof orderId === 'string' ? parseInt(orderId, 10) : orderId;
    if (isNaN(parsedOrderId) || parsedOrderId <= 0) {
      throw new Error('Invalid order ID format');
    }

    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }

    const order = await prisma.p2POrder.findUnique({
      where: { id: parsedOrderId },
      include: {
        ad: true,
      },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    // Resolve roles to determine who should mark payment received
    const { buyerId, sellerId } = this.resolveRoles(order.type, order.vendorId.toString(), order.userId.toString());
    const parsedBuyerId = typeof buyerId === 'string' ? parseInt(buyerId, 10) : buyerId;
    const parsedSellerId = typeof sellerId === 'string' ? parseInt(sellerId, 10) : sellerId;

    // Only seller can mark payment as received
    if (parsedSellerId !== parsedUserId) {
      throw new Error('Only seller can mark payment as received');
    }

    if (order.status !== 'payment_made') {
      throw new Error(`Cannot mark payment as received. Current status: ${order.status}`);
    }

    // Update status to awaiting_coin_release
    const updated = await prisma.p2POrder.update({
      where: { id: parsedOrderId },
      data: {
        status: 'awaiting_coin_release',
        paymentReceivedAt: new Date(),
      },
    });

    // Record transaction: Payment received by seller
    const sellerWallet = await prisma.wallet.findFirst({
      where: {
        userId: parsedSellerId, // Seller receives payment
        currency: order.fiatCurrency,
      },
    });

    if (sellerWallet) {
      await this.recordTransaction(
        sellerWallet.id.toString(),
        order.id.toString(),
        order.adId.toString(),
        {
          type: 'p2p',
          status: 'completed',
          amount: new Decimal(order.fiatAmount),
          currency: order.fiatCurrency,
          description: `P2P payment received: ${order.fiatAmount} ${order.fiatCurrency}`,
          metadata: {
            p2pStep: 'payment_received',
            orderId: order.id,
            adId: order.adId,
            paymentChannel: 'offline',
            senderUserId: buyerId,
          },
        }
      ).catch(err => {
        console.error('Failed to record transaction:', err);
      });
    }

    // Release crypto
    await this.releaseCrypto(orderId);

    return {
      id: updated.id,
      status: updated.status,
      paymentReceivedAt: updated.paymentReceivedAt,
    };
  }

  /**
   * Release crypto: ALWAYS from SELLER → BUYER
   */
  async releaseCrypto(orderId: string) {
    const parsedOrderId = typeof orderId === 'string' ? parseInt(orderId, 10) : orderId;
    if (isNaN(parsedOrderId) || parsedOrderId <= 0) {
      throw new Error('Invalid order ID format');
    }

    const order = await prisma.p2POrder.findUnique({
      where: { id: parsedOrderId },
      include: {
        ad: true,
      },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    if (order.status !== 'awaiting_coin_release') {
      throw new Error(`Cannot release crypto. Current status: ${order.status}`);
    }

    // Resolve roles
    const { buyerId, sellerId } = this.resolveRoles(order.type, order.vendorId.toString(), order.userId.toString());
    const parsedBuyerId = typeof buyerId === 'string' ? parseInt(buyerId, 10) : buyerId;
    const parsedSellerId = typeof sellerId === 'string' ? parseInt(sellerId, 10) : sellerId;

    const cryptoAmount = new Decimal(order.cryptoAmount);

    // Get seller's VirtualAccount (crypto source)
    const sellerVirtualAccount = await prisma.virtualAccount.findFirst({
      where: {
        userId: parsedSellerId,
        currency: order.cryptoCurrency,
      },
    });

    if (!sellerVirtualAccount) {
      throw new Error('Seller crypto wallet not found');
    }

    // Get buyer's VirtualAccount (crypto destination)
    const buyerVirtualAccount = await prisma.virtualAccount.findFirst({
      where: {
        userId: parsedBuyerId,
        currency: order.cryptoCurrency,
      },
    });

    if (!buyerVirtualAccount) {
      throw new Error('Buyer crypto wallet not found');
    }

    // Verify seller has frozen balance available
    const sellerBalance = new Decimal(sellerVirtualAccount.accountBalance || '0');
    const sellerAvailable = new Decimal(sellerVirtualAccount.availableBalance || '0');

    // The frozen amount should be: accountBalance - availableBalance
    const frozenAmount = sellerBalance.minus(sellerAvailable);

    if (frozenAmount.lt(cryptoAmount)) {
      throw new Error('Insufficient frozen crypto balance');
    }

    // Transfer crypto: SELLER → BUYER
    const newSellerBalance = sellerBalance.minus(cryptoAmount);
    const newBuyerBalance = new Decimal(buyerVirtualAccount.accountBalance || '0').plus(cryptoAmount);

    await prisma.virtualAccount.update({
      where: { id: sellerVirtualAccount.id },
      data: {
        accountBalance: newSellerBalance.toString(),
        availableBalance: newSellerBalance.toString(), // Unfreeze by restoring available balance
      },
    });

    await prisma.virtualAccount.update({
      where: { id: buyerVirtualAccount.id },
      data: {
        accountBalance: newBuyerBalance.toString(),
        availableBalance: newBuyerBalance.toString(),
      },
    });

    // Record transactions: Crypto debit and credit
    await this.recordTransaction(
      sellerId.toString(), // userId for crypto
      order.id.toString(),
      order.adId.toString(),
      {
        type: 'p2p',
        status: 'completed',
        amount: cryptoAmount,
        currency: order.cryptoCurrency,
        description: `P2P crypto released: ${cryptoAmount.toString()} ${order.cryptoCurrency} to buyer`,
        metadata: {
          p2pStep: 'crypto_debited',
          orderId: order.id,
          adId: order.adId,
          recipientUserId: buyerId,
        },
        isCrypto: true,
      }
    ).catch(err => {
      console.error('Failed to record transaction:', err);
    });

    await this.recordTransaction(
      buyerId.toString(), // userId for crypto
      order.id.toString(),
      order.adId.toString(),
      {
        type: 'p2p',
        status: 'completed',
        amount: cryptoAmount,
        currency: order.cryptoCurrency,
        description: `P2P crypto received: ${cryptoAmount.toString()} ${order.cryptoCurrency} from seller`,
        metadata: {
          p2pStep: 'crypto_credited',
          orderId: order.id,
          adId: order.adId,
          senderUserId: sellerId,
        },
        isCrypto: true,
      }
    ).catch(err => {
      console.error('Failed to record transaction:', err);
    });

    // Update order status
    const updated = await prisma.p2POrder.update({
      where: { id: parsedOrderId },
      data: {
        status: 'completed',
        coinReleasedAt: new Date(),
        completedAt: new Date(),
      },
    });

    // Send notification message
    await prisma.p2PChatMessage.create({
      data: {
        orderId: order.id,
        senderId: order.vendorId,
        receiverId: order.userId,
        message: `Crypto has been released. Order completed.`,
      },
    });

    return {
      id: updated.id,
      status: updated.status,
      coinReleasedAt: updated.coinReleasedAt,
      completedAt: updated.completedAt,
    };
  }

  /**
   * Cancel order
   */
  async cancelOrder(orderId: string, userId: string) {
    const parsedOrderId = typeof orderId === 'string' ? parseInt(orderId, 10) : orderId;
    if (isNaN(parsedOrderId) || parsedOrderId <= 0) {
      throw new Error('Invalid order ID format');
    }

    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }

    const order = await prisma.p2POrder.findUnique({
      where: { id: parsedOrderId },
      include: {
        ad: true,
      },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    // Only buyer or vendor can cancel
    if (order.userId !== parsedUserId && order.vendorId !== parsedUserId) {
      throw new Error('Unauthorized to cancel this order');
    }

    // Can only cancel if status is pending or awaiting_payment
    if (!['pending', 'awaiting_payment'].includes(order.status)) {
      throw new Error(`Cannot cancel order. Current status: ${order.status}`);
    }

    // If order was accepted, unfreeze crypto
    if (order.status === 'awaiting_payment' && order.acceptedAt) {
      // Resolve roles
      const { sellerId } = this.resolveRoles(order.type, order.vendorId.toString(), order.userId.toString());
      const parsedSellerId = typeof sellerId === 'string' ? parseInt(sellerId, 10) : sellerId;

      const sellerVirtualAccount = await prisma.virtualAccount.findFirst({
        where: {
          userId: parsedSellerId,
          currency: order.cryptoCurrency,
        },
      });

      if (sellerVirtualAccount) {
        const cryptoAmount = new Decimal(order.cryptoAmount);
        const sellerBalance = new Decimal(sellerVirtualAccount.accountBalance || '0');
        const sellerAvailable = new Decimal(sellerVirtualAccount.availableBalance || '0');

        // Unfreeze: Restore available balance
        const newAvailableBalance = sellerAvailable.plus(cryptoAmount);

        await prisma.virtualAccount.update({
          where: { id: sellerVirtualAccount.id },
          data: {
            availableBalance: newAvailableBalance.toString(),
          },
        });
      }
    }

    const updated = await prisma.p2POrder.update({
      where: { id: parsedOrderId },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
      },
    });

    // Send notification message
    await prisma.p2PChatMessage.create({
      data: {
        orderId: order.id,
        senderId: parsedUserId,
        receiverId: order.userId === parsedUserId ? order.vendorId : order.userId,
        message: 'Order has been cancelled.',
      },
    });

    return {
      id: updated.id,
      status: updated.status,
      cancelledAt: updated.cancelledAt,
    };
  }

  /**
   * Get user's payment methods that match vendor's accepted payment methods
   * This helps frontend show user's own payment methods instead of vendor's
   */
  async getUserMatchingPaymentMethods(userId: string, adId: string) {
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }

    const parsedAdId = typeof adId === 'string' ? parseInt(adId, 10) : adId;
    if (isNaN(parsedAdId) || parsedAdId <= 0) {
      throw new Error('Invalid ad ID format');
    }

    // Get ad
    const ad = await prisma.p2PAd.findUnique({
      where: { id: parsedAdId },
    });

    if (!ad) {
      throw new Error('Ad not found');
    }

    // Get vendor's accepted payment methods
    const paymentMethodIdsRaw = ad.paymentMethodIds as any;
    let vendorPaymentMethodIds: number[] = [];
    
    if (Array.isArray(paymentMethodIdsRaw)) {
      vendorPaymentMethodIds = paymentMethodIdsRaw.map((id: any) => {
        const num = typeof id === 'string' ? parseInt(id, 10) : id;
        return isNaN(num) ? null : num;
      }).filter((id: any) => id !== null) as number[];
    }

    // Get vendor's payment methods to see what types they accept
    const vendorPaymentMethods = await prisma.userPaymentMethod.findMany({
      where: {
        id: { in: vendorPaymentMethodIds },
        isActive: true,
      },
    });

    // Get user's payment methods
    const userPaymentMethods = await prisma.userPaymentMethod.findMany({
      where: {
        userId: parsedUserId,
        isActive: true,
      },
      include: {
        provider: true,
      },
    });

    // Match user's payment methods with vendor's accepted types
    const matchingMethods = userPaymentMethods.filter((userPm: any) => {
      return vendorPaymentMethods.some((vendorPm: any) => {
        // For bank accounts: match by bankName
        if (userPm.type === 'bank_account' && vendorPm.type === 'bank_account') {
          const userBank = (userPm.bankName || '').toLowerCase().trim();
          const vendorBank = (vendorPm.bankName || '').toLowerCase().trim();
          return userBank === vendorBank && userBank !== '';
        }
        // For mobile money: match by provider
        if (userPm.type === 'mobile_money' && vendorPm.type === 'mobile_money') {
          return userPm.providerId === vendorPm.providerId;
        }
        // For rhinoxpay_id: match by type (and currency if specified)
        if (userPm.type === 'rhinoxpay_id' && vendorPm.type === 'rhinoxpay_id') {
          if (userPm.currency && vendorPm.currency) {
            return userPm.currency === vendorPm.currency;
          }
          return true;
        }
        return false;
      });
    });

    return matchingMethods.map((pm: any) => ({
      id: pm.id,
      type: pm.type,
      accountType: pm.accountType,
      bankName: pm.bankName,
      accountNumber: pm.accountNumber ? this.maskAccountNumber(pm.accountNumber) : null,
      accountName: pm.accountName,
      provider: pm.provider ? {
        id: pm.provider.id,
        name: pm.provider.name,
        code: pm.provider.code,
      } : null,
      phoneNumber: pm.phoneNumber ? this.maskPhoneNumber(pm.phoneNumber) : null,
      countryCode: pm.countryCode,
      currency: pm.currency,
      isDefault: pm.isDefault,
    }));
  }

  /**
   * Get user's orders
   */
  async getUserOrders(
    userId: string | number,
    filters: {
      role?: 'vendor' | 'user';
      status?: string;
      limit?: number;
      offset?: number;
    }
  ) {
    // Parse userId to integer for Prisma query
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }

    const where: any = {};

    if (filters.role === 'vendor') {
      // User wants only orders where they are the vendor (ad owner)
      where.vendorId = parsedUserId;
    } else if (filters.role === 'user') {
      // User wants only orders where they created the order
      where.userId = parsedUserId;
    } else {
      // Get all orders where user is involved (either as vendor or order creator)
      where.OR = [
        { vendorId: parsedUserId },
        { userId: parsedUserId },
      ];
    }

    if (filters.status) {
      where.status = filters.status;
    }

    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    let orders = await prisma.p2POrder.findMany({
      where,
      include: {
        ad: true,
        vendor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        paymentMethod: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // If no role filter, also check orders where user is seller (in metadata)
    // This handles BUY ads where user is seller but buyerId = vendor
    if (!filters.role) {
      // Get order IDs we already have
      const existingOrderIds = orders.map((o: any) => o.id);
      
      // Get additional orders where user might be seller (check metadata)
      // Only fetch orders not already in our results
      const additionalOrders = await prisma.p2POrder.findMany({
        where: {
          NOT: {
            id: existingOrderIds.length > 0 ? { in: existingOrderIds } : undefined,
          },
          ...(filters.status ? { status: filters.status } : {}),
        },
        include: {
          ad: true,
          user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        vendor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        paymentMethod: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      });

      // Filter by metadata.sellerId in memory
      const sellerOrders = additionalOrders.filter((order: any) => {
        const metadata = order.metadata as any;
        if (metadata && metadata.sellerId) {
          const sellerId = typeof metadata.sellerId === 'string' 
            ? parseInt(metadata.sellerId, 10) 
            : metadata.sellerId;
          return sellerId === parsedUserId;
        }
        return false;
      });

      // Combine orders
      orders = [...orders, ...sellerOrders];
      
      // Sort by createdAt desc
      orders.sort((a: any, b: any) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    }

    // Apply pagination
    orders = orders.slice(offset, offset + limit);

    return orders.map((order: any) => {
      // Resolve roles for display
      // Use metadata if available (more accurate), otherwise recalculate
      const orderMetadata = order.metadata as any;
      let actualBuyerId: string;
      let actualSellerId: string;
      
      if (orderMetadata && orderMetadata.buyerId && orderMetadata.sellerId) {
        // Use stored roles from metadata (created during order creation)
        actualBuyerId = orderMetadata.buyerId.toString();
        actualSellerId = orderMetadata.sellerId.toString();
      } else {
        // Fallback: recalculate roles
        const resolved = this.resolveRoles(order.type, order.vendorId.toString(), order.userId.toString());
        actualBuyerId = resolved.buyerId;
        actualSellerId = resolved.sellerId;
      }
      
      const parsedBuyerId = typeof actualBuyerId === 'string' ? parseInt(actualBuyerId, 10) : actualBuyerId;
      const parsedSellerId = typeof actualSellerId === 'string' ? parseInt(actualSellerId, 10) : actualSellerId;
      const isUserBuyer = parsedBuyerId === parsedUserId;
      const isUserSeller = parsedSellerId === parsedUserId;

      return {
        id: order.id,
        chatId: order.id, // Chat ID is same as order ID (chat messages are linked via orderId)
        adId: order.adId,
        type: order.type,
        userAction: this.getUserAction(order.type), // User-facing
        cryptoCurrency: order.cryptoCurrency,
        fiatCurrency: order.fiatCurrency,
        cryptoAmount: order.cryptoAmount.toString(),
        fiatAmount: order.fiatAmount.toString(),
        price: order.price.toString(),
        status: order.status,
        buyer: order.buyer,
        vendor: order.vendor,
        isUserBuyer,
        isUserSeller,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      };
    });
  }

  /**
   * Get user P2P profile with orders and statistics
   */
  async getUserP2PProfile(userId: string | number) {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }

    // Get all user orders
    const allOrders = await prisma.p2POrder.findMany({
      where: {
        OR: [
          { userId: userIdNum },
          { vendorId: userIdNum },
        ],
      },
      select: {
        id: true,
        status: true,
        userId: true,
        vendorId: true,
        type: true,
        cryptoAmount: true,
        fiatAmount: true,
        createdAt: true,
        completedAt: true,
      },
    });

    // Calculate statistics
    const totalOrders = allOrders.length;
    // Count orders where user is buyer (derived from type)
    const ordersAsBuyer = allOrders.filter((o: any) => {
      const { buyerId } = this.resolveRoles(o.type, o.vendorId.toString(), o.userId.toString());
      return parseInt(buyerId) === userIdNum;
    }).length;
    const ordersAsVendor = allOrders.filter((o: { vendorId: number }) => o.vendorId === userIdNum).length;
    const completedOrders = allOrders.filter((o: { status: string }) => o.status === 'completed').length;
    const pendingOrders = allOrders.filter((o: { status: string }) => ['pending', 'awaiting_payment', 'payment_made', 'awaiting_coin_release'].includes(o.status)).length;
    const cancelledOrders = allOrders.filter((o: { status: string }) => o.status === 'cancelled').length;

    // Get recent orders (last 10)
    const recentOrders = await prisma.p2POrder.findMany({
      where: {
        OR: [
          { userId: userIdNum },
          { vendorId: userIdNum },
        ],
      },
      include: {
        ad: {
          select: {
            id: true,
            type: true,
            cryptoCurrency: true,
            fiatCurrency: true,
          },
        },
        vendor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
    });

    const formattedRecentOrders = recentOrders.map((order: any) => {
      const { buyerId, sellerId } = this.resolveRoles(order.type, order.vendorId.toString(), order.userId.toString());
      const isUserBuyer = buyerId === userIdNum.toString();
      const isUserSeller = sellerId === userIdNum.toString();

      return {
        id: order.id,
        chatId: order.id, // Chat ID is same as order ID
        adId: order.adId,
        type: order.type,
        userAction: this.getUserAction(order.type),
        cryptoCurrency: order.cryptoCurrency,
        fiatCurrency: order.fiatCurrency,
        cryptoAmount: order.cryptoAmount.toString(),
        fiatAmount: order.fiatAmount.toString(),
        status: order.status,
        buyer: order.buyer,
        vendor: order.vendor,
        isUserBuyer,
        isUserSeller,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      };
    });

    return {
      statistics: {
        totalOrders,
        ordersAsBuyer,
        ordersAsVendor,
        completedOrders,
        pendingOrders,
        cancelledOrders,
      },
      recentOrders: formattedRecentOrders,
    };
  }

  /**
   * Mask account number
   */
  private maskAccountNumber(accountNumber: string): string {
    if (!accountNumber || accountNumber.length < 4) {
      return '****';
    }
    return '****' + accountNumber.slice(-4);
  }

  /**
   * Mask phone number
   */
  private maskPhoneNumber(phoneNumber: string): string {
    if (!phoneNumber || phoneNumber.length < 4) {
      return '****';
    }
    return phoneNumber.slice(0, 3) + '****' + phoneNumber.slice(-4);
  }
}
