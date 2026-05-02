import { PublicKey } from "@solana/web3.js";
import { EventDecoder } from "./eventDecoder.js";

interface LogContext {
  signature?: string;
  accounts?: string[];
  programId?: string;
}

interface TransactionLogs {
  logs: string[];
  signature?: string;
}

interface EventConfig {
  instruction: string;
  eventType: string;
  expectedProgramDataEvent?: string; // ← NEW: which Program data event to expect
  extractRoles: (logs: string[], context: LogContext) => { [key: string]: string | null } | null;
}

interface EventPatterns {
  [key: string]: EventConfig;
}

interface EventData {
  amount?: string;
  fiatAmount?: string;
  currency?: string;
  pricePerToken?: string;
  mintA?: string;
  withdrawAmount?: string;
  feeRefund?: string;
  vaultClosed?: boolean;
  disputeId?: string;
  disputeReason?: string;
  eventType?: string;
  trustVault?: string;
  seller?: string;
  buyer?: string;
  disputer?: string;
  otherParty?: string | null;
  participants?: { [key: string]: string | null };
  addresses?: string[];
  [key: string]: string | number | boolean | undefined | string[] | { [key: string]: string | null } | null;
  /** TRUST EXPRESS */
  maker?: string;
  taker?: string;
  trustExpress?: string;
  payoutDetails?: string | null;
  payoutReference?: string | null;
  success?: boolean;
  message?: string;
  note?: string;
  error?: string;
  paymentMode?: number;
}

interface ParsedEvent {
  type: string;
  data: EventData;
  signature: string;
  timestamp: number;
  trustVault?: string;
  trustExpress?: string;
  participants: { [key: string]: string | null };
  programSource?: 'TRUST_VAULT' | 'TRUST_EXPRESS';  
}

/**
 * Event parser to extract Trust Vault events and participant roles
 */
export class EventParser {
  private eventDecoder: EventDecoder;
  private eventPatterns: EventPatterns;

