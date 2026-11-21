import { randomInt } from "crypto";
import { prisma } from "@/lib/prisma";

export type PaymentProvider = "razorpay" | "stripe";

export interface RecordPaymentInput {
  organizationId: string;
  provider: PaymentProvider;
  /** Unique per payment at the provider (Razorpay pay_…, Stripe invoice in_… / payment intent pi_…). */
  providerPaymentId: string;
  providerOrderId?: string | null;
  /** Smallest currency unit (paise / cents). */
  amount: number;
  currency: string;
  status: string;
  plan?: string | null;
  interval?: string | null;
  description?: string | null;
  paidAt?: Date;
}

const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** `CF-YYYYMM-XXXXXX` (6 random uppercase alphanumerics). */
export function generateInvoiceNumber(date = new Date()): string {
  const ym = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  let suffix = "";
  for (let i = 0; i < 6; i++) suffix += ALNUM[randomInt(ALNUM.length)];
  return `CF-${ym}-${suffix}`;
}

const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === "P2002";

/**
 * Idempotently records a confirmed payment, keyed by `providerPaymentId`.
 * Safe to call from several places for the same payment (e.g. client verify + webhook):
 * the first call creates the row (with a fresh invoice number), later calls only refresh
 * status and fill in fields that were missing — the invoice number never changes.
 */
export async function recordPayment(input: RecordPaymentInput) {
  const paidAt = input.paidAt ?? new Date();
  const update: Record<string, unknown> = { status: input.status };
  if (input.providerOrderId) update.providerOrderId = input.providerOrderId;
  if (input.plan) update.plan = input.plan;
  if (input.interval) update.interval = input.interval;
  if (input.description) update.description = input.description;

  let lastErr: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.payment.upsert({
        where: { providerPaymentId: input.providerPaymentId },
        update,
        create: {
          organizationId: input.organizationId,
          provider: input.provider,
          providerPaymentId: input.providerPaymentId,
          providerOrderId: input.providerOrderId ?? null,
          amount: Math.round(input.amount),
          currency: input.currency.toUpperCase(),
          status: input.status,
          plan: input.plan ?? null,
          interval: input.interval ?? null,
          description: input.description ?? null,
          invoiceNumber: generateInvoiceNumber(paidAt),
          paidAt,
        },
      });
    } catch (e) {
      // Either the invoice number collided, or a concurrent call created the same payment first.
      // Both resolve on retry: a new invoice number, or the upsert now takes the update path.
      if (!isUniqueViolation(e)) throw e;
      lastErr = e;
    }
  }
  throw lastErr;
}

/** Same as recordPayment, but never throws — payment recording must not break the payment flow. */
export async function recordPaymentSafe(input: RecordPaymentInput) {
  try {
    return await recordPayment(input);
  } catch (err) {
    console.error(`[payments] failed to record ${input.provider} payment ${input.providerPaymentId}:`, err);
    return null;
  }
}
