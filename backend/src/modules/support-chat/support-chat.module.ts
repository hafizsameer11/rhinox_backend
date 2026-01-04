import { Router } from 'express';
import { type IModule } from '../../core/types/module.types.js';
import { SupportChatController } from './support-chat.controller.js';
import { SupportChatService } from './support-chat.service.js';
import { authMiddleware } from '../../core/middleware/auth.middleware.js';

/**
 * Support Chat Module
 * Handles support chat conversations between users and support agents
 */
export class SupportChatModule implements IModule {
  public readonly name = 'support-chat';
  public readonly path = '/api/support';
  public readonly router: Router;

  private controller: SupportChatController;
  private service: SupportChatService;

  constructor() {
    // Initialize dependencies
    this.service = new SupportChatService();
    this.controller = new SupportChatController(this.service);

    // Setup routes
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // All routes require authentication
    this.router.post('/chats', authMiddleware, this.controller.createChat.bind(this.controller));
    this.router.get('/chats', authMiddleware, this.controller.getUserChats.bind(this.controller));
    this.router.get('/chats/:id', authMiddleware, this.controller.getChatDetails.bind(this.controller));
    this.router.post('/chats/:id/messages', authMiddleware, this.controller.sendMessage.bind(this.controller));
    this.router.put('/chats/:id/messages/read', authMiddleware, this.controller.markMessagesAsRead.bind(this.controller));
    this.router.get('/chats/unread-count', authMiddleware, this.controller.getUnreadCount.bind(this.controller));
  }
}

