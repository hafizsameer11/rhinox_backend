import { Decimal } from 'decimal.js';
import prisma from '../../core/config/database.js';
import { sendDepositSuccessEmail } from '../../core/utils/transaction-email.service.js';
import {
  notifyBillPayment,
  notifyFiatDeposit,
  notifyWithdrawal,
} from '../../core/utils/notification.events.js';
import { fromPalmPayAmount, mapPalmPayStatus } from './palmpay.utils.js';
import { PalmPayDepositService } from './palmpay.deposit.service.js';
import type { PalmPayWebhookPayload } from './palmpay.types.js';

export class PalmPayWebhookService {
  private readonly palmPayDepositService = new PalmPayDepositService();

  /**
   * Poll PalmPay for deposit status and apply the same ledger updates as webhooks.
   */
  async syncDepositStatus(merchantOrderId: string) {
    const order = await this.palmPayDepositService.queryOrderStatus(merchantOrderId);
    await this.processDepositWebhook({
      orderId: merchantOrderId,
      orderNo: order.orderNo,
      orderStatus: order.orderStatus,
      amount: order.orderAmount,
      completeTime: (order as any).completeTime ?? (order as any).completedTime,
    });
  }
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
      } else if (payload.orderId?.startsWith('busha_sell_')) {
        await this.processBushaSellWebhook(payload);
      } else if (payload.orderId?.startsWith('busha_buy_')) {
        await this.processBushaBuyWebhook(payload);
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
      throw new Error(`Deposit account not found for ${payload.orderId}`);
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

        notifyFiatDeposit(virtualAccount.transaction.wallet.userId, {
          amount: virtualAccount.transaction.amount.toString(),
          currency: virtualAccount.transaction.currency,
          reference: virtualAccount.transaction.reference,
          creditedAmount: creditedAmount.toString(),
        });
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
      include: { wallet: true },
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

    if (mappedStatus === 'completed') {
      notifyWithdrawal(transaction.wallet.userId, {
        amount: transaction.amount.toString(),
        currency: transaction.currency,
        reference: transaction.reference,
        status: 'success',
      });
    } else if (mappedStatus === 'failed' || mappedStatus === 'cancelled') {
      notifyWithdrawal(transaction.wallet.userId, {
        amount: transaction.amount.toString(),
        currency: transaction.currency,
        reference: transaction.reference,
        status: 'error',
        message: payload.errorMsg
          ? `Withdrawal failed: ${payload.errorMsg}`
          : 'Your withdrawal could not be completed.',
      });
    }
  }

  private async processBushaSellWebhook(payload: PalmPayWebhookPayload) {
    const orderId = payload.orderId!;
    const trade = await prisma.bushaTradeLog.findFirst({
      where: { palmpayOrderId: orderId, side: 'sell' },
    });
    if (!trade) {
      console.warn('[PalmPay webhook] No busha sell trade for', orderId);
      return;
    }

    const mapped = mapPalmPayStatus(payload.orderStatus);
    await prisma.bushaTradeLog.update({
      where: { id: trade.id },
      data: {
        palmpayStatus: mapped,
        palmpayOrderNo: payload.orderNo || trade.palmpayOrderNo,
        providerResponse: {
          ...((trade.providerResponse as object) || {}),
          palmpayWebhook: payload,
        },
      },
    });

    const { BushaAppService } = await import('../busha/busha.app.service.js');
    const busha = new BushaAppService();

    if (mapped === 'completed') {
      await busha.settleTrade(trade.id);
      return;
    }

    if (mapped === 'failed' || mapped === 'cancelled') {
      if (['wallet_credited', 'completed'].includes(trade.status)) return;
      const bushaStatus = String(trade.bushaStatus || '').toLowerCase();
      const bushaTerminal =
        ['cancelled', 'failed', 'funds_not_delivered', 'funds_refunded'].includes(bushaStatus) ||
        trade.status === 'busha_failed';
      if (bushaTerminal) {
        await busha.failSellTrade(trade.id, bushaStatus || mapped);
      }
      // Otherwise keep trade open — Busha cancel/fail poller will close the crypto_sell tx
    }
  }

  private async processBushaBuyWebhook(payload: PalmPayWebhookPayload) {
    const orderId = payload.orderId!;
    const trade = await prisma.bushaTradeLog.findFirst({
      where: { palmpayOrderId: orderId, side: 'buy' },
    });
    if (!trade) {
      console.warn('[PalmPay webhook] No busha buy trade for', orderId);
      return;
    }

    const mapped = mapPalmPayStatus(payload.orderStatus);
    await prisma.bushaTradeLog.update({
      where: { id: trade.id },
      data: {
        palmpayStatus: mapped,
        palmpayOrderNo: payload.orderNo || trade.palmpayOrderNo,
        providerResponse: {
          ...((trade.providerResponse as object) || {}),
          palmpayWebhook: payload,
        },
      },
    });

    const { BushaAppService } = await import('../busha/busha.app.service.js');
    const busha = new BushaAppService();
    if (mapped === 'completed' || mapped === 'failed' || mapped === 'cancelled') {
      await busha.settleTrade(trade.id);
    }
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

    if (['completed', 'failed', 'cancelled'].includes(transaction.status)) {
      return;
    }

    const isReward = Boolean(metadata.isRewardFulfillment && metadata.rewardClaimId);
    const shouldRefund =
      (mappedStatus === 'failed' || mappedStatus === 'cancelled') &&
      Boolean(metadata.walletDebited) &&
      !Boolean(metadata.refunded) &&
      !isReward;

    await prisma.$transaction(async (tx) => {
      const locked = await tx.transaction.findUnique({ where: { id: transaction.id } });
      if (!locked || ['completed', 'failed', 'cancelled'].includes(locked.status)) {
        return;
      }
      const lockedMeta = (locked.metadata as any) || {};

      if (
        (mappedStatus === 'failed' || mappedStatus === 'cancelled') &&
        lockedMeta.walletDebited &&
        !lockedMeta.refunded &&
        !lockedMeta.isRewardFulfillment
      ) {
        const refundAmount = new Decimal(locked.amount).plus(new Decimal(locked.fee || 0));
        await tx.wallet.update({
          where: { id: locked.walletId },
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
          status: mappedStatus === 'pending' ? 'processing' : mappedStatus,
          completedAt: mappedStatus === 'completed'
            ? (payload.completedTime ? new Date(payload.completedTime) : new Date())
            : locked.completedAt,
          metadata: {
            ...lockedMeta,
            palmpayOrderNo: payload.orderNo,
            palmpayStatus: payload.orderStatus,
            palmpayError: payload.errorMsg,
            refunded:
              lockedMeta.refunded ||
              ((mappedStatus === 'failed' || mappedStatus === 'cancelled') &&
                Boolean(lockedMeta.walletDebited) &&
                !Boolean(lockedMeta.isRewardFulfillment)),
            refundedAt:
              shouldRefund || lockedMeta.refunded
                ? lockedMeta.refundedAt || new Date().toISOString()
                : lockedMeta.refundedAt,
            webhook: payload,
          },
        },
      });
    });

    if (mappedStatus === 'completed') {
      notifyBillPayment(transaction.wallet.userId, {
        amount: transaction.amount.toString(),
        currency: transaction.currency,
        reference: transaction.reference,
        status: 'success',
        categoryName: metadata?.categoryName,
      });
    } else if (mappedStatus === 'failed' || mappedStatus === 'cancelled') {
      notifyBillPayment(transaction.wallet.userId, {
        amount: transaction.amount.toString(),
        currency: transaction.currency,
        reference: transaction.reference,
        status: 'error',
        categoryName: metadata?.categoryName,
        message: payload.errorMsg
          ? `Bill payment failed: ${payload.errorMsg}`
          : shouldRefund
            ? 'Your bill payment could not be completed. Funds were refunded.'
            : 'Your bill payment could not be completed.',
      });
    }
  }
}