  constructor() {
    this.eventDecoder = new EventDecoder();

    this.eventPatterns = {
      // Instruction-based event detection
      CreateSellOrder: {
        instruction: "CreateSellOrder",
        eventType: "TrustVaultCreatedEvent",
        extractRoles: (logs: string[], context: LogContext) =>
          this.extractMakerFromTransaction(logs, context, "seller"),
      },

      CreateBuyOrder: {
        instruction: "CreateBuyOrder",
        eventType: "BuyOrderCreatedEvent",
        extractRoles: (logs: string[], context: LogContext) =>
          this.extractMakerFromTransaction(logs, context, "buyer"),
      },

      ReserveTokens: {
        instruction: "ReserveTokens",
        eventType: "TokensReservedEvent",
        extractRoles: (logs: string[], context: LogContext) =>
          this.extractReservationParticipants(logs, context),
      },

      ReserveBuyOrder: {
        instruction: "ReserveBuyOrder",
        eventType: "BuyOrderReservedEvent",
        extractRoles: (logs: string[], context: LogContext) =>
          this.extractReservationParticipants(logs, context),
      },

      MarkPaymentSent: {
        instruction: "MarkPaymentSent",
        eventType: "PaymentSentEvent",
        extractRoles: (logs: string[], context: LogContext) =>
          this.extractPaymentParticipants(logs, context),
      },

      BuyerMarkPaymentSent: {
        instruction: "BuyerMarkPaymentSent",
        eventType: "BuyerPaymentSentEvent",
        extractRoles: (logs: string[], context: LogContext) =>
          this.extractPaymentParticipants(logs, context),
      },

      ConfirmPayment: {
        instruction: "ConfirmPayment",
        eventType: "PaymentConfirmedEvent",
        extractRoles: (logs: string[], context: LogContext) =>
          this.extractPaymentParticipants(logs, context),
      },

      SellerConfirmPayment: {
        instruction: "SellerConfirmPayment",
        eventType: "SellerConfirmsPaymentEvent",
        extractRoles: (logs: string[], context: LogContext) =>
          this.extractPaymentParticipants(logs, context),
      },

      WithdrawToken: {
        instruction: "WithdrawToken",
        eventType: "PartialWithdrawalEvent",
        extractRoles: (logs: string[], context: LogContext) =>
          this.extractWithdrawalParticipants(logs, context),
      },

      CancelOrReduceBuyOrder: {
        instruction: "CancelOrReduceBuyOrder",
        eventType: "BuyOrderReducedEvent",
        extractRoles: (logs: string[], context: LogContext) =>
          this.extractWithdrawalParticipants(logs, context),
      },

      CancelReservation: {
        instruction: "CancelReservation",
        eventType: "ReservationCancelledEvent",
        extractRoles: (logs: string[], context: LogContext) =>
          this.extractCancellationParticipants(logs, context),
      },

      DisputePayment: {
        instruction: "DisputePayment",
        eventType: "DisputeCreatedEvent",
        extractRoles: (logs: string[], context: LogContext) =>
          this.extractDisputeParticipants(logs, context),
      },

      ResolveDispute: {
        instruction: "ResolveDispute",
        eventType: "DisputeResolvedEvent",
        extractRoles: (logs: string[], context: LogContext) =>
          this.extractDisputeParticipants(logs, context),
      },

      UpdatePrice: {
        instruction: "UpdatePrice",
        eventType: "PriceUpdatedEvent",
        extractRoles: (logs: string[], context: LogContext) =>
          this.extractMakerFromTransaction(logs, context, "seller"),
      },

      /** TRUST EXPRESS */
      Make: {
        instruction: "Make",
        eventType: "TrustExpressCreatedEvent",
        extractRoles: (logs: string[], context: LogContext) =>
          this.extractMakerFromTransaction(logs, context, "seller"),
      },

      CreateExpressBuyOrder: {
        instruction: "CreateExpressBuyOrder",
        eventType: "ExpressBuyOrderCreatedEvent",
        extractRoles: (logs: string[], context: LogContext) =>
          this.extractMakerFromTransaction(logs, context, "buyer"),
      },

      CancelOrReduceExpressBuyOrder: {
        instruction: "CancelOrReduceBuyOrder",
        eventType: "ExpressBuyOrderReducedEvent",
        extractRoles: (logs: string[], context: LogContext) =>
          this.extractRefundParticipants(logs, context),
      },

      UpdateExpressOrderPrice: {
        instruction: "UpdatePrice",
        eventType: "ExpressPriceUpdatedEvent",
        extractRoles: (logs: string[], context: LogContext) =>
          this.extractMakerFromTransaction(logs, context, "seller"),
      },

      InstantReserve: {
        instruction: "InstantReserve",
        eventType: "InstantPaymentReservedEvent",
        expectedProgramDataEvent: "InstantPaymentReservedEvent", // ← pinned
        extractRoles: (logs: string[], context: LogContext) =>
          this.extractInstantPaymentParticipants(logs, context),
      },

      ConfirmPayout: {
        instruction: "ConfirmPayout",
        eventType: "InstantPaymentPayoutResultEvent",
        expectedProgramDataEvent: "InstantPaymentPayoutResultEvent", // ← pinned
        extractRoles: (logs: string[], context: LogContext) =>
          this.extractInstantPaymentParticipants(logs, context),
      },

      CreateExpressSell: {
        instruction: "CreateExpressSell",
        eventType: "ExpressSellOrderCreatedEvent",
        expectedProgramDataEvent: "ExpressSellOrderCreatedEvent", // ← pinned
        extractRoles: (logs: string[], context: LogContext) =>
          this.extractMakerFromTransaction(logs, context, "seller"),
      },

      InstantSellReserve: {
        instruction: "InstantSellReserve",
        eventType: "InstantSellReservationCreatedEvent",
        expectedProgramDataEvent: "InstantSellReservationCreatedEvent", // ← pinned
        extractRoles: (logs: string[], context: LogContext) =>
          this.extractInstantSellParticipants(logs, context),
      },

      ConfirmSellPayment: {
        instruction: "ConfirmSellPayment",
        eventType: "InstantSellPaymentResultEvent",
        expectedProgramDataEvent: "InstantSellPaymentResultEvent", // ← pinned
        extractRoles: (logs: string[], context: LogContext) =>
          this.extractInstantSellParticipants(logs, context),
      },
    };
  }

