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
  if (!apiKey) return { valid: false, error: 'Missing API key' };

  const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');
  const { data, error } = await supabase
    .from('validators')
    .select('wallet_pubkey, is_active')
    .eq('api_key_hash', apiKeyHash)
    .single();

  if (error || !data || !data.is_active) {
  console.error('validator auth lookup failed:', error?.message ?? 'no matching row / inactive');
  return { valid: false, error: 'Unauthorized' };
}

  // ── Version check ─────────────────────────────────────────────────────────
  if (!botVersion) {
    // No version header at all — block it
    // Old bots before this feature was added won't have it
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
    // No versions in table yet — block everything until admin seeds the table
    return { valid: false, error: 'No approved bot versions configured. Contact admin.' };
  }

  const allowedHashes = versions.map(v => v.version_hash);
  const isAllowed = allowedHashes.includes(botVersion);

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

  return { valid: true, validatorPubkey: data.wallet_pubkey };
}