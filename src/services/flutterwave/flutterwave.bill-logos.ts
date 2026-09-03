/**
 * Flutterwave billers do not return logos (logo is always null).
 * Map known NG billers to local assets under /uploads/billpayments/.
 */

const LOGO_BASE = '/uploads/billpayments';

/** Exact Flutterwave biller_code → logo path */
const BILLER_CODE_LOGOS: Record<string, string> = {
  // Airtime
  BIL099: `${LOGO_BASE}/mtn.png`,
  BIL100: `${LOGO_BASE}/airtel.png`,
  BIL102: `${LOGO_BASE}/glo.png`,
  BIL103: `${LOGO_BASE}/9mobile.png`,
  BIL101: `${LOGO_BASE}/9mobile.png`,

  // Data
  BIL108: `${LOGO_BASE}/mtn.png`,
  BIL109: `${LOGO_BASE}/glo.png`,
  BIL110: `${LOGO_BASE}/airtel.png`,
  BIL111: `${LOGO_BASE}/9mobile.png`,
  BIL104: `${LOGO_BASE}/9mobile.png`,

  // Cable TV
  BIL119: `${LOGO_BASE}/dstv.png`,
  BIL120: `${LOGO_BASE}/gotv.png`,
  BIL121: `${LOGO_BASE}/dstv.png`,
  BIL122: `${LOGO_BASE}/gotv.png`,
  BIL123: `${LOGO_BASE}/startimes.png`,
  BIL125: `${LOGO_BASE}/dstv.png`,
  BIL133: `${LOGO_BASE}/showmax.png`,

  // Electricity
  BIL113: `${LOGO_BASE}/ikeja.png`,
  BIL114: `${LOGO_BASE}/ibandan.png`,
  BIL115: `${LOGO_BASE}/eko.png`,
  BIL116: `${LOGO_BASE}/enugu.png`,
  BIL117: `${LOGO_BASE}/ph.png`,
  BIL118: `${LOGO_BASE}/benin.png`,
  BIL204: `${LOGO_BASE}/abuja.png`,
  BIL112: `${LOGO_BASE}/kaduna.png`,
  BIL124: `${LOGO_BASE}/kano.png`,
  BIL126: `${LOGO_BASE}/jos.png`,
  BIL127: `${LOGO_BASE}/yola.png`,

  // Internet
  BIL128: `${LOGO_BASE}/smile.png`,
  BIL129: `${LOGO_BASE}/spectranet.png`,
  BIL130: `${LOGO_BASE}/smile.png`,
  BIL131: `${LOGO_BASE}/spectranet.png`,
  BIL136: `${LOGO_BASE}/mtn.png`,
  BIL137: `${LOGO_BASE}/airtel.png`,
  BIL138: `${LOGO_BASE}/glo.png`,
  BIL139: `${LOGO_BASE}/9mobile.png`,
};

/** Name keyword → logo (order matters: more specific first) */
const NAME_KEYWORD_LOGOS: Array<{ match: RegExp; logo: string }> = [
  { match: /\b9\s*MOBILE\b|\bETISALAT\b/i, logo: `${LOGO_BASE}/9mobile.png` },
  { match: /\bSPECTRANET\b/i, logo: `${LOGO_BASE}/spectranet.png` },
  { match: /\bSMILE\b/i, logo: `${LOGO_BASE}/smile.png` },
  { match: /\bSTARTIMES?\b|\bSTAR\s*TIMES\b/i, logo: `${LOGO_BASE}/startimes.png` },
  { match: /\bSHOWMAX\b/i, logo: `${LOGO_BASE}/showmax.png` },
  { match: /\bDSTV\b/i, logo: `${LOGO_BASE}/dstv.png` },
  { match: /\bGOTV\b/i, logo: `${LOGO_BASE}/gotv.png` },
  { match: /\bMTN\b/i, logo: `${LOGO_BASE}/mtn.png` },
  { match: /\bAIRTEL\b/i, logo: `${LOGO_BASE}/airtel.png` },
  { match: /\bGLO\b/i, logo: `${LOGO_BASE}/glo.png` },
  { match: /\bIKEJA\b|\bIKEDC\b/i, logo: `${LOGO_BASE}/ikeja.png` },
  { match: /\bIBADAN\b|\bIBEDC\b/i, logo: `${LOGO_BASE}/ibandan.png` },
  { match: /\bABUJA\b|\bAEDC\b/i, logo: `${LOGO_BASE}/abuja.png` },
  { match: /\bEKO\b|\bEKEDC\b/i, logo: `${LOGO_BASE}/eko.png` },
  { match: /\bENUGU\b|\bEEDC\b/i, logo: `${LOGO_BASE}/enugu.png` },
  { match: /\bPORT\s*HARCOURT\b|\bPHED\b|\bPHEDC\b/i, logo: `${LOGO_BASE}/ph.png` },
  { match: /\bBENIN\b|\bBEDC\b/i, logo: `${LOGO_BASE}/benin.png` },
  { match: /\bYOLA\b|\bYEDC\b/i, logo: `${LOGO_BASE}/yola.png` },
  { match: /\bKADUNA\b|\bKAEDCO\b|\bKEDCO\b/i, logo: `${LOGO_BASE}/kaduna.png` },
  { match: /\bKANO\b/i, logo: `${LOGO_BASE}/kano.png` },
  { match: /\bJOS\b|\bJED\b/i, logo: `${LOGO_BASE}/jos.png` },
  { match: /\bBET9JA\b/i, logo: `${LOGO_BASE}/bet9ja.png` },
  { match: /\b1XBET\b/i, logo: `${LOGO_BASE}/1xbet.png` },
  { match: /\bSPORT(Y)?BET\b/i, logo: `${LOGO_BASE}/sportbet.png` },
];

/**
 * Resolve a logo URL for a Flutterwave biller.
 * Prefers provider-returned logo, then biller code, then name keywords.
 * Returns null when unknown (client should use a neutral placeholder — never MTN/Smile).
 */
export function resolveFlutterwaveBillerLogo(input: {
  logo?: string | null;
  billerCode?: string | null;
  name?: string | null;
  shortName?: string | null;
}): string | null {
  const remote = input.logo?.trim();
  if (remote) return remote;

  const code = (input.billerCode || '').trim().toUpperCase();
  if (code && BILLER_CODE_LOGOS[code]) {
    return BILLER_CODE_LOGOS[code];
  }

  const haystack = `${input.name || ''} ${input.shortName || ''}`.trim();
  if (!haystack) return null;

  for (const entry of NAME_KEYWORD_LOGOS) {
    if (entry.match.test(haystack)) {
      return entry.logo;
    }
  }

  return null;
}
