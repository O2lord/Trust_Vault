/**
 * Parse Anchor program errors and return user-friendly messages
 */

export interface ParsedError {
  title: string;
  message: string;
  code?: string;
}

const ERROR_MESSAGES: Record<string, ParsedError> = {
  // Order Pausing Errors
  BuyOrdersPaused: {
    title: "Buy Orders Paused",
    message: "Buy orders are temporarily disabled by the platform administrator. Please try again later.",
    code: "BuyOrdersPaused"
  },
  SellOrdersPaused: {
    title: "Sell Orders Paused",
    message: "Sell orders are temporarily disabled by the platform administrator. Please try again later.",
    code: "SellOrdersPaused"
  },
  WithdrawalsPaused: {
    title: "Withdrawals Paused",
    message: "Withdrawals are paused for this vault by the administrator.",
    code: "WithdrawalsPaused"
  },
  ReservationsPaused: {
    title: "Reservations Paused",
    message: "New reservations are paused for this vault.",
    code: "ReservationsPaused"
  },

  // Insufficient Funds/Tokens
  InsufficientFunds: {
    title: "Insufficient Balance",
    message: "You don't have enough tokens to complete this transaction.",
    code: "InsufficientFunds"
  },
  InsufficientTokens: {
    title: "Insufficient Tokens",
    message: "There aren't enough tokens available in the vault for this reservation.",
    code: "InsufficientTokens"
  },
  InsufficientAmount: {
    title: "Insufficient Amount",
    message: "The amount you're trying to reserve is too low.",
    code: "InsufficientAmount"
  },

  // Validation Errors
  InvalidAmount: {
    title: "Invalid Amount",
    message: "Please enter a valid token amount greater than zero.",
    code: "InvalidAmount"
  },
  InvalidPrice: {
    title: "Invalid Price",
    message: "Please enter a valid price per token.",
    code: "InvalidPrice"
  },
  InvalidCurrency: {
    title: "Invalid Currency",
    message: "Currency code must be exactly 3 characters (e.g., USD, NGN, EUR).",
    code: "InvalidCurrency"
  },
  PaymentInstructionsTooLong: {
    title: "Payment Instructions Too Long",
    message: "Payment instructions must be 100 characters or less.",
    code: "PaymentInstructionsTooLong"
  },
  InvalidPaymentInstructions: {
    title: "Invalid Payment Instructions",
    message: "Please provide payment instructions.",
    code: "InvalidPaymentInstructions"
  },
  InvalidCredentialId: {
    title: "Invalid Credential",
    message: "The Flutterwave credential ID is invalid. It must be between 1 and 64 characters.",
    code: "InvalidCredentialId"
  },

  // Reservation Errors
  ActiveReservationsExist: {
    title: "Active Reservations",
    message: "Cannot modify this order while there are active reservations.",
    code: "ActiveReservationsExist"
  },
  PendingReservationsExist: {
    title: "Pending Reservations",
    message: "Cannot withdraw funds while there are pending reservations.",
    code: "PendingReservationsExist"
  },
  CannotReduceBelowReserved: {
    title: "Cannot Reduce Amount",
    message: "You cannot reduce the order below the amount already reserved.",
    code: "CannotReduceBelowReserved"
  },
  TooManyReservations: {
    title: "Too Many Reservations",
    message: "This order has reached the maximum number of active reservations.",
    code: "TooManyReservations"
  },
  ReservationLimitReached: {
    title: "Reservation Limit Reached",
    message: "You've reached the reservation limit. Please use another order or wait.",
    code: "ReservationLimitReached"
  },
  NoUnreservedTokens: {
    title: "Order Fully Reserved",
    message: "All tokens in this buy order are already reserved.",
    code: "NoUnreservedTokens"
  },
  ReservationNotFound: {
    title: "Reservation Not Found",
    message: "Could not find a reservation matching the provided details.",
    code: "ReservationNotFound"
  },
  ReservationAlreadyProcessed: {
    title: "Already Processed",
    message: "This reservation has already been processed and cannot be modified.",
    code: "ReservationAlreadyProcessed"
  },
  ReservationNotPending: {
    title: "Invalid Reservation Status",
    message: "This reservation is not in pending status.",
    code: "ReservationNotPending"
  },

  // Authorization Errors
  Unauthorized: {
    title: "Unauthorized",
    message: "You don't have permission to perform this action.",
    code: "Unauthorized"
  },
  InvalidMaker: {
    title: "Invalid Maker",
    message: "Only the order creator can perform this action.",
    code: "InvalidMaker"
  },
  InvalidTaker: {
    title: "Invalid Taker",
    message: "This action can only be performed by the reservation holder.",
    code: "InvalidTaker"
  },
  UnauthorizedDisputer: {
    title: "Cannot Dispute",
    message: "Only the buyer or seller can dispute a transaction.",
    code: "UnauthorizedDisputer"
  },
  UnauthorizedResolver: {
    title: "Unauthorized Resolver",
    message: "Only authorized resolvers can resolve disputes.",
    code: "UnauthorizedResolver"
  },

  // Dispute Errors
  CannotDisputeCompletedTransaction: {
    title: "Cannot Dispute",
    message: "You cannot dispute a completed or cancelled transaction.",
    code: "CannotDisputeCompletedTransaction"
  },
  NotDisputed: {
    title: "Not Disputed",
    message: "This transaction is not in disputed status.",
    code: "NotDisputed"
  },

  // Payment Errors
  PaymentNotSent: {
    title: "Payment Not Sent",
    message: "Payment has not been marked as sent yet.",
    code: "PaymentNotSent"
  },
  InvalidPayoutReference: {
    title: "Invalid Payout Reference",
    message: "The provided payout reference is invalid.",
    code: "InvalidPayoutReference"
  },

  // Account Errors
  MissingMakerAta: {
    title: "Missing Token Account",
    message: "Maker's associated token account is missing.",
    code: "MissingMakerAta"
  },
  MissingTakerAta: {
    title: "Missing Token Account",
    message: "Taker's associated token account is missing.",
    code: "MissingTakerAta"
  },
  MissingFeeDestinationAta: {
    title: "Missing Fee Account",
    message: "Fee destination account is required when fee amount is greater than zero.",
    code: "MissingFeeDestinationAta"
  },
  MissingTakerAtaForRefund: {
    title: "Missing Refund Account",
    message: "Taker's account is required for refunds when payout fails.",
    code: "MissingTakerAtaForRefund"
  },
  InvalidMakerAtaAuthority: {
    title: "Invalid Account Authority",
    message: "The provided token account does not belong to the maker.",
    code: "InvalidMakerAtaAuthority"
  },
  InvalidTakerAtaAuthority: {
    title: "Invalid Account Authority",
    message: "The provided token account does not belong to the taker.",
    code: "InvalidTakerAtaAuthority"
  },

  // Validation Errors (continued)
  InvalidTrustExpressType: {
    title: "Invalid Order Type",
    message: "The order type is invalid for this operation.",
    code: "InvalidTrustExpressType"
  },
  InvalidEscrowType: {
    title: "Invalid Escrow Type",
    message: "The escrow type is invalid.",
    code: "InvalidEscrowType"
  },
  InvalidMint: {
    title: "Invalid Token",
    message: "The token mint is invalid.",
    code: "InvalidMint"
  },
  InvalidFeePercentage: {
    title: "Invalid Fee",
    message: "Fee percentage must be between 0 and 1000 basis points (0-10%).",
    code: "InvalidFeePercentage"
  },
  InvalidFeeDestination: {
    title: "Invalid Fee Destination",
    message: "The fee destination is invalid for this reservation.",
    code: "InvalidFeeDestination"
  },

  // System Errors
  ArithmeticOverflow: {
    title: "Calculation Error",
    message: "A mathematical overflow occurred. Please try with a smaller amount.",
    code: "ArithmeticOverflow"
  },
  CalculationError: {
    title: "Calculation Error",
    message: "An error occurred during calculation. Please try again.",
    code: "CalculationError"
  },

  // Withdrawal Errors
  InvalidWithdrawAmount: {
    title: "Invalid Withdrawal",
    message: "The withdrawal amount is invalid.",
    code: "InvalidWithdrawAmount"
  },
  ActiveTokenDepositsExist: {
    title: "Active Deposits",
    message: "Cannot perform this action while there are active token deposits.",
    code: "ActiveTokenDepositsExist"
  },
};

