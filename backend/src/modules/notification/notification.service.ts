import prisma from '../../core/config/database.js';
import Decimal from 'decimal.js';

/**
 * Notification Service
 * Manages user notifications for transactions, P2P, conversions, etc.
 */
export class NotificationService {
  /**
   * Create a notification
   */
  async createNotification(
    userId: number,
    data: {
      type: 'transaction' | 'p2p' | 'conversion' | 'general' | 'promotional';
      title: string;
      message?: string;
      status?: 'success' | 'error' | 'info' | 'warning';
      amount?: string | number;
      currency?: string;
      reference?: string;
      link?: string;
      metadata?: any;
    }
  ) {
    const notification = await prisma.notification.create({
      data: {
        userId,
        type: data.type,
        title: data.title,
        message: data.message || null,
        status: data.status || 'success',
        amount: data.amount ? new Decimal(data.amount).toNumber() : null,
        currency: data.currency || null,
        reference: data.reference || null,
        link: data.link || null,
        metadata: data.metadata || null,
      },
    });

    return notification;
  }

  /**
   * Get all notifications for a user
   */
  async getUserNotifications(
    userId: string,
    filters?: {
      type?: string;
      isRead?: boolean;
      limit?: number;
      offset?: number;
    }
  ) {
    // Parse userId to integer
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }

    const where: any = {
      userId: parsedUserId,
    };

    if (filters?.type) {
      where.type = filters.type;
    }

    if (filters?.isRead !== undefined) {
      where.isRead = filters.isRead;
    }

    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      skip: offset,
    });

    return notifications.map(notification => ({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      status: notification.status,
      amount: notification.amount ? notification.amount.toString() : null,
      currency: notification.currency,
      reference: notification.reference,
      link: notification.link,
      isRead: notification.isRead,
      readAt: notification.readAt,
      metadata: notification.metadata,
      createdAt: notification.createdAt,
    }));
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(userId: string) {
    // Parse userId to integer
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }

    const count = await prisma.notification.count({
      where: {
        userId: parsedUserId,
        isRead: false,
      },
    });

    return count;
  }

  /**
   * Mark notification as read
   */
  async markAsRead(userId: string, notificationId: string) {
    // Parse IDs to integers
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    const parsedNotificationId = typeof notificationId === 'string' ? parseInt(notificationId, 10) : notificationId;

    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }
    if (isNaN(parsedNotificationId) || parsedNotificationId <= 0) {
      throw new Error('Invalid notification ID format');
    }

    const notification = await prisma.notification.findFirst({
      where: {
        id: parsedNotificationId,
        userId: parsedUserId,
      },
    });

    if (!notification) {
      throw new Error('Notification not found');
    }

    const updated = await prisma.notification.update({
      where: { id: parsedNotificationId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return {
      id: updated.id,
      isRead: updated.isRead,
      readAt: updated.readAt,
    };
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId: string) {
    // Parse userId to integer
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }

    await prisma.notification.updateMany({
      where: {
        userId: parsedUserId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return { message: 'All notifications marked as read' };
  }

  /**
   * Delete a notification
   */
  async deleteNotification(userId: string, notificationId: string) {
    // Parse IDs to integers
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    const parsedNotificationId = typeof notificationId === 'string' ? parseInt(notificationId, 10) : notificationId;

    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }
    if (isNaN(parsedNotificationId) || parsedNotificationId <= 0) {
      throw new Error('Invalid notification ID format');
    }

    const notification = await prisma.notification.findFirst({
      where: {
        id: parsedNotificationId,
        userId: parsedUserId,
      },
    });

    if (!notification) {
      throw new Error('Notification not found');
    }

    await prisma.notification.delete({
      where: { id: parsedNotificationId },
    });

    return { message: 'Notification deleted successfully' };
  }
}

