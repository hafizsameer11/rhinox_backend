import { Router } from 'express';
import { type IModule } from '../../core/types/module.types.js';
import { authMiddleware } from '../../core/middleware/auth.middleware.js';
import { P2POrderController } from './p2p-order.controller.js';
import { P2POrderService } from './p2p-order.service.js';

/**
 * P2P Order Module
 * Handles P2P order management (browse ads, create orders, manage orders)
 */
export class P2POrderModule implements IModule {
  public readonly name = 'p2p-order';
  public readonly path = '/api/p2p';
  public readonly router: Router;

  private controller: P2POrderController;
  private service: P2POrderService;

  constructor() {
    // Initialize dependencies
    this.service = new P2POrderService();
    this.controller = new P2POrderController(this.service);

    // Setup routes
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // ============================================
    // PUBLIC ROUTES (No auth required)
    // ============================================
    this.router.get('/ads/browse', this.controller.browseAds.bind(this.controller));
    this.router.get('/ads/:id', this.controller.getAdDetails.bind(this.controller));

    // ============================================
    // USER ROUTES (Order creators - buyers/sellers)
    // ============================================
    
    // User browsing ads (separate buy/sell)
    this.router.get('/user/ads/buy', authMiddleware, this.controller.browseAdsToBuy.bind(this.controller));
    this.router.get('/user/ads/sell', authMiddleware, this.controller.browseAdsToSell.bind(this.controller));
    
    // User order management
    this.router.post('/user/orders', authMiddleware, this.controller.createOrder.bind(this.controller));
    this.router.get('/user/orders', authMiddleware, this.controller.getUserOrders.bind(this.controller));
    this.router.get('/user/orders/:id', authMiddleware, this.controller.getOrderDetails.bind(this.controller));
    this.router.post('/user/orders/:id/payment-made', authMiddleware, this.controller.confirmPayment.bind(this.controller));
    this.router.post('/user/orders/:id/payment-received', authMiddleware, this.controller.markPaymentReceivedUser.bind(this.controller));
    this.router.post('/user/orders/:id/cancel', authMiddleware, this.controller.cancelOrderUser.bind(this.controller));

    // ============================================
    // VENDOR ROUTES (Ad owners)
    // ============================================
    
    // Vendor order management
    this.router.get('/vendor/orders', authMiddleware, this.controller.getVendorOrders.bind(this.controller));
    this.router.get('/vendor/orders/:id', authMiddleware, this.controller.getOrderDetails.bind(this.controller));
    this.router.post('/vendor/orders/:id/accept', authMiddleware, this.controller.acceptOrder.bind(this.controller));
    this.router.post('/vendor/orders/:id/decline', authMiddleware, this.controller.declineOrder.bind(this.controller));
    this.router.post('/vendor/orders/:id/payment-received', authMiddleware, this.controller.markPaymentReceived.bind(this.controller));
    this.router.post('/vendor/orders/:id/payment-made', authMiddleware, this.controller.markPaymentMade.bind(this.controller));
    this.router.post('/vendor/orders/:id/cancel', authMiddleware, this.controller.cancelOrderVendor.bind(this.controller));

    // ============================================
    // LEGACY ROUTES (Backward compatibility)
    // ============================================
    this.router.post('/orders', authMiddleware, this.controller.createOrder.bind(this.controller));
    this.router.get('/orders', authMiddleware, this.controller.getUserOrders.bind(this.controller));
    this.router.get('/orders/:id', authMiddleware, this.controller.getOrderDetails.bind(this.controller));
    this.router.post('/orders/:id/vendor/accept', authMiddleware, this.controller.acceptOrder.bind(this.controller));
    this.router.post('/orders/:id/vendor/decline', authMiddleware, this.controller.declineOrder.bind(this.controller));
    this.router.post('/orders/:id/vendor/payment-received', authMiddleware, this.controller.markPaymentReceived.bind(this.controller));
    this.router.post('/orders/:id/buyer/payment-made', authMiddleware, this.controller.confirmPayment.bind(this.controller));
    this.router.post('/orders/:id/cancel', authMiddleware, this.controller.cancelOrder.bind(this.controller));
    this.router.post('/orders/:id/accept', authMiddleware, this.controller.acceptOrder.bind(this.controller));
    this.router.post('/orders/:id/decline', authMiddleware, this.controller.declineOrder.bind(this.controller));
    this.router.post('/orders/:id/confirm-payment', authMiddleware, this.controller.confirmPayment.bind(this.controller));
    this.router.post('/orders/:id/mark-paid', authMiddleware, this.controller.markPaymentReceived.bind(this.controller));
  }
}