  /**
   * Parse program logs to extract events and participant roles
   */
  parseLogsForEvents(logs: TransactionLogs, context: LogContext): ParsedEvent[] {
    const events: ParsedEvent[] = [];
    const programSource = this.determineProgramSource(context.programId);

    // Detect which instruction is being executed so we know which
    // Program data event to look for when there are multiple in one tx.
    let expectedEventType: string | undefined;
    for (const log of logs.logs) {
      if (!log.includes("Program log: Instruction:")) continue;
      const m = log.match(/Instruction: (\w+)/);
      if (!m) continue;
      const cfg = this.eventPatterns[m[1]];
      if (cfg?.expectedProgramDataEvent) {
        expectedEventType = cfg.expectedProgramDataEvent;
      }
      break;
    }

    // Try to extract the correct event from Program data logs.
    // Pass the expected type so we skip unrelated events emitted in the same tx.
    const programDataEvent = this.extractFromProgramData(logs, context, expectedEventType);
    if (programDataEvent) {
      programDataEvent.programSource = programSource;
      events.push(programDataEvent);
      return events;
    }

    // Fallback: process instruction logs
    for (const log of logs.logs) {
      if (!log.includes("Program log: Instruction:")) continue;

      const instructionMatch = log.match(/Instruction: (\w+)/);
      if (!instructionMatch) continue;

      const instruction = instructionMatch[1];
      const eventConfig = this.eventPatterns[instruction];
      if (!eventConfig) continue;

      try {
        const participants = eventConfig.extractRoles(logs.logs, context);
        if (!participants || Object.keys(participants).length === 0) continue;

        const eventData = this.extractEventData(
          eventConfig.eventType,
          logs.logs,
          context
        );

        const event: ParsedEvent = {
          type: eventConfig.eventType,
          data: {
            ...eventData,
            ...participants,
          },
          signature: context.signature || `temp_${Date.now()}`,
          timestamp: Date.now(),
          trustVault: this.extractTrustVaultAddress(logs.logs, context),
          trustExpress: this.extractTrustExpressAddress(logs.logs, context),
          participants,
          programSource: programSource,
        };

        events.push(event);
      } catch (error) {
        console.error(`EventParser: Error processing ${instruction}:`, error);
      }
    }

    return events;
  }

  private determineProgramSource(programId?: string): 'TRUST_VAULT' | 'TRUST_EXPRESS' {
    if (programId === process.env.TRUST_EXPRESS_PROGRAM_ID) {
      return 'TRUST_EXPRESS';
    }
    return 'TRUST_VAULT';
  }

  /**
   * Extract event data from program data logs.
   *
   * FIX: Instead of stopping at the FIRST Program data log, we now iterate
   * ALL Program data logs in the transaction and return the first one whose
   * decoded eventType matches `expectedEventType` (when provided).
   *
   * Without this fix, transactions that emit multiple Program data logs
   * (e.g. ValidatorVoteExecutedEvent + InstantSellReservationCreatedEvent)
   * would always decode whichever event happened to appear first in the logs,
   * causing the wrong handler to fire and the sell reservation to be silently
   * dropped.
   *
   * FIX 2: Each individual decodeProgramData call is now wrapped in its own
   * try/catch. A RangeError (buffer too small / offset out of range) from one
   * Program data log — e.g. a ValidatorVoteExecutedEvent whose on-chain layout
   * doesn't match the decoder's expectation — no longer aborts the entire loop.
   * We log a warning and continue to the next log entry so that the real event
   * we care about can still be decoded.
   */
  private extractFromProgramData(
    logs: TransactionLogs,
    context: LogContext,
    expectedEventType?: string
  ): ParsedEvent | null {
    for (const log of logs.logs) {
      if (!log.includes("Program data:")) continue;

      const dataMatch = log.match(/Program data: (.+)/);
      if (!dataMatch) continue;

      const rawData = dataMatch[1].trim();

      let decodedEvent: ReturnType<EventDecoder["decodeProgramData"]>;
      try {
        decodedEvent = this.eventDecoder.decodeProgramData(rawData);
      } catch (decodeError) {
        // A RangeError here means the buffer is shorter than the decoder
        // expects — typically a schema-version mismatch (e.g. the on-chain
        // ValidatorVoteExecutedEvent struct changed) or an unrelated event
        // type whose discriminator accidentally matched.  Log a warning and
        // move on to the next Program data log rather than letting the
        // exception propagate and kill the whole transaction parse.
        console.warn(
          `EventDecoder: Error decoding program data (skipping log entry):`,
          decodeError instanceof Error ? decodeError.message : decodeError
        );
        continue;
      }

      if (!decodedEvent) continue;

      // If the caller told us which event type to expect, skip any others.
      // This handles transactions that emit several Program data logs —
      // we must not let an unrelated event (e.g. ValidatorVoteCastEvent)
      // shadow the event we actually care about.
      if (expectedEventType && decodedEvent.eventType !== expectedEventType) {
        continue;
      }

      const event: ParsedEvent = {
        type: decodedEvent.eventType,
        data: { ...decodedEvent },
        signature: context.signature || `temp_${Date.now()}`,
        timestamp: Date.now(),
        trustVault: decodedEvent.trustVault || 'unknown',
        trustExpress: decodedEvent.trustExpress,
        participants: decodedEvent.participants || {},
        // programSource is set by the caller (parseLogsForEvents)
      };

      return event;
    }

    return null;
  }

