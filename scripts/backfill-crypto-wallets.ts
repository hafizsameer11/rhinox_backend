/**
 * Backfill Tatum crypto wallets for users who registered before Tatum was enabled.
 *
 * Default (safe): only creates missing virtual_accounts / deposit_addresses;
 * does not replace existing mock (local) wallets.
 *
 * Usage:
 *   npx tsx scripts/backfill-crypto-wallets.ts
 *   npx tsx scripts/backfill-crypto-wallets.ts --user-id=123
 *   npx tsx scripts/backfill-crypto-wallets.ts --migrate-mock
 *
 * --migrate-mock: For users with zero crypto balances, removes local-era
 *   user_wallets + deposit_addresses (accountId prefix "va_") and re-provisions via Tatum.
 *   Only run after TATUM_API_KEY is set. Users with non-zero virtual_accounts balances are skipped.
 */
import 'dotenv/config';
import prisma from '../src/core/config/database.js';
import { isTatumEnabled } from '../src/core/config/tatum.config.js';
import { CryptoService } from '../src/modules/crypto/crypto.service.js';
import { Decimal } from 'decimal.js';

const args = process.argv.slice(2);
const userIdArg = args.find((a) => a.startsWith('--user-id='))?.split('=')[1];
const migrateMock = args.includes('--migrate-mock');

function isLocalMockAccountId(accountId: string): boolean {
  return accountId.startsWith('va_');
}

async function userHasCryptoBalance(userId: number): Promise<boolean> {
  const accounts = await prisma.virtualAccount.findMany({ where: { userId } });
  return accounts.some((va) => {
    const bal = new Decimal(va.accountBalance || '0');
    const avail = new Decimal(va.availableBalance || '0');
    return bal.gt(0) || avail.gt(0);
  });
}

async function clearMockCryptoRows(userId: number): Promise<void> {
  const mockVas = await prisma.virtualAccount.findMany({
    where: { userId, accountId: { startsWith: 'va_' } },
    select: { id: true },
  });
  const vaIds = mockVas.map((v) => v.id);

  if (vaIds.length > 0) {
    await prisma.depositAddress.deleteMany({
      where: { virtualAccountId: { in: vaIds } },
    });
    await prisma.virtualAccount.deleteMany({
      where: { id: { in: vaIds } },
    });
  }

  await prisma.depositAddress.deleteMany({
    where: { virtualAccount: { userId } },
  });
  await prisma.userWallet.deleteMany({ where: { userId } });
}

async function getTargetUserIds(): Promise<number[]> {
  if (userIdArg) {
    const id = parseInt(userIdArg, 10);
    if (isNaN(id)) {
      throw new Error(`Invalid --user-id=${userIdArg}`);
    }
    return [id];
  }

  const users = await prisma.user.findMany({
    where: { isEmailVerified: true },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  return users.map((u) => u.id);
}

async function main() {
  if (!isTatumEnabled()) {
    console.error('TATUM_API_KEY must be set. Mock backfill uses the same path as production Tatum.');
    process.exit(1);
  }

  const cryptoService = new CryptoService();
  const userIds = await getTargetUserIds();
  console.log(`Processing ${userIds.length} verified user(s)...`);

  let provisioned = 0;
  let migrated = 0;
  let skippedBalance = 0;
  let skippedNoMock = 0;
  let errors = 0;

  for (const userId of userIds) {
    try {
      if (migrateMock) {
        const hasMock = await prisma.virtualAccount.findFirst({
          where: { userId, accountId: { startsWith: 'va_' } },
        });
        if (!hasMock) {
          const anyVa = await prisma.virtualAccount.count({ where: { userId } });
          if (anyVa > 0) {
            skippedNoMock++;
          }
        } else if (await userHasCryptoBalance(userId)) {
          console.warn(`Skip user ${userId}: non-zero virtual_accounts balance`);
          skippedBalance++;
          continue;
        } else {
          await clearMockCryptoRows(userId);
          migrated++;
        }
      }

      await cryptoService.initializeUserCryptoWallets(userId);
      provisioned++;
      console.log(`OK user ${userId}`);
    } catch (err: unknown) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`FAIL user ${userId}: ${msg}`);
    }
  }

  console.log('\nDone.');
  console.log(`  Provisioned: ${provisioned}`);
  if (migrateMock) {
    console.log(`  Mock wallets cleared & re-provisioned: ${migrated}`);
    console.log(`  Skipped (had balance): ${skippedBalance}`);
    console.log(`  Skipped (no mock va_* accounts): ${skippedNoMock}`);
  }
  console.log(`  Errors: ${errors}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
