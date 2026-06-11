import prisma from '../../../core/config/database.js';
import {
  buildDateFilter,
  formatUserName,
  paginatedResponse,
  type AdminListQuery,
} from '../../../core/admin/admin-query.helpers.js';
import { ExchangeService } from '../../exchange/exchange.service.js';

export class AdminExchangeService {
  private exchangeService = new ExchangeService();

  async listRates(query: AdminListQuery) {
    const rates = await prisma.exchangeRate.findMany({
      orderBy: { updatedAt: 'desc' },
    });

    let items = rates.map((rate) => ({
      id: rate.id,
      mainCurrency: rate.fromCurrency,
      otherCurrency: rate.toCurrency,
      marketRate: Number(rate.rate),
      rhinoxRate: Number(rate.inverseRate || rate.rate),
      updatedAt: rate.updatedAt,
    }));

    if (query.search) {
      const s = String(query.search).toLowerCase();
      items = items.filter(
        (item) =>
          item.mainCurrency.toLowerCase().includes(s) ||
          item.otherCurrency.toLowerCase().includes(s)
      );
    }

    const start = query.skip || 0;
    const paged = items.slice(start, start + query.limit);
    return paginatedResponse(paged, items.length, query.page, query.limit);
  }

  async setRate(data: {
    fromCurrency: string;
    toCurrency: string;
    marketRate: number;
    rhinoxRate?: number;
  }) {
    return this.exchangeService.setExchangeRate(
      data.fromCurrency,
      data.toCurrency,
      data.marketRate,
      data.rhinoxRate
    );
  }

  async listFees(query: AdminListQuery) {
    const where: any = {};
    if (query.walletType) where.walletType = String(query.walletType);
    if (query.serviceType) where.serviceType = String(query.serviceType);

    const [items, total] = await Promise.all([
      prisma.platformFeeConfig.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.platformFeeConfig.count({ where }),
    ]);

    return paginatedResponse(items, total, query.page, query.limit);
  }

  async createFee(data: {
    walletType: string;
    serviceType: string;
    subType?: string;
    feeType?: string;
    value: number;
  }) {
    return prisma.platformFeeConfig.create({
      data: {
        walletType: data.walletType,
        serviceType: data.serviceType,
        subType: data.subType,
        feeType: data.feeType || 'percentage',
        value: data.value,
      },
    });
  }

  async updateFee(id: number, data: Partial<{ value: number; isActive: boolean }>) {
    return prisma.platformFeeConfig.update({ where: { id }, data });
  }
}

export class AdminP2PService {
  async getStats(query: AdminListQuery) {
    const dateFilter = buildDateFilter(query.from, query.to);
    const [ads, orders, completedOrders] = await Promise.all([
      prisma.p2PAd.count({ where: dateFilter }),
      prisma.p2POrder.count({ where: dateFilter }),
      prisma.p2POrder.count({ where: { ...dateFilter, status: 'completed' } }),
    ]);
    return { ads, orders, completedOrders };
  }

  async listAds(query: AdminListQuery) {
    const where: any = { ...buildDateFilter(query.from, query.to) };
    if (query.adType && query.adType !== 'All') where.type = String(query.adType).toLowerCase();
    if (query.status && query.status !== 'All') where.status = String(query.status).toLowerCase();
    if (query.search) {
      where.user = {
        OR: [{ email: { contains: query.search } }, { firstName: { contains: query.search } }],
      };
    }

    const [items, total] = await Promise.all([
      prisma.p2PAd.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: { user: true },
      }),
      prisma.p2PAd.count({ where }),
    ]);

    return paginatedResponse(
      items.map((ad) => ({
        id: ad.id,
        username: formatUserName(ad.user),
        adType: ad.type,
        token: ad.cryptoCurrency,
        country: ad.countryCode,
        qty: Number(ad.volume),
        amount: Number(ad.price),
        status: ad.status,
        createdAt: ad.createdAt,
      })),
      total,
      query.page,
      query.limit,
      await this.getStats(query)
    );
  }

  async listOrders(query: AdminListQuery) {
    const where: any = { ...buildDateFilter(query.from, query.to) };
    if (query.status && query.status !== 'All') where.status = String(query.status).toLowerCase();
    if (query.adType && query.adType !== 'All') where.type = String(query.adType).toLowerCase();

    const [items, total] = await Promise.all([
      prisma.p2POrder.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: { user: true, vendor: true, ad: true },
      }),
      prisma.p2POrder.count({ where }),
    ]);

    return paginatedResponse(
      items.map((order) => ({
        id: order.id,
        orderId: order.id,
        type: order.type,
        status: order.status,
        buyer: formatUserName(order.user),
        vendor: formatUserName(order.vendor),
        cryptoCurrency: order.cryptoCurrency,
        fiatCurrency: order.fiatCurrency,
        cryptoAmount: Number(order.cryptoAmount),
        fiatAmount: Number(order.fiatAmount),
        createdAt: order.createdAt,
      })),
      total,
      query.page,
      query.limit
    );
  }

  async updateAdStatus(id: number, status: string) {
    return prisma.p2PAd.update({ where: { id }, data: { status } });
  }

  async updateOrderStatus(id: number, status: string) {
    return prisma.p2POrder.update({ where: { id }, data: { status } });
  }

  async listAppeals(query: AdminListQuery) {
    const where: any = {
      status: { in: ['disputed', 'cancelled', 'refunded'] },
      ...buildDateFilter(query.from, query.to),
    };

    const [items, total] = await Promise.all([
      prisma.p2POrder.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { updatedAt: 'desc' },
        include: { user: true, vendor: true, ad: true },
      }),
      prisma.p2POrder.count({ where }),
    ]);

    return paginatedResponse(
      items.map((order) => ({
        id: order.id,
        orderId: order.id,
        username: formatUserName(order.user),
        vendor: formatUserName(order.vendor),
        adType: order.type,
        token: order.cryptoCurrency,
        country: order.ad?.countryCode || null,
        qty: Number(order.cryptoAmount),
        amount: Number(order.fiatAmount),
        status: order.status,
        date: order.createdAt,
      })),
      total,
      query.page,
      query.limit
    );
  }

  async resolveAppeal(orderId: number, winner: 'buyer' | 'seller' | 'vendor' | 'user') {
    return prisma.p2POrder.update({
      where: { id: orderId },
      data: { status: 'completed', metadata: { appealWinner: winner, resolvedAt: new Date().toISOString() } },
    });
  }

  async getAppealChat(orderId: number) {
    return prisma.p2PChatMessage.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
      include: { sender: true, receiver: true },
    });
  }

  async getPaymentMethods(userId: number) {
    return prisma.userPaymentMethod.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }
}
