// lib/get-seller-credentials.ts
// ✅ FIXED: Helper to get seller's Flutterwave credential ID from trust express PDA
// Now uses correct column name: trust_express_pda

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Get seller's Flutterwave credential ID for a sell order
 * @param trustExpressPda - Trust Express PDA address
 * @returns Seller's credential ID or null if not found
 */
export async function getSellerCredentialId(
  trustExpressPda: string
): Promise<string | null> {
  try {
    console.log(`🔍 Looking up seller credential for trust express: ${trustExpressPda}`);

    const { data, error } = await supabase
      .from('sell_order_credentials')
      .select('credential_id')
      .eq('trust_express_pda', trustExpressPda)  // ✅ FIXED: Correct column name
      .single();

    if (error) {
      console.error('❌ Error fetching seller credential:', error);
      return null;
    }

    if (!data) {
      console.error('❌ No credential found for trust express:', trustExpressPda);
      return null;
    }

    console.log(`✅ Found seller credential ID: ${data.credential_id}`);
    return data.credential_id;
  } catch (error) {
    console.error('❌ Error getting seller credential:', error);
    return null;
  }
}

/**
 * Get seller's credential ID from a payment reference
 * @param payoutReference - Payment/payout reference (e.g., IS-1770720837080-2DdU1e5d)
 * @returns Seller's credential ID or null if not found
 */
export async function getSellerCredentialIdFromReference(
  payoutReference: string
): Promise<string | null> {
  try {
    console.log(`🔍 Looking up seller credential from reference: ${payoutReference}`);

    // Step 1: Get trust express PDA from payment_links
    const { data: paymentLink, error: linkError } = await supabase
      .from('payment_links')
      .select('trust_express_address')  // payment_links still uses trust_express_address
      .eq('payout_reference', payoutReference)
      .single();

    if (linkError || !paymentLink) {
      console.error('❌ Payment link not found:', linkError);
      return null;
    }

    console.log(`✅ Found trust express: ${paymentLink.trust_express_address}`);

    // Step 2: Get credential ID from sell_order_credentials using trust_express_pda
    return await getSellerCredentialId(paymentLink.trust_express_address);
  } catch (error) {
    console.error('❌ Error getting seller credential from reference:', error);
    return null;
  }
}

/**
 * Validate that a sell order has active Flutterwave credentials
 * @param trustExpressPda - Trust Express PDA address
 * @returns Validation result
 */
export async function validateSellOrderHasCredentials(
  trustExpressPda: string
): Promise<{ valid: boolean; credentialId?: string; error?: string }> {
  try {
    const credentialId = await getSellerCredentialId(trustExpressPda);

    if (!credentialId) {
      return {
        valid: false,
        error: 'No Flutterwave credentials linked to this sell order'
      };
    }

    // Check if credentials are active
    const { data: credential, error } = await supabase
      .from('seller_flutterwave_accounts')
      .select('is_active')
      .eq('id', credentialId)
      .single();

    if (error || !credential) {
      return {
        valid: false,
        error: 'Failed to verify credential status'
      };
    }

    if (!credential.is_active) {
      return {
        valid: false,
        error: 'Flutterwave credentials are inactive'
      };
    }

    return { 
      valid: true, 
      credentialId 
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}