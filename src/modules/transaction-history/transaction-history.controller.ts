import { type Request, type Response } from 'express';
import { TransactionHistoryService } from './transaction-history.service.js';

/**
 * Transaction History Controller
 * Handles HTTP requests for transaction history
 */
export class TransactionHistoryController {
  constructor(private service: TransactionHistoryService) {}

  /**
   * @swagger
   * /api/transaction-history:
   *   get:
   *     summary: Get transaction history with chart data and filters
   *     tags: [Transaction History]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     description: |
   *       Returns comprehensive transaction history for the authenticated user including:
   *       - Summary totals (total, incoming, outgoing)
   *       - Chart data (hourly breakdown)
   *       - Fiat transactions (normalized)
   *       - Crypto transactions (normalized)
   *       
   *       Supports date filtering (Daily, Weekly, Monthly, Custom)
   *     parameters:
   *       - in: query
   *         name: period
   *         schema:
   *           type: string
   *           enum: [D, W, M, Custom]
   *           default: M
   *         description: |
   *           Time period filter:
   *           - D: Daily (today)
   *           - W: Weekly (last 7 days)
   *           - M: Monthly (last 30 days)
   *           - Custom: Use startDate and endDate
   *       - in: query
   *         name: startDate
   *         schema:
   *           type: string
   *           format: date
   *         description: Start date for custom period (YYYY-MM-DD)
   *       - in: query
   *         name: endDate
   *         schema:
   *           type: string
   *           format: date
   *         description: End date for custom period (YYYY-MM-DD)
   *       - in: query
   *         name: currency
   *         schema:
   *           type: string
   *         description: Optional currency filter (e.g., NGN, USD, BTC)
   *     responses:
   *       200:
   *         description: Transaction history with chart data
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
   *                     summary:
   *                       type: object
   *                       properties:
   *                         total:
   *                           type: string
   *                           example: "7000.23"
   *                           description: Net total (incoming - outgoing)
   *                         incoming:
   *                           type: string
   *                           example: "2000000.00"
   *                           description: Total incoming transactions
   *                         outgoing:
   *                           type: string
   *                           example: "500.00"
   *                           description: Total outgoing transactions
   *                     typeSummary:
   *                       type: array
   *                       description: Summary grouped by transaction type with currency and USD amounts
   *                       items:
   *                         type: object
   *                         properties:
   *                           type:
   *                             type: string
   *                             example: "deposit"
   *                             description: Original transaction type
   *                           normalizedType:
   *                             type: string
   *                             example: "Fund Transaction"
   *                             description: UI-friendly transaction type name
   *                           currency:
   *                             type: string
   *                             example: "NGN"
   *                             description: Currency code
   *                           amount:
   *                             type: string
   *                             example: "2000000.00"
   *                             description: Total amount in original currency
   *                           amountInUSD:
   *                             type: string
   *                             example: "2400.00"
   *                             description: Total amount converted to USD
   *                           count:
   *                             type: integer
   *                             example: 5
   *                             description: Number of transactions of this type
   *                     chartData:
   *                       type: array
   *                       description: Hourly breakdown of transactions (24 hours)
   *                       items:
   *                         type: object
   *                         properties:
   *                           hour:
   *                             type: string
   *                             example: "12 AM-1 AM"
   *                           amount:
   *                             type: string
   *                             example: "150.50"
   *                     fiat:
   *                       type: array
   *                       description: Fiat transactions (normalized)
   *                       items:
   *                         type: object
   *                         properties:
   *                           id:
   *                             type: integer
   *                           type:
   *                             type: string
   *                             example: "deposit"
   *                           normalizedType:
   *                             type: string
   *                             example: "Fund Transaction"
   *                           status:
   *                             type: string
   *                             example: "completed"
   *                           amount:
   *                             type: string
   *                             example: "2000000.00"
   *                           currency:
   *                             type: string
   *                             example: "NGN"
   *                           fee:
   *                             type: string
   *                             example: "0.00"
   *                           reference:
   *                             type: string
   *                           description:
   *                             type: string
   *                           channel:
   *                             type: string
   *                           paymentMethod:
   *                             type: string
   *                           metadata:
   *                             type: object
   *                           completedAt:
   *                             type: string
   *                             format: date-time
   *                             nullable: true
   *                           createdAt:
   *                             type: string
   *                             format: date-time
   *                           walletType:
   *                             type: string
   *                             example: "fiat"
   *                     crypto:
   *                       type: array
   *                       description: Crypto transactions (normalized)
   *                       items:
   *                         type: object
   *                         properties:
   *                           id:
   *                             type: integer
   *                           type:
   *                             type: string
   *                             example: "deposit"
   *                           normalizedType:
   *                             type: string
   *                             example: "Crypto Deposit"
   *                           status:
   *                             type: string
   *                             example: "completed"
   *                           amount:
   *                             type: string
   *                             example: "0.001"
   *                           currency:
   *                             type: string
   *                             example: "BTC"
   *                           fee:
   *                             type: string
   *                             example: "0.00"
   *                           reference:
   *                             type: string
   *                           description:
   *                             type: string
   *                           channel:
   *                             type: string
   *                           metadata:
   *                             type: object
   *                           completedAt:
   *                             type: string
   *                             format: date-time
   *                             nullable: true
   *                           createdAt:
   *                             type: string
   *                             format: date-time
   *                           walletType:
   *                             type: string
   *                             example: "crypto"
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   *       500:
   *         description: Server error
   *         $ref: '#/components/schemas/Error'
   */
  async getTransactionHistory(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      // Parse query parameters
      const period = (req.query.period as 'D' | 'W' | 'M' | 'Custom') || 'M';
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      const currency = req.query.currency as string | undefined;

      // Validate custom date range
      if (period === 'Custom') {
        if (!startDate || !endDate) {
          return res.status(400).json({
            success: false,
            message: 'startDate and endDate are required for Custom period',
          });
        }
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          return res.status(400).json({
            success: false,
            message: 'Invalid date format. Use YYYY-MM-DD',
          });
        }
        if (startDate > endDate) {
          return res.status(400).json({
            success: false,
            message: 'startDate must be before endDate',
          });
        }
      }

