import { type Request, type Response } from 'express';
import { CryptoService } from './crypto.service.js';

/**
 * Crypto Controller
 * Handles HTTP requests for crypto operations
 */
export class CryptoController {
  constructor(private service: CryptoService) {}

  /**
   * @swagger
   * /api/crypto/virtual-accounts:
   *   get:
   *     summary: Get user's virtual accounts
   *     tags: [Crypto]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     responses:
   *       200:
   *         description: List of virtual accounts
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
   *                       blockchain:
   *                         type: string
   *                       currency:
   *                         type: string
   *                       accountBalance:
   *                         type: string
   *                       availableBalance:
   *                         type: string
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   */
  async getVirtualAccounts(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const virtualAccounts = await this.service.getUserVirtualAccounts(userId);

      return res.json({
        success: true,
        data: virtualAccounts.map((va: { id: number; accountId: string; blockchain: string; currency: string; accountBalance: any; availableBalance: any; active: boolean; frozen: boolean; depositAddresses: Array<{ address: string; currency: string; blockchain: string }> }) => ({
          id: va.id,
          accountId: va.accountId,
          blockchain: va.blockchain,
          currency: va.currency,
          accountBalance: va.accountBalance,
          availableBalance: va.availableBalance,
          active: va.active,
          frozen: va.frozen,
          depositAddresses: va.depositAddresses.map((da: { address: string; currency: string; blockchain: string }) => ({
            address: da.address,
            currency: da.currency,
            blockchain: da.blockchain,
          })),
        })),
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get virtual accounts',
      });
    }
  }

  /**
   * @swagger
   * /api/crypto/deposit-address/{currency}/{blockchain}:
   *   get:
   *     summary: Get deposit address for a currency and blockchain
   *     tags: [Crypto]
   *     security:
   *       - bearerAuth: []
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: currency
   *         required: true
   *         schema:
   *           type: string
   *         example: "USDT"
   *       - in: path
   *         name: blockchain
   *         required: true
   *         schema:
   *           type: string
   *         example: "ethereum"
   *     responses:
   *       200:
   *         description: Deposit address
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
   *                     address:
   *                       type: string
   *                       example: "0x..."
   *                     currency:
   *                       type: string
   *                     blockchain:
   *                       type: string
   *       401:
   *         description: Unauthorized
   *         $ref: '#/components/schemas/Error'
   *       404:
   *         description: Virtual account not found
   *         $ref: '#/components/schemas/Error'
   */
  async getDepositAddress(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || (req as any).user?.userId || (req as any).user?.id;
      const { currency, blockchain } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!currency || !blockchain) {
        return res.status(400).json({
          success: false,
          message: 'Currency and blockchain are required',
        });
      }

      const depositAddress = await this.service.getDepositAddress(userId, currency, blockchain);

      return res.json({
        success: true,
        data: depositAddress,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to get deposit address',
      });
    }
  }

  /**
   * @swagger
   * /api/crypto/usdt-tokens:
   *   get:
   *     summary: Get all USDT tokens across different blockchains
   *     tags: [Crypto]
   *     description: Returns all USDT token variants (Ethereum, TRON, BSC, Solana, Polygon, etc.) as a unified list. Public endpoint, no authentication required.
   *     responses:
   *       200:
   *         description: List of USDT tokens
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
   *                       blockchain:
   *                         type: string
   *                         example: "ethereum"
   *                       blockchainName:
   *                         type: string
   *                         example: "Ethereum"
   *                       currency:
   *                         type: string
   *                         example: "USDT"
   *                       symbol:
   *                         type: string
   *                         example: "USDT"
   *                       name:
   *                         type: string
   *                         example: "Tether USD"
   *                       displayName:
   *                         type: string
   *                         example: "USDT (Ethereum)"
   *                       contractAddress:
   *                         type: string
   *                         nullable: true
   *                         example: "0xdac17f958d2ee523a2206206994597c13d831ec7"
   *                       decimals:
   *                         type: number
   *                         example: 6
   *                       isToken:
   *                         type: boolean
   *                         example: true
   *                       price:
   *                         type: string
   *                         nullable: true
   *                       nairaPrice:
   *                         type: string
   *                         nullable: true
   */
  async getUSDTTokens(req: Request, res: Response) {
    try {
      const tokens = await this.service.getUSDTTokens();

      return res.json({
        success: true,
        data: tokens,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get USDT tokens',
      });
    }
  }

  /**
   * @swagger
   * /api/crypto/tokens/{symbol}:
   *   get:
   *     summary: Get all tokens for a given symbol across different blockchains
   *     tags: [Crypto]
   *     description: Returns all token variants for a symbol (e.g., USDT, USDC) across different blockchains. Public endpoint, no authentication required.
   *     parameters:
   *       - in: path
   *         name: symbol
   *         required: true
   *         schema:
   *           type: string
   *         example: "USDT"
   *     responses:
   *       200:
   *         description: List of tokens for the symbol
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
   *                       blockchain:
   *                         type: string
   *                       blockchainName:
   *                         type: string
   *                       currency:
   *                         type: string
   *                       symbol:
   *                         type: string
   *                       name:
   *                         type: string
   *                       displayName:
   *                         type: string
   *                       contractAddress:
   *                         type: string
   *                         nullable: true
   *                       decimals:
   *                         type: number
   *                       isToken:
   *                         type: boolean
   *       400:
   *         description: Invalid symbol
   *         $ref: '#/components/schemas/Error'
   */
  async getTokensBySymbol(req: Request, res: Response) {
    try {
      const { symbol } = req.params;

      if (!symbol) {
        return res.status(400).json({
          success: false,
          message: 'Symbol is required',
        });
      }

      const tokens = await this.service.getTokensBySymbol(symbol);

      return res.json({
        success: true,
        data: tokens,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get tokens',
      });
    }
  }
}

