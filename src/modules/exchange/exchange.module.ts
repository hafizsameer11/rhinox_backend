import { Router } from 'express';
import { type IModule } from '../../core/types/module.types.js';
import { ExchangeController } from './exchange.controller.js';
import { ExchangeService } from './exchange.service.js';

/**
 * Exchange Module
 * Handles currency exchange rates
 */
export class ExchangeModule implements IModule {
  public readonly name = 'exchange';
  public readonly path = '/api/exchange';
  public readonly router: Router;

  private controller: ExchangeController;
  private service: ExchangeService;

  constructor() {
    // Initialize dependencies
    this.service = new ExchangeService();
    this.controller = new ExchangeController(this.service);

    // Setup routes
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Public routes (no auth required)
    this.router.get('/rate', this.controller.getExchangeRate.bind(this.controller));
    this.router.get('/convert', this.controller.convertAmount.bind(this.controller));
    this.router.get('/rates', this.controller.getAllRates.bind(this.controller));
    this.router.get('/rates/:baseCurrency', this.controller.getRatesFromBase.bind(this.controller));
  }

  /**
   * Get admin router (separate from main router to require auth)
   */
  public getAdminRouter(): Router {
    const adminRouter = Router();
    adminRouter.post('/set-rate', this.controller.setRate.bind(this.controller));
    return adminRouter;
  }
}

