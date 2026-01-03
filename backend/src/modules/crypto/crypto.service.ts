import prisma from '../../core/config/database.js';
// TATUM SERVICES COMMENTED OUT - Using local wallet generation instead
// import { VirtualAccountService } from '../../services/tatum/virtual-account.service.js';
// import { DepositAddressService } from '../../services/tatum/deposit-address.service.js';
import { WalletGeneratorService } from '../../services/crypto/wallet-generator.service.js';

/**
 * Crypto Service
 * Business logic for crypto operations
 */
export class CryptoService {
  // TATUM SERVICES COMMENTED OUT
  // private virtualAccountService: VirtualAccountService;
  // private depositAddressService: DepositAddressService;
  private walletGenerator: WalletGeneratorService;

  constructor() {
    // this.virtualAccountService = new VirtualAccountService();
    // this.depositAddressService = new DepositAddressService();
    this.walletGenerator = new WalletGeneratorService();
  }

  /**
   * Get user's virtual accounts (from database)
   */
  async getUserVirtualAccounts(userId: string) {
    const virtualAccounts = await prisma.virtualAccount.findMany({
      where: { userId },
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
      },
      orderBy: [
        { blockchain: 'asc' },
        { currency: 'asc' },
      ],
    });

    return virtualAccounts.map(va => ({
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
    }));
  }

  /**
   * Get deposit address for a currency and blockchain
   */
  async getDepositAddress(userId: string, currency: string, blockchain: string) {
    // Get or create virtual account
    let virtualAccount = await prisma.virtualAccount.findFirst({
      where: {
        userId,
        currency,
        blockchain: blockchain.toLowerCase(),
      },
    });

    if (!virtualAccount) {
      // Create virtual accounts if they don't exist
      await this.initializeUserCryptoWallets(userId);
      virtualAccount = await prisma.virtualAccount.findFirst({
        where: {
          userId,
          currency,
          blockchain: blockchain.toLowerCase(),
        },
      });

      if (!virtualAccount) {
        throw new Error(`Virtual account not found for ${currency} on ${blockchain}`);
      }
    }

    // Get or create deposit address
    let depositAddress = await prisma.depositAddress.findFirst({
      where: {
        virtualAccountId: virtualAccount.id,
        currency,
        blockchain: blockchain.toLowerCase(),
      },
    });

    if (!depositAddress) {
      // Get or create user wallet
      const userWallet = await this.walletGenerator.getOrCreateUserWallet(userId, blockchain);
      
      // Generate deposit address
      depositAddress = await this.walletGenerator.generateDepositAddress(
        virtualAccount.id,
        userWallet.id,
        blockchain,
        currency
      );
    }

    return {
      address: depositAddress.address,
      currency: depositAddress.currency,
      blockchain: depositAddress.blockchain,
      virtualAccountId: virtualAccount.accountId,
    };
  }

  /**
   * Create virtual accounts for user (triggered after email verification)
   * All generated in database - no external API calls
   */
  async initializeUserCryptoWallets(userId: string) {
    // Get all wallet currencies from database
    const walletCurrencies = await prisma.walletCurrency.findMany({
      where: { isActive: true },
      orderBy: [
        { blockchain: 'asc' },
        { currency: 'asc' },
      ],
    });

    const createdVirtualAccounts = [];

    // Create virtual accounts for each wallet currency
    for (const wc of walletCurrencies) {
      try {
        // Check if virtual account already exists
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

        // Generate unique account ID
        const accountId = `va_${userId}_${wc.blockchain}_${wc.currency}_${Date.now()}`;

        // Get or create user wallet for this blockchain
        const userWallet = await this.walletGenerator.getOrCreateUserWallet(userId, wc.blockchain);

        // Create virtual account
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

        // Generate deposit address
        try {
          await this.walletGenerator.generateDepositAddress(
            virtualAccount.id,
            userWallet.id,
            wc.blockchain,
            wc.currency
          );
        } catch (error) {
          console.error(`Failed to generate deposit address for ${wc.currency}:`, error);
          // Continue with other currencies
        }

        createdVirtualAccounts.push(virtualAccount);
      } catch (error) {
        console.error(`Failed to create virtual account for ${wc.currency}:`, error);
        // Continue with other currencies
      }
    }

    return createdVirtualAccounts;
  }

  /**
   * Get all USDT tokens across different blockchains
   * Returns all USDT variants (Ethereum, TRON, BSC, Solana, Polygon, etc.)
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
      orderBy: [
        { blockchain: 'asc' },
        { currency: 'asc' },
      ],
    });

    return usdtTokens.map(token => ({
      id: token.id,
      blockchain: token.blockchain,
      blockchainName: token.blockchainName || token.blockchain,
      currency: token.currency,
      symbol: token.symbol || 'USDT',
      name: token.name,
      contractAddress: token.contractAddress,
      decimals: token.decimals,
      isToken: token.isToken,
      price: token.price?.toString() || null,
      nairaPrice: token.nairaPrice?.toString() || null,
      // Display name for UI
      displayName: this.getUSDTDisplayName(token.blockchain, token.currency),
    }));
  }

  /**
   * Get all tokens for a given symbol (e.g., USDT, USDC)
   */
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
      orderBy: [
        { blockchain: 'asc' },
        { currency: 'asc' },
      ],
    });

    return tokens.map(token => ({
      id: token.id,
      blockchain: token.blockchain,
      blockchainName: token.blockchainName || token.blockchain,
      currency: token.currency,
      symbol: token.symbol || symbol.toUpperCase(),
      name: token.name,
      contractAddress: token.contractAddress,
      decimals: token.decimals,
      isToken: token.isToken,
      price: token.price?.toString() || null,
      nairaPrice: token.nairaPrice?.toString() || null,
      displayName: this.getTokenDisplayName(token.blockchain, token.currency, token.symbol || symbol.toUpperCase()),
    }));
  }

  /**
   * Get display name for USDT token based on blockchain
   */
  private getUSDTDisplayName(blockchain: string, currency: string): string {
    const blockchainNames: { [key: string]: string } = {
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
    
    // Handle USDT_TRON, USDT_BSC, etc.
    return `USDT (${blockchainName})`;
  }

  /**
   * Get display name for any token based on blockchain
   */
  private getTokenDisplayName(blockchain: string, currency: string, symbol: string): string {
    const blockchainNames: { [key: string]: string } = {
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
}

