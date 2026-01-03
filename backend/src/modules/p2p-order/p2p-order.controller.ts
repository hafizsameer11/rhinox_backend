import { type Request, type Response } from 'express';
import { P2POrderService } from './p2p-order.service.js';

/**
 * P2P Order Controller
 * Handles HTTP requests for P2P orders
 */
export class P2POrderController {
  constructor(private service: P2POrderService) {}

  /**
   * @swagger
   * /api/p2p/ads/browse:
   *   get:
   *     summary: Browse all available P2P ads (public)
   *     description: |
   *       Get a list of all available P2P advertisements. This endpoint is public and does not require authentication.
   *       Users can filter ads by type (buy/sell), cryptocurrency, fiat currency, country, and price range.
   *       Results are paginated and sorted by creation date (newest first).
   *     tags: [P2P Order]
   *     parameters:
   *       - in: query
   *         name: type
   *         schema:
   *           type: string
   *           enum: [buy, sell]
   *         description: Filter by ad type. 'buy' = vendor wants to buy crypto, 'sell' = vendor wants to sell crypto.
   *       - in: query
   *         name: cryptoCurrency
   *         schema:
   *           type: string
   *         example: "USDT"
   *         description: Filter by cryptocurrency symbol (e.g., USDT, BTC, ETH).
   *       - in: query
   *         name: fiatCurrency
   *         schema:
   *           type: string
   *         example: "NGN"
   *         description: Filter by fiat currency code (e.g., NGN, USD, KES).
   *       - in: query
   *         name: countryCode
   *         schema:
   *           type: string
   *         example: "NG"
   *         description: Filter by ISO country code (2 letters, e.g., NG, KE, GH).
   *       - in: query
   *         name: minPrice
   *         schema:
   *           type: string
   *         example: "1500"
   *         description: Minimum price per unit of crypto in fiat currency.
   *       - in: query
   *         name: maxPrice
   *         schema:
   *           type: string
   *         example: "2000"
   *         description: Maximum price per unit of crypto in fiat currency.
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 50
   *         description: Maximum number of ads to return.
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           default: 0
   *         description: Number of ads to skip for pagination.
   *     responses:
   *       200:
   *         description: List of available P2P ads
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       id:
   *                         type: string
   *                         format: uuid
   *                       type:
   *                         type: string
   *                         enum: [buy, sell]
   *                       cryptoCurrency:
   *                         type: string
   *                         example: "USDT"
   *                       fiatCurrency:
   *                         type: string
   *                         example: "NGN"
   *                       price:
   *                         type: string
   *                         example: "1550.70"
   *                         description: Price per 1 unit of crypto
   *                       volume:
   *                         type: string
   *                         example: "99.00"
   *                         description: Total volume available
   *                       minOrder:
   *                         type: string
   *                         example: "1000.00"
   *                       maxOrder:
   *                         type: string
   *                         example: "75000.00"
   *                       autoAccept:
   *                         type: boolean
   *                       vendor:
   *                         type: object
   *                         properties:
   *                           id:
   *                             type: string
   *                           name:
   *                             type: string
   *                           email:
   *                             type: string
   *                           phone:
   *                             type: string
   *                       ordersReceived:
   *                         type: integer
   *                       responseTime:
   *                         type: integer
   *                         nullable: true
   *                       score:
   *                         type: string
   *                         nullable: true
   *                       isOnline:
   *                         type: boolean
   *       400:
   *         description: Invalid filter parameters
   *         $ref: '#/components/schemas/Error'
   */
  async browseAds(req: Request, res: Response) {
    try {
      const filters = {
        type: req.query.type as 'buy' | 'sell' | undefined,
        cryptoCurrency: req.query.cryptoCurrency as string | undefined,
        fiatCurrency: req.query.fiatCurrency as string | undefined,
        countryCode: req.query.countryCode as string | undefined,
        minPrice: req.query.minPrice as string | undefined,
        maxPrice: req.query.maxPrice as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
      };

      const ads = await this.service.browseAds(filters);

      return res.json({
        success: true,
        data: ads,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to browse ads',
      });
    }
  }

