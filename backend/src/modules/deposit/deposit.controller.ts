import { type Request, type Response } from 'express';
import { DepositService } from './deposit.service.js';

/**
 * Deposit Controller
 * Handles HTTP requests for fiat wallet deposits
 */
export class DepositController {
  constructor(private service: DepositService) {}

  /**
   * @swagger
   * /api/deposit/mobile-money-providers:
   *   get:
   *     summary: Get mobile money providers for a country
   *     tags: [Deposit]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: query
   *         name: countryCode
   *         required: true
   *         schema:
   *           type: string
   *         example: "KE"
   *       - in: query
   *         name: currency
   *         required: true
   *         schema:
   *           type: string
   *         example: "KES"
   *     responses:
   *       200:
   *         description: List of mobile money providers
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
   *                       name:
   *                         type: string
   *                         example: "MTN"
   *                       code:
   *                         type: string
   *                         example: "MTN"
   *                       logoUrl:
   *                         type: string
   *                         nullable: true
   *       400:
   *         description: Validation error
   *         $ref: '#/components/schemas/Error'
   */
  async getMobileMoneyProviders(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId;
      const { countryCode, currency } = req.query;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!countryCode || !currency) {
        return res.status(400).json({
          success: false,
          message: 'Country code and currency are required',
        });
      }

      const providers = await this.service.getMobileMoneyProviders(
        countryCode as string,
        currency as string
      );

