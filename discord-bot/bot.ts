import { Client, GatewayIntentBits } from "discord.js";
import { Connection, PublicKey, Keypair, SystemProgram, Transaction, TransactionInstruction, AccountInfo } from "@solana/web3.js";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { EventParser } from "./components/eventParser.js";
import { NotificationManager } from "./components/notification.js";
import { RoleSpecificEmbeds } from "./components/roleSpecificEmbeds.js";
import FlutterwaveService from "./services/flutterwaveService.js";
import OpayService from "./services/opayServices.js";
import PaystackService from "./services/paystackService.js";
import { decrypt } from "./lib/flutterwave-credentials-bot.js";
import { getPaystackCredentialsForSellOrder } from "./lib/paystack-credentials-bot.js";
// NOTE: getCredentialsForTrustExpress removed — this bot no longer initiates payouts.
// Credential fetching is now handled by the validator bots via /api/verify-payment.
import bs58 from "bs58";
import { v4 as uuidv4 } from 'uuid';
import { getMint } from '@solana/spl-token';


dotenv.config({ path: ".env.local" });
interface LogsContext {
  signature?: string;
  accounts?: string[];
  programId?: string;
}

interface TransactionLogs {
  logs: string[];
  signature?: string;
}

interface EventData {
  trustExpress?: string;
  taker?: string;
  amount?: string;
  fiatAmount?: string;
  currency?: string;
  payoutDetails?: string | null;
  payoutReference?: string | null;
  [key: string]: string | number | boolean | string[] | { [key: string]: string | null } | null | undefined;
}

interface ParsedEvent {
  type: string;
  data: EventData;
  participants: { [key: string]: string | null };
  signature: string;
  timestamp: number;
  programSource?: 'TRUST_VAULT' | 'TRUST_EXPRESS';  
}

interface ReservedAmount {
  taker: PublicKey;
  amount: string;
  fiatAmount: string;
  timestamp: string;
  sellerInstructions: string | null;
  status: number;
  disputeReason: string | null;
  disputeId: string | null;
  payoutDetails: string | null;
  payoutReference: string | null;
}

interface PayoutDetails {
  account_number: string;
  bank_code?: string;
  account_bank?: string;
  account_name?: string;
  beneficiary_name?: string;
  phone_number?: string;
  network?: string;
  narration?: string;
  type?: 'bank_transfer' | 'mobile_money' | 'flutterwave_wallet';
  [key: string]: string | undefined;
}


interface CredentialInfo {
  secret_key: string;
  credential_id: string;
  wallet_address: string;
  is_active: boolean;
  label: string | null;
}

interface FlutterwaveTransferData {
  id: number;
  account_number: string;
  bank_code: string;
  full_name: string;
  created_at: string;
  currency: string;
  debit_currency: string;
  amount: number;
  fee: number;
  status: string;
  reference: string;
  meta?: Record<string, unknown>;
  narration: string;
  complete_message: string;
  requires_approval: number;
  is_approved: number;
  bank_name: string;
  [key: string]: unknown; 
}

interface PayoutResult {
  success: boolean;
  error?: string;
  errorCode?: string;
  flw_ref?: string | null;
  reference: string;
  data?: {
    id?: number;
    account_number?: string;
    bank_code?: string;
    full_name?: string;
    created_at?: string;
    currency?: string;
    debit_currency?: string;
    amount?: number;
    fee?: number;
    status?: string;
    reference?: string;
    meta?: Record<string, unknown>;
    narration?: string;
    complete_message?: string;
    requires_approval?: number;
    is_approved?: number;
    bank_name?: string;
    [key: string]: unknown;
  } | null;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

function parsePayoutDetails(details: string | null): PayoutDetails | null {
  if (!details) return null;
  
  try {
    const parsed = typeof details === "string" ? JSON.parse(details) : details;
    
    
    if (!parsed.account_number) {
      throw new Error('Missing required field: account_number');
    }
    
    return {
      account_number: parsed.account_number,
      bank_code: parsed.bank_code,
      account_bank: parsed.account_bank,
      account_name: parsed.account_name,
      beneficiary_name: parsed.beneficiary_name,
      phone_number: parsed.phone_number,
      network: parsed.network,
      narration: parsed.narration,
      type: parsed.type,
    };
  } catch (error) {
    console.error('Failed to parse payout details:', error);
    return null;
  }
}
class TrustVaultDiscordBot {
  private readonly client: Client;
  private readonly connection: Connection;
  private readonly botWallet: Keypair;
  private readonly eventParser: EventParser;
  private readonly notificationManager: NotificationManager;
  private readonly embedCreator: RoleSpecificEmbeds;
  private readonly flutterwaveService: FlutterwaveService;
  private readonly flutterwaveBreaker: CircuitBreaker;
  private readonly solanaBreaker: CircuitBreaker;
  private isListening: boolean;
  private eventsProcessed: number;
  private notificationsSent: number;
  private payoutsProcessed: number;
  private pendingPayments: Set<string>;  
private credentialCache: Map<string, {credential: CredentialInfo; timestamp: number }>;
  private processedReservations: Set<string> = new Set();
  private processedSignatures = new Set<string>();
  private readonly SIGNATURE_CACHE_SIZE = 1000; // Keep last 1000 signatures


  constructor() {
    
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.DirectMessageTyping,
      ],
    });

    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 
                 process.env.SOLANA_RPC_URL || 
                 "https://api.devnet.solana.com";
  
    this.connection = new Connection(rpcUrl, {
      commitment: "confirmed",
      wsEndpoint: rpcUrl.replace('https://', 'wss://').replace('http://', 'ws://')
    });

     try {
      const privateKeyBytes = bs58.decode(process.env.BOT_WALLET_PRIVATE_KEY!);
      this.botWallet = Keypair.fromSecretKey(privateKeyBytes);
     
    } catch (error) {
      console.error("❌ Failed to initialize bot wallet:", error);
      throw error;
    }

    this.eventParser = new EventParser();
    this.notificationManager = new NotificationManager(this.client);
    this.embedCreator = new RoleSpecificEmbeds();
   

     try {
        const platformKey = process.env.FLUTTERWAVE_SECRET_KEY;
        if (!platformKey) {
          throw new Error('FLUTTERWAVE_SECRET_KEY environment variable is required for utility methods');
        }
        this.flutterwaveService = new FlutterwaveService(platformKey);
      } catch (error) {
        console.error("❌ Failed to initialize Flutterwave service:", error);
        throw error;
      }

    this.isListening = false;
    this.eventsProcessed = 0;
    this.notificationsSent = 0;
    this.payoutsProcessed = 0;
    this.pendingPayments = new Set();
    this.credentialCache = new Map();

    this.flutterwaveBreaker = new CircuitBreaker("Flutterwave", {
      threshold: 3,
      timeout: 30000,
      resetTimeout: 60000,
    });
    
    this.solanaBreaker = new CircuitBreaker("Solana", {
      threshold: 5,
      timeout: 10000,
      resetTimeout: 30000,
    });
  }

    private validatePaymentData(eventData: EventData): ValidationResult {
    const errors: string[] = [];
    
    if (!eventData.taker) errors.push('Taker address required');
    if (!eventData.payoutReference) errors.push('Payout reference required');
    if (!eventData.fiatAmount || isNaN(Number(eventData.fiatAmount))) {
      errors.push('Valid fiat amount required');
    }
    if (!eventData.currency) errors.push('Currency required');
    if (!eventData.payoutDetails) errors.push('Payout details required');
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if a transaction signature has already been processed
   * Implements deduplication to prevent processing the same event multiple times
   */
  private hasProcessedSignature(signature: string): boolean {
    if (this.processedSignatures.has(signature)) {
      return true;
    }
    
    // Add to processed set
    this.processedSignatures.add(signature);
    
    // Prevent memory leak - keep only last N signatures
    if (this.processedSignatures.size > this.SIGNATURE_CACHE_SIZE) {
      const firstSignature = this.processedSignatures.values().next().value;
      if (firstSignature !== undefined) {
        this.processedSignatures.delete(firstSignature);
      }
    }
    
    return false;
  }

private async handleInstantPaymentReserved(event: ParsedEvent): Promise<void> {
  // ─────────────────────────────────────────────────────────────────────────
  // CHANGED: This bot no longer initiates payouts or confirms on-chain.
  // Payment verification and token release is now handled exclusively by
  // validator bots via submit_buy_vote / submit_sell_vote.
  // This method only acknowledges the reservation and notifies participants.
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n🔵 InstantPaymentReserved — notifying participants (validators will settle)");

  const { trustExpress, taker, amount, fiatAmount, currency, payoutReference } = event.data;
  console.log("   Trust Express:", trustExpress);
  console.log("   Taker:", taker);
  console.log("   Payout Reference:", payoutReference);
  console.log("   Amount:", amount, "tokens | Fiat:", fiatAmount, currency);

  // Log to DB so the reservation is trackable
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    await supabaseAdmin.from('payout_logs').insert({
      payout_reference: payoutReference,
      taker,
      amount,
      fiat_amount: fiatAmount,
      currency,
      status: 'pending_validator_consensus',
      order_type: 'buy',
      timestamp: new Date().toISOString(),
      event_signature: event.signature,
    });
  } catch (dbError) {
    console.error('❌ Failed to log buy reservation:', dbError);
  }

  // Notify taker: "your payment is being verified by validators"
  await this.sendEventNotifications(event);

  console.log("✅ Buy reservation acknowledged — validators will vote and settle\n");
}
  


/**
 * Helper method: Fetch account with retry logic and exponential backoff
 */
private async fetchAccountWithRetry(
  pubkey: PublicKey,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<AccountInfo<Buffer> | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
     
      const accountInfo = await this.connection.getAccountInfo(pubkey);
      
      if (accountInfo) {
       
        return accountInfo;
      }
      
      console.warn(`⚠️ Account not found on attempt ${attempt}`);
    } catch (error) {
      console.error(`❌ Error fetching account on attempt ${attempt}:`, error);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Exponential backoff
      const waitTime = delayMs * Math.pow(2, attempt - 1);
     
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  
  return null;
}

/**
 * Handle InstantSellReservation event
 * This is triggered when a buyer wants to buy tokens from a sell order
 */
