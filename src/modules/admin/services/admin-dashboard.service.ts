import prisma from '../../../core/config/database.js';
import {
  buildDateFilter,
  formatUserName,
  paginatedResponse,
  type AdminListQuery,
} from '../../../core/admin/admin-query.helpers.js';

export class AdminDashboardService {
  async getStats(query: AdminListQuery) {
    const dateFilter = buildDateFilter(query.from, query.to);
    const [totalUsers, totalTransactions, completedTransactions, newUsers] = await Promise.all([
      prisma.user.count(),
      prisma.transaction.count({ where: dateFilter }),
      prisma.transaction.findMany({
        where: { ...dateFilter, status: 'completed' },
        select: { amount: true, currency: true, type: true },
      }),
      prisma.user.count({ where: dateFilter }),
    ]);

    let fiatRevenue = 0;
    let cryptoRevenue = 0;
    for (const tx of completedTransactions) {
      const amount = Number(tx.amount);
      const isCrypto = ['BTC', 'ETH', 'USDT', 'USDC', 'BNB'].includes((tx.currency || '').toUpperCase());
      if (isCrypto) cryptoRevenue += amount;
      else fiatRevenue += amount;
    }

    return {
      totalUsers,
      totalTransactions,
      totalRevenue: fiatRevenue + cryptoRevenue,
      fiatRevenue,
      cryptoRevenue,
      userGrowth: newUsers,
    };
  }

  async getCharts(query: AdminListQuery) {
    const metric = String(query.metric || 'revenue');
    const dateFilter = buildDateFilter(query.from, query.to);
    const transactions = await prisma.transaction.findMany({
      where: { ...dateFilter, status: 'completed' },
      select: { amount: true, createdAt: true, currency: true },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });

    const buckets: Record<string, number> = {};
    for (const tx of transactions) {
      const key = tx.createdAt.toISOString().slice(0, 10);
      buckets[key] = (buckets[key] || 0) + Number(tx.amount);
    }

    return {
      metric,
      labels: Object.keys(buckets),
      values: Object.values(buckets),
    };
  }

  async getLatestUsers(limit = 10) {
    const users = await prisma.user.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { kyc: { select: { status: true } }, country: { select: { code: true, name: true } } },
    });

    return users.map((user) => ({
      id: user.id,
      name: formatUserName(user),
      email: user.email,
      phone: user.phone,
      country: user.country?.code || null,
      kycStatus: user.kyc?.status || 'unverified',
      createdAt: user.createdAt,
    }));
  }

  async getWalletAggregates(query: AdminListQuery) {
    const walletType = String(query.walletType || 'fiat');
    const wallets = await prisma.wallet.findMany({
      where: walletType === 'crypto' ? { type: 'crypto' } : { type: 'fiat' },
      select: { currency: true, balance: true },
    });

    const totals: Record<string, number> = {};
    for (const wallet of wallets) {
      totals[wallet.currency] = (totals[wallet.currency] || 0) + Number(wallet.balance);
    }

    return Object.entries(totals).map(([currency, balance]) => ({ currency, balance }));
  }
}

export class AdminUsersService {
  private buildUserWhere(query: AdminListQuery) {
    const where: any = { ...buildDateFilter(query.from, query.to) };
    if (query.search) {
      where.OR = [
        { email: { contains: query.search } },
        { phone: { contains: query.search } },
        { firstName: { contains: query.search } },
        { lastName: { contains: query.search } },
        { rhinoxPayId: { contains: query.search } },
      ];
    }
    if (query.kycStatus && query.kycStatus !== 'All') {
      where.kyc = { status: String(query.kycStatus).toLowerCase() };
    }
    if (query.country && query.country !== 'All' && query.country !== 'Country') {
      where.country = { code: String(query.country).toUpperCase() };
    }
    return where;
  }

