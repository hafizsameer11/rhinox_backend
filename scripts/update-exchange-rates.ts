/**
 * Upsert mid-market fiat exchange rates (does not wipe other seed data).
 *
 * Usage:
 *   npx tsx scripts/update-exchange-rates.ts
 */
import 'dotenv/config';
import { Decimal } from '@prisma/client/runtime/library';
import prisma from '../src/core/config/database.js';

const USD_NGN = Number(process.env.USD_NGN_RATE || 1325);
const USD_KES = Number(process.env.USD_KES_RATE || 129.4);
const USD_GHS = Number(process.env.USD_GHS_RATE || 11.36);
const USD_ZAR = Number(process.env.USD_ZAR_RATE || 15.97);
const USD_TZS = Number(process.env.USD_TZS_RATE || 2642);
const USD_UGX = Number(process.env.USD_UGX_RATE || 3717);
const USD_BWP = Number(process.env.USD_BWP_RATE || 13.69);
const USD_EUR = Number(process.env.USD_EUR_RATE || 0.861);
const USD_GBP = Number(process.env.USD_GBP_RATE || 0.74);
const USD_CAD = Number(process.env.USD_CAD_RATE || 1.383);
const USD_AUD = Number(process.env.USD_AUD_RATE || 1.388);

const pairs: Array<{ from: string; to: string; rate: number }> = [
  { from: 'NGN', to: 'USD', rate: 1 / USD_NGN },
  { from: 'NGN', to: 'EUR', rate: USD_EUR / USD_NGN },
  { from: 'NGN', to: 'GBP', rate: USD_GBP / USD_NGN },
  { from: 'NGN', to: 'KES', rate: USD_KES / USD_NGN },
  { from: 'NGN', to: 'GHS', rate: USD_GHS / USD_NGN },
  { from: 'NGN', to: 'ZAR', rate: USD_ZAR / USD_NGN },
  { from: 'NGN', to: 'TZS', rate: USD_TZS / USD_NGN },
  { from: 'NGN', to: 'UGX', rate: USD_UGX / USD_NGN },
  { from: 'NGN', to: 'BWP', rate: USD_BWP / USD_NGN },
  { from: 'NGN', to: 'CAD', rate: USD_CAD / USD_NGN },
  { from: 'NGN', to: 'AUD', rate: USD_AUD / USD_NGN },

  { from: 'USD', to: 'NGN', rate: USD_NGN },
  { from: 'USD', to: 'EUR', rate: USD_EUR },
  { from: 'USD', to: 'GBP', rate: USD_GBP },
  { from: 'USD', to: 'KES', rate: USD_KES },
  { from: 'USD', to: 'GHS', rate: USD_GHS },
  { from: 'USD', to: 'ZAR', rate: USD_ZAR },
  { from: 'USD', to: 'TZS', rate: USD_TZS },
  { from: 'USD', to: 'UGX', rate: USD_UGX },
  { from: 'USD', to: 'BWP', rate: USD_BWP },
  { from: 'USD', to: 'CAD', rate: USD_CAD },
  { from: 'USD', to: 'AUD', rate: USD_AUD },

  { from: 'EUR', to: 'NGN', rate: USD_NGN / USD_EUR },
  { from: 'EUR', to: 'USD', rate: 1 / USD_EUR },
  { from: 'EUR', to: 'GBP', rate: USD_GBP / USD_EUR },
  { from: 'EUR', to: 'KES', rate: USD_KES / USD_EUR },

  { from: 'GBP', to: 'NGN', rate: USD_NGN / USD_GBP },
  { from: 'GBP', to: 'USD', rate: 1 / USD_GBP },
  { from: 'GBP', to: 'EUR', rate: USD_EUR / USD_GBP },

  { from: 'KES', to: 'NGN', rate: USD_NGN / USD_KES },
  { from: 'GHS', to: 'NGN', rate: USD_NGN / USD_GHS },
  { from: 'ZAR', to: 'NGN', rate: USD_NGN / USD_ZAR },
  { from: 'TZS', to: 'NGN', rate: USD_NGN / USD_TZS },
  { from: 'UGX', to: 'NGN', rate: USD_NGN / USD_UGX },
  { from: 'BWP', to: 'NGN', rate: USD_NGN / USD_BWP },

  { from: 'KES', to: 'USD', rate: 1 / USD_KES },
  { from: 'GHS', to: 'USD', rate: 1 / USD_GHS },
  { from: 'ZAR', to: 'USD', rate: 1 / USD_ZAR },
  { from: 'TZS', to: 'USD', rate: 1 / USD_TZS },
  { from: 'UGX', to: 'USD', rate: 1 / USD_UGX },
  { from: 'BWP', to: 'USD', rate: 1 / USD_BWP },

  { from: 'USDT', to: 'NGN', rate: USD_NGN },
  { from: 'USDT', to: 'USD', rate: 1 },
  { from: 'NGN', to: 'USDT', rate: 1 / USD_NGN },
  { from: 'USD', to: 'USDT', rate: 1 },
];

async function main() {
  console.log(`Updating ${pairs.length} exchange rates (USD_NGN=${USD_NGN})...`);

  for (const pair of pairs) {
    const rate = new Decimal(pair.rate);
    const inverseRate = new Decimal(1 / pair.rate);
    await prisma.exchangeRate.upsert({
      where: {
        fromCurrency_toCurrency: {
          fromCurrency: pair.from,
          toCurrency: pair.to,
        },
      },
      update: { rate, inverseRate, isActive: true },
      create: {
        fromCurrency: pair.from,
        toCurrency: pair.to,
        rate,
        inverseRate,
        isActive: true,
      },
    });
  }

  const ngnUsd = await prisma.exchangeRate.findUnique({
    where: { fromCurrency_toCurrency: { fromCurrency: 'NGN', toCurrency: 'USD' } },
  });
  console.log(`NGN→USD now ${ngnUsd?.rate?.toString()} (≈ ₦${USD_NGN} per $1)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
