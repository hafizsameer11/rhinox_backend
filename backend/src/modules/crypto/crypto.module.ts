import { Router } from 'express';
import { type IModule } from '../../core/types/module.types.js';
import { CryptoController } from './crypto.controller.js';
import { CryptoService } from './crypto.service.js';
import { WebhookController } from './webhook.controller.js';

/**
 * Crypto Module
 * Handles cryptocurrency operations
 */
export class CryptoModule implements IModule {
  public readonly name = 'crypto';
  public readonly path = '/api/crypto';
  public readonly router: Router;

  private controller: CryptoController;
  private service: CryptoService;
  private webhookController: WebhookController;

  constructor() {
    // Initialize dependencies
    this.service = new CryptoService();
    this.controller = new CryptoController(this.service);
    this.webhookController = new WebhookController();

    // Setup routes
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Protected routes (require authentication)
    this.router.get('/virtual-accounts', this.controller.getVirtualAccounts.bind(this.controller));
    this.router.get('/deposit-address/:currency/:blockchain', this.controller.getDepositAddress.bind(this.controller));
  }

  /**
   * Get public router (no auth required for token listings)
   */
  public getPublicRouter(): Router {
    const publicRouter = Router();
    publicRouter.get('/usdt-tokens', this.controller.getUSDTTokens.bind(this.controller));
    publicRouter.get('/tokens/:symbol', this.controller.getTokensBySymbol.bind(this.controller));
    return publicRouter;
  }

  /**
   * Get webhook router (separate from main router to avoid auth)
   */
  public getWebhookRouter(): Router {
    const webhookRouter = Router();
    webhookRouter.post('/tatum', this.webhookController.handleWebhook.bind(this.webhookController));
    return webhookRouter;
  }
}

