import { Decimal } from 'decimal.js';
import prisma from '../../core/config/database.js';
import { normalizeBlockchain } from '../tatum/tatum-blockchain.util.js';

export type UnifiedNetworkBalance = {
  virtualAccountId: number;
  currency: string;
  blockchain: string;
  blockchainName: string | null;
  balance: string;
  available: string;
  depositAddress: string | null;
};

export type UnifiedBalance = {
  symbol: string;
  totalBalance: string;
  totalAvailable: string;
  isUnifiedStable: boolean;
  networks: UnifiedNetworkBalance[];
};

const UNIFIED_STABLE_SYMBOLS = new Set(['USDT', 'USDC']);

/** Map wallet_currencies.currency to display symbol (USDT_TRON → USDT). */
export function getBaseSymbol(currency: string): string {
  const upper = currency.toUpperCase();
  if (upper === 'USDT' || upper.startsWith('USDT_')) {
    return 'USDT';
  }
  if (upper === 'USDC' || upper.startsWith('USDC_')) {
    return 'USDC';
  }
  return upper;
}

export function isUnifiedStable(symbol: string): boolean {
  return UNIFIED_STABLE_SYMBOLS.has(getBaseSymbol(symbol));
}

export function currenciesMatchUnifiedSymbol(currency: string, symbol: string): boolean {
  return getBaseSymbol(currency) === getBaseSymbol(symbol);
}

