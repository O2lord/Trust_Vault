// app/api/confirm-payment/route.ts
// ✅ FIXED: Now properly retrieves and uses seller's Flutterwave credentials

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Connection, PublicKey, Keypair, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import  NodeWallet  from '@coral-xyz/anchor/dist/cjs/nodewallet';
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getMint, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import IDL from '@/relics/trust_express/trust_express.json';
import { TrustVault as TrustExpress } from '@/relics/trust_express/trust_express';
import FlutterwaveService from '../../../../discord-bot/services/flutterwaveService';
import bs58 from 'bs58';


// Early environment variable validation
function validateEnvironmentVariables(): { valid: boolean; error?: string } {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { valid: false, error: 'NEXT_PUBLIC_SUPABASE_URL is not configured' };
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { valid: false, error: 'SUPABASE_SERVICE_ROLE_KEY is not configured' };
  }
  if (!process.env.BOT_WALLET_PRIVATE_KEY) {
    return { valid: false, error: 'BOT_WALLET_PRIVATE_KEY is not configured' };
  }
  if (!process.env.TRUST_EXPRESS_PROGRAM_ID) {
    return { valid: false, error: 'TRUST_EXPRESS_PROGRAM_ID is not configured' };
  }
  if (!process.env.NEXT_PUBLIC_SOLANA_RPC_URL) {
    return { valid: false, error: 'NEXT_PUBLIC_SOLANA_RPC_URL is not configured' };
  }
  return { valid: true };
}

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Initialize Solana connection
const connection = new Connection(
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com'
);

// Program ID - with validation
let PROGRAM_ID: PublicKey;
try {
  PROGRAM_ID = new PublicKey(process.env.TRUST_EXPRESS_PROGRAM_ID!);
} catch (error) {
  console.error('❌ Invalid TRUST_EXPRESS_PROGRAM_ID format');
  throw error;
}

interface ConfirmPaymentRequest {
  payoutReference: string;
  tx_ref: string;
  transaction_id: string;
  status: string;
}

/**
 * ✅ NEW: Helper function to get seller's credential ID
 * Looks up the credential from sell_order_credentials table
 */
