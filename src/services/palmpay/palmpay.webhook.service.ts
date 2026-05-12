import { Decimal } from 'decimal.js';
import prisma from '../../core/config/database.js';
import { sendDepositSuccessEmail } from '../../core/utils/transaction-email.service.js';
import { fromPalmPayAmount, mapPalmPayStatus } from './palmpay.utils.js';
import type { PalmPayWebhookPayload } from './palmpay.types.js';

export class PalmPayWebhookService {
  async handleWebhook(payload: PalmPayWebhookPayload, context: { headers?: any; ipAddress?: string; userAgent?: string }) {
    const rawWebhook = await prisma.palmPayRawWebhook.create({
      data: {
        rawData: payload as any,
        headers: context.headers as any,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    try {
      if (payload.orderId?.startsWith('deposit_')) {
        await this.processDepositWebhook(payload);
      } else if (payload.orderId?.startsWith('payout_')) {
        await this.processPayoutWebhook(payload);
      } else if (payload.outOrderNo?.startsWith('bill_')) {
        await this.processBillPaymentWebhook(payload);
      }

      await prisma.palmPayRawWebhook.update({
        where: { id: rawWebhook.id },
        data: {
          processed: true,
          processedAt: new Date(),
        },
      });
    } catch (error: any) {
      await prisma.palmPayRawWebhook.update({
        where: { id: rawWebhook.id },
        data: {
          processed: true,
          processedAt: new Date(),
          errorMessage: error.message || 'Webhook processing failed',
        },
      });
    }
  }

  private async processDepositWebhook(payload: PalmPayWebhookPayload) {
    const virtualAccount = await prisma.palmPayVirtualAccount.findUnique({
      where: { merchantOrderId: payload.orderId! },
      include: {
        transaction: {
          include: {
            wallet: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    });

    if (!virtualAccount) {
      throw new Error(`PalmPay virtual account not found for ${payload.orderId}`);
    }

    if (virtualAccount.transaction.status === 'completed') {
      return;
    }

    const mappedStatus = mapPalmPayStatus(payload.orderStatus);

    await prisma.$transaction(async (tx) => {
      await tx.palmPayVirtualAccount.update({
        where: { id: virtualAccount.id },
        data: {
          palmpayOrderNo: payload.orderNo ?? virtualAccount.palmpayOrderNo,
          orderStatus: payload.orderStatus ?? virtualAccount.orderStatus,
          metadata: payload as any,
        },
      });

      if (mappedStatus === 'completed') {
        const creditedAmount = fromPalmPayAmount(payload.amount || 0);
        await tx.wallet.update({
          where: { id: virtualAccount.transaction.walletId },
          data: {
            balance: {
              increment: creditedAmount.toNumber(),
            },
          },
        });

        await tx.transaction.update({
          where: { id: virtualAccount.transactionId },
          data: {
            status: 'completed',
            completedAt: payload.completeTime ? new Date(payload.completeTime) : new Date(),
            metadata: {
              ...(virtualAccount.transaction.metadata as any || {}),
              provider: 'palmpay',
              palmpayOrderNo: payload.orderNo,
              palmpayStatus: payload.orderStatus,
              webhook: payload,
            },
          },
        });

        if (virtualAccount.transaction.wallet.user.email) {
          await sendDepositSuccessEmail(virtualAccount.transaction.wallet.user.email, {
            amount: virtualAccount.transaction.amount.toString(),
            currency: virtualAccount.transaction.currency,
            creditedAmount: creditedAmount.toString(),
            fee: virtualAccount.transaction.fee.toString(),
            reference: virtualAccount.transaction.reference,
            transactionId: virtualAccount.transaction.id.toString(),
            country: virtualAccount.transaction.country || 'NG',
            channel: virtualAccount.transaction.channel || 'bank_transfer',
            paymentMethod: virtualAccount.transaction.paymentMethod || 'Bank Transfer',
            provider: 'Bank Transfer',
            date: new Date().toLocaleString(),
          });
        }
      } else if (mappedStatus === 'failed' || mappedStatus === 'cancelled') {
        await tx.transaction.update({
          where: { id: virtualAccount.transactionId },
          data: {
            status: mappedStatus,
            metadata: {
              ...(virtualAccount.transaction.metadata as any || {}),
              provider: 'palmpay',
              palmpayOrderNo: payload.orderNo,
              palmpayStatus: payload.orderStatus,
              webhook: payload,
            },
          },
        });
      }
    });
  }

  private async processPayoutWebhook(payload: PalmPayWebhookPayload) {
    const candidates = await prisma.transaction.findMany({
      where: {
        type: 'withdrawal',
        status: {
          in: ['pending', 'processing'],
        },
      },
      take: 100,
    });
    const transaction = candidates.find((tx) => (tx.metadata as any)?.palmpayOrderId === payload.orderId);
    if (!transaction) return;

    const mappedStatus = mapPalmPayStatus(payload.orderStatus);
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: mappedStatus === 'completed' ? 'completed' : mappedStatus,
        completedAt: mappedStatus === 'completed'
          ? (payload.completeTime ? new Date(payload.completeTime) : new Date())
          : transaction.completedAt,
        metadata: {
          ...(transaction.metadata as any || {}),
          palmpayOrderNo: payload.orderNo,
          palmpayStatus: payload.orderStatus,
          palmpaySessionId: payload.sessionId,
          palmpayError: payload.errorMsg,
          webhook: payload,
        },
      },
    });
  }

  private async processBillPaymentWebhook(payload: PalmPayWebhookPayload) {
    const candidates = await prisma.transaction.findMany({
      where: {
        type: 'bill_payment',
        status: {
          in: ['pending', 'processing'],
        },
      },
      include: { wallet: true },
      take: 100,
    });
    const transaction = candidates.find((tx) => (tx.metadata as any)?.palmpayOrderId === payload.outOrderNo);
    if (!transaction) return;

    const mappedStatus = mapPalmPayStatus(payload.orderStatus);
    const metadata = transaction.metadata as any || {};

    await prisma.$transaction(async (tx) => {
      if ((mappedStatus === 'failed' || mappedStatus === 'cancelled') && !metadata.refunded) {
        const refundAmount = new Decimal(transaction.amount).plus(new Decimal(transaction.fee || 0));
        await tx.wallet.update({
          where: { id: transaction.walletId },
          data: {
            balance: {
              increment: refundAmount.toNumber(),
            },
          },
        });
      }

      await tx.transaction.update({
        where: { id: transaction.id },
        data: {
          status: mappedStatus,
          completedAt: mappedStatus === 'completed'
            ? (payload.completedTime ? new Date(payload.completedTime) : new Date())
            : transaction.completedAt,
          metadata: {
            ...metadata,
            palmpayOrderNo: payload.orderNo,
            palmpayStatus: payload.orderStatus,
            palmpayError: payload.errorMsg,
            refunded: metadata.refunded || mappedStatus === 'failed' || mappedStatus === 'cancelled',
            webhook: payload,
          },
        },
      });
    });
  }
}