export class UnifiedStablecoinService {
  async getVirtualAccountsForSymbol(userId: number, symbol: string) {
    const base = getBaseSymbol(symbol);
    const accounts = await prisma.virtualAccount.findMany({
      where: { userId, active: true },
      include: {
        walletCurrency: {
          select: {
            blockchain: true,
            blockchainName: true,
            symbol: true,
          },
        },
        depositAddresses: {
          select: { address: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ blockchain: 'asc' }, { currency: 'asc' }],
    });

    return accounts.filter((va) => getBaseSymbol(va.currency) === base);
  }

  async getUnifiedBalance(userId: number, symbol: string): Promise<UnifiedBalance> {
    const base = getBaseSymbol(symbol);
    const accounts = await this.getVirtualAccountsForSymbol(userId, base);

    let totalBalance = new Decimal(0);
    let totalAvailable = new Decimal(0);

    const networks: UnifiedNetworkBalance[] = accounts.map((va) => {
      const balance = new Decimal(va.accountBalance || '0');
      const available = new Decimal(va.availableBalance || '0');
      totalBalance = totalBalance.plus(balance);
      totalAvailable = totalAvailable.plus(available);

      return {
        virtualAccountId: va.id,
        currency: va.currency,
        blockchain: va.blockchain,
        blockchainName: va.walletCurrency?.blockchainName ?? va.blockchain,
        balance: balance.toString(),
        available: available.toString(),
        depositAddress: va.depositAddresses[0]?.address ?? null,
      };
    });

    return {
      symbol: base,
      totalBalance: totalBalance.toString(),
      totalAvailable: totalAvailable.toString(),
      isUnifiedStable: isUnifiedStable(base),
      networks,
    };
  }

  /**
   * All crypto assets: unified stables (USDT, USDC) plus one entry per non-stable VA.
   */
  async getAllUnifiedBalances(userId: number): Promise<UnifiedBalance[]> {
    const accounts = await prisma.virtualAccount.findMany({
      where: { userId, active: true },
      include: {
        walletCurrency: {
          select: { blockchain: true, blockchainName: true, symbol: true },
        },
        depositAddresses: {
          select: { address: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ blockchain: 'asc' }, { currency: 'asc' }],
    });

    const stableGroups = new Map<string, typeof accounts>();
    const standalone: UnifiedBalance[] = [];

    for (const va of accounts) {
      const base = getBaseSymbol(va.currency);
      if (isUnifiedStable(base)) {
        const list = stableGroups.get(base) ?? [];
        list.push(va);
        stableGroups.set(base, list);
      } else {
        const balance = new Decimal(va.accountBalance || '0');
        const available = new Decimal(va.availableBalance || '0');
        standalone.push({
          symbol: base,
          totalBalance: balance.toString(),
          totalAvailable: available.toString(),
          isUnifiedStable: false,
          networks: [
            {
              virtualAccountId: va.id,
              currency: va.currency,
              blockchain: va.blockchain,
              blockchainName: va.walletCurrency?.blockchainName ?? va.blockchain,
              balance: balance.toString(),
              available: available.toString(),
              depositAddress: va.depositAddresses[0]?.address ?? null,
            },
          ],
        });
      }
    }

    const unifiedStables: UnifiedBalance[] = [];
    for (const sym of ['USDT', 'USDC']) {
      const group = stableGroups.get(sym);
      if (!group?.length) {
        continue;
      }
      let totalBalance = new Decimal(0);
      let totalAvailable = new Decimal(0);
      const networks: UnifiedNetworkBalance[] = group.map((va) => {
        const balance = new Decimal(va.accountBalance || '0');
        const available = new Decimal(va.availableBalance || '0');
        totalBalance = totalBalance.plus(balance);
        totalAvailable = totalAvailable.plus(available);
        return {
          virtualAccountId: va.id,
          currency: va.currency,
          blockchain: va.blockchain,
          blockchainName: va.walletCurrency?.blockchainName ?? va.blockchain,
          balance: balance.toString(),
          available: available.toString(),
          depositAddress: va.depositAddresses[0]?.address ?? null,
        };
      });
      unifiedStables.push({
        symbol: sym,
        totalBalance: totalBalance.toString(),
        totalAvailable: totalAvailable.toString(),
        isUnifiedStable: true,
        networks,
      });
    }

    const symbolOrder = ['BTC', 'ETH', 'BNB', 'SOL', 'TRX', 'LTC', 'DOGE', 'XRP', 'MATIC', 'BSC'];
    standalone.sort((a, b) => {
      const ai = symbolOrder.indexOf(a.symbol);
      const bi = symbolOrder.indexOf(b.symbol);
      if (ai === -1 && bi === -1) {
        return a.symbol.localeCompare(b.symbol);
      }
      if (ai === -1) {
        return 1;
      }
      if (bi === -1) {
        return -1;
      }
      return ai - bi;
    });

    return [...unifiedStables, ...standalone];
  }

  /**
   * Move available balance between same-symbol VAs (ledger only), then ensure target can cover amount.
   */
  async getBlockchainForCurrency(currency: string): Promise<string | null> {
    const wc = await prisma.walletCurrency.findFirst({
      where: { currency },
      select: { blockchain: true },
    });
    return wc?.blockchain?.toLowerCase() ?? null;
  }

  async allocateUnifiedBalance(
    userId: number,
    symbol: string,
    targetCurrency: string,
    targetBlockchain: string | undefined,
    amount: Decimal
  ): Promise<number> {
    const base = getBaseSymbol(symbol);
    if (!isUnifiedStable(base)) {
      throw new Error(`${symbol} is not a unified stablecoin`);
    }

    const chain = targetBlockchain
      ? normalizeBlockchain(targetBlockchain)
      : null;
    const unified = await this.getUnifiedBalance(userId, base);

    if (new Decimal(unified.totalAvailable).lt(amount)) {
      const breakdown = unified.networks
        .map((n) => `${n.available} on ${n.blockchainName || n.blockchain}`)
        .join(', ');
      throw new Error(
        `Insufficient ${base} balance. Available: ${unified.totalAvailable} ${base}` +
          (breakdown ? ` (${breakdown})` : '')
      );
    }

    return prisma.$transaction(async (tx) => {
      const accounts = await tx.virtualAccount.findMany({
        where: { userId, active: true },
        orderBy: { id: 'asc' },
      });

      const family = accounts.filter((va) => getBaseSymbol(va.currency) === base);
      let target = family.find(
        (va) => va.currency.toUpperCase() === targetCurrency.toUpperCase()
      );

      if (!target && chain) {
        target = family.find((va) => normalizeBlockchain(va.blockchain) === chain);
      }

      if (!target) {
        target = family.find((va) => va.currency.toUpperCase() === targetCurrency.toUpperCase());
      }

      if (!target && family.length > 0) {
        target = family[0];
      }

      if (!target) {
        throw new Error(
          `No ${base} virtual account for ${targetCurrency}` +
            (targetBlockchain ? ` on ${targetBlockchain}` : '') +
            '. Initialize crypto wallets first.'
        );
      }

      let targetAvailable = new Decimal(target.availableBalance || '0');

      if (targetAvailable.lt(amount)) {
        const deficit = amount.minus(targetAvailable);
        const sources = family
          .filter((va) => va.id !== target!.id)
          .map((va) => ({
            va,
            available: new Decimal(va.availableBalance || '0'),
          }))
          .filter((s) => s.available.gt(0))
          .sort((a, b) => (b.available.gt(a.available) ? 1 : b.available.lt(a.available) ? -1 : 0));

        let remaining = deficit;
        for (const { va, available } of sources) {
          if (remaining.lte(0)) {
            break;
          }
          const move = Decimal.min(available, remaining);
          const newSourceAvail = available.minus(move);
          await tx.virtualAccount.update({
            where: { id: va.id },
            data: { availableBalance: newSourceAvail.toString() },
          });
          targetAvailable = targetAvailable.plus(move);
          remaining = remaining.minus(move);
        }

        await tx.virtualAccount.update({
          where: { id: target.id },
          data: { availableBalance: targetAvailable.toString() },
        });

        if (remaining.gt(0)) {
          throw new Error(`Could not allocate ${base} across networks`);
        }
      }

      const finalTarget = await tx.virtualAccount.findUnique({ where: { id: target.id } });
      if (!finalTarget || new Decimal(finalTarget.availableBalance || '0').lt(amount)) {
        throw new Error(`Insufficient ${base} on target network after allocation`);
      }

      return target.id;
    });
  }

  /** Resolve VA for order/ad currency (may be USDT_TRON etc.). */
  async resolveVirtualAccountForCurrency(
    userId: number,
    cryptoCurrency: string,
    blockchain?: string
  ) {
    const base = getBaseSymbol(cryptoCurrency);
    if (isUnifiedStable(base)) {
      const accounts = await this.getVirtualAccountsForSymbol(userId, base);
      const exact = accounts.find(
        (va) => va.currency.toUpperCase() === cryptoCurrency.toUpperCase()
      );
      if (exact) {
        return exact;
      }
      if (blockchain) {
        const chain = normalizeBlockchain(blockchain);
        return accounts.find((va) => normalizeBlockchain(va.blockchain) === chain) ?? null;
      }
      return accounts[0] ?? null;
    }

    return prisma.virtualAccount.findFirst({
      where: {
        userId,
        currency: cryptoCurrency,
        ...(blockchain ? { blockchain: blockchain.toLowerCase() } : {}),
      },
    });
  }
}