  async list(query: AdminListQuery) {
    const where = this.buildUserWhere(query);
    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          kyc: { select: { status: true } },
          country: { select: { code: true, name: true } },
          wallets: { where: { type: 'fiat' }, select: { currency: true, balance: true }, take: 1 },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return paginatedResponse(
      items.map((user) => ({
        id: user.id,
        username: user.rhinoxPayId || formatUserName(user),
        name: formatUserName(user),
        email: user.email,
        phone: user.phone,
        country: user.country?.code || null,
        kycStatus: user.kyc?.status || 'unverified',
        walletBalance: user.wallets[0] ? Number(user.wallets[0].balance) : 0,
        walletCurrency: user.wallets[0]?.currency || 'NGN',
        isActive: user.isActive,
        createdAt: user.createdAt,
      })),
      total,
      query.page,
      query.limit,
      await this.getStats(query)
    );
  }

  async getStats(query?: AdminListQuery) {
    const dateFilter = query ? buildDateFilter(query.from, query.to) : {};
    const [total, verified, pending, rejected, activeUsers, newUsers] = await Promise.all([
      prisma.user.count(),
      prisma.kYC.count({ where: { status: 'verified' } }),
      prisma.kYC.count({ where: { status: 'pending' } }),
      prisma.kYC.count({ where: { status: 'rejected' } }),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: dateFilter }),
    ]);
    return {
      total,
      verified,
      pending,
      rejected,
      unverified: total - verified - pending - rejected,
      activeUsers,
      newUsers,
    };
  }

  async getById(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        kyc: true,
        country: true,
        wallets: true,
      },
    });
    if (!user) throw new Error('User not found');
    return user;
  }

  async create(data: {
    email: string;
    phone?: string;
    password: string;
    firstName: string;
    lastName: string;
    countryId?: number;
  }) {
    const bcrypt = await import('bcryptjs');
    return prisma.user.create({
      data: {
        email: data.email.toLowerCase().trim(),
        phone: data.phone,
        passwordHash: await bcrypt.default.hash(data.password, 10),
        firstName: data.firstName,
        lastName: data.lastName,
        countryId: data.countryId,
        isEmailVerified: true,
        termsAccepted: true,
      },
    });
  }

  async update(
    userId: number,
    data: Partial<{
      firstName: string;
      lastName: string;
      phone: string;
      isActive: boolean;
      countryId: number;
      password: string;
      profilePictureUrl: string;
    }>
  ) {
    const updateData: Record<string, unknown> = {};
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.countryId !== undefined) updateData.countryId = data.countryId;
    if (data.profilePictureUrl !== undefined) updateData.profilePictureUrl = data.profilePictureUrl;
    if (data.password) {
      const bcrypt = await import('bcryptjs');
      updateData.passwordHash = await bcrypt.default.hash(data.password, 10);
    }
    return prisma.user.update({ where: { id: userId }, data: updateData });
  }

  async updateProfilePicture(userId: number, imageUrl: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { profilePictureUrl: imageUrl },
    });
  }

  async bulkAction(userIds: number[], action: 'activate' | 'deactivate') {
    await prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: { isActive: action === 'activate' },
    });
    return { updated: userIds.length };
  }

  async getActivities(userId: number, query: AdminListQuery) {
    const [transactions, kyc] = await Promise.all([
      prisma.transaction.findMany({
        where: { wallet: { userId }, ...buildDateFilter(query.from, query.to) },
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.skip,
      }),
      prisma.kYC.findUnique({ where: { userId } }),
    ]);

    const activities = transactions.map((tx) => ({
      id: tx.id,
      activity: `${tx.type} ${tx.status} - ${tx.amount} ${tx.currency}`,
      date: tx.createdAt,
    }));

    if (kyc) {
      activities.unshift({
        id: kyc.id,
        activity: `KYC ${kyc.status}`,
        date: kyc.updatedAt,
      });
    }

    return paginatedResponse(activities, activities.length, query.page, query.limit);
  }

  async getUserWallets(userId: number) {
    return prisma.wallet.findMany({
      where: { userId },
      include: { currencyRef: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getUserP2P(userId: number) {
    const [ads, orders] = await Promise.all([
      prisma.p2PAd.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 20 }),
      prisma.p2POrder.findMany({
        where: { OR: [{ userId }, { vendorId: userId }] },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
    return { ads, orders };
  }
}