      const data = await this.service.getTransactionHistory(userId, {
        period,
        startDate,
        endDate,
        currency,
      });

      return res.json({
        success: true,
        data,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get transaction history',
      });
    }
  }

  /**
   * @swagger
   * /api/transaction-history/deposits:
   *   get:
   *     summary: Get fiat deposit/fund transactions with filters
   *     tags: [Transaction History]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     description: Returns fiat deposit transactions (bank transfer, mobile money, conversion, P2P) with filtering options
   *     parameters:
   *       - in: query
   *         name: currency
   *         schema:
   *           type: string
   *         description: Filter by currency (e.g., NGN, USD, KES)
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [All, Completed, Pending, Failed]
   *         description: Filter by transaction status
   *       - in: query
   *         name: type
   *         schema:
   *           type: string
   *           enum: [All, Bank Transfer, Mobile Money, Conversion, P2P Transaction]
   *         description: Filter by transaction type/channel
   *       - in: query
   *         name: period
   *         schema:
   *           type: string
   *           enum: [D, W, M, Custom]
   *           default: M
   *         description: Time period filter
   *       - in: query
   *         name: startDate
   *         schema:
   *           type: string
   *           format: date
   *         description: Start date for custom period
   *       - in: query
   *         name: endDate
   *         schema:
   *           type: string
   *           format: date
   *         description: End date for custom period
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 50
   *         description: Maximum number of transactions to return
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           default: 0
   *         description: Number of transactions to skip
   *     responses:
   *       200:
   *         description: Fiat deposit transactions
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
   *                     summary:
   *                       type: object
   *                       properties:
   *                         incoming:
   *                           type: string
   *                         count:
   *                           type: integer
   *                     transactions:
   *                       type: array
   *                       items:
   *                         type: object
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async getFiatDeposits(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const currency = req.query.currency as string | undefined;
      const status = req.query.status as string | undefined;
      const type = req.query.type as string | undefined;
      const period = (req.query.period as 'D' | 'W' | 'M' | 'Custom') || 'M';
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

      const data = await this.service.getFiatDeposits(userId, {
        currency,
        status,
        type,
        period,
        startDate,
        endDate,
        limit,
        offset,
      });

      return res.json({
        success: true,
        data,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get deposit transactions',
      });
    }
  }

  /**
   * @swagger
   * /api/transaction-history/withdrawals:
   *   get:
   *     summary: Get fiat withdrawal/send transactions with filters
   *     tags: [Transaction History]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     description: Returns fiat withdrawal and transfer transactions with filtering options
   *     parameters:
   *       - in: query
   *         name: currency
   *         schema:
   *           type: string
   *         description: Filter by currency (e.g., NGN, USD, KES)
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [All, Completed, Pending, Failed]
   *         description: Filter by transaction status
   *       - in: query
   *         name: type
   *         schema:
   *           type: string
   *           enum: [All, Send, Withdraw]
   *         description: Filter by transaction type
   *       - in: query
   *         name: period
   *         schema:
   *           type: string
   *           enum: [D, W, M, Custom]
   *           default: M
   *         description: Time period filter
   *       - in: query
   *         name: startDate
   *         schema:
   *           type: string
   *           format: date
   *         description: Start date for custom period
   *       - in: query
   *         name: endDate
   *         schema:
   *           type: string
   *           format: date
   *         description: End date for custom period
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 50
   *         description: Maximum number of transactions to return
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           default: 0
   *         description: Number of transactions to skip
   *     responses:
   *       200:
   *         description: Fiat withdrawal transactions
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
   *                     summary:
   *                       type: object
   *                       properties:
   *                         outgoing:
   *                           type: string
   *                         count:
   *                           type: integer
   *                     transactions:
   *                       type: array
   *                       items:
   *                         type: object
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async getFiatWithdrawals(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const currency = req.query.currency as string | undefined;
      const status = req.query.status as string | undefined;
      const type = req.query.type as string | undefined;
      const period = (req.query.period as 'D' | 'W' | 'M' | 'Custom') || 'M';
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

      const data = await this.service.getFiatWithdrawals(userId, {
        currency,
        status,
        type,
        period,
        startDate,
        endDate,
        limit,
        offset,
      });

      return res.json({
        success: true,
        data,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get withdrawal transactions',
      });
    }
  }

  /**
   * @swagger
   * /api/transaction-history/p2p:
   *   get:
   *     summary: Get fiat P2P transactions with filters
   *     tags: [Transaction History]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     description: Returns fiat P2P transactions (user selling crypto receiving fiat, or receiving crypto sending fiat)
   *     parameters:
   *       - in: query
   *         name: currency
   *         schema:
   *           type: string
   *         description: Filter by currency (e.g., NGN, USD, KES)
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [All, Completed, Pending, Failed]
   *         description: Filter by transaction status
   *       - in: query
   *         name: period
   *         schema:
   *           type: string
   *           enum: [D, W, M, Custom]
   *           default: M
   *         description: Time period filter
   *       - in: query
   *         name: startDate
   *         schema:
   *           type: string
   *           format: date
   *         description: Start date for custom period
   *       - in: query
   *         name: endDate
   *         schema:
   *           type: string
   *           format: date
   *         description: End date for custom period
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 50
   *         description: Maximum number of transactions to return
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           default: 0
   *         description: Number of transactions to skip
   *     responses:
   *       200:
   *         description: Fiat P2P transactions
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
   *                     summary:
   *                       type: object
   *                       properties:
   *                         total:
   *                           type: string
   *                         count:
   *                           type: integer
   *                     transactions:
   *                       type: array
   *                       items:
   *                         type: object
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async getFiatP2PTransactions(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const currency = req.query.currency as string | undefined;
      const status = req.query.status as string | undefined;
      const period = (req.query.period as 'D' | 'W' | 'M' | 'Custom') || 'M';
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

      const data = await this.service.getFiatP2PTransactions(userId, {
        currency,
        status,
        period,
        startDate,
        endDate,
        limit,
        offset,
      });

      return res.json({
        success: true,
        data,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get P2P transactions',
      });
    }
  }

  /**
   * @swagger
   * /api/transaction-history/{id}/details:
   *   get:
   *     summary: Get transaction details by ID
   *     tags: [Transaction History]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     description: Returns comprehensive transaction details including all metadata, provider info, bank account details, etc.
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Transaction ID
   *     responses:
   *       200:
   *         description: Transaction details
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 data:
   *                   type: object
   *                   description: Transaction details with type-specific fields
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   *       404:
   *         description: Transaction not found
   *         $ref: '#/components/schemas/Error'
   */
  async getTransactionDetails(req: Request, res: Response) {
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
          message: 'Transaction ID is required',
        });
      }

      const details = await this.service.getTransactionDetails(userId, id);

      return res.json({
        success: true,
        data: details,
      });
    } catch (error: any) {
      if (error.message === 'Transaction not found' || error.message === 'Unauthorized access to transaction') {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get transaction details',
      });
    }
  }

  /**
   * @swagger
   * /api/transaction-history/bill-payments:
   *   get:
   *     summary: Get bill payment transactions with filters
   *     tags: [Transaction History]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     description: Returns bill payment transactions (airtime, data, electricity, cable TV, betting, internet) with filtering options
   *     parameters:
   *       - in: query
   *         name: currency
   *         schema:
   *           type: string
   *         description: Filter by currency (e.g., NGN, USD, KES)
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [All, Completed, Pending, Failed]
   *         description: Filter by transaction status
   *       - in: query
   *         name: categoryCode
   *         schema:
   *           type: string
   *           enum: [airtime, data, electricity, cable_tv, betting, internet]
   *         description: Filter by bill payment category
   *       - in: query
   *         name: period
   *         schema:
   *           type: string
   *           enum: [D, W, M, Custom]
   *           default: M
   *         description: Time period filter
   *       - in: query
   *         name: startDate
   *         schema:
   *           type: string
   *           format: date
   *         description: Start date for custom period
   *       - in: query
   *         name: endDate
   *         schema:
   *           type: string
   *           format: date
   *         description: End date for custom period
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 50
   *         description: Maximum number of transactions to return
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           default: 0
   *         description: Number of transactions to skip
   *     responses:
   *       200:
   *         description: Bill payment transactions
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
   *                     summary:
   *                       type: object
   *                       properties:
   *                         total:
   *                           type: string
   *                         count:
   *                           type: integer
   *                     transactions:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           id:
   *                             type: integer
   *                           type:
   *                             type: string
   *                           normalizedType:
   *                             type: string
   *                           status:
   *                             type: string
   *                           amount:
   *                             type: string
   *                           currency:
   *                             type: string
   *                           fee:
   *                             type: string
   *                           totalAmount:
   *                             type: string
   *                           reference:
   *                             type: string
   *                           category:
   *                             type: object
   *                           provider:
   *                             type: object
   *                           accountNumber:
   *                             type: string
   *                           accountName:
   *                             type: string
   *                           rechargeToken:
   *                             type: string
   *                             nullable: true
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async getBillPaymentTransactions(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const currency = req.query.currency as string | undefined;
      const status = req.query.status as string | undefined;
      const categoryCode = req.query.categoryCode as string | undefined;
      const period = (req.query.period as 'D' | 'W' | 'M' | 'Custom') || 'M';
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

      const data = await this.service.getBillPaymentTransactions(userId, {
        currency,
        status,
        categoryCode,
        period,
        startDate,
        endDate,
        limit,
        offset,
      });

      return res.json({
        success: true,
        data,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get bill payment transactions',
      });
    }
  }
}

