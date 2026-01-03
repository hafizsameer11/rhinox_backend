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
      const userId = (req as any).user?.userId;

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
   *     summary: Initiate a transfer transaction
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
   *               currency:
   *                 type: string
   *                 example: "NGN"
   *               countryCode:
   *                 type: string
   *                 example: "NG"
   *               channel:
   *                 type: string
   *                 enum: [rhionx_user, bank_account, mobile_money]
   *                 example: "bank_account"
   *               recipientUserId:
   *                 type: string
   *                 description: User ID for rhionx_user channel (optional if recipientEmail is provided)
   *               recipientEmail:
   *                 type: string
   *                 format: email
   *                 example: "user@example.com"
   *                 description: Email for rhionx_user channel (from QR scan). Either recipientEmail or recipientUserId is required
   *               accountNumber:
   *                 type: string
   *                 description: Required for bank_account channel
   *               bankName:
   *                 type: string
   *                 description: Required for bank_account channel
   *               providerId:
   *                 type: string
   *                 description: Required for mobile_money channel
   *               phoneNumber:
   *                 type: string
   *                 description: Required for mobile_money channel
   *     responses:
   *       201:
   *         description: Transfer initiated successfully
   *       400:
   *         description: Validation error or KYC not complete
   *         $ref: '#/components/schemas/Error'
   */
  async initiateTransfer(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId;
      const {
        amount,
        currency,
        countryCode,
        channel,
        recipientUserId,
        recipientEmail, // For RhionX user transfers (from QR scan)
        accountNumber,
        bankName,
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

      if (channel === 'bank_account' && (!accountNumber || !bankName)) {
        return res.status(400).json({
          success: false,
          message: 'Account number and bank name are required for bank transfers',
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
   *                 type: string
   *                 example: "transaction-uuid"
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
      const userId = (req as any).user?.userId;
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
   *           type: string
   *         example: "transaction-uuid"
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