async function getSellerCredentialId(trustExpressPda: string): Promise<string | null> {
  try {
    console.log(`🔍 Looking up seller credential for trust express: ${trustExpressPda}`);

    const { data, error } = await supabase
      .from('sell_order_credentials')
      .select('credential_id')
      .eq('trust_express_pda', trustExpressPda)  // ✅ FIXED: Changed from trust_express_address to trust_express_pda
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

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  

  // Declare payoutReference in outer scope for rollback accessibility
  let payoutReference: string | undefined;

  try {
    // Step 0: Validate environment variables early
    const envValidation = validateEnvironmentVariables();
    if (!envValidation.valid) {
      console.error(`❌ Environment validation failed: ${envValidation.error}`);
      return NextResponse.json(
        { 
          success: false, 
          error: `Server configuration error: ${envValidation.error}`,
          code: 'ENV_CONFIG_ERROR'
        },
        { status: 500 }
      );
    }

    const body: ConfirmPaymentRequest = await request.json();
    const { tx_ref, transaction_id, status } = body;
    payoutReference = body.payoutReference; // Assign to outer scope

    
    

    // Validate required parameters
    if (!payoutReference || !tx_ref || !transaction_id || !status) {
      console.error('❌ Missing required parameters');
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing required parameters',
          code: 'MISSING_PARAMS'
        },
        { status: 400 }
      );
    }

    // Check if status indicates success
    if (status !== 'completed') {
      console.warn(`⚠️ Payment not completed. Status: ${status}`);
      return NextResponse.json(
        { 
          success: false, 
          error: `Payment not completed. Status: ${status}`,
          code: 'PAYMENT_NOT_COMPLETED'
        },
        { status: 400 }
      );
    }

    // Step 1: Acquire lock by updating status to 'processing'
    console.log('🔒 Acquiring lock on payment link...');
    const { data: lockData, error: lockError } = await supabase
      .from('payment_links')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('payout_reference', payoutReference)
      .eq('status', 'pending')
      .select()
      .single();

    if (lockError || !lockData) {
      // Check if already completed
      const { data: existingLink } = await supabase
        .from('payment_links')
        .select('status')
        .eq('payout_reference', payoutReference)
        .single();

      if (existingLink?.status === 'completed') {
        console.log('✅ Payment already processed');
        return NextResponse.json(
          { 
            success: true, 
            message: 'Payment already processed', 
            alreadyProcessed: true 
          },
          { status: 200 }
        );
      }

      console.error('❌ Failed to acquire lock or payment link not found:', lockError);
      return NextResponse.json(
        { 
          success: false, 
          error: 'Payment link not found or already being processed',
          code: 'LOCK_ACQUISITION_FAILED'
        },
        { status: 404 }
      );
    }

    const paymentLink = lockData;
    console.log('✅ Lock acquired');
    console.log(`   Trust Express: ${paymentLink.trust_express_address}`);
    console.log(`   Buyer: ${paymentLink.buyer_address}`);
    console.log(`   Seller: ${paymentLink.seller_address}`);
    console.log(`   Amount: ${paymentLink.amount} ${paymentLink.currency}`);

    // ✅ STEP 2: Get seller's credential ID from sell_order_credentials table
    console.log('\n🔍 Step 2: Retrieving seller credentials...');
    const sellerCredentialId = await getSellerCredentialId(paymentLink.trust_express_address);

    if (!sellerCredentialId) {
      console.error('❌ No seller credentials found for this order');
      
      // Rollback lock
      await supabase
        .from('payment_links')
        .update({ status: 'pending' })
        .eq('payout_reference', payoutReference);

      return NextResponse.json(
        { 
          success: false, 
          error: 'Seller Flutterwave credentials not found for this order',
          code: 'SELLER_CREDENTIALS_NOT_FOUND'
        },
        { status: 404 }
      );
    }

    console.log(`✅ Seller credential ID: ${sellerCredentialId}`);

    // ✅ STEP 3: Verify payment with Flutterwave using seller's credentials
    console.log('\n🔍 Step 3: Verifying payment with Flutterwave...');
    console.log(`   TX Ref: ${tx_ref}`);
    console.log(`   Using seller credential: ${sellerCredentialId}`);
    
    let verificationResult;
    try {
      // ✅ ALWAYS use seller's credentials - no fallback
      verificationResult = await FlutterwaveService.verifyPayment(
        tx_ref,
        sellerCredentialId  // ✅ MANDATORY: Always use seller's credentials
      );
    } catch (verifyError) {
      console.error('❌ Flutterwave verification error:', verifyError);
      
      // Rollback lock
      await supabase
        .from('payment_links')
        .update({ status: 'pending' })
        .eq('payout_reference', payoutReference);

      return NextResponse.json(
        { 
          success: false, 
          error: `Payment verification service error: ${verifyError instanceof Error ? verifyError.message : String(verifyError)}`,
          code: 'VERIFICATION_SERVICE_ERROR'
        },
        { status: 500 }
      );
    }

    console.log('   Verification result:', verificationResult);

    if (!verificationResult.verified) {
      console.error('❌ Flutterwave verification failed:', verificationResult);
      
      // Rollback lock
      await supabase
        .from('payment_links')
        .update({ status: 'pending' })
        .eq('payout_reference', payoutReference);

      return NextResponse.json(
        { 
          success: false, 
          error: 'Payment verification failed with Flutterwave',
          code: 'VERIFICATION_FAILED',
          details: verificationResult
        },
        { status: 400 }
      );
    }

    console.log('✅ Payment verified with Flutterwave');
    console.log(`   Transaction ID: ${verificationResult.transactionId}`);
    console.log(`   Amount: ${verificationResult.amount} ${verificationResult.currency}`);
    console.log(`   Status: ${verificationResult.status}`);
    
    

    // Step 4: Verify payment amount matches expected amount
    console.log('\n💰 Step 4: Verifying payment amount...');
    const expectedFiatAmount = paymentLink.amount;
    const actualFiatAmount = verificationResult.amount;

    console.log(`   Expected: ${expectedFiatAmount} ${paymentLink.currency}`);
    console.log(`   Received: ${actualFiatAmount} ${verificationResult.currency}`);

    if (actualFiatAmount && Math.abs(actualFiatAmount - expectedFiatAmount) > 0.01) {
      console.error(`❌ Amount mismatch! Expected: ${expectedFiatAmount}, Got: ${actualFiatAmount}`);
      
      await supabase
        .from('payment_links')
        .update({ status: 'failed' })
        .eq('payout_reference', payoutReference);

      return NextResponse.json(
        { 
          success: false, 
          error: `Payment amount mismatch. Expected: ${expectedFiatAmount}, Got: ${actualFiatAmount}`,
          code: 'AMOUNT_MISMATCH'
        },
        { status: 400 }
      );
    }

    console.log('✅ Amount verified');

    // Step 5: Initialize bot wallet with enhanced error handling
    console.log('\n🤖 Step 5: Initializing bot wallet...');
    const botPrivateKey = process.env.BOT_WALLET_PRIVATE_KEY;
    
    let botKeypair: Keypair;
    try {
      const privateKeyArray = bs58.decode(botPrivateKey!);
      botKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
      console.log(`✅ Bot wallet initialized: ${botKeypair.publicKey.toString()}`);
    } catch (parseError) {
      console.error('❌ Failed to parse BOT_WALLET_PRIVATE_KEY:', parseError);
      
      // Rollback lock
      await supabase
        .from('payment_links')
        .update({ status: 'pending' })
        .eq('payout_reference', payoutReference);

      return NextResponse.json(
        { 
          success: false, 
          error: 'Server configuration error: Invalid bot wallet private key format',
          code: 'INVALID_BOT_WALLET'
        },
        { status: 500 }
      );
    }


    // Step 6: Create wallet and provider
    console.log('\n⚙️ Step 6: Setting up Solana program...');
    const wallet = new NodeWallet(botKeypair);
    const provider = new AnchorProvider(connection, wallet, AnchorProvider.defaultOptions());
    
    const program = new Program<TrustExpress>(
      IDL as TrustExpress, 
      provider
    );

    console.log(`✅ Program initialized: ${PROGRAM_ID.toString()}`);

    // Step 7: Fetch trust express account
    console.log('\n📖 Step 7: Fetching trust express account...');
    const trustExpressPubkey = new PublicKey(paymentLink.trust_express_address);
    
    let trustExpressAccount;
    try {
      trustExpressAccount = await program.account.trustExpress.fetch(trustExpressPubkey);
      console.log('✅ Trust express account fetched');
      console.log(`   Maker: ${trustExpressAccount.maker.toString()}`);
      console.log(`   Mint: ${trustExpressAccount.mint.toString()}`);
      console.log(`   Available amount: ${trustExpressAccount.amount.toString()}`);
    } catch (fetchError) {
      console.error('❌ Failed to fetch trust express account:', fetchError);
      
      await supabase
        .from('payment_links')
        .update({ status: 'failed' })
        .eq('payout_reference', payoutReference);

      return NextResponse.json(
        { 
          success: false, 
          error: `Trust express account not found or inaccessible: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`,
          code: 'TRUST_EXPRESS_FETCH_FAILED'
        },
        { status: 400 }
      );
    }

    // Step 8: Determine token program and get mint info
    console.log('\n🪙 Step 8: Getting mint information...');
    const mintAccountInfo = await connection.getAccountInfo(trustExpressAccount.mint);
    const isToken2022 = mintAccountInfo?.owner.equals(TOKEN_2022_PROGRAM_ID) ?? false;
    const tokenProgram = isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    
    console.log(`   Token program: ${isToken2022 ? 'Token-2022' : 'Token Program'}`);

    // Get mint decimals
    let mintInfo;
    try {
      mintInfo = await getMint(
        connection,
        trustExpressAccount.mint,
        undefined,
        tokenProgram
      );
      console.log(`✅ Mint info retrieved`);
      console.log(`   Decimals: ${mintInfo.decimals}`);
    } catch (mintError) {
      console.error('❌ Failed to get mint info:', mintError);
      
      await supabase
        .from('payment_links')
        .update({ status: 'failed' })
        .eq('payout_reference', payoutReference);

      return NextResponse.json(
        { 
          success: false, 
          error: `Failed to fetch mint information: ${mintError instanceof Error ? mintError.message : String(mintError)}`,
          code: 'MINT_INFO_FETCH_FAILED'
        },
        { status: 500 }
      );
    }

    // Step 9: Get associated token accounts
    console.log('\n🔑 Step 9: Preparing token accounts...');
    const trustExpressAta = getAssociatedTokenAddressSync(
      trustExpressAccount.mint,
      trustExpressPubkey,
      true,
      tokenProgram
    );
    console.log(`   Trust Express ATA: ${trustExpressAta.toString()}`);

    let takerAta: PublicKey;
    try {
      takerAta = getAssociatedTokenAddressSync(
        trustExpressAccount.mint,
        new PublicKey(paymentLink.buyer_address),
        false,
        tokenProgram
      );
      console.log(`   Buyer ATA: ${takerAta.toString()}`);
    } catch (ataError) {
      console.error('❌ Invalid buyer address:', ataError);
      
      await supabase
        .from('payment_links')
        .update({ status: 'failed' })
        .eq('payout_reference', payoutReference);

      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid buyer address in payment link',
          code: 'INVALID_BUYER_ADDRESS'
        },
        { status: 400 }
      );
    }

    const feeDestinationAta = getAssociatedTokenAddressSync(
      trustExpressAccount.mint,
      trustExpressAccount.feeDestination,
      false,
      tokenProgram
    );
    console.log(`   Fee Destination ATA: ${feeDestinationAta.toString()}`);

    
    
    

    // Step 10: Execute confirmSellPayment instruction
    console.log('\n⛓️ Step 10: Executing on-chain transaction...');
    console.log(`   Confirming payment for reference: ${payoutReference}`);
    
   

