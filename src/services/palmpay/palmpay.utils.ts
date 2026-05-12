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
  const error = new Error(message) as Error & { statusCode?: number; code?: string };
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
