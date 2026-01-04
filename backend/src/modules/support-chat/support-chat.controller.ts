import { type Request, type Response } from 'express';
import { SupportChatService } from './support-chat.service.js';

/**
 * Support Chat Controller
 * Handles HTTP requests for support chat
 */
export class SupportChatController {
  constructor(private service: SupportChatService) {}

  /**
   * @swagger
   * /api/support/chats:
   *   post:
   *     summary: Create a new support chat
   *     description: |
   *       Creates a new support chat conversation. User must provide name, email, and reason for support.
   *       The chat starts with status "active".
   *     tags: [Support Chat]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - name
   *               - email
   *               - reason
   *             properties:
   *               name:
   *                 type: string
   *                 example: "John Doe"
   *                 description: User's name for this support chat
   *               email:
   *                 type: string
   *                 format: email
   *                 example: "user@example.com"
   *                 description: User's email for this support chat
   *               reason:
   *                 type: string
   *                 example: "Payment Support"
   *                 description: Reason for contacting support (e.g., "Payment Support", "Account Issue", etc.)
   *     responses:
   *       201:
   *         description: Support chat created successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   type: object
   *                   properties:
   *                     id:
   *                       type: integer
   *                     name:
   *                       type: string
   *                     email:
   *                       type: string
   *                     reason:
   *                       type: string
   *                     status:
   *                       type: string
   *                       example: "active"
   *       400:
   *         description: Validation error
   *         $ref: '#/components/schemas/Error'
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async createChat(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const { name, email, reason } = req.body;

      if (!name || !email || !reason) {
        return res.status(400).json({
          success: false,
          message: 'Name, email, and reason are required',
        });
      }

      const chat = await this.service.createChat(userId, { name, email, reason });

      return res.status(201).json({
        success: true,
        data: chat,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create support chat',
      });
    }
  }

  /**
   * @swagger
   * /api/support/chats:
   *   get:
   *     summary: Get user's support chats
   *     description: |
   *       Get all support chats for the authenticated user with optional status filtering.
   *       Returns list of chats with last message and unread count.
   *     tags: [Support Chat]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [active, resolved, appealed, all]
   *           default: all
   *         description: Filter chats by status
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 50
   *         description: Maximum number of chats to return
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           default: 0
   *         description: Number of chats to skip for pagination
   *     responses:
   *       200:
   *         description: List of support chats
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       id:
   *                         type: integer
   *                       name:
   *                         type: string
   *                       email:
   *                         type: string
   *                       reason:
   *                         type: string
   *                       status:
   *                         type: string
   *                       unreadCount:
   *                         type: integer
   *                       lastMessage:
   *                         type: object
   *                         nullable: true
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async getUserChats(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const status = req.query.status as 'active' | 'resolved' | 'appealed' | 'all' | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;

      const chats = await this.service.getUserChats(userId, {
        status: status || 'all',
        limit,
        offset,
      });

      return res.json({
        success: true,
        data: chats,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to get support chats',
      });
    }
  }

  /**
   * @swagger
   * /api/support/chats/{id}:
   *   get:
   *     summary: Get support chat details with messages
   *     description: |
   *       Get full details of a support chat including all messages.
   *       Only the chat owner can view the chat.
   *     tags: [Support Chat]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Support chat ID
   *     responses:
   *       200:
   *         description: Chat details with messages
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   type: object
   *                   properties:
   *                     id:
   *                       type: integer
   *                     name:
   *                       type: string
   *                     email:
   *                       type: string
   *                     reason:
   *                       type: string
   *                     status:
   *                       type: string
   *                     messages:
   *                       type: array
   *                       items:
   *                         type: object
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   *       403:
   *         description: Forbidden - Not authorized to view this chat
   *         $ref: '#/components/schemas/Error'
   *       404:
   *         description: Chat not found
   *         $ref: '#/components/schemas/Error'
   */
  async getChatDetails(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { id } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const chat = await this.service.getChatDetails(id, userId);

      return res.json({
        success: true,
        data: chat,
      });
    } catch (error: any) {
      const status = error.message.includes('Unauthorized') ? 403 : error.message.includes('not found') ? 404 : 400;
      return res.status(status).json({
        success: false,
        message: error.message || 'Failed to get chat details',
      });
    }
  }

  /**
   * @swagger
   * /api/support/chats/{id}/messages:
   *   post:
   *     summary: Send a message in support chat
   *     description: |
   *       Send a message in a support chat. Only the chat owner can send messages.
   *       Messages cannot be sent in resolved or appealed chats.
   *     tags: [Support Chat]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Support chat ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - message
   *             properties:
   *               message:
   *                 type: string
   *                 minLength: 1
   *                 maxLength: 2000
   *                 example: "I need help with my transaction"
   *                 description: Message text content
   *     responses:
   *       201:
   *         description: Message sent successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   type: object
   *                   properties:
   *                     id:
   *                       type: integer
   *                     chatId:
   *                       type: integer
   *                     message:
   *                       type: string
   *                     senderId:
   *                       type: integer
   *                     createdAt:
   *                       type: string
   *                       format: date-time
   *       400:
   *         description: |
   *           Error. Common errors:
   *           - "Message is required"
   *           - "Chat not found"
   *           - "Cannot send messages in resolved chat"
   *         $ref: '#/components/schemas/Error'
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async sendMessage(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { id } = req.params;
      const { message } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!message || message.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Message is required',
        });
      }

      if (message.length > 2000) {
        return res.status(400).json({
          success: false,
          message: 'Message must not exceed 2000 characters',
        });
      }

      const chatMessage = await this.service.sendMessage(id, userId, message);

      return res.status(201).json({
        success: true,
        data: chatMessage,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to send message',
      });
    }
  }

  /**
   * @swagger
   * /api/support/chats/{id}/messages/read:
   *   put:
   *     summary: Mark messages as read
   *     description: |
   *       Mark all unread messages in a support chat as read.
   *       Only marks messages from support agents/admins (not user's own messages).
   *     tags: [Support Chat]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Support chat ID
   *     responses:
   *       200:
   *         description: Messages marked as read
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   type: object
   *                   properties:
   *                     message:
   *                       type: string
   *                       example: "Messages marked as read"
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async markMessagesAsRead(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { id } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const result = await this.service.markMessagesAsRead(id, userId);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to mark messages as read',
      });
    }
  }

  /**
   * @swagger
   * /api/support/chats/unread-count:
   *   get:
   *     summary: Get unread message count
   *     description: |
   *       Get total unread message count across all support chats for the user.
   *       Returns total count and breakdown by chat.
   *     tags: [Support Chat]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     responses:
   *       200:
   *         description: Unread message count
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   type: object
   *                   properties:
   *                     totalUnread:
   *                       type: integer
   *                       example: 5
   *                     unreadByChat:
   *                       type: object
   *                       additionalProperties:
   *                         type: integer
   *                       example:
   *                         "1": 2
   *                         "2": 3
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async getUnreadCount(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const result = await this.service.getUnreadCount(userId);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to get unread count',
      });
    }
  }
}

