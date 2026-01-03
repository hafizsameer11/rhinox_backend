import prisma from '../../core/config/database.js';
import { VirtualAccountService } from '../../services/tatum/virtual-account.service.js';
import { DepositAddressService } from '../../services/tatum/deposit-address.service.js';

/**
 * Crypto Service
 * Business logic for crypto operations
 */
export class CryptoService {
  private virtualAccountService: VirtualAccountService;
  private depositAddressService: DepositAddressService;

  constructor() {
    this.virtualAccountService = new VirtualAccountService();
    this.depositAddressService = new DepositAddressService();
  }

  /**
   * Get user's virtual accounts
   */
  async getUserVirtualAccounts(userId: string) {
    return this.virtualAccountService.getUserVirtualAccounts(userId);
  }

  /**
   * Get deposit address for a currency and blockchain
   */
  async getDepositAddress(userId: string, currency: string, blockchain: string) {
    // Get or create virtual account
    const virtualAccounts = await this.virtualAccountService.getUserVirtualAccounts(userId);
    
    let virtualAccount = virtualAccounts.find(
      va => va.currency === currency && va.blockchain.toLowerCase() === blockchain.toLowerCase()
    );

    if (!virtualAccount) {
      // Create virtual accounts if they don't exist
      await this.virtualAccountService.createVirtualAccountsForUser(userId);
      const updatedAccounts = await this.virtualAccountService.getUserVirtualAccounts(userId);
      virtualAccount = updatedAccounts.find(
        va => va.currency === currency && va.blockchain.toLowerCase() === blockchain.toLowerCase()
      );

      if (!virtualAccount) {
        throw new Error(`Virtual account not found for ${currency} on ${blockchain}`);
      }
    }

    // Get or create deposit address
    let depositAddress = await this.depositAddressService.getDepositAddress(virtualAccount.id);

    if (!depositAddress) {
      depositAddress = await this.depositAddressService.generateAndAssignToVirtualAccount(virtualAccount.id);
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
   */
  async initializeUserCryptoWallets(userId: string) {
    // Create virtual accounts
    const virtualAccounts = await this.virtualAccountService.createVirtualAccountsForUser(userId);

    // Generate deposit addresses for each virtual account
    for (const virtualAccount of virtualAccounts) {
      try {
        await this.depositAddressService.generateAndAssignToVirtualAccount(virtualAccount.id);
      } catch (error) {
        console.error(`Failed to generate deposit address for ${virtualAccount.currency}:`, error);
        // Continue with other currencies
      }
    }

    return virtualAccounts;
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

