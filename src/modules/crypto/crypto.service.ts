import prisma from '../../core/config/database.js';
import { isTatumEnabled } from '../../core/config/tatum.config.js';
import { WalletGeneratorService } from '../../services/crypto/wallet-generator.service.js';
import { UnifiedStablecoinService } from '../../services/crypto/unified-stablecoin.service.js';
import { CryptoWalletLinkService } from '../../services/tatum/crypto-wallet-link.service.js';
import { DepositAddressService } from '../../services/tatum/deposit-address.service.js';
import { VirtualAccountService } from '../../services/tatum/virtual-account.service.js';
import { BushaAppService, isBushaEnabled } from '../../services/busha/index.js';

/**
 * Crypto Service
 * Business logic for crypto operations.
 * Busha is the live custodian when BUSHA_API_KEY is set. Tatum code stays in the
 * repo and is used only when Busha is off.
 */
export class CryptoService {
  private readonly walletGenerator = new WalletGeneratorService();
  private readonly virtualAccountService = new VirtualAccountService();
  private readonly depositAddressService = new DepositAddressService();
  private readonly linkService = new CryptoWalletLinkService();
  private readonly unifiedStablecoinService = new UnifiedStablecoinService();
  private readonly bushaService = new BushaAppService();

  /**
   * Get user's virtual accounts (from database)
   */
  async getUserVirtualAccounts(userId: string | number) {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }

    if (isBushaEnabled()) {
      return this.bushaService.mapVirtualAccounts(userIdNum);
    }

    const virtualAccounts = await prisma.virtualAccount.findMany({
      where: { userId: userIdNum },
      include: {
        walletCurrency: {
          select: {
            id: true,
            blockchain: true,
            currency: true,
            symbol: true,
            name: true,
            isToken: true,
            contractAddress: true,
            decimals: true,
          },
        },
        depositAddresses: {
          select: {
            id: true,
            address: true,
            currency: true,
            blockchain: true,
            userWalletId: true,
            userWallet: {
              select: {
                id: true,
                blockchain: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
      },
      orderBy: [{ blockchain: 'asc' }, { currency: 'asc' }],
    });

    return virtualAccounts.map((va) => ({
      id: va.id,
      userId: va.userId,
      blockchain: va.blockchain,
      currency: va.currency,
      accountId: va.accountId,
      accountCode: va.accountCode,
      active: va.active,
      frozen: va.frozen,
      accountBalance: va.accountBalance,
      availableBalance: va.availableBalance,
      walletCurrency: va.walletCurrency,
      depositAddresses: va.depositAddresses || [],
    }));
  }

  /**
   * Get deposit address for a currency and blockchain
   */
  async getDepositAddress(userId: string | number, currency: string, blockchain: string) {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }

    if (isBushaEnabled()) {
      return this.bushaService.getDepositAddress(userIdNum, currency, blockchain);
    }

    const blockchainKey = blockchain.toLowerCase();

    let virtualAccount = await prisma.virtualAccount.findFirst({
      where: {
        userId: userIdNum,
        currency,
        blockchain: blockchainKey,
      },
    });

    if (!virtualAccount) {
      await this.initializeUserCryptoWallets(userIdNum);
      virtualAccount = await prisma.virtualAccount.findFirst({
        where: {
          userId: userIdNum,
          currency,
          blockchain: blockchainKey,
        },
      });

      if (!virtualAccount) {
        throw new Error(`Virtual account not found for ${currency} on ${blockchain}`);
      }
    }

    let depositAddress = await prisma.depositAddress.findFirst({
      where: {
        virtualAccountId: virtualAccount.id,
        currency,
        blockchain: blockchainKey,
      },
    });

    if (!depositAddress) {
      if (isTatumEnabled()) {
        depositAddress = await this.depositAddressService.generateAndAssignToVirtualAccount(
          virtualAccount.id
        );
      } else {
        const userWallet = await this.walletGenerator.getOrCreateUserWallet(
          String(userIdNum),
          blockchain
        );
        depositAddress = await this.walletGenerator.generateDepositAddress(
          virtualAccount.id.toString(),
          userWallet.id.toString(),
          blockchain,
          currency
        );
      }
    }

    const userWallet = depositAddress.userWalletId
      ? await prisma.userWallet.findUnique({
          where: { id: depositAddress.userWalletId },
          select: { id: true, blockchain: true },
        })
      : null;

    return {
      address: depositAddress.address,
      currency: depositAddress.currency,
      blockchain: depositAddress.blockchain,
      /** Webhook + ledger account UUID (not Tatum Ledger) */
      virtualAccountId: virtualAccount.accountId,
      virtualAccountDbId: virtualAccount.id,
      userWalletId: depositAddress.userWalletId,
      userWalletBlockchain: userWallet?.blockchain ?? null,
      /** In-app balance only — updated by webhooks, P2P, buy/sell */
      ledger: {
        accountBalance: virtualAccount.accountBalance,
        availableBalance: virtualAccount.availableBalance,
      },
    };
  }

  /**
   * Create virtual accounts + deposit addresses after email verification.
   */
  async initializeUserCryptoWallets(userId: string | number) {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }

    if (isBushaEnabled()) {
      console.log(`Skipping Tatum/local crypto init for user ${userIdNum}; Busha is the live provider`);
      return [];
    }

    if (isTatumEnabled()) {
      return this.initializeUserCryptoWalletsWithTatum(userIdNum);
    }
    return this.initializeUserCryptoWalletsLocal(userIdNum);
  }

  private async initializeUserCryptoWalletsWithTatum(userId: number) {
    const virtualAccounts = await this.virtualAccountService.createVirtualAccountsForUser(userId);
    console.log(
      `Creating deposit addresses (Tatum) for ${virtualAccounts.length} virtual accounts, user ${userId}...`
    );

    let assigned = 0;
    for (const va of virtualAccounts) {
      try {
        const existing = await prisma.depositAddress.findFirst({
          where: { virtualAccountId: va.id },
        });
        if (!existing) {
          await this.depositAddressService.generateAndAssignToVirtualAccount(va.id);
        }
        assigned++;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          `Failed deposit address for ${va.currency} on ${va.blockchain}:`,
          message
        );
      }
    }

    const { issues } = await this.linkService.ensureUserCryptoLinks(userId);
    if (issues.length > 0) {
      console.warn(`User ${userId} crypto link issues:`, issues);
    }

    console.log(
      `✅ Tatum crypto init: ${assigned}/${virtualAccounts.length} virtual accounts for user ${userId}`
    );
    return virtualAccounts;
  }

