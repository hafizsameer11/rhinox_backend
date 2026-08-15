const CHAIN_TO_BUSHA: Record<string, string> = {
  bitcoin: 'BTC',
  btc: 'BTC',
  ethereum: 'ETH',
  eth: 'ETH',
  erc20: 'ETH',
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
};

const BUSHA_TO_CHAIN: Record<string, { blockchain: string; blockchainName: string }> = {
  BTC: { blockchain: 'bitcoin', blockchainName: 'Bitcoin' },
  ETH: { blockchain: 'ethereum', blockchainName: 'Ethereum' },
  TRX: { blockchain: 'tron', blockchainName: 'TRON' },
  BSC: { blockchain: 'bsc', blockchainName: 'BNB Smart Chain' },
  SOL: { blockchain: 'solana', blockchainName: 'Solana' },
  MATIC: { blockchain: 'polygon', blockchainName: 'Polygon' },
  LTC: { blockchain: 'litecoin', blockchainName: 'Litecoin' },
  XRP: { blockchain: 'xrp', blockchainName: 'XRP' },
  TON: { blockchain: 'ton', blockchainName: 'TON' },
};

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
