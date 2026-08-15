import { FlutterwaveClient, FlutterwaveProviderError } from './flutterwave.client.js';
import {
  toFlutterwaveCategoryCode,
  type FlutterwaveBillCategoryCode,
} from './flutterwave.bill-map.js';
import { mapFlwBillStatus, type MappedBillStatus } from './flutterwave.bill-status.js';

export type FlutterwaveBiller = {
  id: number | string;
  name: string;
  logo: string | null;
  description?: string | null;
  shortName?: string | null;
  billerCode: string;
  countryCode: string;
  raw: any;
};

export type FlutterwaveBillItem = {
  id: number | string;
  billerCode: string;
  name: string;
  itemCode: string;
  shortName?: string | null;
  amount: number;
  fee?: number;
  isAirtime: boolean;
  labelName?: string | null;
  groupName?: string | null;
  raw: any;
};

export type FlutterwaveValidateResult = {
  responseCode?: string;
  responseMessage?: string;
  name?: string | null;
  customer?: string;
  billerCode?: string;
  productCode?: string;
  fee?: number;
  minimum?: number;
  maximum?: number;
  raw: any;
};

export type FlutterwaveBillPaymentResult = {
  phoneNumber?: string;
  amount?: number;
  network?: string;
  code?: string;
  txRef?: string;
  reference?: string;
  batchReference?: string | null;
  rechargeToken?: string | null;
  fee?: number;
  raw: any;
  mappedStatus: MappedBillStatus;
};

export type FlutterwaveBillStatus = {
  currency?: string;
  customerId?: string;
  amount?: string | number;
  fee?: number;
  product?: string;
  status?: string;
  flwRef?: string;
  txRef?: string;
  customerReference?: string;
  extra?: any;
  raw: any;
  mappedStatus: MappedBillStatus;
};

export class FlutterwaveBillPaymentService {
  private readonly client = new FlutterwaveClient();

  async getCategories(country = 'NG') {
    const response = await this.client.get<any>('/v3/top-bill-categories', { country });
    return Array.isArray(response?.data) ? response.data : [];
  }

  async getBillers(
    categoryCode: FlutterwaveBillCategoryCode | string,
    country = 'NG'
  ): Promise<FlutterwaveBiller[]> {
    const flwCategory = isLikelyFlutterwaveCategory(categoryCode)
      ? categoryCode
      : toFlutterwaveCategoryCode(categoryCode);

    const response = await this.client.get<any>(`/v3/bills/${flwCategory}/billers`, {
      country,
    });

    const rows: any[] = Array.isArray(response?.data) ? response.data : [];
    return rows.map(
      (row: any): FlutterwaveBiller => ({
        id: row.id,
        name: row.name || row.short_name || row.biller_code,
        logo: row.logo || null,
        description: row.description || null,
        shortName: row.short_name || null,
        billerCode: row.biller_code,
        countryCode: row.country_code || country,
        raw: row,
      })
    );
  }

  async getBillItems(billerCode: string): Promise<FlutterwaveBillItem[]> {
    const response = await this.client.get<any>(`/v3/billers/${billerCode}/items`);
    const rows: any[] = Array.isArray(response?.data) ? response.data : [];
    return rows.map(
      (row: any): FlutterwaveBillItem => ({
        id: row.id,
        billerCode: row.biller_code || billerCode,
        name: row.name || row.biller_name || row.short_name || row.item_code,
        itemCode: row.item_code,
        shortName: row.short_name || null,
        amount: Number(row.amount || 0),
        fee: row.fee !== undefined ? Number(row.fee) : undefined,
        isAirtime: Boolean(row.is_airtime),
        labelName: row.label_name || null,
        groupName: row.group_name || null,
        raw: row,
      })
    );
  }

  async validateCustomer(itemCode: string, customer: string, billerCode?: string) {
    const query: Record<string, string> = {
      customer: String(customer || '').trim(),
    };
    // Flutterwave requires biller `code` for many billers (esp. electricity).
    if (billerCode) {
      query.code = String(billerCode).trim();
    }

    const response = await this.client.get<any>(
      `/v3/bill-items/${encodeURIComponent(itemCode)}/validate`,
      query
    );
    const data = response?.data || {};
    return {
      responseCode: data.response_code,
      responseMessage: data.response_message,
      name: data.name || null,
      customer: data.customer || customer,
      billerCode: data.biller_code || billerCode,
      productCode: data.product_code,
      fee: data.fee !== undefined ? Number(data.fee) : undefined,
      minimum: data.minimum !== undefined ? Number(data.minimum) : undefined,
      maximum: data.maximum !== undefined ? Number(data.maximum) : undefined,
      raw: data,
    } satisfies FlutterwaveValidateResult;
  }

  async createBillPayment(params: {
    billerCode: string;
    itemCode: string;
    country?: string;
    customerId: string;
    amount: number | string;
    reference: string;
    callbackUrl?: string;
  }): Promise<FlutterwaveBillPaymentResult> {
    const body: Record<string, any> = {
      country: params.country || 'NG',
      customer_id: params.customerId,
      amount: Number(params.amount),
      reference: params.reference,
    };
    if (params.callbackUrl) {
      body.callback_url = params.callbackUrl;
    }

    try {
      const response = await this.client.post<any>(
        `/v3/billers/${params.billerCode}/items/${params.itemCode}/payment`,
        body
      );
      const data = response?.data || {};
      const mappedStatus = mapFlwBillStatus(response);
      return {
        phoneNumber: data.phone_number,
        amount: data.amount !== undefined ? Number(data.amount) : undefined,
        network: data.network,
        code: data.code,
        txRef: data.tx_ref,
        reference: data.reference || params.reference,
        batchReference: data.batch_reference ?? null,
        rechargeToken: data.recharge_token ?? null,
        fee: data.fee !== undefined ? Number(data.fee) : undefined,
        raw: response,
        mappedStatus,
      };
    } catch (error: any) {
      if (error instanceof FlutterwaveProviderError) {
        throw error;
      }
      throw new FlutterwaveProviderError(
        error.message || 'Flutterwave bill payment failed',
        error.statusCode || 503,
        error.providerResponse
      );
    }
  }

  async getBillStatus(reference: string): Promise<FlutterwaveBillStatus> {
    const response = await this.client.get<any>(`/v3/bills/${encodeURIComponent(reference)}`);
    const data = response?.data || {};
    return {
      currency: data.currency,
      customerId: data.customer_id,
      amount: data.amount,
      fee: data.fee !== undefined ? Number(data.fee) : undefined,
      product: data.product,
      status: data.status,
      flwRef: data.flw_ref,
      txRef: data.tx_ref,
      customerReference: data.customer_reference,
      extra: data.extra,
      raw: response,
      mappedStatus: mapFlwBillStatus(response, { treatApiSuccessAsCompleted: true }),
    };
  }
}

function isLikelyFlutterwaveCategory(code: string): boolean {
  return /^[A-Z_]+$/.test(code);
}

export { mapFlwBillStatus };
export type { MappedBillStatus };
