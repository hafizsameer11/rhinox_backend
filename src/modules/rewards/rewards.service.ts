import { Decimal } from 'decimal.js';
import prisma from '../../core/config/database.js';
import {
  REWARD_CATALOG,
  REWARD_TIERS,
  TIER_ORDER,
  getRewardByCode,
  type RewardTierCode,
  type RewardTierDefinition,
  type RewardDefinition,
} from './rewards.constants.js';
import {
  RewardEligibilityService,
  buildRuleRewardCode,
  getRuleIdFromCode,
  isRuleRewardCode,
} from './reward-eligibility.service.js';

interface UserRewardStats {
  completedTransactions: number;
  monthlyBalanceUsd: number;
}

type ClaimStatus = 'none' | 'pending' | 'completed' | 'failed';

export class RewardsService {
  private eligibilityService = new RewardEligibilityService();

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

  private resolveClaimStatus(status?: string): ClaimStatus {
    if (status === 'completed') return 'completed';
    if (status === 'pending') return 'pending';
    if (status === 'failed') return 'failed';
    return 'none';
  }

  private buildClaimResponse(reward: RewardDefinition, claim: {
    id: number;
    status: string;
    claimedAt: Date;
    expiresAt: Date | null;
  }) {
    return {
      id: claim.id,
      code: reward.code,
      title: reward.title,
      description: reward.description,
      value: reward.value,
      tierCode: reward.tierCode,
      status: claim.status,
      fulfillmentType: reward.fulfillmentType,
      amountNgn: reward.amountNgn ?? null,
      categoryCode: reward.categoryCode ?? null,
      dataHint: reward.dataHint ?? null,
      icon: reward.icon,
      claimedAt: claim.claimedAt,
      expiresAt: claim.expiresAt,
    };
  }

  private mapRewardListItem(
    reward: RewardDefinition,
    existingClaim?: { id: number; status: string } | null,
    userRewardStatus?: string | null
  ) {
    let claimStatus = this.resolveClaimStatus(existingClaim?.status);
    if (!existingClaim && userRewardStatus === 'eligible') claimStatus = 'none';
    if (!existingClaim && userRewardStatus === 'pending') claimStatus = 'pending';
    if (userRewardStatus === 'claimed') claimStatus = 'completed';

    const isClaimed = claimStatus === 'completed';
    const canClaim =
      claimStatus === 'none' || claimStatus === 'pending' || claimStatus === 'failed';

    return {
      id: reward.code,
      code: reward.code,
      title: reward.title,
      description: reward.description,
      value: reward.value,
      icon: reward.icon,
      tierCode: reward.tierCode,
      fulfillmentType: reward.fulfillmentType,
      amountNgn: reward.amountNgn ?? null,
      categoryCode: reward.categoryCode ?? null,
      dataHint: reward.dataHint ?? null,
      claimId: existingClaim?.id ?? null,
      claimStatus,
      isClaimed,
      canClaim: userRewardStatus === 'eligible' ? true : canClaim,
    };
  }

