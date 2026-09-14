/**
 * African markets we support for fiat wallets.
 * MoMo countries follow Flutterwave mobile money (plus NG for PalmPay NGN).
 * ZAR removed — neither PalmPay nor Flutterwave MoMo supports South Africa.
 */
export const SUPPORTED_AFRICAN_COUNTRY_CODES = [
  'NG',
  'KE',
  'GH',
  'UG',
  'TZ',
  'RW',
  'ZM',
  'CM',
  'CI',
  'SN',
  'BF',
  'ET',
] as const;

/** Fiat wallets: NGN (PalmPay) + Flutterwave MoMo currencies */
export const SUPPORTED_AFRICAN_FIAT_CURRENCIES = [
  'NGN',
  'KES',
  'GHS',
  'UGX',
  'TZS',
  'RWF',
  'ZMW',
  'XAF',
  'XOF',
  'ETB',
] as const;

export const DEFAULT_COUNTRY_CODE = 'NG';

export function isSupportedAfricanCountry(code?: string | null): boolean {
  if (!code) return false;
  return SUPPORTED_AFRICAN_COUNTRY_CODES.includes(
    code.toUpperCase() as (typeof SUPPORTED_AFRICAN_COUNTRY_CODES)[number]
  );
}

export function isSupportedAfricanFiatCurrency(currency?: string | null): boolean {
  if (!currency) return false;
  return SUPPORTED_AFRICAN_FIAT_CURRENCIES.includes(
    currency.toUpperCase() as (typeof SUPPORTED_AFRICAN_FIAT_CURRENCIES)[number]
  );
}