private async handleInstantSellReservation(event: ParsedEvent): Promise<void> {
  // SAFETY CHECK: This should only run for TRUST_EXPRESS
  if (event.programSource !== 'TRUST_EXPRESS') {
    console.error(`CRITICAL: handleInstantSellReservation called for ${event.programSource} - aborting`);
    return;
  }

    const { paymentMode, trustExpress, taker, fiatAmount, currency } = event.data;


      const transactionSignature = event.signature;
  if (!transactionSignature) {
    console.error('❌ Missing transaction signature in event');
    return;
  }

    const payoutReference = event.data.payoutReference!;

  
  if (!payoutReference || !trustExpress) {
    console.error("⛔ Missing required data for sell reservation");
    return;
  }

   // ✅ NEW: Check if we've already processed this reservation
  const deduplicationKey = `${trustExpress}-${payoutReference}`;
  if (this.processedReservations.has(deduplicationKey)) {
    console.log(`⚠️  Skipping duplicate reservation: ${payoutReference}`);
    return;
  }
  
  // Mark as processed
  this.processedReservations.add(deduplicationKey);
  
  // Clean up old entries after 5 minutes to prevent memory leak
  setTimeout(() => {
    this.processedReservations.delete(deduplicationKey);
  }, 5 * 60 * 1000);


  try {
    // Small delay to ensure account is committed on-chain
   
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Fetch trust_express account to get maker (seller) address AND mint
    const trustExpressAccountInfo = await this.fetchAccountWithRetry(
      new PublicKey(trustExpress),
      3, // max retries
      1000 // initial delay ms
    );
    
    if (!trustExpressAccountInfo) {
      throw new Error('Trust Express account not found after retries');
    }

    // Deserialize to get the mint address
    const { maker, mintA } = await this.deserializeTrustExpressAccount(trustExpressAccountInfo.data);
    const sellerAddress = maker.toString();

    
    

    // CRITICAL: Detect token program and fetch mint info with correct program
    let scaledFiatAmount: number;
    
    try {
      
      
      // Use the existing detectTokenProgram method
      const { tokenProgram } = await this.detectTokenProgram(mintA);
      
      
      // Fetch mint info with the correct token program
      
      const mintInfo = await getMint(
        this.connection,
        mintA,
        'confirmed',
        tokenProgram
      );
      const tokenDecimals = mintInfo.decimals;
      
      
      
      // The on-chain program calculates: token_amount (smallest units) × price_per_token
      // We need to scale down by the token's decimals to get human-readable fiat amount
      const rawFiatAmount = parseFloat(fiatAmount!);
      scaledFiatAmount = rawFiatAmount / Math.pow(10, tokenDecimals);
      
      
      
      
      
      
      
    } catch (mintError) {
      console.error('❌ CRITICAL: Failed to fetch mint decimals:', mintError);
      console.error('   This will cause incorrect payment amounts!');
      
      // Log the error but don't proceed with incorrect amount
      await this.logPayoutError(
        event, 
        'MINT_FETCH_ERROR', 
        `Failed to fetch mint decimals: ${mintError instanceof Error ? mintError.message : 'Unknown error'}`
      );
      
      throw new Error('Cannot process reservation without mint decimals');
    }

    // Route based on payment mode
    if (paymentMode === 0) {
      // PAYMENT LINK MODE
            console.log('📝 Payment Link Mode detected');

      
      
      await this.generatePaymentLink(
        sellerAddress,
        scaledFiatAmount, // Correctly scaled amount
        currency!,
        payoutReference,
        taker!,
        trustExpress,
        transactionSignature 
      );
    } else if (paymentMode === 1) {
      // API MONITORING MODE — passively watch for payment, notify when seen.
      // Validators independently verify and release tokens via submit_sell_vote.
      console.log('📡 API Monitoring Mode — starting passive payment watch');
      await this.startPassivePaymentMonitoring(
        sellerAddress,
        trustExpress,
        payoutReference,
        scaledFiatAmount,
        taker! // buyer address, for notification when payment is detected
      );
    } else {
      console.error(`⛔ Invalid payment mode: ${paymentMode}`);
      throw new Error(`Invalid payment mode: ${paymentMode}`);
    }

    // Send initial notification to both parties
    event.participants.maker = sellerAddress;
    await this.sendEventNotifications(event);

    
    
    
    

  } catch (error) {
    console.error("⛔ Error handling InstantSellReservation:", error);
    
    // Enhanced error logging
    if (error instanceof Error) {
      console.error("   Error name:", error.name);
      console.error("   Error message:", error.message);
      console.error("   Stack trace:", error.stack);
    }
    
    await this.logPayoutError(event, 'SELL_RESERVATION_ERROR', 
      error instanceof Error ? error.message : 'Unknown error');
  }
}


private async generatePaymentLink(
  sellerAddress: string,
  amount: number,
  currency: string,
  reference: string,
  buyerAddress: string,
  trustExpress: string,
  transactionSignature: string
): Promise<void> {
  try {
    console.log('🔗 ===== PAYMENT LINK GENERATION START =====');
    console.log(`   Reference: ${reference}`);
    console.log(`   Transaction Signature: ${transactionSignature}`);
    console.log(`   Trust Express: ${trustExpress}`);
    console.log(`   Seller: ${sellerAddress}`);
    console.log(`   Buyer: ${buyerAddress}`);
    console.log(`   Amount: ${amount} ${currency}`);

    if (!transactionSignature || transactionSignature === 'undefined' || transactionSignature === 'null') {
      throw new Error('Invalid transaction signature - cannot generate payment link');
    }
    if (!sellerAddress || !reference || !buyerAddress || !trustExpress) {
      throw new Error('Missing required parameters');
    }
    if (amount <= 0) {
      throw new Error('Invalid amount - must be greater than 0');
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // ── Step 1: Resolve credential_id + processor ─────────────────────────────
    console.log('🔍 Step 1: Looking up seller credentials...');

    const { data: linkData, error: linkError } = await supabaseAdmin
      .from('sell_order_credentials')
      .select('credential_id')
      .eq('trust_express_pda', trustExpress)
      .maybeSingle();

    if (!linkData?.credential_id) {
      throw new Error(
        'No credential linked to this sell order. ' +
        'Seller must link their payment account when creating the order.'
      );
    }

    const sellerCredentialId = linkData.credential_id;
    console.log(`✅ Found credential: ${sellerCredentialId}`);

    // Fetch processor so we know which payment gateway to use
    const { data: credData } = await supabaseAdmin
      .from('seller_flutterwave_accounts')
      .select('processor, encrypted_secret_key, encryption_iv, encryption_auth_tag, encrypted_public_key, encryption_public_key_iv, encryption_public_key_auth_tag, processor_account_id')
      .eq('id', sellerCredentialId)
      .single();

    const processor = credData?.processor ?? 'flutterwave';
    console.log(`   Processor: ${processor}`);

    // ── Step 2: Generate payment link via correct processor ───────────────────
    console.log('🔍 Step 2: Creating payment link...');

    const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL}/payment-success/${reference}`;
    let paymentLink: string;

    if (processor === 'paystack') {
      // ── Paystack path ─────────────────────────────────────────────────────
      if (!credData?.encrypted_secret_key) {
        throw new Error('Paystack credential missing secret key. Re-save credentials in settings.');
      }
      const secretKey = decrypt(credData.encrypted_secret_key, credData.encryption_iv, credData.encryption_auth_tag);
      const paystackService = PaystackService.createInstance({ secretKey });

      const result = await paystackService.createPaymentLink({
        amount,
        currency,
        reference,
        returnUrl: redirectUrl,
        callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/payment-processors/paystack/webhook`,
        buyerEmail: 'buyer@trustexpress.io',
        description: `Purchase tokens - Ref: ${reference}`,
        trustExpressAddress: trustExpress,
      });

      if (!result.success || !result.authorizationUrl) {
        throw new Error(result.error ?? 'Paystack failed to generate authorization URL');
      }

      paymentLink = result.authorizationUrl;
      console.log(`✅ [Paystack] Authorization URL created: ${paymentLink}`);

    } else if (processor === 'opay') {
      // ── OPay path ─────────────────────────────────────────────────────────
      if (
        !credData?.encrypted_public_key ||
        !credData?.encryption_public_key_iv ||
        !credData?.encryption_public_key_auth_tag ||
        !credData?.processor_account_id
      ) {
        throw new Error('OPay credential missing public key or merchant ID fields. Re-save credentials in settings.');
      }

      const secretKey = decrypt(credData.encrypted_secret_key, credData.encryption_iv, credData.encryption_auth_tag);
      const publicKey = decrypt(credData.encrypted_public_key, credData.encryption_public_key_iv, credData.encryption_public_key_auth_tag);
      const merchantId = credData.processor_account_id;

      const opayService = OpayService.createInstance({ publicKey, secretKey, merchantId });

      const result = await opayService.createPaymentLink({
        amount,
        currency,
        reference,
        returnUrl: redirectUrl,
        callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/payment-processors/opay/webhook`,
        buyerName: 'Token Buyer',
        buyerEmail: 'buyer@trustexpress.io',
        description: `Purchase tokens - Ref: ${reference}`,
        trustExpressAddress: trustExpress,
      });

      if (!result.success || !result.cashierUrl) {
        throw new Error(result.error ?? 'OPay failed to generate cashier URL');
      }

      paymentLink = result.cashierUrl;
      console.log(`✅ [OPay] Cashier URL created: ${paymentLink}`);

    } else {
      // ── Flutterwave path — unchanged ──────────────────────────────────────
      const payload = {
        amount,
        currency,
        tx_ref: reference,
        redirect_url: redirectUrl,
        customer: {
          name: 'Token Buyer',
          email: 'buyer@trustexpress.io',
        },
        customizations: {
          title: 'Token Purchase',
          description: `Purchase tokens - Ref: ${reference}`,
          logo: `${process.env.NEXT_PUBLIC_APP_URL}/logo.png`,
        },
        meta: {
          reference,
          source: 'trust_express_sell_order',
          trust_express_address: trustExpress,
          buyer_address: buyerAddress,
          seller_address: sellerAddress,
        },
      };

      paymentLink = await this.flutterwaveService.createPaymentLink(
        payload,
        redirectUrl,
        sellerCredentialId
      );

      console.log(`✅ [Flutterwave] Payment link created: ${paymentLink}`);
    }

    // ── Step 3: Store in DB ───────────────────────────────────────────────────
    console.log('🔍 Step 3: Storing payment link in database...');

    await this.storePaymentLinkInDBWithRetry(
      reference,
      paymentLink,
      trustExpress,
      buyerAddress,
      sellerAddress,
      amount,
      currency,
      transactionSignature,
      3
    );

    console.log('✅ Payment link stored in database successfully');

    // ── Step 4: Notify buyer ──────────────────────────────────────────────────
    console.log('🔍 Step 4: Sending notification to buyer...');

    await this.notifyBuyerWithPaymentLink(
      buyerAddress,
      paymentLink,
      amount,
      currency,
      reference
    );

    console.log('✅ Notification sent to buyer');
    console.log('🔗 ===== PAYMENT LINK GENERATION COMPLETE =====');

  } catch (error) {
    console.error('❌ ===== PAYMENT LINK GENERATION FAILED =====');
    console.error('   Error details:', error);

    if (error instanceof Error) {
      console.error('   Error name:', error.name);
      console.error('   Error message:', error.message);
      console.error('   Error stack:', error.stack);
    }

    await this.logPayoutError(
      {
        type: 'InstantSellReservationCreatedEvent',
        data: {
          payoutReference: reference,
          taker: buyerAddress,
          trustExpress: trustExpress,
          amount: amount.toString(),
          currency: currency,
        },
        participants: { taker: buyerAddress, maker: sellerAddress },
        signature: transactionSignature || 'no-signature',
        timestamp: Date.now(),
        programSource: 'TRUST_EXPRESS'
      } as ParsedEvent,
      'PAYMENT_LINK_GENERATION_ERROR',
      error instanceof Error ? error.message : 'Unknown error'
    );

    throw error;
  }
}


private async storePaymentLinkInDBWithRetry(
  reference: string,
  paymentLink: string,
  trustExpress: string,
  buyerAddress: string,
  sellerAddress: string,
  amount: number,
  currency: string,
  transactionSignature: string,
  maxRetries: number = 3
): Promise<void> {
  console.log(`🔄 Attempting to store payment link (max ${maxRetries} retries)...`);
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`   Attempt ${attempt}/${maxRetries}...`);
      
      await this.storePaymentLinkInDB(
        reference,
        paymentLink,
        trustExpress,
        buyerAddress,
        sellerAddress,
        amount,
        currency,
        transactionSignature
      );
      
      console.log(`✅ Payment link stored successfully on attempt ${attempt}`);
      return;
      
    } catch (error) {
      console.error(`❌ Attempt ${attempt}/${maxRetries} failed:`, error);
      
      if (attempt === maxRetries) {
        console.error('❌ All retry attempts exhausted - throwing error');
        throw error;
      }
      
      // Exponential backoff: 1s, 2s, 4s, etc.
      const backoffMs = 1000 * Math.pow(2, attempt - 1);
      console.log(`⏳ Waiting ${backoffMs}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  }
}



private async startPassivePaymentMonitoring(
  sellerAddress: string,
  trustExpress: string,
  payoutReference: string,
  expectedAmount: number,
  buyerAddress: string
): Promise<void> {
  // CHANGED: This bot no longer confirms sell payments on-chain.
  // Validator bots independently verify payments and call submit_sell_vote.
  // This method passively watches and notifies both parties when payment is detected.
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: linkData } = await supabaseAdmin
      .from('sell_order_credentials')
      .select('credential_id')
      .eq('trust_express_pda', trustExpress)
      .maybeSingle();

    if (!linkData?.credential_id) {
      console.warn('⚠️ No seller credential found for passive monitoring');
      return;
    }

    const sellerCredentialId = linkData.credential_id;
    const maxAttempts = 60; // 5 minutes (60 x 5s)
    let attempts = 0;
    console.log(`📡 Passive payment watch started for ${payoutReference}`);

    const pollInterval = setInterval(async () => {
      attempts++;
      try {
        const transactions = await FlutterwaveService.getRecentTransactions(sellerCredentialId);
        const matchingTx = transactions.find((tx: any) =>
          tx.tx_ref === payoutReference &&
          tx.amount >= expectedAmount &&
          tx.status === 'successful'
        );

        if (matchingTx) {
          clearInterval(pollInterval);
          console.log(`✅ Payment detected for ${payoutReference} — validators will settle on-chain`);

          // Notify seller — tokens will arrive once validators vote
          const sellerEmbed = this.embedCreator.createPaymentConfirmedEmbed(
              {
                seller: sellerAddress,
                buyer: buyerAddress,
                amountFormatted: String(expectedAmount),
                fiatAmountFormatted: String(expectedAmount),
                currency: 'NGN',
              },
              'seller'
            );
          await this.notificationManager.sendNotificationToWallet(sellerAddress, 'payment_received', sellerEmbed);

          // Notify buyer
          const buyerEmbed = this.embedCreator.createErrorEmbed(
            '⏳ Payment Verified',
            `Your payment has been detected. Tokens will be released by validators shortly.`,
            buyerAddress
          );
          await this.notificationManager.sendNotificationToWallet(buyerAddress, 'payment_verified', buyerEmbed);
          return;
        }

        if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
          console.warn(`⏰ Passive monitoring timeout for: ${payoutReference}`);
          await this.notifyPaymentTimeout(payoutReference, sellerAddress);
        }
      } catch (error) {
        console.error(`❌ Passive poll error (attempt ${attempts}):`, error);
        if (attempts >= maxAttempts) clearInterval(pollInterval);
      }
    }, 5000);

  } catch (error) {
    console.error('❌ Failed to start passive payment monitoring:', error);
    throw error;
  }
}

