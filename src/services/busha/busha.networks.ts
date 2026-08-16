const CHAIN_TO_BUSHA: Record<string, string> = {
  bitcoin: 'BTC',
  btc: 'BTC',
  ethereum: 'ETH',
  eth: 'ETH',
  erc20: 'ETH',
  base: 'BASE',
  tron: 'TRX',
  trx: 'TRX',
  trc20: 'TRX',
  bsc: 'BSC',
  binance: 'BSC',
  binancesmartchain: 'BSC',
  bnbsmartchain: 'BSC',
  bep20: 'BSC',
  solana: 'SOL',
  sol: 'SOL',
  polygon: 'MATIC',
  matic: 'MATIC',
  litecoin: 'LTC',
  ltc: 'LTC',
  xrp: 'XRP',
  ripple: 'XRP',
  ton: 'TON',
  xlms: 'XLM',
  xlm: 'XLM',
  stellar: 'XLM',
  plasma: 'XPL',
  xpl: 'XPL',
};

const BUSHA_TO_CHAIN: Record<string, { blockchain: string; blockchainName: string }> = {
  BTC: { blockchain: 'bitcoin', blockchainName: 'Bitcoin' },
  ETH: { blockchain: 'ethereum', blockchainName: 'Ethereum (ERC20)' },
  BASE: { blockchain: 'base', blockchainName: 'Base' },
  TRX: { blockchain: 'tron', blockchainName: 'TRON (TRC20)' },
  BSC: { blockchain: 'bsc', blockchainName: 'BNB Smart Chain (BEP20)' },
  SOL: { blockchain: 'solana', blockchainName: 'Solana' },
  MATIC: { blockchain: 'polygon', blockchainName: 'Polygon' },
  LTC: { blockchain: 'litecoin', blockchainName: 'Litecoin' },
  XRP: { blockchain: 'xrp', blockchainName: 'XRP' },
  TON: { blockchain: 'ton', blockchainName: 'TON' },
  XLM: { blockchain: 'xlm', blockchainName: 'Stellar' },
  BNB: { blockchain: 'bsc', blockchainName: 'BNB Smart Chain (BEP20)' },
  XPL: { blockchain: 'plasma', blockchainName: 'Plasma' },
};

/** Busha-supported networks for multi-chain stables (Busha currency docs). */
export const BUSHA_STABLE_NETWORKS: Record<string, string[]> = {
  // Docs: USDT-BEP20 (BSC), USDT-ERC20 (ETH), USDT-TRC20 (TRX), USDT-XPL (Plasma), USDT-SOL (SOL)
  // Exclude Polygon — Busha does not list USDT on POL/MATIC for deposits.
  USDT: ['TRX', 'ETH', 'BSC', 'SOL'],
  USDC: ['ETH', 'BASE', 'TRX', 'XLM', 'SOL'],
};

/**
 * Deposit-enabled crypto from Busha docs — used when GET /v1/currencies fails
 * or returns an empty list so wallet/deposit still show the full catalog.
 */
export const BUSHA_DEPOSIT_CATALOG_FALLBACK: Array<{
  code: string;
  name: string;
  networks: string[];
}> = [
  { code: 'BNB', name: 'BNB', networks: ['BSC'] },
  { code: 'BTC', name: 'Bitcoin', networks: ['BTC'] },
  { code: 'ETH', name: 'Ethereum', networks: ['ETH', 'BASE'] },
  { code: 'LTC', name: 'Litecoin', networks: ['LTC'] },
  { code: 'MC', name: 'MC Token', networks: ['ETH'] },
  { code: 'POL', name: 'POL', networks: ['MATIC'] },
  { code: 'SHIB', name: 'SHIBA INU', networks: ['ETH'] },
  { code: 'SOL', name: 'Solana', networks: ['SOL'] },
  { code: 'TON', name: 'Toncoin', networks: ['TON'] },
  { code: 'TRUMP', name: 'Official Trump', networks: ['SOL'] },
  { code: 'TRX', name: 'TRON', networks: ['TRX'] },
  { code: 'USDC', name: 'USD Coin', networks: BUSHA_STABLE_NETWORKS.USDC },
  { code: 'USDT', name: 'Tether', networks: BUSHA_STABLE_NETWORKS.USDT },
  { code: 'XLM', name: 'Stellar', networks: ['XLM'] },
  { code: 'XRP', name: 'XRP', networks: ['XRP'] },
];

