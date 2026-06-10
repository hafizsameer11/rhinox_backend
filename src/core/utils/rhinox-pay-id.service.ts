import { randomBytes } from 'crypto';
import prisma from '../config/database.js';

const RHINOX_PAY_ID_PREFIX = 'RXP';
const RHINOX_PAY_ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRhinoxPayIdCandidate(): string {
  const bytes = randomBytes(8);
  let suffix = '';
  for (let i = 0; i < 8; i += 1) {
    suffix += RHINOX_PAY_ID_CHARS[bytes[i] % RHINOX_PAY_ID_CHARS.length];
  }
  return `${RHINOX_PAY_ID_PREFIX}${suffix}`;
}

export function normalizeRhinoxPayId(value?: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

export function isRhinoxPayId(value?: string | null): boolean {
  const normalized = normalizeRhinoxPayId(value);
  if (!normalized) return false;
  return /^RXP[A-Z0-9]{6,12}$/.test(normalized);
}

export async function generateUniqueRhinoxPayId(): Promise<string> {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const candidate = generateRhinoxPayIdCandidate();
    const existing = await prisma.user.findUnique({
      where: { rhinoxPayId: candidate },
      select: { id: true },
    });
    if (!existing) {
      return candidate;
    }
  }
  throw new Error('Failed to generate unique Rhinox Pay ID');
}

export async function ensureRhinoxPayId(userId: number | string): Promise<string> {
  const parsedUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
  if (isNaN(parsedUserId) || parsedUserId <= 0) {
    throw new Error('Invalid user ID format');
  }

  const user = await prisma.user.findUnique({
    where: { id: parsedUserId },
    select: { rhinoxPayId: true },
  });

  if (!user) {
    throw new Error('User not found');
  }

  if (user.rhinoxPayId) {
    return user.rhinoxPayId;
  }

  const rhinoxPayId = await generateUniqueRhinoxPayId();
  await prisma.user.update({
    where: { id: parsedUserId },
    data: { rhinoxPayId },
  });

  return rhinoxPayId;
}