private async confirmSellPaymentOnChain(
  trustExpress: string,
  taker: string,
  payoutReference: string,
  success: boolean,
  message: string
): Promise<string | null> {
  try {
    

    const trustExpressAccount = new PublicKey(trustExpress);
    const takerPubkey = new PublicKey(taker);

    // Fetch trust express account data
    const trustExpressAccountInfo = await this.connection.getAccountInfo(trustExpressAccount);
    if (!trustExpressAccountInfo) {
      throw new Error(`TrustExpress account not found: ${trustExpress}`);
    }

    const { maker, mintA, feeDestination } = 
      await this.deserializeTrustExpressAccount(trustExpressAccountInfo.data);

    // Detect token program
    const { tokenProgram } = await this.detectTokenProgram(mintA);
    const ATA_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
    
    // Derive ATAs
    const [trustExpressAta] = await PublicKey.findProgramAddress(
      [trustExpressAccount.toBuffer(), tokenProgram.toBuffer(), mintA.toBuffer()],
      ATA_PROGRAM
    );

    const [feeDestinationAta] = await PublicKey.findProgramAddress(
      [feeDestination.toBuffer(), tokenProgram.toBuffer(), mintA.toBuffer()],
      ATA_PROGRAM
    );

    const [takerAta] = await PublicKey.findProgramAddress(
      [takerPubkey.toBuffer(), tokenProgram.toBuffer(), mintA.toBuffer()],
      ATA_PROGRAM
    );

    // Check if fee destination ATA exists, create if needed
    const feeDestinationAtaInfo = await this.connection.getAccountInfo(feeDestinationAta);
    let createAtaIx: TransactionInstruction | null = null;
    
    if (!feeDestinationAtaInfo && success) {
      const { createAssociatedTokenAccountInstruction } = await import('@solana/spl-token');
      createAtaIx = createAssociatedTokenAccountInstruction(
        this.botWallet.publicKey,
        feeDestinationAta,
        feeDestination,
        mintA,
        tokenProgram
      );
      
    }

    // Build accounts array
    const accounts = [
      { pubkey: trustExpressAccount, isSigner: false, isWritable: true },
      { pubkey: this.botWallet.publicKey, isSigner: true, isWritable: false },
      { pubkey: maker, isSigner: false, isWritable: true },
      { pubkey: mintA, isSigner: false, isWritable: false },
      { pubkey: trustExpressAta, isSigner: false, isWritable: true },
      { pubkey: feeDestinationAta, isSigner: false, isWritable: success },
      { pubkey: takerAta, isSigner: false, isWritable: success },
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
    ];

    // Build instruction data (discriminator from IDL: [28, 148, 26, 79, 107, 87, 193, 139])
    const instructionDiscriminator = Buffer.from([28, 148, 26, 79, 107, 87, 193, 139]);
    const takerBuffer = takerPubkey.toBuffer();
    const payoutRefBytes = Buffer.from(payoutReference, "utf8");
    const messageBytes = Buffer.from(message.substring(0, 200), "utf8");

    const bufferSize =
      8 + // discriminator
      32 + // taker pubkey
      4 + payoutRefBytes.length + // payout reference
      1 + // success bool
      4 + messageBytes.length; // message

    const instructionData = Buffer.alloc(bufferSize);
    let offset = 0;

    instructionDiscriminator.copy(instructionData, offset);
    offset += 8;

    takerBuffer.copy(instructionData, offset);
    offset += 32;

    instructionData.writeUInt32LE(payoutRefBytes.length, offset);
    offset += 4;
    payoutRefBytes.copy(instructionData, offset);
    offset += payoutRefBytes.length;

    instructionData.writeUInt8(success ? 1 : 0, offset);
    offset += 1;

    instructionData.writeUInt32LE(messageBytes.length, offset);
    offset += 4;
    messageBytes.copy(instructionData, offset);

    const confirmSellPaymentIx = new TransactionInstruction({
      programId: new PublicKey(process.env.TRUST_EXPRESS_PROGRAM_ID!),
      keys: accounts,
      data: instructionData,
    });

    // Build transaction
    const transaction = new Transaction();
    if (createAtaIx) {
      transaction.add(createAtaIx);
    }
    transaction.add(confirmSellPaymentIx);

    const { blockhash } = await this.connection.getLatestBlockhash("confirmed");
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.botWallet.publicKey;
    transaction.sign(this.botWallet);

    // Simulate first
    const simulation = await this.connection.simulateTransaction(transaction);
    if (simulation.value.err) {
      console.error("❌ SIMULATION FAILED:", simulation.value.err);
      console.error("   Logs:", simulation.value.logs);
      throw new Error(`Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`);
    }

    // Send transaction
    const signature = await this.connection.sendTransaction(transaction, [this.botWallet], {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });

    // Confirm transaction
    const confirmation = await this.connection.confirmTransaction(signature, "confirmed");
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    
    return signature;

  } catch (error) {
    console.error("❌ Failed to confirm sell payment on-chain:", error);
    return null;
  }
}

private async storePaymentLink(
  reference: string,
  paymentLink: string,
  trustExpress: string,
  buyerAddress: string,
  sellerAddress: string
): Promise<void> {
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    await supabaseAdmin.from('payment_links').insert({
      payout_reference: reference,
      payment_link: paymentLink,
      trust_express_address: trustExpress,
      buyer_address: buyerAddress,
      seller_address: sellerAddress,
      status: 'pending',
      created_at: new Date().toISOString(),
    });

    
  } catch (error) {
    console.error('⛔ Failed to store payment link:', error);
  }
}

