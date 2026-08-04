// lib/validator-auth.ts
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface AuthResult {
  valid: boolean;
  validatorPubkey?: string;
  error?: string;
}

export async function authenticateValidator(
  apiKey: string | null,
  botVersion: string | null
): Promise<AuthResult> {
  // ── DEBUG: confirm which Supabase project this deployment is actually
  // talking to, and exactly what was received in the headers (JSON.stringify
  // exposes hidden whitespace/newlines that a plain console.log would hide).
  console.error(
    '[auth debug] SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL,
    '| SERVICE_ROLE_KEY set:', !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    '| apiKey:', JSON.stringify(apiKey), 'len:', apiKey?.length,
    '| botVersion:', JSON.stringify(botVersion)
  );

  if (!apiKey) return { valid: false, error: 'Missing API key' };

  const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');
  console.error('[auth debug] computed apiKeyHash:', apiKeyHash);

  const { data, error } = await supabase
    .from('validators')
    .select('wallet_pubkey, is_active')
    .eq('api_key_hash', apiKeyHash)
    .single();

  if (error || !data || !data.is_active) {
    console.error(
      '[auth debug] validator lookup failed —',
      'supabase error:', error?.message ?? '(none)',
      '| error code:', error?.code ?? '(none)',
      '| row found:', !!data,
      '| is_active:', data?.is_active ?? '(n/a)'
    );
    return { valid: false, error: 'Unauthorized' };
  }

  console.error('[auth debug] key matched validator:', data.wallet_pubkey);

  // ── Version check ─────────────────────────────────────────────────────────
  if (!botVersion) {
    // No version header at all — block it
    // Old bots before this feature was added won't have it
    console.error('[auth debug] rejected: missing bot version header');
    return { valid: false, error: 'Missing bot version. Please update your validator bot.' };
  }

  // Fetch the two most recent allowed versions
  const { data: versions, error: versionError } = await supabase
    .from('bot_versions')
    .select('version_hash, is_allowed')
    .eq('is_allowed', true)
    .order('released_at', { ascending: false })
    .limit(2); // current + previous only

  if (versionError || !versions || versions.length === 0) {
    console.error(
      '[auth debug] bot_versions lookup failed —',
      'supabase error:', versionError?.message ?? '(none)',
      '| rows returned:', versions?.length ?? 0
    );
    // No versions in table yet — block everything until admin seeds the table
    return { valid: false, error: 'No approved bot versions configured. Contact admin.' };
  }

  const allowedHashes = versions.map(v => v.version_hash);
  const isAllowed = allowedHashes.includes(botVersion);

  console.error(
    '[auth debug] version check —',
    'received:', JSON.stringify(botVersion),
    '| allowed:', JSON.stringify(allowedHashes),
    '| isAllowed:', isAllowed
  );

  if (!isAllowed) {
    // Log the attempt so admin can investigate
    await supabase.from('validator_version_flags').insert({
      wallet_pubkey: data.wallet_pubkey,
      version_hash: botVersion,
      flagged_at: new Date().toISOString(),
      reason: allowedHashes.length > 0
        ? 'version_too_old_or_modified'
        : 'unknown_version',
    }).then(() => {}); // fire and forget

    return {
      valid: false,
      error: `Bot version not allowed. You must be on the current or previous release. Please update your validator bot.`,
    };
  }

  console.error('[auth debug] AUTH SUCCESS for', data.wallet_pubkey);
  return { valid: true, validatorPubkey: data.wallet_pubkey };
}