import prisma from '../../core/config/database.js';
import { encryptPrivateKey } from '../../core/utils/encryption.js';
import {
  getDerivationPath,
  isNonHdBlockchain,
  normalizeBlockchain,
} from './tatum-blockchain.util.js';
import { getTatumService } from './tatum.service.js';

export class UserWalletService {
  async getOrCreateUserWallet(userId: number, blockchain: string) {
    const chain = normalizeBlockchain(blockchain);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new Error(`User with ID ${userId} does not exist`);
    }

    let userWallet = await prisma.userWallet.findUnique({
      where: {
        userId_blockchain: {
          userId,
          blockchain: chain,
        },
      },
    });

    if (userWallet) {
      return userWallet;
    }

    const tatumService = getTatumService();
    const walletData = await tatumService.createWallet(chain);
    const isNoXpub = isNonHdBlockchain(chain);

    let mnemonicOrSecret: string;
    if (chain === 'solana') {
      mnemonicOrSecret = walletData.privateKey || walletData.mnemonic || '';
    } else if (chain === 'xrp') {
      mnemonicOrSecret = walletData.secret || walletData.privateKey || '';
    } else {
      mnemonicOrSecret = walletData.mnemonic || '';
    }

    if (!mnemonicOrSecret) {
      throw new Error(`Failed to generate wallet for blockchain: ${chain}`);
    }

    const encryptedMnemonic = encryptPrivateKey(mnemonicOrSecret);

    userWallet = await prisma.userWallet.create({
      data: {
        userId,
        blockchain: chain,
        mnemonic: encryptedMnemonic,
        xpub: isNoXpub ? (walletData.address || '') : (walletData.xpub || ''),
        derivationPath: getDerivationPath(chain),
      },
    });

    return userWallet;
  }
}
