import { Router } from 'express';
import { type IModule } from '../../core/types/module.types.js';
import { authMiddleware } from '../../core/middleware/auth.middleware.js';
import { P2PReviewController } from './p2p-review.controller.js';
import { P2PReviewService } from './p2p-review.service.js';

/**
 * P2P Review Module
 * Handles reviews left by users after order completion
 */
export class P2PReviewModule implements IModule {
  public readonly name = 'p2p-review';
  public readonly path = '/api/p2p';
  public readonly router: Router;

  private controller: P2PReviewController;
  private service: P2PReviewService;

  constructor() {
    // Initialize dependencies
    this.service = new P2PReviewService();
    this.controller = new P2PReviewController(this.service);

    // Setup routes
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Public routes (no auth required for viewing reviews)
    this.router.get('/vendors/:vendorId/reviews', this.controller.getVendorReviews.bind(this.controller));
    this.router.get('/ads/:adId/reviews', this.controller.getAdReviews.bind(this.controller));

    // Protected routes (auth required for creating/updating/deleting)
    this.router.post('/orders/:orderId/review', authMiddleware, this.controller.createReview.bind(this.controller));
    this.router.put('/reviews/:id', authMiddleware, this.controller.updateReview.bind(this.controller));
    this.router.delete('/reviews/:id', authMiddleware, this.controller.deleteReview.bind(this.controller));
  }
}

