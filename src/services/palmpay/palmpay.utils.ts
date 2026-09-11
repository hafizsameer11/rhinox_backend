import { Decimal } from 'decimal.js';
import type { PalmPayOrderStatus, PalmPaySceneCode } from './palmpay.types.js';

export const supportedPalmPayScenes: PalmPaySceneCode[] = ['airtime', 'data', 'betting'];

export const isSupportedPalmPayScene = (sceneCode: string): sceneCode is PalmPaySceneCode =>
  supportedPalmPayScenes.includes(sceneCode as PalmPaySceneCode);

export const toPalmPayAmount = (amount: string | number | Decimal): number =>
  Math.round(new Decimal(amount).times(100).toNumber());

export const fromPalmPayAmount = (amount: string | number | Decimal): Decimal =>
  new Decimal(amount).dividedBy(100);

export const mapPalmPayStatus = (status?: PalmPayOrderStatus | number | string): string => {
  const numericStatus = Number(status);
  if (numericStatus === 2) return 'completed';
  if (numericStatus === 3) return 'failed';
  if (numericStatus === 4) return 'cancelled';
  return 'pending';
};

export const createProviderUnavailableError = (message = 'Payment provider is unavailable') => {
  const error = new Error(sanitizePalmPayUserMessage(message)) as Error & {
    statusCode?: number;
    code?: string;
  };
  error.statusCode = 503;
  error.code = 'PALMPAY_PROVIDER_UNAVAILABLE';
  return error;
};

export const createMaintenanceError = (
  message = 'This bill payment service is temporarily unavailable.'
) => {
  const error = new Error(message) as Error & { statusCode?: number; code?: string };
  error.statusCode = 503;
  error.code = 'BILL_SERVICE_UNDER_MAINTENANCE';
  return error;
};

/**
 * PalmPay often returns opaque strings like:
 * "scene-business-product occurred exception:null"
 * Map those to messages a user can act on.
 */
export const sanitizePalmPayUserMessage = (message?: string | null): string => {
  const raw = String(message || '').trim();
  if (!raw) return 'Payment could not be completed. Please try again.';

  const lower = raw.toLowerCase();

  if (
    lower.includes('scene-business-product') ||
    lower.includes('occurred exception') ||
    (lower.includes('exception') && lower.includes('null'))
  ) {
    return 'Amount is too low for this betting platform. Please enter a higher amount and try again.';
  }

  if (
    lower.includes('amount') &&
    (lower.includes('min') ||
      lower.includes('less') ||
      lower.includes('low') ||
      lower.includes('small') ||
      lower.includes('below') ||
      lower.includes('insufficient'))
  ) {
    return 'Amount is below the minimum allowed for this betting platform. Please enter a higher amount.';
  }

  if (lower.includes('insufficient') && (lower.includes('balance') || lower.includes('fund'))) {
    return 'Insufficient balance. Please fund your wallet and try again.';
  }

  if (
    lower.includes('invalid') &&
    (lower.includes('account') || lower.includes('customer') || lower.includes('user'))
  ) {
    return 'Invalid betting user ID. Please check and try again.';
  }

  // Strip internal PalmPay / scene jargon
  if (/scene-|business-product|respcode|null/i.test(raw)) {
    return 'Unable to complete this payment. Please check the amount and try again.';
  }

  return raw.replace(/\bPalmPay\b/gi, 'payment provider').trim();
};

/** PalmPay limit fields are in kobo (minor units), same as order amounts. */
export const fromPalmPayLimit = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n / 100;
};
