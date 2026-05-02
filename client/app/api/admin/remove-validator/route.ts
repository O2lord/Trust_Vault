// app/api/admin/remove-validator/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Connection, PublicKey } from '@solana/web3.js';

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
    const { adminPubkey, validatorToRemove, txSignature } = body as {
      adminPubkey?: string;       // authority wallet — signs the tx
      validatorToRemove?: string; // validator wallet — being removed
      txSignature?: string;
    };

    // ── 1. Basic input checks ─────────────────────────────────────────────────
    if (!adminPubkey)
      return NextResponse.json({ error: 'adminPubkey is required' }, { status: 400 });

    if (!validatorToRemove)
      return NextResponse.json({ error: 'validatorToRemove is required' }, { status: 400 });

    if (!txSignature)
      return NextResponse.json({ error: 'txSignature is required' }, { status: 400 });

    // ── 2. Validate adminPubkey ───────────────────────────────────────────────
    let callerPubkey: PublicKey;
    try {
      callerPubkey = new PublicKey(adminPubkey);
    } catch {
      return NextResponse.json(
        { error: 'adminPubkey is not a valid Solana public key' },
        { status: 400 }
      );
    }

    // ── 3. Verify tx was signed by the admin wallet ───────────────────────────
    const { valid: txValid, error: txError } = await verifyTxSignedByWallet(
      txSignature,
      adminPubkey
    );
    if (!txValid)
      return NextResponse.json({ error: `Transaction verification failed: ${txError}` }, { status: 401 });

    // ── 4. Confirm the admin is the on-chain program authority ────────────────
    let onChainAuthority: PublicKey;
    try {
      onChainAuthority = await getOnChainAuthority();
    } catch (err) {
      console.error('❌ Failed to fetch on-chain authority:', err);
      return NextResponse.json({ error: 'Could not verify on-chain authority' }, { status: 503 });
    }

    if (!onChainAuthority.equals(callerPubkey)) {
      console.warn(
        `⚠️ Unauthorized remove attempt — caller: ${adminPubkey}, authority: ${onChainAuthority.toBase58()}`
      );
      return NextResponse.json(
        { error: 'Forbidden: caller is not the program authority' },
        { status: 403 }
      );
    }

    // ── 5. Deactivate validator in Supabase ───────────────────────────────────
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('validators')
      .update({ is_active: false })
      .eq('wallet_pubkey', validatorToRemove)
      .select('id, wallet_pubkey, label')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        console.warn(`⚠️ Validator ${validatorToRemove} not found in Supabase — skipping deactivation`);
        return NextResponse.json(
          { success: true, warning: 'Validator was not in Supabase registry' },
          { status: 200 }
        );
      }
      console.error('❌ Supabase update error:', error);
      return NextResponse.json({ error: 'Failed to deactivate validator in database' }, { status: 500 });
    }

    console.log(`✅ Validator deactivated: ${validatorToRemove} by admin ${adminPubkey.slice(0, 8)} (tx: ${txSignature})`);
    return NextResponse.json({ success: true, validator: data }, { status: 200 });

  } catch (error) {
    console.error('❌ remove-validator error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}