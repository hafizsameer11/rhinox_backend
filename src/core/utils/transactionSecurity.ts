import bcrypt from 'bcryptjs';
import { prisma } from '../config/database.js';

export interface TransactionSecurityUser {
  id: number;
  pinHash: string | null;
  verifyTransactionsWithPin: boolean;
  verifyTransactionsWithEmail: boolean;
  verifyTransactionsWith2FA: boolean;
}

export interface TransactionSecurityInput {
  pin?: string;
  emailOtp?: string;
}

export async function assertTransactionSecurity(
  user: TransactionSecurityUser,
  input: TransactionSecurityInput
): Promise<void> {
  if (user.verifyTransactionsWith2FA) {
    throw new Error('Two-factor authentication for transactions is coming soon');
  }

  if (user.verifyTransactionsWithPin) {
    if (!user.pinHash) {
      throw new Error('PIN not set. Please setup your PIN first.');
    }

    if (!input.pin || !/^\d{5}$/.test(input.pin)) {
      throw new Error('PIN is required');
    }

    const isValidPin = await bcrypt.compare(input.pin, user.pinHash);
    if (!isValidPin) {
      throw new Error('Invalid PIN');
    }
  }

  if (user.verifyTransactionsWithEmail) {
    if (!input.emailOtp || !/^\d{5}$/.test(input.emailOtp)) {
      throw new Error('Email OTP is required');
    }

    const otpRecord = await prisma.oTP.findFirst({
      where: {
        userId: user.id,
        code: input.emailOtp,
        type: 'transaction',
        isUsed: false,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!otpRecord) {
      throw new Error('Invalid or expired email OTP');
    }

    await prisma.oTP.update({
      where: { id: otpRecord.id },
      data: { isUsed: true },
    });
  }
}
