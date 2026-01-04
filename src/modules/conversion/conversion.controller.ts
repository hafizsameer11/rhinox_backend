import { type Request, type Response } from 'express';
import { ConversionService } from './conversion.service.js';

/**
 * Conversion Controller
 * Handles HTTP requests for currency conversion
 */
export class ConversionController {
  constructor(private service: ConversionService) {}

  /**
   * @swagger
   * /api/conversion/calculate:
   *   get:
   *     summary: Calculate conversion preview (amount, fee, received amount)
   *     description: |
   *       **Note: Conversion is only allowed between fiat currencies.**
   *       Crypto currencies cannot be converted through this endpoint.
   *     tags: [Conversion]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: query
   *         name: fromCurrency
   *         required: true
   *         schema:
   *           type: string
   *         example: "NGN"
   *       - in: query
   *         name: toCurrency
   *         required: true
   *         schema:
   *           type: string
   *         example: "KES"
   *       - in: query
   *         name: amount
   *         required: true
   *         schema:
   *           type: string
   *         example: "200000"
   *     responses:
   *       200:
   *         description: Conversion calculation
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
   *                     fromAmount:
   *                       type: string
   *                     toCurrency:
   *                       type: string
   *                     toAmount:
   *                       type: string
   *                     receivedAmount:
   *                       type: string
   *                     fee:
   *                       type: string
   *                     feeCurrency:
   *                       type: string
   *                     exchangeRate:
   *                       type: string
   *       400:
   *         description: Validation error
   *         $ref: '#/components/schemas/Error'
   */
  async calculateConversion(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { fromCurrency, toCurrency, amount } = req.query;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!fromCurrency || !toCurrency || !amount) {
        return res.status(400).json({
          success: false,
          message: 'From currency, to currency, and amount are required',
        });
      }

      if (parseFloat(amount as string) <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Amount must be greater than 0',
        });
      }

      const calculation = await this.service.calculateConversion(
        userId,
        fromCurrency as string,
        toCurrency as string,
        amount as string
      );

      return res.json({
        success: true,
        data: calculation,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to calculate conversion',
      });
    }
  }

  /**
   * @swagger
   * /api/conversion/initiate:
   *   post:
   *     summary: Initiate currency conversion
   *     description: |
   *       **Note: Conversion is only allowed between fiat currencies.**
   *       Crypto currencies cannot be converted through this endpoint.
   *       Both fromCurrency and toCurrency must be fiat currencies (e.g., NGN, USD, KES, GHS).
   *     tags: [Conversion]
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
   *               - amount
   *             properties:
   *               fromCurrency:
   *                 type: string
   *                 example: "NGN"
   *                 description: Source fiat currency code (e.g., NGN, USD, KES). Must be a fiat currency.
   *               toCurrency:
   *                 type: string
   *                 example: "KES"
   *                 description: Destination fiat currency code (e.g., NGN, USD, KES). Must be a fiat currency.
   *               amount:
   *                 type: string
   *                 example: "200000"
   *     responses:
   *       201:
   *         description: Conversion initiated successfully
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
   *                     conversionReference:
   *                       type: string
   *                     debitTransaction:
   *                       type: object
   *                     creditTransaction:
   *                       type: object
   *                     exchangeRate:
   *                       type: string
   *                     fee:
   *                       type: string
   *       400:
   *         description: Validation error
   *         $ref: '#/components/schemas/Error'
   */
  async initiateConversion(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { fromCurrency, toCurrency, amount } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!fromCurrency || !toCurrency || !amount) {
        return res.status(400).json({
          success: false,
          message: 'From currency, to currency, and amount are required',
        });
      }

      if (fromCurrency === toCurrency) {
        return res.status(400).json({
          success: false,
          message: 'Cannot convert to the same currency',
        });
      }

      if (parseFloat(amount) <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Amount must be greater than 0',
        });
      }

      const result = await this.service.initiateConversion(userId, {
        fromCurrency,
        toCurrency,
        amount,
      });

      return res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to initiate conversion',
      });
    }
  }

  /**
   * @swagger
   * /api/conversion/confirm:
   *   post:
   *     summary: Confirm conversion with PIN verification
   *     tags: [Conversion]
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
   *               - conversionReference
   *               - pin
   *             properties:
   *               conversionReference:
   *                 type: string
   *                 example: "CONVABC123XYZ"
   *               pin:
   *                 type: string
   *                 pattern: '^\d{5}$'
   *                 example: "12345"
   *                 description: 5-digit PIN
   *     responses:
   *       200:
   *         description: Conversion confirmed and wallets updated
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
   *                     conversionReference:
   *                       type: string
   *                     fromTransaction:
   *                       type: object
   *                     toTransaction:
   *                       type: object
   *                     exchangeRate:
   *                       type: string
   *       400:
   *         description: Invalid PIN or conversion error
   *         $ref: '#/components/schemas/Error'
   */
  async confirmConversion(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { conversionReference, pin } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!conversionReference || !pin) {
        return res.status(400).json({
          success: false,
          message: 'Conversion reference and PIN are required',
        });
      }

      // Validate PIN format
      if (!/^\d{5}$/.test(pin)) {
        return res.status(400).json({
          success: false,
          message: 'PIN must be exactly 5 digits',
        });
      }

      const result = await this.service.confirmConversion(userId, conversionReference, pin);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to confirm conversion',
      });
    }
  }

  /**
   * @swagger
   * /api/conversion/receipt/{conversionReference}:
   *   get:
   *     summary: Get conversion receipt
   *     tags: [Conversion]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: conversionReference
   *         required: true
   *         schema:
   *           type: string
   *         example: "CONVABC123XYZ"
   *     responses:
   *       200:
   *         description: Conversion receipt
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
   *                     conversionReference:
   *                       type: string
   *                     fromTransaction:
   *                       type: object
   *                     toTransaction:
   *                       type: object
   *                     exchangeRate:
   *                       type: string
   *                     channel:
   *                       type: string
   *                     paymentMethod:
   *                       type: string
   *       404:
   *         description: Conversion not found
   *         $ref: '#/components/schemas/Error'
   */
  async getReceipt(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { conversionReference } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!conversionReference) {
        return res.status(400).json({
          success: false,
          message: 'Conversion reference is required',
        });
      }

      const receipt = await this.service.getConversionReceipt(userId, conversionReference);

      return res.json({
        success: true,
        data: receipt,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to get receipt',
      });
    }
  }
}

