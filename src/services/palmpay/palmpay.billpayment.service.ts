import { getPalmPayConfig } from './palmpay.config.js';
import { PalmPayClient } from './palmpay.client.js';
import { isSupportedPalmPayScene, toPalmPayAmount } from './palmpay.utils.js';
import type {
  PalmPayBiller,
  PalmPayBillItem,
  PalmPayBillOrderResult,
  PalmPaySceneCode,
} from './palmpay.types.js';

export interface CreatePalmPayBillOrderInput {
  outOrderNo: string;
  sceneCode: PalmPaySceneCode;
  billerId: string;
  itemId: string;
  rechargeAccount: string;
  amount: string | number;
  userId: string | number;
}

export class PalmPayBillPaymentService {
  constructor(private readonly client = new PalmPayClient()) {}

  ensureSupportedScene(sceneCode: string): PalmPaySceneCode {
    if (!isSupportedPalmPayScene(sceneCode)) {
      throw new Error(`${sceneCode} bill payments are not supported`);
    }
    return sceneCode;
  }

  async queryBillers(sceneCode: string): Promise<PalmPayBiller[]> {
    const supportedScene = this.ensureSupportedScene(sceneCode);
    const data: any = await this.client.post('/api/v2/bill-payment/biller/query', {
      sceneCode: supportedScene,
    });
    const billers = Array.isArray(data) ? data : data?.billers || data?.billerList || [];
    return billers
      .map((biller: any) => ({
        billerId: biller.billerId || biller.id,
        billerName: biller.billerName || biller.name,
        billerIcon: biller.billerIcon || biller.icon,
        minAmount: biller.minAmount,
        maxAmount: biller.maxAmount,
        status: biller.status,
        raw: biller,
      }))
      .filter((biller: PalmPayBiller) => biller.billerId && biller.billerName);
  }

  async queryItems(sceneCode: string, billerId: string): Promise<PalmPayBillItem[]> {
    const supportedScene = this.ensureSupportedScene(sceneCode);
    const data: any = await this.client.post('/api/v2/bill-payment/item/query', {
      sceneCode: supportedScene,
      billerId,
    });
    const items = Array.isArray(data) ? data : data?.items || data?.itemList || [];
    return items
      .map((item: any) => ({
        billerId: item.billerId || billerId,
        itemId: item.itemId || item.id,
        itemName: item.itemName || item.name,
        amount: item.amount,
        minAmount: item.minAmount,
        maxAmount: item.maxAmount,
        isFixAmount: item.isFixAmount,
        status: item.status,
        raw: item,
      }))
      .filter((item: PalmPayBillItem) => item.itemId && item.itemName);
  }

  async verifyRechargeAccount(input: {
    sceneCode: string;
    rechargeAccount: string;
    billerId?: string;
    itemId?: string;
  }) {
    const supportedScene = this.ensureSupportedScene(input.sceneCode);
    return this.client.post('/api/v2/bill-payment/rechargeaccount/query', {
      sceneCode: supportedScene,
      rechargeAccount: input.rechargeAccount,
      billerId: input.billerId,
      itemId: input.itemId,
    });
  }

  async createOrder(input: CreatePalmPayBillOrderInput) {
    const config = getPalmPayConfig();
    return this.client.post<PalmPayBillOrderResult>('/api/v2/bill-payment/order/create', {
      sceneCode: input.sceneCode,
      outOrderNo: input.outOrderNo,
      amount: toPalmPayAmount(input.amount),
      notifyUrl: `${config.webhookUrl.replace(/\/$/, '')}/bill-payment`,
      billerId: input.billerId,
      itemId: input.itemId,
      rechargeAccount: input.rechargeAccount,
      title: `${input.sceneCode} Payment`,
      description: `${input.sceneCode} payment for ${input.rechargeAccount}`,
      relationId: String(input.userId),
    });
  }
}