  /**
   * Extract maker (creator) from transaction - enhanced with program data fallback
   */
  private extractMakerFromTransaction(logs: string[], context: LogContext, role: string): { [key: string]: string } | null {
    // First try to get from program data if available
    const programDataEvent = this.extractFromProgramData({ logs }, context);
    if (programDataEvent && programDataEvent.participants[role]) {
      return { [role]: programDataEvent.participants[role] as string };
    }

    // Fallback to original methods
    const rolePatterns = [
      new RegExp(`${role}[:\\s]+([A-Za-z0-9]{32,44})`, "i"),
      new RegExp(`Program\\s+log:\\s+${role}[:\\s]+([A-Za-z0-9]{32,44})`, "i"),
      new RegExp(`${role}.*?([A-Za-z0-9]{32,44})`, "i"),
    ];

    for (const log of logs) {
      for (const pattern of rolePatterns) {
        const match = log.match(pattern);
        if (match && this.isValidSolanaAddress(match[1])) {
          const result: { [key: string]: string } = {};
          result[role] = match[1];
          return result;
        }
      }
    }

    // Method 2: Look for signer patterns
    const signerPatterns = [
      /signer[:\s]+([A-Za-z0-9]{32,44})/i,
      /authority[:\s]+([A-Za-z0-9]{32,44})/i,
      /Program\s+log:\s+signer[:\s]+([A-Za-z0-9]{32,44})/i,
    ];

    for (const log of logs) {
      for (const pattern of signerPatterns) {
        const match = log.match(pattern);
        if (match && this.isValidSolanaAddress(match[1])) {
          const result: { [key: string]: string } = {};
          result[role] = match[1];
          return result;
        }
      }
    }

    // Method 3: Extract valid addresses but filter out known system addresses
    const addressPattern = /([A-Za-z0-9]{32,44})/g;
    const foundAddresses: string[] = [];
    const systemAddresses = [
      "ComputeBudget111111111111111111111111111111",
      "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
      "11111111111111111111111111111111",
      "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
    ];

    for (const log of logs) {
      const matches = log.match(addressPattern);
      if (matches) {
        for (const match of matches) {
          if (
            this.isValidSolanaAddress(match) &&
            !systemAddresses.includes(match)
          ) {
            foundAddresses.push(match);
          }
        }
      }
    }

    if (foundAddresses.length > 0) {
      const result: { [key: string]: string } = {};
      result[role] = foundAddresses[0];
      return result;
    }

    // Method 4: Fallback to transaction context
    return this.extractFromTransactionContext(context, role);
  }

  /**
   * Extract participants from reservation transactions
   */
  private extractReservationParticipants(logs: string[], context: LogContext): { [key: string]: string } {
    // First try program data
    const programDataEvent = this.extractFromProgramData({ logs }, context);
    if (programDataEvent && programDataEvent.participants) {
      return programDataEvent.participants as { [key: string]: string };
    }

    const participants: { [key: string]: string } = {};

    const participantPatterns = {
      seller: [
        /seller[:\s]+([A-Za-z0-9]{32,44})/i,
        /maker[:\s]+([A-Za-z0-9]{32,44})/i,
        /Program\s+log:\s+seller[:\s]+([A-Za-z0-9]{32,44})/i,
      ],
      buyer: [
        /buyer[:\s]+([A-Za-z0-9]{32,44})/i,
        /taker[:\s]+([A-Za-z0-9]{32,44})/i,
        /Program\s+log:\s+buyer[:\s]+([A-Za-z0-9]{32,44})/i,
      ],
    };

    for (const log of logs) {
      for (const pattern of participantPatterns.seller) {
        const match = log.match(pattern);
        if (match && this.isValidSolanaAddress(match[1])) {
          participants.seller = match[1];
          break;
        }
      }

      for (const pattern of participantPatterns.buyer) {
        const match = log.match(pattern);
        if (match && this.isValidSolanaAddress(match[1])) {
          participants.buyer = match[1];
          break;
        }
      }
    }

    if (!participants.seller || !participants.buyer) {
      const contextParticipants = this.extractFromTransactionContext(
        context,
        "both"
      );
      return { ...contextParticipants, ...participants };
    }

    return participants;
  }

