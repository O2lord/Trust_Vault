import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {CreateSellOrderSchema, CreateSellOrderSchemaType} from "@/schemas/sellOrderSchema"
import { z } from 'zod';

export interface ReservationData {
  taker: PublicKey;
  amount: BN;
  fiatAmount: BN;
  timestamp: BN;
  status: number;
  disputeReason?: string;
  disputeId?: string;
}
export interface TrustVaultAccountData {
  seed: BN;
  maker: PublicKey;
  mint: PublicKey;
  currency: number[];
  trustVaultType: number;
  bump: number;
  feePercentage?: number;
  feeDestination?: PublicKey;
  reservedFee?: BN;
  taker?: PublicKey;
  amount?: BN;
  pricePerToken?: BN;
  paymentInstructions?: string;
  reservation?: ReservationData;
  reservedAmounts?: ReservationData[];
}

export interface MintInfo {
  address: PublicKey;
  decimals: number;
  isToken2022: boolean;
  tokenProgram: PublicKey;
}

export enum DisputeResolution {
  FAVOR_MAKER = 0,
  FAVOR_TAKER = 1,
}

export enum ReservationStatus {
  PENDING = 0,
  PAYMENT_SENT = 1,
  COMPLETED = 2,
  CANCELLED = 3,
  DISPUTED = 4,
  RESOLVED = 5,
}

export type FeeInfo = {
  feePercentage: number;
  feeDestination: PublicKey;
};

export enum TransactionType {
  SELL_ORDER_CREATED = "sell-order-created",
  TRUST_VAULT_REFUNDED = "trust_vault_refunded",
  TOKENS_RESERVED = "tokens_reserved",
  RESERVATION_CANCELLED = "reservation_cancelled",
  PAYMENT_SENT = "payment_sent",
  PAYMENT_CONFIRMED = "payment_confirmed",
  PRICE_UPDATED = "price_updated",
  GLOBAL_STATE_INITIALIZED = "global_state_initialized",
  TRUST_VAULT_CLOSED = "trust_vault_closed",
  DISPUTE_RESOLVED = "dispute_resolved",
  PAYMENT_DISPUTED = "payment_disputed",
  TRANSACTION_FAILED= "transaction_failed",
  BUY_ORDER_REDUCED = "buy_order_reduced",
  BUY_ORDER_CANCELLED = "buy_order_cancelled",
  BUYER_PAYMENT_SENT = "buyer_payment_sent",
  BUY_ORDER_CREATED = "buy_order_created",
  BUY_ORDER_RESERVED = "buy_order_reserved",
  SELLER_CONFIRMS_PAYMENT = "seller_confirms_payment",
  /** TRUST EXPRESS */
  EXPRESS_BUY_ORDER_CREATED = "express_buy_order_created",
  EXPRESS_PRICE_UPDATED = "express_price_updated",
  EXPRESS_BUY_ORDER_REDUCED = "express_buy_order_reduced",
  EXPRESS_BUY_ORDER_CANCELLED = "express_buy_order_cancelled",
  INSTANT_PAYMENT_RESERVED = "Instant_payment_reserved",
  INSTANT_PAYMENT_SUCCESS = "Instant_payment_success",
  INSTANT_PAYMENT_FAILED = "Instant_payment_failed",
  EXPRESS_SELL_ORDER_CREATED = "Express_Sell_Order_Created",
  INSTANT_SELL_RESERVATION_CREATED = "Instant_Sell_Reservation_Created",
  EXPRESS_WITHDRAWAL = "Express_Withdrawal",
  INSTANT_SELL_PAYMENT_SUCCESS = "Instant_Sell_Payment_Success",
  INSTANT_SELL_PAYMENT_FAILED = "Instant_Sell_Payment_Failed",
  ANY = "any_transaction", 
}


export interface TransactionDetails {
  type: TransactionType;
  trustVault?: PublicKey;
  trustExpress?: PublicKey;
  amount?: number;
  signature?: string;
  timestamp: number;
  details?: Record<string, unknown>;
}

// Extended schema with payment instruction fields
export const ExtendedSellOrderSchema = CreateSellOrderSchema.extend({
  deposit: z.number().min(0.001, "Deposit amount must be greater than 0"),
  bankName: z.string().min(1, "Bank name is required"),
  accountNumber: z.string().min(1, "Account number is required"),
  accountName: z.string().min(1, "Account name is required"),
  additionalInstructions: z.string().optional(),
});

// Extended schema type
export type ExtendedSellOrderSchemaType = CreateSellOrderSchemaType & {
  bankName: string;
  accountNumber: string;
  accountName: string;
  additionalInstructions?: string;
};

export type TokenInfo = {  
  mint: string;
  balance: number;
};

export type Props = {
  trigger?: React.ReactNode;
  className?: string;
};

