/* 
 * TATUM DEPOSIT ADDRESS SERVICE - COMMENTED OUT FOR MOCK TESTING
 * This service will be used when Tatum account is available
 */

/*
import prisma from '../../core/config/database.js';
import { encryptPrivateKey, decryptPrivateKey } from '../../core/utils/encryption.js';
import { TatumService } from './tatum.service.js';
import { UserWalletService } from './user-wallet.service.js';

/**
 * Deposit Address Service
 * Generates deposit addresses from user wallets
 */
export class DepositAddressService {
  private tatumService: TatumService;
  private userWalletService: UserWalletService;

  constructor() {
    this.tatumService = new TatumService();
    this.userWalletService = new UserWalletService();
  }

  /**
   * Generate and assign deposit address to virtual account
   */
  async generateAndAssignToVirtualAccount(virtualAccountId: string) {
    // Get virtual account
    const virtualAccount = await prisma.virtualAccount.findUnique({
      where: { id: virtualAccountId },
      include: { walletCurrency: true },
    });

    if (!virtualAccount) {
      throw new Error('Virtual account not found');
    }

    const blockchain = virtualAccount.blockchain.toLowerCase();
    const normalizedBlockchain = this.normalizeBlockchain(blockchain);

    // Check for existing address on same blockchain (address reuse)
    const allUserAddresses = await prisma.depositAddress.findMany({
      where: {
        virtualAccount: {
          userId: virtualAccount.userId,
        },
      },
      include: {
        virtualAccount: true,
      },
    });

    const existingAddress = allUserAddresses.find((addr) => {
      if (!addr.blockchain) return false;
      const addrNormalized = this.normalizeBlockchain(addr.blockchain);
      return addrNormalized === normalizedBlockchain;
    });

    // Reuse existing address if found
    if (existingAddress) {
      const depositAddress = await prisma.depositAddress.create({
        data: {
          virtualAccountId,
          userWalletId: existingAddress.userWalletId,
          blockchain,
          currency: virtualAccount.currency,
          address: existingAddress.address,
          index: existingAddress.index,
          privateKey: existingAddress.privateKey,
        },
      });
      return depositAddress;
    }

    // Generate new address
    const userWallet = await this.userWalletService.getOrCreateUserWallet(
      virtualAccount.userId,
      normalizedBlockchain
    );

    const isNoXpub = normalizedBlockchain === 'solana' || normalizedBlockchain === 'sol' ||
                     normalizedBlockchain === 'xrp' || normalizedBlockchain === 'ripple';

    let address: string;
    let privateKey: string;

    if (isNoXpub) {
      // Solana/XRP: reuse address from xpub field
      if (userWallet.xpub) {
        address = userWallet.xpub;
        const mnemonic = decryptPrivateKey(userWallet.mnemonic!);
        privateKey = mnemonic; // For Solana/XRP, mnemonic stores privateKey/secret
      } else {
        // First time: generate wallet
        const walletData = await this.tatumService.createWallet(normalizedBlockchain);
        address = walletData.address || '';
        privateKey = walletData.privateKey || walletData.secret || '';

        if (!address || !privateKey) {
          throw new Error('Failed to generate wallet address');
        }

        // Store address in xpub field
        await prisma.userWallet.update({
          where: { id: userWallet.id },
          data: { xpub: address },
        });
      }
    } else {
      // Other blockchains: generate from xpub
      if (!userWallet.xpub) {
        throw new Error('User wallet missing xpub');
      }

      const mnemonic = decryptPrivateKey(userWallet.mnemonic!);
      address = await this.tatumService.generateAddress(normalizedBlockchain, userWallet.xpub, 0);
      privateKey = await this.tatumService.generatePrivateKey(normalizedBlockchain, mnemonic, 0);
    }

    // Encrypt private key
    const encryptedPrivateKey = encryptPrivateKey(privateKey);

    // Store deposit address
    const depositAddress = await prisma.depositAddress.create({
      data: {
        virtualAccountId,
        userWalletId: userWallet.id,
        blockchain,
        currency: virtualAccount.currency,
        address,
        index: 0,
        privateKey: encryptedPrivateKey,
      },
    });

    // Register webhooks
    const webhookUrl = process.env.TATUM_WEBHOOK_URL || 
                      `${process.env.BASE_URL || 'http://localhost:3000'}/api/crypto/webhooks/tatum`;

    try {
      // Register native token webhook
      await this.tatumService.registerAddressWebhookV4(address, normalizedBlockchain, webhookUrl, {
        type: 'INCOMING_NATIVE_TX',
      });

      // Register fungible token webhook if blockchain supports tokens
      const hasFungibleTokens = await prisma.walletCurrency.findFirst({
        where: {
          blockchain: normalizedBlockchain.toLowerCase(),
          isToken: true,
          contractAddress: { not: null },
        },
      });

      if (hasFungibleTokens) {
        await this.tatumService.registerAddressWebhookV4(address, normalizedBlockchain, webhookUrl, {
          type: 'INCOMING_FUNGIBLE_TX',
        });
      }
    } catch (error) {
      console.error('Failed to register webhook:', error);
      // Continue even if webhook registration fails
    }

    return depositAddress;
  }

  /**
   * Get deposit address for virtual account
   */
  async getDepositAddress(virtualAccountId: string) {
    return prisma.depositAddress.findFirst({
      where: { virtualAccountId },
      include: {
        virtualAccount: true,
        userWallet: true,
      },
    });
  }

  /**
   * Get deposit address by address string
   */
  async getDepositAddressByAddress(address: string) {
    return prisma.depositAddress.findFirst({
      where: { address },
      include: {
        virtualAccount: {
          include: {
            walletCurrency: true,
          },
        },
        userWallet: true,
      },
    });
  }

  /**
   * Normalize blockchain name
   */
  private normalizeBlockchain(blockchain: string): string {
    const normalized = blockchain.toLowerCase();
    const blockchainMap: { [key: string]: string } = {
      ethereum: 'ethereum',
      eth: 'ethereum',
      tron: 'tron',
      trx: 'tron',
      bsc: 'bsc',
      binance: 'bsc',
      binancesmartchain: 'bsc',
      polygon: 'polygon',
      matic: 'polygon',
    };
    return blockchainMap[normalized] || normalized;
  }
}
*/