  /**
   * @swagger
   * /api/p2p/ads/{id}:
   *   get:
   *     summary: Get ad details (public)
   *     description: |
   *       Get detailed information about a specific P2P ad, including vendor information and accepted payment methods.
   *       This endpoint is public and does not require authentication.
   *     tags: [P2P Order]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Ad ID
   *     responses:
   *       200:
   *         description: Ad details with payment methods
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   type: object
   *                   properties:
   *                     id:
   *                       type: string
   *                     type:
   *                       type: string
   *                     cryptoCurrency:
   *                       type: string
   *                     fiatCurrency:
   *                       type: string
   *                     price:
   *                       type: string
   *                     volume:
   *                       type: string
   *                     minOrder:
   *                       type: string
   *                     maxOrder:
   *                       type: string
   *                     paymentMethods:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           id:
   *                             type: string
   *                           type:
   *                             type: string
   *                             enum: [bank_account, mobile_money]
   *                           bankName:
   *                             type: string
   *                             nullable: true
   *                           accountNumber:
   *                             type: string
   *                             nullable: true
   *                             description: Masked account number
   *                           accountName:
   *                             type: string
   *                             nullable: true
   *                           phoneNumber:
   *                             type: string
   *                             nullable: true
   *                             description: Masked phone number
   *                     vendor:
   *                       type: object
   *       404:
   *         description: Ad not found
   *         $ref: '#/components/schemas/Error'
   */
  async getAdDetails(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const ad = await this.service.getAdDetails(id);

      return res.json({
        success: true,
        data: ad,
      });
    } catch (error: any) {
      return res.status(404).json({
        success: false,
        message: error.message || 'Ad not found',
      });
    }
  }

  /**
   * @swagger
   * /api/p2p/orders:
   *   post:
   *     summary: Create order from ad
   *     description: |
   *       Create a new P2P order from an ad. User selects an ad, specifies the amount (crypto for sell orders, fiat for buy orders),
   *       and chooses a payment method. System validates ad availability, order limits, and balances.
   *       A chat thread is automatically initialized for communication between buyer and vendor.
   *     tags: [P2P Order]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - adId
   *               - paymentMethodId
   *             properties:
   *               adId:
   *                 type: string
   *                 format: uuid
   *                 example: "550e8400-e29b-41d4-a716-446655440000"
   *                 description: ID of the ad to create order from
   *               cryptoAmount:
   *                 type: string
   *                 example: "5.00"
   *                 description: |
   *                   Required for sell orders. Amount of cryptocurrency to sell.
   *                   Must be within ad's min/max order limits when converted to fiat.
   *               fiatAmount:
   *                 type: string
   *                 example: "10000.00"
   *                 description: |
   *                   Required for buy orders. Amount of fiat currency to spend.
   *                   Must be within ad's min/max order limits.
   *               paymentMethodId:
   *                 type: string
   *                 format: uuid
   *                 example: "550e8400-e29b-41d4-a716-446655440000"
   *                 description: |
   *                   Payment method ID from the ad's accepted payment methods.
   *                   Use GET /api/p2p/ads/:id to see available payment methods.
   *     responses:
   *       201:
   *         description: Order created successfully. Chat thread initialized.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   type: object
   *                   properties:
   *                     id:
   *                       type: string
   *                       format: uuid
   *                     status:
   *                       type: string
   *                       enum: [pending, awaiting_payment]
   *                       description: 'pending' if ad doesn't auto-accept, 'awaiting_payment' if auto-accept
   *                     cryptoAmount:
   *                       type: string
   *                     fiatAmount:
   *                       type: string
   *                     price:
   *                       type: string
   *                     buyer:
   *                       type: object
   *                     vendor:
   *                       type: object
   *       400:
   *         description: |
   *           Validation error. Common errors:
   *           - "Ad not found"
   *           - "Ad is not available"
   *           - "Vendor is offline"
   *           - "Payment method not accepted for this ad"
   *           - "Crypto amount is required for sell orders"
   *           - "Fiat amount is required for buy orders"
   *           - "Order amount must be at least X"
   *           - "Order amount must not exceed X"
   *           - "Vendor has insufficient crypto balance"
   *           - "Insufficient fiat balance"
   *         $ref: '#/components/schemas/Error'
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async createOrder(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId;
      const { adId, cryptoAmount, fiatAmount, paymentMethodId } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!adId || !paymentMethodId) {
        return res.status(400).json({
          success: false,
          message: 'Ad ID and payment method ID are required',
        });
      }

      const order = await this.service.createOrder(userId, {
        adId,
        cryptoAmount,
        fiatAmount,
        paymentMethodId,
      });

      return res.status(201).json({
        success: true,
        data: order,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create order',
      });
    }
  }

  /**
   * @swagger
   * /api/p2p/orders:
   *   get:
   *     summary: Get user's orders
   *     description: |
   *       Get all orders for the authenticated user. Can filter by role (buyer or vendor) and status.
   *       Returns orders where user is either the buyer or vendor.
   *     tags: [P2P Order]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: query
   *         name: role
   *         schema:
   *           type: string
   *           enum: [buyer, vendor]
   *         description: Filter by user's role in the order. If not specified, returns all orders.
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *         description: Filter by order status
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 50
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           default: 0
   *     responses:
   *       200:
   *         description: List of user's orders
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async getUserOrders(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const filters = {
        role: req.query.role as 'buyer' | 'vendor' | undefined,
        status: req.query.status as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
      };

      const orders = await this.service.getUserOrders(userId, filters);

      return res.json({
        success: true,
        data: orders,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to get orders',
      });
    }
  }

  /**
   * @swagger
   * /api/p2p/orders/{id}:
   *   get:
   *     summary: Get order details
   *     description: |
   *       Get detailed information about a specific order, including chat messages, payment method, and reviews.
   *       Only the buyer or vendor can view their order details.
   *     tags: [P2P Order]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Order details with chat and payment info
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: Order not found
   *         $ref: '#/components/schemas/Error'
   */
  async getOrderDetails(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId;
      const { id } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const order = await this.service.getOrderDetails(id, userId);

      return res.json({
        success: true,
        data: order,
      });
    } catch (error: any) {
      const status = error.message.includes('Unauthorized') ? 403 : 404;
      return res.status(status).json({
        success: false,
        message: error.message || 'Order not found',
      });
    }
  }

  /**
   * @swagger
   * /api/p2p/orders/{id}/confirm-payment:
   *   post:
   *     summary: Confirm payment made (buyer)
   *     description: |
   *       Buyer confirms they have made the payment to the vendor's account.
   *       Changes order status from 'awaiting_payment' to 'payment_made'.
   *       A notification message is sent to the vendor.
   *     tags: [P2P Order]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Payment confirmed. Status updated to 'payment_made'.
   *       400:
   *         description: |
   *           Error. Common errors:
   *           - "Only buyer can confirm payment"
   *           - "Cannot confirm payment. Current status: X"
   *         $ref: '#/components/schemas/Error'
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async confirmPayment(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId;
      const { id } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const result = await this.service.confirmPayment(id, userId);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to confirm payment',
      });
    }
  }

  /**
   * @swagger
   * /api/p2p/orders/{id}/mark-paid:
   *   post:
   *     summary: Mark payment as received (vendor)
   *     description: |
   *       Vendor confirms they have received the payment from the buyer.
   *       Changes order status from 'payment_made' to 'awaiting_coin_release', then automatically releases crypto to buyer.
   *       For buy orders, crypto is transferred from vendor to buyer. For sell orders, order is marked as completed.
   *     tags: [P2P Order]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Payment marked as received. Crypto released. Order completed.
   *       400:
   *         description: |
   *           Error. Common errors:
   *           - "Only vendor can mark payment as received"
   *           - "Cannot mark payment as received. Current status: X"
   *           - "Vendor has insufficient crypto balance"
   *         $ref: '#/components/schemas/Error'
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async markPaymentReceived(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId;
      const { id } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const result = await this.service.markPaymentReceived(id, userId);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to mark payment as received',
      });
    }
  }

  /**
   * @swagger
   * /api/p2p/orders/{id}/cancel:
   *   post:
   *     summary: Cancel order
   *     description: |
   *       Cancel an order. Only buyer or vendor can cancel.
   *       Can only cancel if order status is 'pending' or 'awaiting_payment'.
   *       A notification message is sent to the other party.
   *     tags: [P2P Order]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Order cancelled successfully
   *       400:
   *         description: |
   *           Error. Common errors:
   *           - "Unauthorized to cancel this order"
   *           - "Cannot cancel order. Current status: X"
   *         $ref: '#/components/schemas/Error'
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async cancelOrder(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId;
      const { id } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const result = await this.service.cancelOrder(id, userId);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to cancel order',
      });
    }
  }
}

