export interface PalmPayConfig {
  appId: string;
  privateKey: string;
  publicKey?: string;
  merchantId?: string;
  countryCode: string;
  version: string;
  environment: string;
  baseUrl: string;
  webhookUrl: string;
  frontendUrl: string;
}

const productionBaseUrl = 'https://open-gw-prod.palmpay-inc.com';
const sandboxBaseUrl = 'https://open-gw-daily.palmpay-inc.com';

const getRequiredEnv = (key: string): string => {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    throw new Error(`${key} is required for PalmPay integration`);
  }
  return value.trim();
};

export const getPalmPayBaseUrl = (): string => {
  const configuredBaseUrl = process.env.PALMPAY_BASE_URL?.trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, '');
  }

  const environment = (process.env.PALMPAY_ENVIRONMENT || 'sandbox').toLowerCase();
  return environment === 'production' || environment === 'prod'
    ? productionBaseUrl
    : sandboxBaseUrl;
};

export const getPalmPayConfig = (): PalmPayConfig => ({
  appId: getRequiredEnv('PALMPAY_APP_ID'),
  privateKey: getRequiredEnv('PALMPAY_PRIVATE_KEY'),
  publicKey: process.env.PALMPAY_PUBLIC_KEY?.trim(),
  merchantId: process.env.PALMPAY_MERCHANT_ID?.trim(),
  countryCode: process.env.PALMPAY_COUNTRY_CODE?.trim() || 'NG',
  version: process.env.PALMPAY_VERSION?.trim() || 'V2',
  environment: process.env.PALMPAY_ENVIRONMENT?.trim() || 'sandbox',
  baseUrl: getPalmPayBaseUrl(),
  webhookUrl: getRequiredEnv('PALMPAY_WEBHOOK_URL'),
  frontendUrl: process.env.FRONTEND_URL?.trim() || 'https://rhinoxpay.hmstech.org',
});
