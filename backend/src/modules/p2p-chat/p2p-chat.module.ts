import { Router } from 'express';
import { type IModule } from '../../core/types/module.types.js';
import { P2PChatController } from './p2p-chat.controller.js';
import { P2PChatService } from './p2p-chat.service.js';

/**
 * P2P Chat Module
 * Handles chat messages between buyer and vendor for orders
 */
export class P2PChatModule implements IModule {
  public readonly name = 'p2p-chat';
  public readonly path = '/api/p2p';
  public readonly router: Router;

  private controller: P2PChatController;
  private service: P2PChatService;

  constructor() {
    // Initialize dependencies
    this.service = new P2PChatService();
    this.controller = new P2PChatController(this.service);

    // Setup routes
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // All routes require authentication
    this.router.post('/orders/:orderId/messages', this.controller.sendMessage.bind(this.controller));
    this.router.get('/orders/:orderId/messages', this.controller.getChatMessages.bind(this.controller));
    this.router.put('/orders/:orderId/messages/read', this.controller.markAsRead.bind(this.controller));
    this.router.get('/chat/unread-count', this.controller.getUnreadCount.bind(this.controller));
  }
}

