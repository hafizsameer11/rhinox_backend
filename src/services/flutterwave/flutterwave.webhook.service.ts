import { Decimal } from 'decimal.js';
import prisma from '../../core/config/database.js';
import { sendDepositSuccessEmail } from '../../core/utils/transaction-email.service.js';
import {
  notifyBillPayment,
  notifyFiatDeposit,
  notifyWithdrawal,
} from '../../core/utils/notification.events.js';
import { getFlutterwaveConfig } from './flutterwave.config.js';
import { FlutterwaveDepositService } from './flutterwave.deposit.service.js';
import { FlutterwaveBillPaymentService } from './flutterwave.billpayment.service.js';
import {
  isTerminalBillStatus,
  mapFlwBillStatus,
  toBillTransactionStatus,
  type MappedBillStatus,
} from './flutterwave.bill-status.js';
import { RewardFulfillmentService } from '../../modules/rewards/reward-fulfillment.service.js';

type FlutterwaveWebhookBody = {
  event?: string;
  'event.type'?: string;
  data?: any;
};

export class FlutterwaveWebhookService {
  private readonly depositService = new FlutterwaveDepositService();
  private readonly billPaymentService = new FlutterwaveBillPaymentService();
  private readonly rewardFulfillmentService = new RewardFulfillmentService();

  verifySignature(verifHashHeader: string | string[] | undefined): boolean {
    try {
      const expected = getFlutterwaveConfig().secretHash;
      const received = Array.isArray(verifHashHeader) ? verifHashHeader[0] : verifHashHeader;
      return Boolean(received && expected && received === expected);
    } catch {
      return false;
    }
  }

  async handleWebhook(
    payload: FlutterwaveWebhookBody,
    context: { headers?: any; ipAddress?: string; userAgent?: string }
  ) {
    const event = String(payload.event || payload['event.type'] || '');
    const eventLower = event.toLowerCase();
    const data = payload.data || payload;

    if (eventLower === 'charge.completed' || eventLower.startsWith('charge.')) {
      await this.processChargeWebhook(data);
      return;
    }

    if (eventLower === 'transfer.completed' || eventLower.startsWith('transfer.')) {
      await this.processTransferWebhook(data);
      return;
    }

    if (
      eventLower === 'singlebillpayment.status' ||
      eventLower.includes('billpayment') ||
      eventLower.includes('bill') ||
      this.looksLikeBillPayload(data)
    ) {
      await this.processBillPaymentWebhook(data, { verifyWithProvider: true });
      return;
    }

    // Fallback: detect by shape
    if (data?.tx_ref && String(data.tx_ref).startsWith('flw_deposit_')) {
      await this.processChargeWebhook(data);
    } else if (data?.reference && String(data.reference).startsWith('flw_payout_')) {
      await this.processTransferWebhook(data);
    } else if (this.looksLikeBillPayload(data)) {
      await this.processBillPaymentWebhook(data, { verifyWithProvider: true });
    }
  }

  private looksLikeBillPayload(data: any): boolean {
    if (!data || typeof data !== 'object') return false;
    const refCandidates = [
      data.customer_reference,
      data.reference,
      data.tx_ref,
      data.flw_ref,
    ]
      .filter(Boolean)
      .map((v) => String(v).toLowerCase());
    return refCandidates.some((ref) => ref.startsWith('flw_bill_'));
  }

  /**
   * Poll Flutterwave verify endpoint and apply the same ledger updates as charge webhooks.
   */
  async syncDepositStatus(txRef: string) {
    const data = await this.depositService.verifyByReference(txRef);
    if (data) {
      await this.processChargeWebhook(data);
    }
  }

