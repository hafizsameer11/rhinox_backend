/**
 * Rhinox bill category codes ↔ Flutterwave bill category codes.
 * Betting stays on PalmPay and is intentionally omitted.
 */

export const FLUTTERWAVE_BILL_CATEGORY_MAP = {
  airtime: 'AIRTIME',
  data: 'MOBILEDATA',
  cable_tv: 'CABLEBILLS',
  internet: 'INTSERVICE',
  electricity: 'UTILITYBILLS',
} as const;

export type FlutterwaveBillCategoryCode = keyof typeof FLUTTERWAVE_BILL_CATEGORY_MAP;

export const FLUTTERWAVE_BILL_CATEGORIES = Object.keys(
  FLUTTERWAVE_BILL_CATEGORY_MAP
) as FlutterwaveBillCategoryCode[];

export function isFlutterwaveBillCategory(
  categoryCode: string
): categoryCode is FlutterwaveBillCategoryCode {
  return categoryCode in FLUTTERWAVE_BILL_CATEGORY_MAP;
}

export function toFlutterwaveCategoryCode(categoryCode: string): string {
  if (!isFlutterwaveBillCategory(categoryCode)) {
    throw new Error(`Category ${categoryCode} is not supported on Flutterwave bills`);
  }
  return FLUTTERWAVE_BILL_CATEGORY_MAP[categoryCode];
}

/** Provider id returned to the app: flw:{categoryCode}:{biller_code} */
export function encodeFlutterwaveProviderId(
  categoryCode: string,
  billerCode: string
): string {
  return `flw:${categoryCode}:${billerCode}`;
}

export function decodeFlutterwaveProviderId(providerId: string): {
  categoryCode: FlutterwaveBillCategoryCode;
  billerCode: string;
} {
  const parts = String(providerId).split(':');
  if (parts.length < 3 || parts[0] !== 'flw') {
    throw new Error('Invalid Flutterwave provider id');
  }

  const categoryCode = parts[1];
  const billerCode = parts.slice(2).join(':');

  if (!isFlutterwaveBillCategory(categoryCode) || !billerCode) {
    throw new Error('Invalid Flutterwave provider id');
  }

  return { categoryCode, billerCode };
}

export function isFlutterwaveProviderId(providerId: string | number): boolean {
  return String(providerId).startsWith('flw:');
}

/** Plan/item id returned to the app: flwitem:{item_code} */
export function encodeFlutterwaveItemId(itemCode: string): string {
  return `flwitem:${itemCode}`;
}

export function decodeFlutterwaveItemId(planId: string | number | undefined): string | null {
  if (planId === undefined || planId === null || planId === '') {
    return null;
  }
  const raw = String(planId);
  if (raw.startsWith('flwitem:')) {
    return raw.slice('flwitem:'.length) || null;
  }
  // Accept bare item codes from older clients / direct FLW codes
  if (!raw.includes(':')) {
    return raw;
  }
  return null;
}

export function requiresFlutterwaveCustomerValidation(categoryCode: string): boolean {
  return categoryCode === 'electricity' || categoryCode === 'cable_tv' || categoryCode === 'internet';
}
