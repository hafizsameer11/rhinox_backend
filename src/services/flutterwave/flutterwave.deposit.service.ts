import { FlutterwaveClient, FlutterwaveProviderError } from './flutterwave.client.js';
import {
  getFlutterwaveChargeNetwork,
  getFlutterwaveChargeType,
} from './flutterwave.network-map.js';

export type CreateFlutterwaveMomoChargeInput = {
  txRef: string;
  amount: number;
  currency: string;
  countryCode: string;
  providerCode: string;
  phoneNumber: string;
  email: string;
  fullName?: string;
  redirectUrl?: string;
};

export class FlutterwaveDepositService {
  private readonly client = new FlutterwaveClient();

  async createMobileMoneyCharge(input: CreateFlutterwaveMomoChargeInput) {
    const chargeType = getFlutterwaveChargeType(input.countryCode);
    const network = getFlutterwaveChargeNetwork(input.countryCode, input.providerCode);

    const payload: Record<string, any> = {
      tx_ref: input.txRef,
      amount: input.amount,
      currency: input.currency.toUpperCase(),
      email: input.email,
      phone_number: input.phoneNumber,
      fullname: input.fullName || 'RhinoxPay Customer',
    };

    if (network) {
      payload.network = network;
    }

    if (input.redirectUrl) {
      payload.redirect_url = input.redirectUrl;
    }

    // Ghana docs sometimes require country
    if (input.countryCode.toUpperCase() === 'GH') {
      payload.country = 'GH';
    }

    const response = await this.client.post<any>(
      '/v3/charges',
      payload,
      { type: chargeType }
    );

    const data = response?.data;
    if (!data) {
      throw new FlutterwaveProviderError(
        response?.message || 'Failed to initiate mobile money charge',
        503,
        response
      );
    }

    return {
      status: data.status as string,
      flwRef: data.flw_ref as string | undefined,
      txRef: (data.tx_ref || input.txRef) as string,
      flwId: data.id as number | undefined,
      amount: data.amount,
      currency: data.currency,
      authModel: data.auth_model,
      processorResponse: data.processor_response,
      meta: data.meta,
      redirectUrl: data.meta?.authorization?.redirect || data.redirect || null,
      message:
        data.processor_response ||
        response?.message ||
        'Approve the payment on your mobile money phone',
      raw: response,
    };
  }

  async verifyByReference(txRef: string) {
    const response = await this.client.get<any>('/v3/transactions/verify_by_reference', {
      tx_ref: txRef,
    });
    return response?.data;
  }
}
