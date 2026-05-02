// app/api/admin/register-validator/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Connection, PublicKey } from '@solana/web3.js';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';

const MAX_LABEL_LENGTH = 100;
const AUTHORITY_OFFSET = 8;

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase environment variables');
  return createClient(url, key);
}

function getSolanaConnection() {
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  if (!rpcUrl) throw new Error('Missing NEXT_PUBLIC_SOLANA_RPC_URL environment variable');
  return new Connection(rpcUrl, 'confirmed');
}

function getProgramId() {
  const programId = process.env.NEXT_PUBLIC_PROGRAM_ID;
  if (!programId) throw new Error('Missing NEXT_PUBLIC_PROGRAM_ID environment variable');
  return new PublicKey(programId);
}

async function getOnChainAuthority(): Promise<PublicKey> {
  const connection = getSolanaConnection();
  const programId = getProgramId();

  const [globalStatePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('global-state')],
    programId
  );

  const accountInfo = await connection.getAccountInfo(globalStatePDA);
  if (!accountInfo) throw new Error('GlobalState PDA not found on-chain');
  if (accountInfo.data.length < AUTHORITY_OFFSET + 32)
    throw new Error('GlobalState account data is too short to contain authority');

  return new PublicKey(accountInfo.data.slice(AUTHORITY_OFFSET, AUTHORITY_OFFSET + 32));
}

async function verifyTxSignedByWallet(
  txSignature: string,
  walletPubkey: string
): Promise<{ valid: boolean; error?: string }> {
  const connection = getSolanaConnection();

  const tx = await connection.getTransaction(txSignature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });

  if (!tx) return { valid: false, error: 'Transaction not found' };
  if (tx.meta?.err) return { valid: false, error: 'Transaction failed on-chain' };

  const { staticAccountKeys, header } = tx.transaction.message;
  const signers = staticAccountKeys.slice(0, header.numRequiredSignatures);
  const callerSigned = signers.some(k => k.toBase58() === walletPubkey);

  if (!callerSigned)
    return { valid: false, error: 'Transaction was not signed by claimed wallet' };

  return { valid: true };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { adminPubkey, validatorPubkey, label, txSignature } = body as {
      adminPubkey?: string;       // authority wallet — signs the tx
      validatorPubkey?: string;   // validator wallet — being registered
      label?: string;
      txSignature?: string;
    };

    // ── 1. Basic input checks ─────────────────────────────────────────────────
    if (!adminPubkey)
      return NextResponse.json({ error: 'adminPubkey is required' }, { status: 400 });

    if (!validatorPubkey)
      return NextResponse.json({ error: 'validatorPubkey is required' }, { status: 400 });

    if (!txSignature)
      return NextResponse.json({ error: 'txSignature is required' }, { status: 400 });

    // ── 2. Validate pubkeys ───────────────────────────────────────────────────
    let callerPubkey: PublicKey;
    try {
      callerPubkey = new PublicKey(adminPubkey);
    } catch {
      return NextResponse.json(
        { error: 'adminPubkey is not a valid Solana public key' },
        { status: 400 }
      );
    }

    try {
      new PublicKey(validatorPubkey);
    } catch {
      return NextResponse.json(
        { error: 'validatorPubkey is not a valid Solana public key' },
        { status: 400 }
      );
    }

    // ── 3. Validate label length ──────────────────────────────────────────────
    if (label && label.trim().length > MAX_LABEL_LENGTH)
      return NextResponse.json(
        { error: `label must be ${MAX_LABEL_LENGTH} characters or fewer` },
        { status: 400 }
      );

    // ── 4. Verify tx was signed by the admin wallet ───────────────────────────
    const { valid: txValid, error: txError } = await verifyTxSignedByWallet(
      txSignature,
      adminPubkey
    );
    if (!txValid)
      return NextResponse.json({ error: `Transaction verification failed: ${txError}` }, { status: 401 });

    // ── 5. Confirm the admin is the on-chain program authority ────────────────
    let onChainAuthority: PublicKey;
    try {
      onChainAuthority = await getOnChainAuthority();
    } catch (err) {
      console.error('❌ Failed to fetch on-chain authority:', err);
      return NextResponse.json({ error: 'Could not verify on-chain authority' }, { status: 503 });
    }

    if (!onChainAuthority.equals(callerPubkey)) {
      console.warn(
        `⚠️ Unauthorized register attempt — caller: ${adminPubkey}, authority: ${onChainAuthority.toBase58()}`
      );
      return NextResponse.json(
        { error: 'Forbidden: caller is not the program authority' },
        { status: 403 }
      );
    }

    // ── 6. Generate API key and store its hash ────────────────────────────────
    const apiKey = `vk_${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`;
    const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');

    // ── 7. Upsert validator in Supabase (keyed on validatorPubkey) ────────────
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('validators')
      .upsert(
        {
          wallet_pubkey: validatorPubkey,
          api_key_hash: apiKeyHash,
          label: label?.trim().slice(0, MAX_LABEL_LENGTH) || `Validator ${validatorPubkey.slice(0, 8)}`,
          is_active: true,
          last_seen: null,
        },
        {
          onConflict: 'wallet_pubkey',
          ignoreDuplicates: false,
        }
      )
      .select('id, wallet_pubkey, label, created_at')
      .single();

    if (error) {
      console.error('❌ Supabase upsert error:', error);
      return NextResponse.json({ error: 'Failed to register validator in database' }, { status: 500 });
    }

    console.log(`✅ Validator registered: ${validatorPubkey} by admin ${adminPubkey.slice(0, 8)} (tx: ${txSignature})`);

    return NextResponse.json(
      {
        success: true,
        apiKey,  // plaintext — returned once, never stored
        validator: data,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('❌ register-validator error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}