import { Decimal } from 'decimal.js';
import prisma from '../../core/config/database.js';
import {
  REWARD_CATALOG,
  REWARD_TIERS,
  TIER_ORDER,
  type RewardTierCode,
  type RewardTierDefinition,
} from './rewards.constants.js';

interface UserRewardStats {
  completedTransactions: number;
  monthlyBalanceUsd: number;
}

export class RewardsService {
  private getTierByCode(code: RewardTierCode): RewardTierDefinition {
    const tier = REWARD_TIERS.find((entry) => entry.code === code);
    if (!tier) {
      throw new Error(`Unknown tier: ${code}`);
    }
    return tier;
  }

  private resolveCurrentTier(stats: UserRewardStats): RewardTierDefinition {
    const gold = this.getTierByCode('gold');
    const silver = this.getTierByCode('silver');

    if (
      stats.completedTransactions >= gold.requiredTransactions &&
      stats.monthlyBalanceUsd >= gold.requiredMonthlyBalanceUsd
    ) {
      return gold;
    }

    if (
      stats.completedTransactions >= silver.requiredTransactions &&
      stats.monthlyBalanceUsd >= silver.requiredMonthlyBalanceUsd
    ) {
      return silver;
    }

    return this.getTierByCode('bronze');
  }

  private getNextTier(currentTier: RewardTierDefinition): RewardTierDefinition | null {
    return REWARD_TIERS.find((tier) => tier.order === currentTier.order + 1) || null;
  }

  private async getUserStats(userIdNum: number): Promise<UserRewardStats> {
    const completedTransactions = await prisma.transaction.count({
      where: {
        wallet: { userId: userIdNum },
        status: 'completed',
      },
    });

    const wallets = await prisma.wallet.findMany({
      where: {
        userId: userIdNum,
        isActive: true,
        type: 'fiat',
      },
    });

    let totalNgn = new Decimal(0);
    for (const wallet of wallets) {
      if ((wallet.currency || '').toUpperCase() === 'NGN') {
        totalNgn = totalNgn.plus(new Decimal(wallet.balance.toString()));
      }
    }

    const ngnToUsdRate = await this.getNgnToUsdRate();
    const monthlyBalanceUsd = totalNgn.times(ngnToUsdRate).toNumber();

    return {
      completedTransactions,
      monthlyBalanceUsd: Number(monthlyBalanceUsd.toFixed(2)),
    };
  }

  private async getNgnToUsdRate(): Promise<Decimal> {
    const directRate = await prisma.exchangeRate.findUnique({
      where: {
        fromCurrency_toCurrency: {
          fromCurrency: 'NGN',
          toCurrency: 'USD',
        },
      },
    });

    if (directRate?.rate) {
      return new Decimal(directRate.rate.toString());
    }

    const inverseRate = await prisma.exchangeRate.findUnique({
      where: {
        fromCurrency_toCurrency: {
          fromCurrency: 'USD',
          toCurrency: 'NGN',
        },
      },
    });

    if (inverseRate?.rate) {
      const ngnPerUsd = new Decimal(inverseRate.rate.toString());
      if (ngnPerUsd.gt(0)) {
        return new Decimal(1).dividedBy(ngnPerUsd);
      }
    }

    return new Decimal(1).dividedBy(1600);
  }

  private buildCriteria(stats: UserRewardStats, nextTier: RewardTierDefinition | null) {
    if (!nextTier) {
      return [];
    }

    const balanceRemaining = Math.max(
      nextTier.requiredMonthlyBalanceUsd - stats.monthlyBalanceUsd,
      0
    );

    return [
      {
        id: 'transactions',
        label: `Complete ${nextTier.requiredTransactions} transactions to upgrade`,
        current: Math.min(stats.completedTransactions, nextTier.requiredTransactions),
        target: nextTier.requiredTransactions,
        progressText: `${Math.min(stats.completedTransactions, nextTier.requiredTransactions)}/${nextTier.requiredTransactions}`,
      },
      {
        id: 'balance',
        label: `Hold a minimum of $${nextTier.requiredMonthlyBalanceUsd.toLocaleString('en-US')}/Month`,
        current: stats.monthlyBalanceUsd,
        target: nextTier.requiredMonthlyBalanceUsd,
        progressText:
          balanceRemaining > 0
            ? `$${Math.ceil(balanceRemaining).toLocaleString('en-US')} more`
            : 'Completed',
      },
    ];
  }

