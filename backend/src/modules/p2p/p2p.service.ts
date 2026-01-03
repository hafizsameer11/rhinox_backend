import Decimal from 'decimal.js';
import prisma from '../../core/config/database.js';
import { Prisma } from '@prisma/client';

/**
 * P2P Service
 * Manages P2P trading advertisements (buy/sell ads)
 */
export class P2PService {
  /**
   * Create a buy ad
   */
  async createBuyAd(
    userId: string,
    data: {
      cryptoCurrency: string;
      fiatCurrency: string;
      price: string;
      volume: string;
      minOrder: string;
      maxOrder: string;
      autoAccept?: boolean;
      paymentMethodIds: string[];
      countryCode?: string;
      description?: string;
    }
  ) {
    // Validate required fields
    if (!data.cryptoCurrency || !data.fiatCurrency || !data.price || !data.volume) {
      throw new Error('Crypto currency, fiat currency, price, and volume are required');
    }

    if (!data.minOrder || !data.maxOrder) {
      throw new Error('Min order and max order are required');
    }

    if (!data.paymentMethodIds || data.paymentMethodIds.length === 0) {
      throw new Error('At least one payment method is required');
    }

    // Validate price, volume, and order limits are positive
    const price = new Decimal(data.price);
    const volume = new Decimal(data.volume);
    const minOrder = new Decimal(data.minOrder);
    const maxOrder = new Decimal(data.maxOrder);

    if (price.lte(0) || volume.lte(0) || minOrder.lte(0) || maxOrder.lte(0)) {
      throw new Error('Price, volume, and order limits must be greater than 0');
    }

    if (minOrder.gte(maxOrder)) {
      throw new Error('Min order must be less than max order');
    }

    if (minOrder.gt(volume)) {
      throw new Error('Min order cannot be greater than volume');
    }

    // Validate payment methods belong to user
    const userPaymentMethods = await prisma.userPaymentMethod.findMany({
      where: {
        userId,
        id: { in: data.paymentMethodIds },
        isActive: true,
      },
    });

    if (userPaymentMethods.length !== data.paymentMethodIds.length) {
      throw new Error('One or more payment methods are invalid or not found');
    }

    // Create buy ad
    const ad = await prisma.p2PAd.create({
      data: {
        userId,
        type: 'buy',
        cryptoCurrency: data.cryptoCurrency,
        fiatCurrency: data.fiatCurrency,
        price: price.toNumber(),
        volume: volume.toNumber(),
        minOrder: minOrder.toNumber(),
        maxOrder: maxOrder.toNumber(),
        autoAccept: data.autoAccept || false,
        paymentMethodIds: data.paymentMethodIds as any,
        countryCode: data.countryCode,
        description: data.description,
        status: 'available',
        isOnline: true,
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
      paymentMethodIds: ad.paymentMethodIds as string[],
      status: ad.status,
      isOnline: ad.isOnline,
      ordersReceived: ad.ordersReceived,
      responseTime: ad.responseTime,
      score: ad.score?.toString(),
      countryCode: ad.countryCode,
      description: ad.description,
      createdAt: ad.createdAt,
      updatedAt: ad.updatedAt,
      message: 'Buy ad created successfully',
    };
  }

  /**
   * Create a sell ad
   */
  async createSellAd(
    userId: string,
    data: {
      cryptoCurrency: string;
      fiatCurrency: string;
      price: string;
      volume: string;
      minOrder: string;
      maxOrder: string;
      autoAccept?: boolean;
      paymentMethodIds: string[];
      countryCode?: string;
      description?: string;
    }
  ) {
    // Validate required fields
    if (!data.cryptoCurrency || !data.fiatCurrency || !data.price || !data.volume) {
      throw new Error('Crypto currency, fiat currency, price, and volume are required');
    }

    if (!data.minOrder || !data.maxOrder) {
      throw new Error('Min order and max order are required');
    }

    if (!data.paymentMethodIds || data.paymentMethodIds.length === 0) {
      throw new Error('At least one payment method is required');
    }

    // Validate price, volume, and order limits are positive
    const price = new Decimal(data.price);
    const volume = new Decimal(data.volume);
    const minOrder = new Decimal(data.minOrder);
    const maxOrder = new Decimal(data.maxOrder);

    if (price.lte(0) || volume.lte(0) || minOrder.lte(0) || maxOrder.lte(0)) {
      throw new Error('Price, volume, and order limits must be greater than 0');
    }

    if (minOrder.gte(maxOrder)) {
      throw new Error('Min order must be less than max order');
    }

    if (minOrder.gt(volume)) {
      throw new Error('Min order cannot be greater than volume');
    }

    // Validate payment methods belong to user
    const userPaymentMethods = await prisma.userPaymentMethod.findMany({
      where: {
        userId,
        id: { in: data.paymentMethodIds },
        isActive: true,
      },
    });

    if (userPaymentMethods.length !== data.paymentMethodIds.length) {
      throw new Error('One or more payment methods are invalid or not found');
    }

    // Create sell ad
    const ad = await prisma.p2PAd.create({
      data: {
        userId,
        type: 'sell',
        cryptoCurrency: data.cryptoCurrency,
        fiatCurrency: data.fiatCurrency,
        price: price.toNumber(),
        volume: volume.toNumber(),
        minOrder: minOrder.toNumber(),
        maxOrder: maxOrder.toNumber(),
        autoAccept: data.autoAccept || false,
        paymentMethodIds: data.paymentMethodIds as any,
        countryCode: data.countryCode,
        description: data.description,
        status: 'available',
        isOnline: true,
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
      paymentMethodIds: ad.paymentMethodIds as string[],
      status: ad.status,
      isOnline: ad.isOnline,
      ordersReceived: ad.ordersReceived,
      responseTime: ad.responseTime,
      score: ad.score?.toString(),
      countryCode: ad.countryCode,
      description: ad.description,
      createdAt: ad.createdAt,
      updatedAt: ad.updatedAt,
      message: 'Sell ad created successfully',
    };
  }

  /**
   * Get user's ads
   */
  async getUserAds(
    userId: string,
    type?: 'buy' | 'sell',
    status?: 'available' | 'unavailable' | 'paused'
  ) {
    const where: any = {
      userId,
    };

    if (type) {
      where.type = type;
    }

    if (status) {
      where.status = status;
    }

    const ads = await prisma.p2PAd.findMany({
      where,
      orderBy: [
        { createdAt: 'desc' },
      ],
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
      createdAt: ad.createdAt,
      updatedAt: ad.updatedAt,
    }));
  }

  /**
   * Get a single ad by ID
   */
  async getAd(userId: string, adId: string) {
    const ad = await prisma.p2PAd.findFirst({
      where: {
        id: adId,
        userId,
      },
    });

    if (!ad) {
      throw new Error('Ad not found');
    }

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
      paymentMethodIds: ad.paymentMethodIds as string[],
      status: ad.status,
      isOnline: ad.isOnline,
      ordersReceived: ad.ordersReceived,
      responseTime: ad.responseTime,
      score: ad.score?.toString(),
      countryCode: ad.countryCode,
      description: ad.description,
      createdAt: ad.createdAt,
      updatedAt: ad.updatedAt,
    };
  }

  /**
   * Update ad status
   */
  async updateAdStatus(
    userId: string,
    adId: string,
    status: 'available' | 'unavailable' | 'paused',
    isOnline?: boolean
  ) {
    const ad = await prisma.p2PAd.findFirst({
      where: {
        id: adId,
        userId,
      },
    });

    if (!ad) {
      throw new Error('Ad not found');
    }

    const updateData: any = {
      status,
    };

    if (isOnline !== undefined) {
      updateData.isOnline = isOnline;
    }

    const updated = await prisma.p2PAd.update({
      where: { id: adId },
      data: updateData,
    });

    return {
      id: updated.id,
      status: updated.status,
      isOnline: updated.isOnline,
      message: 'Ad status updated successfully',
    };
  }

  /**
   * Update ad (edit)
   */
  async updateAd(
    userId: string,
    adId: string,
    data: {
      price?: string;
      volume?: string;
      minOrder?: string;
      maxOrder?: string;
      autoAccept?: boolean;
      paymentMethodIds?: string[];
      countryCode?: string;
      description?: string;
    }
  ) {
    const ad = await prisma.p2PAd.findFirst({
      where: {
        id: adId,
        userId,
      },
    });

    if (!ad) {
      throw new Error('Ad not found');
    }

    const updateData: any = {};

    if (data.price !== undefined) {
      const price = new Decimal(data.price);
      if (price.lte(0)) {
        throw new Error('Price must be greater than 0');
      }
      updateData.price = price.toNumber();
    }

    if (data.volume !== undefined) {
      const volume = new Decimal(data.volume);
      if (volume.lte(0)) {
        throw new Error('Volume must be greater than 0');
      }
      updateData.volume = volume.toNumber();
    }

    if (data.minOrder !== undefined) {
      const minOrder = new Decimal(data.minOrder);
      if (minOrder.lte(0)) {
        throw new Error('Min order must be greater than 0');
      }
      updateData.minOrder = minOrder.toNumber();
    }

    if (data.maxOrder !== undefined) {
      const maxOrder = new Decimal(data.maxOrder);
      if (maxOrder.lte(0)) {
        throw new Error('Max order must be greater than 0');
      }
      updateData.maxOrder = maxOrder.toNumber();
    }

    // Validate min < max if both are being updated
    const finalMinOrder = data.minOrder !== undefined ? new Decimal(data.minOrder) : new Decimal(ad.minOrder);
    const finalMaxOrder = data.maxOrder !== undefined ? new Decimal(data.maxOrder) : new Decimal(ad.maxOrder);
    
    if (finalMinOrder.gte(finalMaxOrder)) {
      throw new Error('Min order must be less than max order');
    }

    // Validate min <= volume if volume is being updated
    const finalVolume = data.volume !== undefined ? new Decimal(data.volume) : new Decimal(ad.volume);
    if (finalMinOrder.gt(finalVolume)) {
      throw new Error('Min order cannot be greater than volume');
    }

    if (data.autoAccept !== undefined) {
      updateData.autoAccept = data.autoAccept;
    }

    if (data.paymentMethodIds !== undefined) {
      if (data.paymentMethodIds.length === 0) {
        throw new Error('At least one payment method is required');
      }

      // Validate payment methods belong to user
      const userPaymentMethods = await prisma.userPaymentMethod.findMany({
        where: {
          userId,
          id: { in: data.paymentMethodIds },
          isActive: true,
        },
      });

      if (userPaymentMethods.length !== data.paymentMethodIds.length) {
        throw new Error('One or more payment methods are invalid or not found');
      }

      updateData.paymentMethodIds = data.paymentMethodIds as any;
    }

    if (data.countryCode !== undefined) {
      updateData.countryCode = data.countryCode;
    }

    if (data.description !== undefined) {
      updateData.description = data.description;
    }

    const updated = await prisma.p2PAd.update({
      where: { id: adId },
      data: updateData,
    });

    return {
      id: updated.id,
      type: updated.type,
      cryptoCurrency: updated.cryptoCurrency,
      fiatCurrency: updated.fiatCurrency,
      price: updated.price.toString(),
      volume: updated.volume.toString(),
      minOrder: updated.minOrder.toString(),
      maxOrder: updated.maxOrder.toString(),
      autoAccept: updated.autoAccept,
      paymentMethodIds: updated.paymentMethodIds as string[],
      status: updated.status,
      isOnline: updated.isOnline,
      ordersReceived: updated.ordersReceived,
      responseTime: updated.responseTime,
      score: updated.score?.toString(),
      countryCode: updated.countryCode,
      description: updated.description,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      message: 'Ad updated successfully',
    };
  }
}

