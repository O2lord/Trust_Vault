// types/express-sell.ts
import { PublicKey } from '@solana/web3.js';

export interface ReservationData {
  taker: PublicKey;
  amount: string;
  fiatAmount: string;
  timestamp: string;
  sellerInstructions?: string | null;
  status: number;
  disputeReason?: string | null;
  disputeId?: string | null;
  payoutDetails?: string | null;
  payoutReference?: string | null;
  paymentMode?: number;
  paymentLink?: string | null;
  transactionReference?: string | null;
}

export interface TrustExpressAccountData {
  seed: string;
  maker: PublicKey;
  mint: PublicKey;
  currency: number[];
  escrowType: number;
  bump: number;
  feePercentage: number;
  feeDestination: PublicKey;
  reservedFee: string;
  amount: string;
  pricePerToken: string;
  paymentInstructions: string;
  flutterwaveCredentialId?: string | null;
  reservedAmounts?: ReservationData[];
}

export enum PaymentMode {
  PAYMENT_LINK = 0,
  DIRECT_TRANSFER = 1,
}

export enum ReservationStatus {
  PENDING = 0,
  PAYMENT_SENT = 1,
  COMPLETED = 2,
  CANCELLED = 3,
  DISPUTED = 4,
}

export enum EscrowType {
  BUY = 1,
  SELL = 0,
}

export interface MintInfo {
  address: PublicKey;
  decimals: number;
  symbol?: string;
  name?: string;
}

export interface PayoutDetails {
  account_number: string;
  bank_code?: string;
  account_bank?: string;
  account_name?: string;
  beneficiary_name?: string;
  phone_number?: string;
  network?: string;
  narration?: string;
  type?: 'bank_transfer' | 'mobile_money' | 'flutterwave_wallet';
}