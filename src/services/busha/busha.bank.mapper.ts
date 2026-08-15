/** Best-effort Busha bank name/code → PalmPay bank code. */
const BUSHA_TO_PALMPAY: Record<string, string> = {
  '058': '058',
  '033': '033',
  '011': '011',
  '057': '057',
  '035': '035',
  '214': '214',
  '070': '070',
  '232': '232',
  '032': '032',
  '044': '044',
  '023': '023',
  '050': '050',
  '215': '215',
  '101': '101',
  '100033': '100033',
  gtb: '058',
  gtbank: '058',
  access: '044',
  zenith: '057',
  uba: '033',
  firstbank: '011',
  wema: '035',
  fidelity: '070',
  sterling: '232',
  union: '032',
  citibank: '023',
  ecobank: '050',
  unity: '215',
  providus: '101',
  palmpay: '100033',
};

const PALMPAY_TO_BUSHA: Record<string, string> = {
  '100033': '100033',
  '058': '058',
  '044': '044',
  '057': '057',
  '033': '033',
  '011': '011',
  '035': '035',
};

export function resolvePalmpayBankCode(bushaBankCode?: string | null, bushaBankName?: string | null): string {
  const code = String(bushaBankCode || '').trim();
  if (code && BUSHA_TO_PALMPAY[code]) return BUSHA_TO_PALMPAY[code];
  const name = String(bushaBankName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [key, mapped] of Object.entries(BUSHA_TO_PALMPAY)) {
    if (key.length > 3 && name.includes(key)) return mapped;
  }
  if (code) return code;
  throw new Error(`Unable to map Busha bank to PalmPay: ${bushaBankName || bushaBankCode || 'unknown'}`);
}

export function resolveBushaBankCodeFromPalmpay(palmPayBankCode?: string | null, palmPayBankName?: string | null): string {
  const code = String(palmPayBankCode || '').trim();
  if (code && PALMPAY_TO_BUSHA[code]) return PALMPAY_TO_BUSHA[code];
  const name = String(palmPayBankName || '').toLowerCase();
  if (name.includes('palm')) return '100033';
  if (code) return code;
  throw new Error(`Unable to map PalmPay bank to Busha: ${palmPayBankName || palmPayBankCode || 'unknown'}`);
}
