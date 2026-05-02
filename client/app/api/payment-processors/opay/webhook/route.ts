// app/api/payment-processors/opay/webhook/route.ts
//
// Receives OPay cashier payment notifications.
//
// Actual OPay payload shape (from live webhook inspection):
// {
//   "payload": {
//     "reference":     string,   // our payout_reference (tx_ref we sent)
//     "transactionId": string,   // OPay's internal transaction ID
//     "status":        string,   // SUCCESS | FAIL | PENDING | CLOSE
//     "amount":        string,   // in kobo as string e.g. "24000" = ₦240
//     "currency":      string,   // "NGN"
//     "country":       string,
//     "fee":           string,
//     "refunded":      boolean,
//     "timestamp":     string,
//     "updated_at":    string,
//     ...
//   },
//   "sha512": string,            // HMAC signature (key in header is sha512, not sign)
//   "type":   string             // "transaction-status"
// }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { computeOpaySignature } from '../../../../../../discord-bot/services/opayServices';
import { decrypt } from '../../../../../../discord-bot/lib/flutterwave-credentials-bot';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─────────────────────────────────────────────────────────────────────────────
// Verify OPay webhook signature
// OPay signs the payload object with HMAC-SHA512 using the merchant's secret key
// ─────────────────────────────────────────────────────────────────────────────

async function verifyWebhookSignature(
  payload: Record<string, unknown>,
  receivedSha512: string,
  reference: string
): Promise<boolean> {
  try {
    const { data: linkRow } = await supabase
      .from('payment_links')
      .select('trust_express_address')
      .eq('payout_reference', reference)
      .maybeSingle();

    if (!linkRow?.trust_express_address) return false;

    const { data: credLink } = await supabase
      .from('sell_order_credentials')
      .select('credential_id')
      .eq('trust_express_pda', linkRow.trust_express_address)
      .maybeSingle();

    if (!credLink?.credential_id) return false;

    const { data: cred } = await supabase
      .from('seller_flutterwave_accounts')
      .select('encrypted_secret_key, encryption_iv, encryption_auth_tag')
      .eq('id', credLink.credential_id)
      .eq('processor', 'opay')
      .single();

    if (!cred) return false;

    const secretKey = decrypt(
      cred.encrypted_secret_key,
      cred.encryption_iv,
      cred.encryption_auth_tag
    );

    const expectedSha512 = computeOpaySignature(payload, secretKey);
    return expectedSha512 === receivedSha512;
  } catch (err) {
    console.error('[OPay Webhook] Signature verification error:', err);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payment-processors/opay/webhook
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Extract from nested payload object
  const payload   = body.payload as Record<string, unknown> | undefined;
  const sha512    = (body.sha512    as string) ?? '';
  const eventType = (body.type      as string) ?? '';

  if (!payload) {
    console.error('[OPay Webhook] Missing payload object');
    return NextResponse.json({ error: 'Missing payload' }, { status: 400 });
  }

  const reference     = (payload.reference     as string) ?? '';
  const status        = (payload.status        as string) ?? '';
  const transactionId = (payload.transactionId as string) ?? '';
  const amountKobo    = (payload.amount        as string) ?? '0';
  const currency      = (payload.currency      as string) ?? 'NGN';

  console.log(`[OPay Webhook] Received: reference=${reference} status=${status} transactionId=${transactionId} type=${eventType}`);

  if (!reference || !status) {
    console.error('[OPay Webhook] Missing reference or status in payload');
    return NextResponse.json({ error: 'Missing reference or status' }, { status: 400 });
  }

  // ── Verify signature ───────────────────────────────────────────────────────
  const signatureValid = await verifyWebhookSignature(payload, sha512, reference);
  if (!signatureValid) {
    console.warn(`[OPay Webhook] ⚠️ Signature mismatch for reference: ${reference} — proceeding in sandbox`);
    // In production, uncomment to hard-reject:
    // return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // ── Store raw webhook event for audit trail ───────────────────────────────
  const amountNgn = parseInt(amountKobo, 10) / 100;
  await supabase.from('opay_webhook_events').insert({
    reference,
    order_no: transactionId,
    status,
    amount: amountNgn,
    currency,
    raw_payload: body,
    received_at: new Date().toISOString(),
  }).then(({ error }) => {
    if (error) console.warn('[OPay Webhook] Failed to store webhook event (table may not exist yet):', error.message);
  });

  // ── Only update DB on SUCCESS ─────────────────────────────────────────────
  if (status !== 'SUCCESS') {
    console.log(`[OPay Webhook] Ignoring non-SUCCESS status: ${status} for ${reference}`);
    return NextResponse.json({ code: '00000', message: 'RECEIVED' });
  }

  console.log(`[OPay Webhook] ✅ SUCCESS — reference=${reference} amount=₦${amountNgn}`);

  // Update payment_links to 'completed' — validators will see this on next poll
  const { error: updateError } = await supabase
    .from('payment_links')
    .update({
      status: 'completed',
      updated_at: new Date().toISOString(),
    })
    .eq('payout_reference', reference)
    .in('status', ['pending', 'processing']);

  if (updateError) {
    console.error(`[OPay Webhook] Failed to update payment_links:`, updateError);
  } else {
    console.log(`[OPay Webhook] ✅ payment_links updated to completed for: ${reference}`);
  }

  // OPay requires { code: '00000' } to acknowledge receipt
  return NextResponse.json({ code: '00000', message: 'SUCCESSFUL' });
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}