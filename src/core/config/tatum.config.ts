/**
 * Tatum integration configuration.
 * Tatum is used when TATUM_API_KEY is set (unless USE_TATUM=false).
 */
export function isTatumEnabled(): boolean {
  if (process.env.USE_TATUM === 'false') {
    return false;
  }
  return Boolean(process.env.TATUM_API_KEY?.trim());
}

export function getTatumWebhookUrl(): string {
  const explicit = process.env.TATUM_WEBHOOK_URL?.trim();
  if (explicit) {
    return explicit;
  }
  const base = process.env.BASE_URL?.replace(/\/$/, '') ?? '';
  if (!base) {
    throw new Error('TATUM_WEBHOOK_URL or BASE_URL must be set for Tatum webhooks');
  }
  return `${base}/api/crypto/webhooks/tatum`;
}

export function getTatumV3BaseUrl(): string {
  return (process.env.TATUM_BASE_URL?.trim() || 'https://api.tatum.io/v3').replace(/\/$/, '');
}

export function getTatumV4BaseUrl(): string {
  const fromEnv = process.env.TATUM_V4_BASE_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, '');
  }
  const v3 = getTatumV3BaseUrl();
  if (v3.includes('/v3')) {
    return v3.replace(/\/v3$/, '/v4');
  }
  return 'https://api.tatum.io/v4';
}
