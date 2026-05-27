import { NotificationService } from '../../modules/notification/notification.service.js';

const notificationService = new NotificationService();

export const NotificationAction = {
  LOGIN: 'login',
  REGISTER: 'register',
  EMAIL_VERIFIED: 'email_verified',
  LOGOUT: 'logout',
  PIN_SETUP: 'pin_setup',
  PIN_CHANGED: 'pin_changed',
  PASSWORD_RESET: 'password_reset',
  CRYPTO_DEPOSIT: 'crypto_deposit',
  FIAT_DEPOSIT: 'fiat_deposit',
  TRANSFER_SENT: 'transfer_sent',
  TRANSFER_RECEIVED: 'transfer_received',
  WITHDRAWAL: 'withdrawal',
  CONVERSION: 'conversion',
  BILL_PAYMENT: 'bill_payment',
  P2P_ORDER_CREATED: 'p2p_order_created',
  P2P_ORDER_ACCEPTED: 'p2p_order_accepted',
  P2P_PAYMENT_CONFIRMED: 'p2p_payment_confirmed',
  P2P_ORDER_COMPLETED: 'p2p_order_completed',
  P2P_ORDER_CANCELLED: 'p2p_order_cancelled',
} as const;

type NotificationType = 'transaction' | 'p2p' | 'conversion' | 'general' | 'promotional';
type NotificationStatus = 'success' | 'error' | 'info' | 'warning';

export type NotifyPayload = {
  userId: number;
  type: NotificationType;
  title: string;
  message?: string;
  status?: NotificationStatus;
  amount?: string | number;
  currency?: string;
  reference?: string;
  link?: string;
  metadata?: Record<string, unknown>;
};

/** Fire-and-forget — never blocks or throws to callers */
export function notifyUser(payload: NotifyPayload): void {
  void (async () => {
    try {
      await notificationService.createNotification(payload.userId, {
        type: payload.type,
        title: payload.title,
        ...(payload.message !== undefined && { message: payload.message }),
        status: payload.status ?? 'success',
        ...(payload.amount !== undefined && { amount: payload.amount }),
        ...(payload.currency !== undefined && { currency: payload.currency }),
        ...(payload.reference !== undefined && { reference: payload.reference }),
        ...(payload.link !== undefined && { link: payload.link }),
        ...(payload.metadata !== undefined && { metadata: payload.metadata }),
      });
    } catch (error) {
      console.error('[notifyUser] Failed to create notification:', error);
    }
  })();
}

export function notifyLogin(userId: number, ipAddress?: string | null): void {
  notifyUser({
    userId,
    type: 'general',
    title: 'New sign-in',
    message: ipAddress
      ? `Your account was accessed from ${ipAddress}.`
      : 'You signed in to your RhinoxPay account.',
    status: 'info',
    metadata: { action: NotificationAction.LOGIN, ipAddress: ipAddress ?? null },
  });
}

export function notifyRegistration(userId: number): void {
  notifyUser({
    userId,
    type: 'general',
    title: 'Welcome to RhinoxPay',
    message: 'Your account was created successfully. Verify your email to unlock all features.',
    status: 'success',
    metadata: { action: NotificationAction.REGISTER },
  });
}

export function notifyEmailVerified(userId: number): void {
  notifyUser({
    userId,
    type: 'general',
    title: 'Email verified',
    message: 'Your email has been verified. Your wallets are being set up.',
    status: 'success',
    metadata: { action: NotificationAction.EMAIL_VERIFIED },
  });
}

export function notifyPinSetup(userId: number, updated = false): void {
  notifyUser({
    userId,
    type: 'general',
    title: updated ? 'Transaction PIN updated' : 'Transaction PIN set',
    message: updated
      ? 'Your transaction PIN was changed successfully.'
      : 'Your transaction PIN is now active for secure payments.',
    status: 'success',
    metadata: { action: NotificationAction.PIN_SETUP },
  });
}

export function notifyPinChanged(userId: number): void {
  notifyUser({
    userId,
    type: 'general',
    title: 'Transaction PIN changed',
    message: 'Your transaction PIN was updated successfully.',
    status: 'success',
    metadata: { action: NotificationAction.PIN_CHANGED },
  });
}

export function notifyPasswordReset(userId: number): void {
  notifyUser({
    userId,
    type: 'general',
    title: 'Password reset',
    message: 'Your password was reset successfully. Sign in with your new password.',
    status: 'warning',
    metadata: { action: NotificationAction.PASSWORD_RESET },
  });
}

export function notifyCryptoDeposit(
  userId: number,
  data: { amount: string; currency: string; txId?: string | null; blockchain?: string }
): void {
  notifyUser({
    userId,
    type: 'transaction',
    title: 'Crypto deposit received',
    message: `You received ${data.amount} ${data.currency}.`,
    status: 'success',
    amount: data.amount,
    currency: data.currency,
    reference: data.txId ?? undefined,
    link: data.txId ? `/transactions/crypto/${data.txId}` : undefined,
    metadata: {
      action: NotificationAction.CRYPTO_DEPOSIT,
      channel: 'crypto',
      blockchain: data.blockchain,
      txId: data.txId,
    },
  });
}

