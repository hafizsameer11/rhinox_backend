export const SUPPORTED_AFRICAN_COUNTRY_CODES = ['NG', 'KE', 'GH', 'ZA', 'BW', 'TZ', 'UG'] as const;

export const SUPPORTED_AFRICAN_FIAT_CURRENCIES = ['NGN', 'KES', 'GHS', 'ZAR', 'TZS', 'UGX'] as const;

export const DEFAULT_COUNTRY_CODE = 'NG';

export function isSupportedAfricanCountry(code?: string | null): boolean {
  if (!code) return false;
  return SUPPORTED_AFRICAN_COUNTRY_CODES.includes(code.toUpperCase() as (typeof SUPPORTED_AFRICAN_COUNTRY_CODES)[number]);
}

export function isSupportedAfricanFiatCurrency(currency?: string | null): boolean {
  if (!currency) return false;
  return SUPPORTED_AFRICAN_FIAT_CURRENCIES.includes(currency.toUpperCase() as (typeof SUPPORTED_AFRICAN_FIAT_CURRENCIES)[number]);
}
