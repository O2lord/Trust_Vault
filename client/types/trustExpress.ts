// types.ts - Comprehensive type definitions for Trust Vault bot

import { PublicKey } from "@solana/web3.js";

// =============================================================================
// CORE EVENT TYPES
// =============================================================================

export interface PayoutError {
  id: string;
  payout_reference: string;
  taker: string;
  error_type: string;
  error_message: string;
  event_data: string; // JSON string
  timestamp: string;
}

export interface TransactionError {
  id: string;
  payout_reference?: string;
  error_message: string;
  error_stack?: string;
  timestamp: string;
}

// =============================================================================
// CIRCUIT BREAKER TYPES
// =============================================================================

export interface CircuitBreakerOptions {
  threshold?: number;
  timeout?: number;
  resetTimeout?: number;
}

export interface CircuitBreakerStatus {
  name: string;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  threshold: number;
  nextAttempt: number;
  lastFailure?: string;
}

// =============================================================================
// NOTIFICATION TYPES
// =============================================================================

export interface NotificationEvent {
  type: string;
  participants: EventParticipants;
  data: Record<string, unknown>;
}

export interface NotificationStats {
  total: number;
  successful: number;
  failed: number;
  byEventType: Record<string, {
    total: number;
    successful: number;
    failed: number;
  }>;
}

export interface NotificationError extends Error {
  code?: number;
  discordCode?: DiscordErrorCode;
  retryable?: boolean;
}

export enum DiscordErrorCode {
  CANNOT_SEND_DM = 50007,
  UNKNOWN_USER = 10013,
  MISSING_ACCESS = 50001,
  UNKNOWN_CHANNEL = 10003,
}

// =============================================================================
// ROLE MAPPING TYPES
// =============================================================================

export type RoleMapping = {
  [K in EventTypeKey]?: Partial<Record<UserRole, string>>;
};

export interface EventConfig {
  instruction: string;
  eventType: string;
  extractRoles: (logs: string[], context: LogsContext) => EventParticipants | null;
}

export interface EventPatterns {
  [key: string]: EventConfig;
}

// =============================================================================
// EVENT DECODER TYPES
// =============================================================================

export interface EventDiscriminators {
  [key: string]: number[];
}

export interface DecodedEvent {
  eventType: string;
  trustExpress?: string;
  trustVault?: string;
  participants?: EventParticipants;
  maker?: string;
  buyer?: string;
  taker?: string;
  amount?: string;
  fiatAmount?: string;
  currency?: string;
  oldPrice?: string;
  newPrice?: string;
  mint?: string;
  pricePerToken?: string;
  paymentInstructions?: string;
  originalAmount?: string;
  newAmount?: string;
  timestamp?: string;
  payoutDetails?: string | null;
  payoutReference?: string | null;
  success?: boolean;
  message?: string;
  oldPriceFormatted?: string;
  newPriceFormatted?: string;
  amountFormatted?: string;
  pricePerTokenFormatted?: string;
  fiatAmountFormatted?: string;
  addresses?: string[];
  note?: string;
  error?: string;
}

export interface AddressInfo {
  address: string;
  offset: number;
  type: string;
}

// =============================================================================
// BOT CONFIGURATION TYPES
// =============================================================================

export interface BotConfig {
  discordToken: string;
  supabaseUrl: string;
  supabaseServiceKey: string;
  flutterwaveSecretKey: string;
  botWalletPrivateKey: string;
  trustExpressProgramId: string;
  solanaRpcUrl?: string;
}

export interface BotStatus {
  bot_id: string;
  last_seen: string;
  events_processed: number;
  notifications_sent: number;
  payouts_processed: number;
  is_active: boolean;
}

// =============================================================================
// EMBED CREATOR TYPES
// =============================================================================

export type EventType = EventTypeKey;

export interface EmbedConfig {
  title: string;
  description: string;
  color: number;
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
}

// =============================================================================
// TRANSACTION TYPES
// =============================================================================

export interface TransactionOptions {
  skipPreflight?: boolean;
  preflightCommitment?: string;
  maxRetries?: number;
  confirmationTimeout?: number;
}

export interface ConfirmPayoutParams {
  trustExpressAddress: string;
  taker: string;
  amount: string;
  fiatAmount: string;
  currency: string;
  payoutReference: string;
  success: boolean;
  message: string;
}

// =============================================================================
// FLUTTERWAVE SERVICE TYPES
// =============================================================================

export interface BankInfo {
  id: number;
  code: string;
  name: string;
}

export interface AccountVerificationDetails {
  account_number: string;
  account_bank: string;
}

