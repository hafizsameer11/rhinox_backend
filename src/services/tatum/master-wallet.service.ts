import prisma from '../../core/config/database.js';
import { encryptPrivateKey } from '../../core/utils/encryption.js';
import {
  getDerivationPath,
  isNonHdBlockchain,
  normalizeBlockchain,
} from './tatum-blockchain.util.js';
import { getTatumService } from './tatum.service.js';

/**
 * Hot master wallet per blockchain (customer external sends sign from master wallet).
 */
export class MasterWalletService {
  async createMasterWallet(blockchain: string) {
    const chain = normalizeBlockchain(blockchain);
    const existing = await prisma.masterWallet.findUnique({
      where: { blockchain: chain },
    });

    if (existing?.address && existing.privateKey) {
      return existing;
    }

    const tatumService = getTatumService();
    const walletData = await tatumService.createWallet(chain);
    const isNoXpub = isNonHdBlockchain(chain);

    let address: string;
    let privateKey: string;
    let mnemonic: string | undefined;
    let xpub: string | undefined;

    if (isNoXpub) {
      address = walletData.address || '';
      privateKey = walletData.privateKey || walletData.secret || '';
      mnemonic = walletData.privateKey || walletData.secret;
      xpub = address;
    } else {
      if (!walletData.mnemonic || !walletData.xpub) {
        throw new Error(`Tatum wallet response incomplete for ${chain}`);
      }
      mnemonic = walletData.mnemonic;
      xpub = walletData.xpub;
      address = await tatumService.generateAddress(chain, xpub, 0);
      privateKey = await tatumService.generatePrivateKey(chain, mnemonic, 0);
    }

    if (!address || !privateKey) {
      throw new Error(`Failed to create master wallet for ${chain}`);
    }

    const data = {
      blockchain: chain,
      address,
      xpub: xpub ?? null,
      mnemonic: mnemonic ? encryptPrivateKey(mnemonic) : null,
      privateKey: encryptPrivateKey(privateKey),
      response: JSON.stringify({ source: 'tatum', derivationPath: getDerivationPath(chain) }),
    };

    if (existing) {
      return prisma.masterWallet.update({
        where: { id: existing.id },
        data,
      });
    }

    return prisma.masterWallet.create({ data });
  }

  async createAllMasterWallets() {
    const currencies = await prisma.walletCurrency.findMany({
      select: { blockchain: true },
      distinct: ['blockchain'],
    });

    const chains = new Set<string>();
    for (const row of currencies) {
      chains.add(normalizeBlockchain(row.blockchain));
    }

    const results = [];
    for (const chain of chains) {
      results.push(await this.createMasterWallet(chain));
    }
    return results;
  }
}
