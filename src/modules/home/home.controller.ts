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
}