  /**
   * Extract participants from payment transactions
   */
  private extractPaymentParticipants(logs: string[], context: LogContext): { [key: string]: string } {
    return this.extractReservationParticipants(logs, context);
  }

  /**
   * Enhanced withdraw participant extraction
   */
  private extractWithdrawalParticipants(logs: string[], context: LogContext): { [key: string]: string } {
    // First try program data
    const programDataEvent = this.extractFromProgramData({ logs }, context);
    if (programDataEvent && programDataEvent.participants) {
      return programDataEvent.participants as { [key: string]: string };
    }

    const withdrawPatterns = [
      /withdraw.*?to[:\s]+([A-Za-z0-9]{32,44})/i,
      /recipient[:\s]+([A-Za-z0-9]{32,44})/i,
      /withdraw.*?recipient[:\s]+([A-Za-z0-9]{32,44})/i,
      /seller[:\s]+([A-Za-z0-9]{32,44})/i,
      /Program\s+log:\s+withdraw.*?([A-Za-z0-9]{32,44})/i,
    ];

    for (const log of logs) {
      for (const pattern of withdrawPatterns) {
        const match = log.match(pattern);
        if (match && this.isValidSolanaAddress(match[1])) {
          return { seller: match[1] };
        }
      }
    }

    const signerPatterns = [
      /signer[:\s]+([A-Za-z0-9]{32,44})/i,
      /authority[:\s]+([A-Za-z0-9]{32,44})/i,
      /Program\s+log:\s+signer[:\s]+([A-Za-z0-9]{32,44})/i,
    ];

    for (const log of logs) {
      for (const pattern of signerPatterns) {
        const match = log.match(pattern);
        if (match && this.isValidSolanaAddress(match[1])) {
          return { seller: match[1] };
        }
      }
    }

    const addressPattern = /([A-Za-z0-9]{32,44})/g;
    const foundAddresses: string[] = [];
    const systemAddresses = [
      "ComputeBudget111111111111111111111111111111",
      "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
      "11111111111111111111111111111111",
      "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
    ];

    for (const log of logs) {
      const matches = log.match(addressPattern);
      if (matches) {
        for (const match of matches) {
          if (
            this.isValidSolanaAddress(match) &&
            !systemAddresses.includes(match)
          ) {
            foundAddresses.push(match);
          }
        }
      }
    }

    if (foundAddresses.length > 0) {
      return { seller: foundAddresses[0] };
    }

    const contextResult = this.extractFromTransactionContext(context, "seller");
    if (contextResult.seller) {
      return contextResult;
    }

    return { seller: "unknown_seller" };
  }

  private extractInstantSellParticipants(logs: string[], context: LogContext): { [key: string]: string } {
    const programDataEvent = this.extractFromProgramData({ logs }, context);
    if (programDataEvent && programDataEvent.participants) {
      return programDataEvent.participants;
    }

    const participants: { [key: string]: string } = {};

    const participantPatterns = {
      seller: [
        /seller[:\s]+([A-Za-z0-9]{32,44})/i,
        /maker[:\s]+([A-Za-z0-9]{32,44})/i,
      ],
      buyer: [
        /buyer[:\s]+([A-Za-z0-9]{32,44})/i,
        /taker[:\s]+([A-Za-z0-9]{32,44})/i,
      ],
    };

    for (const log of logs) {
      for (const pattern of participantPatterns.seller) {
        const match = log.match(pattern);
        if (match && this.isValidSolanaAddress(match[1])) {
          participants.seller = match[1];
          participants.maker = match[1];
          break;
        }
      }

      for (const pattern of participantPatterns.buyer) {
        const match = log.match(pattern);
        if (match && this.isValidSolanaAddress(match[1])) {
          participants.buyer = match[1];
          participants.taker = match[1];
          break;
        }
      }
    }

    return participants;
  }