let signature: string;
try {
  signature = await program.methods
    .confirmSellPayment(
      new PublicKey(paymentLink.buyer_address),
      payoutReference,
      true, // Payment verified successfully
      'Payment verified via Flutterwave'
    )
   .accountsPartial({
      trustExpress: trustExpressPubkey,
      botAuthority: botKeypair.publicKey,
      maker: new PublicKey(paymentLink.seller_address),
      mint: trustExpressAccount.mint,
      trustExpressAta: trustExpressAta,
      feeDestinationAta: feeDestinationAta,
      takerAta: takerAta,
      tokenProgram: tokenProgram,
    })
    .rpc();

  console.log(`✅ Transaction confirmed!`);
  console.log(`   Signature: ${signature}`);
      
    } catch (txError) {
      console.error('❌ Blockchain transaction failed:', txError);
      
      await supabase
        .from('payment_links')
        .update({ status: 'failed' })
        .eq('payout_reference', payoutReference);

      return NextResponse.json(
        { 
          success: false, 
          error: `Blockchain transaction failed: ${txError instanceof Error ? txError.message : String(txError)}`,
          code: 'BLOCKCHAIN_TX_FAILED'
        },
        { status: 500 }
      );
    }

// Step 11: Update payment link status and generate receipt
console.log('\n💾 Step 11: Updating database records...');
const { error: updateError } = await supabase
  .from('payment_links')
  .update({
    status: 'completed',
    updated_at: new Date().toISOString(),
  })
  .eq('payout_reference', payoutReference);

