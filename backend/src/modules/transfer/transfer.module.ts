import { Router } from 'express';
import { type IModule } from '../../core/types/module.types.js';
import { TransferController } from './transfer.controller.js';
import { TransferService } from './transfer.service.js';

/**
 * Transfer Module
 * Handles fiat transfers (RhionX user, bank account, mobile money)
 */
export class TransferModule implements IModule {
  public readonly name = 'transfer';
  public readonly path = '/api/transfer';
  public readonly router: Router;

  private controller: TransferController;
  private service: TransferService;

  constructor() {
    // Initialize dependencies
    this.service = new TransferService();
    this.controller = new TransferController(this.service);

    // Setup routes
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Transfer routes (all require authentication)
    this.router.get('/eligibility', this.controller.checkEligibility.bind(this.controller));
    this.router.post('/initiate', this.controller.initiateTransfer.bind(this.controller));
    this.router.post('/verify', this.controller.verifyTransfer.bind(this.controller));
    this.router.get('/receipt/:transactionId', this.controller.getReceipt.bind(this.controller));
  }
}