private async storePaymentLinkInDB(
  reference: string,
  paymentLink: string,
  trustExpress: string,
  buyerAddress: string,
  sellerAddress: string,
  amount: number,
  currency: string,
  transactionSignature: string
): Promise<void> {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log('💾 Preparing database insert...');
  console.log(`   Table: payment_links`);
  console.log(`   Reference: ${reference}`);
  console.log(`   Signature: ${transactionSignature}`);

  // ✅ FIX: Always validate signature before insertion
  if (!transactionSignature || 
      transactionSignature === 'undefined' || 
      transactionSignature === 'null' ||
      transactionSignature.trim().length === 0) {
    console.error('❌ CRITICAL: Invalid transaction signature - cannot store payment link');
    throw new Error('Invalid transaction signature provided');
  }

  // ✅ NEW: Check if record already exists
  const { data: existingRecord } = await supabaseAdmin
    .from('payment_links')
    .select('id, transaction_signature')
    .eq('payout_reference', reference)
    .maybeSingle();

  if (existingRecord) {
    console.log('⚠️  Payment link already exists for this reference');
    console.log(`   Existing ID: ${existingRecord.id}`);
    console.log(`   Existing signature: ${existingRecord.transaction_signature}`);
    console.log(`   New signature: ${transactionSignature}`);
    
    // If the new signature is better (not dummy), update it
    if (existingRecord.transaction_signature?.startsWith('1111') && 
        !transactionSignature.startsWith('1111')) {
      console.log('   ✅ Updating with real transaction signature...');
      
      const { error: updateError } = await supabaseAdmin
        .from('payment_links')
        .update({
          transaction_signature: transactionSignature,
          link_url: paymentLink, // Update link in case it changed
          updated_at: new Date().toISOString(),
        })
        .eq('payout_reference', reference);

      if (updateError) {
        console.error('❌ Failed to update payment link:', updateError);
        throw new Error(`Database update failed: ${updateError.message}`);
      }

      console.log('✅ Payment link updated successfully');
      return;
    } else {
      console.log('   ℹ️  Skipping insertion - record already exists with valid signature');
      return; // Don't throw error, just skip
    }
  }

  // ✅ Build insert data object with all required fields
  const insertData = {
    payout_reference: reference,
    link_url: paymentLink,
    trust_express_address: trustExpress,
    buyer_address: buyerAddress,
    seller_address: sellerAddress,
    amount,
    currency,
    transaction_signature: transactionSignature,
    status: 'pending',
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
  };

  console.log('   ✅ Transaction signature included in insert');
  console.log('   Insert data prepared:', JSON.stringify(insertData, null, 2));

  const { data, error } = await supabaseAdmin
    .from('payment_links')
    .insert(insertData)
    .select();

  if (error) {
    console.error('❌ Database insertion failed:');
    console.error('   Error code:', error.code);
    console.error('   Error message:', error.message);
    console.error('   Error details:', error.details);
    console.error('   Error hint:', error.hint);
    throw new Error(`Database insertion failed: ${error.message}`);
  }

  if (!data || data.length === 0) {
    console.error('❌ Database insertion succeeded but no data returned');
    throw new Error('Database insertion succeeded but no data returned');
  }

  console.log('✅ Database insertion successful');
  console.log('   Inserted row:', JSON.stringify(data[0], null, 2));
}


/**
 * Update payment link status
 */
private async updatePaymentLinkStatus(
  reference: string,
  status: 'completed' | 'failed' | 'expired'
): Promise<void> {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log(`🔄 Updating payment link status: ${reference} -> ${status}`);

  const { error } = await supabaseAdmin
    .from('payment_links')
    .update({ 
      status,
      updated_at: new Date().toISOString()
    })
    .eq('payout_reference', reference);

  if (error) {
    console.error('❌ Failed to update payment link status:', error);
  } else {
    console.log('✅ Payment link status updated successfully');
  }
}

private async notifyBuyerWithPaymentLink(
  buyerAddress: string,
  paymentLink: string,
  amount: number,
  currency: string,
  reference: string
): Promise<void> {
  try {
    console.log(`📧 Sending payment link notification to ${buyerAddress}...`);
    
    const embed = this.embedCreator.createPaymentLinkEmbed({
      paymentLink,
      amount,
      currency,
      reference,
    });

    const sentChannels = await this.notificationManager.sendNotificationToWallet(
      buyerAddress,
      'payment_link_generated',
      embed
    );

    if (sentChannels.length > 0) {
      console.log(`✅ Payment link notification sent to ${sentChannels.length} channel(s)`);
    } else {
      console.warn('⚠️  No Discord channels found for buyer - notification not sent');
    }
    
  } catch (error) {
    console.error('❌ Failed to send payment link notification:', error);
    // Don't throw - notification failure shouldn't break payment link generation
  }
}


private async notifyPaymentTimeout(
  payoutReference: string,
  sellerAddress: string
): Promise<void> {
  try {
    const embed = this.embedCreator.createErrorEmbed(
      'Payment Timeout',
      `No payment received for reference: ${payoutReference}`,
      sellerAddress
    );

    await this.notificationManager.sendNotificationToWallet(
      sellerAddress,
      'payment_timeout',
      embed
    );
    
    
  } catch (error) {
    console.error('❌ Failed to send payment timeout notification:', error);
  }
}

private async sendReceiptNotification(
  event: ParsedEvent,
  receiptId: string,
  makerAddress: string
): Promise<void> {
  try {
    const receiptUrl = `${process.env.NEXT_PUBLIC_APP_URL}/receipts/${receiptId}`;
    
    const embed = this.embedCreator.createReceiptEmbed({
      receiptId,
      receiptUrl,
      payoutReference: event.data.payoutReference!,
      amount: event.data.fiatAmount!,
      currency: event.data.currency!,
    });

    // Send to taker
    const takerChannels = await this.notificationManager.sendNotificationToWallet(
      event.data.taker!,
      'receipt_generated',
      embed
    );

    // Send to maker
    const makerChannels = await this.notificationManager.sendNotificationToWallet(
      makerAddress,
      'receipt_generated',
      embed
    );


  } catch (error) {
    console.error('Failed to send receipt notification:', error);
  }
}

/**
 * Get cached or fetch LP credentials for a Trust Express PDA
 * Implements TTL caching to reduce database queries
 */
private async getCredentialForTrustExpress(trustExpressPda: string): Promise<string | null> {
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  
  // Check cache first
  const cached = this.credentialCache.get(trustExpressPda);
  if (cached && (Date.now() - cached.timestamp) < 3600000) {
    
    return cached.credential.secret_key;
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // First try: check buy_order_credentials
    const { data: buyOrderLink } = await supabase
      .from('buy_order_credentials')
      .select('credential_id, wallet_address')
      .eq('trust_express_pda', trustExpressPda)
      .maybeSingle();

    if (buyOrderLink) {
  console.log('✅ Found credential link:', buyOrderLink.credential_id, 'for wallet:', buyOrderLink.wallet_address);
  
  // Fetch from buyer_flutterwave_credentials table
  const { data: buyerCredData, error: credError } = await supabase
    .from('buyer_flutterwave_credentials')
    .select('encrypted_secret_key, encryption_iv, encryption_auth_tag, is_active, label')
    .eq('id', buyOrderLink.credential_id)
    .eq('wallet_address', buyOrderLink.wallet_address)
    .single();

  if (credError) {
    console.error('Error fetching credentials from database:', credError);
    return null;
  }

  if (!buyerCredData) {
    console.error('❌ No credentials returned for:', trustExpressPda);
    return null;
  }

  if (!buyerCredData.is_active) {
    console.warn('⚠️ Buyer credential is inactive for:', trustExpressPda);
    return null;
  }

  // Decrypt buyer credentials
  const { decrypt } = await import('./lib/flutterwave-credentials-bot.js');
  const decryptedSecretKey = decrypt(
    buyerCredData.encrypted_secret_key,
    buyerCredData.encryption_iv,
    buyerCredData.encryption_auth_tag
  );

  if (!decryptedSecretKey) {
    console.error('Failed to decrypt credentials');
    return null;
  }

  const credentialInfo: CredentialInfo = {
    secret_key: decryptedSecretKey,
    credential_id: buyOrderLink.credential_id,
    wallet_address: buyOrderLink.wallet_address,
    is_active: buyerCredData.is_active,
    label: buyerCredData.label
  };
  
  this.credentialCache.set(trustExpressPda, {
    credential: credentialInfo,
    timestamp: Date.now()
  });
  this.cleanCredentialCache();
  
  console.log('✅ Successfully fetched and decrypted buyer credentials');
  return decryptedSecretKey;
}


    // Second try: check sell_order_credentials with proper join
    const { data: sellOrderData } = await supabase
      .from('sell_order_credentials')
      .select(`
        credential_id,
        wallet_address,
        seller_flutterwave_accounts (
          encrypted_secret_key,
          encryption_iv,
          encryption_auth_tag,
          is_active
        )
      `)
      .eq('trust_express_pda', trustExpressPda)
      .maybeSingle();

    if (sellOrderData?.seller_flutterwave_accounts) {
      // TypeScript fix: explicitly type the joined data
      const credData = Array.isArray(sellOrderData.seller_flutterwave_accounts)
        ? sellOrderData.seller_flutterwave_accounts[0]
        : sellOrderData.seller_flutterwave_accounts;

      if (!credData) {
        console.warn(`No seller credential data found for ${trustExpressPda}`);
        return null;
      }
      
      if (!credData.is_active) {
        console.warn(`Seller credential is inactive for ${trustExpressPda}`);
        return null;
      }

      // Decrypt seller credentials
      const { decrypt } = await import('./lib/flutterwave-credentials-bot.js');
      const decryptedSecretKey = decrypt(
        credData.encrypted_secret_key,
        credData.encryption_iv,
        credData.encryption_auth_tag
      );

      if (decryptedSecretKey) {
        const credentialInfo: CredentialInfo = {
          secret_key: decryptedSecretKey,
          credential_id: sellOrderData.credential_id,
          wallet_address: sellOrderData.wallet_address,
          is_active: credData.is_active,
          label: null
        };
        
        this.credentialCache.set(trustExpressPda, {
          credential: credentialInfo,
          timestamp: Date.now()
        });
        this.cleanCredentialCache();
        
        return decryptedSecretKey;
      }

      return null;
    }

    // Third try: fallback to maker's address (for orders without explicit link)
    const trustExpressAccountInfo = await this.connection.getAccountInfo(
      new PublicKey(trustExpressPda)
    );
    
    if (trustExpressAccountInfo) {
      const { maker, trustExpressType } = await this.deserializeTrustExpressAccount(
        trustExpressAccountInfo.data
      );

      const tableName = trustExpressType === 2 
        ? 'seller_flutterwave_accounts' 
        : 'buyer_flutterwave_credentials';

      const { data } = await supabase
        .from(tableName)
        .select('credential_id, wallet_address, encrypted_secret_key, encryption_iv, encryption_auth_tag, is_active, label')
        .eq('wallet_address', maker.toString())
        .eq('is_active', true)
        .maybeSingle();

      if (data) {
        const { decrypt } = await import('./lib/flutterwave-credentials-bot.js');
        const decryptedSecretKey = decrypt(
          data.encrypted_secret_key,
          data.encryption_iv,
          data.encryption_auth_tag
        );

        if (decryptedSecretKey) {
          const credentialInfo: CredentialInfo = {
            secret_key: decryptedSecretKey,
            credential_id: data.credential_id,
            wallet_address: data.wallet_address,
            is_active: data.is_active,
            label: data.label
          };
          
          this.credentialCache.set(trustExpressPda, {
            credential: credentialInfo,
            timestamp: Date.now()
          });
          this.cleanCredentialCache();
          
          return decryptedSecretKey;
        }
      }
    }

   
    return null;
    
  } catch (error) {
    console.error(`Error fetching credential for ${trustExpressPda}:`, error);
    return null;
  }
}

