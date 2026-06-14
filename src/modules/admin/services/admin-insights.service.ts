import prisma from '../../../core/config/database.js';
import {
  buildDateFilter,
  formatUserName,
  paginatedResponse,
  type AdminListQuery,
} from '../../../core/admin/admin-query.helpers.js';

export class AdminMasterWalletService {
  async getBalances(query: AdminListQuery) {
    const wallets = await prisma.masterWallet.findMany({
      orderBy: { updatedAt: 'desc' },
    });

    return wallets.map((wallet) => ({
      id: wallet.id,
      currency: wallet.blockchain,
      blockchain: wallet.blockchain,
      address: wallet.address,
      balance: null,
      provider: 'Tatum',
      updatedAt: wallet.updatedAt,
    }));
  }

  async getActivity(query: AdminListQuery) {
    const where: any = { ...buildDateFilter(query.from, query.to) };
    if (query.search) where.OR = [{ blockchain: { contains: query.search } }, { address: { contains: query.search } }];

    const wallets = await prisma.masterWallet.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: query.limit,
      skip: query.skip,
    });

    const items = wallets.map((wallet) => ({
      id: wallet.id,
      activity: `${wallet.blockchain} master wallet updated`,
      provider: 'Tatum',
      walletType: 'crypto',
      currency: wallet.blockchain,
      date: wallet.updatedAt,
    }));

    return paginatedResponse(items, items.length, query.page, query.limit);
  }
}

export class AdminAnalyticsService {
  async getGeneral(query: AdminListQuery) {
    const dateFilter = buildDateFilter(query.from, query.to);
    const transactions = await prisma.transaction.findMany({
      where: { ...dateFilter, status: 'completed' },
      select: { amount: true, currency: true, type: true, createdAt: true },
    });

    let revenue = 0;
    let cryptoVolume = 0;
    let fiatVolume = 0;
    const cryptoSet = new Set(['BTC', 'ETH', 'USDT', 'USDC', 'BNB']);

    for (const tx of transactions) {
      const amount = Number(tx.amount);
      revenue += amount;
      if (cryptoSet.has((tx.currency || '').toUpperCase())) cryptoVolume += amount;
      else fiatVolume += amount;
    }

    return {
      revenue,
      cryptoVolume,
      fiatVolume,
      transactionCount: transactions.length,
      mode: query.mode || 'Revenue',
    };
  }

  async getFraud(query: AdminListQuery) {
    const since = query.from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const users = await prisma.user.findMany({
      where: { createdAt: { gte: since } },
      include: {
        wallets: {
          include: {
            transactions: {
              where: { createdAt: { gte: since } },
              select: { amount: true, status: true, type: true, createdAt: true },
            },
          },
        },
      },
      take: 100,
    });

    const rows = users
      .map((user) => {
        const txs = user.wallets.flatMap((w) => w.transactions);
        const failed = txs.filter((tx) => tx.status === 'failed').length;
        const totalAmount = txs.reduce((sum, tx) => sum + Number(tx.amount), 0);
        const velocity = txs.length;
        let riskLevel = 'Low';
        let prediction = 'Normal';
        let confidence = 75;

        if (failed >= 3 || totalAmount > 1000000 || velocity > 20) {
          riskLevel = 'High';
          prediction = 'Suspicious';
          confidence = 92;
        } else if (failed >= 1 || velocity > 10) {
          riskLevel = 'Medium';
          prediction = 'Review';
          confidence = 84;
        }

        return {
          id: user.id,
          name: formatUserName(user),
          amount: totalAmount,
          type: txs[0]?.type || 'mixed',
          prediction,
          confidence,
          riskLevel,
          date: user.createdAt,
        };
      })
      .filter((row) => {
        if (query.riskLevel && query.riskLevel !== 'All') {
          return row.riskLevel.toLowerCase() === String(query.riskLevel).toLowerCase();
        }
        if (query.search) {
          return row.name.toLowerCase().includes(String(query.search).toLowerCase());
        }
        return true;
      });

    return paginatedResponse(rows.slice(query.skip, query.skip + query.limit), rows.length, query.page, query.limit);
  }
}

export class AdminRewardsService {
  async listRules(query: AdminListQuery) {
    const where: any = {};
    if (query.service) where.service = String(query.service);
    if (query.isActive != null) where.isActive = String(query.isActive) === 'true';

    const [items, total] = await Promise.all([
      prisma.rewardRule.findMany({ where, skip: query.skip, take: query.limit, orderBy: { createdAt: 'desc' } }),
      prisma.rewardRule.count({ where }),
    ]);
    return paginatedResponse(items, total, query.page, query.limit);
  }

  async createRule(data: any) {
    return prisma.rewardRule.create({ data });
  }

  async updateRule(id: number, data: any) {
    return prisma.rewardRule.update({ where: { id }, data });
  }

  async deleteRule(id: number) {
    return prisma.rewardRule.delete({ where: { id } });
  }

  async getStats(query: AdminListQuery) {
    const dateFilter = buildDateFilter(query.from, query.to, 'claimedAt');
    const [claims, bronze, silver, gold] = await Promise.all([
      prisma.rewardClaim.count({ where: dateFilter }),
      prisma.rewardClaim.count({ where: { tierCode: 'bronze' } }),
      prisma.rewardClaim.count({ where: { tierCode: 'silver' } }),
      prisma.rewardClaim.count({ where: { tierCode: 'gold' } }),
    ]);
    return { totalClaims: claims, bronze, silver, gold };
  }

  async listClaims(query: AdminListQuery) {
    const where: any = { ...buildDateFilter(query.from, query.to, 'claimedAt') };
    if (query.tier && query.tier !== 'All') where.tierCode = String(query.tier).toLowerCase();
    if (query.search) {
      where.user = {
        OR: [{ email: { contains: query.search } }, { firstName: { contains: query.search } }],
      };
    }

    const [items, total] = await Promise.all([
      prisma.rewardClaim.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { claimedAt: 'desc' },
        include: { user: { include: { country: true } } },
      }),
      prisma.rewardClaim.count({ where }),
    ]);

    return paginatedResponse(
      items.map((claim) => ({
        id: claim.id,
        username: formatUserName(claim.user),
        tier: claim.tierCode,
        country: claim.user.country?.code || null,
        totalReward: claim.value,
        lastReward: claim.rewardTitle,
        status: claim.status,
        rewardCode: claim.rewardCode,
        claimedAt: claim.claimedAt,
        profilePictureUrl: claim.user.profilePictureUrl,
      })),
      total,
      query.page,
      query.limit,
      await this.getStats(query)
    );
  }
}
