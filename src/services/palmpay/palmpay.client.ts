import axios, { type AxiosInstance } from 'axios';
import { randomBytes } from 'crypto';
import { getPalmPayConfig } from './palmpay.config.js';
import { PalmPayAuthService } from './palmpay.auth.service.js';
import type { PalmPayEnvelope } from './palmpay.types.js';

export class PalmPayProviderError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 503,
    public readonly providerResponse?: any
  ) {
    super(message);
    this.name = 'PalmPayProviderError';
  }
}

export class PalmPayClient {
  private readonly http: AxiosInstance;
  private readonly auth = new PalmPayAuthService();

  constructor() {
    const config = getPalmPayConfig();
    this.http = axios.create({
      baseURL: config.baseUrl,
      timeout: 30000,
    });
  }

  createNonce(): string {
    return randomBytes(16).toString('hex');
  }

  async post<T = any>(
    path: string,
    body: Record<string, any>,
    options?: { version?: string }
  ): Promise<T> {
    const config = getPalmPayConfig();
    const payload = {
      requestTime: Date.now(),
      version: options?.version || config.version,
      nonceStr: this.createNonce(),
      ...body,
    };
    const signature = this.auth.sign(payload);

    try {
      const response = await this.http.post<PalmPayEnvelope<T> | T>(path, payload, {
        headers: {
          Accept: 'application/json, text/plain, */*',
          CountryCode: config.countryCode,
          Authorization: `Bearer ${config.appId}`,
          Signature: signature,
          'Content-Type': 'application/json',
        },
      });

      const responseData = response.data as PalmPayEnvelope<T>;
      if (responseData?.respCode && responseData.respCode !== '00000000') {
        throw new PalmPayProviderError(
          responseData.respMsg || 'PalmPay request failed',
          503,
          responseData
        );
      }

      return (responseData?.data ?? responseData) as T;
    } catch (error: any) {
      if (error instanceof PalmPayProviderError) {
        throw error;
      }

      throw new PalmPayProviderError(
        error.response?.data?.respMsg ||
          error.response?.data?.message ||
          error.message ||
          'PalmPay service is unavailable',
        error.response?.status || 503,
        error.response?.data
      );
    }
  }
}
