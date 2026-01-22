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
      paymentMethods: paymentMethods.map((pm: any) => ({
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

    if (!userPaymentMethod || !userPaymentMethod.isActive) {
      throw new Error('Payment method not found or inactive');
    }

    // Validate user's payment method belongs to them
    if (userPaymentMethod.userId !== parsedUserId) {
      throw new Error('Payment method does not belong to you. Please select your own payment method.');
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
      // For rhinoxpay_id: match by type
      if (userPaymentMethod.type === 'rhinoxpay_id' && vendorPm.type === 'rhinoxpay_id') {
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
        return pm.type;
      }).join(', ');
      
      const userMethodDisplay = userPaymentMethod.type === 'bank_account' 
        ? (userPaymentMethod.bankName || 'Unknown Bank')
        : userPaymentMethod.type;
      
      throw new Error(
        `Your payment method (${userMethodDisplay}) does not match any of the vendor's accepted payment methods. ` +
        `Vendor accepts: ${vendorMethodTypes}. Please use a payment method that matches one of these (same bank for bank accounts, same provider for mobile money).`
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

    // Validate maxOrder doesn't exceed vendor's balance
    if (ad.type === 'sell') {
      // Vendor is SELLER, maxOrder should not exceed their crypto balance
      const maxOrderCrypto = maxOrder.div(price);
      if (sellerBalance.lt(maxOrderCrypto)) {
        throw new Error(`Maximum order amount exceeds vendor's available crypto balance`);
      }
    } else {
      // For BUY ads: Vendor is BUYER, they need fiat to pay
      // Validate vendor has sufficient fiat balance for max order
      const vendorFiatWallet = await prisma.wallet.findFirst({
        where: {
          userId: ad.userId, // vendor
          currency: ad.fiatCurrency,
        },
      });

      if (vendorFiatWallet) {
        const vendorFiatBalance = new Decimal(vendorFiatWallet.balance || '0');
        if (vendorFiatBalance.lt(maxOrder)) {
          throw new Error(`Maximum order amount exceeds vendor's available fiat balance`);
        }
      }
    }

    // For BUY ads: Validate buyer (vendor) has sufficient fiat balance for this order
    if (ad.type === 'buy') {
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
      if (buyerFiatBalance.lt(fiatAmount)) {
        throw new Error('Buyer has insufficient fiat balance');
      }
    }

    // Determine initial status
    let initialStatus = 'pending';
    if (ad.autoAccept) {
      initialStatus = 'awaiting_payment';
    }

    // Create order
    const parsedBuyerIdForOrder = typeof buyerId === 'string' ? parseInt(buyerId, 10) : buyerId;
    const order = await prisma.p2POrder.create({
      data: {
        adId: ad.id,
        buyerId: parsedBuyerIdForOrder,
        vendorId: ad.userId,
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
        buyer: {
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
      buyer: order.buyer,
      vendor: order.vendor,
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

    // Resolve roles
    const { buyerId, sellerId } = this.resolveRoles(order.type, order.vendorId.toString(), order.buyerId.toString());

    // Get seller's VirtualAccount
    const parsedSellerId = typeof sellerId === 'string' ? parseInt(sellerId, 10) : sellerId;
    const sellerVirtualAccount = await prisma.virtualAccount.findFirst({
      where: {
        userId: parsedSellerId,
        currency: order.cryptoCurrency,
      },
    });

    if (!sellerVirtualAccount) {
      throw new Error('Seller crypto wallet not found');
    }

    const cryptoAmount = new Decimal(order.cryptoAmount);
    const sellerBalance = new Decimal(sellerVirtualAccount.accountBalance || '0');
    const sellerAvailable = new Decimal(sellerVirtualAccount.availableBalance || '0');

    if (sellerAvailable.lt(cryptoAmount)) {
      throw new Error('Insufficient crypto balance available');
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
        receiverId: order.buyerId,
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
        receiverId: order.buyerId,
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
        buyer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        vendor: {
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

    // Check if user is buyer or vendor
    if (order.buyerId !== parsedUserId && order.vendorId !== parsedUserId) {
      throw new Error('Unauthorized to view this order');
    }

    // Resolve roles for display
    const { buyerId, sellerId } = this.resolveRoles(order.type, order.vendorId.toString(), order.buyerId.toString());
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
      buyer: order.buyer,
      vendor: order.vendor,
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
    const { buyerId } = this.resolveRoles(order.type, order.vendorId.toString(), order.buyerId.toString());
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
    const { buyerId, sellerId } = this.resolveRoles(order.type, order.vendorId.toString(), order.buyerId.toString());
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
    const { buyerId, sellerId } = this.resolveRoles(order.type, order.vendorId.toString(), order.buyerId.toString());
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
    const { buyerId, sellerId } = this.resolveRoles(order.type, order.vendorId.toString(), order.buyerId.toString());
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
        receiverId: order.buyerId,
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
    if (order.buyerId !== parsedUserId && order.vendorId !== parsedUserId) {
      throw new Error('Unauthorized to cancel this order');
    }

    // Can only cancel if status is pending or awaiting_payment
    if (!['pending', 'awaiting_payment'].includes(order.status)) {
      throw new Error(`Cannot cancel order. Current status: ${order.status}`);
    }

    // If order was accepted, unfreeze crypto
    if (order.status === 'awaiting_payment' && order.acceptedAt) {
      // Resolve roles
      const { sellerId } = this.resolveRoles(order.type, order.vendorId.toString(), order.buyerId.toString());
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
        receiverId: order.buyerId === parsedUserId ? order.vendorId : order.buyerId,
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
   * Get user's orders
   */
  async getUserOrders(
    userId: string | number,
    filters: {
      role?: 'buyer' | 'vendor';
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

    if (filters.role === 'buyer') {
      where.buyerId = parsedUserId;
    } else if (filters.role === 'vendor') {
      where.vendorId = parsedUserId;
    } else {
      // Get all orders where user is buyer or vendor
      where.OR = [
        { buyerId: parsedUserId },
        { vendorId: parsedUserId },
      ];
    }

    if (filters.status) {
      where.status = filters.status;
    }

    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const orders = await prisma.p2POrder.findMany({
      where,
      include: {
        ad: true,
        buyer: {
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
      take: limit,
      skip: offset,
    });

    return orders.map((order: any) => {
      // Resolve roles for display
      const { buyerId, sellerId } = this.resolveRoles(order.type, order.vendorId.toString(), order.buyerId.toString());
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
          { buyerId: userIdNum },
          { vendorId: userIdNum },
        ],
      },
      select: {
        id: true,
        status: true,
        buyerId: true,
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
    const ordersAsBuyer = allOrders.filter((o: { buyerId: number }) => o.buyerId === userIdNum).length;
    const ordersAsVendor = allOrders.filter((o: { vendorId: number }) => o.vendorId === userIdNum).length;
    const completedOrders = allOrders.filter((o: { status: string }) => o.status === 'completed').length;
    const pendingOrders = allOrders.filter((o: { status: string }) => ['pending', 'awaiting_payment', 'payment_made', 'awaiting_coin_release'].includes(o.status)).length;
    const cancelledOrders = allOrders.filter((o: { status: string }) => o.status === 'cancelled').length;

    // Get recent orders (last 10)
    const recentOrders = await prisma.p2POrder.findMany({
      where: {
        OR: [
          { buyerId: userIdNum },
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
        buyer: {
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
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
    });

    const formattedRecentOrders = recentOrders.map((order: any) => {
      const { buyerId, sellerId } = this.resolveRoles(order.type, order.vendorId.toString(), order.buyerId.toString());
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