  private async buildRuleBasedRewards(
    userIdNum: number,
    claimByCode: Map<string, { id: number; status: string; rewardCode: string }>
  ) {
    const userRewards = await this.eligibilityService.getEligibleRuleRewards(userIdNum);
    const items = [];

    for (const entry of userRewards) {
      if (!entry.rule) continue;
      if (entry.status !== 'eligible' && entry.status !== 'pending' && entry.status !== 'claimed') {
        continue;
      }

      const rewardCode = buildRuleRewardCode(entry.rule.id);
      const rewardDef = await this.eligibilityService.getRuleRewardDefinition(entry.rule.id);
      if (!rewardDef) continue;

      const existingClaim = claimByCode.get(rewardCode);
      const mapped = this.mapRewardListItem(rewardDef, existingClaim, entry.status);
      if (entry.status === 'claimed' && !existingClaim) {
        mapped.isClaimed = true;
        mapped.canClaim = false;
        mapped.claimStatus = 'completed';
      }
      items.push(mapped);
    }

    return items;
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

    await this.eligibilityService.syncUserRewards(userIdNum);

    const stats = await this.getUserStats(userIdNum);
    const currentTier = this.resolveCurrentTier(stats);
    const nextTier = this.getNextTier(currentTier);
    const claims = await prisma.rewardClaim.findMany({
      where: { userId: userIdNum },
    });
    const claimByCode = new Map(claims.map((claim) => [claim.rewardCode, claim]));

    const fullName = [user.firstName, user.middleName, user.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    const catalogRewards = REWARD_CATALOG.filter(
      (reward) => TIER_ORDER[reward.tierCode] <= TIER_ORDER[currentTier.code as RewardTierCode]
    ).map((reward) => this.mapRewardListItem(reward, claimByCode.get(reward.code)));

    const ruleRewards = await this.buildRuleBasedRewards(userIdNum, claimByCode);
    const catalogCodes = new Set(catalogRewards.map((reward) => reward.code));
    const mergedRewards = [
      ...catalogRewards,
      ...ruleRewards.filter((reward) => !catalogCodes.has(reward.code)),
    ];

    return {
      user: {
        id: user.id,
        name: fullName || user.email,
        email: user.email,
        profilePictureUrl: user.profilePictureUrl,
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
      rewards: mergedRewards,
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

    const reward = isRuleRewardCode(rewardCode)
      ? await this.eligibilityService.getRuleRewardDefinition(getRuleIdFromCode(rewardCode)!)
      : getRewardByCode(rewardCode);
    if (!reward) {
      throw new Error('Reward not found');
    }

    if (isRuleRewardCode(rewardCode)) {
      const ruleId = getRuleIdFromCode(rewardCode);
      if (!ruleId) {
        throw new Error('Invalid rule reward');
      }
      const userReward = await prisma.userReward.findFirst({
        where: { userId: userIdNum, ruleId },
      });
      if (!userReward || !['eligible', 'pending'].includes(userReward.status)) {
        throw new Error('Reward is not available for claiming');
      }
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

    const existingClaim = await prisma.rewardClaim.findUnique({
      where: {
        userId_rewardCode: {
          userId: userIdNum,
          rewardCode: reward.code,
        },
      },
    });

    if (existingClaim?.status === 'completed') {
      throw new Error('Reward has already been claimed');
    }

    if (existingClaim?.status === 'pending') {
      return this.buildClaimResponse(reward, existingClaim);
    }

    let claim;
    if (existingClaim?.status === 'failed') {
      claim = await prisma.rewardClaim.update({
        where: { id: existingClaim.id },
        data: {
          status: 'pending',
          rewardTitle: reward.title,
          value: reward.value,
          tierCode: reward.tierCode,
          expiresAt,
          metadata: {
            description: reward.description,
            icon: reward.icon,
            fulfillmentType: reward.fulfillmentType,
            amountNgn: reward.amountNgn ?? null,
            categoryCode: reward.categoryCode ?? null,
            dataHint: reward.dataHint ?? null,
          },
        },
      });
    } else {
      claim = await prisma.rewardClaim.create({
        data: {
          userId: userIdNum,
          rewardCode: reward.code,
          rewardTitle: reward.title,
          tierCode: reward.tierCode,
          value: reward.value,
          status: 'pending',
          expiresAt,
          metadata: {
            description: reward.description,
            icon: reward.icon,
            fulfillmentType: reward.fulfillmentType,
            amountNgn: reward.amountNgn ?? null,
            categoryCode: reward.categoryCode ?? null,
            dataHint: reward.dataHint ?? null,
          },
        },
      });
    }

    if (reward.fulfillmentType === 'instant') {
      const completed = await prisma.rewardClaim.update({
        where: { id: claim.id },
        data: { status: 'completed' },
      });

      if (isRuleRewardCode(reward.code)) {
        const ruleId = getRuleIdFromCode(reward.code);
        if (ruleId) {
          await this.eligibilityService.markUserRewardClaimed(userIdNum, ruleId, 'claimed');
        }
      }

      return this.buildClaimResponse(reward, completed);
    }

    if (isRuleRewardCode(reward.code)) {
      const ruleId = getRuleIdFromCode(reward.code);
      if (ruleId) {
        await this.eligibilityService.markUserRewardPending(userIdNum, ruleId);
      }
    }

    return this.buildClaimResponse(reward, claim);
  }
}
