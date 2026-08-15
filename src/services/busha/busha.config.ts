/**
 * Busha is the live crypto custodian. Production is the default — no sandbox
 * unless BUSHA_ENVIRONMENT is explicitly set to sandbox.
 */
export function isBushaEnabled(): boolean {
  if (process.env.USE_BUSHA === 'false') {
    return false;
  }
  return Boolean(process.env.BUSHA_API_KEY?.trim());
}

export function getBushaConfig() {
  const apiKey = process.env.BUSHA_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('BUSHA_API_KEY is required when Busha is enabled');
  }

  const environment = (process.env.BUSHA_ENVIRONMENT || 'production').toLowerCase();
  const isSandbox = environment === 'sandbox';
  const baseUrl = (
    process.env.BUSHA_BASE_URL?.trim() ||
    (isSandbox ? 'https://api.sandbox.busha.so' : 'https://api.busha.so')
  ).replace(/\/$/, '');

  return {
    apiKey,
    environment: isSandbox ? 'sandbox' : 'production',
    baseUrl,
    webhookSecret: process.env.BUSHA_WEBHOOK_SECRET?.trim() || '',
    kycPollMs: Number(process.env.BUSHA_KYC_POLL_MS || 20000),
    settlementPollMs: Number(process.env.BUSHA_SETTLEMENT_POLL_MS || 30000),
  };
}

export function getBushaWebhookUrl(): string {
  const explicit = process.env.BUSHA_WEBHOOK_URL?.trim();
  if (explicit) return explicit;
  const base = process.env.BASE_URL?.replace(/\/$/, '') ?? '';
  return `${base}/api/webhooks/busha`;
}