  private async initializeUserCryptoWalletsLocal(userId: number) {
    const walletCurrencies = await prisma.walletCurrency.findMany({
      orderBy: [{ blockchain: 'asc' }, { currency: 'asc' }],
    });

    if (walletCurrencies.length === 0) {
      console.log(`No wallet currencies in database for user ${userId}`);
      return [];
    }

    console.log(
      `Creating ${walletCurrencies.length} crypto virtual accounts (local) for user ${userId}...`
    );

    const createdVirtualAccounts = [];

    for (const wc of walletCurrencies) {
      try {
        const existing = await prisma.virtualAccount.findFirst({
          where: {
            userId,
            blockchain: wc.blockchain.toLowerCase(),
            currency: wc.currency,
          },
        });

        if (existing) {
          createdVirtualAccounts.push(existing);
          continue;
        }

        const accountId = `va_${userId}_${wc.blockchain}_${wc.currency}_${Date.now()}`;
        const userWallet = await this.walletGenerator.getOrCreateUserWallet(
          String(userId),
          wc.blockchain
        );

        const virtualAccount = await prisma.virtualAccount.create({
          data: {
            userId,
            blockchain: wc.blockchain.toLowerCase(),
            currency: wc.currency,
            accountId,
            accountCode: wc.currency,
            active: true,
            frozen: false,
            accountBalance: '0',
            availableBalance: '0',
            xpub: userWallet.xpub,
            currencyId: wc.id,
          },
        });

        try {
          await this.walletGenerator.generateDepositAddress(
            virtualAccount.id.toString(),
            userWallet.id.toString(),
            wc.blockchain,
            wc.currency
          );
        } catch (error) {
          console.error(`Failed local deposit address for ${wc.currency}:`, error);
        }

        createdVirtualAccounts.push(virtualAccount);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          `❌ Failed virtual account for ${wc.currency} on ${wc.blockchain}:`,
          message
        );
      }
    }

