import prisma from '../../core/config/database.js';

/**
 * P2P Chat Service
 * Manages chat messages between buyer and vendor for orders
 */
export class P2PChatService {
  /**
   * Send message in order chat
   */
  async sendMessage(
    orderId: string,
    senderId: string,
    message: string
  ) {
    const parsedOrderId = typeof orderId === 'string' ? parseInt(orderId, 10) : orderId;
    if (isNaN(parsedOrderId) || parsedOrderId <= 0) {
      throw new Error('Invalid order ID format');
    }

    const parsedSenderId = typeof senderId === 'string' ? parseInt(senderId, 10) : senderId;
    if (isNaN(parsedSenderId) || parsedSenderId <= 0) {
      throw new Error('Invalid sender ID format');
    }

    // Verify order exists and user is part of it
    const order = await prisma.p2POrder.findUnique({
      where: { id: parsedOrderId },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    if (order.buyerId !== parsedSenderId && order.vendorId !== parsedSenderId) {
      throw new Error('Unauthorized to send message in this order');
    }

    // Determine receiver
    const receiverId = order.buyerId === parsedSenderId ? order.vendorId : order.buyerId;

    // Create message
    const chatMessage = await prisma.p2PChatMessage.create({
      data: {
        orderId: parsedOrderId,
        senderId: parsedSenderId,
        receiverId,
        message,
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return {
      id: chatMessage.id,
      orderId: chatMessage.orderId,
      senderId: chatMessage.senderId,
      sender: chatMessage.sender,
      receiverId: chatMessage.receiverId,
      message: chatMessage.message,
      isRead: chatMessage.isRead,
      readAt: chatMessage.readAt,
      createdAt: chatMessage.createdAt,
    };
  }

  /**
   * Get chat messages for an order
   */
  async getChatMessages(orderId: string, userId: string) {
    const parsedOrderId = typeof orderId === 'string' ? parseInt(orderId, 10) : orderId;
    if (isNaN(parsedOrderId) || parsedOrderId <= 0) {
      throw new Error('Invalid order ID format');
    }

    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }

    // Verify order exists and user is part of it
    const order = await prisma.p2POrder.findUnique({
      where: { id: parsedOrderId },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    if (order.buyerId !== parsedUserId && order.vendorId !== parsedUserId) {
      throw new Error('Unauthorized to view messages for this order');
    }

    const messages = await prisma.p2PChatMessage.findMany({
      where: { orderId: parsedOrderId },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return messages.map(msg => ({
      id: msg.id,
      orderId: msg.orderId,
      senderId: msg.senderId,
      sender: msg.sender,
      receiverId: msg.receiverId,
      message: msg.message,
      isRead: msg.isRead,
      readAt: msg.readAt,
      createdAt: msg.createdAt,
    }));
  }

  /**
   * Mark messages as read
   */
  async markAsRead(orderId: string, userId: string) {
    const parsedOrderId = typeof orderId === 'string' ? parseInt(orderId, 10) : orderId;
    if (isNaN(parsedOrderId) || parsedOrderId <= 0) {
      throw new Error('Invalid order ID format');
    }

    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }

    // Verify order exists and user is part of it
    const order = await prisma.p2POrder.findUnique({
      where: { id: parsedOrderId },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    if (order.buyerId !== parsedUserId && order.vendorId !== parsedUserId) {
      throw new Error('Unauthorized to mark messages as read for this order');
    }

    // Mark all unread messages sent to this user as read
    await prisma.p2PChatMessage.updateMany({
      where: {
        orderId: parsedOrderId,
        receiverId: parsedUserId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return {
      success: true,
      message: 'Messages marked as read',
    };
  }

  /**
   * Get unread message count for user
   */
  async getUnreadCount(userId: string) {
    const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error('Invalid user ID format');
    }

    const count = await prisma.p2PChatMessage.count({
      where: {
        receiverId: parsedUserId,
        isRead: false,
      },
    });

    return {
      unreadCount: count,
    };
  }
}

