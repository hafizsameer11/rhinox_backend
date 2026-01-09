import { type Request, type Response } from 'express';
import { NotificationService } from './notification.service.js';

/**
 * Notification Controller
 * Handles HTTP requests for user notifications
 */
export class NotificationController {
  constructor(private service: NotificationService) {}

  /**
   * @swagger
   * /api/notifications:
   *   get:
   *     summary: Get all user notifications
   *     description: Retrieves all notifications for the authenticated user, with optional filters
   *     tags: [Notifications]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: query
   *         name: type
   *         schema:
   *           type: string
   *           enum: [transaction, p2p, conversion, general, promotional]
   *         description: Filter by notification type
   *       - in: query
   *         name: isRead
   *         schema:
   *           type: boolean
   *         description: Filter by read status
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 50
   *         description: Maximum number of notifications to return
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           default: 0
   *         description: Number of notifications to skip
   *     responses:
   *       200:
   *         description: List of notifications
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
   *                         example: 1
   *                       type:
   *                         type: string
   *                         example: "transaction"
   *                       title:
   *                         type: string
   *                         example: "Bank Transfer Successful"
   *                       message:
   *                         type: string
   *                         example: "Your bank transfer of ₦50,000 was successful"
   *                       status:
   *                         type: string
   *                         example: "success"
   *                       amount:
   *                         type: string
   *                         example: "50000"
   *                       currency:
   *                         type: string
   *                         example: "NGN"
   *                       reference:
   *                         type: string
   *                         example: "TXN123456"
   *                       link:
   *                         type: string
   *                         example: "/transactions/123"
   *                       isRead:
   *                         type: boolean
   *                         example: false
   *                       readAt:
   *                         type: string
   *                         nullable: true
   *                         format: date-time
   *                       metadata:
   *                         type: object
   *                       createdAt:
   *                         type: string
   *                         format: date-time
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async getNotifications(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const { type, isRead, limit, offset } = req.query;

      const filters: any = {};
      if (type) filters.type = type;
      if (isRead !== undefined) filters.isRead = isRead === 'true';
      if (limit) filters.limit = parseInt(limit as string, 10);
      if (offset) filters.offset = parseInt(offset as string, 10);

      const notifications = await this.service.getUserNotifications(userId, filters);

      return res.json({
        success: true,
        data: notifications,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get notifications',
      });
    }
  }

  /**
   * @swagger
   * /api/notifications/unread-count:
   *   get:
   *     summary: Get unread notification count
   *     description: Returns the number of unread notifications for the authenticated user
   *     tags: [Notifications]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     responses:
   *       200:
   *         description: Unread notification count
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
   *                     count:
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

      const count = await this.service.getUnreadCount(userId);

      return res.json({
        success: true,
        data: { count },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get unread count',
      });
    }
  }

  /**
   * @swagger
   * /api/notifications/{id}/read:
   *   put:
   *     summary: Mark notification as read
   *     description: Marks a specific notification as read
   *     tags: [Notifications]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Notification ID
   *     responses:
   *       200:
   *         description: Notification marked as read
   *       404:
   *         description: Notification not found
   *         $ref: '#/components/schemas/Error'
   */
  async markAsRead(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { id } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Notification ID is required',
        });
      }

      const result = await this.service.markAsRead(userId.toString(), id);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(404).json({
        success: false,
        message: error.message || 'Failed to mark notification as read',
      });
    }
  }

  /**
   * @swagger
   * /api/notifications/read-all:
   *   put:
   *     summary: Mark all notifications as read
   *     description: Marks all unread notifications as read for the authenticated user
   *     tags: [Notifications]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     responses:
   *       200:
   *         description: All notifications marked as read
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async markAllAsRead(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const result = await this.service.markAllAsRead(userId);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to mark all notifications as read',
      });
    }
  }

  /**
   * @swagger
   * /api/notifications/{id}:
   *   delete:
   *     summary: Delete a notification
   *     description: Deletes a specific notification
   *     tags: [Notifications]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Notification ID
   *     responses:
   *       200:
   *         description: Notification deleted successfully
   *       404:
   *         description: Notification not found
   *         $ref: '#/components/schemas/Error'
   */
  async deleteNotification(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { id } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Notification ID is required',
        });
      }

      const result = await this.service.deleteNotification(userId.toString(), id);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(404).json({
        success: false,
        message: error.message || 'Failed to delete notification',
      });
    }
  }
}

