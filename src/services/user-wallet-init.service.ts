import prisma from '../core/config/database.js';
import { isSupportedAfricanFiatCurrency } from '../core/constants/supported-countries.js';
import { CryptoService } from '../modules/crypto/crypto.service.js';
import { WalletService } from '../modules/wallet/wallet.service.js';
import { isBushaEnabled } from './busha/busha.config.js';

export interface WalletInitResult {
  fiatCreated: number;
  fiatSkipped: number;
  fiatErrors: number;
  cryptoInitialized: boolean;
  cryptoError?: string;
}

/**
 * Create fiat + crypto wallets for a user (same logic as post email-verification).
 */
export async function initializeUserWallets(userId: string | number): Promise<WalletInitResult> {
  const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
  if (isNaN(userIdNum) || userIdNum <= 0) {
    throw new Error(`Invalid userId: ${userId}`);
  }

  const user = await prisma.user.findUnique({ where: { id: userIdNum } });
  if (!user) {
    throw new Error(`User ${userId} not found`);
  }

  const walletService = new WalletService();
  let fiatCreated = 0;
  let fiatSkipped = 0;
  let fiatErrors = 0;

  const fiatCurrencies = await prisma.currency
    .findMany({
      where: { type: 'fiat', isActive: true },
      orderBy: { code: 'asc' },
    })
    .then((items) => items.filter((currency) => isSupportedAfricanFiatCurrency(currency.code)));

  for (const currency of fiatCurrencies) {
    try {
      const existingWallet = await prisma.wallet.findUnique({
        where: {
          userId_currency: {
            userId: userIdNum,
            currency: currency.code,
          },
        },
      });

      if (existingWallet) {
        fiatSkipped++;
        continue;
      }

      await walletService.createWallet(String(userIdNum), currency.code, 'fiat');
      fiatCreated++;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('already exists')) {
        fiatSkipped++;
        continue;
      }
      fiatErrors++;
      console.error(`Failed to create fiat wallet ${currency.code} for user ${userIdNum}:`, message);
    }
  }

  let cryptoInitialized = false;
  let cryptoError: string | undefined;

  try {
    const cryptoService = new CryptoService();
    await cryptoService.initializeUserCryptoWallets(userIdNum);
    cryptoInitialized = true;
  } catch (error: unknown) {
    cryptoError = error instanceof Error ? error.message : String(error);
    console.error(`Failed to initialize crypto wallets for user ${userIdNum}:`, cryptoError);
  }

  return {
    fiatCreated,
    fiatSkipped,
    fiatErrors,
    cryptoInitialized,
    cryptoError,
  };
}

export async function getExpectedFiatWalletCount(): Promise<number> {
  const fiatCurrencies = await prisma.currency
    .findMany({
      where: { type: 'fiat', isActive: true },
    })
    .then((items) => items.filter((currency) => isSupportedAfricanFiatCurrency(currency.code)));
  return fiatCurrencies.length;
}

export async function userNeedsWalletBackfill(userId: number): Promise<boolean> {
  const [fiatCount, vaCount, expectedFiat, expectedCrypto] = await Promise.all([
    prisma.wallet.count({ where: { userId, type: 'fiat' } }),
    prisma.virtualAccount.count({ where: { userId } }),
    getExpectedFiatWalletCount(),
    prisma.walletCurrency.count(),
  ]);

  const missingFiat = expectedFiat > 0 && fiatCount < expectedFiat;
  const missingCrypto = isBushaEnabled() ? false : expectedCrypto > 0 && vaCount < expectedCrypto;
  return missingFiat || missingCrypto;
}
