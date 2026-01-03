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
   *     summary: Create a buy ad
   *     tags: [P2P]
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
   *                 example: "BTC"
   *               fiatCurrency:
   *                 type: string
   *                 example: "NGN"
   *               price:
   *                 type: string
   *                 example: "1500.00"
   *                 description: Price per 1 unit of crypto
   *               volume:
   *                 type: string
   *                 example: "50.00"
   *                 description: Total volume available
   *               minOrder:
   *                 type: string
   *                 example: "1600.00"
   *               maxOrder:
   *                 type: string
   *                 example: "75000.00"
   *               autoAccept:
   *                 type: boolean
   *                 example: true
   *               paymentMethodIds:
   *                 type: array
   *                 items:
   *                   type: string
   *                 example: ["payment-method-uuid-1", "payment-method-uuid-2"]
   *               countryCode:
   *                 type: string
   *                 example: "NG"
   *               description:
   *                 type: string
   *                 example: "Buy USDT at best rates"
   *     responses:
   *       201:
   *         description: Buy ad created successfully
   *       400:
   *         description: Validation error
   *         $ref: '#/components/schemas/Error'
   */
  async createBuyAd(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId;
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
   *     summary: Create a sell ad
   *     tags: [P2P]
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
   *                 example: ["payment-method-uuid-1"]
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
      const userId = (req as any).user?.userId;
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
   *     summary: Get user's ads
   *     tags: [P2P]
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
      const userId = (req as any).user?.userId;
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
   *     summary: Get a single ad by ID
   *     tags: [P2P]
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
      const userId = (req as any).user?.userId;
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
   *     summary: Update ad status
   *     tags: [P2P]
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
      const userId = (req as any).user?.userId;
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
   *     summary: Update/edit an ad
   *     tags: [P2P]
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
      const userId = (req as any).user?.userId;
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

