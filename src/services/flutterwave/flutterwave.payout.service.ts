import { FlutterwaveClient, FlutterwaveProviderError } from './flutterwave.client.js';
import { getFlutterwaveTransferBankCode } from './flutterwave.network-map.js';

export type CreateFlutterwaveMomoTransferInput = {
  reference: string;
  amount: number;
  currency: string;
  countryCode: string;
  providerCode: string;
  phoneNumber: string;
  beneficiaryName: string;
  narration?: string;
  /** Required for Kenya M-Pesa */
  senderName?: string;
  senderCountry?: string;
  senderMobile?: string;
};

export class FlutterwavePayoutService {
  private readonly client = new FlutterwaveClient();

  async initiateMobileMoneyTransfer(input: CreateFlutterwaveMomoTransferInput) {
    const accountBank = getFlutterwaveTransferBankCode(input.countryCode, input.providerCode);

    const payload: Record<string, any> = {
      account_bank: accountBank,
      account_number: input.phoneNumber,
      amount: Math.floor(input.amount),
      currency: input.currency.toUpperCase(),
      narration: input.narration || `RhinoxPay withdrawal ${input.reference}`,
      reference: input.reference,
      beneficiary_name: input.beneficiaryName,
      debit_currency: input.currency.toUpperCase(),
    };

    if (input.countryCode.toUpperCase() === 'KE') {
      payload.meta = [
        {
          sender: input.senderName || input.beneficiaryName || 'RhinoxPay User',
          sender_country: input.senderCountry || 'KE',
          mobile_number: input.senderMobile || input.phoneNumber,
        },
      ];
    }

    const response = await this.client.post<any>('/v3/transfers', payload);
    const data = response?.data;
    if (!data) {
      throw new FlutterwaveProviderError(
        response?.message || 'Failed to initiate mobile money payout',
        503,
        response
      );
    }

    return {
      id: data.id as number,
      status: data.status as string,
      reference: (data.reference || input.reference) as string,
      amount: data.amount,
      currency: data.currency,
      fee: data.fee,
      completeMessage: data.complete_message,
      accountNumber: data.account_number,
      bankCode: data.bank_code || accountBank,
      raw: response,
    };
  }

  async getTransfer(transferId: number) {
    const response = await this.client.get<any>(`/v3/transfers/${transferId}`);
    return response?.data;
  }
}
