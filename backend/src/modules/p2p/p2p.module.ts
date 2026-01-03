import { Router } from 'express';
import { type IModule } from '../../core/types/module.types.js';
import { P2PController } from './p2p.controller.js';
import { P2PService } from './p2p.service.js';

/**
 * P2P Module
 * Handles P2P trading advertisements (buy/sell ads)
 */
export class P2PModule implements IModule {
  public readonly name = 'p2p';
  public readonly path = '/api/p2p';
  public readonly router: Router;

  private controller: P2PController;
  private service: P2PService;

  constructor() {
    // Initialize dependencies
    this.service = new P2PService();
    this.controller = new P2PController(this.service);

    // Setup routes
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Create ads
    this.router.post('/ads/buy', this.controller.createBuyAd.bind(this.controller));
    this.router.post('/ads/sell', this.controller.createSellAd.bind(this.controller));
    
    // Get ads
    this.router.get('/ads', this.controller.getUserAds.bind(this.controller));
    this.router.get('/ads/:id', this.controller.getAd.bind(this.controller));
    
    // Update ad status
    this.router.put('/ads/:id/status', this.controller.updateAdStatus.bind(this.controller));
    
    // Update/edit ad
    this.router.put('/ads/:id', this.controller.updateAd.bind(this.controller));
  }
}

