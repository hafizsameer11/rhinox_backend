/**
 * Backfill / migrate user crypto wallets for Tatum.
 *
 * virtual_accounts balances are INTERNAL ledger (P2P, buy/sell, credits) — never cleared here.
 * Only deposit_addresses + user_wallets are replaced (on-chain receive path).
 *
 * Usage:
 *   npm run tatum:backfill-users
 *   npm run tatum:backfill-users -- --user-id=1
 *   npm run tatum:backfill-users -- --replace-deposits
 *
 * --replace-deposits
 *   Delete all deposit_addresses and user_wallets for each user, then create fresh
 *   Tatum addresses + v4 webhooks. Keeps every virtual_accounts row and balance.
 *   (Alias: --migrate-mock)
 */
import 'dotenv/config';
import prisma from '../src/core/config/database.js';
import { isTatumEnabled } from '../src/core/config/tatum.config.js';
import { CryptoService } from '../src/modules/crypto/crypto.service.js';
import { CryptoWalletMigrationService } from '../src/services/tatum/crypto-wallet-migration.service.js';

const args = process.argv.slice(2);
const userIdArg = args.find((a) => a.startsWith('--user-id='))?.split('=')[1];
const replaceDeposits =
  args.includes('--replace-deposits') || args.includes('--migrate-mock');

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
    console.error('TATUM_API_KEY must be set.');
    process.exit(1);
  }

  const cryptoService = new CryptoService();
  const migrationService = new CryptoWalletMigrationService();
  const userIds = await getTargetUserIds();

  console.log(
    `Processing ${userIds.length} user(s)${replaceDeposits ? ' (replace on-chain wallets, keep ledger balances)' : ''}...`
  );

  let provisioned = 0;
  let replaced = 0;
  let errors = 0;

  for (const userId of userIds) {
    try {
      if (replaceDeposits) {
        const result = await migrationService.replaceUserOnChainWallets(userId);
        replaced++;
        const nonZero = result.balancesAfter.filter(
          (b) => parseFloat(b.accountBalance || '0') > 0 || parseFloat(b.availableBalance || '0') > 0
        );
        console.log(
          `OK user ${userId}: cleared ${result.cleared.depositAddresses} deposit row(s), ` +
            `${result.cleared.userWallets} user_wallet(s); ` +
            `created ${result.depositCount} Tatum deposit address(es); ` +
            `ledger accounts with balance preserved: ${nonZero.length}`
        );
      } else {
        await cryptoService.initializeUserCryptoWallets(userId);
        console.log(`OK user ${userId} (backfill missing only)`);
      }
      provisioned++;
    } catch (err: unknown) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`FAIL user ${userId}: ${msg}`);
    }
  }

  console.log('\nDone.');
  console.log(`  Processed: ${provisioned}`);
  if (replaceDeposits) {
    console.log(`  On-chain wallets replaced: ${replaced}`);
  }
  console.log(`  Errors: ${errors}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