/**
 * Clean expired entries from credential cache
 */
private cleanCredentialCache(): void {
  const CACHE_TTL = 5 * 60 * 1000;
  const now = Date.now();
  
  for (const [key, value] of this.credentialCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      this.credentialCache.delete(key);
    }
  }
}

/**
 * Notify user that their Flutterwave credentials are required
 */
private async notifyCredentialRequired(
  trustExpress: string,
  makerAddress: string,
  error: string
): Promise<void> {
  try {
    const embed = this.embedCreator.createErrorEmbed(
      '❌ Flutterwave Credentials Required',
      `Transaction failed for order ${trustExpress}.\n\n` +
      `Error: ${error}\n\n` +
      `❗ Action Required:\n` +
      `1. Connect your Flutterwave account in Settings\n` +
      `2. Ensure your credentials are active and verified\n` +
      `3. The transaction has been cancelled and tokens refunded\n\n` +
      `Note: Platform credential fallbacks have been removed for security. ` +
      `All transactions now require your own Flutterwave credentials.`,
      makerAddress
    );

    await this.notificationManager.sendNotificationToWallet(
      makerAddress,
      'credential_required',
      embed
    );
  } catch (notifError) {
    console.error('Failed to send credential required notification:', notifError);
  }
}


  private async logPayoutError(
    event: ParsedEvent,
    errorType: string,
    errorMessage: string
  ): Promise<void> {
    try {
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      await supabaseAdmin.from('payout_errors').insert({
        payout_reference: event.data.payoutReference,
        taker: event.data.taker,
        error_type: errorType,
        error_message: errorMessage,
        event_data: JSON.stringify(event.data),
        timestamp: new Date().toISOString(),
      });
    } catch (dbError) {
      console.error('❌ Failed to log payout error:', dbError);
    }
  }

  private async logPayoutAttempt(
    event: ParsedEvent,
    status: 'initiated' | 'completed' | 'failed',
    result?: PayoutResult
  ): Promise<void> {
    try {
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      await supabaseAdmin.from('payout_logs').insert({
        payout_reference: event.data.payoutReference,
        taker: event.data.taker,
        amount: event.data.amount,
        fiat_amount: event.data.fiatAmount,
        currency: event.data.currency,
        status,
        flw_ref: result?.flw_ref,
        error_message: result?.error,
        error_code: result?.errorCode,
        timestamp: new Date().toISOString(),
        event_signature: event.signature
      });
    } catch (dbError) {
      console.error('❌ Failed to log payout attempt:', dbError);
    }
  }

  private async logTransactionError(event: ParsedEvent, error: Error): Promise<void> {
    try {
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      await supabaseAdmin.from('transaction_errors').insert({
        payout_reference: event.data.payoutReference,
        error_message: error.message,
        error_stack: error.stack,
        timestamp: new Date().toISOString(),
      });
    } catch (dbError) {
      console.error('❌ Failed to log transaction error:', dbError);
    }
  }

private async confirmPayoutOnChain(
  event: ParsedEvent,
  payoutResult: PayoutResult,
  success: boolean
): Promise<string | null> {
  try {
    console.log("🔗 confirmPayoutOnChain called with:");
    console.log("   trustExpress:", event.data.trustExpress);
    console.log("   taker:", event.data.taker);
    console.log("   payoutReference:", event.data.payoutReference);
    console.log("   success:", success);

    if (!event.data.trustExpress || !event.data.taker || !event.data.payoutReference) {
      throw new Error("Missing required event data for on-chain confirmation");
    }

    const message = success
      ? "Payout completed successfully"
      : `Payout failed: ${payoutResult.error || "Unknown error"}`;

    console.log("🔧 Building confirm payout instruction...");
    const { createAtaIxs, confirmPayoutIx } = await this.buildConfirmPayoutInstruction(
      event.data.trustExpress,
      event.data.taker,
      event.data.payoutReference,
      success,
      payoutResult.flw_ref || "",
      message,
      event
    );

    console.log("✅ Instruction built successfully");
    console.log("   Number of ATA creation IXs:", createAtaIxs.length);

    const transaction = new Transaction();

    // ✅ FIX: Add all ATA creation instructions first
    if (createAtaIxs.length > 0) {
      for (const ataIx of createAtaIxs) {
        transaction.add(ataIx);
      }
      console.log(`📝 Added ${createAtaIxs.length} ATA creation instruction(s)`);
    }

    // Add confirm payout instruction
    transaction.add(confirmPayoutIx);
    console.log("📝 Added confirm payout instruction");

    const { blockhash } = await this.connection.getLatestBlockhash("confirmed");
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.botWallet.publicKey;

    transaction.sign(this.botWallet);
    console.log("✍️ Transaction signed");

    // SIMULATE FIRST to catch errors
    try {
      console.log("🧪 Simulating transaction...");
      const simulation = await this.connection.simulateTransaction(transaction);
      
      console.log("🧪 Simulation result:");
      console.log("   Error:", simulation.value.err);
      console.log("   Logs:", simulation.value.logs?.slice(0, 5));
      
      if (simulation.value.err) {
        console.error("❌ SIMULATION FAILED:", simulation.value.err);
        console.error("   Full logs:", simulation.value.logs);
        throw new Error(`Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`);
      }
      
      console.log("✅ Simulation successful");
    } catch (simError) {
      console.error("❌ Simulation error:", simError);
      throw simError;
    }

    console.log("📤 Sending transaction...");
    const signature = await this.connection.sendTransaction(transaction, [this.botWallet], {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });

    console.log("📤 Transaction sent, signature:", signature);
    console.log("⏳ Confirming transaction...");

    const confirmation = await this.connection.confirmTransaction(signature, "confirmed");

    if (confirmation.value.err) {
      console.error("❌ TRANSACTION FAILED ON-CHAIN:", confirmation.value.err);
      
      // Fetch transaction details for more info
      try {
        const txDetails = await this.connection.getTransaction(signature, {
          maxSupportedTransactionVersion: 0
        });
        console.error("   Transaction details:", {
          // ... rest of error handling
        });
      } catch (fetchError) {
        console.error("   Could not fetch transaction details:", fetchError);
      }
      
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log("✅ Transaction confirmed successfully");
    return signature;

  } catch (error) {
    console.error("❌ Failed to confirm payout on-chain:", error);
    throw error;
  }
}



private async buildConfirmPayoutInstruction(
  trustExpressAddress: string,
  taker: string,
  payoutReference: string,
  success: boolean,
  flwRef: string,
  message: string,
  event: ParsedEvent
): Promise<{ createAtaIxs: TransactionInstruction[]; confirmPayoutIx: TransactionInstruction }> {
  try {
    const trustExpressAccount = new PublicKey(trustExpressAddress);
    const takerPubkey = new PublicKey(taker);

    const trustExpressAccountInfo = await this.connection.getAccountInfo(trustExpressAccount);
    if (!trustExpressAccountInfo) {
      throw new Error(`TrustExpress account not found: ${trustExpressAddress}`);
    }

    const { maker, mintA, feeDestination, seed, bump } = 
      await this.deserializeTrustExpressAccount(trustExpressAccountInfo.data);

    const seedAsU64 = BigInt(seed);
    const seedBuffer = Buffer.alloc(8);
    seedBuffer.writeBigUInt64LE(seedAsU64, 0);

    const [derivedTrustExpressPDA] = await PublicKey.findProgramAddress(
      [
        Buffer.from("trust-express"), 
        maker.toBuffer(),
        seedBuffer
      ],
      new PublicKey(process.env.TRUST_EXPRESS_PROGRAM_ID!)
    );

    const correctTrustExpressAccount = derivedTrustExpressPDA;

    // ✅ FIX: Use the event data directly instead of searching for reservation
    // The reservation exists on-chain, we just need the amount and fiatAmount from the event
    const amount = event.data.amount || '0';
    const fiatAmount = event.data.fiatAmount || '0';
    const currency = event.data.currency || 'NGN';

    if (!amount || amount === '0') {
      throw new Error(`Invalid amount in event data: ${amount}`);
    }

    const { tokenProgram } = await this.detectTokenProgram(mintA);
    const ATA_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
    
    const [trustExpressAta] = await PublicKey.findProgramAddress(
      [correctTrustExpressAccount.toBuffer(), tokenProgram.toBuffer(), mintA.toBuffer()],
      ATA_PROGRAM
    );

    const [feeDestinationAta] = await PublicKey.findProgramAddress(
      [feeDestination.toBuffer(), tokenProgram.toBuffer(), mintA.toBuffer()],
      ATA_PROGRAM
    );

    // ✅ NEW: Array to collect all ATA creation instructions
    const createAtaIxs: TransactionInstruction[] = [];
    
    // Check if fee destination ATA exists
    const feeDestinationAtaInfo = await this.connection.getAccountInfo(feeDestinationAta);
    if (!feeDestinationAtaInfo) {
      console.log("⚠️ Fee destination ATA doesn't exist, will create it");
      const { createAssociatedTokenAccountInstruction } = await import('@solana/spl-token');
      
      const createFeeAtaIx = createAssociatedTokenAccountInstruction(
        this.botWallet.publicKey,
        feeDestinationAta,
        feeDestination,
        mintA,
        tokenProgram
      );
      createAtaIxs.push(createFeeAtaIx);
    }

    const [takerAta] = await PublicKey.findProgramAddress(
      [takerPubkey.toBuffer(), tokenProgram.toBuffer(), mintA.toBuffer()],
      ATA_PROGRAM
    );

    // ✅ FIX: Always derive maker ATA for successful payouts AND check if it exists
    let makerAta = SystemProgram.programId;
    if (success) {
      // Derive maker's ATA
      [makerAta] = await PublicKey.findProgramAddress(
        [maker.toBuffer(), tokenProgram.toBuffer(), mintA.toBuffer()],
        ATA_PROGRAM
      );

      // ✅ CRITICAL FIX: Check if maker's ATA exists, create if needed
      const makerAtaInfo = await this.connection.getAccountInfo(makerAta);
      if (!makerAtaInfo) {
        console.log("⚠️ Maker's ATA doesn't exist, will create it");
        const { createAssociatedTokenAccountInstruction } = await import('@solana/spl-token');
        
        const createMakerAtaIx = createAssociatedTokenAccountInstruction(
          this.botWallet.publicKey,
          makerAta,
          maker,
          mintA,
          tokenProgram
        );
        createAtaIxs.push(createMakerAtaIx);
      } else {
        console.log("✅ Maker's ATA already exists:", makerAta.toBase58());
      }
    }

    const accounts = [
      { pubkey: correctTrustExpressAccount, isSigner: false, isWritable: true },
      { pubkey: this.botWallet.publicKey, isSigner: true, isWritable: false },
      { pubkey: maker, isSigner: false, isWritable: false },
      { pubkey: mintA, isSigner: false, isWritable: false },
      { pubkey: trustExpressAta, isSigner: false, isWritable: true },
      { pubkey: feeDestinationAta, isSigner: false, isWritable: true },
      { pubkey: takerAta, isSigner: false, isWritable: !success },
      { pubkey: makerAta, isSigner: false, isWritable: success },
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
    ];

    const instructionData = this.buildConfirmPayoutInstructionData({
      taker: takerPubkey,
      amount: BigInt(amount),
      fiatAmount: BigInt(fiatAmount),
      currency: currency,
      payoutReference,
      success,
      message: message.substring(0, 200),
    });

    const confirmPayoutIx = new TransactionInstruction({
      programId: new PublicKey(process.env.TRUST_EXPRESS_PROGRAM_ID!),
      keys: accounts,
      data: instructionData,
    });

    return { createAtaIxs, confirmPayoutIx };

  } catch (error) {
    console.error("❌ Error building confirm payout instruction:", error);
    throw error;
  }
}


private buildConfirmPayoutInstructionData({
  taker,
  amount,
  fiatAmount,
  currency,
  payoutReference,
  success,
  message,
}: {
  taker: PublicKey;
  amount: bigint;
  fiatAmount: bigint;
  currency: string;
  payoutReference: string;
  success: boolean;
  message: string;
}): Buffer {
  try {
   
    const instructionDiscriminator = Buffer.from([148, 97, 145, 2, 85, 139, 4, 140]);
    
    const currencyBytes = Buffer.from(currency, "utf8");
    const payoutRefBytes = Buffer.from(payoutReference, "utf8");
    const messageBytes = Buffer.from(message, "utf8");

    const bufferSize =
      8 +
      32 +
      8 +
      8 +
      4 + currencyBytes.length +
      4 + payoutRefBytes.length +
      1 +
      4 + messageBytes.length;

    const instructionData = Buffer.alloc(bufferSize);
    let offset = 0;

   
    instructionDiscriminator.copy(instructionData, offset);
    offset += 8;

   
    taker.toBuffer().copy(instructionData, offset);
    offset += 32;

   
    instructionData.writeBigUInt64LE(amount, offset);
    offset += 8;

   
    instructionData.writeBigUInt64LE(fiatAmount, offset);
    offset += 8;

   
    instructionData.writeUInt32LE(currencyBytes.length, offset);
    offset += 4;
    currencyBytes.copy(instructionData, offset);
    offset += currencyBytes.length;

   
    instructionData.writeUInt32LE(payoutRefBytes.length, offset);
    offset += 4;
    payoutRefBytes.copy(instructionData, offset);
    offset += payoutRefBytes.length;

   
    instructionData.writeUInt8(success ? 1 : 0, offset);
    offset += 1;

   
    instructionData.writeUInt32LE(messageBytes.length, offset);
    offset += 4;
    messageBytes.copy(instructionData, offset);

    return instructionData;

  } catch (error) {
  console.error("❌ Failed to build instruction data:", error);
  const errorMessage = error instanceof Error ? error.message : String(error);
  throw new Error(`Instruction data building failed: ${errorMessage}`);
}
}



private async generateAndStoreReceipt(
  event: ParsedEvent,
  payoutResult: PayoutResult,
  transactionSignature: string,
  makerAddress: string
): Promise<string | null> {

  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Fetch trust_express account to get mint address
    const trustExpressAccountInfo = await this.connection.getAccountInfo(
      new PublicKey(event.data.trustExpress!)
    );
    
    if (!trustExpressAccountInfo) {
      throw new Error('Trust Express account not found');
    }

    const { mintA } = await this.deserializeTrustExpressAccount(trustExpressAccountInfo.data);

    // Calculate fee (5% default)
    const tokenAmountBigInt = BigInt(event.data.amount || '0');
    const feeAmountBigInt = (tokenAmountBigInt * BigInt(5)) / BigInt(100);

    const parsedPayoutDetails = JSON.parse(event.data.payoutDetails || '{}');

    const newReceiptId = uuidv4();

    const insertPayload = {
      id: newReceiptId,
      payout_reference: event.data.payoutReference,
      transaction_signature: transactionSignature,
      trust_express_address: event.data.trustExpress,
      taker_address: event.data.taker,
      maker_address: makerAddress,
      token_amount: event.data.amount,
      fiat_amount: event.data.fiatAmount,
      currency: event.data.currency,
      fee_amount: feeAmountBigInt.toString(),
      payout_method: parsedPayoutDetails.type,
      payout_details: parsedPayoutDetails,
      flw_reference: payoutResult.flw_ref,
      status: payoutResult.success ? 'success' : 'failed',
      mint_address: mintA.toString(), // ADD THIS LINE
      created_at: new Date().toISOString() 
    };


    const { data: receipt, error } = await supabaseAdmin
      .from('receipts')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      throw new Error(`Supabase insert failed: ${error.message || JSON.stringify(error)}`);
    }

    return receipt.id;

  } catch (error) {
    console.error('Failed to generate receipt:', error);
    if (error instanceof Error) {
      console.error("   Error name:", error.name);
      console.error("   Error message:", error.message);
      console.error("   Error stack:", error.stack);
    }
    return null;
  }
}

