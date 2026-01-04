import { type Request, type Response } from 'express';
import { P2PChatService } from './p2p-chat.service.js';

/**
 * P2P Chat Controller
 * Handles HTTP requests for P2P order chat
 */
export class P2PChatController {
  constructor(private service: P2PChatService) {}

  /**
   * @swagger
   * /api/p2p/orders/{orderId}/messages:
   *   post:
   *     summary: Send message in order chat
   *     description: |
   *       Send a message in the chat thread for a P2P order. Only the buyer or vendor of the order can send messages.
   *       Messages are automatically delivered to the other party.
   *     tags: [P2P Chat]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: orderId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Order ID
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
   *                 example: "Hello, I have made the payment. Please confirm receipt."
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
   *                       type: string
   *                       format: uuid
   *                     orderId:
   *                       type: string
   *                     senderId:
   *                       type: string
   *                     sender:
   *                       type: object
   *                       properties:
   *                         id:
   *                           type: string
   *                         firstName:
   *                           type: string
   *                         lastName:
   *                           type: string
   *                     receiverId:
   *                       type: string
   *                     message:
   *                       type: string
   *                     isRead:
   *                       type: boolean
   *                       example: false
   *                     createdAt:
   *                       type: string
   *                       format: date-time
   *       400:
   *         description: |
   *           Error. Common errors:
   *           - "Order not found"
   *           - "Unauthorized to send message in this order"
   *           - "Message is required"
   *         $ref: '#/components/schemas/Error'
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async sendMessage(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { orderId } = req.params;
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

      const chatMessage = await this.service.sendMessage(orderId, userId, message.trim());

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
   * /api/p2p/orders/{orderId}/messages:
   *   get:
   *     summary: Get chat messages for an order
   *     description: |
   *       Get all chat messages for a P2P order. Only the buyer or vendor can view messages.
   *       Messages are returned in chronological order (oldest first).
   *     tags: [P2P Chat]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: orderId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Order ID
   *     responses:
   *       200:
   *         description: List of chat messages
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
   *                         type: string
   *                       orderId:
   *                         type: string
   *                       senderId:
   *                         type: string
   *                       sender:
   *                         type: object
   *                       receiverId:
   *                         type: string
   *                       message:
   *                         type: string
   *                       isRead:
   *                         type: boolean
   *                       readAt:
   *                         type: string
   *                         format: date-time
   *                         nullable: true
   *                       createdAt:
   *                         type: string
   *                         format: date-time
   *       400:
   *         description: |
   *           Error. Common errors:
   *           - "Order not found"
   *           - "Unauthorized to view messages for this order"
   *         $ref: '#/components/schemas/Error'
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async getChatMessages(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { orderId } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const messages = await this.service.getChatMessages(orderId, userId);

      return res.json({
        success: true,
        data: messages,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to get messages',
      });
    }
  }

  /**
   * @swagger
   * /api/p2p/orders/{orderId}/messages/read:
   *   put:
   *     summary: Mark messages as read
   *     description: |
   *       Mark all unread messages in an order chat as read. Only the buyer or vendor can mark messages as read.
   *       This updates all messages sent to the authenticated user that are currently unread.
   *     tags: [P2P Chat]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: orderId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Order ID
   *     responses:
   *       200:
   *         description: Messages marked as read
   *       400:
   *         description: |
   *           Error. Common errors:
   *           - "Order not found"
   *           - "Unauthorized to mark messages as read for this order"
   *         $ref: '#/components/schemas/Error'
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async markAsRead(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { orderId } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const result = await this.service.markAsRead(orderId, userId);

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
   * /api/p2p/chat/unread-count:
   *   get:
   *     summary: Get unread message count
   *     description: |
   *       Get the total number of unread messages across all orders for the authenticated user.
   *       Useful for displaying notification badges.
   *     tags: [P2P Chat]
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
   *                     unreadCount:
   *                       type: integer
   *                       example: 5
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

