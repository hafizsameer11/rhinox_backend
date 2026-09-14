export interface FlutterwaveConfig {
  secretKey: string;
  publicKey?: string;
  secretHash: string;
  baseUrl: string;
  environment: string;
}

const getRequiredEnv = (key: string): string => {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    throw new Error(`${key} is required for Flutterwave integration`);
  }
  return value.trim();
};

export const getFlutterwaveConfig = (): FlutterwaveConfig => ({
  secretKey: getRequiredEnv('FLW_SECRET_KEY'),
  publicKey: process.env.FLW_PUBLIC_KEY?.trim(),
  secretHash: getRequiredEnv('FLW_SECRET_HASH'),
  baseUrl: (process.env.FLW_BASE_URL?.trim() || 'https://api.flutterwave.com').replace(/\/$/, ''),
  environment: process.env.FLW_ENVIRONMENT?.trim() || 'sandbox',
});

/**
 * Countries/currencies where Flutterwave MoMo deposit + withdraw is enabled.
 * Aligned with Flutterwave MoMo docs (ZAR not supported).
 */
export const FLUTTERWAVE_MOMO_MARKETS: Record<string, string> = {
  KE: 'KES',
  GH: 'GHS',
  UG: 'UGX',
  TZ: 'TZS',
  RW: 'RWF',
  ZM: 'ZMW',
  CM: 'XAF',
  CI: 'XOF',
  SN: 'XOF',
  BF: 'XOF',
  ET: 'ETB',
};

/** Ethiopia is documented for MoMo transfers; v3 direct charge type is not published. */
export const FLUTTERWAVE_MOMO_DEPOSIT_UNSUPPORTED = new Set(['ET']);

export const isFlutterwaveMomoSupported = (countryCode: string, currency: string): boolean => {
  const expected = FLUTTERWAVE_MOMO_MARKETS[countryCode?.toUpperCase()];
  return Boolean(expected && expected === currency?.toUpperCase());
};

export const isFlutterwaveMomoDepositSupported = (countryCode: string, currency: string): boolean => {
  const cc = countryCode?.toUpperCase();
  if (!cc || FLUTTERWAVE_MOMO_DEPOSIT_UNSUPPORTED.has(cc)) return false;
  return isFlutterwaveMomoSupported(cc, currency);
};