private async generateSellReceipt(
  trustExpress: string,
  reservation: ReservedAmount,
  flutterwaveTransaction: any,
  transactionSignature: string,
  makerAddress: string
): Promise<string | null> {
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Fetch trust_express account to get mint and currency
    const trustExpressAccountInfo = await this.connection.getAccountInfo(
      new PublicKey(trustExpress)
    );
    
    if (!trustExpressAccountInfo) {
      throw new Error('Trust Express account not found');
    }

    const { mintA, currency } = await this.deserializeTrustExpressAccount(
      trustExpressAccountInfo.data
    );

    // Calculate fee (5% default)
    const tokenAmountBigInt = BigInt(reservation.amount);
    const feeAmountBigInt = (tokenAmountBigInt * BigInt(5)) / BigInt(10000);

    const newReceiptId = uuidv4();

    const insertPayload = {
      id: newReceiptId,
      payout_reference: reservation.payoutReference,
      transaction_signature: transactionSignature,
      trust_express_address: trustExpress,
      taker_address: reservation.taker.toString(),
      maker_address: makerAddress,
      token_amount: reservation.amount,
      fiat_amount: reservation.fiatAmount,
      currency: currency,
      fee_amount: feeAmountBigInt.toString(),
      payout_method: 'flutterwave_payment',
      payout_details: {
        transaction_id: flutterwaveTransaction.id,
        flw_ref: flutterwaveTransaction.flw_ref,
        payment_type: flutterwaveTransaction.payment_type || 'card',
      },
      flw_reference: flutterwaveTransaction.flw_ref,
      status: 'success',
      mint_address: mintA.toString(),
      created_at: new Date().toISOString() 
    };

    const { data: receipt, error } = await supabaseAdmin
      .from('receipts')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      throw new Error(`Receipt insertion failed: ${error.message}`);
    }

    return receipt.id;

  } catch (error) {
    console.error('❌ Failed to generate sell receipt:', error);
    return null;
  }
}

private async deserializeTrustExpressAccount(data: Buffer): Promise<{
  seed: string;
  maker: PublicKey;
  mintA: PublicKey;
  currency: string;
  trustExpressType: number;
  feePercentage: number;
  feeDestination: PublicKey;
  reservedFee: string;
  amount: string;
  pricePerToken: string;
  paymentInstructions: string;
  reservedAmounts: ReservedAmount[];
  bump: number;
}> {
  try {
    if (!data || data.length < 200) {
      throw new Error(`Account data too small: ${data?.length || 0} bytes`);
    }

    let offset = 0;

   
    const discriminator = Array.from(data.slice(0, 8));
    const expectedDiscriminator = [ 22, 110, 124, 216, 223, 105, 7, 33 ];

    if (!this.arraysEqual(discriminator, expectedDiscriminator)) {
      throw new Error(
        `Invalid account discriminator. Expected: ${expectedDiscriminator}, Got: ${discriminator}`
      );
    }

    offset = 8;

   
    const seed = data.readBigUInt64LE(offset);
    offset += 8;

   
    const maker = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

   
    const mintA = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

   
    const currencyBytes = data.slice(offset, offset + 3);
    const currency = String.fromCharCode(...currencyBytes).replace(/\0/g, "");
    offset += 3;

   
    const trustExpressType = data.readUInt8(offset);
    offset += 1;

   
    const feePercentage = data.readUInt16LE(offset);
    offset += 2;

   
    const feeDestination = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

   
    const reservedFee = data.readBigUInt64LE(offset);
    offset += 8;

   
    const amount = data.readBigUInt64LE(offset);
    offset += 8;

   
    const pricePerToken = data.readBigUInt64LE(offset);
    offset += 8;

   
    const paymentInstructionsLength = data.readUInt32LE(offset);
    offset += 4;

    if (paymentInstructionsLength > 300) {
      throw new Error(`Invalid payment_instructions length: ${paymentInstructionsLength}`);
    }

    const paymentInstructions = data
      .slice(offset, offset + paymentInstructionsLength)
      .toString("utf8");
    offset += paymentInstructionsLength;

   
    const reservedAmountsLength = data.readUInt32LE(offset);
    offset += 4;

    if (reservedAmountsLength > 10) {
      throw new Error(`Invalid reserved_amounts length: ${reservedAmountsLength}`);
    }

    const reservedAmounts = [];
    for (let i = 0; i < reservedAmountsLength; i++) {
      const reservation = this.deserializeReservedAmount(data, offset);
      reservedAmounts.push(reservation.data);
      offset = reservation.newOffset;
    }

   
    const bump = data.readUInt8(offset);

    return {
      seed: seed.toString(),
      maker,
      mintA,
      currency,
      trustExpressType,
      feePercentage,
      feeDestination,
      reservedFee: reservedFee.toString(),
      amount: amount.toString(),
      pricePerToken: pricePerToken.toString(),
      paymentInstructions,
      reservedAmounts,
      bump,
    };

  } catch (error) {
    throw new Error(`TrustExpress account deserialization failed: ${(error as Error).message}`);
  }
}

private arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

