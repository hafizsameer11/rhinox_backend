import { Router } from 'express';
import { type IModule } from '../../core/types/module.types.js';
import { WalletController } from './wallet.controller.js';
import { WalletService } from './wallet.service.js';

/**
 * Wallet Module
 * Handles wallet creation, balance management, and wallet operations
 */
export class WalletModule implements IModule {
  public readonly name = 'wallet';
  public readonly path = '/api/wallets';
  public readonly router: Router;

  private controller: WalletController;
  private service: WalletService;

  constructor() {
    // Initialize dependencies
    this.service = new WalletService();
    this.controller = new WalletController(this.service);

    // Setup routes
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Wallet routes
    this.router.get('/balances', this.controller.getAllBalances.bind(this.controller));
    this.router.get('/', this.controller.getUserWallets.bind(this.controller));
    this.router.get('/:currency', this.controller.getWalletByCurrency.bind(this.controller));
    this.router.post('/create', this.controller.createWallet.bind(this.controller));
    this.router.get('/:walletId/balance', this.controller.getBalance.bind(this.controller));
    this.router.get('/:walletId/transactions', this.controller.getTransactions.bind(this.controller));
  }
}