  private calculateProgressToNext(stats: UserRewardStats, nextTier: RewardTierDefinition | null) {
    if (!nextTier) {
      return 1;
    }

    const transactionProgress =
      nextTier.requiredTransactions > 0
        ? Math.min(stats.completedTransactions / nextTier.requiredTransactions, 1)
        : 1;
    const balanceProgress =
      nextTier.requiredMonthlyBalanceUsd > 0
        ? Math.min(stats.monthlyBalanceUsd / nextTier.requiredMonthlyBalanceUsd, 1)
        : 1;

    return Number(((transactionProgress + balanceProgress) / 2).toFixed(2));
  }

  async getRewardsDashboard(userId: string | number) {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }

    const user = await prisma.user.findUnique({
      where: { id: userIdNum },
      include: { kyc: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const stats = await this.getUserStats(userIdNum);
    const currentTier = this.resolveCurrentTier(stats);
    const nextTier = this.getNextTier(currentTier);
    const claims = await prisma.rewardClaim.findMany({
      where: { userId: userIdNum },
      select: { rewardCode: true, status: true },
    });
    const claimedCodes = new Set(
      claims.filter((claim) => claim.status === 'completed').map((claim) => claim.rewardCode)
    );

    const fullName = [user.firstName, user.middleName, user.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    const rewards = REWARD_CATALOG.filter(
      (reward) => TIER_ORDER[reward.tierCode] <= TIER_ORDER[currentTier.code as RewardTierCode]
    ).map((reward) => ({
      id: reward.code,
      code: reward.code,
      title: reward.title,
      description: reward.description,
      value: reward.value,
      icon: reward.icon,
      tierCode: reward.tierCode,
      isClaimed: claimedCodes.has(reward.code),
      canClaim: !claimedCodes.has(reward.code),
    }));

    return {
      user: {
        id: user.id,
        name: fullName || user.email,
        email: user.email,
        isVerified:
          user.isEmailVerified ||
          user.kyc?.status === 'approved' ||
          user.kyc?.faceVerificationSuccessful === true,
      },
      tier: {
        currentCode: currentTier.code,
        currentName: currentTier.name,
        nextCode: nextTier?.code || null,
        nextName: nextTier?.name || null,
        progressToNext: this.calculateProgressToNext(stats, nextTier),
        progressLabel: nextTier
          ? `Progress to ${nextTier.name.toLowerCase()} tier`
          : 'Top tier unlocked',
        criteria: this.buildCriteria(stats, nextTier),
      },
      rewards,
    };
  }

  async getRewardsHistory(userId: string | number) {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }

    const claims = await prisma.rewardClaim.findMany({
      where: { userId: userIdNum },
      orderBy: { claimedAt: 'desc' },
    });

    const groups = new Map<string, any[]>();

    for (const claim of claims) {
      const claimDate = new Date(claim.claimedAt);
      const today = new Date();
      const isToday =
        claimDate.getFullYear() === today.getFullYear() &&
        claimDate.getMonth() === today.getMonth() &&
        claimDate.getDate() === today.getDate();

      const groupKey = isToday
        ? 'Today'
        : claimDate.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          });

      const tier = REWARD_TIERS.find((entry) => entry.code === claim.tierCode);

      const item = {
        id: String(claim.id),
        title: claim.rewardTitle,
        tier: tier ? `${tier.name.charAt(0)}${tier.name.slice(1).toLowerCase()} tier` : claim.tierCode,
        status:
          claim.status === 'completed'
            ? 'Successful'
            : claim.status === 'pending'
              ? 'Pending'
              : 'Failed',
        value: claim.value,
        expiryDate: claim.expiresAt
          ? claim.expiresAt.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
          : null,
        date: groupKey,
      };

      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)?.push(item);
    }

    return Array.from(groups.entries()).map(([date, items]) => ({ date, items }));
  }

  async claimReward(userId: string | number, rewardCode: string) {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }

    const reward = REWARD_CATALOG.find((entry) => entry.code === rewardCode);
    if (!reward) {
      throw new Error('Reward not found');
    }

    const dashboard = await this.getRewardsDashboard(userIdNum);
    const availableReward = dashboard.rewards.find((entry) => entry.code === rewardCode);

    if (!availableReward) {
      throw new Error('Reward is not available for your current tier');
    }

    if (!availableReward.canClaim) {
      throw new Error('Reward has already been claimed');
    }

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 3);

    const claim = await prisma.rewardClaim.create({
      data: {
        userId: userIdNum,
        rewardCode: reward.code,
        rewardTitle: reward.title,
        tierCode: reward.tierCode,
        value: reward.value,
        status: 'completed',
        expiresAt,
        metadata: {
          description: reward.description,
          icon: reward.icon,
        },
      },
    });

    return {
      id: claim.id,
      code: reward.code,
      title: reward.title,
      description: reward.description,
      value: reward.value,
      tierCode: reward.tierCode,
      status: claim.status,
      claimedAt: claim.claimedAt,
      expiresAt: claim.expiresAt,
    };
  }
}
