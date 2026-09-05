import { PrismaClient, Prisma } from '@prisma/client';
import { Decimal } from 'decimal.js';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/**
 * Countries data with flags
 * Flags are stored in uploads/flags/ directory
 */
const countries = [
  {
    name: 'Nigeria',
    code: 'NG',
    flag: 'ngn.png', // Flag file name in uploads/flags/
  },
  {
    name: 'Kenya',
    code: 'KE',
    flag: 'kenya.png',
  },
  {
    name: 'Ghana',
    code: 'GH',
    flag: 'ghana-c.png',
  },
  {
    name: 'South Africa',
    code: 'ZA',
    flag: 'south-africa.png',
  },
  {
    name: 'Tanzania',
    code: 'TZ',
    flag: 'tanzania.png',
  },
  {
    name: 'Uganda',
    code: 'UG',
    flag: 'uganda.png',
  },
  {
    name: 'Botswana',
    code: 'BW',
    flag: 'botswana.png',
  },
  {
    name: 'United States',
    code: 'US',
    flag: null,
  },
  {
    name: 'United Kingdom',
    code: 'GB',
    flag: null,
  },
  {
    name: 'Canada',
    code: 'CA',
    flag: null,
  },
  {
    name: 'Australia',
    code: 'AU',
    flag: null,
  },
  {
    name: 'Germany',
    code: 'DE',
    flag: null,
  },
  {
    name: 'France',
    code: 'FR',
    flag: null,
  },
  {
    name: 'India',
    code: 'IN',
    flag: null,
  },
  {
    name: 'China',
    code: 'CN',
    flag: null,
  },
  {
    name: 'Japan',
    code: 'JP',
    flag: null,
  },
  {
    name: 'Brazil',
    code: 'BR',
    flag: null,
  },
  {
    name: 'Mexico',
    code: 'MX',
    flag: null,
  },
  {
    name: 'Spain',
    code: 'ES',
    flag: null,
  },
  {
    name: 'Italy',
    code: 'IT',
    flag: null,
  },
];

/**
 * Currencies data
 */
const currencies = [
  {
    code: 'NGN',
    name: 'Nigerian Naira',
    symbol: '₦',
    countryCode: 'NG',
    type: 'fiat',
    flag: 'ngn.png',
    exchangeRate: 1.0, // Base rate (will be updated from external API)
  },
  {
    code: 'KES',
    name: 'Kenyan Shilling',
    symbol: 'KSh',
    countryCode: 'KE',
    type: 'fiat',
    flag: 'kenya.png',
    exchangeRate: 0.007, // Approximate to USD
  },
  {
    code: 'GHS',
    name: 'Ghanaian Cedi',
    symbol: '₵',
    countryCode: 'GH',
    type: 'fiat',
    flag: 'ghana-c.png',
    exchangeRate: 0.08,
  },
  {
    code: 'ZAR',
    name: 'South African Rand',
    symbol: 'R',
    countryCode: 'ZA',
    type: 'fiat',
    flag: 'south-africa.png',
    exchangeRate: 0.055,
  },
  {
    code: 'TZS',
    name: 'Tanzanian Shilling',
    symbol: 'TSh',
    countryCode: 'TZ',
    type: 'fiat',
    flag: 'tanzania.png',
    exchangeRate: 0.0004,
  },
  {
    code: 'UGX',
    name: 'Ugandan Shilling',
    symbol: 'USh',
    countryCode: 'UG',
    type: 'fiat',
    flag: 'uganda.png',
    exchangeRate: 0.00027,
  },
  {
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    countryCode: 'US',
    type: 'fiat',
    flag: null,
    exchangeRate: 1.0,
  },
  {
    code: 'GBP',
    name: 'British Pound',
    symbol: '£',
    countryCode: 'GB',
    type: 'fiat',
    flag: null,
    exchangeRate: 1.27,
  },
  {
    code: 'EUR',
    name: 'Euro',
    symbol: '€',
    countryCode: 'DE', // Using Germany as primary
    type: 'fiat',
    flag: null,
    exchangeRate: 1.10,
  },
  {
    code: 'BTC',
    name: 'Bitcoin',
    symbol: '₿',
    countryCode: null,
    type: 'crypto',
    flag: null,
    exchangeRate: 45000.0,
  },
  {
    code: 'ETH',
    name: 'Ethereum',
    symbol: 'Ξ',
    countryCode: null,
    type: 'crypto',
    flag: null,
    exchangeRate: 2500.0,
  },
  {
    code: 'USDT',
    name: 'Tether',
    symbol: '₮',
    countryCode: null,
    type: 'crypto',
    flag: null,
    exchangeRate: 1.0,
  },
];

