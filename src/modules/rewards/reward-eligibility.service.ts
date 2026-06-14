import { Decimal } from 'decimal.js';
import prisma from '../../core/config/database.js';
import type { RewardDefinition, RewardFulfillmentType } from './rewards.constants.js';

const RULE_CODE_PREFIX = 'rule_';

export const isRuleRewardCode = (code: string) => code.startsWith(RULE_CODE_PREFIX);

export const getRuleIdFromCode = (code: string): number | null => {
  if (!isRuleRewardCode(code)) return null;
  const id = parseInt(code.replace(RULE_CODE_PREFIX, ''), 10);
  return isNaN(id) ? null : id;
};

export const buildRuleRewardCode = (ruleId: number) => `${RULE_CODE_PREFIX}${ruleId}`;

export class RewardEligibilityService {
  private getPeriodStart(period: string): Date | null {
    const normalized = (period || 'all_time').toLowerCase();
    const now = new Date();

    if (normalized === '7d' || normalized === '7_days') {
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
    if (normalized === '30d' || normalized === '1_month' || normalized === 'monthly') {
      return new Date(now.getFullYear(), now.getMonth(), 1);
    }
    if (normalized === '1_year' || normalized === '1y') {
      return new Date(now.getFullYear(), 0, 1);
    }
    return null;
  }

  private mapServiceToTransactionTypes(service: string): string[] {
    switch ((service || '').toLowerCase()) {
      case 'deposit':
        return ['deposit'];
      case 'withdrawal':
        return ['withdrawal'];
      case 'bill_payment':
        return ['bill_payment'];
      case 'p2p':
        return ['p2p'];
      case 'transfer':
        return ['transfer'];
      case 'swap':
      case 'conversion':
        return ['conversion'];
      default:
        return [];
    }
  }

  mapRewardTypeToFulfillment(
    rewardType: string,
    rewardMeta?: Record<string, unknown> | null
  ): RewardFulfillmentType {
    const type = (rewardType || '').toLowerCase();
    if (type === 'airtime') return 'bill_payment_airtime';
    if (type === 'data') return 'bill_payment_data';
    if (type === 'cashback' || type === 'fee_discount') return 'cashback';
    return 'instant';
  }

  mapRewardTypeToIcon(rewardType: string): RewardDefinition['icon'] {
    const type = (rewardType || '').toLowerCase();
    if (type === 'airtime') return 'airtime';
    if (type === 'data') return 'data';
    if (type === 'cashback' || type === 'fee_discount') return 'cashback';
    return 'gift';
  }

  async getRuleRewardDefinition(ruleId: number): Promise<RewardDefinition | null> {
    const rule = await prisma.rewardRule.findUnique({ where: { id: ruleId } });
    if (!rule) return null;

    const meta = (rule.rewardMeta as Record<string, unknown>) || {};
    const fulfillmentType = this.mapRewardTypeToFulfillment(rule.rewardType, meta);

    return {
      code: buildRuleRewardCode(rule.id),
      tierCode: 'bronze',
      title: rule.name,
      description: `${rule.service} milestone reward`,
      value: rule.rewardValue,
      icon: this.mapRewardTypeToIcon(rule.rewardType),
      fulfillmentType,
      amountNgn:
        typeof meta.amountNgn === 'number'
          ? meta.amountNgn
          : this.parseAmountFromValue(rule.rewardValue),
      categoryCode:
        fulfillmentType === 'bill_payment_airtime'
          ? 'airtime'
          : fulfillmentType === 'bill_payment_data'
            ? 'data'
            : undefined,
      dataHint: typeof meta.dataHint === 'string' ? meta.dataHint : undefined,
    };
  }

  private parseAmountFromValue(value: string): number | undefined {
    const match = value.match(/₦\s?([\d,]+)/i);
    if (!match) return undefined;
    return parseInt(match[1].replace(/,/g, ''), 10);
  }

  async evaluateRuleForUser(userId: number, rule: { service: string; metric: string; period: string; threshold: any }) {
    const types = this.mapServiceToTransactionTypes(rule.service);
    if (types.length === 0) return false;

    const periodStart = this.getPeriodStart(rule.period);
    const where: any = {
      wallet: { userId },
      status: 'completed',
      type: { in: types },
    };
    if (periodStart) {
      where.createdAt = { gte: periodStart };
    }

    const threshold = new Decimal(rule.threshold?.toString?.() || rule.threshold || 0);

    if ((rule.metric || '').toLowerCase() === 'count') {
      const count = await prisma.transaction.count({ where });
      return count >= threshold.toNumber();
    }

    if ((rule.metric || '').toLowerCase() === 'amount') {
      const transactions = await prisma.transaction.findMany({
        where,
        select: { amount: true },
      });
      const total = transactions.reduce(
        (sum, tx) => sum.plus(new Decimal(tx.amount.toString())),
        new Decimal(0)
      );
      return total.gte(threshold);
    }

    return false;
  }

  async syncUserRewards(userId: number) {
    const rules = await prisma.rewardRule.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    for (const rule of rules) {
      const eligible = await this.evaluateRuleForUser(userId, rule);
      if (!eligible) continue;

      const existing = await prisma.userReward.findFirst({
        where: { userId, ruleId: rule.id },
      });

      if (existing) {
        if (existing.status === 'eligible') continue;
        continue;
      }

      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 3);

      await prisma.userReward.create({
        data: {
          userId,
          ruleId: rule.id,
          status: 'eligible',
          expiresAt,
        },
      });
    }
  }

  async getEligibleRuleRewards(userId: number) {
    const userRewards = await prisma.userReward.findMany({
      where: { userId },
      include: { rule: true },
      orderBy: { eligibleAt: 'desc' },
    });

    return userRewards.filter((entry) => entry.rule?.isActive);
  }

  async markUserRewardClaimed(userId: number, ruleId: number, status: 'claimed' | 'pending' = 'claimed') {
    await prisma.userReward.updateMany({
      where: { userId, ruleId },
      data: {
        status,
        claimedAt: status === 'claimed' ? new Date() : undefined,
      },
    });
  }

  async markUserRewardPending(userId: number, ruleId: number) {
    await prisma.userReward.updateMany({
      where: { userId, ruleId },
      data: { status: 'pending' },
    });
  }
}
