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
   *                         type: integer
   *                         example: 9
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
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
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
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
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
   *     summary: Initiate a fiat wallet deposit transaction
   *     description: |
   *       Creates a pending deposit transaction and provides bank account details or mobile money instructions.
   *       For bank transfers, returns bank account details to transfer to. For mobile money, returns provider details.
   *       An email notification is sent with deposit instructions. User must confirm the deposit with PIN to complete.
   *       
   *       **Important:**
   *       - For `bank_transfer`: Do NOT include `providerId` in the request body
   *       - For `mobile_money`: `providerId` is REQUIRED
   *       
   *       **Example for bank_transfer:**
   *       ```json
   *       {
   *         "amount": "2000000",
   *         "currency": "NGN",
   *         "countryCode": "NG",
   *         "channel": "bank_transfer"
   *       }
   *       ```
   *       
   *       **Example for mobile_money:**
   *       ```json
   *       {
   *         "amount": "2000000",
   *         "currency": "NGN",
   *         "countryCode": "NG",
   *         "channel": "mobile_money",
   *         "providerId": 9
   *       }
   *       ```
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
   *                 description: |
   *                   Deposit amount as a string (to avoid precision issues). Must be greater than 0.
   *                   Example: "2000000" for 2,000,000 NGN.
   *               currency:
   *                 type: string
   *                 minLength: 3
   *                 maxLength: 3
   *                 example: "NGN"
   *                 description: |
   *                   Currency code (ISO 4217). Must match the country's currency.
   *                   Examples: NGN, KES, GHS, USD.
   *               countryCode:
   *                 type: string
   *                 minLength: 2
   *                 maxLength: 2
   *                 example: "NG"
   *                 description: |
   *                   ISO country code (2 letters).
   *                   Examples: NG (Nigeria), KE (Kenya), GH (Ghana).
   *               channel:
   *                 type: string
   *                 enum: [bank_transfer, mobile_money]
   *                 example: "bank_transfer"
   *                 description: |
   *                   Deposit channel type:
   *                   - bank_transfer: Transfer funds to provided bank account details (do NOT include providerId)
   *                   - mobile_money: Deposit via mobile money provider (providerId is REQUIRED)
   *               providerId:
   *                 type: integer
   *                 example: 9
   *                 description: |
   *                   **REQUIRED ONLY for mobile_money channel. DO NOT include for bank_transfer.**
   *                   ID of the mobile money provider.
   *                   Use GET /api/deposit/mobile-money-providers to get available providers for your country/currency.
   *                   Leave this field out when channel is "bank_transfer".
   *     responses:
   *       201:
   *         description: Deposit initiated successfully. Bank account details or mobile money instructions provided. Email sent with instructions.
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
   *                       description: Transaction ID. Use this to confirm the deposit.
   *                     reference:
   *                       type: string
   *                       example: "DEP-NG-20241230-ABC123XYZ"
   *                       description: Unique transaction reference. Use this when making bank transfer (for bank_transfer channel).
   *                     amount:
   *                       type: string
   *                       example: "2000000.00"
   *                       description: Deposit amount
   *                     currency:
   *                       type: string
   *                       example: "NGN"
   *                     fee:
   *                       type: string
   *                       example: "0.00"
   *                       description: Transaction fee (if any)
   *                     status:
   *                       type: string
   *                       enum: [pending]
   *                       example: "pending"
   *                       description: Transaction status. Will be "completed" after PIN confirmation.
   *                     bankAccount:
   *                       type: object
   *                       nullable: true
   *                       description: Bank account details (for bank_transfer channel)
   *                       properties:
   *                         bankName:
   *                           type: string
   *                           example: "Gratuity Bank"
   *                         accountNumber:
   *                           type: string
   *                           example: "1350131270"
   *                           description: Bank account number to transfer funds to
   *                         accountName:
   *                           type: string
   *                           example: "Yellow card financial"
   *                     provider:
   *                       type: object
   *                       nullable: true
   *                       description: Mobile money provider details (for mobile_money channel)
   *                       properties:
   *                         name:
   *                           type: string
   *                           example: "MTN Mobile Money"
   *                         code:
   *                           type: string
   *                           example: "MTN"
   *                     createdAt:
   *                       type: string
   *                       format: date-time
   *                       example: "2024-12-30T10:30:00Z"
   *       400:
   *         description: Validation error - missing required fields, invalid amount, or missing providerId for mobile_money
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
   *                   example: "Amount, currency, country code, and channel are required"
   *                   description: |
   *                     Error message. Examples: "Amount, currency, country code, and channel are required" or "Provider ID is required for mobile money deposits"
   *       401:
   *         description: Unauthorized - authentication required
   *         $ref: '#/components/schemas/Error'
   */
  async initiateDeposit(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
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
   *     summary: Confirm and complete deposit transaction with PIN
   *     description: |
   *       Confirms a pending deposit transaction by verifying the user's 5-digit PIN.
   *       After confirmation, the deposit amount (minus fees) is credited to the user's wallet.
   *       Transaction status is updated to "completed" and a success email is sent.
   *       Note: For bank transfers, this marks the transaction as completed in the system.
   *       For mobile money, this confirms the user has completed the mobile money payment.
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
   *                 type: integer
   *                 example: 1
   *                 description: Transaction ID returned from the initiate deposit endpoint
   *               pin:
   *                 type: string
   *                 pattern: '^\d{5}$'
   *                 minLength: 5
   *                 maxLength: 5
   *                 example: "12345"
   *                 description: User's 5-digit transaction PIN. Must match the PIN set up in the account.
   *     responses:
   *       200:
   *         description: Deposit confirmed successfully. Wallet credited. Transaction marked as completed.
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
   *                       description: Transaction ID
   *                     reference:
   *                       type: string
   *                       example: "DEP-NG-20241230-ABC123XYZ"
   *                       description: Transaction reference number
   *                     amount:
   *                       type: string
   *                       example: "2000000.00"
   *                       description: Original deposit amount
   *                     creditedAmount:
   *                       type: string
   *                       example: "2000000.00"
   *                       description: Amount credited to wallet (amount minus fees)
   *                     fee:
   *                       type: string
   *                       example: "0.00"
   *                       description: Transaction fee deducted
   *                     status:
   *                       type: string
   *                       enum: [completed]
   *                       example: "completed"
   *                       description: Transaction status - now completed
   *                     completedAt:
   *                       type: string
   *                       format: date-time
   *                       example: "2024-12-30T10:35:00Z"
   *                       description: Timestamp when transaction was completed
   *       400:
   *         description: Invalid PIN, transaction not found, or transaction already completed
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
   *                   example: "Invalid PIN"
   *                   description: |
   *                     Error message. Examples: "Invalid PIN" or "Transaction not found" or "Transaction already completed"
   *       401:
   *         description: Unauthorized - authentication required
   *         $ref: '#/components/schemas/Error'
   */
  async confirmDeposit(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
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
   *           type: integer
   *         example: 1
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
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
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