export interface AccountVerificationResponse {
  success: boolean;
  accountName?: string;
  accountNumber?: string;
  error?: string;
}

export interface CurrencyInfo {
  name: string;
  min_amount: number;
  max_amount: number;
}

export interface SupportedCurrencies {
  [key: string]: CurrencyInfo;
}

export interface PayoutStatusResponse {
  success: boolean;
  status?: string;
  data?: FlutterwaveTransferData;
  error?: string;
}

export interface PayoutResponse {
  success: boolean;
  data?: FlutterwaveTransferData;
  reference: string;
  flw_ref?: string;
  error?: string;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// Type guard functions
export const isInstantPaymentReservedEvent = (
  data: EventData
): data is InstantPaymentReservedEventData => {
  return data.eventType === 'InstantPaymentReservedEvent';
};

export const isInstantPaymentPayoutResultEvent = (
  data: EventData
): data is InstantPaymentPayoutResultEventData => {
  return data.eventType === 'InstantPaymentPayoutResultEvent';
};

export const isPriceUpdatedEvent = (
  data: EventData
): data is PriceUpdatedEventData => {
  return data.eventType === 'PriceUpdatedEvent';
};

export const isBuyOrderCreatedEvent = (
  data: EventData
): data is BuyOrderCreatedEventData => {
  return data.eventType === 'BuyOrderCreatedEvent';
};

export const isBuyOrderReducedEvent = (
  data: EventData
): data is BuyOrderReducedEventData => {
  return data.eventType === 'BuyOrderReducedEvent';
};

export const isBuyOrderCancelledEvent = (
  data: EventData
): data is BuyOrderCancelledEventData => {
  return data.eventType === 'BuyOrderCancelledEvent';
};

// =============================================================================
// ERROR TYPES
// =============================================================================

export class PaymentProcessingError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'PaymentProcessingError';
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly errors: string[]
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class FlutterwaveError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly data?: unknown
  ) {
    super(message);
    this.name = 'FlutterwaveError';
  }
}

export class SolanaTransactionError extends Error {
  constructor(
    message: string,
    public readonly signature?: string,
    public readonly logs?: string[]
  ) {
    super(message);
    this.name = 'SolanaTransactionError';
  }
}

// =============================================================================
// CONSTANTS
// =============================================================================

export const SUPPORTED_CURRENCIES = ['NGN', 'USD', 'GHS', 'KES', 'UGX', 'TZS', 'EUR', 'GBP'] as const;
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

export const PAYOUT_STATUSES = {
  PENDING: 0,
  PROCESSING: 1,
  CONFIRMED: 2,
  CANCELLED: 3,
} as const;

export const EVENT_TYPES = {
  INSTANT_PAYMENT_RESERVED: 'InstantPaymentReservedEvent',
  INSTANT_PAYMENT_PAYOUT_RESULT: 'InstantPaymentPayoutResultEvent',
  PRICE_UPDATED: 'PriceUpdatedEvent',
  BUY_ORDER_CREATED: 'BuyOrderCreatedEvent',
  BUY_ORDER_REDUCED: 'BuyOrderReducedEvent',
  BUY_ORDER_CANCELLED: 'BuyOrderCancelledEvent',
} as const;

export const SYSTEM_ADDRESSES = [
  'ComputeBudget111111111111111111111111111111',
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
  '11111111111111111111111111111111',
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
] as const;

export interface BaseEventData {
  eventType: string;
  timestamp?: number;
  signature?: string;
}

export interface TrustExpressEventData extends BaseEventData {
  trustExpress: string;
  maker?: string;
  participants?: EventParticipants;
}

export interface InstantPaymentReservedEventData extends TrustExpressEventData {
  eventType: 'InstantPaymentReservedEvent';
  taker: string;
  amount: string;
  fiatAmount: string;
  currency: string;
  payoutDetails: string | null;
  payoutReference: string;
  amountFormatted?: string;
  fiatAmountFormatted?: string;
}

export interface InstantPaymentPayoutResultEventData extends TrustExpressEventData {
  eventType: 'InstantPaymentPayoutResultEvent';
  taker: string;
  amount: string;
  fiatAmount: string;
  currency: string;
  payoutReference: string;
  success: boolean;
  message: string;
  amountFormatted?: string;
  fiatAmountFormatted?: string;
}

export interface PriceUpdatedEventData extends TrustExpressEventData {
  eventType: 'PriceUpdatedEvent';
  oldPrice: string;
  newPrice: string;
  currency: string;
  oldPriceFormatted?: string;
  newPriceFormatted?: string;
}