export function toBushaCurrency(currency: string): string {
  const upper = currency.toUpperCase();
  if (upper.startsWith('USDT')) return 'USDT';
  if (upper.startsWith('USDC')) return 'USDC';
  return upper;
}

/**
 * Normalize Busha network id / code / name into a Busha network code (ETH, TRX, BSC…).
 * Handles ids like "ethereum", "USDT-TRC20", "ERC20", and name labels.
 */
export function toBushaNetwork(blockchain: string, currency?: string): string {
  const raw = String(blockchain || '').trim();
  if (!raw) {
    const mappedCurrency = toBushaCurrency(currency || '');
    if (mappedCurrency === 'BTC') return 'BTC';
    if (BUSHA_STABLE_NETWORKS[mappedCurrency]?.[0]) return BUSHA_STABLE_NETWORKS[mappedCurrency][0];
    return mappedCurrency || '';
  }

  const upper = raw.toUpperCase();
  const key = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  const code = toBushaCurrency(currency || '');

  // Prefer explicit token-network suffixes from Busha (USDT-TRC20, USDC-ERC20, …)
  if (/TRC20/.test(upper) || key.includes('tron') || key === 'trx') return 'TRX';
  if (/BEP20/.test(upper) || key.includes('bsc') || key.includes('binance')) return 'BSC';
  if (/ERC20/.test(upper) || key === 'eth' || key === 'ethereum') return 'ETH';
  if (key === 'base' || key.endsWith('base') || upper === 'BASE') return 'BASE';
  if (key.includes('solana') || key === 'sol' || /(^|-)SOL$/i.test(upper) || key.endsWith('sol')) {
    return 'SOL';
  }
  if (key.includes('plasma') || key === 'xpl' || /XPL/.test(upper)) return 'XPL';
  if (key.includes('stellar') || key === 'xlm') return 'XLM';
  if (key.includes('polygon') || key === 'matic') return 'MATIC';
  // POL native token only — never treat bare "pol" as a USDT network
  if (key === 'pol' && code === 'POL') return 'MATIC';

  if (CHAIN_TO_BUSHA[key]) return CHAIN_TO_BUSHA[key];
  if (CHAIN_TO_BUSHA[raw.toLowerCase()]) return CHAIN_TO_BUSHA[raw.toLowerCase()];
  if (BUSHA_TO_CHAIN[upper]) return upper;
  if (code === 'BTC') return 'BTC';
  return upper;
}

export function fromBushaNetwork(network: string): { blockchain: string; blockchainName: string } {
  const key = toBushaNetwork(network);
  return BUSHA_TO_CHAIN[key] || { blockchain: String(network || '').toLowerCase(), blockchainName: network };
}

export function isCryptoCurrency(code: string): boolean {
  const upper = toBushaCurrency(code);
  return !['NGN', 'KES', 'GHS', 'USD', 'UGX', 'TZS', 'ZAR'].includes(upper);
}

export function getBushaNetworksForCurrency(currency: string): string[] {
  const code = toBushaCurrency(currency);
  if (BUSHA_STABLE_NETWORKS[code]) return [...BUSHA_STABLE_NETWORKS[code]];
  const native = fromBushaNetwork(code);
  return [toBushaNetwork(native.blockchain, code)];
}

/** True when parsed networks look incomplete/wrong for a multi-chain stable. */
export function shouldPreferStableNetworkDefaults(
  currency: string,
  networks: Array<{ bushaNetwork?: string; blockchain?: string; blockchainName?: string }>
): boolean {
  const code = toBushaCurrency(currency);
  const expected = BUSHA_STABLE_NETWORKS[code];
  if (!expected) return false;
  if (!networks?.length) return true;

  const codes = networks.map((n) =>
    toBushaNetwork(String(n.bushaNetwork || n.blockchain || ''), code)
  );
  const unique = [...new Set(codes.filter(Boolean))];
  // Polygon is not a Busha USDT deposit network — treat as bad catalog data
  if (code === 'USDT' && unique.some((c) => c === 'MATIC')) return true;
  if (unique.length < 2) return true;
  if (code === 'USDT' && !unique.includes('TRX') && !unique.includes('ETH')) return true;
  return false;
}
