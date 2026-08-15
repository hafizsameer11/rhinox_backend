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

  // Data
  BIL108: `${LOGO_BASE}/mtn.png`,
  BIL109: `${LOGO_BASE}/glo.png`,
  BIL110: `${LOGO_BASE}/airtel.png`,

  // Cable TV
  BIL121: `${LOGO_BASE}/dstv.png`,
  BIL122: `${LOGO_BASE}/gotv.png`,

  // Electricity
  BIL113: `${LOGO_BASE}/ikeja.png`,
  BIL114: `${LOGO_BASE}/ibandan.png`,
  BIL204: `${LOGO_BASE}/abuja.png`,

  // Internet
  BIL136: `${LOGO_BASE}/mtn.png`,
};

/** Name keyword → logo (order matters: more specific first) */
const NAME_KEYWORD_LOGOS: Array<{ match: RegExp; logo: string }> = [
  { match: /\bMTN\b/i, logo: `${LOGO_BASE}/mtn.png` },
  { match: /\bAIRTEL\b/i, logo: `${LOGO_BASE}/airtel.png` },
  { match: /\bGLO\b/i, logo: `${LOGO_BASE}/glo.png` },
  { match: /\bDSTV\b/i, logo: `${LOGO_BASE}/dstv.png` },
  { match: /\bGOTV\b/i, logo: `${LOGO_BASE}/gotv.png` },
  { match: /\bSHOWMAX\b/i, logo: `${LOGO_BASE}/showmax.png` },
  { match: /\bIKEJA\b/i, logo: `${LOGO_BASE}/ikeja.png` },
  { match: /\bIBADAN\b/i, logo: `${LOGO_BASE}/ibandan.png` },
  { match: /\bABUJA\b/i, logo: `${LOGO_BASE}/abuja.png` },
];

/**
 * Resolve a logo URL for a Flutterwave biller.
 * Prefers provider-returned logo, then biller code, then name keywords.
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
