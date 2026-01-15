import prisma from '../../core/config/database.js';

/**
 * Support Chat Service
 * Manages support chat conversations between users and support agents
 */
export class SupportChatService {
  /**
   * Create a new support chat
   */
  async createChat(
    userId: string | number,
    data: {
      name: string;
      email: string;
      reason: string;
    }
  ) {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }

    // Validate inputs
    if (!data.name || !data.email || !data.reason) {
      throw new Error('Name, email, and reason are required');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      throw new Error('Invalid email format');
    }

    // Create chat
    const chat = await prisma.supportChat.create({
      data: {
        userId: userIdNum,
        name: data.name.trim(),
        email: data.email.trim(),
        reason: data.reason.trim(),
        status: 'active',
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    return {
      id: chat.id,
      userId: chat.userId,
      name: chat.name,
      email: chat.email,
      reason: chat.reason,
      status: chat.status,
      assignedTo: chat.assignedTo,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
    };
  }

  /**
   * Get user's support chats with filters
   */
  async getUserChats(
    userId: string | number,
    filters: {
      status?: 'active' | 'resolved' | 'appealed' | 'all';
      limit?: number;
      offset?: number;
    } = {}
  ) {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }

    const where: any = {
      userId: userIdNum,
    };

    // Filter by status
    if (filters.status && filters.status !== 'all') {
      where.status = filters.status;
    }

    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    // Get chats with last message and unread count
    const chats = await prisma.supportChat.findMany({
      where,
      include: {
        messages: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
          include: {
            sender: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        _count: {
          select: {
            messages: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: limit,
      skip: offset,
    });

    // Get unread message counts for each chat
    const chatIds = chats.map((c: { id: number }) => c.id);
    const unreadCounts = await prisma.supportMessage.groupBy({
      by: ['chatId'],
      where: {
        chatId: { in: chatIds },
        isRead: false,
        senderId: { not: userIdNum }, // Only count messages NOT from the user
      },
      _count: {
        id: true,
      },
    });

    const unreadMap = new Map(unreadCounts.map((u: { chatId: number; _count: { id: number } }) => [u.chatId, u._count.id]));

    return chats.map((chat: any) => {
      const lastMessage = chat.messages[0] || null;
      const unreadCount = unreadCounts.find((u: { chatId: number }) => u.chatId === chat.id)?._count.id || 0;

      return {
        id: chat.id,
        name: chat.name,
        email: chat.email,
        reason: chat.reason,
        status: chat.status,
        assignedTo: chat.assignedTo,
        resolvedAt: chat.resolvedAt,
        appealedAt: chat.appealedAt,
        lastMessage: lastMessage
          ? {
              id: lastMessage.id,
              message: lastMessage.message,
              senderId: lastMessage.senderId,
              sender: lastMessage.sender,
              createdAt: lastMessage.createdAt,
            }
          : null,
        unreadCount,
        totalMessages: chat._count.messages,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
      };
    });
  }

  /**
   * Get chat details with all messages
   */
  async getChatDetails(chatId: string | number, userId: string | number) {
    const chatIdNum = typeof chatId === 'string' ? parseInt(chatId, 10) : chatId;
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;

    if (isNaN(chatIdNum) || chatIdNum <= 0) {
      throw new Error(`Invalid chatId: ${chatId}`);
    }
    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }

    // Get chat
    const chat = await prisma.supportChat.findUnique({
      where: { id: chatIdNum },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        assignee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!chat) {
      throw new Error('Chat not found');
    }

    // Verify user owns the chat
    if (chat.userId !== userIdNum) {
      throw new Error('Unauthorized to view this chat');
    }

    // Get all messages
    const messages = await prisma.supportMessage.findMany({
      where: { chatId: chatIdNum },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return {
      id: chat.id,
      userId: chat.userId,
      name: chat.name,
      email: chat.email,
      reason: chat.reason,
      status: chat.status,
      assignedTo: chat.assignedTo,
      assignee: chat.assignee,
      resolvedAt: chat.resolvedAt,
      appealedAt: chat.appealedAt,
      messages: messages.map((msg: any) => ({
        id: msg.id,
        senderId: msg.senderId,
        sender: msg.sender,
        message: msg.message,
        isRead: msg.isRead,
        readAt: msg.readAt,
        createdAt: msg.createdAt,
      })),
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
    };
  }

  /**
   * Send a message in support chat
   */
  async sendMessage(
    chatId: string | number,
    userId: string | number,
    message: string
  ) {
    const chatIdNum = typeof chatId === 'string' ? parseInt(chatId, 10) : chatId;
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;

    if (isNaN(chatIdNum) || chatIdNum <= 0) {
      throw new Error(`Invalid chatId: ${chatId}`);
    }
    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }

    if (!message || message.trim().length === 0) {
      throw new Error('Message is required');
    }

    if (message.length > 2000) {
      throw new Error('Message must not exceed 2000 characters');
    }

    // Verify chat exists and user owns it
    const chat = await prisma.supportChat.findUnique({
      where: { id: chatIdNum },
    });

    if (!chat) {
      throw new Error('Chat not found');
    }

    if (chat.userId !== userIdNum) {
      throw new Error('Unauthorized to send message in this chat');
    }

    // Don't allow messages in resolved or appealed chats
    if (chat.status === 'resolved' || chat.status === 'appealed') {
      throw new Error(`Cannot send messages in ${chat.status} chat`);
    }

    // Create message
    const supportMessage = await prisma.supportMessage.create({
      data: {
        chatId: chatIdNum,
        senderId: userIdNum,
        message: message.trim(),
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    // Update chat's updatedAt timestamp
    await prisma.supportChat.update({
      where: { id: chatIdNum },
      data: { updatedAt: new Date() },
    });

    return {
      id: supportMessage.id,
      chatId: supportMessage.chatId,
      senderId: supportMessage.senderId,
      sender: supportMessage.sender,
      message: supportMessage.message,
      isRead: supportMessage.isRead,
      readAt: supportMessage.readAt,
      createdAt: supportMessage.createdAt,
    };
  }

  /**
   * Mark messages as read
   */
  async markMessagesAsRead(chatId: string | number, userId: string | number) {
    const chatIdNum = typeof chatId === 'string' ? parseInt(chatId, 10) : chatId;
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;

    if (isNaN(chatIdNum) || chatIdNum <= 0) {
      throw new Error(`Invalid chatId: ${chatId}`);
    }
    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }

    // Verify chat exists and user owns it
    const chat = await prisma.supportChat.findUnique({
      where: { id: chatIdNum },
    });

    if (!chat) {
      throw new Error('Chat not found');
    }

    if (chat.userId !== userIdNum) {
      throw new Error('Unauthorized to mark messages as read in this chat');
    }

    // Mark all unread messages (from support agents/admins) as read
    await prisma.supportMessage.updateMany({
      where: {
        chatId: chatIdNum,
        senderId: { not: userIdNum }, // Only messages NOT from the user
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return {
      message: 'Messages marked as read',
    };
  }

  /**
   * Get unread message count for user
   */
  async getUnreadCount(userId: string | number) {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    if (isNaN(userIdNum) || userIdNum <= 0) {
      throw new Error(`Invalid userId: ${userId}`);
    }

    // Get user's chats
    const userChats = await prisma.supportChat.findMany({
      where: { userId: userIdNum },
      select: { id: true },
    });

    const chatIds = userChats.map((c: { id: number }) => c.id);

    if (chatIds.length === 0) {
      return {
        totalUnread: 0,
        unreadByChat: {},
      };
    }

    // Count unread messages per chat
    const unreadCounts = await prisma.supportMessage.groupBy({
      by: ['chatId'],
      where: {
        chatId: { in: chatIds },
        senderId: { not: userIdNum }, // Only messages NOT from the user
        isRead: false,
      },
      _count: {
        id: true,
      },
    });

    const totalUnread = unreadCounts.reduce((sum: number, u: { _count: { id: number } }) => sum + u._count.id, 0);
    const unreadByChat: { [key: number]: number } = {};
    unreadCounts.forEach((u: { chatId: number; _count: { id: number } }) => {
      unreadByChat[u.chatId] = u._count.id;
    });

    return {
      totalUnread,
      unreadByChat,
    };
  }
}

