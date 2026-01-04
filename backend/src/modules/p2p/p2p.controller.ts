import { type Request, type Response } from 'express';
import { P2PService } from './p2p.service.js';

/**
 * P2P Controller
 * Handles HTTP requests for P2P trading advertisements
 */
export class P2PController {
  constructor(private service: P2PService) {}

  /**
   * @swagger
   * /api/p2p/ads/buy:
   *   post:
   *     summary: "[VENDOR] Create BUY ad - I want to BUY crypto"
   *     description: |
   *       Creates a buy advertisement for purchasing cryptocurrency with fiat currency.
   *       As a vendor, you can create buy ads to allow other users to sell crypto to you.
   *       The ad will be visible to other users who want to sell the specified cryptocurrency.
   *       Payment methods must be added to your account first (use Payment Settings endpoints).
     *     tags: ["P2P - VENDOR (Ad Creation)"]
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
   *               - cryptoCurrency
   *               - fiatCurrency
   *               - price
   *               - volume
   *               - minOrder
   *               - maxOrder
   *               - paymentMethodIds
   *             properties:
   *               cryptoCurrency:
   *                 type: string
   *                 minLength: 2
   *                 maxLength: 10
   *                 example: "BTC"
   *                 description: |
   *                   Cryptocurrency symbol to buy.
   *                   Examples: BTC, USDT, ETH, BNB, SOL, etc.
   *               fiatCurrency:
   *                 type: string
   *                 minLength: 3
   *                 maxLength: 3
   *                 example: "NGN"
   *                 description: |
   *                   Fiat currency to receive payment in.
   *                   Examples: NGN, USD, KES, GHS.
   *               price:
   *                 type: string
   *                 example: "1500.00"
   *                 description: |
   *                   Price per 1 unit of cryptocurrency in fiat currency.
   *                   Example: "1500.00" means 1 BTC = 1500 NGN (or 1 USDT = 1500 NGN).
   *                   Must be greater than 0.
   *               volume:
   *                 type: string
   *                 example: "50.00"
   *                 description: |
   *                   Total volume of cryptocurrency available to buy (in crypto units).
   *                   Example: "50.00" means you want to buy up to 50 BTC (or 50 USDT).
   *                   Must be greater than 0. Must be greater than or equal to minOrder.
   *               minOrder:
   *                 type: string
   *                 example: "1600.00"
   *                 description: |
   *                   Minimum order amount in fiat currency.
   *                   Example: "1600.00" means minimum order is 1600 NGN.
   *                   Must be greater than 0. Must be less than maxOrder. Cannot exceed volume converted to fiat.
   *               maxOrder:
   *                 type: string
   *                 example: "75000.00"
   *                 description: |
   *                   Maximum order amount in fiat currency.
   *                   Example: "75000.00" means maximum order is 75,000 NGN.
   *                   Must be greater than 0. Must be greater than minOrder.
   *               autoAccept:
   *                 type: boolean
   *                 default: false
   *                 example: true
   *                 description: |
   *                   If true, orders will be automatically accepted without manual approval.
   *                   If false, you must manually accept each order.
   *               paymentMethodIds:
   *                 type: array
   *                 minItems: 1
   *                 items:
   *                   type: integer
   *                 example: [1, 2]
   *                 description: |
   *                   Array of payment method IDs that you accept for this ad.
   *                   Payment methods must be added to your account first via Payment Settings.
   *                   Can include bank accounts, mobile money accounts, or Rhinox Pay ID.
   *                   To add Rhinox Pay ID, use POST /api/payment-settings/rhinoxpay-id.
   *                   At least one payment method is required.
   *                   Examples: bank account IDs, mobile money account IDs.
   *               countryCode:
   *                 type: string
   *                 minLength: 2
   *                 maxLength: 2
   *                 example: "NG"
   *                 description: |
   *                   Optional. ISO country code (2 letters) for the ad.
   *                   Examples: NG, KE, GH.
   *               description:
   *                 type: string
   *                 maxLength: 500
   *                 example: "Buy USDT at best rates. Fast and secure transactions."
   *                 description: Optional. Ad description or terms for buyers to see.
   *     responses:
   *       201:
   *         description: Buy ad created successfully. Ad is now active and visible to sellers.
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
   *                       description: Ad ID. Use this to update or manage the ad.
   *                     type:
   *                       type: string
   *                       enum: [buy]
   *                       example: "buy"
   *                     cryptoCurrency:
   *                       type: string
   *                       example: "BTC"
   *                     fiatCurrency:
   *                       type: string
   *                       example: "NGN"
   *                     price:
   *                       type: string
   *                       example: "1500.00"
   *                       description: Price per 1 unit of crypto
   *                     volume:
   *                       type: string
   *                       example: "50.00"
   *                     minOrder:
   *                       type: string
   *                       example: "1600.00"
   *                     maxOrder:
   *                       type: string
   *                       example: "75000.00"
   *                     autoAccept:
   *                       type: boolean
   *                       example: true
   *                     paymentMethodIds:
   *                       type: array
   *                       items:
   *                         type: integer
   *                       example: [1, 2]
   *                     status:
   *                       type: string
   *                       enum: [available]
   *                       example: "available"
   *                       description: |
   *                         Ad status. Can be: available, unavailable, paused
   *                     isOnline:
   *                       type: boolean
   *                       example: true
   *                       description: Online/offline status
   *                     ordersReceived:
   *                       type: integer
   *                       example: 0
   *                       description: Number of orders received (starts at 0)
   *                     message:
   *                       type: string
   *                       example: "Buy ad created successfully"
   *       400:
   *         description: |
   *           Validation error. Common errors:
   *           - "Crypto currency, fiat currency, price, and volume are required"
   *           - "Min order and max order are required"
   *           - "At least one payment method is required"
   *           - "Price, volume, and order limits must be greater than 0"
   *           - "Min order must be less than max order"
   *           - "Min order cannot be greater than volume"
   *           - "One or more payment methods are invalid or not found"
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: false
   *                 message:
   *                   type: string
   *       401:
   *         description: Unauthorized - authentication required
   *         $ref: '#/components/schemas/Error'
   */
  async createBuyAd(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const {
        cryptoCurrency,
        fiatCurrency,
        price,
        volume,
        minOrder,
        maxOrder,
        autoAccept,
        paymentMethodIds,
        countryCode,
        description,
      } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const result = await this.service.createBuyAd(userId, {
        cryptoCurrency,
        fiatCurrency,
        price,
        volume,
        minOrder,
        maxOrder,
        autoAccept,
        paymentMethodIds,
        countryCode,
        description,
      });

      return res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create buy ad',
      });
    }
  }

  /**
   * @swagger
   * /api/p2p/ads/sell:
   *   post:
   *     summary: "[VENDOR] Create SELL ad - I want to SELL crypto"
     *     tags: ["P2P - VENDOR (Ad Creation)"]
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
   *               - cryptoCurrency
   *               - fiatCurrency
   *               - price
   *               - volume
   *               - minOrder
   *               - maxOrder
   *               - paymentMethodIds
   *             properties:
   *               cryptoCurrency:
   *                 type: string
   *                 example: "USDT"
   *               fiatCurrency:
   *                 type: string
   *                 example: "NGN"
   *               price:
   *                 type: string
   *                 example: "1550.70"
   *               volume:
   *                 type: string
   *                 example: "100.00"
   *               minOrder:
   *                 type: string
   *                 example: "1600.00"
   *               maxOrder:
   *                 type: string
   *                 example: "75000.00"
   *               autoAccept:
   *                 type: boolean
   *                 example: false
   *               paymentMethodIds:
   *                 type: array
   *                 items:
   *                   type: string
   *                 example: [1, 2]
   *               countryCode:
   *                 type: string
   *                 example: "NG"
   *               description:
   *                 type: string
   *     responses:
   *       201:
   *         description: Sell ad created successfully
   *       400:
   *         description: Validation error
   *         $ref: '#/components/schemas/Error'
   */
  async createSellAd(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const {
        cryptoCurrency,
        fiatCurrency,
        price,
        volume,
        minOrder,
        maxOrder,
        autoAccept,
        paymentMethodIds,
        countryCode,
        description,
      } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const result = await this.service.createSellAd(userId, {
        cryptoCurrency,
        fiatCurrency,
        price,
        volume,
        minOrder,
        maxOrder,
        autoAccept,
        paymentMethodIds,
        countryCode,
        description,
      });

      return res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create sell ad',
      });
    }
  }

  /**
   * @swagger
   * /api/p2p/ads:
   *   get:
   *     summary: "[VENDOR] Get my ads - View all my buy and sell ads"
     *     tags: ["P2P - VENDOR (Ad Management)"]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: query
   *         name: type
   *         schema:
   *           type: string
   *           enum: [buy, sell]
   *         description: Filter by ad type
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [available, unavailable, paused]
   *         description: Filter by ad status
   *     responses:
   *       200:
   *         description: List of user's ads
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 data:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       id:
   *                         type: string
   *                       type:
   *                         type: string
   *                         enum: [buy, sell]
   *                       cryptoCurrency:
   *                         type: string
   *                       fiatCurrency:
   *                         type: string
   *                       price:
   *                         type: string
   *                       volume:
   *                         type: string
   *                       minOrder:
   *                         type: string
   *                       maxOrder:
   *                         type: string
   *                       autoAccept:
   *                         type: boolean
   *                       paymentMethodIds:
   *                         type: array
   *                         items:
   *                           type: string
   *                       status:
   *                         type: string
   *                       isOnline:
   *                         type: boolean
   *                       ordersReceived:
   *                         type: integer
   *                       responseTime:
   *                         type: integer
   *                       score:
   *                         type: string
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async getUserAds(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { type, status } = req.query;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const result = await this.service.getUserAds(
        userId,
        type as 'buy' | 'sell' | undefined,
        status as 'available' | 'unavailable' | 'paused' | undefined
      );

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to get user ads',
      });
    }
  }

  /**
   * @swagger
   * /api/p2p/ads/{id}:
   *   get:
   *     summary: "[VENDOR] Get ad details - View one of my ads"
     *     tags: ["P2P - VENDOR (Ad Management)"]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Ad details
   *       404:
   *         description: Ad not found
   *         $ref: '#/components/schemas/Error'
   */
  async getAd(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { id } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const result = await this.service.getAd(userId, id);

      return res.json({
        success: true,
        data: result,
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
   * /api/p2p/ads/{id}/status:
   *   put:
   *     summary: "[VENDOR] Update ad status - Toggle available/unavailable"
     *     tags: ["P2P - VENDOR (Ad Management)"]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - status
   *             properties:
   *               status:
   *                 type: string
   *                 enum: [available, unavailable, paused]
   *                 example: "unavailable"
   *               isOnline:
   *                 type: boolean
   *                 example: false
   *     responses:
   *       200:
   *         description: Ad status updated successfully
   *       404:
   *         description: Ad not found
   *         $ref: '#/components/schemas/Error'
   */
  async updateAdStatus(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { id } = req.params;
      const { status, isOnline } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!status) {
        return res.status(400).json({
          success: false,
          message: 'Status is required',
        });
      }

      if (!['available', 'unavailable', 'paused'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status. Must be available, unavailable, or paused',
        });
      }

      const result = await this.service.updateAdStatus(userId, id, status, isOnline);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(404).json({
        success: false,
        message: error.message || 'Failed to update ad status',
      });
    }
  }

  /**
   * @swagger
   * /api/p2p/ads/{id}:
   *   put:
   *     summary: "[VENDOR] Edit ad - Update ad details"
     *     tags: ["P2P - VENDOR (Ad Management)"]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               price:
   *                 type: string
   *               volume:
   *                 type: string
   *               minOrder:
   *                 type: string
   *               maxOrder:
   *                 type: string
   *               autoAccept:
   *                 type: boolean
   *               paymentMethodIds:
   *                 type: array
   *                 items:
   *                   type: string
   *               countryCode:
   *                 type: string
   *               description:
   *                 type: string
   *     responses:
   *       200:
   *         description: Ad updated successfully
   *       404:
   *         description: Ad not found
   *         $ref: '#/components/schemas/Error'
   */
  async updateAd(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { id } = req.params;
      const {
        price,
        volume,
        minOrder,
        maxOrder,
        autoAccept,
        paymentMethodIds,
        countryCode,
        description,
      } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const result = await this.service.updateAd(userId, id, {
        price,
        volume,
        minOrder,
        maxOrder,
        autoAccept,
        paymentMethodIds,
        countryCode,
        description,
      });

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(404).json({
        success: false,
        message: error.message || 'Failed to update ad',
      });
    }
  }
}

