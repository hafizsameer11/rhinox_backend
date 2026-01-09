import { NotificationService } from '../../modules/notification/notification.service.js';

/**
 * Notification Helper
 * Utility functions to create notifications for various events
 */
const notificationService = new NotificationService();

/**
 * Create a transaction notification
 */
export async function createTransactionNotification(
  userId: number,
  data: {
    title: string;
    message?: string;
    status: 'success' | 'error' | 'info' | 'warning';
    amount: string | number;
    currency: string;
    reference: string;
    link?: string;
    metadata?: any;
  }
) {
  return await notificationService.createNotification(userId, {
    type: 'transaction',
    title: data.title,
    ...(data.message !== undefined && { message: data.message }),
    status: data.status,
    amount: data.amount,
    currency: data.currency,
    reference: data.reference,
    link: data.link || `/transactions/${data.reference}`,
    ...(data.metadata !== undefined && { metadata: data.metadata }),
  });
}

/**
 * Create a P2P transaction notification
 */
export async function createP2PNotification(
  userId: number,
  data: {
    title: string;
    message?: string;
    status: 'success' | 'error' | 'info' | 'warning';
    amount?: string | number;
    currency?: string;
    reference?: string;
    link?: string;
    metadata?: any;
  }
) {
  return await notificationService.createNotification(userId, {
    type: 'p2p',
    title: data.title,
    ...(data.message !== undefined && { message: data.message }),
    status: data.status,
    ...(data.amount !== undefined && { amount: data.amount }),
    ...(data.currency !== undefined && { currency: data.currency }),
    ...(data.reference !== undefined && { reference: data.reference }),
    ...(data.link !== undefined && { link: data.link }),
    ...(data.metadata !== undefined && { metadata: data.metadata }),
  });
}

/**
 * Create a conversion notification
 */
export async function createConversionNotification(
  userId: number,
  data: {
    title: string;
    message?: string;
    status: 'success' | 'error' | 'info' | 'warning';
    amount?: string | number;
    currency?: string;
    reference?: string;
    link?: string;
    metadata?: any;
  }
) {
  return await notificationService.createNotification(userId, {
    type: 'conversion',
    title: data.title,
    ...(data.message !== undefined && { message: data.message }),
    status: data.status,
    ...(data.amount !== undefined && { amount: data.amount }),
    ...(data.currency !== undefined && { currency: data.currency }),
    ...(data.reference !== undefined && { reference: data.reference }),
    ...(data.link !== undefined && { link: data.link }),
    ...(data.metadata !== undefined && { metadata: data.metadata }),
  });
}

/**
 * Create a general notification
 */
export async function createGeneralNotification(
  userId: number,
  data: {
    title: string;
    message?: string;
    status?: 'success' | 'error' | 'info' | 'warning';
    link?: string;
    metadata?: any;
  }
) {
  return await notificationService.createNotification(userId, {
    type: 'general',
    title: data.title,
    ...(data.message !== undefined && { message: data.message }),
    status: data.status || 'info',
    ...(data.link !== undefined && { link: data.link }),
    ...(data.metadata !== undefined && { metadata: data.metadata }),
  });
}

/**
 * Create a promotional notification
 */
export async function createPromotionalNotification(
  userId: number,
  data: {
    title: string;
    message?: string;
    link?: string;
    metadata?: any;
  }
) {
  return await notificationService.createNotification(userId, {
    type: 'promotional',
    title: data.title,
    ...(data.message !== undefined && { message: data.message }),
    status: 'info',
    ...(data.link !== undefined && { link: data.link }),
    ...(data.metadata !== undefined && { metadata: data.metadata }),
  });
}
