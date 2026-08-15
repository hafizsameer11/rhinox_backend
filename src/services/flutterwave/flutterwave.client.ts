import axios, { type AxiosInstance } from 'axios';
import { getFlutterwaveConfig } from './flutterwave.config.js';

export class FlutterwaveProviderError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 503,
    public readonly providerResponse?: any
  ) {
    super(message);
    this.name = 'FlutterwaveProviderError';
  }
}

export class FlutterwaveClient {
  private http: AxiosInstance | null = null;

  private getHttp(): AxiosInstance {
    if (!this.http) {
      const config = getFlutterwaveConfig();
      this.http = axios.create({
        baseURL: config.baseUrl,
        timeout: 45000,
        headers: {
          Authorization: `Bearer ${config.secretKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });
    }
    return this.http;
  }

  async post<T = any>(path: string, body: Record<string, any>, query?: Record<string, string>): Promise<T> {
    try {
      const response = await this.getHttp().post(path, body, { params: query });
      const data = response.data;
      if (data?.status && data.status !== 'success' && data.status !== 'pending') {
        throw new FlutterwaveProviderError(
          data.message || 'Flutterwave request failed',
          503,
          data
        );
      }
      return data as T;
    } catch (error: any) {
      if (error instanceof FlutterwaveProviderError) {
        throw error;
      }
      throw new FlutterwaveProviderError(
        error.response?.data?.message ||
          error.message ||
          'Flutterwave is unavailable',
        error.response?.status || 503,
        error.response?.data
      );
    }
  }

  async get<T = any>(path: string, query?: Record<string, string>): Promise<T> {
    try {
      const response = await this.getHttp().get(path, { params: query });
      const data = response.data;
      if (data?.status && data.status !== 'success') {
        throw new FlutterwaveProviderError(
          data.message || 'Flutterwave request failed',
          503,
          data
        );
      }
      return data as T;
    } catch (error: any) {
      if (error instanceof FlutterwaveProviderError) {
        throw error;
      }
      throw new FlutterwaveProviderError(
        error.response?.data?.message ||
          error.message ||
          'Flutterwave is unavailable',
        error.response?.status || 503,
        error.response?.data
      );
    }
  }
}