if (updateError) {
  console.error('⚠️ Failed to update payment link status:', updateError);
} else {
  console.log('✅ Payment link status updated to completed');
}

const processingTime = Date.now() - startTime;

// ✅ Calculate fee amount (5% default from trust express program)
const feePercentage = 5; // This matches the program's 5bp = 0.05%
const tokenAmountRaw = paymentLink.amount;
const tokenAmountScaled = tokenAmountRaw / Math.pow(10, mintInfo.decimals);

// Calculate fee in smallest units
const feeAmountRaw = Math.floor((tokenAmountRaw * feePercentage) / 10000);
const feeAmountScaled = feeAmountRaw / Math.pow(10, mintInfo.decimals);

console.log('📊 Receipt Calculation:');
console.log(`   Token Amount (raw): ${tokenAmountRaw}`);
console.log(`   Token Amount (scaled): ${tokenAmountScaled}`);
console.log(`   Fee Amount (raw): ${feeAmountRaw}`);
console.log(`   Fee Amount (scaled): ${feeAmountScaled}`);
console.log(`   Fiat Amount: ${actualFiatAmount}`);

// ✅ Generate receipt with ALL required fields
console.log('📄 Generating receipt...');
const { data: receiptData, error: receiptError } = await supabase
  .from('receipts')
  .insert({
    payout_reference: payoutReference,
    transaction_signature: signature,
    trust_express_address: trustExpressPubkey.toString(),
    taker_address: paymentLink.buyer_address,
    maker_address: paymentLink.seller_address,
    token_amount: tokenAmountRaw.toString(),
    fiat_amount: actualFiatAmount?.toString(),
    currency: verificationResult.currency,
    fee_amount: feeAmountRaw.toString(),
    payout_method: 'flutterwave_payment_link',
    payout_details: {
      transaction_id: transaction_id,
      tx_ref: tx_ref,
      payment_link: paymentLink.link_url,
      verification_data: verificationResult,
      seller_credential_id: sellerCredentialId, // ✅ Track which credential was used
    },
    flw_reference: transaction_id,
    status: 'success',
    mint_address: trustExpressAccount.mint.toString(),
    created_at: new Date().toISOString(),
  })
  .select()
  .single();

