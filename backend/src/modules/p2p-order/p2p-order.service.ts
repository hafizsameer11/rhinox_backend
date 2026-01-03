import Decimal from 'decimal.js';
import prisma from '../../core/config/database.js';
import { Prisma } from '@prisma/client';

/**
 * P2P Order Service
 * Manages P2P orders created from ads
 */
export class P2POrderService {
  /**
   * Browse all available ads (public)
   */
  async browseAds(filters: {
    type?: 'buy' | 'sell';
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

    if (filters.type) {
      where.type = filters.type;
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
        where.price.gte = new Prisma.Decimal(filters.minPrice);
      }
      if (filters.maxPrice) {
        where.price.lte = new Prisma.Decimal(filters.maxPrice);
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

    return ads.map(ad => ({
      id: ad.id,
      type: ad.type,
      cryptoCurrency: ad.cryptoCurrency,
      fiatCurrency: ad.fiatCurrency,
      price: ad.price.toString(),
      volume: ad.volume.toString(),
      minOrder: ad.minOrder.toString(),
      maxOrder: ad.maxOrder.toString(),
      autoAccept: ad.autoAccept,
      paymentMethodIds: ad.paymentMethodIds as string[],
      status: ad.status,
      isOnline: ad.isOnline,
      ordersReceived: ad.ordersReceived,
      responseTime: ad.responseTime,
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
    }));
  }

  /**
   * Get ad details (public)
   */
  async getAdDetails(adId: string) {
    const ad = await prisma.p2PAd.findUnique({
      where: { id: adId },
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
    const paymentMethodIds = ad.paymentMethodIds as string[];
    const paymentMethods = await prisma.userPaymentMethod.findMany({
      where: {
        id: { in: paymentMethodIds },
        isActive: true,
      },
      include: {
        provider: true,
      },
    });

    return {
      id: ad.id,
      type: ad.type,
      cryptoCurrency: ad.cryptoCurrency,
      fiatCurrency: ad.fiatCurrency,
      price: ad.price.toString(),
      volume: ad.volume.toString(),
      minOrder: ad.minOrder.toString(),
      maxOrder: ad.maxOrder.toString(),
      autoAccept: ad.autoAccept,
      paymentMethodIds: paymentMethodIds,
      paymentMethods: paymentMethods.map(pm => ({
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
   */
  async createOrder(
    buyerId: string,
    data: {
      adId: string;
      cryptoAmount?: string; // For sell orders
      fiatAmount?: string; // For buy orders
      paymentMethodId: string;
    }
  ) {
    // Get ad
    const ad = await prisma.p2PAd.findUnique({
      where: { id: data.adId },
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

    // Validate payment method belongs to ad
    const paymentMethodIds = ad.paymentMethodIds as string[];
    if (!paymentMethodIds.includes(data.paymentMethodId)) {
      throw new Error('Payment method not accepted for this ad');
    }

    // Get payment method
    const paymentMethod = await prisma.userPaymentMethod.findUnique({
      where: { id: data.paymentMethodId },
    });

    if (!paymentMethod || !paymentMethod.isActive) {
      throw new Error('Payment method not found or inactive');
    }

    // Calculate amounts
    const price = new Decimal(ad.price);
    let cryptoAmount: Decimal;
    let fiatAmount: Decimal;

    if (ad.type === 'sell') {
      // User is selling crypto, vendor is buying
      if (!data.cryptoAmount) {
        throw new Error('Crypto amount is required for sell orders');
      }
      cryptoAmount = new Decimal(data.cryptoAmount);
      fiatAmount = cryptoAmount.mul(price);
    } else {
      // User is buying crypto, vendor is selling
      if (!data.fiatAmount) {
        throw new Error('Fiat amount is required for buy orders');
      }
      fiatAmount = new Decimal(data.fiatAmount);
      cryptoAmount = fiatAmount.div(price);
    }

    // Validate order limits
    const minOrder = new Decimal(ad.minOrder);
    const maxOrder = new Decimal(ad.maxOrder);

    if (fiatAmount.lt(minOrder)) {
      throw new Error(`Order amount must be at least ${minOrder.toString()} ${ad.fiatCurrency}`);
    }

    if (fiatAmount.gt(maxOrder)) {
      throw new Error(`Order amount must not exceed ${maxOrder.toString()} ${ad.fiatCurrency}`);
    }

    // Check vendor has sufficient crypto balance (for sell ads - vendor needs crypto to sell)
    if (ad.type === 'sell') {
      // For sell ads, vendor is selling crypto, so they need crypto balance
      const vendorWallet = await prisma.virtualAccount.findFirst({
        where: {
          userId: ad.userId,
          currency: ad.cryptoCurrency,
        },
      });

      if (!vendorWallet || new Decimal(vendorWallet.accountBalance || '0').lt(cryptoAmount)) {
        throw new Error('Vendor has insufficient crypto balance');
      }
    }

    // Check buyer has sufficient fiat balance (for buy orders - buyer needs fiat to buy)
    if (ad.type === 'buy') {
      // For buy ads, buyer is buying crypto, so they need fiat balance
      const buyerWallet = await prisma.wallet.findFirst({
        where: {
          userId: buyerId,
          currency: ad.fiatCurrency,
        },
      });

      if (!buyerWallet || new Decimal(buyerWallet.balance || '0').lt(fiatAmount)) {
        throw new Error('Insufficient fiat balance');
      }
    }

    // Determine initial status
    let initialStatus = 'pending';
    if (ad.autoAccept) {
      initialStatus = 'awaiting_payment';
    }

    // Create order
    const order = await prisma.p2POrder.create({
      data: {
        adId: ad.id,
        buyerId,
        vendorId: ad.userId,
        type: ad.type,
        cryptoCurrency: ad.cryptoCurrency,
        fiatCurrency: ad.fiatCurrency,
        cryptoAmount: cryptoAmount.toString(),
        fiatAmount: fiatAmount.toString(),
        price: price.toString(),
        paymentMethodId: data.paymentMethodId,
        status: initialStatus,
        metadata: {},
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
        senderId: buyerId,
        receiverId: ad.userId,
        message: `Order created for ${cryptoAmount.toString()} ${ad.cryptoCurrency} at ${price.toString()} ${ad.fiatCurrency} per unit.`,
      },
    });

    return {
      id: order.id,
      adId: order.adId,
      type: order.type,
      cryptoCurrency: order.cryptoCurrency,
      fiatCurrency: order.fiatCurrency,
      cryptoAmount: order.cryptoAmount.toString(),
      fiatAmount: order.fiatAmount.toString(),
      price: order.price.toString(),
      paymentMethodId: order.paymentMethodId,
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
   * Get order details
   */
  async getOrderDetails(orderId: string, userId: string) {
    const order = await prisma.p2POrder.findUnique({
      where: { id: orderId },
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
    if (order.buyerId !== userId && order.vendorId !== userId) {
      throw new Error('Unauthorized to view this order');
    }

    return {
      id: order.id,
      adId: order.adId,
      type: order.type,
      cryptoCurrency: order.cryptoCurrency,
      fiatCurrency: order.fiatCurrency,
      cryptoAmount: order.cryptoAmount.toString(),
      fiatAmount: order.fiatAmount.toString(),
      price: order.price.toString(),
      paymentMethodId: order.paymentMethodId,
      status: order.status,
      paymentConfirmedAt: order.paymentConfirmedAt,
      paymentReceivedAt: order.paymentReceivedAt,
      coinReleasedAt: order.coinReleasedAt,
      completedAt: order.completedAt,
      cancelledAt: order.cancelledAt,
      txId: order.txId,
      buyer: order.buyer,
      vendor: order.vendor,
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
      chatMessages: order.chatMessages.map(msg => ({
        id: msg.id,
        message: msg.message,
        senderId: msg.senderId,
        sender: msg.sender,
        receiverId: msg.receiverId,
        isRead: msg.isRead,
        readAt: msg.readAt,
        createdAt: msg.createdAt,
      })),
      reviews: order.reviews.map(review => ({
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
   * User confirms payment made
   */
  async confirmPayment(orderId: string, userId: string) {
    const order = await prisma.p2POrder.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    if (order.buyerId !== userId) {
      throw new Error('Only buyer can confirm payment');
    }

    if (order.status !== 'awaiting_payment') {
      throw new Error(`Cannot confirm payment. Current status: ${order.status}`);
    }

    const updated = await prisma.p2POrder.update({
      where: { id: orderId },
      data: {
        status: 'payment_made',
        paymentConfirmedAt: new Date(),
      },
    });

    // Send notification message
    await prisma.p2PChatMessage.create({
      data: {
        orderId: order.id,
        senderId: userId,
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
   * Vendor marks payment as received
   */
  async markPaymentReceived(orderId: string, userId: string) {
    const order = await prisma.p2POrder.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    if (order.vendorId !== userId) {
      throw new Error('Only vendor can mark payment as received');
    }

    if (order.status !== 'payment_made') {
      throw new Error(`Cannot mark payment as received. Current status: ${order.status}`);
    }

    // Update status to awaiting_coin_release
    const updated = await prisma.p2POrder.update({
      where: { id: orderId },
      data: {
        status: 'awaiting_coin_release',
        paymentReceivedAt: new Date(),
      },
    });

    // Auto-release crypto
    await this.autoReleaseCrypto(orderId);

    return {
      id: updated.id,
      status: updated.status,
      paymentReceivedAt: updated.paymentReceivedAt,
    };
  }

  /**
   * Auto-release crypto
   */
  async autoReleaseCrypto(orderId: string) {
    const order = await prisma.p2POrder.findUnique({
      where: { id: orderId },
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

    const cryptoAmount = new Decimal(order.cryptoAmount);

    if (order.type === 'buy') {
      // For buy orders: Transfer crypto from vendor to buyer
      // Vendor is selling crypto, buyer is buying
      const vendorWallet = await prisma.virtualAccount.findFirst({
        where: {
          userId: order.vendorId,
          currency: order.cryptoCurrency,
        },
      });

      const buyerWallet = await prisma.virtualAccount.findFirst({
        where: {
          userId: order.buyerId,
          currency: order.cryptoCurrency,
        },
      });

      if (!vendorWallet || !buyerWallet) {
        throw new Error('Wallets not found');
      }

      const vendorBalance = new Decimal(vendorWallet.accountBalance || '0');
      if (vendorBalance.lt(cryptoAmount)) {
        throw new Error('Vendor has insufficient crypto balance');
      }

      // Debit vendor, credit buyer
      const newVendorBalance = vendorBalance.minus(cryptoAmount);
      const newBuyerBalance = new Decimal(buyerWallet.accountBalance || '0').plus(cryptoAmount);

      await prisma.virtualAccount.update({
        where: { id: vendorWallet.id },
        data: {
          accountBalance: newVendorBalance.toString(),
          availableBalance: newVendorBalance.toString(),
        },
      });

      await prisma.virtualAccount.update({
        where: { id: buyerWallet.id },
        data: {
          accountBalance: newBuyerBalance.toString(),
          availableBalance: newBuyerBalance.toString(),
        },
      });
    } else {
      // For sell orders: Crypto already transferred (user sold to vendor)
      // Just mark as completed
    }

    // Update order status
    const updated = await prisma.p2POrder.update({
      where: { id: orderId },
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
    const order = await prisma.p2POrder.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    // Only buyer or vendor can cancel
    if (order.buyerId !== userId && order.vendorId !== userId) {
      throw new Error('Unauthorized to cancel this order');
    }

    // Can only cancel if status is pending or awaiting_payment
    if (!['pending', 'awaiting_payment'].includes(order.status)) {
      throw new Error(`Cannot cancel order. Current status: ${order.status}`);
    }

    const updated = await prisma.p2POrder.update({
      where: { id: orderId },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
      },
    });

    // Send notification message
    await prisma.p2PChatMessage.create({
      data: {
        orderId: order.id,
        senderId: userId,
        receiverId: order.buyerId === userId ? order.vendorId : order.buyerId,
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
    userId: string,
    filters: {
      role?: 'buyer' | 'vendor';
      status?: string;
      limit?: number;
      offset?: number;
    }
  ) {
    const where: any = {};

    if (filters.role === 'buyer') {
      where.buyerId = userId;
    } else if (filters.role === 'vendor') {
      where.vendorId = userId;
    } else {
      // Get all orders where user is buyer or vendor
      where.OR = [
        { buyerId: userId },
        { vendorId: userId },
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

    return orders.map(order => ({
      id: order.id,
      adId: order.adId,
      type: order.type,
      cryptoCurrency: order.cryptoCurrency,
      fiatCurrency: order.fiatCurrency,
      cryptoAmount: order.cryptoAmount.toString(),
      fiatAmount: order.fiatAmount.toString(),
      price: order.price.toString(),
      status: order.status,
      buyer: order.buyer,
      vendor: order.vendor,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    }));
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

