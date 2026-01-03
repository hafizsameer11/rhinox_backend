import { type Request, type Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../../core/config/database.js';
import { DepositAddressService } from '../../services/tatum/deposit-address.service.js';
import { VirtualAccountService } from '../../services/tatum/virtual-account.service.js';

/**
 * Webhook Controller
 * Handles Tatum webhook events
 */
export class WebhookController {
  private depositAddressService: DepositAddressService;
  private virtualAccountService: VirtualAccountService;

  constructor() {
    this.depositAddressService = new DepositAddressService();
    this.virtualAccountService = new VirtualAccountService();
  }

  /**
   * @swagger
   * /api/crypto/webhooks/tatum:
   *   post:
   *     summary: Receive Tatum webhook events
   *     tags: [Crypto]
   *     description: Processes incoming webhook events from Tatum for deposits. This endpoint is called by Tatum when a deposit is detected.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               subscriptionType:
   *                 type: string
   *                 enum: [INCOMING_NATIVE_TX, INCOMING_FUNGIBLE_TX, ADDRESS_EVENT]
   *                 example: "INCOMING_NATIVE_TX"
   *               address:
   *                 type: string
   *                 example: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
   *               counterAddress:
   *                 type: string
   *                 example: "0x..."
   *               amount:
   *                 type: string
   *                 example: "100.0"
   *               txId:
   *                 type: string
   *                 example: "0x..."
   *               blockNumber:
   *                 type: number
   *                 example: 12345
   *               contractAddress:
   *                 type: string
   *                 example: "0x..." 
   *                 description: "For token transfers"
   *               timestamp:
   *                 type: number
   *                 example: 1234567890
   *     responses:
   *       200:
   *         description: Webhook received and queued for processing
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 message:
   *                   type: string
   *                   example: "Webhook received"
   *       500:
   *         description: Failed to process webhook
   *         $ref: '#/components/schemas/Error'
   */
  async handleWebhook(req: Request, res: Response) {
    try {
      // Save raw webhook
      const rawWebhook = await prisma.tatumRawWebhook.create({
        data: {
          rawData: JSON.stringify(req.body),
          headers: JSON.stringify(req.headers),
          ipAddress: req.ip || req.socket.remoteAddress,
          userAgent: req.get('user-agent'),
        },
      });

      // Process webhook asynchronously
      this.processWebhook(req.body, rawWebhook.id).catch(error => {
        console.error('Webhook processing error:', error);
      });

      // Return immediately
      return res.status(200).json({
        success: true,
        message: 'Webhook received',
      });
    } catch (error: any) {
      console.error('Webhook handler error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to process webhook',
      });
    }
  }

  /**
   * Process webhook event
   */
  private async processWebhook(webhookData: any, rawWebhookId: string) {
    try {
      // Save webhook response
      await prisma.webhookResponse.create({
        data: {
          accountId: webhookData.accountId,
          subscriptionType: webhookData.subscriptionType,
          amount: webhookData.amount ? new Prisma.Decimal(webhookData.amount) : null,
          reference: webhookData.reference,
          currency: webhookData.currency,
          txId: webhookData.txId,
          blockHeight: webhookData.blockHeight ? BigInt(webhookData.blockHeight) : null,
          blockHash: webhookData.blockHash,
          fromAddress: webhookData.from || webhookData.counterAddress,
          toAddress: webhookData.to || webhookData.address,
          contractAddress: webhookData.contractAddress,
          transactionDate: webhookData.timestamp ? new Date(webhookData.timestamp * 1000) : null,
        },
      });

      // Handle address-based webhooks
      const isAddressWebhook = webhookData.subscriptionType === 'INCOMING_NATIVE_TX' ||
                              webhookData.subscriptionType === 'INCOMING_FUNGIBLE_TX';

      if (isAddressWebhook && !webhookData.accountId) {
        const webhookAddr = (webhookData.address || webhookData.to)?.toLowerCase();

        if (!webhookAddr) {
          throw new Error('No address found in webhook');
        }

        // Find deposit address
        const depositAddress = await this.depositAddressService.getDepositAddressByAddress(webhookAddr);

        if (!depositAddress) {
          throw new Error('Deposit address not found');
        }

        // Set accountId for processing
        webhookData.accountId = depositAddress.virtualAccount.accountId;
        webhookData.currency = depositAddress.virtualAccount.currency;
      }

      // Check for duplicates
      if (webhookData.txId) {
        const existingTx = await prisma.webhookResponse.findFirst({
          where: { txId: webhookData.txId },
        });

        if (existingTx) {
          await prisma.tatumRawWebhook.update({
            where: { id: rawWebhookId },
            data: { processed: true, processedAt: new Date() },
          });
          return { processed: false, reason: 'duplicate_tx' };
        }
      }

      // Get virtual account
      if (!webhookData.accountId) {
        throw new Error('Account ID not found in webhook');
      }

      const virtualAccount = await this.virtualAccountService.getVirtualAccountByAccountId(webhookData.accountId);

      if (!virtualAccount) {
        throw new Error('Virtual account not found');
      }

      // Update balance
      if (webhookData.amount) {
        await this.virtualAccountService.updateBalance(
          virtualAccount.accountId,
          webhookData.amount.toString(),
          'add'
        );
      }

      // Mark as processed
      await prisma.tatumRawWebhook.update({
        where: { id: rawWebhookId },
        data: { processed: true, processedAt: new Date() },
      });

      return { processed: true };
    } catch (error: any) {
      // Mark as processed with error
      await prisma.tatumRawWebhook.update({
        where: { id: rawWebhookId },
        data: {
          processed: true,
          processedAt: new Date(),
          errorMessage: error.message,
        },
      });

      throw error;
    }
  }
}

