import { Router } from 'express';
import { type IModule } from '../../core/types/module.types.js';
import { TransactionHistoryController } from './transaction-history.controller.js';
import { TransactionHistoryService } from './transaction-history.service.js';

/**
 * Transaction History Module
 * Handles transaction history with chart data and filtering
 */
export class TransactionHistoryModule implements IModule {
  public readonly name = 'transaction-history';
  public readonly path = '/api/transaction-history';
  public readonly router: Router;

  private controller: TransactionHistoryController;
  private service: TransactionHistoryService;

  constructor() {
    // Initialize dependencies
    this.service = new TransactionHistoryService();
    this.controller = new TransactionHistoryController(this.service);

    // Setup routes
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Transaction history routes
    this.router.get('/', this.controller.getTransactionHistory.bind(this.controller));
    this.router.get('/deposits', this.controller.getFiatDeposits.bind(this.controller));
    this.router.get('/withdrawals', this.controller.getFiatWithdrawals.bind(this.controller));
    this.router.get('/p2p', this.controller.getFiatP2PTransactions.bind(this.controller));
    this.router.get('/:id/details', this.controller.getTransactionDetails.bind(this.controller));
  }
}