if (receiptError) {
  console.error('⚠️ Failed to create receipt entry:', receiptError);
  console.error('   Error code:', receiptError.code);
  console.error('   Error message:', receiptError.message);
  // Note: The transaction is already complete on-chain, so we still return success
} else {
  console.log('✅ Receipt created successfully');
  console.log(`   Receipt ID: ${receiptData.id}`);
}

console.log('\n✅ Payment confirmation completed successfully!');
console.log(`   Total processing time: ${processingTime}ms`);

// ✅ Return comprehensive response
return NextResponse.json({
  success: true,
  message: 'Payment confirmed and tokens released successfully!',
  transactionSignature: signature,
  receiptId: receiptData?.id,
  tokenAmount: `${tokenAmountScaled.toFixed(mintInfo.decimals)} tokens`,
  feeAmount: `${feeAmountScaled.toFixed(mintInfo.decimals)} tokens`,
  fiatAmount: actualFiatAmount?.toString(),
  currency: verificationResult.currency,
  processingTime: `${processingTime}ms`,
  sellerCredentialId: sellerCredentialId, // ✅ Include for debugging
});

  } catch (error) {
    console.error('❌ Error in confirm-payment API:', error);
    
    // Attempt to rollback lock if payoutReference is available
    if (payoutReference) {
      try {
        await supabase
          .from('payment_links')
          .update({ status: 'pending' })
          .eq('payout_reference', payoutReference)
          .eq('status', 'processing');
        console.log('🔄 Lock rolled back');
      } catch (rollbackError) {
        console.error('❌ Failed to rollback lock:', rollbackError);
      }
    }

    // Robust error message extraction
    let errorMessage: string;
    if (error instanceof Error) {
      errorMessage = error.message;
    } else {
      errorMessage = String(error);
    }
    
    return NextResponse.json(
      { 
        success: false, 
        error: `Failed to confirm payment: ${errorMessage}`,
        code: 'INTERNAL_SERVER_ERROR'
      },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}