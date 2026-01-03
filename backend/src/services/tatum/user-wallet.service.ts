/* 
 * TATUM USER WALLET SERVICE - COMMENTED OUT FOR MOCK TESTING
 * This service will be used when Tatum account is available
 */

/*
import prisma from '../../core/config/database.js';
import { encryptPrivateKey } from '../../core/utils/encryption.js';
import { TatumService } from './tatum.service.js';

/**
 * User Wallet Service
 * Manages per-user wallets (one per blockchain per user)
 */
export class UserWalletService {
  private tatumService: TatumService;

  constructor() {
    this.tatumService = new TatumService();
  }

  /**
   * Get or create user wallet for a blockchain
   */
  async getOrCreateUserWallet(userId: string, blockchain: string) {
    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new Error(`User with ID ${userId} does not exist`);
    }

    // Check if wallet exists
    let userWallet = await prisma.userWallet.findUnique({
      where: {
        userId_blockchain: {
          userId,
          blockchain: blockchain.toLowerCase(),
        },
      },
    });

    if (userWallet) {
      return userWallet;
    }

    // Generate new wallet
    const walletData = await this.tatumService.createWallet(blockchain);

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
        userId,
        blockchain: blockchain.toLowerCase(),
        mnemonic: encryptedMnemonic,
        xpub: isNoXpub ? walletData.address : walletData.xpub,
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
      btc: "m/44'/0'/0'",
      ethereum: "m/44'/60'/0'",
      eth: "m/44'/60'/0'",
      tron: "m/44'/195'/0'",
      trx: "m/44'/195'/0'",
      bsc: "m/44'/60'/0'",
      binance: "m/44'/60'/0'",
      polygon: "m/44'/60'/0'",
      matic: "m/44'/60'/0'",
      dogecoin: "m/44'/3'/0'",
      doge: "m/44'/3'/0'",
      litecoin: "m/44'/2'/0'",
      ltc: "m/44'/2'/0'",
      solana: null,
      sol: null,
      xrp: null,
      ripple: null,
    };

    return paths[blockchain.toLowerCase()] || null;
  }
}
*/

