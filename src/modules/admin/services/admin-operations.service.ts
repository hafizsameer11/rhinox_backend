import prisma from '../../../core/config/database.js';
import {
  buildDateFilter,
  formatUserName,
  paginatedResponse,
  type AdminListQuery,
} from '../../../core/admin/admin-query.helpers.js';

export class AdminTransactionsService {
  private mapActionToType(action?: string) {
    const map: Record<string, string> = {
      Send: 'transfer',
      Fund: 'deposit',
      Convert: 'transfer',
      Withdraw: 'withdrawal',
      P2P: 'p2p',
      'Bill Payments': 'bill_payment',
    };
    return action ? map[action] : undefined;
  }

  async list(query: AdminListQuery) {
    const where: any = { ...buildDateFilter(query.from, query.to) };

    const action = query.action ? String(query.action) : undefined;
    const mappedType = action && action !== 'All' ? this.mapActionToType(action) : undefined;
    if (mappedType) where.type = mappedType;
    else if (query.type && query.type !== 'All') where.type = String(query.type);

    if (query.assetType === 'Fiat') where.currency = { notIn: ['BTC', 'ETH', 'USDT', 'USDC', 'BNB'] };
    if (query.assetType === 'Crypto') where.currency = { in: ['BTC', 'ETH', 'USDT', 'USDC', 'BNB'] };

    if (query.country && query.country !== 'Country' && query.country !== 'All') {
      where.country = String(query.country).toUpperCase().slice(0, 2);
    }
    if (query.status && query.status !== 'All Status') {
      where.status = String(query.status).toLowerCase();
    }
    if (query.channel && query.channel !== 'All Routes' && query.channel !== 'All types') {
      where.channel = { contains: String(query.channel).replace(/\s+/g, '_').toLowerCase() };
    }
    if (query.search) {
      where.OR = [
        { reference: { contains: query.search } },
        { description: { contains: query.search } },
        { wallet: { user: { email: { contains: query.search } } } },
      ];
    }
    if (query.userId) {
      where.wallet = { userId: Number(query.userId) };
    }

    const [items, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          wallet: {
            include: {
              user: { select: { id: true, email: true, firstName: true, lastName: true, rhinoxPayId: true } },
            },
          },
        },
      }),
      prisma.transaction.count({ where }),
    ]);

    return paginatedResponse(
      items.map((tx) => ({
        id: tx.id,
        reference: tx.reference,
        type: tx.type,
        status: tx.status,
        amount: Number(tx.amount),
        currency: tx.currency,
        fee: Number(tx.fee),
        country: tx.country,
        channel: tx.channel,
        paymentMethod: tx.paymentMethod,
        description: tx.description,
        metadata: tx.metadata,
        user: tx.wallet?.user
          ? {
              id: tx.wallet.user.id,
              name: formatUserName(tx.wallet.user),
              email: tx.wallet.user.email,
              username: tx.wallet.user.rhinoxPayId,
            }
          : null,
        createdAt: tx.createdAt,
        completedAt: tx.completedAt,
      })),
      total,
      query.page,
      query.limit
    );
  }

  async getById(id: number) {
    const tx = await prisma.transaction.findUnique({
      where: { id },
      include: {
        wallet: { include: { user: true } },
        bankAccount: true,
        provider: true,
      },
    });
    if (!tx) throw new Error('Transaction not found');
    return tx;
  }
}

export class AdminKycService {
  async list(query: AdminListQuery) {
    const where: any = { ...buildDateFilter(query.from, query.to, 'createdAt') };
    if (query.status && query.status !== 'All') where.status = String(query.status).toLowerCase();
    if (query.search) {
      where.user = {
        OR: [
          { email: { contains: query.search } },
          { firstName: { contains: query.search } },
          { lastName: { contains: query.search } },
        ],
      };
    }

    const [items, total] = await Promise.all([
      prisma.kYC.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { include: { country: true } } },
      }),
      prisma.kYC.count({ where }),
    ]);

    return paginatedResponse(
      items.map((kyc) => ({
        id: kyc.id,
        userId: kyc.userId,
        name: formatUserName(kyc.user),
        email: kyc.user.email,
        country: kyc.user.country?.code || null,
        status: kyc.status,
        tier: kyc.tier,
        idType: kyc.idType,
        createdAt: kyc.createdAt,
      })),
      total,
      query.page,
      query.limit,
      await this.getStats()
    );
  }

  async getStats() {
    const [pending, verified, rejected, total] = await Promise.all([
      prisma.kYC.count({ where: { status: 'pending' } }),
      prisma.kYC.count({ where: { status: 'verified' } }),
      prisma.kYC.count({ where: { status: 'rejected' } }),
      prisma.kYC.count(),
    ]);
    return { pending, verified, rejected, total };
  }

  async getByUserId(userId: number) {
    const kyc = await prisma.kYC.findUnique({ where: { userId }, include: { user: { include: { country: true } } } });
    if (!kyc) throw new Error('KYC record not found');
    return kyc;
  }

  async approve(userId: number, adminUserId: number) {
    const kycService = new (await import('../../kyc/kyc.service.js')).KYCService();
    return kycService.approveKYC(String(userId), String(adminUserId));
  }

  async reject(userId: number, reason?: string) {
    const kycService = new (await import('../../kyc/kyc.service.js')).KYCService();
    return kycService.rejectKYC(String(userId), reason);
  }
}

export class AdminWalletsService {
  async getOverview(query: AdminListQuery) {
    const [fiatWallets, cryptoWallets, usersWithWallets] = await Promise.all([
      prisma.wallet.aggregate({ where: { type: 'fiat' }, _sum: { balance: true }, _count: true }),
      prisma.wallet.aggregate({ where: { type: 'crypto' }, _sum: { balance: true }, _count: true }),
      prisma.wallet.groupBy({ by: ['userId'], _count: true }),
    ]);

    return {
      totalFiatBalance: Number(fiatWallets._sum.balance || 0),
      totalCryptoBalance: Number(cryptoWallets._sum.balance || 0),
      fiatWalletCount: fiatWallets._count,
      cryptoWalletCount: cryptoWallets._count,
      activeUsers: usersWithWallets.length,
    };
  }

  async listUsers(query: AdminListQuery) {
    const where: any = {};
    if (query.search) {
      where.user = {
        OR: [
          { email: { contains: query.search } },
          { firstName: { contains: query.search } },
          { lastName: { contains: query.search } },
        ],
      };
    }
    if (query.currency && query.currency !== 'All') {
      where.currency = String(query.currency).toUpperCase();
    }

    const wallets = await prisma.wallet.findMany({
      where,
      include: { user: { include: { country: true } } },
      orderBy: { updatedAt: 'desc' },
      take: query.limit,
      skip: query.skip,
    });

    const grouped = new Map<number, any>();
    for (const wallet of wallets) {
      const existing = grouped.get(wallet.userId) || {
        userId: wallet.userId,
        name: formatUserName(wallet.user),
        email: wallet.user.email,
        country: wallet.user.country?.code || null,
        fiatWalletBalance: 0,
        cryptoWalletBalance: 0,
        primaryFiatWallet: wallet.currency,
        transactionCount: 0,
      };
      if (wallet.type === 'crypto') existing.cryptoWalletBalance += Number(wallet.balance);
      else existing.fiatWalletBalance += Number(wallet.balance);
      grouped.set(wallet.userId, existing);
    }

    const items = Array.from(grouped.values());
    return paginatedResponse(items, items.length, query.page, query.limit, await this.getOverview(query));
  }
}
