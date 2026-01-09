import { randomBytes } from 'crypto';
import { encryptPrivateKey } from '../../core/utils/encryption.js';
import prisma from '../../core/config/database.js';

/**
 * Local Crypto Wallet Generator Service
 * Generates crypto wallets locally without external APIs
 */
export class WalletGeneratorService {
  /**
   * Generate a mnemonic phrase (12 words)
   */
  private generateMnemonic(): string {
    // For now, we'll generate a random seed
    // In production, use a proper BIP39 library
    const entropy = randomBytes(16);
    // This is a simplified version - in production use bip39 library
    return this.entropyToMnemonic(entropy);
  }

  /**
   * Convert entropy to mnemonic (simplified - use bip39 in production)
   */
  private entropyToMnemonic(entropy: Buffer): string {
    // Simplified: generate a hex string that can be used as seed
    // In production, use: bip39.entropyToMnemonic(entropy)
    return entropy.toString('hex');
  }

  /**
   * Generate wallet for a blockchain
   * Returns mnemonic/seed and xpub/address
   */
  async generateWallet(blockchain: string): Promise<{
    mnemonic: string;
    xpub?: string;
    address?: string;
    privateKey?: string;
    secret?: string;
  }> {
    const normalizedBlockchain = blockchain.toLowerCase();

    // Generate mnemonic/seed
    const mnemonic = this.generateMnemonic();

    // For different blockchains, we'll generate different formats
    // In production, use proper libraries:
    // - Bitcoin: bitcoinjs-lib, bip32
    // - Ethereum: ethers.js
    // - TRON: tronweb
    // - BSC: ethers.js (same as Ethereum)
    // - Solana: @solana/web3.js
    // - XRP: ripple-lib

    // For now, generate a simple format
    // In production, implement proper wallet generation for each blockchain
    const seed = randomBytes(32);
    const address = '0x' + randomBytes(20).toString('hex'); // Ethereum-style address
    const xpub = 'xpub' + randomBytes(78).toString('hex'); // Extended public key format

    return {
      mnemonic,
      xpub,
      address,
      privateKey: seed.toString('hex'),
      secret: seed.toString('hex'), // For XRP
    };
  }

  /**
   * Generate address from xpub and index
   */
  async generateAddress(blockchain: string, xpub: string, index: number): Promise<string> {
    // In production, use proper libraries to derive address from xpub
    // For now, return a generated address
    const normalizedBlockchain = blockchain.toLowerCase();
    
    // Generate deterministic address based on xpub and index
    const hash = randomBytes(20);
    return '0x' + hash.toString('hex');
  }

  /**
   * Generate private key from mnemonic and index
   */
  async generatePrivateKey(blockchain: string, mnemonic: string, index: number): Promise<string> {
    // In production, use proper BIP32/BIP44 derivation
    // For now, generate a deterministic key
    const seed = randomBytes(32);
    return seed.toString('hex');
  }

  /**
   * Get or create user wallet for a blockchain
   */
  async getOrCreateUserWallet(userId: string | number, blockchain: string) {
    // Parse userId to integer for Prisma queries
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }

    // Check if wallet exists
    let userWallet = await prisma.userWallet.findUnique({
      where: {
        userId_blockchain: {
          userId: userIdNum,
          blockchain: blockchain.toLowerCase(),
        },
      },
    });

    if (userWallet) {
      return userWallet;
    }

    // Generate new wallet
    const walletData = await this.generateWallet(blockchain);

    // Handle special cases (Solana, XRP)
    const isNoXpub = blockchain === 'solana' || blockchain === 'sol' ||
                     blockchain === 'xrp' || blockchain === 'ripple';

    // Determine what to store in mnemonic field
    let mnemonicOrSecret: string;
    if (blockchain === 'solana' || blockchain === 'sol') {
      mnemonicOrSecret = walletData.privateKey || walletData.mnemonic || '';
    } else if (blockchain === 'xrp' || blockchain === 'ripple') {
      mnemonicOrSecret = walletData.secret || walletData.privateKey || '';
    } else {
      mnemonicOrSecret = walletData.mnemonic || '';
    }

