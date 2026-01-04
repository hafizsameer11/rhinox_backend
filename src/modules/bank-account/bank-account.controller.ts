import { type Request, type Response } from 'express';
import { BankAccountService } from './bank-account.service.js';

/**
 * Bank Account Controller
 * Handles HTTP requests for public bank account information
 */
export class BankAccountController {
  constructor(private service: BankAccountService) {}

  /**
   * @swagger
   * /api/bank-accounts:
   *   get:
   *     summary: Get all active bank accounts (PUBLIC)
   *     description: |
   *       Public endpoint to retrieve all active bank accounts for deposits.
   *       Users can see bank account details to make deposits.
   *       No authentication required.
   *     tags: [Bank Accounts]
   *     parameters:
   *       - in: query
   *         name: countryCode
   *         required: false
   *         schema:
   *           type: string
   *           minLength: 2
   *           maxLength: 2
   *         example: "NG"
   *         description: Filter by country code (e.g., NG, KE, GH)
   *       - in: query
   *         name: currency
   *         required: false
   *         schema:
   *           type: string
   *           minLength: 3
   *           maxLength: 3
   *         example: "NGN"
   *         description: Filter by currency code (e.g., NGN, KES, GHS)
   *     responses:
   *       200:
   *         description: List of active bank accounts
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
   *                         description: Bank account ID
   *                       countryCode:
   *                         type: string
   *                         example: "NG"
   *                         description: Country code
   *                       currency:
   *                         type: string
   *                         example: "NGN"
   *                         description: Currency code
   *                       bankName:
   *                         type: string
   *                         example: "Access Bank"
   *                         description: Bank name
   *                       accountNumber:
   *                         type: string
   *                         example: "0012345678"
   *                         description: Bank account number
   *                       accountName:
   *                         type: string
   *                         example: "Rhinox Pay Limited"
   *                         description: Account holder name
   *                       createdAt:
   *                         type: string
   *                         format: date-time
   *                         description: Account creation date
   *       400:
   *         description: Validation error
   *         $ref: '#/components/schemas/Error'
   */
  async getBankAccounts(req: Request, res: Response) {
    try {
      const { countryCode, currency } = req.query;

      const bankAccounts = await this.service.getBankAccounts(
        countryCode as string | undefined,
        currency as string | undefined
      );

      return res.json({
        success: true,
        data: bankAccounts,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to get bank accounts',
      });
    }
  }
}