export interface BuyOrderCreatedEventData extends TrustExpressEventData {
  eventType: 'BuyOrderCreatedEvent';
  buyer: string;
  mint: string;
  amount: string;
  pricePerToken: string;
  currency: string;
  paymentInstructions: string;
  amountFormatted?: string;
  pricePerTokenFormatted?: string;
}

export interface BuyOrderReducedEventData extends TrustExpressEventData {
  eventType: 'BuyOrderReducedEvent';
  buyer: string;
  originalAmount: string;
  newAmount: string;
  timestamp: number;
}

export interface BuyOrderCancelledEventData extends TrustExpressEventData {
  eventType: 'BuyOrderCancelledEvent';
  buyer: string;
  originalAmount: string;
  timestamp: number;
}

// Union type for all event data types
export type EventData = 
  | InstantPaymentReservedEventData
  | InstantPaymentPayoutResultEventData
  | PriceUpdatedEventData
  | BuyOrderCreatedEventData
  | BuyOrderReducedEventData
  | BuyOrderCancelledEventData;

// =============================================================================
// PARTICIPANTS AND ROLES
// =============================================================================

export interface EventParticipants {
  buyer?: string;
  seller?: string;
  taker?: string;
  maker?: string;
  user?: string;
  [key: string]: string | undefined;
}

export type UserRole = 'buyer' | 'seller' | 'taker' | 'maker' | 'user';

export type EventTypeKey = 
  | 'BuyOrderCreatedEvent'
  | 'BuyOrderCancelledEvent'
  | 'BuyOrderReducedEvent'
  | 'PriceUpdatedEvent'
  | 'InstantPaymentReservedEvent'
  | 'InstantPaymentPayoutResultEvent'
  | 'ReservationCancelledEvent';

// =============================================================================
// PARSED EVENT STRUCTURE
// =============================================================================

export interface ParsedEvent<T extends EventData = EventData> {
  type: T['eventType'];
  data: T;
  participants: EventParticipants;
  signature: string;
  timestamp: number;
}

// =============================================================================
// FLUTTERWAVE TYPES
// =============================================================================

export interface FlutterwaveTransferData {
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
}

export interface PayoutDetails {
  type?: 'bank_transfer' | 'mobile_money' | 'flutterwave_wallet';
  bank_code?: string;
  account_bank?: string;
  account_number: string;
  account_name?: string;
  beneficiary_name?: string;
  phone_number?: string;
  network?: string;
  narration?: string;
  [key: string]: string | undefined;
}

export interface PayoutResult {
  success: boolean;
  error?: string;
  errorCode?: string;
  flw_ref?: string | null;
  data?: FlutterwaveTransferData | null;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

// =============================================================================
// BLOCKCHAIN TYPES
// =============================================================================

export interface ReservationData {
  taker: PublicKey;
  amount: string;
  fiatAmount: string;
  currency?: string;
  payoutReference: string;
  status: number; // 0=pending, 1=processing, 2=confirmed, 3=cancelled
  timestamp?: number;
}

export interface TrustExpressAccountData {
  seed: string;
  maker: PublicKey;
  mintA: PublicKey;
  currency: string;
  escrowType: number;
  feePercentage: number;
  feeDestination: PublicKey;
  reservedFee: string;
  amount: string;
  pricePerToken: string;
  paymentInstructions: string;
  reservedAmounts: ReservationData[];
  bump: number;
}

export interface LogsContext {
  signature?: string;
  accounts?: string[];
  programId?: string;
}

export interface TransactionLogs {
  logs: string[];
  signature?: string;
}

// =============================================================================
// DATABASE TYPES
// =============================================================================

export interface UserSubscription {
  id: string;
  discord_user_id: string;
  discord_channel_id?: string;
  wallet_address: string;
  notification_preferences?: NotificationPreferences;
  created_at: string;
  updated_at: string;
}

export interface NotificationPreferences {
  express_buy_order_created?: boolean;
  express_buy_order_cancelled?: boolean;
  express_buy_order_reduced?: boolean;
  express_price_updated?: boolean;
  instant_payment_reserved?: boolean;
  instant_payment_payout_result?: boolean;
  reservation_cancelled?: boolean;
  [key: string]: boolean | undefined;
}

export interface NotificationLog {
  id: string;
  user_subscription_id: string;
  event_type: string;
  notification_sent: boolean;
  error_message?: string;
  created_at: string;
}

export interface PayoutLog {
  id: string;
  payout_reference: string;
  taker: string;
  amount?: string;
  fiat_amount?: string;
  currency?: string;
  status: 'initiated' | 'completed' | 'failed';
  flw_ref?: string;
  error_message?: string;
  error_code?: string;
  timestamp: string;
  event_signature?: string;
}

