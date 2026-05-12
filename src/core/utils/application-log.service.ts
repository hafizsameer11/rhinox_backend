import { Prisma } from '@prisma/client';
import prisma from '../config/database.js';

type ApplicationLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface ApplicationLogInput {
  level?: ApplicationLogLevel;
  source: string;
  message?: string | null;
  userId?: string | number | null;
  requestId?: string | null;
  statusCode?: number | null;
  errorName?: string | null;
  stackTrace?: string | null;
  context?: unknown;
}

const SENSITIVE_KEY_PATTERN = /(password|token|authorization|secret|privatekey|apikey|pin|accountnumber|accountno|accno)/i;

const truncate = (value: string | null | undefined, maxLength: number) => {
  if (!value) {
    return value ?? null;
  }
  return value.length > maxLength ? value.slice(0, maxLength) : value;
};

const maskNumericIdentifier = (value: string) => {
  const digitsOnly = value.replace(/\D/g, '');
  if (digitsOnly.length < 6) {
    return '***';
  }
  return `****${digitsOnly.slice(-4)}`;
};

const sanitizeForJson = (value: unknown): Prisma.InputJsonValue | undefined => {
  if (value === undefined) {
    return undefined;
  }

  try {
    return JSON.parse(
      JSON.stringify(value, (key, nestedValue) => {
        if (SENSITIVE_KEY_PATTERN.test(key)) {
          return typeof nestedValue === 'string' ? maskNumericIdentifier(nestedValue) : '[REDACTED]';
        }

        if (typeof nestedValue === 'bigint') {
          return nestedValue.toString();
        }

        if (nestedValue instanceof Error) {
          return {
            name: nestedValue.name,
            message: nestedValue.message,
            stack: nestedValue.stack,
          };
        }

        return nestedValue;
      })
    ) as Prisma.InputJsonValue;
  } catch (error: any) {
    return {
      serializationError: error.message || 'Failed to serialize log context',
    };
  }
};

const normalizeUserId = (userId: ApplicationLogInput['userId']) => {
  if (userId === null || userId === undefined || userId === '') {
    return null;
  }

  const numericUserId = typeof userId === 'number' ? userId : parseInt(userId, 10);
  return Number.isFinite(numericUserId) && numericUserId > 0 ? numericUserId : null;
};

export const logApplicationEvent = async (input: ApplicationLogInput) => {
  try {
    await prisma.applicationLog.create({
      data: {
        level: input.level || 'error',
        source: truncate(input.source, 120) || 'unknown',
        message: truncate(input.message, 65535),
        userId: normalizeUserId(input.userId),
        requestId: truncate(input.requestId, 100),
        statusCode: input.statusCode ?? null,
        errorName: truncate(input.errorName, 120),
        stackTrace: truncate(input.stackTrace, 4_000_000),
        context: sanitizeForJson(input.context),
      },
    });
  } catch (error) {
    console.error('[ApplicationLog] Failed to persist application log:', error);
  }
};