async function main() {
  console.log('🌱 Starting database seed...');

  // Seed Countries
  console.log('📌 Seeding countries...');
  for (const country of countries) {
    const existing = await prisma.country.findUnique({
      where: { code: country.code },
    });

    if (existing) {
      await prisma.country.update({
        where: { id: existing.id },
        data: {
          name: country.name,
          flag: country.flag,
        },
      });
    } else {
      await prisma.country.create({
        data: {
          name: country.name,
          code: country.code,
          flag: country.flag,
        },
      });
    }
  }
  console.log(`✅ Seeded ${countries.length} countries`);

  // Seed Currencies
  console.log('💰 Seeding currencies...');
  for (const currency of currencies) {
    // Find country by code if countryCode is provided
    let countryId: number | undefined;
    if (currency.countryCode) {
      const country = await prisma.country.findUnique({
        where: { code: currency.countryCode },
      });
      countryId = country?.id;
    }

    const existingCurrency = await prisma.currency.findUnique({
      where: { code: currency.code },
    });

    if (existingCurrency) {
      await prisma.currency.update({
        where: { id: existingCurrency.id },
        data: {
          name: currency.name,
          symbol: currency.symbol,
          ...(countryId !== undefined && { countryId }),
          type: currency.type,
          flag: currency.flag,
          exchangeRate: currency.exchangeRate,
        },
      });
    } else {
      await prisma.currency.create({
        data: {
          code: currency.code,
          name: currency.name,
          symbol: currency.symbol,
          ...(countryId !== undefined && { countryId }),
          type: currency.type,
          flag: currency.flag,
          exchangeRate: currency.exchangeRate,
        },
      });
    }
  }
  console.log(`✅ Seeded ${currencies.length} currencies`);

  // Seed Wallet Currencies (for Tatum crypto)
  console.log('💰 Seeding wallet currencies...');
  const walletCurrencies = [
    // Ethereum
    { blockchain: 'ethereum', currency: 'ETH', name: 'Ethereum', symbol: 'ETH', isToken: false, decimals: 18 },
    { blockchain: 'ethereum', currency: 'USDT', name: 'Tether USD', symbol: 'USDT', isToken: true, contractAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7', decimals: 6 },
    { blockchain: 'ethereum', currency: 'USDC', name: 'USD Coin', symbol: 'USDC', isToken: true, contractAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6 },
    
    // Tron
    { blockchain: 'tron', currency: 'TRX', name: 'Tron', symbol: 'TRX', isToken: false, decimals: 18 },
    { blockchain: 'tron', currency: 'USDT_TRON', name: 'Tether USD (TRON)', symbol: 'USDT', isToken: true, contractAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', decimals: 6 },
    
    // BSC
    { blockchain: 'bsc', currency: 'BNB', name: 'Binance Coin', symbol: 'BNB', isToken: false, decimals: 18 },
    { blockchain: 'bsc', currency: 'USDT_BSC', name: 'Tether USD (BSC)', symbol: 'USDT', isToken: true, contractAddress: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
    
    // Bitcoin
    { blockchain: 'bitcoin', currency: 'BTC', name: 'Bitcoin', symbol: 'BTC', isToken: false, decimals: 8 },
    
    // Solana
    { blockchain: 'solana', currency: 'SOL', name: 'Solana', symbol: 'SOL', isToken: false, decimals: 9 },
    { blockchain: 'solana', currency: 'USDT_SOL', name: 'Tether USD (Solana)', symbol: 'USDT', isToken: true, contractAddress: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6 },
    
    // Polygon
    { blockchain: 'polygon', currency: 'MATIC', name: 'Polygon', symbol: 'MATIC', isToken: false, decimals: 18 },
    { blockchain: 'polygon', currency: 'USDT_POLYGON', name: 'Tether USD (Polygon)', symbol: 'USDT', isToken: true, contractAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
    
    // Dogecoin
    { blockchain: 'dogecoin', currency: 'DOGE', name: 'Dogecoin', symbol: 'DOGE', isToken: false, decimals: 8 },
    
    // XRP
    { blockchain: 'xrp', currency: 'XRP', name: 'Ripple', symbol: 'XRP', isToken: false, decimals: 6 },
    
    // Litecoin
    { blockchain: 'litecoin', currency: 'LTC', name: 'Litecoin', symbol: 'LTC', isToken: false, decimals: 8 },
  ];

  for (const wc of walletCurrencies) {
    const existing = await prisma.walletCurrency.findUnique({
      where: {
        blockchain_currency: {
          blockchain: wc.blockchain,
          currency: wc.currency,
        },
      },
    });

    if (existing) {
      await prisma.walletCurrency.update({
        where: { id: existing.id },
        data: {
          name: wc.name,
          symbol: wc.symbol,
          isToken: wc.isToken,
          ...(wc.contractAddress !== undefined && { contractAddress: wc.contractAddress }),
          decimals: wc.decimals,
        },
      });
    } else {
      await prisma.walletCurrency.create({
        data: {
          blockchain: wc.blockchain,
          currency: wc.currency,
          name: wc.name,
          symbol: wc.symbol,
          isToken: wc.isToken,
          ...(wc.contractAddress !== undefined && { contractAddress: wc.contractAddress }),
          decimals: wc.decimals,
        },
      });
    }
  }
  console.log(`✅ Seeded ${walletCurrencies.length} wallet currencies`);

  // Seed Bank Accounts
  console.log('🏦 Seeding bank accounts...');
  const bankAccounts = [
    // Nigeria (NGN) - Multiple bank accounts
    {
      countryCode: 'NG',
      currency: 'NGN',
      bankName: 'Access Bank',
      accountNumber: '0012345678',
      accountName: 'Rhinox Pay Limited',
    },
    {
      countryCode: 'NG',
      currency: 'NGN',
      bankName: 'GTBank',
      accountNumber: '0023456789',
      accountName: 'Rhinox Pay Limited',
    },
    {
      countryCode: 'NG',
      currency: 'NGN',
      bankName: 'First Bank of Nigeria',
      accountNumber: '0034567890',
      accountName: 'Rhinox Pay Limited',
    },
    {
      countryCode: 'NG',
      currency: 'NGN',
      bankName: 'Zenith Bank',
      accountNumber: '0045678901',
      accountName: 'Rhinox Pay Limited',
    },
    {
      countryCode: 'NG',
      currency: 'NGN',
      bankName: 'UBA',
      accountNumber: '0056789012',
      accountName: 'Rhinox Pay Limited',
    },
    {
      countryCode: 'NG',
      currency: 'NGN',
      bankName: 'Fidelity Bank',
      accountNumber: '0067890123',
      accountName: 'Rhinox Pay Limited',
    },
    {
      countryCode: 'NG',
      currency: 'NGN',
      bankName: 'Stanbic IBTC',
      accountNumber: '0078901234',
      accountName: 'Rhinox Pay Limited',
    },
    {
      countryCode: 'NG',
      currency: 'NGN',
      bankName: 'Ecobank',
      accountNumber: '0089012345',
      accountName: 'Rhinox Pay Limited',
    },
    {
      countryCode: 'NG',
      currency: 'NGN',
      bankName: 'Union Bank',
      accountNumber: '0090123456',
      accountName: 'Rhinox Pay Limited',
    },
    {
      countryCode: 'NG',
      currency: 'NGN',
      bankName: 'Sterling Bank',
      accountNumber: '0101234567',
      accountName: 'Rhinox Pay Limited',
    },
    // Other countries
    {
      countryCode: 'KE',
      currency: 'KES',
      bankName: 'Sample Bank Kenya',
      accountNumber: '1234567890',
      accountName: 'Rhinox Pay Kenya',
    },
    {
      countryCode: 'GH',
      currency: 'GHS',
      bankName: 'Sample Bank Ghana',
      accountNumber: '9876543210',
      accountName: 'Rhinox Pay Ghana',
    },
    {
      countryCode: 'ZA',
      currency: 'ZAR',
      bankName: 'Sample Bank South Africa',
      accountNumber: '5555555555',
      accountName: 'Rhinox Pay South Africa',
    },
  ];

  for (const bank of bankAccounts) {
    // Check if bank account with same details exists
    const existing = await prisma.bankAccount.findFirst({
      where: {
        countryCode: bank.countryCode,
        currency: bank.currency,
        bankName: bank.bankName,
        accountNumber: bank.accountNumber,
      },
    });

    if (!existing) {
      await prisma.bankAccount.create({
        data: {
          countryCode: bank.countryCode,
          currency: bank.currency,
          bankName: bank.bankName,
          accountNumber: bank.accountNumber,
          accountName: bank.accountName,
          isActive: true,
        },
      });
    } else {
      await prisma.bankAccount.update({
        where: { id: existing.id },
        data: {
          bankName: bank.bankName,
          accountNumber: bank.accountNumber,
          accountName: bank.accountName,
          isActive: true,
        },
      });
    }
  }
  console.log(`✅ Seeded ${bankAccounts.length} bank accounts`);

  // Seed Mobile Money Providers (Flutterwave-aligned for KE/GH/UG/TZ)
  console.log('📱 Seeding mobile money providers...');
  const mobileMoneyProviders = [
    // Kenya — Flutterwave: M-Pesa (MPS), Airtel (MPX)
    { name: 'M-Pesa', code: 'MPESA', countryCode: 'KE', currency: 'KES', logoUrl: null, isActive: true },
    { name: 'Airtel Money', code: 'AIRTEL', countryCode: 'KE', currency: 'KES', logoUrl: null, isActive: true },

    // Ghana — Flutterwave: MTN, Vodafone/Telecel, AirtelTigo
    { name: 'MTN Mobile Money', code: 'MTN', countryCode: 'GH', currency: 'GHS', logoUrl: null, isActive: true },
    { name: 'Telecel Cash', code: 'VODAFONE', countryCode: 'GH', currency: 'GHS', logoUrl: null, isActive: true },
    { name: 'AirtelTigo Money', code: 'AIRTELTIGO', countryCode: 'GH', currency: 'GHS', logoUrl: null, isActive: true },

    // Tanzania — Flutterwave: Airtel, Tigo, Halopesa, Vodacom
    { name: 'Vodacom M-Pesa', code: 'VODACOM', countryCode: 'TZ', currency: 'TZS', logoUrl: null, isActive: true },
    { name: 'Tigo Pesa', code: 'TIGO', countryCode: 'TZ', currency: 'TZS', logoUrl: null, isActive: true },
    { name: 'Airtel Money', code: 'AIRTEL', countryCode: 'TZ', currency: 'TZS', logoUrl: null, isActive: true },
    { name: 'HaloPesa', code: 'HALOPESA', countryCode: 'TZ', currency: 'TZS', logoUrl: null, isActive: true },

    // Uganda — Flutterwave: MTN, Airtel
    { name: 'MTN Mobile Money', code: 'MTN', countryCode: 'UG', currency: 'UGX', logoUrl: null, isActive: true },
    { name: 'Airtel Money', code: 'AIRTEL', countryCode: 'UG', currency: 'UGX', logoUrl: null, isActive: true },

    // Nigeria — no Flutterwave MoMo; keep inactive for historical rows
    { name: 'MTN MoMo', code: 'MTN', countryCode: 'NG', currency: 'NGN', logoUrl: null, isActive: false },
    { name: 'Airtel Money', code: 'AIRTEL', countryCode: 'NG', currency: 'NGN', logoUrl: null, isActive: false },

    // South Africa — not on Flutterwave MoMo; inactive
    { name: 'MTN Mobile Money', code: 'MTN', countryCode: 'ZA', currency: 'ZAR', logoUrl: null, isActive: false },
    { name: 'Vodacom M-Pesa', code: 'VODACOM', countryCode: 'ZA', currency: 'ZAR', logoUrl: null, isActive: false },
  ];

  for (const provider of mobileMoneyProviders) {
    await prisma.mobileMoneyProvider.upsert({
      where: {
        code_countryCode_currency: {
          code: provider.code,
          countryCode: provider.countryCode,
          currency: provider.currency,
        },
      },
      update: {
        name: provider.name,
        logoUrl: provider.logoUrl,
        isActive: provider.isActive,
      },
      create: {
        name: provider.name,
        code: provider.code,
        countryCode: provider.countryCode,
        currency: provider.currency,
        logoUrl: provider.logoUrl,
        isActive: provider.isActive,
      },
    });
  }
  console.log(`✅ Seeded ${mobileMoneyProviders.length} mobile money providers`);

  // Deactivate providers that are no longer Flutterwave-supported MoMo markets
  await prisma.mobileMoneyProvider.updateMany({
    where: {
      OR: [
        { countryCode: 'NG' },
        { countryCode: 'ZA' },
        { countryCode: 'KE', code: { in: ['MTN', 'VODAFONE'] } },
        { countryCode: 'TZ', code: 'MPESA' },
      ],
    },
    data: { isActive: false },
  });

  // Seed Exchange Rates (NGN as base currency)
  console.log('💱 Seeding exchange rates...');
  // Mid-market-ish USD crosses (Sep 2026). Seed upserts so re-seed refreshes stale DB rates.
  const USD_NGN = 1325;
  const USD_KES = 129.4;
  const USD_GHS = 11.36;
  const USD_ZAR = 15.97;
  const USD_TZS = 2642;
  const USD_UGX = 3717;
  const USD_BWP = 13.69;
  const USD_EUR = 0.861;
  const USD_GBP = 0.74;
  const USD_CAD = 1.383;
  const USD_AUD = 1.388;

  const exchangeRates = [
    // NGN to other currencies (NGN as base)
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

    // USD to other currencies
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

    // EUR / GBP
    { from: 'EUR', to: 'NGN', rate: USD_NGN / USD_EUR },
    { from: 'EUR', to: 'USD', rate: 1 / USD_EUR },
    { from: 'EUR', to: 'GBP', rate: USD_GBP / USD_EUR },
    { from: 'EUR', to: 'KES', rate: USD_KES / USD_EUR },

    { from: 'GBP', to: 'NGN', rate: USD_NGN / USD_GBP },
    { from: 'GBP', to: 'USD', rate: 1 / USD_GBP },
    { from: 'GBP', to: 'EUR', rate: USD_EUR / USD_GBP },

    // African currencies to NGN / USD
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

    // USDT pegged to USD
    { from: 'USDT', to: 'NGN', rate: USD_NGN },
    { from: 'USDT', to: 'USD', rate: 1.0 },
    { from: 'NGN', to: 'USDT', rate: 1 / USD_NGN },
    { from: 'USD', to: 'USDT', rate: 1.0 },
  ];

  for (const rate of exchangeRates) {
    const rateDecimal = new Decimal(rate.rate);
    const inverseRateDecimal = new Decimal(1 / rate.rate);
    
    await prisma.exchangeRate.upsert({
      where: {
        fromCurrency_toCurrency: {
          fromCurrency: rate.from,
          toCurrency: rate.to,
        },
      },
      update: {
        rate: rateDecimal,
        inverseRate: inverseRateDecimal,
        isActive: true,
      },
      create: {
        fromCurrency: rate.from,
        toCurrency: rate.to,
        rate: rateDecimal,
        inverseRate: inverseRateDecimal,
        isActive: true,
      },
    });
  }
  console.log(`✅ Seeded ${exchangeRates.length} exchange rates`);

  // ============================================
  // BILL PAYMENT SEEDING
  // ============================================
  console.log('💳 Seeding bill payment categories...');
  const billCategories = [
    { code: 'airtime', name: 'Airtime', description: 'Mobile airtime recharge' },
    { code: 'data', name: 'Data', description: 'Mobile data plans and bundles' },
    { code: 'electricity', name: 'Electricity', description: 'Electricity bill payments' },
    { code: 'cable_tv', name: 'Cable TV', description: 'Cable TV and streaming subscriptions' },
    { code: 'betting', name: 'Betting', description: 'Sports betting platform funding' },
    { code: 'internet', name: 'Internet Subscription', description: 'Internet router subscriptions' },
  ];

  const categoryMap: { [key: string]: number } = {};
  for (const cat of billCategories) {
    let category = await prisma.billPaymentCategory.findUnique({
      where: { code: cat.code },
    });
    
    if (category) {
      category = await prisma.billPaymentCategory.update({
        where: { id: category.id },
        data: {
          name: cat.name,
          description: cat.description,
          isActive: true,
        },
      });
    } else {
      category = await prisma.billPaymentCategory.create({
        data: {
          code: cat.code,
          name: cat.name,
          description: cat.description,
          isActive: true,
        },
      });
    }
    categoryMap[cat.code] = category.id;
  }
  console.log(`✅ Seeded ${billCategories.length} bill payment categories`);

  console.log('🏢 Seeding bill payment providers...');
  const billProviders = [
    // Airtime providers
    { category: 'airtime', code: 'MTN', name: 'MTN', logoUrl: '/uploads/billpayments/mtn.png' },
    { category: 'airtime', code: 'GLO', name: 'GLO', logoUrl: '/uploads/billpayments/glo.png' },
    { category: 'airtime', code: 'AIRTEL', name: 'Airtel', logoUrl: '/uploads/billpayments/airtel.png' },
    
    // Data providers (same as airtime)
    { category: 'data', code: 'MTN', name: 'MTN', logoUrl: '/uploads/billpayments/mtn.png' },
    { category: 'data', code: 'GLO', name: 'GLO', logoUrl: '/uploads/billpayments/glo.png' },
    { category: 'data', code: 'AIRTEL', name: 'Airtel', logoUrl: '/uploads/billpayments/airtel.png' },
    
    // Electricity providers
    { category: 'electricity', code: 'IKEJA', name: 'Ikeja Electric', logoUrl: '/uploads/billpayments/ikeja.png', metadata: { meterTypes: ['prepaid', 'postpaid'] } },
    { category: 'electricity', code: 'IBADAN', name: 'Ibadan Electric', logoUrl: '/uploads/billpayments/ibandan.png', metadata: { meterTypes: ['prepaid', 'postpaid'] } },
    { category: 'electricity', code: 'ABUJA', name: 'Abuja Electric', logoUrl: '/uploads/billpayments/abuja.png', metadata: { meterTypes: ['prepaid', 'postpaid'] } },
    
    // Cable TV providers
    { category: 'cable_tv', code: 'DSTV', name: 'DSTV', logoUrl: '/uploads/billpayments/dstv.png' },
    { category: 'cable_tv', code: 'SHOWMAX', name: 'Showmax', logoUrl: '/uploads/billpayments/showmax.png' },
    { category: 'cable_tv', code: 'GOTV', name: 'GOtv', logoUrl: '/uploads/billpayments/gotv.png' },
    
    // Betting providers
    { category: 'betting', code: '1XBET', name: '1xBet', logoUrl: '/uploads/billpayments/1xbet.png' },
    { category: 'betting', code: 'BET9JA', name: 'Bet9ja', logoUrl: '/uploads/billpayments/bet9ja.png' },
    { category: 'betting', code: 'SPORTBET', name: 'SportBet', logoUrl: '/uploads/billpayments/sportbet.png' },
  ];

  const providerMap: { [key: string]: number } = {};
  for (const prov of billProviders) {
    const categoryId = categoryMap[prov.category];
    if (!categoryId) {
      console.warn(`⚠️  Category not found for provider: ${prov.category} - ${prov.code}`);
      continue;
    }
    
    let provider = await prisma.billPaymentProvider.findFirst({
      where: {
        categoryId,
        code: prov.code,
      },
    });
    
    if (provider) {
      provider = await prisma.billPaymentProvider.update({
        where: { id: provider.id },
        data: {
          name: prov.name,
          logoUrl: prov.logoUrl,
          metadata: prov.metadata ? (prov.metadata as any) : null,
          isActive: true,
        },
      });
    } else {
      provider = await prisma.billPaymentProvider.create({
        data: {
          categoryId,
          code: prov.code,
          name: prov.name,
          logoUrl: prov.logoUrl,
          countryCode: 'NG',
          currency: 'NGN',
          metadata: prov.metadata ? (prov.metadata as any) : null,
          isActive: true,
        },
      });
    }
    providerMap[`${prov.category}_${prov.code}`] = provider.id;
  }
  console.log(`✅ Seeded ${billProviders.length} bill payment providers`);

  console.log('📦 Seeding data plans...');
  const dataPlans = [
    // MTN Data Plans
    { providerKey: 'data_MTN', code: 'MTN_100MB', name: '100MB', amount: 100, dataAmount: '100MB', validity: '1 day' },
    { providerKey: 'data_MTN', code: 'MTN_200MB', name: '200MB', amount: 200, dataAmount: '200MB', validity: '3 days' },
    { providerKey: 'data_MTN', code: 'MTN_500MB', name: '500MB', amount: 500, dataAmount: '500MB', validity: '7 days' },
    { providerKey: 'data_MTN', code: 'MTN_1GB', name: '1GB', amount: 1000, dataAmount: '1GB', validity: '30 days' },
    { providerKey: 'data_MTN', code: 'MTN_2GB', name: '2GB', amount: 2000, dataAmount: '2GB', validity: '30 days' },
    { providerKey: 'data_MTN', code: 'MTN_5GB', name: '5GB', amount: 5000, dataAmount: '5GB', validity: '30 days' },
    { providerKey: 'data_MTN', code: 'MTN_10GB', name: '10GB', amount: 10000, dataAmount: '10GB', validity: '30 days' },
    
    // GLO Data Plans
    { providerKey: 'data_GLO', code: 'GLO_100MB', name: '100MB', amount: 100, dataAmount: '100MB', validity: '1 day' },
    { providerKey: 'data_GLO', code: 'GLO_200MB', name: '200MB', amount: 200, dataAmount: '200MB', validity: '3 days' },
    { providerKey: 'data_GLO', code: 'GLO_500MB', name: '500MB', amount: 500, dataAmount: '500MB', validity: '7 days' },
    { providerKey: 'data_GLO', code: 'GLO_1GB', name: '1GB', amount: 1000, dataAmount: '1GB', validity: '30 days' },
    { providerKey: 'data_GLO', code: 'GLO_2GB', name: '2GB', amount: 2000, dataAmount: '2GB', validity: '30 days' },
    { providerKey: 'data_GLO', code: 'GLO_5GB', name: '5GB', amount: 5000, dataAmount: '5GB', validity: '30 days' },
    { providerKey: 'data_GLO', code: 'GLO_10GB', name: '10GB', amount: 10000, dataAmount: '10GB', validity: '30 days' },
    
    // Airtel Data Plans
    { providerKey: 'data_AIRTEL', code: 'AIRTEL_100MB', name: '100MB', amount: 100, dataAmount: '100MB', validity: '1 day' },
    { providerKey: 'data_AIRTEL', code: 'AIRTEL_200MB', name: '200MB', amount: 200, dataAmount: '200MB', validity: '3 days' },
    { providerKey: 'data_AIRTEL', code: 'AIRTEL_500MB', name: '500MB', amount: 500, dataAmount: '500MB', validity: '7 days' },
    { providerKey: 'data_AIRTEL', code: 'AIRTEL_1GB', name: '1GB', amount: 1000, dataAmount: '1GB', validity: '30 days' },
    { providerKey: 'data_AIRTEL', code: 'AIRTEL_2GB', name: '2GB', amount: 2000, dataAmount: '2GB', validity: '30 days' },
    { providerKey: 'data_AIRTEL', code: 'AIRTEL_5GB', name: '5GB', amount: 5000, dataAmount: '5GB', validity: '30 days' },
    { providerKey: 'data_AIRTEL', code: 'AIRTEL_10GB', name: '10GB', amount: 10000, dataAmount: '10GB', validity: '30 days' },
  ];

  for (const plan of dataPlans) {
    const providerId = providerMap[plan.providerKey];
    if (providerId) {
      let existingPlan = await prisma.billPaymentPlan.findFirst({
        where: {
          providerId,
          code: plan.code,
        },
      });
      
      if (existingPlan) {
        await prisma.billPaymentPlan.update({
          where: { id: existingPlan.id },
          data: {
            name: plan.name,
            amount: plan.amount,
            dataAmount: plan.dataAmount,
            validity: plan.validity,
            isActive: true,
          },
        });
      } else {
        await prisma.billPaymentPlan.create({
          data: {
            providerId,
            code: plan.code,
            name: plan.name,
            amount: plan.amount,
            currency: 'NGN',
            dataAmount: plan.dataAmount,
            validity: plan.validity,
            isActive: true,
          },
        });
      }
    }
  }
  console.log(`✅ Seeded ${dataPlans.length} data plans`);

  console.log('📺 Seeding cable TV plans...');
  const cablePlans = [
    // DSTV Plans
    { providerKey: 'cable_tv_DSTV', code: 'DSTV_COMPACT', name: 'DSTV Compact', amount: 7900, validity: '1 month' },
    { providerKey: 'cable_tv_DSTV', code: 'DSTV_COMPACT_PLUS', name: 'DSTV Compact Plus', amount: 12900, validity: '1 month' },
    { providerKey: 'cable_tv_DSTV', code: 'DSTV_PREMIUM', name: 'DSTV Premium', amount: 24500, validity: '1 month' },
    { providerKey: 'cable_tv_DSTV', code: 'DSTV_ASIAN', name: 'DSTV Asian', amount: 1900, validity: '1 month' },
    { providerKey: 'cable_tv_DSTV', code: 'DSTV_PIDGIN', name: 'DSTV Pidgin', amount: 2650, validity: '1 month' },
    
    // Showmax Plans
    { providerKey: 'cable_tv_SHOWMAX', code: 'SHOWMAX_MOBILE', name: 'Showmax Mobile', amount: 1200, validity: '1 month' },
    { providerKey: 'cable_tv_SHOWMAX', code: 'SHOWMAX_STANDARD', name: 'Showmax Standard', amount: 2900, validity: '1 month' },
    { providerKey: 'cable_tv_SHOWMAX', code: 'SHOWMAX_PRO', name: 'Showmax Pro', amount: 4900, validity: '1 month' },
    
    // GOtv Plans
    { providerKey: 'cable_tv_GOTV', code: 'GOTV_SMALLIE', name: 'GOtv Smallie', amount: 1650, validity: '1 month' },
    { providerKey: 'cable_tv_GOTV', code: 'GOTV_JINJA', name: 'GOtv Jinja', amount: 2650, validity: '1 month' },
    { providerKey: 'cable_tv_GOTV', code: 'GOTV_JINJA_PLUS', name: 'GOtv Jinja Plus', amount: 3250, validity: '1 month' },
    { providerKey: 'cable_tv_GOTV', code: 'GOTV_MAX', name: 'GOtv Max', amount: 5650, validity: '1 month' },
  ];

  for (const plan of cablePlans) {
    const providerId = providerMap[plan.providerKey];
    if (providerId) {
      let existingPlan = await prisma.billPaymentPlan.findFirst({
        where: {
          providerId,
          code: plan.code,
        },
      });
      
      if (existingPlan) {
        await prisma.billPaymentPlan.update({
          where: { id: existingPlan.id },
          data: {
            name: plan.name,
            amount: plan.amount,
            validity: plan.validity,
            isActive: true,
          },
        });
      } else {
        await prisma.billPaymentPlan.create({
          data: {
            providerId,
            code: plan.code,
            name: plan.name,
            amount: plan.amount,
            currency: 'NGN',
            validity: plan.validity,
            isActive: true,
          },
        });
      }
    }
  }
  console.log(`✅ Seeded ${cablePlans.length} cable TV plans`);

  // Seed super admin user
  const adminEmail = process.env.ADMIN_SEED_EMAIL || 'admin@rhinoxpay.com';
  const adminPassword = process.env.ADMIN_SEED_PASSWORD || 'Admin@123456';
  const existingAdmin = await prisma.adminUser.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    await prisma.adminUser.create({
      data: {
        email: adminEmail,
        passwordHash: await bcrypt.hash(adminPassword, 10),
        firstName: 'Super',
        lastName: 'Admin',
        role: 'SUPER_ADMIN',
        country: 'NG',
        status: 'active',
      },
    });
    console.log(`✅ Seeded super admin: ${adminEmail}`);
  } else {
    console.log(`ℹ️ Super admin already exists: ${adminEmail}`);
  }

  console.log('🎉 Database seed completed!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

