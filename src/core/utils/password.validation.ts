export const OTP_LENGTH = 6;

export type PasswordRuleKey =
  | 'minLength'
  | 'uppercase'
  | 'lowercase'
  | 'number'
  | 'symbol'
  | 'noPersonalInfo';

const RULE_MESSAGES: Record<PasswordRuleKey, string> = {
  minLength: 'Password must be at least 8 characters',
  uppercase: 'Password must include an uppercase letter',
  lowercase: 'Password must include a lowercase letter',
  number: 'Password must include a number',
  symbol: 'Password must include a symbol',
  noPersonalInfo: 'Password must not contain your name or email',
};

export function validatePasswordStrength(
  password: string,
  context?: { firstName?: string; lastName?: string; email?: string }
): void {
  if (!password || password.length < 8) {
    throw new Error(RULE_MESSAGES.minLength);
  }
  if (!/[A-Z]/.test(password)) {
    throw new Error(RULE_MESSAGES.uppercase);
  }
  if (!/[a-z]/.test(password)) {
    throw new Error(RULE_MESSAGES.lowercase);
  }
  if (!/\d/.test(password)) {
    throw new Error(RULE_MESSAGES.number);
  }
  if (!/[^a-zA-Z0-9]/.test(password)) {
    throw new Error(RULE_MESSAGES.symbol);
  }

  const lower = password.toLowerCase();
  const first = (context?.firstName || '').trim().toLowerCase();
  const last = (context?.lastName || '').trim().toLowerCase();
  const email = (context?.email || '').trim().toLowerCase();
  const emailLocal = email.split('@')[0] || '';

  if (first && first.length >= 2 && lower.includes(first)) {
    throw new Error(RULE_MESSAGES.noPersonalInfo);
  }
  if (last && last.length >= 2 && lower.includes(last)) {
    throw new Error(RULE_MESSAGES.noPersonalInfo);
  }
  if (emailLocal && emailLocal.length >= 3 && lower.includes(emailLocal)) {
    throw new Error(RULE_MESSAGES.noPersonalInfo);
  }
}

export function isValidOtpCode(code: string): boolean {
  return new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code);
}

export function otpValidationMessage(): string {
  return `OTP code must be ${OTP_LENGTH} digits`;
}
