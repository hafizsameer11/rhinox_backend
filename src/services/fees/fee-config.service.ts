import { Decimal } from 'decimal.js';
import type { Prisma } from '@prisma/client';
import prisma from '../../core/config/database.js';
import {
  buildDateFilter,
  paginatedResponse,
  type AdminListQuery,
} from '../../core/admin/admin-query.helpers.js';

export type ProfitSource =
  | 'busha_buy'
  | 'busha_sell'
  | 'bill_payment'
  | 'deposit'
  | 'withdrawal';

export type ComputeFeeOptions = {
  walletType: string;
  serviceType: string;
  subType?: string | null;
  currency?: string | null;
  providerCode?: string | null;
};

export type ComputeFeeResult = {
  fee: number;
  feeType: string;
  value: number;
  netAmount: number;
};

export type RecordProfitInput = {
  source: ProfitSource | string;
  userId: number;
  transactionId?: number | null;
  bushaTradeLogId?: number | null;
  currency?: string;
  userChargedAmount: number | string | Decimal;
  providerCostAmount: number | string | Decimal;
  markupProfit: number | string | Decimal;
  markupPercentApplied?: number | string | Decimal | null;
  cryptoCode?: string | null;
  providerQuoteId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
};

const toNumber = (value: Decimal | number | string | null | undefined, fallback = 0): number => {
  if (value === null || value === undefined) return fallback;
  return new Decimal(value.toString()).toNumber();
};

const clampFee = (fee: Decimal, minFee?: Decimal | null, maxFee?: Decimal | null): Decimal => {
  let result = fee;
  if (minFee != null && result.lt(minFee)) result = minFee;
  if (maxFee != null && result.gt(maxFee)) result = maxFee;
  return result;
};

export class FeeConfigService {
  async getMarkupPercent(side: 'buy' | 'sell', cryptoCode: string): Promise<number> {
    const code = String(cryptoCode || '').trim().toUpperCase();
    const configs = await prisma.platformFeeConfig.findMany({
      where: {
        walletType: 'crypto',
        serviceType: side,
        feeType: 'percentage',
        isActive: true,
        OR: [{ subType: code }, { subType: '*' }, { subType: null }],
      },
      orderBy: { updatedAt: 'desc' },
    });

    const exact = configs.find((c) => (c.subType || '').toUpperCase() === code);
    if (exact) return toNumber(exact.value);

    const wildcard = configs.find((c) => c.subType === '*');
    if (wildcard) return toNumber(wildcard.value);

    const nullSubtype = configs.find((c) => c.subType == null);
    return nullSubtype ? toNumber(nullSubtype.value) : 0;
  }

  async computeFee(
    amount: number | string | Decimal,
    options: ComputeFeeOptions
  ): Promise<ComputeFeeResult> {
    const base = new Decimal(amount.toString());
    const subType = options.subType?.trim() || undefined;
    const currency = options.currency?.trim().toUpperCase() || undefined;
    const providerCode = options.providerCode?.trim() || undefined;

    const andFilters: Prisma.PlatformFeeConfigWhereInput[] = [];
    if (currency) {
      andFilters.push({ OR: [{ currency }, { currency: null }] });
    }
    if (providerCode) {
      andFilters.push({ OR: [{ providerCode }, { providerCode: null }] });
    }

    const candidates = await prisma.platformFeeConfig.findMany({
      where: {
        walletType: options.walletType,
        serviceType: options.serviceType,
        isActive: true,
        ...(andFilters.length ? { AND: andFilters } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });

    const score = (cfg: (typeof candidates)[number]) => {
      let s = 0;
      if (subType) {
        if ((cfg.subType || '').toUpperCase() === subType.toUpperCase()) s += 8;
        else if (cfg.subType === '*') s += 4;
        else if (cfg.subType == null) s += 1;
        else return -1;
      } else if (cfg.subType == null || cfg.subType === '*') {
        s += 2;
      } else {
        return -1;
      }
      if (currency && cfg.currency?.toUpperCase() === currency) s += 3;
      if (providerCode && cfg.providerCode === providerCode) s += 3;
      return s;
    };

    const ranked = candidates
      .map((cfg) => ({ cfg, score: score(cfg) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score);

    const match = ranked[0]?.cfg;
    if (!match) {
      return {
        fee: 0,
        feeType: 'percentage',
        value: 0,
        netAmount: base.toNumber(),
      };
    }

    const value = new Decimal(match.value.toString());
    let fee =
      match.feeType === 'fixed'
        ? value
        : base.mul(value).div(100);

    fee = clampFee(
      fee,
      match.minFee != null ? new Decimal(match.minFee.toString()) : null,
      match.maxFee != null ? new Decimal(match.maxFee.toString()) : null
    );

    const netAmount = Decimal.max(base.minus(fee), 0);

    return {
      fee: fee.toNumber(),
      feeType: match.feeType,
      value: value.toNumber(),
      netAmount: netAmount.toNumber(),
    };
  }

  async recordProfit(entry: RecordProfitInput) {
    return prisma.platformProfitEntry.create({
      data: {
        source: entry.source,
        userId: entry.userId,
        transactionId: entry.transactionId ?? null,
        bushaTradeLogId: entry.bushaTradeLogId ?? null,
        currency: entry.currency || 'NGN',
        userChargedAmount: new Decimal(entry.userChargedAmount.toString()).toFixed(8),
        providerCostAmount: new Decimal(entry.providerCostAmount.toString()).toFixed(8),
        markupProfit: new Decimal(entry.markupProfit.toString()).toFixed(8),
        markupPercentApplied:
          entry.markupPercentApplied == null
            ? null
            : new Decimal(entry.markupPercentApplied.toString()).toFixed(4),
        cryptoCode: entry.cryptoCode ?? null,
        providerQuoteId: entry.providerQuoteId ?? null,
        metadata: entry.metadata ?? undefined,
      },
    });
  }

  async listProfits(query: AdminListQuery) {
    const where: Prisma.PlatformProfitEntryWhereInput = {
      ...buildDateFilter(query.from, query.to),
    };

    if (query.source && String(query.source) !== 'All') {
      where.source = String(query.source);
    }

    if (query.search) {
      const s = String(query.search).trim();
      const asId = Number(s);
      where.OR = [
        { currency: { contains: s } },
        { cryptoCode: { contains: s } },
        { providerQuoteId: { contains: s } },
        { source: { contains: s } },
        {
          user: {
            OR: [
              { email: { contains: s } },
              { firstName: { contains: s } },
              { lastName: { contains: s } },
            ],
          },
        },
        ...(Number.isFinite(asId) && asId > 0
          ? [
              { id: asId },
              { userId: asId },
              { transactionId: asId },
              { bushaTradeLogId: asId },
            ]
          : []),
      ];
    }

    const [items, total] = await Promise.all([
      prisma.platformProfitEntry.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      prisma.platformProfitEntry.count({ where }),
    ]);

    return paginatedResponse(
      items.map((item) => ({
        ...item,
        userChargedAmount: toNumber(item.userChargedAmount),
        providerCostAmount: toNumber(item.providerCostAmount),
        markupProfit: toNumber(item.markupProfit),
        markupPercentApplied:
          item.markupPercentApplied == null ? null : toNumber(item.markupPercentApplied),
      })),
      total,
      query.page,
      query.limit
    );
  }
}

export const feeConfigService = new FeeConfigService();
