import { Router } from 'express';
import { type IModule } from '../../core/types/module.types.js';
import { ConversionController } from './conversion.controller.js';
import { ConversionService } from './conversion.service.js';

/**
 * Conversion Module
 * Handles currency conversion between fiat wallets
 */
export class ConversionModule implements IModule {
  public readonly name = 'conversion';
  public readonly path = '/api/conversion';
  public readonly router: Router;

  private controller: ConversionController;
  private service: ConversionService;

  constructor() {
    // Initialize dependencies
    this.service = new ConversionService();
    this.controller = new ConversionController(this.service);

    // Setup routes
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Conversion routes (all require authentication)
    this.router.get('/calculate', this.controller.calculateConversion.bind(this.controller));
    this.router.post('/initiate', this.controller.initiateConversion.bind(this.controller));
    this.router.post('/confirm', this.controller.confirmConversion.bind(this.controller));
    this.router.get('/receipt/:conversionReference', this.controller.getReceipt.bind(this.controller));
  }
}

