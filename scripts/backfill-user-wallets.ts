/**
 * Backfill missing fiat + crypto wallets for existing users.
 *
 * Usage:
 *   npm run wallets:backfill
 *   npm run wallets:backfill:dev
 *   npm run wallets:backfill:dev -- --user-id=42
 *   npm run wallets:backfill:dev -- --mark-verified
 *   npm run wallets:backfill:dev -- --all-users
 *
 * Flags:
 *   --user-id=N       Process a single user
 *   --mark-verified   Set isEmailVerified=true before creating wallets (legacy live users)
 *   --all-users       Process every active user, not only those missing wallets
 */
import 'dotenv/config';
import prisma from '../src/core/config/database.js';
import {
  initializeUserWallets,
  userNeedsWalletBackfill,
} from '../src/services/user-wallet-init.service.js';

const args = process.argv.slice(2);
const userIdArg = args.find((a) => a.startsWith('--user-id='))?.split('=')[1];
const markVerified = args.includes('--mark-verified');
const allUsers = args.includes('--all-users');

async function getTargetUserIds(): Promise<number[]> {
  if (userIdArg) {
    const id = parseInt(userIdArg, 10);
    if (isNaN(id)) {
      throw new Error(`Invalid --user-id=${userIdArg}`);
    }
    return [id];
  }

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true },
    orderBy: { id: 'asc' },
  });

  if (allUsers) {
    return users.map((u) => u.id);
  }

  const needsBackfill: number[] = [];
  for (const user of users) {
    if (await userNeedsWalletBackfill(user.id)) {
      needsBackfill.push(user.id);
    }
  }
  return needsBackfill;
}

async function main() {
  const userIds = await getTargetUserIds();
  console.log(`Processing ${userIds.length} user(s)...`);
  if (markVerified) {
    console.log('  --mark-verified: legacy users will be marked as email verified');
  }

  let processed = 0;
  let errors = 0;

  for (const userId of userIds) {
    try {
      if (markVerified) {
        await prisma.user.update({
          where: { id: userId },
          data: { isEmailVerified: true },
        });
      }

      const result = await initializeUserWallets(userId);
      processed++;
      console.log(
        `OK user ${userId}: fiat +${result.fiatCreated} (skipped ${result.fiatSkipped}, errors ${result.fiatErrors}), ` +
          `crypto ${result.cryptoInitialized ? 'ok' : 'failed'}${result.cryptoError ? `: ${result.cryptoError}` : ''}`
      );
    } catch (err: unknown) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`FAIL user ${userId}: ${msg}`);
    }
  }

  console.log('\nDone.');
  console.log(`  Processed: ${processed}`);
  console.log(`  Errors: ${errors}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
