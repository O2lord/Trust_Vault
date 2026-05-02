// utils/express-sell.ts
import { PublicKey } from '@solana/web3.js';
import { ReservationStatus, PaymentMode } from '@/types/express-sell';

/**
 * Format a public key to display format (shortened)
 */
export function formatPublicKey(publicKey: PublicKey | string, chars = 4): string {
  const key = typeof publicKey === 'string' ? publicKey : publicKey.toString();
  return `${key.slice(0, chars)}...${key.slice(-chars)}`;
}

/**
 * Format token amount with decimals
 */
export function formatTokenAmount(amount: string | number, decimals: number): number {
  const amountNum = typeof amount === 'string' ? parseFloat(amount) : amount;
  return amountNum / Math.pow(10, decimals);
}

/**
 * Format currency display
 */
export function formatCurrency(amount: number, currency: string, decimals = 2): string {
  return `${amount.toFixed(decimals)} ${currency}`;
}

/**
 * Parse currency array to string
 */
export function parseCurrencyArray(currencyArray: number[]): string {
  return String.fromCharCode(...currencyArray).trim();
}

/**
 * Get reservation status label
 */
export function getReservationStatusLabel(status: number): string {
  switch (status) {
    case ReservationStatus.PENDING:
      return 'Pending Payment';
    case ReservationStatus.PAYMENT_SENT:
      return 'Payment Sent';
    case ReservationStatus.COMPLETED:
      return 'Completed';
    case ReservationStatus.CANCELLED:
      return 'Cancelled';
    case ReservationStatus.DISPUTED:
      return 'Disputed';
    default:
      return 'Unknown';
  }
}

/**
 * Get reservation status color
 */
export function getReservationStatusColor(status: number): string {
  switch (status) {
    case ReservationStatus.PENDING:
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
    case ReservationStatus.PAYMENT_SENT:
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case ReservationStatus.COMPLETED:
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case ReservationStatus.CANCELLED:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
    case ReservationStatus.DISPUTED:
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
  }
}

/**
 * Get payment mode label
 */
export function getPaymentModeLabel(mode: number): string {
  switch (mode) {
    case PaymentMode.PAYMENT_LINK:
      return 'Payment Link';
    case PaymentMode.DIRECT_TRANSFER:
      return 'Direct Transfer';
    default:
      return 'Unknown';
  }
}

/**
 * Calculate fee amount
 */
export function calculateFee(amount: number, feePercentage: number): number {
  return amount * (feePercentage / 10000);
}

/**
 * Calculate amount after fee
 */
export function calculateAmountAfterFee(amount: number, feePercentage: number): number {
  const fee = calculateFee(amount, feePercentage);
  return amount - fee;
}

/**
 * Validate Solana address
 */
export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate JSON string
 */
export function isValidJSON(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Format timestamp to readable date
 */
export function formatTimestamp(timestamp: number | string): string {
  const ts = typeof timestamp === 'string' ? parseInt(timestamp) : timestamp;
  const date = new Date(ts * 1000); // Convert from seconds to milliseconds
  return date.toLocaleString();
}

/**
 * Calculate total reserved amount from reservations
 */
export function calculateTotalReserved(
  reservations: Array<{ amount: string; status: number }>,
  decimals: number
): number {
  return reservations
    .filter(r => r.status === ReservationStatus.PENDING || r.status === ReservationStatus.PAYMENT_SENT)
    .reduce((sum, r) => sum + formatTokenAmount(r.amount, decimals), 0);
}

/**
 * Validate amount input
 */
export function validateAmountInput(
  amount: string,
  maxAmount: number
): { isValid: boolean; error?: string } {
  const num = parseFloat(amount);
  
  if (!amount || isNaN(num)) {
    return { isValid: false, error: 'Amount is required' };
  }
  
  if (num <= 0) {
    return { isValid: false, error: 'Amount must be greater than 0' };
  }
  
  if (num > maxAmount) {
    return { isValid: false, error: `Maximum amount is ${maxAmount.toFixed(6)}` };
  }
  
  return { isValid: true };
}

/**
 * Parse payout details JSON
 */
export function parsePayoutDetails(details: string | null): Record<string, unknown> | null {
  if (!details) return null;
  
  try {
    return JSON.parse(details) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Generate payout reference
 */
export function generatePayoutReference(prefix = 'IS'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Format payment instructions for display
 */
export function formatPaymentInstructions(instructions: string, maxLength = 100): string {
  if (instructions.length <= maxLength) return instructions;
  return `${instructions.substring(0, maxLength)}...`;
}

/**
 * Check if user is seller
 */
export function isSeller(userPublicKey: PublicKey | null, makerPublicKey: PublicKey): boolean {
  if (!userPublicKey) return false;
  return userPublicKey.toString() === makerPublicKey.toString();
}

/**
 * Check if user is buyer (has reservation)
 */
export function isBuyer(
  userPublicKey: PublicKey | null,
  reservations?: Array<{ taker: PublicKey }>
): boolean {
  if (!userPublicKey || !reservations) return false;
  return reservations.some(r => r.taker.toString() === userPublicKey.toString());
}

/**
 * Get active reservations count
 */
export function getActiveReservationsCount(
  reservations?: Array<{ status: number }>
): number {
  if (!reservations) return 0;
  return reservations.filter(
    r => r.status === ReservationStatus.PENDING || r.status === ReservationStatus.PAYMENT_SENT
  ).length;
}

/**
 * Sort orders by creation time (seed)
 */
export function sortOrdersBySeed<T extends { account: { seed: string } }>(
  orders: T[],
  ascending = false
): T[] {
  return [...orders].sort((a, b) => {
    const seedA = parseInt(a.account.seed);
    const seedB = parseInt(b.account.seed);
    return ascending ? seedA - seedB : seedB - seedA;
  });
}

/**
 * Filter orders by search query
 */
export function filterOrdersBySearch<T extends { account: { maker: PublicKey; mint: PublicKey; currency: number[] }; publicKey: PublicKey }>(
  orders: T[],
  searchQuery: string
): T[] {
  if (!searchQuery.trim()) return orders;
  
  const query = searchQuery.toLowerCase();
  return orders.filter(order => {
    const maker = order.account.maker.toString().toLowerCase();
    const mint = order.account.mint.toString().toLowerCase();
    const currency = parseCurrencyArray(order.account.currency).toLowerCase();
    const pubkey = order.publicKey.toString().toLowerCase();
    
    return maker.includes(query) || 
           mint.includes(query) || 
           currency.includes(query) ||
           pubkey.includes(query);
  });
}