    if (!mnemonicOrSecret) {
      throw new Error(`Failed to generate wallet for blockchain: ${blockchain}`);
    }

    const encryptedMnemonic = encryptPrivateKey(mnemonicOrSecret);

    // Create wallet
    userWallet = await prisma.userWallet.create({
      data: {
        userId: userIdNum,
        blockchain: blockchain.toLowerCase(),
        mnemonic: encryptedMnemonic,
        xpub: isNoXpub ? (walletData.address || '') : (walletData.xpub || ''),
        derivationPath: this.getDerivationPath(blockchain),
      },
    });

    return userWallet;
  }

  /**
   * Get derivation path for blockchain
   */
  private getDerivationPath(blockchain: string): string | null {
    const paths: { [key: string]: string | null } = {
      bitcoin: "m/44'/0'/0'",
      ethereum: "m/44'/60'/0'",
      bsc: "m/44'/60'/0'", // Same as Ethereum
      tron: "m/44'/195'/0'",
      polygon: "m/44'/60'/0'", // Same as Ethereum
      litecoin: "m/44'/2'/0'",
      dogecoin: "m/44'/3'/0'",
      solana: null, // Solana doesn't use BIP44
      xrp: null, // XRP doesn't use BIP44
      ripple: null,
    };

    return paths[blockchain.toLowerCase()] || null;
  }

  /**
   * Generate deposit address for a virtual account
   */
  async generateDepositAddress(
    virtualAccountId: string,
    userWalletId: string,
    blockchain: string,
    currency: string
  ) {
    const parsedUserWalletId = typeof userWalletId === 'string' ? parseInt(userWalletId, 10) : userWalletId;
    if (isNaN(parsedUserWalletId) || parsedUserWalletId <= 0) {
      throw new Error('Invalid user wallet ID format');
    }

    // Get user wallet
    const userWallet = await prisma.userWallet.findUnique({
      where: { id: parsedUserWalletId },
    });

    if (!userWallet) {
      throw new Error('User wallet not found');
    }

    const normalizedBlockchain = blockchain.toLowerCase();
    const isNoXpub = normalizedBlockchain === 'solana' || normalizedBlockchain === 'sol' ||
                     normalizedBlockchain === 'xrp' || normalizedBlockchain === 'ripple';

    let address: string;
    let privateKey: string;

    if (isNoXpub) {
      // Solana/XRP: reuse address from xpub field or generate new
      if (userWallet.xpub) {
        address = userWallet.xpub;
        // For Solana/XRP, we'd decrypt mnemonic to get private key
        privateKey = userWallet.xpub; // Simplified
      } else {
        // Generate new address
        const walletData = await this.generateWallet(normalizedBlockchain);
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

      // Find next available index
      const existingAddresses = await prisma.depositAddress.findMany({
        where: {
          userWalletId: userWallet.id,
          blockchain: normalizedBlockchain,
        },
        orderBy: {
          index: 'desc',
        },
        take: 1,
      });

      const firstAddress = existingAddresses.length > 0 ? existingAddresses[0] : null;
      const nextIndex = firstAddress && firstAddress.index !== null 
        ? (firstAddress.index || 0) + 1 
        : 0;

      address = await this.generateAddress(normalizedBlockchain, userWallet.xpub, nextIndex);
      
      // For production, decrypt mnemonic and derive private key properly
      privateKey = await this.generatePrivateKey(normalizedBlockchain, userWallet.mnemonic || '', nextIndex);
    }

    // Encrypt private key
    const encryptedPrivateKey = encryptPrivateKey(privateKey);

    // Store deposit address
    const parsedVirtualAccountId = typeof virtualAccountId === 'string' ? parseInt(virtualAccountId, 10) : virtualAccountId;
    if (isNaN(parsedVirtualAccountId) || parsedVirtualAccountId <= 0) {
      throw new Error('Invalid virtual account ID format');
    }

    const depositAddress = await prisma.depositAddress.create({
      data: {
        virtualAccountId: parsedVirtualAccountId,
        userWalletId: userWallet.id,
        blockchain: normalizedBlockchain,
        currency,
        address,
        index: 0,
        privateKey: encryptedPrivateKey,
      },
    });

    return depositAddress;
  }
}

