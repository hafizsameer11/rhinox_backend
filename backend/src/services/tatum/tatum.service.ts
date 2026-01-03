/* 
 * TATUM SERVICE - COMMENTED OUT FOR MOCK TESTING
 * This service will be used when Tatum account is available
 * For now, using local database wallet generation
 */

/*
import axios from 'axios';
import type { AxiosInstance } from 'axios';

/**
 * Tatum API Service
 * Handles all interactions with Tatum API
 */

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
  private axiosInstance: AxiosInstance;
  private axiosInstanceV4: AxiosInstance;

  constructor() {
    const apiKey = process.env.TATUM_API_KEY;
    const baseUrl = process.env.TATUM_BASE_URL || 'https://api.tatum.io/v3';
    const baseUrlV4 = process.env.TATUM_BASE_URL_V4 || 'https://api.tatum.io/v4';

    if (!apiKey) {
      throw new Error('TATUM_API_KEY is required');
    }

    this.axiosInstance = axios.create({
      baseURL: baseUrl,
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
    });

    this.axiosInstanceV4 = axios.create({
      baseURL: baseUrlV4,
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Create a new wallet for a blockchain
   */
  async createWallet(blockchain: string): Promise<TatumWalletResponse> {
    const normalizedBlockchain = blockchain.toLowerCase();

    // XRP uses different endpoint
    if (normalizedBlockchain === 'xrp' || normalizedBlockchain === 'ripple') {
      const endpoint = '/xrp/account';
      const response = await this.axiosInstance.get<{ address: string; secret: string }>(endpoint);
      return {
        address: response.data.address,
        secret: response.data.secret,
        privateKey: response.data.secret,
      };
    }

    // Other blockchains
    const endpoint = `/${normalizedBlockchain}/wallet`;
    const response = await this.axiosInstance.get<TatumWalletResponse>(endpoint);
    return response.data;
  }

  /**
   * Generate address from xpub
   */
  async generateAddress(blockchain: string, xpub: string, index: number): Promise<string> {
    const endpoint = `/${blockchain.toLowerCase()}/address/${xpub}/${index}`;
    const response = await this.axiosInstance.get<{ address: string }>(endpoint);
    return response.data.address;
  }

  /**
   * Generate private key from mnemonic
   */
  async generatePrivateKey(blockchain: string, mnemonic: string, index: number): Promise<string> {
    const endpoint = `/${blockchain.toLowerCase()}/wallet/priv`;
    const response = await this.axiosInstance.post<{ key: string }>(endpoint, {
      mnemonic,
      index,
    });
    return response.data.key;
  }

  /**
   * Register address webhook (V4 API)
   */
  async registerAddressWebhookV4(
    address: string,
    blockchain: string,
    webhookUrl: string,
    options?: {
      type?: 'INCOMING_NATIVE_TX' | 'INCOMING_FUNGIBLE_TX' | 'ADDRESS_EVENT';
      finality?: 'confirmed' | 'final';
    }
  ): Promise<TatumV4WebhookSubscriptionResponse> {
    const chain = this.getTatumV4Chain(blockchain);
    const data: any = {
      type: options?.type || 'INCOMING_NATIVE_TX',
      attr: {
        address,
        chain,
        url: webhookUrl,
      },
    };

    if (options?.finality) {
      data.finality = options.finality;
    }

    const response = await this.axiosInstanceV4.post<TatumV4WebhookSubscriptionResponse>(
      '/subscription',
      data
    );
    return response.data;
  }

  /**
   * Get Tatum V4 chain identifier
   */
  private getTatumV4Chain(blockchain: string): string {
    const chainMap: { [key: string]: string } = {
      bitcoin: 'bitcoin-mainnet',
      btc: 'bitcoin-mainnet',
      ethereum: 'ethereum-mainnet',
      eth: 'ethereum-mainnet',
      tron: 'tron-mainnet',
      trx: 'tron-mainnet',
      bsc: 'bsc-mainnet',
      binance: 'bsc-mainnet',
      solana: 'solana-mainnet',
      sol: 'solana-mainnet',
      polygon: 'polygon-mainnet',
      matic: 'polygon-mainnet',
      dogecoin: 'doge-mainnet',
      doge: 'doge-mainnet',
      xrp: 'ripple-mainnet',
      ripple: 'ripple-mainnet',
      litecoin: 'litecoin-mainnet',
      ltc: 'litecoin-mainnet',
    };

    const normalized = blockchain.toLowerCase();
    return chainMap[normalized] || 'ethereum-mainnet';
  }
}
*/