      return res.json({
        success: true,
        data: providers,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to get mobile money providers',
      });
    }
  }

  /**
   * @swagger
   * /api/deposit/bank-details:
   *   get:
   *     summary: Get bank account details for deposit
   *     tags: [Deposit]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: query
   *         name: countryCode
   *         required: true
   *         schema:
   *           type: string
   *         example: "NG"
   *       - in: query
   *         name: currency
   *         required: true
   *         schema:
   *           type: string
   *         example: "NGN"
   *     responses:
   *       200:
   *         description: Bank account details
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
   *                     bankName:
   *                       type: string
   *                       example: "Gratuity Bank"
   *                     accountNumber:
   *                       type: string
   *                       example: "1350131270"
   *                     accountName:
   *                       type: string
   *                       example: "Yellow card financial"
   *                     currency:
   *                       type: string
   *                       example: "NGN"
   *                     countryCode:
   *                       type: string
   *                       example: "NG"
   *       404:
   *         description: Bank account not found
   *         $ref: '#/components/schemas/Error'
   */
  async getBankDetails(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId;
      const { countryCode, currency } = req.query;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!countryCode || !currency) {
        return res.status(400).json({
          success: false,
          message: 'Country code and currency are required',
        });
      }

      const bankDetails = await this.service.getBankAccountDetails(
        countryCode as string,
        currency as string
      );

      return res.json({
        success: true,
        data: bankDetails,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to get bank details',
      });
    }
  }

  /**
   * @swagger
   * /api/deposit/initiate:
   *   post:
   *     summary: Initiate a deposit transaction
   *     tags: [Deposit]
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
   *               - amount
   *               - currency
   *               - countryCode
   *               - channel
   *             properties:
   *               amount:
   *                 type: string
   *                 example: "2000000"
   *                 description: Deposit amount
   *               currency:
   *                 type: string
   *                 example: "NGN"
   *               countryCode:
   *                 type: string
   *                 example: "NG"
   *               channel:
   *                 type: string
   *                 enum: [bank_transfer, mobile_money, conversion, p2p]
   *                 example: "bank_transfer"
   *               providerId:
   *                 type: string
   *                 example: "provider-uuid"
   *                 description: Required for mobile_money channel
   *     responses:
   *       201:
   *         description: Deposit initiated successfully
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
   *                     reference:
   *                       type: string
   *                       example: "ABC123XYZ"
   *                     amount:
   *                       type: string
   *                     currency:
   *                       type: string
   *                     fee:
   *                       type: string
   *                     status:
   *                       type: string
   *                       example: "pending"
   *                     bankAccount:
   *                       type: object
   *                       nullable: true
   *                       properties:
   *                         bankName:
   *                           type: string
   *                         accountNumber:
   *                           type: string
   *                         accountName:
   *                           type: string
   *                     provider:
   *                       type: object
   *                       nullable: true
   *                       properties:
   *                         name:
   *                           type: string
   *                         code:
   *                           type: string
   *       400:
   *         description: Validation error
   *         $ref: '#/components/schemas/Error'
   */
  async initiateDeposit(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId;
      const { amount, currency, countryCode, channel } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!amount || !currency || !countryCode || !channel) {
        return res.status(400).json({
          success: false,
          message: 'Amount, currency, country code, and channel are required',
        });
      }

      if (parseFloat(amount) <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Amount must be greater than 0',
        });
      }

      // Validate providerId for mobile_money channel
      if (channel === 'mobile_money' && !req.body.providerId) {
        return res.status(400).json({
          success: false,
          message: 'Provider ID is required for mobile money deposits',
        });
      }

      const result = await this.service.initiateDeposit(userId, {
        amount,
        currency,
        countryCode,
        channel,
        providerId: req.body.providerId,
      });

      return res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to initiate deposit',
      });
    }
  }

  /**
   * @swagger
   * /api/deposit/confirm:
   *   post:
   *     summary: Confirm deposit with PIN verification
   *     tags: [Deposit]
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
   *               - transactionId
   *               - pin
   *             properties:
   *               transactionId:
   *                 type: string
   *                 example: "transaction-uuid"
   *               pin:
   *                 type: string
   *                 pattern: '^\d{5}$'
   *                 example: "12345"
   *                 description: 5-digit PIN
   *     responses:
   *       200:
   *         description: Deposit confirmed and wallet credited
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
   *                     reference:
   *                       type: string
   *                     amount:
   *                       type: string
   *                     creditedAmount:
   *                       type: string
   *                     fee:
   *                       type: string
   *                     status:
   *                       type: string
   *                       example: "completed"
   *       400:
   *         description: Invalid PIN or transaction error
   *         $ref: '#/components/schemas/Error'
   */
  async confirmDeposit(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId;
      const { transactionId, pin } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!transactionId || !pin) {
        return res.status(400).json({
          success: false,
          message: 'Transaction ID and PIN are required',
        });
      }

      // Validate PIN format
      if (!/^\d{5}$/.test(pin)) {
        return res.status(400).json({
          success: false,
          message: 'PIN must be exactly 5 digits',
        });
      }

      const result = await this.service.confirmDeposit(userId, transactionId, pin);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to confirm deposit',
      });
    }
  }

  /**
   * @swagger
   * /api/deposit/receipt/{transactionId}:
   *   get:
   *     summary: Get transaction receipt
   *     tags: [Deposit]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: transactionId
   *         required: true
   *         schema:
   *           type: string
   *         example: "transaction-uuid"
   *     responses:
   *       200:
   *         description: Transaction receipt
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
   *                     reference:
   *                       type: string
   *                     amount:
   *                       type: string
   *                     creditedAmount:
   *                       type: string
   *                     fee:
   *                       type: string
   *                     status:
   *                       type: string
   *                     transactionId:
   *                       type: string
   *                     country:
   *                       type: string
   *                     channel:
   *                       type: string
   *                     paymentMethod:
   *                       type: string
   *                     provider:
   *                       type: object
   *                       nullable: true
   *                       properties:
   *                         name:
   *                           type: string
   *                         code:
   *                           type: string
   *                     date:
   *                       type: string
   *                       format: date-time
   *       404:
   *         description: Transaction not found
   *         $ref: '#/components/schemas/Error'
   */
  async getReceipt(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId;
      const { transactionId } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!transactionId) {
        return res.status(400).json({
          success: false,
          message: 'Transaction ID is required',
        });
      }

      const receipt = await this.service.getTransactionReceipt(userId, transactionId);

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

