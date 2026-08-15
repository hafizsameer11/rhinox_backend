/**
 * One-off ops script: create master wallets for every distinct wallet_currencies.blockchain.
 * Usage: npx tsx scripts/create-master-wallets.ts
 */
import 'dotenv/config';
import { isTatumEnabled } from '../src/core/config/tatum.config.js';
import { MasterWalletService } from '../src/services/tatum/master-wallet.service.js';

async function main() {
  if (!isTatumEnabled()) {
    console.error('Set TATUM_API_KEY (and ENCRYPTION_KEY) before running this script.');
    process.exit(1);
  }

  const service = new MasterWalletService();
  const wallets = await service.createAllMasterWallets();
  console.log(`Created/updated ${wallets.length} master wallet(s):`);
  for (const w of wallets) {
    console.log(`  - ${w.blockchain}: ${w.address}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
