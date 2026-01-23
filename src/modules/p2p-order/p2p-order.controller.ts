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
   *     summary: "[PUBLIC] Browse P2P ads - Market listing"
   *     description: |
   *       **UI Flow: P2P Market → Browse Ads**
   *       
   *       Get a list of all available P2P advertisements. This endpoint is public and does not require authentication.
   *       Users can filter ads by type (buy/sell), cryptocurrency, fiat currency, country, and price range.
   *       
   *       **Important - API Visibility:**
   *       - When user filters by `type=buy`: Shows vendor SELL ads (user can buy from vendor)
   *       - When user filters by `type=sell`: Shows vendor BUY ads (user can sell to vendor)
   *       - Response includes `userAction` field showing what action user can take (buy/sell)
   *       
   *       **Response includes:**
   *       - `type`: Original ad type (for internal use)
   *       - `userAction`: What user sees (buy/sell) - use this for UI labels
   *       - Vendor information, prices, limits, payment methods
   *       
   *       Results are paginated and sorted by creation date (newest first).
     *     tags: ["P2P - PUBLIC"]
   *     parameters:
   *       - in: query
   *         name: type
   *         schema:
   *           type: string
   *           enum: [buy, sell]
   *         description: |
   *           Filter by user action (what user wants to do).
   *           - "buy": Show ads where user can BUY crypto (vendor SELL ads)
   *           - "sell": Show ads where user can SELL crypto (vendor BUY ads)
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
   *                         type: integer
   *                         example: 1
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
        ...(req.query.type && { type: req.query.type as 'buy' | 'sell' }),
        ...(req.query.cryptoCurrency && { cryptoCurrency: req.query.cryptoCurrency as string }),
        ...(req.query.fiatCurrency && { fiatCurrency: req.query.fiatCurrency as string }),
        ...(req.query.countryCode && { countryCode: req.query.countryCode as string }),
        ...(req.query.minPrice && { minPrice: req.query.minPrice as string }),
        ...(req.query.maxPrice && { maxPrice: req.query.maxPrice as string }),
        ...(req.query.limit && { limit: parseInt(req.query.limit as string, 10) }),
        ...(req.query.offset && { offset: parseInt(req.query.offset as string, 10) }),
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
   *     summary: "[PUBLIC] Get ad details - View ad before creating order"
   *     description: |
   *       **UI Flow: Browse Ads → Select Ad → View Details**
   *       
   *       Get detailed information about a specific P2P ad, including:
   *       - Vendor information and reputation
   *       - Accepted payment methods (with masked account details)
   *       - Price, limits, available quantity
   *       - Processing time and response time
   *       
   *       **Response includes:**
   *       - `type`: Original ad type (for internal use)
   *       - `userAction`: What user can do (buy/sell) - use this for UI labels
   *       - `paymentMethods`: List of vendor's accepted payment methods (for display only)
   *       
   *       **IMPORTANT - Payment Method Selection:**
   *       - The `paymentMethods` array contains the VENDOR's payment methods
   *       - Users must select their OWN payment method that matches one of these types
   *       - For RhinoxPay ID: User needs their own RhinoxPay ID payment method
   *       - For bank accounts: User needs a bank account with the same bank name
   *       - For mobile money: User needs mobile money with the same provider
   *       - DO NOT use the vendor's payment method IDs when creating an order
   *       - Use GET /api/payment-settings to get user's own payment methods
   *       
   *       This endpoint is public and does not require authentication.
   *       Use this to display ad details before user creates an order.
     *     tags: ["P2P - PUBLIC"]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         example: 1
   *         description: Ad ID
   *     responses:
   *       200:
   *         description: Ad details with payment methods and userAction field
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

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Ad ID is required',
        });
      }

      // Reject common route names that might accidentally match
      if (id === 'browse' || id === 'buy' || id === 'sell') {
        return res.status(404).json({
          success: false,
          message: 'Invalid ad ID. Did you mean to use /api/p2p/ads/browse?',
        });
      }

      const ad = await this.service.getAdDetails(id);

      return res.json({
        success: true,
        data: ad,
      });
    } catch (error: any) {
      // Check if it's a validation error (invalid ID format)
      if (error.message && error.message.includes('Invalid ad ID format')) {
        return res.status(404).json({
          success: false,
          message: 'Invalid ad ID format. Ad ID must be a number.',
        });
      }
      return res.status(404).json({
        success: false,
        message: error.message || 'Ad not found',
      });
    }
  }

  /**
   * @swagger
   * /api/p2p/user/ads/buy:
   *   get:
   *     summary: "[USER] Browse ads to BUY crypto"
   *     description: |
   *       **UI Flow: User wants to BUY crypto → Shows vendor SELL ads**
   *       
   *       Get list of ads where user can BUY crypto. This shows vendor SELL ads.
   *       - Vendor SELL ad = User can BUY
   *       - Response includes `userAction: "buy"` for all ads
   *       
   *       **Use this for:** "Buy" tab in P2P market
   *     tags: ["P2P - USER (Browse & Order)"]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: query
   *         name: cryptoCurrency
   *         schema:
   *           type: string
   *         example: "USDT"
   *       - in: query
   *         name: fiatCurrency
   *         schema:
   *           type: string
   *         example: "NGN"
   *       - in: query
   *         name: countryCode
   *         schema:
   *           type: string
   *         example: "NG"
   *       - in: query
   *         name: minPrice
   *         schema:
   *           type: string
   *       - in: query
   *         name: maxPrice
   *         schema:
   *           type: string
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
   *         description: List of ads where user can BUY crypto (vendor SELL ads)
   *       401:
   *         description: Unauthorized
   */
  async browseAdsToBuy(req: Request, res: Response) {
    try {
      const filters = {
        type: 'buy' as const, // User wants to buy = show vendor sell ads
        ...(req.query.cryptoCurrency && { cryptoCurrency: req.query.cryptoCurrency as string }),
        ...(req.query.fiatCurrency && { fiatCurrency: req.query.fiatCurrency as string }),
        ...(req.query.countryCode && { countryCode: req.query.countryCode as string }),
        ...(req.query.minPrice && { minPrice: req.query.minPrice as string }),
        ...(req.query.maxPrice && { maxPrice: req.query.maxPrice as string }),
        ...(req.query.limit && { limit: parseInt(req.query.limit as string, 10) }),
        ...(req.query.offset && { offset: parseInt(req.query.offset as string, 10) }),
      };

      const ads = await this.service.browseAds(filters);

      return res.json({
        success: true,
        data: ads,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to browse buy ads',
      });
    }
  }

  /**
   * @swagger
   * /api/p2p/user/ads/sell:
   *   get:
   *     summary: "[USER] Browse ads to SELL crypto"
   *     description: |
   *       **UI Flow: User wants to SELL crypto → Shows vendor BUY ads**
   *       
   *       Get list of ads where user can SELL crypto. This shows vendor BUY ads.
   *       - Vendor BUY ad = User can SELL
   *       - Response includes `userAction: "sell"` for all ads
   *       
   *       **Use this for:** "Sell" tab in P2P market
   *     tags: ["P2P - USER (Browse & Order)"]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: query
   *         name: cryptoCurrency
   *         schema:
   *           type: string
   *         example: "USDT"
   *       - in: query
   *         name: fiatCurrency
   *         schema:
   *           type: string
   *         example: "NGN"
   *       - in: query
   *         name: countryCode
   *         schema:
   *           type: string
   *         example: "NG"
   *       - in: query
   *         name: minPrice
   *         schema:
   *           type: string
   *       - in: query
   *         name: maxPrice
   *         schema:
   *           type: string
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
   *         description: List of ads where user can SELL crypto (vendor BUY ads)
   *       401:
   *         description: Unauthorized
   */
  async browseAdsToSell(req: Request, res: Response) {
    try {
      const filters = {
        type: 'sell' as const, // User wants to sell = show vendor buy ads
        ...(req.query.cryptoCurrency && { cryptoCurrency: req.query.cryptoCurrency as string }),
        ...(req.query.fiatCurrency && { fiatCurrency: req.query.fiatCurrency as string }),
        ...(req.query.countryCode && { countryCode: req.query.countryCode as string }),
        ...(req.query.minPrice && { minPrice: req.query.minPrice as string }),
        ...(req.query.maxPrice && { maxPrice: req.query.maxPrice as string }),
        ...(req.query.limit && { limit: parseInt(req.query.limit as string, 10) }),
        ...(req.query.offset && { offset: parseInt(req.query.offset as string, 10) }),
      };

      const ads = await this.service.browseAds(filters);

      return res.json({
        success: true,
        data: ads,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to browse sell ads',
      });
    }
  }

  /**
   * @swagger
   * /api/p2p/orders:
   *   post:
   *     summary: "[USER] Create order from ad - Browse → Order Created"
   *     description: |
   *       **UI Flow: User selects ad → Enters crypto amount → Creates order**
   *       
   *       User creates a new P2P order from an ad. User enters the crypto amount (quantity they want to buy/sell).
   *       System validates ad availability, order limits, and balances.
   *       
   *       **Order Status After Creation:**
   *       - `pending`: If vendor must manually accept (most common)
   *       - `awaiting_payment`: If ad has auto-accept enabled
   *       
   *       **Next Steps:**
   *       1. If `pending`: Vendor must call `/vendor/accept` to accept order
   *       2. If `awaiting_payment`: Buyer can immediately call `/buyer/payment-made`
   *       
   *       **Role Resolution (Binance/Bybit style):**
   *       - Vendor BUY ad → User sees as SELL action (User is SELLER, Vendor is BUYER)
   *       - Vendor SELL ad → User sees as BUY action (User is BUYER, Vendor is SELLER)
   *       - Crypto ALWAYS moves from SELLER → BUYER
   *       
   *       A chat thread is automatically initialized for communication.
   *     tags: ["P2P - USER (Browse & Order)"]
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
   *               - cryptoAmount
   *               - paymentMethodId
   *             properties:
   *               adId:
   *                 type: integer
   *                 example: 1
   *                 description: ID of the ad to create order from
   *               cryptoAmount:
   *                 type: string
   *                 example: "5.00"
   *                 description: |
   *                   Amount of cryptocurrency (quantity user wants to buy/sell).
   *                   Must be within ad's min/max order limits when converted to fiat.
   *               paymentMethodId:
   *                 type: integer
   *                 example: 1
   *                 description: |
   *                   Payment method ID from the ad's accepted payment methods.
   *                   Use GET /api/p2p/ads/:id to see available payment methods.
   *                   If 'rhinoxpay_id', payment confirmation is automatic.
   *     responses:
   *       201:
   *         description: Order created successfully. Status is 'pending' (vendor must accept) or 'awaiting_payment' (if auto-accept enabled).
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
   *                       type: integer
   *                       example: 1
   *                     status:
   *                       type: string
   *                       enum: [pending, awaiting_payment]
   *                       description: Order status. "pending" if vendor must accept, "awaiting_payment" if auto-accept enabled
   *                     userAction:
   *                       type: string
   *                       enum: [buy, sell]
   *                       description: User-facing action label (what user sees)
   *                     cryptoAmount:
   *                       type: string
   *                     fiatAmount:
   *                       type: string
   *                     price:
   *                       type: string
   *                     paymentChannel:
   *                       type: string
   *                       enum: [rhinoxpay_id, offline]
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
   *           - "Crypto amount is required"
   *           - "Order amount must be at least X"
   *           - "Order amount must not exceed X"
   *           - "Insufficient crypto balance available"
   *           - "Maximum order amount exceeds vendor's available balance"
   *         $ref: '#/components/schemas/Error'
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async createOrder(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { adId, cryptoAmount, paymentMethodId } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!adId || !cryptoAmount || !paymentMethodId) {
        return res.status(400).json({
          success: false,
          message: 'Ad ID, crypto amount, and payment method ID are required',
        });
      }

      const order = await this.service.createOrder(userId, {
        adId,
        cryptoAmount,
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
   * /api/p2p/orders/{id}/vendor/accept:
   *   post:
   *     summary: "[VENDOR] Accept order - Order Received → Awaiting Payment"
   *     description: |
   *       **UI State: "Order Received"**
   *       
   *       Vendor (ad owner) accepts a pending order. This action:
   *       1. Freezes crypto from seller's VirtualAccount
   *       2. Changes status: `pending` → `awaiting_payment`
   *       3. Starts processing time countdown (from ad's processingTime)
   *       4. Buyer can now make payment
   *       
   *       **Who can call:** Only vendor (ad owner)
   *       **Required status:** `pending`
   *       **Next step:** Buyer makes payment and calls `/buyer/payment-made`
     *     tags: ["P2P - VENDOR (Order Management)"]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         example: 1
   *         description: Order ID
   *     responses:
   *       200:
   *         description: Order accepted. Status is now 'awaiting_payment'. Crypto frozen.
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
   *                     status:
   *                       type: string
   *                       example: "awaiting_payment"
   *                     acceptedAt:
   *                       type: string
   *                       format: date-time
   *                     expiresAt:
   *                       type: string
   *                       format: date-time
   *                       description: Order expiration time (acceptedAt + processingTime)
   *       400:
   *         description: |
   *           Error. Common errors:
   *           - "Only vendor can accept this order"
   *           - "Cannot accept order. Current status: X"
   *           - "Insufficient crypto balance available"
   *         $ref: '#/components/schemas/Error'
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async acceptOrder(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { id } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Order ID is required',
        });
      }

      const result = await this.service.acceptOrder(id, userId.toString());

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to accept order',
      });
    }
  }

  /**
   * @swagger
   * /api/p2p/orders/{id}/vendor/decline:
   *   post:
   *     summary: "[VENDOR] Decline order - Order Received → Cancelled"
   *     description: |
   *       **UI State: "Order Received"**
   *       
   *       Vendor (ad owner) declines a pending order. Order is cancelled.
   *       
   *       **Who can call:** Only vendor (ad owner)
   *       **Required status:** `pending`
   *       **Result:** Status changes to `cancelled`
     *     tags: ["P2P - VENDOR (Order Management)"]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         example: 1
   *         description: Order ID
   *     responses:
   *       200:
   *         description: Order declined. Status updated to 'cancelled'.
   *       400:
   *         description: |
   *           Error. Common errors:
   *           - "Only vendor can decline this order"
   *           - "Cannot decline order. Current status: X"
   *         $ref: '#/components/schemas/Error'
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async declineOrder(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { id } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Order ID is required',
        });
      }

      const result = await this.service.declineOrder(id, userId.toString());

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to decline order',
      });
    }
  }

  /**
   * @swagger
   * /api/p2p/orders:
   *   get:
   *     summary: "[USER] Get my orders - Orders where I am the buyer (order creator)"
   *     description: |
   *       Get all orders for the authenticated user. Returns orders where user is either:
   *       - Buyer (order creator)
   *       - Vendor (ad owner)
   *       
   *       **Use cases:**
   *       - "My Orders" page showing all user's P2P transactions
   *       - Filter by role to see only orders as buyer or vendor
   *       - Filter by status to see pending, completed, cancelled orders
   *       
   *       **Response includes:**
   *       - Order details (amounts, status, parties)
   *       - `userAction`: What action user took (buy/sell) - for UI display
   *       - `isUserBuyer`: Boolean indicating if user is buyer
   *       - `isUserSeller`: Boolean indicating if user is seller
     *     tags: ["P2P - USER (Browse & Order)"]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: query
   *         name: role
   *         schema:
   *           type: string
   *           enum: [buyer, vendor]
   *         description: |
   *           Filter by user's role in the order.
   *           - "buyer": Only orders where user is the buyer
   *           - "vendor": Only orders where user is the vendor (ad owner)
   *           - If not specified: Returns all orders (buyer + vendor)
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [pending, awaiting_payment, payment_made, awaiting_coin_release, completed, cancelled, disputed, refunded, expired]
   *         description: Filter by order status
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 50
   *         description: Maximum number of orders to return
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           default: 0
   *         description: Number of orders to skip for pagination
   *     responses:
   *       200:
   *         description: List of user's orders with role indicators
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
   *                         type: integer
   *                       chatId:
   *                         type: integer
   *                         description: Chat ID (same as order ID) - use this to identify the chat for this order
   *                       status:
   *                         type: string
   *                       userAction:
   *                         type: string
   *                         enum: [buy, sell]
   *                         description: User-facing action (what user sees in UI)
   *                       isUserBuyer:
   *                         type: boolean
   *                         description: True if user is the buyer
   *                       isUserSeller:
   *                         type: boolean
   *                         description: True if user is the seller
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async getUserOrders(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const filters = {
        ...(req.query.role && { role: req.query.role as 'vendor' | 'user' }),
        ...(req.query.status && { status: req.query.status as string }),
        ...(req.query.limit && { limit: parseInt(req.query.limit as string, 10) }),
        ...(req.query.offset && { offset: parseInt(req.query.offset as string, 10) }),
      };

      const orders = await this.service.getUserOrders(userId.toString(), filters);

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
   * /api/p2p/ads/{adId}/user-payment-methods:
   *   get:
   *     summary: "[USER] Get my payment methods that match vendor's accepted methods"
   *     description: |
   *       **UI Flow: View Ad → Get My Matching Payment Methods**
   *       
   *       Get the user's own payment methods that match the vendor's accepted payment methods.
   *       This helps the frontend show the user their own payment methods instead of vendor's.
   *       
   *       **Use Case:**
   *       - User views an ad
   *       - Frontend calls this endpoint to get user's matching payment methods
   *       - Frontend shows user's own payment methods (not vendor's)
   *       - User selects their own payment method when creating order
   *       
   *       **For RhinoxPay ID:**
   *       - If user has RhinoxPay ID and vendor accepts it → returns user's RhinoxPay ID
   *       - If user doesn't have RhinoxPay ID → returns empty array (user needs to create one)
   *     tags: ["P2P - USER (Browse & Order)"]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: adId
   *         required: true
   *         schema:
   *           type: integer
   *         example: 1
   *         description: Ad ID
   *     responses:
   *       200:
   *         description: User's payment methods that match vendor's accepted methods
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
   *                         type: integer
   *                         example: 3
   *                         description: User's own payment method ID (use this when creating order)
   *                       type:
   *                         type: string
   *                         enum: [bank_account, mobile_money, rhinoxpay_id]
   *                       bankName:
   *                         type: string
   *                         nullable: true
   *                       accountNumber:
   *                         type: string
   *                         nullable: true
   *                         description: Masked account number
   *                       currency:
   *                         type: string
   *                         example: "NGN"
   *       400:
   *         description: Invalid ad ID or ad not found
   *         $ref: '#/components/schemas/Error'
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async getUserMatchingPaymentMethods(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { adId } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const matchingMethods = await this.service.getUserMatchingPaymentMethods(userId, adId);

      return res.json({
        success: true,
        data: matchingMethods,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to get matching payment methods',
      });
    }
  }

  /**
   * @swagger
   * /api/p2p/user/profile:
   *   get:
   *     summary: "[USER] Get my P2P profile - Orders and statistics"
   *     description: |
   *       Get user's P2P profile including:
   *       - Statistics (total orders, completed, pending, etc.)
   *       - Recent orders (last 10) with chatId
   *       - All orders include chatId (same as orderId)
   *       
   *       Use this endpoint for "My P2P" or profile pages.
   *     tags: ["P2P - USER (Browse & Order)"]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     responses:
   *       200:
   *         description: User P2P profile with statistics and recent orders
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async getUserP2PProfile(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const profile = await this.service.getUserP2PProfile(userId);

      return res.json({
        success: true,
        data: profile,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to get P2P profile',
      });
    }
  }

  /**
   * @swagger
   * /api/p2p/vendor/orders:
   *   get:
   *     summary: "[VENDOR] Get my vendor orders - Orders where I am the ad owner"
   *     description: |
   *       Get all orders for ads owned by the authenticated vendor.
   *       This is a convenience endpoint that filters `getUserOrders` by `role=vendor`.
   *     tags: ["P2P - VENDOR (Order Management)"]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [pending, awaiting_payment, payment_made, awaiting_coin_release, completed, cancelled, disputed, refunded, expired]
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
   *         description: List of vendor orders
   *       401:
   *         description: Unauthorized
   */
  async getVendorOrders(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const filters = {
        role: 'vendor' as const,
        ...(req.query.status && { status: req.query.status as string }),
        ...(req.query.limit && { limit: parseInt(req.query.limit as string, 10) }),
        ...(req.query.offset && { offset: parseInt(req.query.offset as string, 10) }),
      };

      const orders = await this.service.getUserOrders(userId.toString(), filters);

      return res.json({
        success: true,
        data: orders,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to get vendor orders',
      });
    }
  }

  /**
   * @swagger
   * /api/p2p/orders/{id}:
   *   get:
   *     summary: "[BUYER OR VENDOR] Get order details - Full order information"
   *     description: |
   *       Get detailed information about a specific order. Includes:
   *       - Order details (amounts, status, timestamps)
   *       - Chat messages between buyer and vendor
   *       - Payment method information
   *       - Reviews (if order completed)
   *       - Role indicators (`isUserBuyer`, `isUserSeller`)
   *       
   *       **Who can view:**
   *       - Buyer (order creator)
   *       - Vendor (ad owner)
   *       
   *       **Use this endpoint to:**
   *       - Display order details page
   *       - Show chat messages
   *       - Display payment account information
   *       - Show order status and next actions
     *     tags: ["P2P - USER (Browse & Order)", "P2P - VENDOR (Order Management)"]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         example: 1
   *         description: Order ID
   *     responses:
   *       200:
   *         description: Order details with chat, payment info, and role indicators
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
   *                     status:
   *                       type: string
   *                     userAction:
   *                       type: string
   *                       enum: [buy, sell]
   *                     isUserBuyer:
   *                       type: boolean
   *                     isUserSeller:
   *                       type: boolean
   *                     paymentMethod:
   *                       type: object
   *                       description: Payment method details (account number masked)
   *                     chatMessages:
   *                       type: array
   *                       items:
   *                         type: object
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden - Not buyer or vendor of this order
   *       404:
   *         description: Order not found
   *         $ref: '#/components/schemas/Error'
   */
  async getOrderDetails(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { id } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Order ID is required',
        });
      }

      const order = await this.service.getOrderDetails(id, userId.toString());

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
   * /api/p2p/orders/{id}/buyer/payment-made:
   *   post:
   *     summary: "[BUYER] Confirm payment made - Awaiting Payment → Payment Made"
   *     description: |
   *       **UI State: "Awaiting Payment"**
   *       
   *       Buyer confirms they have made the payment to vendor's account.
   *       
   *       **Payment Methods:**
   *       - **RhinoxPay ID:** Payment is automatic. Fiat transferred immediately, crypto auto-released.
   *         Status: `awaiting_payment` → `payment_made` → `awaiting_coin_release` → `completed`
   *       - **Offline (Bank/Mobile Money):** Manual confirmation. Buyer confirms payment made.
   *         Status: `awaiting_payment` → `payment_made`
   *         Next: Vendor must call `/vendor/payment-received` to release crypto
   *       
   *       **Who can call:** Only buyer (order creator)
   *       **Required status:** `awaiting_payment`
   *       **Next step:** 
   *         - RhinoxPay ID: Order automatically completes
   *         - Offline: Vendor calls `/vendor/payment-received`
     *     tags: ["P2P - USER (Browse & Order)"]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         example: 1
   *         description: Order ID
   *     requestBody:
   *       required: false
   *       description: |
   *         Optional. For offline payments, you can include payment proof.
   *         For RhinoxPay ID, no body needed (automatic).
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               paymentProof:
   *                 type: string
   *                 description: Optional payment proof (transaction reference, screenshot URL, etc.)
   *     responses:
   *       200:
   *         description: |
   *           Payment confirmed. 
   *           - RhinoxPay ID: Order completed automatically
   *           - Offline: Status is 'payment_made', waiting for vendor confirmation
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
   *                     status:
   *                       type: string
   *                       enum: [payment_made, awaiting_coin_release, completed]
   *                       description: |
   *                         - "payment_made" for offline payments (vendor must confirm)
   *                         - "completed" for RhinoxPay ID (automatic)
   *                     paymentConfirmedAt:
   *                       type: string
   *                       format: date-time
   *       400:
   *         description: |
   *           Error. Common errors:
   *           - "Only buyer can confirm payment"
   *           - "Cannot confirm payment. Current status: X"
   *           - "Insufficient fiat balance" (for RhinoxPay ID)
   *         $ref: '#/components/schemas/Error'
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async confirmPayment(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { id } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Order ID is required',
        });
      }

      const result = await this.service.confirmPayment(id, userId.toString());

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
   * /api/p2p/user/orders/{id}/payment-received:
   *   post:
   *     summary: "[USER] Mark payment received - When user is selling (vendor is buying)"
   *     description: |
   *       **UI State: "Payment Made"**
   *       
   *       User (seller) confirms they have received payment from vendor (buyer).
   *       This is used when vendor created a BUY ad and is buying crypto from the user.
   *       
   *       **Scenario:**
   *       - Vendor created BUY ad (wants to buy crypto)
   *       - User (seller) created order to sell crypto to vendor
   *       - Vendor is the BUYER, User is the SELLER
   *       - Vendor makes fiat payment to user
   *       - Vendor calls `/vendor/orders/:id/payment-made` to confirm payment made
   *       - User (seller) calls this endpoint to confirm payment received and release crypto
   *       
   *       **This action:**
   *       1. Changes status: `payment_made` → `awaiting_coin_release`
   *       2. Automatically releases crypto from user (seller) to vendor (buyer)
   *       3. Changes status: `awaiting_coin_release` → `completed`
   *       
   *       **Crypto Release:**
   *       - Crypto ALWAYS moves from SELLER → BUYER
   *       - For BUY ads: User is seller, Vendor is buyer → Crypto: User → Vendor
   *       
   *       **Who can call:** Only user when they are the seller (for BUY ads)
   *       **Required status:** `payment_made` (offline payments only)
   *       **Note:** For RhinoxPay ID, this step is automatic and not needed
   *     tags: ["P2P - USER (Browse & Order)"]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         example: 1
   *         description: Order ID
   *     requestBody:
   *       required: false
   *       description: Optional confirmation data
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               confirmed:
   *                 type: boolean
   *                 example: true
   *                 description: Confirmation that payment was received
   *     responses:
   *       200:
   *         description: Payment received confirmed. Crypto released. Order completed.
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
   *                     status:
   *                       type: string
   *                       example: "completed"
   *                     paymentReceivedAt:
   *                       type: string
   *                       format: date-time
   *                     coinReleasedAt:
   *                       type: string
   *                       format: date-time
   *                     completedAt:
   *                       type: string
   *                       format: date-time
   *       400:
   *         description: |
   *           Error. Common errors:
   *           - "Only seller can mark payment as received"
   *           - "Cannot mark payment as received. Current status: X"
   *           - "Insufficient frozen crypto balance"
   *         $ref: '#/components/schemas/Error'
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async markPaymentReceivedUser(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { id } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Order ID is required',
        });
      }

      const result = await this.service.markPaymentReceived(id, userId.toString());

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
   * /api/p2p/orders/{id}/vendor/payment-received:
   *   post:
   *     summary: "[VENDOR] Mark payment received - Payment Made → Completed"
   *     description: |
   *       **UI State: "Payment Made"**
   *       
   *       Vendor (seller) confirms they have received payment from buyer.
   *       This action:
   *       1. Changes status: `payment_made` → `awaiting_coin_release`
   *       2. Automatically releases crypto from seller to buyer
   *       3. Changes status: `awaiting_coin_release` → `completed`
   *       
   *       **Crypto Release:**
   *       - Crypto ALWAYS moves from SELLER → BUYER
   *       - For SELL ads: Vendor is seller, User is buyer → Crypto: Vendor → User
   *       - For BUY ads: User is seller, Vendor is buyer → Crypto: User → Vendor
   *       
   *       **Who can call:** Only seller (vendor for SELL ads, user for BUY ads)
   *       **Required status:** `payment_made` (offline payments only)
   *       **Note:** For RhinoxPay ID, this step is automatic and not needed
   *     tags: ["P2P - VENDOR (Order Management)"]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         example: 1
   *         description: Order ID
   *     requestBody:
   *       required: false
   *       description: Optional confirmation data
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               confirmed:
   *                 type: boolean
   *                 example: true
   *                 description: Confirmation that payment was received
   *     responses:
   *       200:
   *         description: Payment received confirmed. Crypto released. Order completed.
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
   *                     status:
   *                       type: string
   *                       example: "completed"
   *                     paymentReceivedAt:
   *                       type: string
   *                       format: date-time
   *                     coinReleasedAt:
   *                       type: string
   *                       format: date-time
   *                     completedAt:
   *                       type: string
   *                       format: date-time
   *       400:
   *         description: |
   *           Error. Common errors:
   *           - "Only seller can mark payment as received"
   *           - "Cannot mark payment as received. Current status: X"
   *           - "Insufficient frozen crypto balance"
   *         $ref: '#/components/schemas/Error'
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async markPaymentReceived(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { id } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Order ID is required',
        });
      }

      const result = await this.service.markPaymentReceived(id, userId.toString());

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
   *     summary: "[USER OR VENDOR] Cancel order (Legacy endpoint)"
   *     description: |
   *       Cancel an order. Only buyer or vendor can cancel.
   *       Can only cancel if order status is 'pending' or 'awaiting_payment'.
   *       A notification message is sent to the other party.
   *       
   *       **Note:** This is a legacy endpoint. Use `/user/orders/:id/cancel` or `/vendor/orders/:id/cancel` instead.
   *     tags: ["P2P - USER (Browse & Order)", "P2P - VENDOR (Order Management)"]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         example: 1
   *         description: Order ID
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
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { id } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Order ID is required',
        });
      }

      const result = await this.service.cancelOrder(id, userId.toString());

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

  /**
   * @swagger
   * /api/p2p/user/orders/{id}/cancel:
   *   post:
   *     summary: "[USER] Cancel order"
   *     description: |
   *       User (buyer) cancels their order. Only works if order status allows cancellation.
   *     tags: ["P2P - USER (Browse & Order)"]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         example: 1
   *         description: Order ID
   *     responses:
   *       200:
   *         description: Order cancelled successfully
   *       400:
   *         description: Cannot cancel order
   *       401:
   *         description: Unauthorized
   */
  async cancelOrderUser(req: Request, res: Response) {
    return this.cancelOrder(req, res);
  }

  /**
   * @swagger
   * /api/p2p/vendor/orders/{id}/payment-made:
   *   post:
   *     summary: "[VENDOR] Mark payment made - When vendor is buying (user is selling)"
   *     description: |
   *       **UI State: "Awaiting Payment"**
   *       
   *       Vendor (buyer) confirms they have made the fiat payment to user (seller).
   *       This is used when vendor created a BUY ad and is buying crypto from the user.
   *       
   *       **Scenario:**
   *       - Vendor created BUY ad (wants to buy crypto)
   *       - User (seller) created order to sell crypto to vendor
   *       - Vendor is the BUYER, User is the SELLER
   *       - Vendor makes fiat payment to user
   *       - Vendor calls this endpoint to confirm payment made
   *       
   *       **Payment Methods:**
   *       - **RhinoxPay ID:** Payment is automatic. Fiat transferred immediately, crypto auto-released.
   *         Status: `awaiting_payment` → `payment_made` → `awaiting_coin_release` → `completed`
   *       - **Offline (Bank/Mobile Money):** Manual confirmation. Vendor confirms payment made.
   *         Status: `awaiting_payment` → `payment_made`
   *         Next: User (seller) must call `/user/orders/:id/payment-received` to release crypto
   *       
   *       **Who can call:** Only vendor when they are the buyer (for BUY ads)
   *       **Required status:** `awaiting_payment`
   *       **Next step:** 
   *         - RhinoxPay ID: Order automatically completes
   *         - Offline: User (seller) calls payment-received to release crypto
   *     tags: ["P2P - VENDOR (Order Management)"]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         example: 1
   *         description: Order ID
   *     requestBody:
   *       required: false
   *       description: |
   *         Optional. For offline payments, you can include payment proof.
   *         For RhinoxPay ID, no body needed (automatic).
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               paymentProof:
   *                 type: string
   *                 description: Optional payment proof (transaction reference, screenshot URL, etc.)
   *     responses:
   *       200:
   *         description: |
   *           Payment confirmed. 
   *           - RhinoxPay ID: Order completed automatically
   *           - Offline: Status is 'payment_made', waiting for user (seller) confirmation
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
   *                     status:
   *                       type: string
   *                       enum: [payment_made, awaiting_coin_release, completed]
   *                       description: |
   *                         - "payment_made" for offline payments (user/seller must confirm)
   *                         - "completed" for RhinoxPay ID (automatic)
   *                     paymentConfirmedAt:
   *                       type: string
   *                       format: date-time
   *       400:
   *         description: |
   *           Error. Common errors:
   *           - "Only buyer can confirm payment"
   *           - "Cannot confirm payment. Current status: X"
   *           - "Insufficient fiat balance" (for RhinoxPay ID)
   *           - "Vendor is not the buyer for this order"
   *         $ref: '#/components/schemas/Error'
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async markPaymentMade(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { id } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Order ID is required',
        });
      }

      // Use the same confirmPayment logic since vendor is the buyer
      const result = await this.service.confirmPayment(id, userId.toString());

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
   * /api/p2p/vendor/orders/{id}/cancel:
   *   post:
   *     summary: "[VENDOR] Cancel order - Cancel order for my ad"
   *     description: |
   *       Vendor (ad owner) cancels an order for their ad. Only works if order status allows cancellation.
   *     tags: ["P2P - VENDOR (Order Management)"]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         example: 1
   *         description: Order ID
   *     responses:
   *       200:
   *         description: Order cancelled successfully
   *       400:
   *         description: Cannot cancel order
   *       401:
   *         description: Unauthorized
   */
  async cancelOrderVendor(req: Request, res: Response) {
    return this.cancelOrder(req, res);
  }
}