  /**
   * Extract participants from instant payment transactions
   */
  private extractInstantPaymentParticipants(logs: string[], context: LogContext): { [key: string]: string } {
    const programDataEvent = this.extractFromProgramData({ logs }, context);
    if (programDataEvent && programDataEvent.participants) {
      return programDataEvent.participants;
    }

    const participants: { [key: string]: string } = {};

    const participantPatterns = {
      maker: [
        /maker[:\s]+([A-Za-z0-9]{32,44})/i,
        /liquidity.*?provider[:\s]+([A-Za-z0-9]{32,44})/i,
        /platform[:\s]+([A-Za-z0-9]{32,44})/i,
      ],
      taker: [
        /taker[:\s]+([A-Za-z0-9]{32,44})/i,
        /user[:\s]+([A-Za-z0-9]{32,44})/i,
      ],
    };

    for (const log of logs) {
      for (const pattern of participantPatterns.maker) {
        const match = log.match(pattern);
        if (match && this.isValidSolanaAddress(match[1])) {
          participants.maker = match[1];
          break;
        }
      }

      for (const pattern of participantPatterns.taker) {
        const match = log.match(pattern);
        if (match && this.isValidSolanaAddress(match[1])) {
          participants.taker = match[1];
          participants.user = match[1];
          break;
        }
      }
    }

    return participants;
  }

  /**
   * Enhanced refund participant extraction
   */
  private extractRefundParticipants(logs: string[], context: LogContext): { [key: string]: string } {
    const programDataEvent = this.extractFromProgramData({ logs }, context);
    if (programDataEvent && programDataEvent.participants) {
      return programDataEvent.participants;
    }

    const refundPatterns = [
      /refund.*?to[:\s]+([A-Za-z0-9]{32,44})/i,
      /recipient[:\s]+([A-Za-z0-9]{32,44})/i,
      /refund.*?recipient[:\s]+([A-Za-z0-9]{32,44})/i,
      /seller[:\s]+([A-Za-z0-9]{32,44})/i,
      /Program\s+log:\s+refund.*?([A-Za-z0-9]{32,44})/i,
    ];

    for (const log of logs) {
      for (const pattern of refundPatterns) {
        const match = log.match(pattern);
        if (match && this.isValidSolanaAddress(match[1])) {
          return { seller: match[1] };
        }
      }
    }

    const signerPatterns = [
      /signer[:\s]+([A-Za-z0-9]{32,44})/i,
      /authority[:\s]+([A-Za-z0-9]{32,44})/i,
      /Program\s+log:\s+signer[:\s]+([A-Za-z0-9]{32,44})/i,
    ];

    for (const log of logs) {
      for (const pattern of signerPatterns) {
        const match = log.match(pattern);
        if (match && this.isValidSolanaAddress(match[1])) {
          return { seller: match[1] };
        }
      }
    }

    const addressPattern = /([A-Za-z0-9]{32,44})/g;
    const foundAddresses: string[] = [];
    const systemAddresses = [
      "ComputeBudget111111111111111111111111111111",
      "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
      "11111111111111111111111111111111",
      "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
    ];

    for (const log of logs) {
      const matches = log.match(addressPattern);
      if (matches) {
        for (const match of matches) {
          if (
            this.isValidSolanaAddress(match) &&
            !systemAddresses.includes(match)
          ) {
            foundAddresses.push(match);
          }
        }
      }
    }

    if (foundAddresses.length > 0) {
      return { seller: foundAddresses[0] };
    }

    const contextResult = this.extractFromTransactionContext(context, "seller");
    if (contextResult.seller) {
      return contextResult;
    }

    return { seller: "unknown_seller" };
  }

  /**
   * Extract cancellation participants
   */
  private extractCancellationParticipants(logs: string[], context: LogContext): { [key: string]: string } {
    return this.extractReservationParticipants(logs, context);
  }

  /**
   * Extract dispute participants
   */
  private extractDisputeParticipants(logs: string[], context: LogContext): { [key: string]: string } {
    const programDataEvent = this.extractFromProgramData({ logs }, context);
    if (programDataEvent && programDataEvent.participants) {
      return programDataEvent.participants as { [key: string]: string };
    }
    return this.extractReservationParticipants(logs, context);
  }

