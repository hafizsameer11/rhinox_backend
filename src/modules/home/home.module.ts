import { Router } from 'express';
import { type IModule } from '../../core/types/module.types.js';
import { HomeController } from './home.controller.js';
import { HomeService } from './home.service.js';

/**
 * Home Module
 * Handles user home/dashboard data
 */
export class HomeModule implements IModule {
  public readonly name = 'home';
  public readonly path = '/api/home';
  public readonly router: Router;

  private controller: HomeController;
  private service: HomeService;

  constructor() {
    // Initialize dependencies
    this.service = new HomeService();
    this.controller = new HomeController(this.service);

    // Setup routes
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Home routes (all require authentication)
    this.router.get('/', this.controller.getUserHome.bind(this.controller));
    this.router.get('/wallets', this.controller.getWalletBalances.bind(this.controller));
  }
}

