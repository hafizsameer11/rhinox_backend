import { type Request, type Response } from 'express';
import { Decimal } from 'decimal.js';
import prisma from '../../core/config/database.js';
import { processBlockchainWebhook } from '../../jobs/tatum/process-webhook.job.js';

/**
 * Webhook Controller — Tatum v4 deposit notifications
 */
export class WebhookController {
  /**
   * @swagger
   * /api/crypto/webhooks/tatum:
   *   post:
   *     summary: Receive Tatum webhook events
   *     tags: [Crypto]
   */
  async handleWebhook(req: Request, res: Response) {
    try {
      const rawWebhook = await prisma.tatumRawWebhook.create({
        data: {
          rawData: JSON.stringify(req.body),
          headers: JSON.stringify(req.headers),
          ipAddress: (req.ip || req.socket.remoteAddress) ?? null,
          userAgent: req.get('user-agent') ?? null,
        },
      });

      this.processWebhook(req.body, rawWebhook.id).catch((error) => {
        console.error('Webhook processing error:', error);
      });

      return res.status(200).json({
        success: true,
        message: 'Webhook received',
      });
    } catch (error: unknown) {
      console.error('Webhook handler error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to process webhook',
      });
    }
  }

  private async processWebhook(webhookData: Record<string, unknown>, rawWebhookId: number) {
    try {
      await prisma.webhookResponse.create({
        data: {
          accountId: webhookData.accountId ? String(webhookData.accountId) : null,
          subscriptionType: webhookData.subscriptionType
            ? String(webhookData.subscriptionType)
            : null,
          amount: webhookData.amount ? new Decimal(String(webhookData.amount)) : null,
          reference: webhookData.reference ? String(webhookData.reference) : null,
          currency: webhookData.currency ? String(webhookData.currency) : null,
          txId: webhookData.txId ? String(webhookData.txId) : null,
          blockHeight: webhookData.blockHeight
            ? BigInt(String(webhookData.blockHeight))
            : null,
          blockHash: webhookData.blockHash ? String(webhookData.blockHash) : null,
          fromAddress:
            (webhookData.from as string) ||
            (webhookData.counterAddress as string) ||
            null,
          toAddress:
            (webhookData.to as string) || (webhookData.address as string) || null,
          contractAddress: webhookData.contractAddress
            ? String(webhookData.contractAddress)
            : null,
          transactionDate: webhookData.timestamp
            ? new Date(Number(webhookData.timestamp) * 1000)
            : null,
        },
      });

      const result = await processBlockchainWebhook(webhookData);

      await prisma.tatumRawWebhook.update({
        where: { id: rawWebhookId },
        data: {
          processed: true,
          processedAt: new Date(),
          errorMessage: result.processed ? null : result.reason ?? 'skipped',
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.tatumRawWebhook.update({
        where: { id: rawWebhookId },
        data: {
          processed: true,
          processedAt: new Date(),
          errorMessage: message,
        },
      });
      throw error;
    }
  }
}
