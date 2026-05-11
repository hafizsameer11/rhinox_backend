export type PalmPayOrderStatus = 1 | 2 | 3 | 4;

export type PalmPaySceneCode = 'airtime' | 'data' | 'betting';

export interface PalmPayEnvelope<T = any> {
  respCode?: string;
  respMsg?: string;
  data?: T;
  [key: string]: any;
}

export interface PalmPayVirtualAccountOrder {
  orderNo?: string;
  orderStatus?: PalmPayOrderStatus;
  checkoutUrl?: string;
  payerAccountType?: string;
  payerAccountId?: string;
  payerBankName?: string;
  payerAccountName?: string;
  payerVirtualAccNo?: string;
  sdkSessionId?: string;
  sdkSignKey?: string;
  currency?: string;
  orderAmount?: number;
  payMethod?: string;
}

export interface PalmPayBank {
  bankCode: string;
  bankName: string;
  bankUrl?: string;
}

export interface PalmPayAccountVerification {
  accountName?: string;
  accountStatus?: number;
  status?: string;
  isValid: boolean;
  errorMessage?: string | null;
  raw?: any;
}

export interface PalmPayPayoutResult {
  orderNo?: string;
  orderStatus?: PalmPayOrderStatus;
  sessionId?: string;
  status?: string;
  errorMsg?: string;
  [key: string]: any;
}

export interface PalmPayBiller {
  billerId: string;
  billerName: string;
  billerIcon?: string;
  minAmount?: number;
  maxAmount?: number;
  status?: number;
  [key: string]: any;
}

export interface PalmPayBillItem {
  billerId: string;
  itemId: string;
  itemName: string;
  amount?: number;
  minAmount?: number;
  maxAmount?: number;
  isFixAmount?: number;
  status?: number;
  [key: string]: any;
}

export interface PalmPayBillOrderResult {
  orderNo?: string;
  outOrderNo?: string;
  orderStatus?: PalmPayOrderStatus;
  requestId?: string | null;
  errorMsg?: string | null;
  [key: string]: any;
}

export interface PalmPayWebhookPayload {
  orderId?: string;
  outOrderNo?: string;
  orderNo?: string;
  appId?: string;
  currency?: string;
  amount?: number;
  orderStatus?: PalmPayOrderStatus;
  completeTime?: number;
  completedTime?: number;
  sessionId?: string;
  errorMsg?: string | null;
  sign?: string;
  payMethod?: string;
  rechargeAccount?: string;
  country?: string;
  [key: string]: any;
}
