import { type Request, type Response } from 'express';
import { WalletService } from './wallet.service.js';

/**
 * Wallet Controller
 * Handles HTTP requests for wallet operations
 */
export class WalletController {
  constructor(private service: WalletService) {}

  /**
   * @swagger
   * /api/wallets:
   *   get:
   *     summary: Get all user wallets
   *     tags: [Wallet]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     responses:
   *       200:
   *         description: List of user wallets
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
  async getUserWallets(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const wallets = await this.service.getUserWallets(userId);

      return res.json({
        success: true,
        data: wallets,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get wallets',
      });
    }
  }

  /**
   * @swagger
   * /api/wallets/{currency}:
   *   get:
   *     summary: Get wallet by currency code
   *     tags: [Wallet]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: currency
   *         required: true
   *         schema:
   *           type: string
   *         example: NGN
   *         description: Currency code (NGN, USD, EUR, etc.)
   *     responses:
   *       200:
   *         description: Wallet information
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   $ref: '#/components/schemas/Wallet'
   *       404:
   *         description: Wallet not found
   *         $ref: '#/components/schemas/Error'
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async getWalletByCurrency(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { currency } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!currency) {
        return res.status(400).json({
          success: false,
          message: 'Currency is required',
        });
      }

      const wallet = await this.service.getWalletByCurrency(userId, currency);

      return res.json({
        success: true,
        data: wallet,
      });
    } catch (error: any) {
      return res.status(404).json({
        success: false,
        message: error.message || 'Wallet not found',
      });
    }
  }

  /**
   * @swagger
   * /api/wallets/create:
   *   post:
   *     summary: Create a new wallet
   *     tags: [Wallet]
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
   *               - currency
   *             properties:
   *               currency:
   *                 type: string
   *                 example: "NGN"
   *                 description: Currency code
   *               type:
   *                 type: string
   *                 enum: [fiat, crypto]
   *                 example: "fiat"
   *                 default: "fiat"
   *     responses:
   *       201:
   *         description: Wallet created successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   $ref: '#/components/schemas/Wallet'
   *       400:
   *         description: Wallet already exists or validation error
   *         $ref: '#/components/schemas/Error'
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async createWallet(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { currency, type } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!currency) {
        return res.status(400).json({
          success: false,
          message: 'Currency is required',
        });
      }

      const wallet = await this.service.createWallet(userId, currency, type || 'fiat');

      return res.status(201).json({
        success: true,
        data: wallet,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create wallet',
      });
    }
  }

  /**
   * @swagger
   * /api/wallets/{walletId}/balance:
   *   get:
   *     summary: Get wallet balance
   *     tags: [Wallet]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: walletId
   *         required: true
   *         schema:
   *           type: string
   *         example: 1
   *     responses:
   *       200:
   *         description: Wallet balance information
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
   *                     currency:
   *                       type: string
   *                     balance:
   *                       type: string
   *                       example: "1000.00"
   *                     lockedBalance:
   *                       type: string
   *                       example: "0.00"
   *                     availableBalance:
   *                       type: string
   *                       example: "1000.00"
   *       404:
   *         description: Wallet not found
   *         $ref: '#/components/schemas/Error'
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async getBalance(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { walletId } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!walletId) {
        return res.status(400).json({
          success: false,
          message: 'Wallet ID is required',
        });
      }

      const balance = await this.service.getBalance(walletId, userId);

      return res.json({
        success: true,
        data: balance,
      });
    } catch (error: any) {
      return res.status(404).json({
        success: false,
        message: error.message || 'Failed to get balance',
      });
    }
  }

  /**
   * @swagger
   * /api/wallets/{walletId}/transactions:
   *   get:
   *     summary: Get wallet transactions
   *     tags: [Wallet]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: walletId
   *         required: true
   *         schema:
   *           type: string
   *         example: 1
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 50
   *         description: Number of transactions to return
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           default: 0
   *         description: Number of transactions to skip
   *     responses:
   *       200:
   *         description: List of transactions
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
   *                         example: "deposit"
   *                       status:
   *                         type: string
   *                         example: "completed"
   *                       amount:
   *                         type: string
   *                         example: "100.00"
   *                       currency:
   *                         type: string
   *                         example: "NGN"
   *                       reference:
   *                         type: string
   *                       createdAt:
   *                         type: string
   *                         format: date-time
   *       404:
   *         description: Wallet not found
   *         $ref: '#/components/schemas/Error'
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async getTransactions(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { walletId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!walletId) {
        return res.status(400).json({
          success: false,
          message: 'Wallet ID is required',
        });
      }

      const transactions = await this.service.getTransactions(walletId, userId, limit, offset);

      return res.json({
        success: true,
        data: transactions,
      });
    } catch (error: any) {
      return res.status(404).json({
        success: false,
        message: error.message || 'Failed to get transactions',
      });
    }
  }

  /**
   * @swagger
   * /api/wallets/balances:
   *   get:
   *     summary: Get all wallet balances (fiat + crypto) with USDT conversion
   *     tags: [Wallet]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     description: |
   *       Returns all fiat and crypto wallet balances.
   *       Crypto balances are converted to USDT using prices from wallet_currencies table.
   *       Total crypto balance in USDT and NGN (if rate exists) is also provided.
   *     responses:
   *       200:
   *         description: All wallet balances with USDT conversion
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
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           id:
   *                             type: integer
   *                           type:
   *                             type: string
   *                             example: "fiat"
   *                           currency:
   *                             type: string
   *                             example: "NGN"
   *                           balance:
   *                             type: string
   *                           availableBalance:
   *                             type: string
   *                     crypto:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           id:
   *                             type: integer
   *                           type:
   *                             type: string
   *                             example: "crypto"
   *                           currency:
   *                             type: string
   *                             example: "USDT"
   *                           blockchain:
   *                             type: string
   *                             example: "ethereum"
   *                           balance:
   *                             type: string
   *                           balanceInUSDT:
   *                             type: string
   *                             description: Balance converted to USDT
   *                           priceInUSDT:
   *                             type: string
   *                             description: Price of 1 unit in USDT
   *                     totals:
   *                       type: object
   *                       properties:
   *                         cryptoInUSDT:
   *                           type: string
   *                           description: Total crypto balance in USDT
   *                         cryptoInNGN:
   *                           type: string
   *                           nullable: true
   *                           description: Total crypto balance in NGN (if USDT to NGN rate exists)
   *                         usdtToNgnRate:
   *                           type: string
   *                           nullable: true
   *                           description: USDT to NGN exchange rate
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async getAllBalances(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const balances = await this.service.getAllBalances(userId);

      return res.json({
        success: true,
        data: balances,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get balances',
      });
    }
  }
}

