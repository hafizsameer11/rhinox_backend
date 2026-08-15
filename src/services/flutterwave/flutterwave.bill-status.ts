/**
 * Flutterwave bill payment status normalization.
 * Covers create-payment, get-status, and singlebillpayment.status webhooks.
 */

export type MappedBillStatus = 'completed' | 'failed' | 'cancelled' | 'pending';

const SUCCESS_TOKENS = new Set([
  'successful',
  'success',
  'succeeded',
  'completed',
  'complete',
  'paid',
  'ok',
  '200',
  '00',
  '0',
]);

const FAIL_TOKENS = new Set([
  'failed',
  'failure',
  'fail',
  'error',
  'declined',
  'rejected',
  'unsuccessful',
  'timeout',
  'timedout',
  'timed_out',
  'expired',
  'reversed',
  'refunded',
]);

const CANCEL_TOKENS = new Set(['cancelled', 'canceled', 'cancel', 'void', 'aborted']);

const PENDING_TOKENS = new Set([
  'pending',
  'processing',
  'process',
  'initiated',
  'queued',
  'queue',
  'in_progress',
  'in-progress',
  'ongoing',
  'waiting',
  'new',
]);

function normalizeToken(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_');
}

function messageImpliesSuccess(message: string): boolean {
  if (/status fetch successful|fetch successful|retrieved successfully/.test(message)) {
    return false;
  }
  return /completed successfully|payment successful|was successful|bill payment successful|bill payment was completed/.test(
    message
  );
}

function messageImpliesFailure(message: string): boolean {
  return /fail|declin|reject|unable|unsuccess|timeout|timed.?out|revers|error/.test(message);
}

function messageImpliesPending(message: string): boolean {
  return /pending|processing|initiated|queued|in.?progress|await/.test(message);
}

function messageImpliesCancel(message: string): boolean {
  return /cancel/.test(message);
}

/**
 * Map any Flutterwave bill payload (create, status poll, webhook data, full envelope).
 *
 * @param treatApiSuccessAsCompleted - For GET /v3/bills/{ref}: a successful envelope with
 *   bill details (flw_ref/tx_ref + amount) and no failure markers means the bill settled.
 */
export function mapFlwBillStatus(
  payload: any,
  opts?: { treatApiSuccessAsCompleted?: boolean }
): MappedBillStatus {
  if (!payload || typeof payload !== 'object') {
    return 'pending';
  }

  const envelope = payload;
  const data =
    envelope.data && typeof envelope.data === 'object' && !Array.isArray(envelope.data)
      ? envelope.data
      : envelope;

  const message = normalizeToken(
    `${data.message || ''} ${envelope.message || ''} ${data.response_message || ''}`
  ).replace(/_/g, ' ');

  const dataTokens = [
    data.status,
    data.payment_status,
    data.order_status,
    data.code,
    data.response_code,
    data.flw_status,
  ]
    .map(normalizeToken)
    .filter(Boolean);

  // Prefer data-level tokens over API envelope status ("success" often means HTTP/API OK).
  for (const token of dataTokens) {
    if (CANCEL_TOKENS.has(token) || messageImpliesCancel(message)) return 'cancelled';
    if (FAIL_TOKENS.has(token)) return 'failed';
    if (SUCCESS_TOKENS.has(token)) return 'completed';
    if (PENDING_TOKENS.has(token)) return 'pending';
  }

  if (messageImpliesCancel(message)) return 'cancelled';
  if (messageImpliesFailure(message)) return 'failed';
  if (messageImpliesSuccess(message)) return 'completed';
  if (messageImpliesPending(message)) return 'pending';

  // Create-payment often returns numeric code 200 without a status field.
  const code = normalizeToken(data.code ?? data.response_code);
  if (SUCCESS_TOKENS.has(code)) return 'completed';
  if (FAIL_TOKENS.has(code)) return 'failed';

  // GET bill status: successful envelope + settled bill fields ⇒ completed.
  if (opts?.treatApiSuccessAsCompleted) {
    const apiOk = SUCCESS_TOKENS.has(normalizeToken(envelope.status));
    const hasBillIdentity = Boolean(data.flw_ref || data.tx_ref || data.customer_reference);
    const hasAmount = data.amount !== undefined && data.amount !== null && data.amount !== '';
    if (apiOk && hasBillIdentity && hasAmount) {
      return 'completed';
    }
  }

  return 'pending';
}

export function toBillTransactionStatus(
  mapped: MappedBillStatus
): 'completed' | 'failed' | 'cancelled' | 'processing' {
  if (mapped === 'completed') return 'completed';
  if (mapped === 'failed') return 'failed';
  if (mapped === 'cancelled') return 'cancelled';
  return 'processing';
}

export function isTerminalBillStatus(status: string | null | undefined): boolean {
  return ['completed', 'failed', 'cancelled'].includes(String(status || '').toLowerCase());
}
