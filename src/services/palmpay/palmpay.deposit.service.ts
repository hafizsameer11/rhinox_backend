import { getPalmPayConfig } from './palmpay.config.js';
import { PalmPayClient } from './palmpay.client.js';
import { toPalmPayAmount } from './palmpay.utils.js';
import type { PalmPayVirtualAccountOrder } from './palmpay.types.js';

export interface CreatePalmPayDepositOrderInput {
  orderId: string;
  amount: string | number;
  userId: string | number;
  userMobileNo?: string | null;
}

export class PalmPayDepositService {
  constructor(private readonly client = new PalmPayClient()) {}

  async createVirtualAccountOrder(input: CreatePalmPayDepositOrderInput) {
    const config = getPalmPayConfig();
    return this.client.post<PalmPayVirtualAccountOrder>('/api/v2/payment/merchant/createorder', {
      orderId: input.orderId,
      title: 'Wallet Top-up',
      description: 'Deposit to NGN wallet',
      amount: toPalmPayAmount(input.amount),
      currency: 'NGN',
      notifyUrl: config.webhookUrl,
      callBackUrl: `${config.frontendUrl.replace(/\/$/, '')}/deposit/success`,
      productType: 'bank_transfer',
      goodsDetails: JSON.stringify([{ goodsId: '-1' }]),
      userId: String(input.userId),
      userMobileNo: input.userMobileNo || undefined,
      remark: `Wallet top-up transaction for user ${input.userId}`,
    });
  }

  async queryOrderStatus(orderId: string) {
    return this.client.post<PalmPayVirtualAccountOrder>('/api/v2/payment/merchant/order/queryStatus', {
      orderId,
    });
  }
}
