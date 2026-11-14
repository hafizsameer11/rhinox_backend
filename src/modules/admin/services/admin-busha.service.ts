import prisma from '../../../core/config/database.js';
import {
  buildDateFilter,
  formatUserName,
  paginatedResponse,
  type AdminListQuery,
} from '../../../core/admin/admin-query.helpers.js';
import { getBushaConfig, isBushaEnabled } from '../../../services/busha/busha.config.js';

const userSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  rhinoxPayId: true,
  profilePictureUrl: true,
} as const;

export class AdminBushaService {
  private buildTradeWhere(query: AdminListQuery) {
    const where: any = { ...buildDateFilter(query.from, query.to) };

    if (query.status && query.status !== 'All' && query.status !== 'All Status') {
      where.status = String(query.status).toLowerCase();
    }
    if (query.side && String(query.side) !== 'All') {
      where.side = String(query.side).toLowerCase();
    }
    if (query.userId) {
      where.userId = Number(query.userId);
    }
    if (query.search) {
      const search = String(query.search);
      where.OR = [
        { bushaQuoteId: { contains: search } },
        { bushaTransferId: { contains: search } },
        { sourceCurrency: { contains: search } },
        { targetCurrency: { contains: search } },
        { destinationAddress: { contains: search } },
        { cryptoDepositAddress: { contains: search } },
        { palmpayOrderId: { contains: search } },
        { palmpayOrderNo: { contains: search } },
        { user: { email: { contains: search } } },
        { user: { firstName: { contains: search } } },
        { user: { lastName: { contains: search } } },
      ];
      if (/^\d+$/.test(search)) {
        where.OR.push({ id: Number(search) }, { userId: Number(search) });
      }
    }

    return where;
  }

  private mapTrade(trade: any) {
    return {
      id: trade.id,
      userId: trade.userId,
      bushaCustomerId: trade.bushaCustomerId,
      side: trade.side,
      status: trade.status,
      sourceCurrency: trade.sourceCurrency,
      targetCurrency: trade.targetCurrency,
      sourceAmount: trade.sourceAmount,
      targetAmount: trade.targetAmount,
      network: trade.network,
      bushaQuoteId: trade.bushaQuoteId,
      bushaTransferId: trade.bushaTransferId,
      bushaStatus: trade.bushaStatus,
      payInBankCode: trade.payInBankCode,
      payInBankName: trade.payInBankName,
      payInAccountNumber: trade.payInAccountNumber,
      payInAccountName: trade.payInAccountName,
      payInExpiresAt: trade.payInExpiresAt,
      cryptoDepositAddress: trade.cryptoDepositAddress,
      cryptoDepositNetwork: trade.cryptoDepositNetwork,
      destinationAddress: trade.destinationAddress,
      palmpayOrderId: trade.palmpayOrderId,
      palmpayOrderNo: trade.palmpayOrderNo,
      palmpayStatus: trade.palmpayStatus,
      payoutMode: trade.payoutMode,
      fiatTransactionId: trade.fiatTransactionId,
      providerResponse: trade.providerResponse,
      user: trade.user
        ? {
            id: trade.user.id,
            email: trade.user.email,
            name: formatUserName(trade.user),
            rhinoxPayId: trade.user.rhinoxPayId,
            profilePictureUrl: trade.user.profilePictureUrl,
          }
        : null,
      bushaCustomer: trade.bushaCustomer
        ? {
            id: trade.bushaCustomer.id,
            bushaProfileId: trade.bushaCustomer.bushaProfileId,
            status: trade.bushaCustomer.status,
            email: trade.bushaCustomer.email,
          }
        : null,
      createdAt: trade.createdAt,
      updatedAt: trade.updatedAt,
    };
  }

