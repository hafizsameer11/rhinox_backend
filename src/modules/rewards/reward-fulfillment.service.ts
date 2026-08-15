import prisma from '../../core/config/database.js';
import {
  getExpectedCategoryForReward,
  getRewardByCode,
  type RewardDefinition,
} from './rewards.constants.js';
import {
  RewardEligibilityService,
  getRuleIdFromCode,
  isRuleRewardCode,
} from './reward-eligibility.service.js';

export class RewardFulfillmentService {
  private eligibilityService = new RewardEligibilityService();

  private async resolveRewardDefinition(rewardCode: string): Promise<RewardDefinition | null> {
    const catalogReward = getRewardByCode(rewardCode);
    if (catalogReward) return catalogReward;

    if (isRuleRewardCode(rewardCode)) {
      const ruleId = getRuleIdFromCode(rewardCode);
      if (!ruleId) return null;
      return this.eligibilityService.getRuleRewardDefinition(ruleId);
    }

    return null;
  }

  async validatePendingClaim(userId: number, rewardClaimId: number) {
    const claim = await prisma.rewardClaim.findFirst({
      where: {
        id: rewardClaimId,
        userId,
        status: 'pending',
      },
    });

    if (!claim) {
      throw new Error('Reward claim not found or not pending');
    }

    const reward = await this.resolveRewardDefinition(claim.rewardCode);
    if (!reward) {
      throw new Error('Reward configuration not found');
    }

    if (
      reward.fulfillmentType !== 'bill_payment_airtime' &&
      reward.fulfillmentType !== 'bill_payment_data'
    ) {
      throw new Error('This reward cannot be fulfilled via bill payment');
    }

    return { claim, reward };
  }

  assertCategoryMatchesReward(reward: RewardDefinition, categoryCode: string) {
    const expected = getExpectedCategoryForReward(reward);
    if (expected && expected !== categoryCode) {
      throw new Error(`Reward must be redeemed via ${expected}, not ${categoryCode}`);
    }
  }

  resolveRewardAmount(reward: RewardDefinition, userAmount: string, sceneCode: string): string {
    if (reward.fulfillmentType === 'bill_payment_airtime' && reward.amountNgn) {
      return String(reward.amountNgn);
    }

    if (reward.fulfillmentType === 'bill_payment_data') {
      return userAmount;
    }

    if (sceneCode === 'airtime' || sceneCode === 'betting') {
      return userAmount;
    }

    return userAmount;
  }

  async completeRewardClaim(claimId: number, transactionId: number) {
    const claim = await prisma.rewardClaim.findUnique({ where: { id: claimId } });
    if (!claim) {
      throw new Error('Reward claim not found');
    }

    const existingMeta = (claim.metadata as Record<string, unknown>) || {};
    await prisma.rewardClaim.update({
      where: { id: claimId },
      data: {
        status: 'completed',
        metadata: {
          ...existingMeta,
          transactionId,
          fulfilledAt: new Date().toISOString(),
        },
      },
    });

    if (isRuleRewardCode(claim.rewardCode)) {
      const ruleId = getRuleIdFromCode(claim.rewardCode);
      if (ruleId) {
        await this.eligibilityService.markUserRewardClaimed(claim.userId, ruleId, 'claimed');
      }
    }
  }

  async failRewardClaim(claimId: number, reason: string) {
    const claim = await prisma.rewardClaim.findUnique({ where: { id: claimId } });
    if (!claim) {
      return;
    }

    const existingMeta = (claim.metadata as Record<string, unknown>) || {};
    await prisma.rewardClaim.update({
      where: { id: claimId },
      data: {
        status: 'failed',
        metadata: {
          ...existingMeta,
          failureReason: reason,
          failedAt: new Date().toISOString(),
        },
      },
    });

    if (isRuleRewardCode(claim.rewardCode)) {
      const ruleId = getRuleIdFromCode(claim.rewardCode);
      if (ruleId) {
        await prisma.userReward.updateMany({
          where: { userId: claim.userId, ruleId },
          data: { status: 'eligible', claimedAt: null },
        });
      }
    }
  }
}