export function notifyFiatDeposit(
  userId: number,
  data: { amount: string; currency: string; reference: string; creditedAmount?: string }
): void {
  notifyUser({
    userId,
    type: 'transaction',
    title: 'Deposit successful',
    message: data.creditedAmount
      ? `${data.creditedAmount} ${data.currency} has been credited to your wallet.`
      : `Your ${data.currency} deposit was credited.`,
    status: 'success',
    amount: data.creditedAmount ?? data.amount,
    currency: data.currency,
    reference: data.reference,
    link: `/transactions/${data.reference}`,
    metadata: { action: NotificationAction.FIAT_DEPOSIT, channel: 'fiat' },
  });
}

export function notifyTransferSent(
  userId: number,
  data: {
    amount: string;
    currency: string;
    reference: string;
    channel?: string;
    recipientLabel?: string;
  }
): void {
  notifyUser({
    userId,
    type: 'transaction',
    title: 'Transfer sent',
    message: data.recipientLabel
      ? `You sent ${data.amount} ${data.currency} to ${data.recipientLabel}.`
      : `You sent ${data.amount} ${data.currency}.`,
    status: 'success',
    amount: data.amount,
    currency: data.currency,
    reference: data.reference,
    link: `/transactions/${data.reference}`,
    metadata: {
      action: NotificationAction.TRANSFER_SENT,
      channel: data.channel,
    },
  });
}

export function notifyTransferReceived(
  userId: number,
  data: {
    amount: string;
    currency: string;
    reference: string;
    senderLabel?: string;
  }
): void {
  notifyUser({
    userId,
    type: 'transaction',
    title: 'Funds received',
    message: data.senderLabel
      ? `You received ${data.amount} ${data.currency} from ${data.senderLabel}.`
      : `You received ${data.amount} ${data.currency}.`,
    status: 'success',
    amount: data.amount,
    currency: data.currency,
    reference: data.reference,
    link: `/transactions/${data.reference}`,
    metadata: {
      action: NotificationAction.TRANSFER_RECEIVED,
      channel: 'rhionx_user',
    },
  });
}

export function notifyWithdrawal(
  userId: number,
  data: {
    amount: string;
    currency: string;
    reference: string;
    status: NotificationStatus;
    message?: string;
  }
): void {
  notifyUser({
    userId,
    type: 'transaction',
    title: data.status === 'success' ? 'Withdrawal successful' : 'Withdrawal update',
    message:
      data.message ??
      (data.status === 'success'
        ? `Your withdrawal of ${data.amount} ${data.currency} was processed.`
        : `Your withdrawal of ${data.amount} ${data.currency} was updated.`),
    status: data.status,
    amount: data.amount,
    currency: data.currency,
    reference: data.reference,
    link: `/transactions/${data.reference}`,
    metadata: { action: NotificationAction.WITHDRAWAL, channel: 'withdrawal' },
  });
}

export function notifyConversion(
  userId: number,
  data: {
    fromAmount: string;
    fromCurrency: string;
    toAmount: string;
    toCurrency: string;
    reference: string;
  }
): void {
  notifyUser({
    userId,
    type: 'conversion',
    title: 'Currency conversion complete',
    message: `Converted ${data.fromAmount} ${data.fromCurrency} to ${data.toAmount} ${data.toCurrency}.`,
    status: 'success',
    amount: data.toAmount,
    currency: data.toCurrency,
    reference: data.reference,
    link: `/transactions/${data.reference}`,
    metadata: {
      action: NotificationAction.CONVERSION,
      fromAmount: data.fromAmount,
      fromCurrency: data.fromCurrency,
    },
  });
}

export function notifyBillPayment(
  userId: number,
  data: {
    amount: string;
    currency: string;
    reference: string;
    status: NotificationStatus;
    categoryName?: string;
    message?: string;
  }
): void {
  notifyUser({
    userId,
    type: 'transaction',
    title:
      data.status === 'success'
        ? 'Bill payment successful'
        : data.status === 'error'
          ? 'Bill payment failed'
          : 'Bill payment update',
    message:
      data.message ??
      (data.categoryName
        ? `${data.categoryName} payment of ${data.amount} ${data.currency}.`
        : `Bill payment of ${data.amount} ${data.currency}.`),
    status: data.status,
    amount: data.amount,
    currency: data.currency,
    reference: data.reference,
    link: `/transactions/${data.reference}`,
    metadata: {
      action: NotificationAction.BILL_PAYMENT,
      channel: 'bill_payment',
      categoryName: data.categoryName,
    },
  });
}

export function notifyP2P(
  userId: number,
  data: {
    action: (typeof NotificationAction)[keyof typeof NotificationAction];
    title: string;
    message: string;
    amount?: string;
    currency?: string;
    orderId: number;
    status?: NotificationStatus;
  }
): void {
  notifyUser({
    userId,
    type: 'p2p',
    title: data.title,
    message: data.message,
    status: data.status ?? 'info',
    ...(data.amount !== undefined && { amount: data.amount }),
    ...(data.currency !== undefined && { currency: data.currency }),
    reference: String(data.orderId),
    link: `/p2p/orders/${data.orderId}`,
    metadata: { action: data.action, orderId: data.orderId, channel: 'p2p' },
  });
}
