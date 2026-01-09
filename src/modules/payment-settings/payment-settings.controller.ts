import { type Request, type Response } from 'express';
import { PaymentSettingsService } from './payment-settings.service.js';

/**
 * Payment Settings Controller
 * Handles HTTP requests for payment method management
 */
export class PaymentSettingsController {
  constructor(private service: PaymentSettingsService) {}

  /**
   * @swagger
   * /api/payment-settings:
   *   get:
   *     summary: Get all user payment methods
   *     tags: [Payment Settings]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: query
   *         name: type
   *         schema:
   *           type: string
   *           enum: [bank_account, mobile_money]
   *         description: Filter by payment method type
   *     responses:
   *       200:
   *         description: List of payment methods
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
   *                       type:
   *                         type: string
   *                         enum: [bank_account, mobile_money]
   *                       accountType:
   *                         type: string
   *                       bankName:
   *                         type: string
   *                       accountNumber:
   *                         type: string
   *                         description: Masked account number
   *                       accountName:
   *                         type: string
   *                       provider:
   *                         type: object
   *                         nullable: true
   *                       phoneNumber:
   *                         type: string
   *                         description: Masked phone number
   *                       countryCode:
   *                         type: string
   *                       currency:
   *                         type: string
   *                       isDefault:
   *                         type: boolean
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async getPaymentMethods(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { type } = req.query;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const result = await this.service.getUserPaymentMethods(
        userId,
        type as 'bank_account' | 'mobile_money' | undefined
      );

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to get payment methods',
      });
    }
  }

  /**
   * @swagger
   * /api/payment-settings/{id}:
   *   get:
   *     summary: Get a single payment method by ID
   *     tags: [Payment Settings]
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
   *     responses:
   *       200:
   *         description: Payment method details
   *       404:
   *         description: Payment method not found
   *         $ref: '#/components/schemas/Error'
   */
  async getPaymentMethod(req: Request, res: Response) {
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
          message: 'Payment method ID is required',
        });
      }

      const result = await this.service.getPaymentMethod(userId, id);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(404).json({
        success: false,
        message: error.message || 'Payment method not found',
      });
    }
  }

  /**
   * @swagger
   * /api/payment-settings/bank-account:
   *   post:
   *     summary: Add a new bank account payment method
   *     tags: [Payment Settings]
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
   *               - accountType
   *               - bankName
   *               - accountNumber
   *               - accountName
   *               - countryCode
   *               - currency
   *             properties:
   *               accountType:
   *                 type: string
   *                 example: "savings"
   *                 description: Account type (savings, current, etc.)
   *               bankName:
   *                 type: string
   *                 example: "Opay"
   *               accountNumber:
   *                 type: string
   *                 example: "1234567890"
   *               accountName:
   *                 type: string
   *                 example: "Qamardeen Abdul Malik"
   *               countryCode:
   *                 type: string
   *                 example: "NG"
   *               currency:
   *                 type: string
   *                 example: "NGN"
   *               isDefault:
   *                 type: boolean
   *                 example: false
   *     responses:
   *       201:
   *         description: Bank account added successfully
   *       400:
   *         description: Validation error
   *         $ref: '#/components/schemas/Error'
   */
  async addBankAccount(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const {
        accountType,
        bankName,
        accountNumber,
        accountName,
        countryCode,
        currency,
        isDefault,
      } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!accountType || !bankName || !accountNumber || !accountName || !countryCode || !currency) {
        return res.status(400).json({
          success: false,
          message: 'All fields are required',
        });
      }

      const result = await this.service.addBankAccount(userId, {
        accountType,
        bankName,
        accountNumber,
        accountName,
        countryCode,
        currency,
        isDefault,
      });

      return res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to add bank account',
      });
    }
  }

  /**
   * @swagger
   * /api/payment-settings/mobile-money:
   *   post:
   *     summary: Add a new mobile money payment method
   *     tags: [Payment Settings]
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
   *               - providerId
   *               - phoneNumber
   *               - countryCode
   *               - currency
   *             properties:
   *               providerId:
   *                 type: integer
   *                 example: 9
   *                 description: Mobile money provider ID
   *               phoneNumber:
   *                 type: string
   *                 example: "08012345678"
   *               countryCode:
   *                 type: string
   *                 example: "NG"
   *               currency:
   *                 type: string
   *                 example: "NGN"
   *               isDefault:
   *                 type: boolean
   *                 example: false
   *     responses:
   *       201:
   *         description: Mobile money account added successfully
   *       400:
   *         description: Validation error
   *         $ref: '#/components/schemas/Error'
   */
  async addMobileMoney(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const {
        providerId,
        phoneNumber,
        countryCode,
        currency,
        isDefault,
      } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!providerId || !phoneNumber || !countryCode || !currency) {
        return res.status(400).json({
          success: false,
          message: 'All fields are required',
        });
      }

      const result = await this.service.addMobileMoney(userId, {
        providerId,
        phoneNumber,
        countryCode,
        currency,
        isDefault,
      });

      return res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to add mobile money account',
      });
    }
  }

  /**
   * @swagger
   * /api/payment-settings/rhinoxpay-id:
   *   post:
   *     summary: Add Rhinox Pay ID as a payment method
   *     description: |
   *       Adds Rhinox Pay ID as a payment method. This allows users to receive payments
   *       directly to their Rhinox Pay wallet. The payment method will use the user's
   *       email as the identifier.
   *     tags: [Payment Settings]
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
   *               - countryCode
   *               - currency
   *             properties:
   *               countryCode:
   *                 type: string
   *                 example: "NG"
   *                 description: Country code for the payment method
   *               currency:
   *                 type: string
   *                 example: "NGN"
   *                 description: Currency for the payment method
   *               isDefault:
   *                 type: boolean
   *                 example: false
   *                 description: Set as default payment method
   *     responses:
   *       201:
   *         description: Rhinox Pay ID added successfully
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
   *                     type:
   *                       type: string
   *                       example: "rhinoxpay_id"
   *                     accountName:
   *                       type: string
   *                       example: "John Doe"
   *                     countryCode:
   *                       type: string
   *                       example: "NG"
   *                     currency:
   *                       type: string
   *                       example: "NGN"
   *                     isDefault:
   *                       type: boolean
   *                       example: false
   *                     message:
   *                       type: string
   *                       example: "Rhinox Pay ID added successfully"
   *       400:
   *         description: Validation error
   *         $ref: '#/components/schemas/Error'
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async addRhinoxPayID(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { countryCode, currency, isDefault } = req.body;

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

      const result = await this.service.addRhinoxPayID(userId, {
        countryCode,
        currency,
        isDefault,
      });

      return res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to add Rhinox Pay ID',
      });
    }
  }

  /**
   * @swagger
   * /api/payment-settings/{id}:
   *   put:
   *     summary: Update a payment method
   *     tags: [Payment Settings]
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
   *               accountType:
   *                 type: string
   *               bankName:
   *                 type: string
   *               accountNumber:
   *                 type: string
   *               accountName:
   *                 type: string
   *               phoneNumber:
   *                 type: string
   *               isDefault:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: Payment method updated successfully
   *       404:
   *         description: Payment method not found
   *         $ref: '#/components/schemas/Error'
   */
  async updatePaymentMethod(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { id } = req.params;
      const {
        accountType,
        bankName,
        accountNumber,
        accountName,
        phoneNumber,
        isDefault,
      } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Payment method ID is required',
        });
      }

      const result = await this.service.updatePaymentMethod(userId, id, {
        accountType,
        bankName,
        accountNumber,
        accountName,
        phoneNumber,
        isDefault,
      });

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(404).json({
        success: false,
        message: error.message || 'Failed to update payment method',
      });
    }
  }

  /**
   * @swagger
   * /api/payment-settings/{id}/set-default:
   *   post:
   *     summary: Set a payment method as default
   *     tags: [Payment Settings]
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
   *         description: Default payment method updated
   *       404:
   *         description: Payment method not found
   *         $ref: '#/components/schemas/Error'
   */
  async setDefaultPaymentMethod(req: Request, res: Response) {
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
          message: 'Payment method ID is required',
        });
      }

      const result = await this.service.setDefaultPaymentMethod(userId, id);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(404).json({
        success: false,
        message: error.message || 'Failed to set default payment method',
      });
    }
  }

  /**
   * @swagger
   * /api/payment-settings/{id}:
   *   delete:
   *     summary: Delete a payment method
   *     tags: [Payment Settings]
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
   *         description: Payment method deleted successfully
   *       404:
   *         description: Payment method not found
   *         $ref: '#/components/schemas/Error'
   */
  async deletePaymentMethod(req: Request, res: Response) {
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
          message: 'Payment method ID is required',
        });
      }

      const result = await this.service.deletePaymentMethod(userId, id);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(404).json({
        success: false,
        message: error.message || 'Failed to delete payment method',
      });
    }
  }

  /**
   * @swagger
   * /api/payment-settings/mobile-money-providers:
   *   get:
   *     summary: Get available mobile money providers
   *     tags: [Payment Settings]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: query
   *         name: countryCode
   *         schema:
   *           type: string
   *         description: Filter by country code
   *       - in: query
   *         name: currency
   *         schema:
   *           type: string
   *         description: Filter by currency
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
   *                 data:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       id:
   *                         type: string
   *                       name:
   *                         type: string
   *                       code:
   *                         type: string
   *                       countryCode:
   *                         type: string
   *                       currency:
   *                         type: string
   *                       logoUrl:
   *                         type: string
   *                         nullable: true
   */
  async getMobileMoneyProviders(req: Request, res: Response) {
    try {
      const { countryCode, currency } = req.query;

      const result = await this.service.getMobileMoneyProviders(
        countryCode as string | undefined,
        currency as string | undefined
      );

      return res.json({
        success: true,
        data: result,
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
   * /api/payment-settings/banks:
   *   get:
   *     summary: Get available banks
   *     description: |
   *       Retrieves a list of available banks filtered by country code and/or currency.
   *       This endpoint is useful for populating bank selection dropdowns when adding
   *       bank account payment methods.
   *     tags: [Payment Settings]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: query
   *         name: countryCode
   *         schema:
   *           type: string
   *           example: "NG"
   *         description: Filter banks by country code (optional)
   *       - in: query
   *         name: currency
   *         schema:
   *           type: string
   *           example: "NGN"
   *         description: Filter banks by currency (optional)
   *     responses:
   *       200:
   *         description: List of available banks
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
   *                       name:
   *                         type: string
   *                         example: "Access Bank"
   *                       countryCode:
   *                         type: string
   *                         example: "NG"
   *                       currency:
   *                         type: string
   *                         example: "NGN"
   *       500:
   *         description: Internal server error
   *         $ref: '#/components/schemas/Error'
   */
  async getBanks(req: Request, res: Response) {
    try {
      const { countryCode, currency } = req.query;

      const result = await this.service.getBanks(
        countryCode as string | undefined,
        currency as string | undefined
      );

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get banks',
      });
    }
  }
}

