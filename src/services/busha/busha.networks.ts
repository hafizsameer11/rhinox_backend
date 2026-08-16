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
  bep20: 'BSC',
  solana: 'SOL',
  sol: 'SOL',
  polygon: 'MATIC',
  matic: 'MATIC',
  pol: 'MATIC',
  litecoin: 'LTC',
  ltc: 'LTC',
  xrp: 'XRP',
  ripple: 'XRP',
  ton: 'TON',
  xlms: 'XLM',
  xlm: 'XLM',
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
};

/** Busha-supported networks for multi-chain stables (Busha currency docs). */
export const BUSHA_STABLE_NETWORKS: Record<string, string[]> = {
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

export function toBushaNetwork(blockchain: string, currency?: string): string {
  const key = blockchain.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (CHAIN_TO_BUSHA[key]) return CHAIN_TO_BUSHA[key];
  if (CHAIN_TO_BUSHA[blockchain.toLowerCase()]) return CHAIN_TO_BUSHA[blockchain.toLowerCase()];
  const mappedCurrency = toBushaCurrency(currency || '');
  if (mappedCurrency === 'BTC') return 'BTC';
  return blockchain.toUpperCase();
}

export function fromBushaNetwork(network: string): { blockchain: string; blockchainName: string } {
  const key = network.toUpperCase();
  return BUSHA_TO_CHAIN[key] || { blockchain: network.toLowerCase(), blockchainName: network };
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
