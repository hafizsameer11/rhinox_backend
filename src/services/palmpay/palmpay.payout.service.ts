import { getPalmPayConfig } from './palmpay.config.js';
import { PalmPayClient } from './palmpay.client.js';
import { toPalmPayAmount } from './palmpay.utils.js';
import type { PalmPayAccountVerification, PalmPayBank, PalmPayPayoutResult } from './palmpay.types.js';

export interface CreatePalmPayPayoutInput {
  orderId: string;
  amount: string | number;
  accountNumber: string;
  accountName: string;
  bankCode: string;
  phoneNumber?: string | null;
  userId: string | number;
}

export class PalmPayPayoutService {
  constructor(private readonly client = new PalmPayClient()) {}

  async getBanks(businessType = 0): Promise<PalmPayBank[]> {
    const data: any = await this.client.post('/api/v2/general/merchant/queryBankList', {
      businessType,
    });
    const banks = Array.isArray(data) ? data : data?.banks || data?.bankList || [];
    return banks
      .map((bank: any) => ({
        bankCode: bank.bankCode || bank.code,
        bankName: bank.bankName || bank.name,
        bankUrl: bank.bankUrl || bank.logoUrl,
      }))
      .filter((bank: PalmPayBank) => bank.bankCode && bank.bankName);
  }

  async verifyBankAccount(bankCode: string, accountNumber: string): Promise<PalmPayAccountVerification> {
    const numericAccountNumber = accountNumber.replace(/\D/g, '');
    const endpoint = bankCode === '100033'
      ? '/api/v2/payment/merchant/payout/queryAccount'
      : '/api/v2/payment/merchant/payout/queryBankAccount';

    const data: any = await this.client.post(
      endpoint,
      {
        bankCode,
        accountNumber: numericAccountNumber,
      },
      bankCode === '100033' ? undefined : { version: 'V1.1' }
    );

    const status = data?.status || data?.Status;
    const isValid =
      data?.isValid === true ||
      data?.accountStatus === 0 ||
      String(status || '').toLowerCase() === 'success';

    return {
      accountName: data?.accountName || data?.account_name,
      accountStatus: data?.accountStatus,
      status,
      isValid,
      errorMessage: data?.errorMessage || data?.errorMsg || null,
      raw: data,
    };
  }

  async initiatePayout(input: CreatePalmPayPayoutInput) {
    const config = getPalmPayConfig();
    return this.client.post<PalmPayPayoutResult>('/api/v2/merchant/payment/payout', {
      orderId: input.orderId,
      title: 'Withdrawal',
      description: `Withdrawal to ${input.accountNumber}`,
      payeeName: input.accountName,
      payeeBankCode: input.bankCode,
      payeeBankAccNo: input.accountNumber.replace(/\D/g, ''),
      payeePhoneNo: input.phoneNumber || undefined,
      currency: 'NGN',
      amount: toPalmPayAmount(input.amount),
      notifyUrl: config.webhookUrl,
      remark: `Withdrawal transaction for user ${input.userId}`,
    });
  }

  async queryPayoutStatus(orderId: string) {
    return this.client.post<PalmPayPayoutResult>('/api/v2/merchant/payment/queryPayStatus', {
      orderId,
    });
  }
}