    console.log(
      `✅ Local crypto init: ${createdVirtualAccounts.length}/${walletCurrencies.length} for user ${userId}`
    );
    return createdVirtualAccounts;
  }

  async getAllUnifiedBalances(userId: string | number) {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }
    if (isBushaEnabled()) {
      return this.bushaService.tryMapUnifiedBalances(userIdNum);
    }
    return this.unifiedStablecoinService.getAllUnifiedBalances(userIdNum);
  }

  async getUnifiedBalance(userId: string | number, symbol: string) {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }
    if (isBushaEnabled()) {
      const rows = await this.bushaService.tryMapUnifiedBalances(userIdNum);
      return rows.find((row) => row.symbol.toUpperCase() === symbol.toUpperCase()) || {
        symbol: symbol.toUpperCase(),
        totalBalance: '0',
        totalAvailable: '0',
        isUnifiedStable: ['USDT', 'USDC'].includes(symbol.toUpperCase()),
        networks: [],
      };
    }
    return this.unifiedStablecoinService.getUnifiedBalance(userIdNum, symbol);
  }

  /**
   * Get all USDT tokens across different blockchains
   */
  async getUSDTTokens() {
    const usdtTokens = await prisma.walletCurrency.findMany({
      where: {
        OR: [
          { currency: 'USDT' },
          { currency: { startsWith: 'USDT_' } },
          { symbol: 'USDT' },
        ],
        isToken: true,
      },
      orderBy: [{ blockchain: 'asc' }, { currency: 'asc' }],
    });

    return usdtTokens.map((token) => ({
      id: token.id,
      blockchain: token.blockchain,
      blockchainName: token.blockchainName || token.blockchain,
      currency: token.currency,
      symbol: token.symbol || 'USDT',
      name: token.name,
      icon: this.getCurrencyIcon(token.icon, token.symbol || 'USDT', token.currency),
      contractAddress: token.contractAddress,
      decimals: token.decimals,
      isToken: token.isToken,
      price: token.price?.toString() || null,
      nairaPrice: token.nairaPrice?.toString() || null,
      displayName: this.getUSDTDisplayName(token.blockchain, token.currency),
    }));
  }

  async getTokensBySymbol(symbol: string) {
    const tokens = await prisma.walletCurrency.findMany({
      where: {
        OR: [
          { symbol: symbol.toUpperCase() },
          { currency: symbol.toUpperCase() },
          { currency: { startsWith: `${symbol.toUpperCase()}_` } },
        ],
        isToken: true,
      },
      orderBy: [{ blockchain: 'asc' }, { currency: 'asc' }],
    });

    return tokens.map((token) => ({
      id: token.id,
      blockchain: token.blockchain,
      blockchainName: token.blockchainName || token.blockchain,
      currency: token.currency,
      symbol: token.symbol || symbol.toUpperCase(),
      name: token.name,
      icon: this.getCurrencyIcon(token.icon, token.symbol || symbol.toUpperCase(), token.currency),
      contractAddress: token.contractAddress,
      decimals: token.decimals,
      isToken: token.isToken,
      price: token.price?.toString() || null,
      nairaPrice: token.nairaPrice?.toString() || null,
      displayName: this.getTokenDisplayName(
        token.blockchain,
        token.currency,
        token.symbol || symbol.toUpperCase()
      ),
    }));
  }

  private getUSDTDisplayName(blockchain: string, currency: string): string {
    const blockchainNames: Record<string, string> = {
      ethereum: 'Ethereum',
      tron: 'TRON',
      bsc: 'Binance Smart Chain',
      solana: 'Solana',
      polygon: 'Polygon',
      bitcoin: 'Bitcoin',
      dogecoin: 'Dogecoin',
      xrp: 'XRP Ledger',
    };

    const blockchainName = blockchainNames[blockchain.toLowerCase()] || blockchain;
    if (currency === 'USDT') {
      return `USDT (${blockchainName})`;
    }
    return `USDT (${blockchainName})`;
  }

  private getTokenDisplayName(blockchain: string, currency: string, symbol: string): string {
    const blockchainNames: Record<string, string> = {
      ethereum: 'Ethereum',
      tron: 'TRON',
      bsc: 'Binance Smart Chain',
      solana: 'Solana',
      polygon: 'Polygon',
      bitcoin: 'Bitcoin',
      dogecoin: 'Dogecoin',
      xrp: 'XRP Ledger',
    };

    const blockchainName = blockchainNames[blockchain.toLowerCase()] || blockchain;
    if (currency === symbol) {
      return `${symbol} (${blockchainName})`;
    }
    return `${symbol} (${blockchainName})`;
  }

  private getCurrencyIcon(
    icon: string | null | undefined,
    symbol: string,
    currency: string
  ): string | null {
    if (icon) {
      return `/uploads/wallet_symbols/${icon}`;
    }

    const iconMap: Record<string, string> = {
      BTC: 'btc.png',
      ETH: 'ETH.png',
      USDT: 'TUSDT.png',
      TRX: 'trx.png',
      SOL: 'sol.png',
      MATIC: 'polygon-matic-logo.png',
      BNB: 'BSC.png',
      DOGE: 'dogecoin-doge-logo.png',
      XRP: 'xrp-xrp-logo.png',
    };

    const iconFile = iconMap[symbol.toUpperCase()] || iconMap[currency.toUpperCase()];
    if (iconFile) {
      return `/uploads/wallet_symbols/${iconFile}`;
    }
    return null;
  }
}