/**
 * Parse an error from Anchor program and return a user-friendly message
 */
export function parseAnchorError(error: unknown): ParsedError {
  // Default error
  const defaultError: ParsedError = {
    title: "Transaction Failed",
    message: "An error occurred while processing your transaction. Please try again.",
  };

  if (!error) return defaultError;

  // Convert error to string for parsing
  const errorString = error instanceof Error ? error.message : String(error);

  // Try to extract error code from various formats
  
  // Format 1: "Error Code: BuyOrdersPaused"
  const errorCodeMatch = errorString.match(/Error Code:\s*(\w+)/i);
  if (errorCodeMatch) {
    const errorCode = errorCodeMatch[1];
    if (ERROR_MESSAGES[errorCode]) {
      return ERROR_MESSAGES[errorCode];
    }
  }

  // Format 2: "custom program error: 0x1234"
  const customErrorMatch = errorString.match(/custom program error:\s*0x([0-9a-fA-F]+)/i);
  if (customErrorMatch) {
    const errorHex = customErrorMatch[1];
    // You can add hex-to-error-code mapping here if needed
  }

  // Format 3: Error name in the string (e.g., "BuyOrdersPaused")
  for (const [code, parsedError] of Object.entries(ERROR_MESSAGES)) {
    if (errorString.includes(code)) {
      return parsedError;
    }
  }

  // Format 4: Common wallet/RPC errors
  if (errorString.includes("User rejected")) {
    return {
      title: "Transaction Cancelled",
      message: "You cancelled the transaction.",
    };
  }

  if (errorString.includes("Insufficient funds") || errorString.includes("insufficient lamports")) {
    return {
      title: "Insufficient SOL",
      message: "You don't have enough SOL to pay for transaction fees.",
    };
  }

  if (errorString.includes("blockhash not found") || errorString.includes("timeout")) {
    return {
      title: "Transaction Timeout",
      message: "The transaction timed out. Please try again.",
    };
  }

  if (errorString.includes("Simulation failed")) {
    return {
      title: "Transaction Failed",
      message: "Transaction simulation failed. Please check your inputs and try again.",
    };
  }

  // Return the original error message if we can't parse it
  return {
    title: defaultError.title,
    message: error instanceof Error ? error.message : defaultError.message,
  };
}

/**
 * Check if an error is a specific Anchor error
 */
export function isAnchorError(error: unknown, errorCode: string): boolean {
  if (!error) return false;
  const errorString = error instanceof Error ? error.message : String(error);
  return errorString.includes(errorCode);
}