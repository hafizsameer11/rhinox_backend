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

    // Ghana + Francophone MoMo require country on the charge payload
    const cc = input.countryCode.toUpperCase();
    if (cc === 'GH' || chargeType === 'mobile_money_franco') {
      payload.country = cc;
    }

    const response = await this.client.post<any>(
      '/v3/charges',
      payload,
      { type: chargeType }
    );

    // GH / Rwanda / Franco MoMo often return success with only meta.authorization.redirect (no data)
    const data = response?.data;
    const auth = data?.meta?.authorization || response?.meta?.authorization || {};
    const redirectUrl =
      auth.redirect ||
      data?.meta?.authorization?.redirect ||
      response?.meta?.authorization?.redirect ||
      data?.redirect ||
      null;

    if (!data && !redirectUrl) {
      throw new FlutterwaveProviderError(
        response?.message || 'Failed to initiate mobile money charge',
        503,
        response
      );
    }

    const status = String(data?.status || response?.status || 'pending').toLowerCase();
    const isPendingAuth =
      Boolean(redirectUrl) ||
      status === 'pending' ||
      String(auth.mode || '').toLowerCase() === 'redirect';

    return {
      status: (data?.status as string) || (isPendingAuth ? 'pending' : String(response?.status || 'pending')),
      flwRef: data?.flw_ref as string | undefined,
      txRef: (data?.tx_ref || input.txRef) as string,
      flwId: data?.id as number | undefined,
      amount: data?.amount ?? input.amount,
      currency: data?.currency ?? input.currency.toUpperCase(),
      authModel: data?.auth_model || auth.mode,
      processorResponse: data?.processor_response,
      meta: data?.meta || response?.meta,
      redirectUrl,
      message:
        data?.processor_response ||
        (redirectUrl
          ? 'Complete authorization to finish your deposit'
          : response?.message || 'Approve the payment on your mobile money phone'),
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
