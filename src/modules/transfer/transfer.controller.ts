import { type Request, type Response } from 'express';
import { TransferService } from './transfer.service.js';

/**
 * Transfer Controller
 * Handles HTTP requests for fiat transfers
 */
export class TransferController {
  constructor(private service: TransferService) {}

  /**
   * @swagger
   * /api/transfer/validate-recipient:
   *   get:
   *     summary: Get user details by email or user ID (for Rhinox Pay transfers)
   *     description: |
   *       Validates and returns recipient user information for Rhinox Pay user transfers.
   *       Accepts either email address or user ID as query parameter.
   *       Useful for validating recipients before initiating a transfer.
   *     tags: [Transfer]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: query
   *         name: email
   *         schema:
   *           type: string
   *           format: email
   *         description: Recipient's email address
   *         example: "recipient@example.com"
   *       - in: query
   *         name: userId
   *         schema:
   *           type: integer
   *         description: Recipient's user ID
   *         example: 2
   *     responses:
   *       200:
   *         description: User details found
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
   *                     userId:
   *                       type: integer
   *                       example: 2
   *                     email:
   *                       type: string
   *                       example: "recipient@example.com"
   *                     name:
   *                       type: string
   *                       example: "John Doe"
   *                     phone:
   *                       type: string
   *                       example: "+2348012345678"
   *       400:
   *         description: Email or userId parameter is required
   *       404:
   *         description: User not found or account is not active
   *       401:
   *         description: Unauthorized
   */
  async validateRecipient(req: Request, res: Response) {
    try {
      const { email, userId } = req.query;

      if (!email && !userId) {
        return res.status(400).json({
          success: false,
          message: 'Email or userId parameter is required',
        });
      }

      const recipientIdentifier = (email as string) || (userId as string);
      const recipientInfo = await this.service.validateRhionXUser(recipientIdentifier);

      return res.json({
        success: true,
        data: recipientInfo,
      });
    } catch (error: any) {
      return res.status(404).json({
        success: false,
        message: error.message || 'User not found',
      });
    }
  }

