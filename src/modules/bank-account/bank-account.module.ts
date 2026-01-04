import { Router } from 'express';
import { type IModule } from '../../core/types/module.types.js';
import { BankAccountController } from './bank-account.controller.js';
import { BankAccountService } from './bank-account.service.js';

/**
 * Bank Account Module
 * Handles public bank account information for deposits
 */
export class BankAccountModule implements IModule {
  public readonly name = 'bank-account';
  public readonly path = '/api/bank-accounts';
  public readonly router: Router;

  private controller: BankAccountController;
  private service: BankAccountService;

  constructor() {
    // Initialize dependencies
    this.service = new BankAccountService();
    this.controller = new BankAccountController(this.service);

    // Setup routes
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Public route - no authentication required
    this.router.get('/', this.controller.getBankAccounts.bind(this.controller));
  }
}

