import { type Request, type Response } from 'express';
import { ExchangeService } from './exchange.service.js';

/**
 * Exchange Controller
 * Handles HTTP requests for exchange rate operations
 */
export class ExchangeController {
  constructor(private service: ExchangeService) {}

  /**
   * @swagger
   * /api/exchange/rate:
   *   get:
   *     summary: Get exchange rate between two currencies
   *     tags: [Exchange]
   *     parameters:
   *       - in: query
   *         name: from
   *         required: true
   *         schema:
   *           type: string
   *         example: "NGN"
   *       - in: query
   *         name: to
   *         required: true
   *         schema:
   *           type: string
   *         example: "USD"
   *     responses:
   *       200:
   *         description: Exchange rate
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
   *                     fromCurrency:
   *                       type: string
   *                       example: "NGN"
   *                     toCurrency:
   *                       type: string
   *                       example: "USD"
   *                     rate:
   *                       type: string
   *                       example: "0.0012"
   *                     inverseRate:
   *                       type: string
   *                       example: "833.33"
   *       404:
   *         description: Exchange rate not found
   *         $ref: '#/components/schemas/Error'
   */
  async getExchangeRate(req: Request, res: Response) {
    try {
      const { from, to } = req.query;

      if (!from || !to) {
        return res.status(400).json({
          success: false,
          message: 'From and to currencies are required',
        });
      }

      const rate = await this.service.getExchangeRate(from as string, to as string);

      return res.json({
        success: true,
        data: rate,
      });
    } catch (error: any) {
      return res.status(404).json({
        success: false,
        message: error.message || 'Exchange rate not found',
      });
    }
  }

  /**
   * @swagger
   * /api/exchange/convert:
   *   get:
   *     summary: Convert amount from one currency to another
   *     tags: [Exchange]
   *     parameters:
   *       - in: query
   *         name: amount
   *         required: true
   *         schema:
   *           type: number
   *         example: 1000000
   *       - in: query
   *         name: from
   *         required: true
   *         schema:
   *           type: string
   *         example: "NGN"
   *       - in: query
   *         name: to
   *         required: true
   *         schema:
   *           type: string
   *         example: "USD"
   *     responses:
   *       200:
   *         description: Converted amount
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
   *                     fromAmount:
   *                       type: string
   *                       example: "1000000"
   *                     fromCurrency:
   *                       type: string
   *                       example: "NGN"
   *                     toAmount:
   *                       type: string
   *                       example: "1200"
   *                     toCurrency:
   *                       type: string
   *                       example: "USD"
   *                     rate:
   *                       type: string
   *                       example: "0.0012"
   */
  async convertAmount(req: Request, res: Response) {
    try {
      const { amount, from, to } = req.query;

      if (!amount || !from || !to) {
        return res.status(400).json({
          success: false,
          message: 'Amount, from, and to currencies are required',
        });
      }

      const amountNum = parseFloat(amount as string);
      if (isNaN(amountNum) || amountNum <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Amount must be a positive number',
        });
      }

      const result = await this.service.convertAmount(
        amountNum,
        from as string,
        to as string
      );

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to convert amount',
      });
    }
  }

  /**
   * @swagger
   * /api/exchange/rates:
   *   get:
   *     summary: Get all exchange rates
   *     tags: [Exchange]
   *     parameters:
   *       - in: query
   *         name: activeOnly
   *         schema:
   *           type: boolean
   *         example: true
   *     responses:
   *       200:
   *         description: List of exchange rates
   */
  async getAllRates(req: Request, res: Response) {
    try {
      const activeOnly = req.query.activeOnly === 'true';
      const rates = await this.service.getAllExchangeRates(activeOnly);

      return res.json({
        success: true,
        data: rates,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get exchange rates',
      });
    }
  }

  /**
   * @swagger
   * /api/exchange/rates/{baseCurrency}:
   *   get:
   *     summary: Get all exchange rates from a base currency
   *     tags: [Exchange]
   *     parameters:
   *       - in: path
   *         name: baseCurrency
   *         required: true
   *         schema:
   *           type: string
   *         example: "NGN"
   *     responses:
   *       200:
   *         description: Exchange rates from base currency
   */
  async getRatesFromBase(req: Request, res: Response) {
    try {
      const { baseCurrency } = req.params;

      if (!baseCurrency) {
        return res.status(400).json({
          success: false,
          message: 'Base currency is required',
        });
      }

      const rates = await this.service.getRatesFromBase(baseCurrency);

      return res.json({
        success: true,
        data: {
          baseCurrency: baseCurrency.toUpperCase(),
          rates,
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get exchange rates',
      });
    }
  }

  /**
   * @swagger
   * /api/exchange/currencies:
   *   get:
   *     summary: "[PUBLIC] Get all available fiat currencies"
   *     description: |
   *       Returns a list of all available fiat currencies.
   *       This endpoint is public and does not require authentication.
   *       Only fiat currencies are returned (crypto currencies are excluded).
   *       Currencies are sorted by code alphabetically.
   *     tags: [Exchange]
   *     responses:
   *       200:
   *         description: List of currencies
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
   *                       code:
   *                         type: string
   *                         example: "NGN"
   *                         description: Currency code (ISO 4217 for fiat)
   *                       name:
   *                         type: string
   *                         example: "Nigerian Naira"
   *                       symbol:
   *                         type: string
   *                         example: "₦"
   *                       type:
   *                         type: string
   *                         enum: [fiat, crypto]
   *                         example: "fiat"
   *                       flag:
   *                         type: string
   *                         nullable: true
   *                         example: "/uploads/flags/ng.png"
   *                         description: Flag image URL for fiat currencies
   *                       isActive:
   *                         type: boolean
   *                         example: true
   */
  async getCurrencies(req: Request, res: Response) {
    try {
      const currencies = await this.service.getCurrencies();

      return res.json({
        success: true,
        data: currencies,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get currencies',
      });
    }
  }

  /**
   * @swagger
   * /api/exchange/set-rate:
   *   post:
   *     summary: Set or update exchange rate (Admin)
   *     tags: [Exchange]
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
   *               - fromCurrency
   *               - toCurrency
   *               - rate
   *             properties:
   *               fromCurrency:
   *                 type: string
   *                 example: "NGN"
   *               toCurrency:
   *                 type: string
   *                 example: "USD"
   *               rate:
   *                 type: number
   *                 example: 0.0012
   *                 description: "Rate to convert fromCurrency to toCurrency"
   *               inverseRate:
   *                 type: number
   *                 example: 833.33
   *                 description: "Optional: Rate to convert toCurrency to fromCurrency (auto-calculated if not provided)"
   *     responses:
   *       200:
   *         description: Exchange rate set successfully
   *       400:
   *         description: Validation error
   *         $ref: '#/components/schemas/Error'
   */
  async setRate(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { fromCurrency, toCurrency, rate, inverseRate } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      // TODO: Add admin check here
      // if (!isAdmin(userId)) {
      //   return res.status(403).json({
      //     success: false,
      //     message: 'Admin access required',
      //   });
      // }

      if (!fromCurrency || !toCurrency || rate === undefined) {
        return res.status(400).json({
          success: false,
          message: 'From currency, to currency, and rate are required',
        });
      }

      const exchangeRate = await this.service.setExchangeRate(
        fromCurrency,
        toCurrency,
        parseFloat(rate),
        inverseRate ? parseFloat(inverseRate) : undefined
      );

      return res.json({
        success: true,
        data: exchangeRate,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to set exchange rate',
      });
    }
  }
}