  /**
   * @swagger
   * /api/transfer/eligibility:
   *   get:
   *     summary: Check if user is eligible to send funds (KYC verification)
   *     tags: [Transfer]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     responses:
   *       200:
   *         description: Eligibility status
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 data:
   *                   type: object
   *                   properties:
   *                     eligible:
   *                       type: boolean
   *                     reason:
   *                       type: string
   *                       nullable: true
   *                     message:
   *                       type: string
   *                       nullable: true
   */
  async checkEligibility(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const eligibility = await this.service.checkTransferEligibility(userId);

      return res.json({
        success: true,
        data: eligibility,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to check eligibility',
      });
    }
  }

  /**
   * @swagger
   * /api/transfer/initiate:
   *   post:
   *     summary: Initiate a fiat transfer transaction
   *     description: |
   *       Creates a pending transfer transaction to send funds to another RhionX user, bank account, or mobile money.
   *       User must have completed KYC verification to use this endpoint (check eligibility first).
   *       An email OTP is sent for verification. User must verify with email code and PIN to complete the transfer.
   *       For RhionX user transfers, recipient wallet is automatically credited upon verification.
   *     tags: [Transfer]
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
   *                 example: "200000"
   *                 description: Transfer amount as a string. Must be greater than 0. Must not exceed available wallet balance (including fees).
   *               currency:
   *                 type: string
   *                 minLength: 3
   *                 maxLength: 3
   *                 example: "NGN"
   *                 description: Currency code (ISO 4217). Must match the currency of the source wallet.
   *               countryCode:
   *                 type: string
   *                 minLength: 2
   *                 maxLength: 2
   *                 example: "NG"
   *                 description: ISO country code (2 letters) for the transfer destination.
   *               channel:
   *                 type: string
   *                 enum: [rhionx_user, bank_account, mobile_money]
   *                 example: "bank_account"
   *                 description: |
   *                   Transfer channel type:
   *                   - rhionx_user: Transfer to another RhionX user (requires recipientEmail or recipientUserId)
   *                   - bank_account: Withdrawal to external bank account (requires paymentMethodId from payment settings)
   *                   - mobile_money: Transfer via mobile money (requires providerId and phoneNumber)
   *               recipientEmail:
   *                 type: string
   *                 format: email
   *                 example: "recipient@example.com"
   *                 description: |
   *                   For rhionx_user channel. Recipient's email address (from QR code scan).
   *                   Either recipientEmail or recipientUserId is required for rhionx_user transfers.
   *               recipientUserId:
   *                 type: integer
   *                 example: 2
   *                 description: |
   *                   For rhionx_user channel. Recipient's user ID.
   *                   Either recipientEmail or recipientUserId is required for rhionx_user transfers.
   *               paymentMethodId:
   *                 type: integer
   *                 example: 1
   *                 description: |
   *                   For bank_account channel (withdrawals). ID of the bank account from payment settings.
   *                   Use GET /api/payment-settings?type=bank_account to get user's saved bank accounts.
   *                   Required for bank_account withdrawals. The bank account must be saved in payment settings first.
   *               accountNumber:
   *                 type: string
   *                 minLength: 8
   *                 example: "1234567890"
   *                 description: |
   *                   For bank_account channel (legacy). Recipient's bank account number. 
   *                   Use paymentMethodId instead. This field is deprecated.
   *               bankName:
   *                 type: string
   *                 example: "Access Bank"
   *                 description: |
   *                   For bank_account channel (legacy). Name of the recipient's bank.
   *                   Use paymentMethodId instead. This field is deprecated.
   *               providerId:
   *                 type: integer
   *                 example: 9
   *                 description: |
   *                   For mobile_money channel. UUID of the mobile money provider.
   *                   Use GET /api/deposit/mobile-money-providers to get available providers.
   *                   Required for mobile_money transfers.
   *               phoneNumber:
   *                 type: string
   *                 minLength: 10
   *                 example: "+2348012345678"
   *                 description: |
   *                   For mobile_money channel. Recipient's mobile money phone number.
   *                   Must be at least 10 characters. Required for mobile_money transfers.
   *     responses:
   *       201:
   *         description: Transfer initiated successfully. Email OTP sent for verification.
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
   *                       description: Transaction ID. Use this to verify the transfer.
   *                     reference:
   *                       type: string
   *                       example: "TRF-NG-20241230-XYZ789"
   *                       description: Unique transaction reference
   *                     amount:
   *                       type: string
   *                       example: "200000.00"
   *                       description: Transfer amount
   *                     currency:
   *                       type: string
   *                       example: "NGN"
   *                     fee:
   *                       type: string
   *                       example: "200.00"
   *                       description: Transfer fee (0.1% or minimum fee)
   *                     totalDeduction:
   *                       type: string
   *                       example: "200200.00"
   *                       description: Total amount to be deducted (amount + fee)
   *                     status:
   *                       type: string
   *                       enum: [pending]
   *                       example: "pending"
   *                       description: Transaction status. Will be "completed" after verification.
   *                     channel:
   *                       type: string
   *                       example: "rhionx_user"
   *                     recipientInfo:
   *                       type: object
   *                       description: Recipient information (name, email, etc.)
   *                     createdAt:
   *                       type: string
   *                       format: date-time
   *       400:
   *         description: |
   *           Validation error, KYC not complete, insufficient balance, or missing channel-specific fields.
   *           Common errors:
   *           - "You cannot complete your transaction because you are yet to complete your KYC"
   *           - "Insufficient balance"
   *           - "Recipient email or user ID is required for RhionX user transfers"
   *           - "Account number and bank name are required for bank transfers"
   *           - "Provider ID and phone number are required for mobile money transfers"
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
  async initiateTransfer(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const {
        amount,
        currency,
        countryCode,
        channel,
        recipientUserId,
        recipientEmail, // For RhionX user transfers (from QR scan)
        paymentMethodId, // For bank_account withdrawals
        accountNumber, // Legacy
        bankName, // Legacy
        providerId,
        phoneNumber,
      } = req.body;

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

      // Validate channel-specific requirements
      if (channel === 'rhionx_user' && !recipientUserId && !recipientEmail) {
        return res.status(400).json({
          success: false,
          message: 'Recipient email or user ID is required for RhionX user transfers',
        });
      }

      if (channel === 'bank_account' && !paymentMethodId && (!accountNumber || !bankName)) {
        return res.status(400).json({
          success: false,
          message: 'Payment method ID is required for bank account withdrawals. Use payment method from payment settings (GET /api/payment-settings?type=bank_account)',
        });
      }

      if (channel === 'mobile_money' && (!providerId || !phoneNumber)) {
        return res.status(400).json({
          success: false,
          message: 'Provider ID and phone number are required for mobile money transfers',
        });
      }

      const result = await this.service.initiateTransfer(userId, {
        amount,
        currency,
        countryCode,
        channel,
        recipientUserId,
        recipientEmail,
        paymentMethodId,
        accountNumber,
        bankName,
        providerId,
        phoneNumber,
      });

      return res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to initiate transfer',
      });
    }
  }

  /**
   * @swagger
   * /api/transfer/verify:
   *   post:
   *     summary: Verify and complete transfer with email code and PIN
   *     tags: [Transfer]
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
   *               - emailCode
   *               - pin
   *             properties:
   *               transactionId:
   *                 type: integer
   *                 example: 1
   *               emailCode:
   *                 type: string
   *                 pattern: '^\d{5}$'
   *                 example: "12345"
   *                 description: 5-digit email verification code
   *               pin:
   *                 type: string
   *                 pattern: '^\d{5}$'
   *                 example: "12345"
   *                 description: 5-digit PIN
   *     responses:
   *       200:
   *         description: Transfer completed successfully
   *       400:
   *         description: Invalid code, PIN, or transaction error
   *         $ref: '#/components/schemas/Error'
   */
  async verifyTransfer(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { transactionId, emailCode, pin } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!transactionId || !emailCode || !pin) {
        return res.status(400).json({
          success: false,
          message: 'Transaction ID, email code, and PIN are required',
        });
      }

      // Validate PIN format
      if (!/^\d{5}$/.test(pin)) {
        return res.status(400).json({
          success: false,
          message: 'PIN must be exactly 5 digits',
        });
      }

      // Validate email code format
      if (!/^\d{5}$/.test(emailCode)) {
        return res.status(400).json({
          success: false,
          message: 'Email code must be exactly 5 digits',
        });
      }

      const result = await this.service.verifyTransfer(userId, transactionId, emailCode, pin);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to verify transfer',
      });
    }
  }

  /**
   * @swagger
   * /api/transfer/receipt/{transactionId}:
   *   get:
   *     summary: Get transfer receipt
   *     tags: [Transfer]
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
   *         description: Transfer receipt
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 data:
   *                   type: object
   *                   properties:
   *                     id:
   *                       type: string
   *                     reference:
   *                       type: string
   *                     amount:
   *                       type: string
   *                     fee:
   *                       type: string
   *                     totalAmount:
   *                       type: string
   *                     recipientInfo:
   *                       type: object
   *                     transactionId:
   *                       type: string
   *                     date:
   *                       type: string
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

      const receipt = await this.service.getTransferReceipt(userId, transactionId);

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