private deserializeReservedAmount(data: Buffer, startOffset: number): {
  data: ReservedAmount;
  newOffset: number;
} {
  let offset = startOffset;

  
  const taker = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  
  const amount = data.readBigUInt64LE(offset);
  offset += 8;

  
  const fiatAmount = data.readBigUInt64LE(offset);
  offset += 8;

  
  const timestamp = data.readBigInt64LE(offset);
  offset += 8;

  
  const hasSellerInstructions = data.readUInt8(offset) === 1;
  offset += 1;

  let sellerInstructions = null;
  if (hasSellerInstructions) {
    const instructionsLength = data.readUInt32LE(offset);
    offset += 4;
    sellerInstructions = data
      .slice(offset, offset + instructionsLength)
      .toString("utf8");
    offset += instructionsLength;
  }

  
  const status = data.readUInt8(offset);
  offset += 1;

  
  const hasDisputeReason = data.readUInt8(offset) === 1;
  offset += 1;

  let disputeReason = null;
  if (hasDisputeReason) {
    const reasonLength = data.readUInt32LE(offset);
    offset += 4;
    disputeReason = data
      .slice(offset, offset + reasonLength)
      .toString("utf8");
    offset += reasonLength;
  }

  
  const hasDisputeId = data.readUInt8(offset) === 1;
  offset += 1;

  let disputeId = null;
  if (hasDisputeId) {
    const disputeIdLength = data.readUInt32LE(offset);
    offset += 4;
    disputeId = data.slice(offset, offset + disputeIdLength).toString("utf8");
    offset += disputeIdLength;
  }

  
  const hasPayoutDetails = data.readUInt8(offset) === 1;
  offset += 1;

  let payoutDetails = null;
  if (hasPayoutDetails) {
    const payoutDetailsLength = data.readUInt32LE(offset);
    offset += 4;
    payoutDetails = data
      .slice(offset, offset + payoutDetailsLength)
      .toString("utf8");
    offset += payoutDetailsLength;
  }

  
  const hasPayoutReference = data.readUInt8(offset) === 1;
  offset += 1;

  let payoutReference = null;
  if (hasPayoutReference) {
    const payoutReferenceLength = data.readUInt32LE(offset);
    offset += 4;
    payoutReference = data
      .slice(offset, offset + payoutReferenceLength)
      .toString("utf8");
    offset += payoutReferenceLength;
  }

  return {
    data: {
      taker,
      amount: amount.toString(),
      fiatAmount: fiatAmount.toString(),
      timestamp: timestamp.toString(),
      sellerInstructions,
      status,
      disputeReason,
      disputeId,
      payoutDetails,
      payoutReference,
    },
    newOffset: offset,
  };
}

  private async getConfirmPayoutAccounts(event: ParsedEvent, success: boolean) {
    const trustExpresAccountPubkey = new PublicKey(event.data.trustExpress!);
        
    const accounts = [

      { pubkey: trustExpresAccountPubkey, isSigner: false, isWritable: true },

      { pubkey: this.botWallet.publicKey, isSigner: true, isWritable: false },

      { pubkey: trustExpresAccountPubkey, isSigner: false, isWritable: false }, 

      { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false }, 

      { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: true }, 

      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, 

      { pubkey: success ? SystemProgram.programId : new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: true },

      { pubkey: success ? new PublicKey('11111111111111111111111111111111') : SystemProgram.programId, isSigner: false, isWritable: true },

      { pubkey: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), isSigner: false, isWritable: false },
    ];

    return accounts;
  }

  private async detectTokenProgram(mint: PublicKey): Promise<{ tokenProgram: PublicKey }> {
  const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  const TOKEN_2022_PROGRAM = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

  const mintAccountInfo = await this.connection.getAccountInfo(mint);
  
  if (!mintAccountInfo) {
    throw new Error(`Mint account not found: ${mint.toString()}`);
  }

  if (mintAccountInfo.owner.equals(TOKEN_2022_PROGRAM)) {
    return { tokenProgram: TOKEN_2022_PROGRAM };
  } else if (mintAccountInfo.owner.equals(TOKEN_PROGRAM)) {
    return { tokenProgram: TOKEN_PROGRAM };
  } else {
    throw new Error(`Unknown token program for mint: ${mintAccountInfo.owner.toString()}`);
  }
}

  private async sendPayoutNotification(
    event: ParsedEvent,
    success: boolean,
    result: PayoutResult
  ): Promise<void> {
    // TODO: Implement actual notification sending
  }

  async initialize(): Promise<void> {
    try {
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        }
      );

      const { error } = await supabaseAdmin
        .from("user_subscriptions")
        .select("id")
        .limit(1);

      if (error) {
        console.error("❌ Supabase connection failed:", error);
        throw error;
      }

      await this.client.login(process.env.DISCORD_BOT_TOKEN!);

      this.client.on("clientReady", () => {
        this.startEventListening();
        this.startWebhookPolling(); 
        this.startStatusUpdates();
      });

      this.client.on("error", (error) => {
        console.error("❌ Discord client error:", error);
      });
    } catch (error) {
      console.error("❌ Failed to initialize Discord bot:", error);
      throw error;
    }
  }

  private async startEventListening(): Promise<void> {
      if (this.isListening) return;

      try {
        // Health check first
        const isHealthy = await this.checkConnectionHealth();
        if (!isHealthy) {
          throw new Error("RPC connection is not healthy");
        }

        const trustVaultProgramId = new PublicKey(process.env.TRUST_VAULT_PROGRAM_ID!);
        const trustExpressProgramId = new PublicKey(process.env.TRUST_EXPRESS_PROGRAM_ID!);


        // Listener 1: Trust Vault Program
        const vaultSubscriptionId = this.connection.onLogs(
          trustVaultProgramId,
          (logs: TransactionLogs) => {
            const logsContext: LogsContext = {
              signature: logs.signature || 'unknown',
              accounts: [],
              programId: trustVaultProgramId.toString(),
            };
            
            this.processLogs(logs, logsContext);
          },
          "confirmed"
        );

        // Listener 2: Trust Express Program
        const expressSubscriptionId = this.connection.onLogs(
          trustExpressProgramId,
          (logs: TransactionLogs) => {
            const logsContext: LogsContext = {
              signature: logs.signature || 'unknown',
              accounts: [],
              programId: trustExpressProgramId.toString(),
            };
            
            this.processLogs(logs, logsContext);
          },
          "confirmed"
        );


        this.isListening = true;

        await this.sendTestNotification();
      } catch (error) {
        console.error("❌ Failed to start event listening:", error);
        throw error;
      }
    }
private async startWebhookPolling(): Promise<void> {
  // ─────────────────────────────────────────────────────────────────────────
  // CHANGED: This bot no longer confirms sell payments on-chain from webhooks.
  // Flutterwave payment webhooks are received by the Next.js app (/api/webhook/flutterwave).
  // That endpoint stores the event in the webhook_events table.
  // Validator bots independently detect payment and submit submit_sell_vote — when
  // the vote threshold is reached, tokens are released automatically on-chain.
  // This bot then reacts to the resulting ValidatorVoteExecutedEvent to generate
  // receipts and send Discord notifications.
  //
  // If you need the webhook polling loop for other purposes (e.g. syncing order status
  // from the DB without on-chain confirmation), you can re-add logic here.
  // ─────────────────────────────────────────────────────────────────────────
  console.log('ℹ️  startWebhookPolling: No-op in decentralised validator model. Validators handle settlement.');
}

  private async sendTestNotification(): Promise<void> {
    try {
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const { data: subscriptions, error } = await supabaseAdmin
        .from("user_subscriptions")
        .select("*");

      if (error) {
        console.error("❌ Error fetching subscriptions for test:", error);
        return;
      }

      if (!subscriptions || subscriptions.length === 0) {
        return;
      }

      const testEmbed = this.embedCreator.createTestEmbed();

      for (const subscription of subscriptions) {
        await this.notificationManager.sendDiscordNotification(
          subscription,
          testEmbed
        );
        this.notificationsSent++;
      }
    } catch (error) {
      console.error("❌ Error sending test notification:", error);
    }
  }

  private async processLogs(logs: TransactionLogs, context: LogsContext): Promise<void> {
    try {
      this.eventsProcessed++;

      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      // Determine which program emitted this event
      const trustVaultProgramId = process.env.TRUST_VAULT_PROGRAM_ID!;
      const trustExpressProgramId = process.env.TRUST_EXPRESS_PROGRAM_ID!;
      
      let programSource: 'TRUST_VAULT' | 'TRUST_EXPRESS' | undefined;
      
      if (context.programId === trustVaultProgramId) {
        programSource = 'TRUST_VAULT';
      } else if (context.programId === trustExpressProgramId) {
        programSource = 'TRUST_EXPRESS';
      }


      try {
        await supabaseAdmin.from("notifications").insert({
          message: `Processing logs from ${programSource}: ${JSON.stringify(logs.logs.slice(0, 3))}...`,
          timestamp: new Date().toISOString(),
        });
      } catch (dbError) {
        console.error("❌ Error storing log in database:", dbError);
      }

      const events = this.eventParser.parseLogsForEvents(logs, context);

      if (events.length === 0) {
        return;
      }


      for (const event of events) {
        const compatibleEvent: ParsedEvent = {
          type: event.type,
          data: event.data,
          participants: event.participants,
          signature: event.signature || context.signature || 'unknown',
          timestamp: event.timestamp || Date.now(),
          programSource: programSource, // FIX: Set programSource here
        };
        
        await this.handleEvent(compatibleEvent);
      }
    } catch (error) {
      console.error("❌ Bot: Error processing logs:", error);
    }
  }

 // ─────────────────────────────────────────────────────────────────────────
  // NEW: Validator vote executed handler
  // Fired on-chain when validators reach consensus and tokens are transferred.
  // This bot reacts: generates receipt, updates DB, sends Discord notifications.
  // ─────────────────────────────────────────────────────────────────────────
  private async handleValidatorVoteExecuted(event: ParsedEvent): Promise<void> {
    console.log('\n🗳️ ValidatorVoteExecuted — processing settlement outcome...');

    const { trustExpress, taker, payoutReference, success, message, amount, fiatAmount, currency } = event.data;

    if (!trustExpress || !taker || !payoutReference) {
      console.error('❌ Missing required fields in ValidatorVoteExecutedEvent');
      return;
    }

    console.log(`   Trust Express: ${trustExpress}`);
    console.log(`   Taker: ${taker}`);
    console.log(`   Payout Reference: ${payoutReference}`);
    console.log(`   Success: ${success} | Message: ${message}`);

    try {
      const trustExpressAccountInfo = await this.fetchAccountWithRetry(new PublicKey(trustExpress), 3, 1000);
      if (!trustExpressAccountInfo) {
        console.error('❌ Could not fetch trust express account');
        return;
      }

// AFTER
const { maker, mintA, currency: onChainCurrency } = await this.deserializeTrustExpressAccount(trustExpressAccountInfo.data);
const makerAddress = maker.toString();
event.participants.maker = makerAddress;
event.participants.taker = taker;

const mintInfo = await this.connection.getAccountInfo(mintA);
if (!mintInfo) throw new Error(`Could not fetch mint account for ${mintA.toString()}`);
const mintDecimals = mintInfo.data[44];
const scaledFiatAmount = (Number(event.data.fiatAmount) / Math.pow(10, mintDecimals)).toString();

if (success) {
  const receiptId = await this.generateValidatorSettlementReceipt(event, makerAddress, mintA.toString(), onChainCurrency, scaledFiatAmount);
        if (receiptId) {
          console.log(`✅ Receipt generated: ${receiptId}`);
          await this.updatePaymentLinkStatus(payoutReference as string, 'completed');
          await this.sendReceiptNotification(event, receiptId, makerAddress);
        }
      } else {
        console.log(`ℹ️ Trade rejected by validators. Tokens refunded. Reason: ${message}`);
        await this.updatePaymentLinkStatus(payoutReference as string, 'failed');
        const supabaseAdmin = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        await supabaseAdmin
        .from('receipts')
        .update({ status: 'failed', transaction_signature: event.signature })
        .eq('payout_reference', payoutReference);

        await this.sendEventNotifications(event);
      }

      // Log settlement outcome
      try {
        const supabaseAdmin = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        await supabaseAdmin.from('payout_logs').insert({
          payout_reference: payoutReference,
          status: success ? 'completed' : 'failed',
          settlement_method: 'validator_consensus',
          timestamp: new Date().toISOString(),
          event_signature: event.signature,
        });
      } catch (dbError) {
        console.error('❌ Failed to log settlement outcome:', dbError);
      }

    } catch (error) {
      console.error('❌ Error handling ValidatorVoteExecutedEvent:', error);
    }

    console.log('✅ ValidatorVoteExecuted processing complete\n');
  }

  // AFTER
