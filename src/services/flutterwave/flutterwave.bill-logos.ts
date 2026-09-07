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

  // Electricity — Flutterwave UTILITYBILLS (NG DISCOs)
  BIL113: `${LOGO_BASE}/ikeja.png`, // Ikeja Electric
  BIL114: `${LOGO_BASE}/ibandan.png`, // Ibadan Electric
  BIL115: `${LOGO_BASE}/eko.png`, // Eko Electricity
  BIL116: `${LOGO_BASE}/enugu.png`, // Enugu Electric
  BIL117: `${LOGO_BASE}/ph.png`, // Port Harcourt Electric
  BIL118: `${LOGO_BASE}/benin.png`, // Benin Electric
  BIL204: `${LOGO_BASE}/abuja.png`, // Abuja Electric
  BIL112: `${LOGO_BASE}/kaduna.png`, // Kaduna Electric
  BIL124: `${LOGO_BASE}/kano.png`, // Kano Electric
  BIL126: `${LOGO_BASE}/jos.png`, // Jos Electric
  BIL127: `${LOGO_BASE}/yola.png`, // Yola Electric

  // Internet — prefer name matching; codes below are best-effort (FLW logo is always null)
  BIL128: `${LOGO_BASE}/smile.png`,
  BIL129: `${LOGO_BASE}/spectranet.png`,
  BIL130: `${LOGO_BASE}/smile.png`,
  // Do NOT map BIL131 → spectranet (that was wrongly showing Spectranet on ipNX)
  BIL136: `${LOGO_BASE}/mtn.png`,
  BIL137: `${LOGO_BASE}/airtel.png`,
  BIL138: `${LOGO_BASE}/glo.png`,
  BIL139: `${LOGO_BASE}/9mobile.png`,
};

/** Name keyword → logo (order matters: more specific first) */
const NAME_KEYWORD_LOGOS: Array<{ match: RegExp; logo: string }> = [
  { match: /\b9\s*MOBILE\b|\bETISALAT\b/i, logo: `${LOGO_BASE}/9mobile.png` },
  { match: /\bSPECTRANET\b/i, logo: `${LOGO_BASE}/spectranet.png` },
  { match: /\bIPNX\b/i, logo: `${LOGO_BASE}/ipnx.png` },
  { match: /\bSWIFT\s*4G\b|\bSWIFTNG\b|\bSWIFT\b/i, logo: `${LOGO_BASE}/swift4g.png` },
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
  { match: /\bEKO\b|\bEKEDC\b|\bEKEDP\b/i, logo: `${LOGO_BASE}/eko.png` },
  { match: /\bENUGU\b|\bEEDC\b/i, logo: `${LOGO_BASE}/enugu.png` },
  { match: /\bPORT\s*HARCOURT\b|\bPHED\b|\bPHEDC\b/i, logo: `${LOGO_BASE}/ph.png` },
  { match: /\bBENIN\b|\bBEDC\b/i, logo: `${LOGO_BASE}/benin.png` },
  { match: /\bYOLA\b|\bYEDC\b/i, logo: `${LOGO_BASE}/yola.png` },
  { match: /\bKADUNA\b|\bKAEDCO\b|\bKAEDC\b/i, logo: `${LOGO_BASE}/kaduna.png` },
  { match: /\bKANO\b|\bKEDCO\b/i, logo: `${LOGO_BASE}/kano.png` },
  { match: /\bJOS\b|\bJEDC?\b|\bJED\b/i, logo: `${LOGO_BASE}/jos.png` },
  { match: /\bBET9JA\b/i, logo: `${LOGO_BASE}/bet9ja.png` },
  { match: /\b1XBET\b/i, logo: `${LOGO_BASE}/1xbet.png` },
  { match: /\bSPORT(Y)?BET\b/i, logo: `${LOGO_BASE}/sportbet.png` },
];

/**
 * Resolve a logo URL for a Flutterwave biller.
 * Prefers provider-returned logo, then name keywords (brands), then biller code.
 * Name-first avoids wrong shared codes (e.g. ipNX must not inherit Spectranet).
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

  const haystack = `${input.name || ''} ${input.shortName || ''}`.trim();
  if (haystack) {
    for (const entry of NAME_KEYWORD_LOGOS) {
      if (entry.match.test(haystack)) {
        return entry.logo;
      }
    }
  }

  const code = (input.billerCode || '').trim().toUpperCase();
  if (code && BILLER_CODE_LOGOS[code]) {
    return BILLER_CODE_LOGOS[code];
  }

  return null;
}
