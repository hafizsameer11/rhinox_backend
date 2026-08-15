import axios, { type AxiosInstance } from 'axios';
import {
  getTatumV3BaseUrl,
  getTatumV4BaseUrl,
} from '../../core/config/tatum.config.js';
import {
  getTatumV3Blockchain,
  getTatumV4Chain,
} from './tatum-blockchain.util.js';

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
  private readonly axiosV3: AxiosInstance;
  private readonly axiosV4: AxiosInstance;

  constructor() {
    const apiKey = process.env.TATUM_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('TATUM_API_KEY is required when Tatum integration is enabled');
    }

    const headers = { 'x-api-key': apiKey };

    this.axiosV3 = axios.create({
      baseURL: getTatumV3BaseUrl(),
      headers,
      timeout: 60_000,
    });

    this.axiosV4 = axios.create({
      baseURL: getTatumV4BaseUrl(),
      headers,
      timeout: 60_000,
    });
  }

  async createWallet(blockchain: string): Promise<TatumWalletResponse> {
    const chain = getTatumV3Blockchain(blockchain);

    if (chain === 'xrp') {
      const response = await this.axiosV3.get<{ address: string; secret: string }>('/xrp/account');
      return {
        address: response.data.address,
        secret: response.data.secret,
        privateKey: response.data.secret,
      };
    }

    const response = await this.axiosV3.get<TatumWalletResponse>(`/${chain}/wallet`);
    return response.data;
  }

  async generateAddress(blockchain: string, xpub: string, index: number): Promise<string> {
    const chain = getTatumV3Blockchain(blockchain);
    const response = await this.axiosV3.get<{ address: string }>(
      `/${chain}/address/${encodeURIComponent(xpub)}/${index}`
    );
    return response.data.address;
  }

  async generatePrivateKey(blockchain: string, mnemonic: string, index: number): Promise<string> {
    const chain = getTatumV3Blockchain(blockchain);
    const response = await this.axiosV3.post<{ key: string }>(`/${chain}/wallet/priv`, {
      mnemonic,
      index,
    });
    return response.data.key;
  }

  async registerAddressWebhookV4(
    address: string,
    blockchain: string,
    webhookUrl: string,
    options?: {
      type?: 'INCOMING_NATIVE_TX' | 'INCOMING_FUNGIBLE_TX' | 'ADDRESS_EVENT';
      finality?: 'confirmed' | 'final';
    }
  ): Promise<TatumV4WebhookSubscriptionResponse> {
    const chain = getTatumV4Chain(blockchain);
    const data: Record<string, unknown> = {
      type: options?.type ?? 'INCOMING_NATIVE_TX',
      attr: {
        address,
        chain,
        url: webhookUrl,
      },
    };

    if (options?.finality) {
      data.finality = options.finality;
    }

    const response = await this.axiosV4.post<TatumV4WebhookSubscriptionResponse>(
      '/subscription',
      data
    );
    return response.data;
  }
}

let tatumServiceInstance: TatumService | null = null;

export function getTatumService(): TatumService {
  if (!tatumServiceInstance) {
    tatumServiceInstance = new TatumService();
  }
  return tatumServiceInstance;
}
