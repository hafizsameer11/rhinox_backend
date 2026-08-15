import axios, { type AxiosInstance } from 'axios';
import ApiError from '../../core/utils/ApiError.js';
import { getBushaConfig } from './busha.config.js';

export class BushaProviderError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 500,
    public readonly providerResponse?: any
  ) {
    super(message);
    this.name = 'BushaProviderError';
  }

  toApiError(): ApiError {
    if (this.statusCode === 400 || this.statusCode === 422) {
      return ApiError.badRequest(this.message);
    }
    if (this.statusCode === 401 || this.statusCode === 403) {
      return ApiError.unauthorized(this.message);
    }
    if (this.statusCode === 404) {
      return ApiError.notFound(this.message);
    }
    return ApiError.internal(this.message);
  }
}

export class BushaClient {
  private http: AxiosInstance | null = null;

  private getHttp(): AxiosInstance {
    if (!this.http) {
      const config = getBushaConfig();
      this.http = axios.create({
        baseURL: config.baseUrl,
        timeout: 45000,
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });
    }
    return this.http;
  }

  private unwrap<T>(data: any): T {
    if (data?.error) {
      const statusName = String(data.error.name || '');
      const message = data.error.message || 'Busha request failed';
      let statusCode = 400;
      if (statusName.includes('unauthorized')) statusCode = 401;
      if (statusName.includes('not_found')) statusCode = 404;
      throw new BushaProviderError(message, statusCode, data);
    }
    return (data?.data !== undefined ? data.data : data) as T;
  }

  private mapAxiosError(error: any): never {
    if (error instanceof BushaProviderError) {
      throw error;
    }
    const status = error.response?.status || 503;
    const body = error.response?.data;
    const message =
      body?.error?.message ||
      body?.message ||
      error.message ||
      'Busha is unavailable';
    throw new BushaProviderError(message, status, body);
  }

  async get<T = any>(path: string, profileId?: string, query?: Record<string, string>): Promise<T> {
    try {
      const response = await this.getHttp().get(path, {
        params: query,
        headers: profileId ? { 'X-BU-PROFILE-ID': profileId } : undefined,
      });
      return this.unwrap<T>(response.data);
    } catch (error) {
      this.mapAxiosError(error);
    }
  }

  async post<T = any>(path: string, body: Record<string, any> = {}, profileId?: string): Promise<T> {
    try {
      const response = await this.getHttp().post(path, body, {
        headers: profileId ? { 'X-BU-PROFILE-ID': profileId } : undefined,
      });
      return this.unwrap<T>(response.data);
    } catch (error) {
      this.mapAxiosError(error);
    }
  }

  async put<T = any>(path: string, body: Record<string, any> = {}, profileId?: string): Promise<T> {
    try {
      const response = await this.getHttp().put(path, body, {
        headers: profileId ? { 'X-BU-PROFILE-ID': profileId } : undefined,
      });
      return this.unwrap<T>(response.data);
    } catch (error) {
      this.mapAxiosError(error);
    }
  }
}
