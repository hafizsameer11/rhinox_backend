/**
 * Blockchain name normalization for DB rows vs Tatum API slugs.
 */

const NORMALIZE_MAP: Record<string, string> = {
  ethereum: 'ethereum',
  eth: 'ethereum',
  tron: 'tron',
  trx: 'tron',
  bsc: 'bsc',
  binance: 'bsc',
  binancesmartchain: 'bsc',
  bitcoin: 'bitcoin',
  btc: 'bitcoin',
  litecoin: 'litecoin',
  ltc: 'litecoin',
  solana: 'solana',
  sol: 'solana',
  polygon: 'polygon',
  matic: 'polygon',
  dogecoin: 'dogecoin',
  doge: 'dogecoin',
  xrp: 'xrp',
  ripple: 'xrp',
};

/** Canonical chain key stored in user_wallets / deposit logic */
export function normalizeBlockchain(blockchain: string): string {
  const key = blockchain.toLowerCase().replace(/\s+/g, '');
  return NORMALIZE_MAP[key] ?? key;
}

/** Tatum v3 path segment (GET /{chain}/wallet) */
export function getTatumV3Blockchain(blockchain: string): string {
  const normalized = normalizeBlockchain(blockchain);
  if (normalized === 'litecoin') {
    return 'litecoin';
  }
  return normalized;
}

/** Tatum v4 subscription chain slug */
export function getTatumV4Chain(blockchain: string): string {
  const normalized = normalizeBlockchain(blockchain);
  const chainMap: Record<string, string> = {
    bitcoin: 'bitcoin-mainnet',
    ethereum: 'ethereum-mainnet',
    tron: 'tron-mainnet',
    bsc: 'bsc-mainnet',
    solana: 'solana-mainnet',
    polygon: 'polygon-mainnet',
    litecoin: 'litecoin-core-mainnet',
    dogecoin: 'doge-mainnet',
    xrp: 'ripple-mainnet',
  };
  return chainMap[normalized] ?? 'ethereum-mainnet';
}

export function isNonHdBlockchain(blockchain: string): boolean {
  const n = normalizeBlockchain(blockchain);
  return n === 'solana' || n === 'xrp';
}

export function getDerivationPath(blockchain: string): string | null {
  const paths: Record<string, string | null> = {
    bitcoin: "m/44'/0'/0'",
    ethereum: "m/44'/60'/0'",
    bsc: "m/44'/60'/0'",
    tron: "m/44'/195'/0'",
    polygon: "m/44'/60'/0'",
    litecoin: "m/44'/2'/0'",
    dogecoin: "m/44'/3'/0'",
    solana: null,
    xrp: null,
  };
  return paths[normalizeBlockchain(blockchain)] ?? null;
}

export function canonicalEvmContract(address: string): string {
  return address.trim().toLowerCase();
}

export function tokenContractMatches(
  dbContract: string | null | undefined,
  webhookContract: string | null | undefined
): boolean {
  if (!dbContract || !webhookContract) {
    return false;
  }
  const webhook = webhookContract.trim();
  const stored = dbContract.trim();
  if (webhook.startsWith('T') && stored.startsWith('T')) {
    return stored === webhook;
  }
  return canonicalEvmContract(stored) === canonicalEvmContract(webhook);
}
