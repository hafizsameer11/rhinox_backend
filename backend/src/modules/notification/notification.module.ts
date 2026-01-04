import { Router } from 'express';
import { type IModule } from '../../core/types/module.types.js';
import { NotificationController } from './notification.controller.js';
import { NotificationService } from './notification.service.js';

/**
 * Notification Module
 * Handles user notifications for transactions, P2P, conversions, etc.
 */
export class NotificationModule implements IModule {
  public readonly name = 'notification';
  public readonly path = '/api/notifications';
  public readonly router: Router;

  private controller: NotificationController;
  private service: NotificationService;

  constructor() {
    // Initialize dependencies
    this.service = new NotificationService();
    this.controller = new NotificationController(this.service);

    // Setup routes
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Get all notifications
    this.router.get('/', this.controller.getNotifications.bind(this.controller));
    
    // Get unread count
    this.router.get('/unread-count', this.controller.getUnreadCount.bind(this.controller));
    
    // Mark all as read
    this.router.put('/read-all', this.controller.markAllAsRead.bind(this.controller));
    
    // Mark single notification as read
    this.router.put('/:id/read', this.controller.markAsRead.bind(this.controller));
    
    // Delete notification
    this.router.delete('/:id', this.controller.deleteNotification.bind(this.controller));
  }
}