  /**
   * Extract event-specific data from logs
   */
  private extractEventData(eventType: string, logs: string[], context: LogContext): EventData {
    const data: EventData = {};

    for (const log of logs) {
      const amountMatch = log.match(/amount[:\s]+(\d+)/i);
      if (amountMatch) {
        data.amount = amountMatch[1];
      }

      const fiatMatch = log.match(/fiat[_\s]?amount[:\s]+(\d+)/i);
      if (fiatMatch) {
        data.fiatAmount = fiatMatch[1];
      }

      const currencyMatch = log.match(/currency[:\s]+([A-Z]{3})/i);
      if (currencyMatch) {
        data.currency = currencyMatch[1];
      }

      const priceMatch = log.match(/price[:\s]+(\d+)/i);
      if (priceMatch) {
        data.pricePerToken = priceMatch[1];
      }

      const mintMatch = log.match(/mint[:\s]+([A-Za-z0-9]{32,44})/i);
      if (mintMatch) {
        data.mintA = mintMatch[1];
      }
    }

    switch (eventType) {
      case "WithdrawProcessedEvent":
        const withdrawMatch = logs
          .join(" ")
          .match(/Withdrawal Amount: (\d+), Fee Refund: (\d+)/);
        if (withdrawMatch) {
          data.withdrawAmount = (parseInt(withdrawMatch[1]) / 1e9).toFixed(6);
          data.feeRefund = (parseInt(withdrawMatch[2]) / 1e9).toFixed(6);
          data.vaultClosed = logs.some(
            (log) =>
              log.includes("Closing trust_vault") ||
              log.includes("TrustVault closed")
          );
        }
        break;

      case "DisputeCreatedEvent":
        const disputeIdMatch = logs
          .join(" ")
          .match(/dispute.*?id[:\s]+([A-Z0-9]+)/i);
        if (disputeIdMatch) {
          data.disputeId = disputeIdMatch[1];
        }

        const reasonMatch = logs.join(" ").match(/reason[:\s]+([^,\n]+)/i);
        if (reasonMatch) {
          data.disputeReason = reasonMatch[1].trim();
        }
        break;
    }

    return data;
  }

  /**
   * Extract trust vault address from logs or context
   */
  private extractTrustVaultAddress(logs: string[], context: LogContext): string {
    for (const log of logs) {
      const vaultMatch = log.match(/trust.*?vault[:\s]+([A-Za-z0-9]{32,44})/i);
      if (vaultMatch) {
        return vaultMatch[1];
      }
    }

    return context.signature
      ? `vault_${context.signature.substring(0, 8)}`
      : `vault_${Date.now().toString().substring(0, 8)}`;
  }

  /**
   * Validate if a string is a valid Solana address
   */
  private isValidSolanaAddress(address: string): boolean {
    try {
      if (!address || address.length < 32 || address.length > 44) {
        return false;
      }

      const base58Pattern = /^[A-HJ-NP-Za-km-z1-9]+$/;
      if (!base58Pattern.test(address)) {
        return false;
      }

      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }

  /** TRUST EXPRESS */

  /**
   * Extract trust express address from logs or context
   */
  private extractTrustExpressAddress(logs: string[], context: LogContext): string {
    for (const log of logs) {
      const vaultMatch = log.match(/trust.*?express[:\s]+([A-Za-z0-9]{32,44})/i);
      if (vaultMatch) {
        return vaultMatch[1];
      }
    }

    return context.signature
      ? `vault_${context.signature.substring(0, 8)}`
      : `vault_${Date.now().toString().substring(-8)}`;
  }

  /**
   * Extract from transaction context as a last resort
   */
  private extractFromTransactionContext(context: LogContext, role: string): { [key: string]: string } {
    const result: { [key: string]: string } = {};

    if (context.accounts && context.accounts.length > 0) {
      if (role === "seller" || role === "maker") {
        result[role] = context.accounts[0];
      } else if (role === "buyer" || role === "taker") {
        result[role] = context.accounts.length > 1 ? context.accounts[1] : context.accounts[0];
      } else if (role === "both") {
        if (context.accounts.length >= 2) {
          result.seller = context.accounts[0];
          result.buyer = context.accounts[1];
        } else if (context.accounts.length === 1) {
          result.seller = context.accounts[0];
        }
      }
    }

    return result;
  }
}