private async generateValidatorSettlementReceipt(
  event: ParsedEvent,
  makerAddress: string,
  mintAddress: string,
  onChainCurrency: string,
  scaledFiatAmount: string
): Promise<string | null> {
    try {
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      // Parse the original bank details from payoutDetails so they are preserved
      // on the receipt row and visible in the receipt modal.
      const bankDetails = parsePayoutDetails(event.data.payoutDetails as string | null);

      // Idempotency: don't double-insert
      // Try to update an existing pending receipt first (upsert-by-reference)
      const { data: updated } = await supabaseAdmin
        .from('receipts')
        .update({
          status: 'success',
          transaction_signature: event.signature,
          mint_address: mintAddress,
         // account_number:   bankDetails?.account_number                                 ?? null,
          //bank_name:        bankDetails?.bank_code                                       ?? null,
          //beneficiary_name: bankDetails?.beneficiary_name ?? bankDetails?.account_name  ?? null,
         payout_details: {
            settlement_type: 'validator_vote',
            message: event.data.message,
            signature: event.signature,
            //account_number:   bankDetails?.account_number                                ?? null,
            //bank_code:        bankDetails?.bank_code                                     ?? null,
            //beneficiary_name: bankDetails?.beneficiary_name ?? bankDetails?.account_name ?? null,
          },
        })
        .eq('payout_reference', event.data.payoutReference)
        .select('id')
        .maybeSingle();

      if (updated) return updated.id;

      // No existing receipt — insert fresh (fallback)
      const tokenAmountBigInt = BigInt(event.data.amount || '0');
      const feeAmountBigInt = BigInt((event.data as any).feeAmount || '0');
      const newReceiptId = uuidv4();

      const { data: receipt, error } = await supabaseAdmin
        .from('receipts')
        .insert({
          id: newReceiptId,
          payout_reference: event.data.payoutReference,
          transaction_signature: event.signature,
          trust_express_address: event.data.trustExpress,
          taker_address: event.data.taker,
          maker_address: makerAddress,
          token_amount: tokenAmountBigInt.toString(),
          fiat_amount: scaledFiatAmount,
          currency: event.data.currency || onChainCurrency,
          fee_amount: feeAmountBigInt.toString(),
          payout_method: 'validator_consensus',
          account_number:   bankDetails?.account_number                                 ?? null,
          bank_name:        bankDetails?.bank_code                                       ?? null,
          beneficiary_name: bankDetails?.beneficiary_name ?? bankDetails?.account_name  ?? null,
          payout_details: {
            settlement_type: 'validator_vote',
            message: event.data.message,
            signature: event.signature,
            account_number:   bankDetails?.account_number                                ?? null,
            bank_code:        bankDetails?.bank_code                                     ?? null,
            beneficiary_name: bankDetails?.beneficiary_name ?? bankDetails?.account_name ?? null,
          },
          flw_reference: null,
          status: 'success',
          mint_address: mintAddress,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw new Error(`Receipt insert failed: ${error.message}`);
      return receipt.id;
    } catch (error) {
      console.error('❌ Failed to generate validator settlement receipt:', error);
      return null;
    }
  }


 // HandleEvent() with routing logic
  private async handleEvent(event: ParsedEvent): Promise<void> {
    try {

      // CRITICAL ROUTING LOGIC - with safety check
      if (!event.programSource) {
        console.error("❌ CRITICAL ERROR: Event missing programSource field!");
        console.error("   This should never happen. Check processLogs implementation.");
        return;
      }

      // ✅ DEDUPLICATION: Skip if we've already processed this transaction
      if (event.signature && event.signature !== 'unknown') {
        if (this.hasProcessedSignature(event.signature)) {
          console.log(`⏭️ Skipping duplicate event from signature: ${event.signature.slice(0, 8)}...`);
          return;
        }
      }

      // TRUST_EXPRESS + InstantPaymentReservedEvent: notify only, validators settle
      if (
        event.programSource === 'TRUST_EXPRESS' && 
        event.type === "InstantPaymentReservedEvent"
      ) {
        await this.handleInstantPaymentReserved(event);
        return;
      }

      if (
        event.programSource === 'TRUST_EXPRESS' && 
        event.type === "InstantSellReservationCreatedEvent"
      ) {
        await this.handleInstantSellReservation(event);
        return;
      }

      // ✅ NEW: Validator consensus reached — generate receipt, notify, update DB
      if (
        event.programSource === 'TRUST_EXPRESS' &&
        event.type === "ValidatorVoteExecutedEvent"
      ) {
        await this.handleValidatorVoteExecuted(event);
        return;
      }

      // All other events: just send notifications
      await this.sendEventNotifications(event);

      // Log to database
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      try {
        await supabaseAdmin.from("notifications").insert({
          message: `Event processed: ${event.type} from ${event.programSource} for ${Object.keys(event.participants).join(", ")}`,
          timestamp: new Date().toISOString(),
        });
      } catch (dbError) {
        console.error("❌ Error storing event in database:", dbError);
      }

    } catch (error) {
      console.error(`❌ Error handling event ${event.type}:`, error);
      
      if (error instanceof Error) {
        console.error("   Error name:", error.name);
        console.error("   Error message:", error.message);
        console.error("   Stack trace:", error.stack);
      }
    }
  }


  private async sendEventNotifications(event: ParsedEvent): Promise<void> {
    try {
      
      const participants = event.participants || {};
      
      if (Object.keys(participants).length === 0) {
        return;
      }

for (const [role, walletAddress] of Object.entries(participants)) {

        if (!walletAddress || !this.isValidRole(role)) {
          continue;
        }

        try {
          const embed = this.embedCreator.createEmbed(
            event.type as never,
            event.data as never,
            role
          );

          const eventTypeKey = this.notificationManager.getEventTypeForRole(
            event.type,
            role
          );

          const sent = await this.notificationManager.sendNotificationToWallet(
            walletAddress,
            eventTypeKey,
            embed
          );

          if (sent.length > 0) {
            this.notificationsSent += sent.length;
          }
        } catch (error) {
          console.error(`❌ Failed to send notification to ${role} (${walletAddress}):`, error);
        }
      }
    } catch (error) {
      console.error(`❌ Error sending event notifications:`, error);
    }
  }

 private isValidRole(role: string): role is 'buyer' | 'seller' | 'disputer' | 'disputerAddress' | 'otherPartyAddress' | 'taker' | 'maker' | 'user' {
    const validRoles = ['buyer', 'seller', 'disputer', 'disputerAddress', 'otherPartyAddress', 'taker', 'maker', 'user'];
    return validRoles.includes(role);
}


    private async waitForPendingPayments(timeoutMs: number): Promise<void> {
    const startTime = Date.now();
    
    while (this.pendingPayments.size > 0 && (Date.now() - startTime) < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    if (this.pendingPayments.size > 0) {
      console.warn(`⚠️ ${this.pendingPayments.size} payments still pending after timeout`);
    }
  }

  private async checkConnectionHealth(): Promise<boolean> {
  try {
    const version = await this.connection.getVersion();
    return true;
  } catch (error) {
    console.error("❌ RPC Connection failed:", error);
    return false;
  }
}


  private async startStatusUpdates(): Promise<void> {
    setInterval(async () => {
      try {
        const supabaseAdmin = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        await supabaseAdmin.from("bot_status").upsert({
          bot_id: "trust_vault_bot",
          last_seen: new Date().toISOString(),
          events_processed: this.eventsProcessed,
          notifications_sent: this.notificationsSent,
          is_active: true,
        });
      } catch (error) {
        console.error("❌ Error updating bot status:", error);
      }
    }, 30000);
  }

  async shutdown(): Promise<void> {
    this.isListening = false;
    await this.waitForPendingPayments(30000);
    await this.client.destroy();
  }
}
class CircuitBreaker {
  private name: string;
  private failureCount: number;
  private threshold: number;
  private timeout: number;
  private resetTimeout: number;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  private nextAttempt: number;
  private lastFailure: Error | null;

  constructor(name: string, options: { threshold?: number; timeout?: number; resetTimeout?: number } = {}) {
    this.name = name;
    this.failureCount = 0;
    this.threshold = options.threshold ?? 5;
    this.timeout = options.timeout ?? 60000;
    this.resetTimeout = options.resetTimeout ?? 30000;
    this.state = "CLOSED";
    this.nextAttempt = Date.now();
    this.lastFailure = null;
  }

  async call<T>(fn: () => Promise<T>, fallback?: () => T): Promise<T> {
    if (this.state === "OPEN") {
      if (Date.now() < this.nextAttempt) {
        if (fallback) return fallback();
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      } else {
        this.state = "HALF_OPEN";
      }
    }

    try {
      const result = await fn();
      this.reset();
      return result;
    } catch (error) {
      this.recordFailure(error as Error);
      throw error;
    }
  }

  private recordFailure(error: Error): void {
    this.failureCount++;
    this.lastFailure = error;

    if (this.failureCount >= this.threshold) {
      this.state = "OPEN";
      this.nextAttempt = Date.now() + this.resetTimeout;
    }
  }

  private reset(): void {
    if (this.failureCount > 0) {
    }
    this.failureCount = 0;
    this.state = "CLOSED";
    this.lastFailure = null;
  }
}
export default TrustVaultDiscordBot;

async function main() {
  
  const bot = new TrustVaultDiscordBot();
  
  process.on('SIGINT', async () => {
    await bot.shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await bot.shutdown();
    process.exit(0);
  });

  try {
    await bot.initialize();
  } catch (error) {
    console.error("Failed to start bot:", error);
    process.exit(1);
  }
}

main().catch(console.error);