  /**
   * Poll Flutterwave bill status and finalize a bill_payment transaction.
   */
  async syncBillPaymentStatus(transactionId: number) {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { wallet: true },
    });

    if (!transaction || transaction.type !== 'bill_payment') {
      return null;
    }

    if (isTerminalBillStatus(transaction.status)) {
      return transaction;
    }

    const metadata = (transaction.metadata as any) || {};
    if (metadata.provider && metadata.provider !== 'flutterwave') {
      return transaction;
    }

    const flwReference =
      metadata.flwReference ||
      `flw_bill_${String(transaction.reference || '').toLowerCase()}`;

    let mappedStatus: MappedBillStatus = 'pending';
    let providerPayload: any = { source: 'status_poll' };

    try {
      const status = await this.billPaymentService.getBillStatus(flwReference);
      mappedStatus = status.mappedStatus;
      providerPayload = { source: 'status_poll', ...status.raw, mappedStatus };
    } catch (error: any) {
      console.warn(
        `[Flutterwave] Bill status poll failed for tx=${transactionId}: ${error.message}`
      );
      return transaction;
    }

    if (mappedStatus === 'pending') {
      return transaction;
    }

    await this.finalizeFlutterwaveBillPayment(transaction.id, mappedStatus, providerPayload);
    return prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { wallet: true },
    });
  }

  private async processChargeWebhook(data: any) {
    const txRef = data?.tx_ref as string | undefined;
    if (!txRef || !txRef.startsWith('flw_deposit_')) {
      return;
    }

    const deposit = await this.findDepositByFlwTxRef(txRef);

    if (!deposit) {
      console.warn(`[Flutterwave] Deposit not found for tx_ref=${txRef}`);
      return;
    }

    if (deposit.status === 'completed') {
      return;
    }

    const status = String(data.status || '').toLowerCase();
    const metadata = (deposit.metadata as any) || {};

    if (status === 'successful' || status === 'success') {
      const creditedAmount = new Decimal(deposit.amount).minus(new Decimal(deposit.fee || 0));

      await prisma.$transaction(async (tx) => {
        await tx.wallet.update({
          where: { id: deposit.walletId },
          data: {
            balance: {
              increment: creditedAmount.toNumber(),
            },
          },
        });

        await tx.transaction.update({
          where: { id: deposit.id },
          data: {
            status: 'completed',
            completedAt: data.created_at ? new Date(data.created_at) : new Date(),
            metadata: {
              ...metadata,
              provider: 'flutterwave',
              flwTxRef: txRef,
              flwRef: data.flw_ref,
              flwId: data.id,
              flwStatus: data.status,
              webhook: data,
            },
          },
        });
      });

      if (deposit.wallet.user.email) {
        await sendDepositSuccessEmail(deposit.wallet.user.email, {
          amount: deposit.amount.toString(),
          currency: deposit.currency,
          creditedAmount: creditedAmount.toString(),
          fee: deposit.fee.toString(),
          reference: deposit.reference,
          transactionId: deposit.id.toString(),
          country: deposit.country || '',
          channel: deposit.channel || 'mobile_money',
          paymentMethod: deposit.paymentMethod || 'Mobile Money',
          provider: 'Flutterwave',
          date: new Date().toLocaleString(),
        });
      }

      notifyFiatDeposit(deposit.wallet.userId, {
        amount: deposit.amount.toString(),
        currency: deposit.currency,
        reference: deposit.reference,
        creditedAmount: creditedAmount.toString(),
      });
      return;
    }

    if (status === 'failed' || status === 'cancelled') {
      await prisma.transaction.update({
        where: { id: deposit.id },
        data: {
          status: status === 'cancelled' ? 'cancelled' : 'failed',
          metadata: {
            ...metadata,
            provider: 'flutterwave',
            flwTxRef: txRef,
            flwRef: data.flw_ref,
            flwId: data.id,
            flwStatus: data.status,
            webhook: data,
          },
        },
      });
    }
  }

  private async processTransferWebhook(data: any) {
    const reference = data?.reference as string | undefined;
    if (!reference) {
      return;
    }

    const candidates = await prisma.transaction.findMany({
      where: {
        type: { in: ['withdrawal', 'transfer'] },
        channel: 'mobile_money',
        status: { in: ['pending', 'processing'] },
      },
      include: { wallet: { include: { user: true } } },
      take: 100,
    });

    const transaction = candidates.find((tx) => {
      const meta = (tx.metadata as any) || {};
      return (
        meta.flwPayoutReference === reference ||
        meta.flwTransferReference === reference ||
        `flw_payout_${tx.reference.toLowerCase()}` === reference.toLowerCase()
      );
    });

    if (!transaction) {
      console.warn(`[Flutterwave] Transfer not found for reference=${reference}`);
      return;
    }

    const status = String(data.status || '').toLowerCase();
    const metadata = (transaction.metadata as any) || {};
    const totalDeduction = new Decimal(transaction.amount).plus(new Decimal(transaction.fee || 0));

    if (status === 'successful' || status === 'success') {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'completed',
          completedAt: data.complete_message || data.created_at
            ? new Date(data.created_at || Date.now())
            : new Date(),
          metadata: {
            ...metadata,
            provider: 'flutterwave',
            flwTransferId: data.id,
            flwPayoutReference: reference,
            flwStatus: data.status,
            integrationStatus: 'completed',
            webhook: data,
          },
        },
      });

      notifyWithdrawal(transaction.wallet.userId, {
        amount: transaction.amount.toString(),
        currency: transaction.currency,
        reference: transaction.reference,
        status: 'success',
      });
      return;
    }

    if (status === 'failed' || status === 'cancelled') {
      await prisma.$transaction(async (tx) => {
        if (metadata.walletDebited && !metadata.refunded) {
          await tx.wallet.update({
            where: { id: transaction.walletId },
            data: {
              balance: {
                increment: totalDeduction.toNumber(),
              },
            },
          });
        }

        await tx.transaction.update({
          where: { id: transaction.id },
          data: {
            status: status === 'cancelled' ? 'cancelled' : 'failed',
            metadata: {
              ...metadata,
              provider: 'flutterwave',
              flwTransferId: data.id,
              flwPayoutReference: reference,
              flwStatus: data.status,
              integrationStatus: 'failed',
              refunded: Boolean(metadata.walletDebited),
              refundedAt: metadata.walletDebited ? new Date().toISOString() : undefined,
              webhook: data,
            },
          },
        });
      });

      notifyWithdrawal(transaction.wallet.userId, {
        amount: transaction.amount.toString(),
        currency: transaction.currency,
        reference: transaction.reference,
        status: 'error',
        message: data.complete_message
          ? `Withdrawal failed: ${data.complete_message}`
          : 'Your mobile money withdrawal could not be completed.',
      });
    }
  }

  private async findDepositByFlwTxRef(txRef: string) {
    const candidates = await prisma.transaction.findMany({
      where: {
        type: 'deposit',
        channel: 'mobile_money',
        status: { in: ['pending', 'processing', 'completed'] },
      },
      include: {
        wallet: { include: { user: true } },
      },
      take: 80,
      orderBy: { createdAt: 'desc' },
    });

    return (
      candidates.find((tx) => {
        const meta = (tx.metadata as any) || {};
        return (
          meta.flwTxRef === txRef ||
          String(meta.flwTxRef || '').toLowerCase() === txRef.toLowerCase()
        );
      }) || null
    );
  }

  private async processBillPaymentWebhook(
    data: any,
    opts?: { verifyWithProvider?: boolean }
  ) {
    const refCandidates = [
      data?.customer_reference,
      data?.reference,
      data?.tx_ref,
      data?.flw_ref,
    ]
      .filter(Boolean)
      .map((v: any) => String(v));

    if (refCandidates.length === 0) {
      return;
    }

    const transaction = await this.findBillPaymentByRefs(refCandidates);
    if (!transaction) {
      console.warn(
        `[Flutterwave] Bill payment not found for refs=${refCandidates.join(',')}`
      );
      return;
    }

    if (isTerminalBillStatus(transaction.status)) {
      return;
    }

    let mappedStatus = mapFlwBillStatus(data);
    let providerPayload = { source: 'webhook', ...data, mappedStatus };

    // Prefer live status poll when webhook says terminal (or always when requested).
    const flwReference =
      (transaction.metadata as any)?.flwReference ||
      refCandidates.find((r) => String(r).toLowerCase().startsWith('flw_bill_')) ||
      `flw_bill_${String(transaction.reference || '').toLowerCase()}`;

    if (opts?.verifyWithProvider && mappedStatus !== 'pending') {
      try {
        const status = await this.billPaymentService.getBillStatus(String(flwReference));
        if (status.mappedStatus !== 'pending') {
          mappedStatus = status.mappedStatus;
          providerPayload = {
            source: 'webhook_verified',
            webhook: data,
            statusPoll: status.raw,
            mappedStatus,
          };
        }
      } catch (error: any) {
        console.warn(
          `[Flutterwave] Bill webhook verify poll failed tx=${transaction.id}: ${error.message}`
        );
      }
    }

    if (mappedStatus === 'pending') {
      // Keep processing; store latest webhook breadcrumbs.
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'processing',
          metadata: {
            ...((transaction.metadata as any) || {}),
            provider: 'flutterwave',
            flwStatus: data.status || data.code || 'pending',
            flwTxRef: data.tx_ref || (transaction.metadata as any)?.flwTxRef,
            flwRef: data.flw_ref || (transaction.metadata as any)?.flwRef,
            lastWebhookAt: new Date().toISOString(),
            webhook: data,
          },
        },
      });
      return;
    }

    await this.finalizeFlutterwaveBillPayment(transaction.id, mappedStatus, providerPayload);
  }

  private async findBillPaymentByRefs(refCandidates: string[]) {
    const candidates = await prisma.transaction.findMany({
      where: {
        type: 'bill_payment',
        status: { in: ['pending', 'processing'] },
      },
      include: { wallet: true },
      take: 150,
      orderBy: { createdAt: 'desc' },
    });

    const normalizedRefs = refCandidates.map((r) => String(r).toLowerCase());

    return (
      candidates.find((tx) => {
        const meta = (tx.metadata as any) || {};
        if (meta.provider && meta.provider !== 'flutterwave') {
          return false;
        }
        const stored = [
          meta.flwReference,
          meta.flwTxRef,
          meta.flwProviderReference,
          meta.flwRef,
          `flw_bill_${String(tx.reference || '').toLowerCase()}`,
        ]
          .filter(Boolean)
          .map((v) => String(v).toLowerCase());

        return normalizedRefs.some((ref) => stored.includes(ref));
      }) || null
    );
  }

  /**
   * Idempotent finalize for Flutterwave bill payments:
   * completed / failed / cancelled — with single-refund and reward claim handling.
   */
  async finalizeFlutterwaveBillPayment(
    transactionId: number,
    mappedStatus: MappedBillStatus,
    providerPayload: any
  ) {
    if (mappedStatus === 'pending') {
      return;
    }

    const fresh = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { wallet: true },
    });

    if (!fresh || fresh.type !== 'bill_payment') {
      return;
    }

    if (isTerminalBillStatus(fresh.status)) {
      return;
    }

    const metadata = (fresh.metadata as any) || {};
    const totalAmount = new Decimal(fresh.amount).plus(new Decimal(fresh.fee || 0));
    const isReward = Boolean(metadata.isRewardFulfillment && metadata.rewardClaimId);
    const shouldRefund =
      (mappedStatus === 'failed' || mappedStatus === 'cancelled') &&
      Boolean(metadata.walletDebited) &&
      !Boolean(metadata.refunded) &&
      !isReward;

    const txStatus = toBillTransactionStatus(mappedStatus);

    await prisma.$transaction(async (tx) => {
      // Re-check inside the transaction to avoid double-refund races.
      const locked = await tx.transaction.findUnique({ where: { id: transactionId } });
      if (!locked || isTerminalBillStatus(locked.status)) {
        return;
      }
      const lockedMeta = (locked.metadata as any) || {};
      if (
        (mappedStatus === 'failed' || mappedStatus === 'cancelled') &&
        lockedMeta.walletDebited &&
        !lockedMeta.refunded &&
        !lockedMeta.isRewardFulfillment
      ) {
        await tx.wallet.update({
          where: { id: locked.walletId },
          data: {
            balance: {
              increment: new Decimal(locked.amount).plus(new Decimal(locked.fee || 0)).toNumber(),
            },
          },
        });
      }

      const didRefund =
        lockedMeta.refunded ||
        (shouldRefund &&
          Boolean(lockedMeta.walletDebited) &&
          !Boolean(lockedMeta.isRewardFulfillment));

      await tx.transaction.update({
        where: { id: transactionId },
        data: {
          status: txStatus,
          completedAt: mappedStatus === 'completed' ? new Date() : locked.completedAt,
          metadata: {
            ...lockedMeta,
            provider: 'flutterwave',
            flwStatus: providerPayload?.status || providerPayload?.code || mappedStatus,
            flwTxRef: providerPayload?.tx_ref || providerPayload?.data?.tx_ref || lockedMeta.flwTxRef,
            flwProviderReference:
              providerPayload?.reference ||
              providerPayload?.data?.reference ||
              lockedMeta.flwProviderReference,
            flwRef: providerPayload?.flw_ref || providerPayload?.data?.flw_ref || lockedMeta.flwRef,
            rechargeToken:
              providerPayload?.recharge_token ||
              providerPayload?.data?.recharge_token ||
              (typeof providerPayload?.extra === 'string'
                ? providerPayload.extra
                : providerPayload?.extra?.recharge_token ||
                  providerPayload?.extra?.token ||
                  null) ||
              lockedMeta.rechargeToken ||
              null,
            refunded: didRefund,
            refundedAt: didRefund
              ? lockedMeta.refundedAt || new Date().toISOString()
              : lockedMeta.refundedAt,
            refundReason:
              didRefund && !lockedMeta.refunded
                ? `Flutterwave bill ${mappedStatus}`
                : lockedMeta.refundReason,
            lastStatusSource: providerPayload?.source || 'finalize',
            providerPayload,
          },
        },
      });
    });

    if (isReward && metadata.rewardClaimId) {
      try {
        if (mappedStatus === 'completed') {
          await this.rewardFulfillmentService.completeRewardClaim(
            metadata.rewardClaimId,
            transactionId
          );
        } else if (mappedStatus === 'failed' || mappedStatus === 'cancelled') {
          await this.rewardFulfillmentService.failRewardClaim(
            metadata.rewardClaimId,
            `Bill payment ${mappedStatus}`
          );
        }
      } catch (error: any) {
        console.error(
          `[Flutterwave] Reward claim update failed for bill tx=${transactionId}:`,
          error.message
        );
      }
    }

    if (mappedStatus === 'completed') {
      notifyBillPayment(fresh.wallet.userId, {
        amount: fresh.amount.toString(),
        currency: fresh.currency,
        reference: fresh.reference,
        status: 'success',
        categoryName: metadata?.categoryName,
      });
    } else if (mappedStatus === 'failed' || mappedStatus === 'cancelled') {
      notifyBillPayment(fresh.wallet.userId, {
        amount: fresh.amount.toString(),
        currency: fresh.currency,
        reference: fresh.reference,
        status: 'error',
        categoryName: metadata?.categoryName,
        message: shouldRefund
          ? 'Your bill payment could not be completed. Funds were refunded.'
          : 'Your bill payment could not be completed.',
      });
    }
  }
}
