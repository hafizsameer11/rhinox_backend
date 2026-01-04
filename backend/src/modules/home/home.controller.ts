import { type Request, type Response } from 'express';
import { HomeService } from './home.service.js';

/**
 * Home Controller
 * Handles HTTP requests for user home/dashboard
 */
export class HomeController {
  constructor(private service: HomeService) {}

  /**
   * @swagger
   * /api/home:
   *   get:
   *     summary: Get user home/dashboard data
   *     tags: [Home]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     description: Returns user information, wallets, balances, and transaction summary
   *     responses:
   *       200:
   *         description: Home data retrieved successfully
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
   *                     user:
   *                       type: object
   *                       properties:
   *                         id:
   *                           type: string
   *                         firstName:
   *                           type: string
   *                         lastName:
   *                           type: string
   *                         email:
   *                           type: string
   *                         phone:
   *                           type: string
   *                         country:
   *                           type: object
   *                           properties:
   *                             id:
   *                               type: string
   *                             name:
   *                               type: string
   *                             code:
   *                               type: string
   *                             flag:
   *                               type: string
   *                               example: "/uploads/flags/ng.png"
   *                         kycStatus:
   *                           type: object
   *                           properties:
   *                             tier:
   *                               type: integer
   *                             status:
   *                               type: string
   *                             faceVerificationSuccessful:
   *                               type: boolean
   *                     wallets:
   *                       type: array
   *                       items:
   *                         $ref: '#/components/schemas/Wallet'
   *                     totalBalance:
   *                       type: string
   *                       example: "2000000.00"
   *                     activeWalletsCount:
   *                       type: integer
   *                       example: 2
   *                     recentTransactionsCount:
   *                       type: integer
   *                       example: 15
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async getUserHome(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const result = await this.service.getUserHome(userId);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get home data',
      });
    }
  }

  /**
   * @swagger
   * /api/home/wallets:
   *   get:
   *     summary: Get all wallet balances
   *     tags: [Home]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     description: Returns list of all active wallets with their balances and currency information
   *     responses:
   *       200:
   *         description: Wallet balances retrieved successfully
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
   *                     $ref: '#/components/schemas/Wallet'
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async getWalletBalances(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const wallets = await this.service.getWalletBalances(userId);

      return res.json({
        success: true,
        data: wallets,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get wallet balances',
      });
    }
  }

  /**
   * @swagger
   * /api/home/transactions:
   *   get:
   *     summary: Get home transactions (fiat and crypto)
   *     description: |
   *       Returns transactions split into fiat and crypto sections.
   *       - Fiat: Shows total fiat balance and recent fiat transactions
   *       - Crypto: Shows total crypto balance in USDT (converted) and recent crypto transactions
   *       Crypto balances are converted to USDT using the price from WalletCurrency table.
   *     tags: [Home]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 10
   *         description: Maximum number of transactions to return for each type (fiat and crypto)
   *       - in: query
   *         name: fiatLimit
   *         schema:
   *           type: integer
   *           default: 10
   *         description: Maximum number of fiat transactions to return
   *       - in: query
   *         name: cryptoLimit
   *         schema:
   *           type: integer
   *           default: 10
   *         description: Maximum number of crypto transactions to return
   *     responses:
   *       200:
   *         description: Home transactions retrieved successfully
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
   *                     fiat:
   *                       type: object
   *                       properties:
   *                         totalBalance:
   *                           type: string
   *                           example: "2000000.00"
   *                         walletsCount:
   *                           type: integer
   *                           example: 3
   *                         transactionsCount:
   *                           type: integer
   *                           example: 10
   *                         recentTransactions:
   *                           type: array
   *                           items:
   *                             type: object
   *                             properties:
   *                               id:
   *                                 type: integer
   *                               type:
   *                                 type: string
   *                                 example: "deposit"
   *                               status:
   *                                 type: string
   *                                 example: "completed"
   *                               amount:
   *                                 type: string
   *                                 example: "50000"
   *                               currency:
   *                                 type: string
   *                                 example: "NGN"
   *                               currencySymbol:
   *                                 type: string
   *                                 example: "₦"
   *                               description:
   *                                 type: string
   *                                 example: "Fund Wallet"
   *                               reference:
   *                                 type: string
   *                                 example: "TXN123456"
   *                               isPositive:
   *                                 type: boolean
   *                                 example: true
   *                               formattedAmount:
   *                                 type: string
   *                                 example: "+₦50000"
   *                               createdAt:
   *                                 type: string
   *                                 format: date-time
   *                     crypto:
   *                       type: object
   *                       properties:
   *                         totalBalanceInUSDT:
   *                           type: string
   *                           example: "150.50"
   *                         walletsCount:
   *                           type: integer
   *                           example: 2
   *                         transactionsCount:
   *                           type: integer
   *                           example: 5
   *                         balances:
   *                           type: array
   *                           items:
   *                             type: object
   *                             properties:
   *                               currency:
   *                                 type: string
   *                                 example: "BTC"
   *                               blockchain:
   *                                 type: string
   *                                 example: "bitcoin"
   *                               balance:
   *                                 type: string
   *                                 example: "0.5"
   *                               balanceInUSDT:
   *                                 type: string
   *                                 example: "150.50"
   *                               priceInUSDT:
   *                                 type: string
   *                                 example: "301.00"
   *                         recentTransactions:
   *                           type: array
   *                           items:
   *                             type: object
   *                             properties:
   *                               id:
   *                                 type: integer
   *                               type:
   *                                 type: string
   *                                 example: "deposit"
   *                               status:
   *                                 type: string
   *                                 example: "completed"
   *                               amount:
   *                                 type: string
   *                                 example: "0.1"
   *                               currency:
   *                                 type: string
   *                                 example: "BTC"
   *                               amountInUSDT:
   *                                 type: string
   *                                 example: "30.10"
   *                               description:
   *                                 type: string
   *                                 example: "Crypto deposit"
   *                               isPositive:
   *                                 type: boolean
   *                                 example: true
   *                               formattedAmount:
   *                                 type: string
   *                                 example: "+0.1 BTC"
   *                               createdAt:
   *                                 type: string
   *                                 format: date-time
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async getHomeTransactions(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const { limit, fiatLimit, cryptoLimit } = req.query;

      const filters: any = {};
      if (limit) filters.limit = parseInt(limit as string, 10);
      if (fiatLimit) filters.fiatLimit = parseInt(fiatLimit as string, 10);
      if (cryptoLimit) filters.cryptoLimit = parseInt(cryptoLimit as string, 10);

      const result = await this.service.getHomeTransactions(userId, filters);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get home transactions',
      });
    }
  }
}

