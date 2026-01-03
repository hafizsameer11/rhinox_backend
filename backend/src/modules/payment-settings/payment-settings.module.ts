import { Router } from 'express';
import { type IModule } from '../../core/types/module.types.js';
import { PaymentSettingsController } from './payment-settings.controller.js';
import { PaymentSettingsService } from './payment-settings.service.js';

/**
 * Payment Settings Module
 * Handles user payment method management (bank accounts, mobile money)
 */
export class PaymentSettingsModule implements IModule {
  public readonly name = 'payment-settings';
  public readonly path = '/api/payment-settings';
  public readonly router: Router;

  private controller: PaymentSettingsController;
  private service: PaymentSettingsService;

  constructor() {
    // Initialize dependencies
    this.service = new PaymentSettingsService();
    this.controller = new PaymentSettingsController(this.service);

    // Setup routes
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Get all payment methods
    this.router.get('/', this.controller.getPaymentMethods.bind(this.controller));
    
    // Get mobile money providers (public, but requires auth for consistency)
    this.router.get('/mobile-money-providers', this.controller.getMobileMoneyProviders.bind(this.controller));
    
    // Add payment methods
    this.router.post('/bank-account', this.controller.addBankAccount.bind(this.controller));
    this.router.post('/mobile-money', this.controller.addMobileMoney.bind(this.controller));
    
    // Get single payment method
    this.router.get('/:id', this.controller.getPaymentMethod.bind(this.controller));
    
    // Update payment method
    this.router.put('/:id', this.controller.updatePaymentMethod.bind(this.controller));
    
    // Set default payment method
    this.router.post('/:id/set-default', this.controller.setDefaultPaymentMethod.bind(this.controller));
    
    // Delete payment method
    this.router.delete('/:id', this.controller.deletePaymentMethod.bind(this.controller));
  }
}

