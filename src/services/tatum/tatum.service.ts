/* 
 * TATUM SERVICE - COMMENTED OUT FOR MOCK TESTING
 * This service will be used when Tatum account is available
 * For now, using local database wallet generation
 */

// Placeholder exports to maintain TypeScript compatibility
export interface TatumWalletResponse {
  mnemonic?: string;
  xpub?: string;
  address?: string;
  privateKey?: string;
  secret?: string;
}

export interface TatumV4WebhookSubscriptionResponse {
  id: string;
  type: string;
  attr: {
    address: string;
    chain: string;
    url: string;
  };
}

export class TatumService {
  // Service implementation commented out for mock testing
}