  async listTrades(query: AdminListQuery) {
    const where = this.buildTradeWhere(query);

    const [items, total] = await Promise.all([
      prisma.bushaTradeLog.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: userSelect },
          bushaCustomer: {
            select: { id: true, bushaProfileId: true, status: true, email: true },
          },
        },
      }),
      prisma.bushaTradeLog.count({ where }),
    ]);

    return paginatedResponse(items.map((t) => this.mapTrade(t)), total, query.page, query.limit);
  }

  async getTradeById(id: number) {
    const trade = await prisma.bushaTradeLog.findUnique({
      where: { id },
      include: {
        user: { select: userSelect },
        bushaCustomer: true,
      },
    });
    if (!trade) throw new Error('Busha trade not found');
    return this.mapTrade(trade);
  }

  async listCustomers(query: AdminListQuery) {
    const where: any = { ...buildDateFilter(query.from, query.to) };

    if (query.status && query.status !== 'All' && query.status !== 'All Status') {
      where.status = String(query.status).toLowerCase();
    }
    if (query.search) {
      const search = String(query.search);
      where.OR = [
        { email: { contains: search } },
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { phone: { contains: search } },
        { bushaProfileId: { contains: search } },
        { user: { email: { contains: search } } },
      ];
      if (/^\d+$/.test(search)) {
        where.OR.push({ id: Number(search) }, { userId: Number(search) });
      }
    }

    const [items, total] = await Promise.all([
      prisma.bushaCustomer.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: userSelect } },
      }),
      prisma.bushaCustomer.count({ where }),
    ]);

    return paginatedResponse(
      items.map((c) => ({
        id: c.id,
        userId: c.userId,
        bushaProfileId: c.bushaProfileId,
        email: c.email,
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone,
        countryId: c.countryId,
        birthDate: c.birthDate,
        status: c.status,
        user: c.user
          ? {
              id: c.user.id,
              email: c.user.email,
              name: formatUserName(c.user),
              rhinoxPayId: c.user.rhinoxPayId,
              profilePictureUrl: c.user.profilePictureUrl,
            }
          : null,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      total,
      query.page,
      query.limit
    );
  }

  async listKycApplications(query: AdminListQuery) {
    const where: any = { ...buildDateFilter(query.from, query.to) };

    if (query.status && query.status !== 'All' && query.status !== 'All Status') {
      where.status = String(query.status).toLowerCase();
    }
    if (query.search) {
      const search = String(query.search);
      where.OR = [
        { errorMessage: { contains: search } },
        { source: { contains: search } },
        { user: { email: { contains: search } } },
        { user: { firstName: { contains: search } } },
        { user: { lastName: { contains: search } } },
      ];
      if (/^\d+$/.test(search)) {
        where.OR.push({ id: Number(search) }, { userId: Number(search) });
      }
    }

    const [items, total] = await Promise.all([
      prisma.bushaKycApplication.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: userSelect },
          bushaCustomer: {
            select: { id: true, bushaProfileId: true, status: true, email: true },
          },
        },
      }),
      prisma.bushaKycApplication.count({ where }),
    ]);

    return paginatedResponse(
      items.map((app) => ({
        id: app.id,
        userId: app.userId,
        bushaCustomerId: app.bushaCustomerId,
        rhinoxKycId: app.rhinoxKycId,
        source: app.source,
        status: app.status,
        attempts: app.attempts,
        errorMessage: app.errorMessage,
        selfiePath: app.selfiePath,
        idDocumentPath: app.idDocumentPath,
        user: app.user
          ? {
              id: app.user.id,
              email: app.user.email,
              name: formatUserName(app.user),
              rhinoxPayId: app.user.rhinoxPayId,
              profilePictureUrl: app.user.profilePictureUrl,
            }
          : null,
        bushaCustomer: app.bushaCustomer,
        createdAt: app.createdAt,
        updatedAt: app.updatedAt,
      })),
      total,
      query.page,
      query.limit
    );
  }

  async getConfig() {
    const config = await prisma.bushaConfig.findUnique({ where: { id: 1 } });
    const enabled = isBushaEnabled();
    let environment: string | null = null;
    let baseUrl: string | null = null;

    if (enabled) {
      try {
        const runtime = getBushaConfig();
        environment = runtime.environment;
        baseUrl = runtime.baseUrl;
      } catch {
        environment = null;
        baseUrl = null;
      }
    }

    return {
      enabled,
      environment,
      baseUrl,
      isActive: config?.isActive ?? false,
      sellPayoutMode: config?.sellPayoutMode ?? null,
      payoutBankCode: config?.payoutBankCode ?? null,
      payoutAccountNumber: config?.payoutAccountNumber ?? null,
      payoutAccountName: config?.payoutAccountName ?? null,
      payoutRecipientId: config?.payoutRecipientId ?? null,
      createdAt: config?.createdAt ?? null,
      updatedAt: config?.updatedAt ?? null,
    };
  }
}
