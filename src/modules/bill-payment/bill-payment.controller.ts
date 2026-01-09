import { type Request, type Response } from 'express';
import { BillPaymentService } from './bill-payment.service.js';

/**
 * Bill Payment Controller
 * Handles HTTP requests for bill payments
 */
export class BillPaymentController {
  constructor(private service: BillPaymentService) {}

  /**
   * @swagger
   * /api/bill-payment/categories:
   *   get:
   *     summary: Get all bill payment categories
   *     tags: [Bill Payment]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     responses:
   *       200:
   *         description: List of categories
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
   *                         type: integer
   *                       code:
   *                         type: string
   *                       name:
   *                         type: string
   *                       description:
   *                         type: string
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async getCategories(req: Request, res: Response) {
    try {
      const categories = await this.service.getCategories();
      return res.json({
        success: true,
        data: categories,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get categories',
      });
    }
  }

  /**
   * @swagger
   * /api/bill-payment/providers:
   *   get:
   *     summary: Get providers by category
   *     tags: [Bill Payment]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: query
   *         name: categoryCode
   *         required: true
   *         schema:
   *           type: string
   *         example: "airtime"
   *       - in: query
   *         name: countryCode
   *         schema:
   *           type: string
   *         example: "NG"
   *     responses:
   *       200:
   *         description: List of providers
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async getProviders(req: Request, res: Response) {
    try {
      const { categoryCode, countryCode } = req.query;
      if (!categoryCode) {
        return res.status(400).json({
          success: false,
          message: 'categoryCode is required',
        });
      }

      const providers = await this.service.getProvidersByCategory(
        categoryCode as string,
        countryCode as string | undefined
      );
      return res.json({
        success: true,
        data: providers,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get providers',
      });
    }
  }

  /**
   * @swagger
   * /api/bill-payment/plans:
   *   get:
   *     summary: Get plans/bundles by provider
   *     tags: [Bill Payment]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: query
   *         name: providerId
   *         required: true
   *         schema:
   *           type: integer
   *         example: 1
   *     responses:
   *       200:
   *         description: List of plans
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async getPlans(req: Request, res: Response) {
    try {
      const { providerId } = req.query;
      if (!providerId) {
        return res.status(400).json({
          success: false,
          message: 'providerId is required',
        });
      }

      const plans = await this.service.getPlansByProvider(parseInt(providerId as string, 10));
      return res.json({
        success: true,
        data: plans,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get plans',
      });
    }
  }

  /**
   * @swagger
   * /api/bill-payment/validate-meter:
   *   post:
   *     summary: Validate meter number (electricity)
   *     tags: [Bill Payment]
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
   *               - meterNumber
   *               - accountType
   *             properties:
   *               providerId:
   *                 type: integer
   *               meterNumber:
   *                 type: string
   *               accountType:
   *                 type: string
   *                 enum: [prepaid, postpaid]
   *     responses:
   *       200:
   *         description: Meter validation result
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async validateMeter(req: Request, res: Response) {
    try {
      const { providerId, meterNumber, accountType } = req.body;
      if (!providerId || !meterNumber || !accountType) {
        return res.status(400).json({
          success: false,
          message: 'providerId, meterNumber, and accountType are required',
        });
      }

      const result = await this.service.validateMeterNumber(
        providerId,
        meterNumber,
        accountType
      );
      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to validate meter',
      });
    }
  }

  /**
   * @swagger
   * /api/bill-payment/validate-account:
   *   post:
   *     summary: Validate account number (betting)
   *     tags: [Bill Payment]
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
   *               - accountNumber
   *             properties:
   *               providerId:
   *                 type: integer
   *               accountNumber:
   *                 type: string
   *     responses:
   *       200:
   *         description: Account validation result
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async validateAccount(req: Request, res: Response) {
    try {
      const { providerId, accountNumber } = req.body;
      if (!providerId || !accountNumber) {
        return res.status(400).json({
          success: false,
          message: 'providerId and accountNumber are required',
        });
      }

      const result = await this.service.validateAccountNumber(providerId, accountNumber);
      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to validate account',
      });
    }
  }

  /**
   * @swagger
   * /api/bill-payment/initiate:
   *   post:
   *     summary: Initiate bill payment (creates pending transaction, returns transaction ID)
   *     tags: [Bill Payment]
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
   *               - categoryCode
   *               - providerId
   *               - currency
   *               - amount
   *             properties:
   *               categoryCode:
   *                 type: string
   *               providerId:
   *                 type: integer
   *               currency:
   *                 type: string
   *               amount:
   *                 type: string
   *               accountNumber:
   *                 type: string
   *               accountType:
   *                 type: string
   *               planId:
   *                 type: integer
   *               beneficiaryId:
   *                 type: integer
   *     responses:
   *       200:
   *         description: Payment summary
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async initiatePayment(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const summary = await this.service.initiateBillPayment(userId, req.body);
      return res.json({
        success: true,
        data: summary,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to initiate payment',
      });
    }
  }

  /**
   * @swagger
   * /api/bill-payment/confirm:
   *   post:
   *     summary: Confirm bill payment (completes pending transaction)
   *     tags: [Bill Payment]
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
   *                 description: Transaction ID from initiate endpoint
   *               pin:
   *                 type: string
   *                 description: User PIN for authorization
   *     responses:
   *       200:
   *         description: Payment confirmed
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async confirmPayment(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const { transactionId, pin } = req.body;
      if (!transactionId || !pin) {
        return res.status(400).json({
          success: false,
          message: 'transactionId and pin are required',
        });
      }

      const result = await this.service.confirmBillPayment(userId, transactionId, pin);
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
   * /api/bill-payment/beneficiaries:
   *   get:
   *     summary: Get user's beneficiaries
   *     tags: [Bill Payment]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: query
   *         name: categoryCode
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: List of beneficiaries
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async getBeneficiaries(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const { categoryCode } = req.query;
      const beneficiaries = await this.service.getBeneficiaries(
        userId,
        categoryCode as string | undefined
      );
      return res.json({
        success: true,
        data: beneficiaries,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get beneficiaries',
      });
    }
  }

  /**
   * @swagger
   * /api/bill-payment/beneficiaries:
   *   post:
   *     summary: Create beneficiary
   *     tags: [Bill Payment]
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
   *               - categoryCode
   *               - providerId
   *               - accountNumber
   *             properties:
   *               categoryCode:
   *                 type: string
   *               providerId:
   *                 type: integer
   *               name:
   *                 type: string
   *               accountNumber:
   *                 type: string
   *               accountType:
   *                 type: string
   *     responses:
   *       200:
   *         description: Beneficiary created
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async createBeneficiary(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const beneficiary = await this.service.createBeneficiary(userId, req.body);
      return res.json({
        success: true,
        data: beneficiary,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create beneficiary',
      });
    }
  }

  /**
   * @swagger
   * /api/bill-payment/beneficiaries/{id}:
   *   put:
   *     summary: Update beneficiary
   *     tags: [Bill Payment]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *               accountNumber:
   *                 type: string
   *               accountType:
   *                 type: string
   *     responses:
   *       200:
   *         description: Beneficiary updated
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async updateBeneficiary(req: Request, res: Response) {
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
          message: 'Beneficiary ID is required',
        });
      }

      const beneficiary = await this.service.updateBeneficiary(
        userId.toString(),
        parseInt(id, 10),
        req.body
      );
      return res.json({
        success: true,
        data: beneficiary,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to update beneficiary',
      });
    }
  }

  /**
   * @swagger
   * /api/bill-payment/beneficiaries/{id}:
   *   delete:
   *     summary: Delete beneficiary
   *     tags: [Bill Payment]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Beneficiary deleted
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async deleteBeneficiary(req: Request, res: Response) {
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
          message: 'Beneficiary ID is required',
        });
      }

      const result = await this.service.deleteBeneficiary(userId.toString(), parseInt(id, 10));
      return res.json(result);
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to delete beneficiary',
      });
    }
  }
}

