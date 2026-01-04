import { Router } from 'express';
import { type IModule } from '../../core/types/module.types.js';
import { DepositController } from './deposit.controller.js';
import { DepositService } from './deposit.service.js';

/**
 * Deposit Module
 * Handles fiat wallet deposits
 */
export class DepositModule implements IModule {
  public readonly name = 'deposit';
  public readonly path = '/api/deposit';
  public readonly router: Router;

  private controller: DepositController;
  private service: DepositService;

  constructor() {
    // Initialize dependencies
    this.service = new DepositService();
    this.controller = new DepositController(this.service);

    // Setup routes
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Deposit routes (all require authentication)
    this.router.get('/mobile-money-providers', this.controller.getMobileMoneyProviders.bind(this.controller));
    this.router.get('/bank-details', this.controller.getBankDetails.bind(this.controller));
    this.router.post('/initiate', this.controller.initiateDeposit.bind(this.controller));
    this.router.post('/confirm', this.controller.confirmDeposit.bind(this.controller));
    this.router.get('/receipt/:transactionId', this.controller.getReceipt.bind(this.controller));
  }
}

