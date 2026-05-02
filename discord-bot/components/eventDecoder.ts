import { PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";

interface EventDiscriminators {
  [key: string]: number[];
}

interface DecodedEvent {
  eventType: string;
  trustVault?: string;
  participants?: { [key: string]: string };
  maker?: string;
  buyer?: string;
  taker?: string;
  seller?: string;
  amount?: string;
  fiatAmount?: string;
  feeAmount?: string;
  currency?: string;
  oldPrice?: string;
  newPrice?: string;
  mint?: string;
  pricePerToken?: string;
  paymentInstructions?: string;
  originalAmount?: string;
  newAmount?: string;
  timestamp?: string;
  withdrawalAmount?: string;
  remainingAmount?: string;
  transferAmount?: string;
  cancelledBy?: string;
  feePercentage?: number;
  feeDestination?: string;
  reservationIndex?: number;
  disputer?: string;
  disputerRole?: string;
  otherPartyAddress?: string;
  reason?: string;
  disputeId?: string;
  resolver?: string;
  resolution?: number;
  resolutionReason?: string;
  trustVaultType?: number;
  oldPriceFormatted?: string;
  newPriceFormatted?: string;
  amountFormatted?: string;
  pricePerTokenFormatted?: string;
  fiatAmountFormatted?: string;
  feeAmountFormatted?: string;
  withdrawalAmountFormatted?: string;
  remainingAmountFormatted?: string;
  addresses?: string[];
  note?: string;
  error?: string;
  /** Trust Express */
  trustExpress?: string;
  payoutDetails?: string | null;
  payoutReference?: string | null;
  success?: boolean;
  message?: string;
  paymentMode?: number;
}

interface AddressInfo {
  address: string;
  offset: number;
  type: string;
}

interface Participants {
  [role: string]: string;
}

/**
 * Decodes Solana program event data from base64 encoded program data
 * Supports all Trust Vault event types
 */
export class EventDecoder {
  private eventDiscriminators: EventDiscriminators;

  constructor() {
    this.eventDiscriminators = {
      TrustVaultCreatedEvent: [51, 31, 254, 131, 70, 255, 70, 238],
      TokensReservedEvent: [11, 183, 67, 38, 218, 42, 142, 149],
      ReservationCancelledEvent: [202, 53, 92, 233, 242, 40, 92, 225],
      PaymentSentEvent: [41, 249, 146, 133, 211, 92, 159, 46],
      PaymentConfirmedEvent: [162, 217, 241, 162, 243, 91, 228, 186],
      PartialWithdrawalEvent: [145, 236, 133, 111, 56, 164, 255, 176],
      TrustVaultClosedEvent: [9, 42, 33, 57, 62, 220, 68, 211],
      PriceUpdatedEvent: [217, 171, 222, 24, 64, 152, 217, 36],
      BuyOrderCreatedEvent: [158, 4, 42, 74, 250, 125, 66, 173],
      BuyOrderCancelledEvent: [118, 145, 69, 220, 68, 112, 48, 144],
      BuyOrderReducedEvent: [250, 72, 155, 121, 173, 162, 112, 178],
      BuyOrderReservedEvent: [96, 226, 145, 32, 118, 16, 55, 64],
      BuyerPaymentSentEvent: [93, 112, 150, 57, 70, 119, 112, 207],
      SellerConfirmsPaymentEvent: [9, 180, 78, 60, 40, 86, 128, 104],
      DisputeCreatedEvent: [89, 162, 48, 158, 30, 116, 145, 247],
      DisputeResolvedEvent: [152, 37, 98, 245, 229, 39, 150, 78],
      /** Trust Express */
      ExpressPriceUpdatedEvent: [ 136, 128, 33, 209, 231, 46, 245, 5 ],
      ExpressBuyOrderReducedEvent: [ 108, 101, 248, 185, 162, 5, 179, 33 ],
      ExpressBuyOrderCancelledEvent: [ 117, 193, 185, 13, 45, 46, 116, 139 ],
      ExpressBuyOrderCreatedEvent:[ 188, 250, 135, 197, 56, 135, 220, 82 ],
      InstantPaymentReservedEvent: [ 1, 110, 251, 231, 168, 10, 216, 190 ],
      InstantPaymentPayoutResultEvent: [ 114, 61, 126, 78, 83, 230, 103, 231 ],
      InstantSellReservationCreatedEvent: [65, 196, 145, 144, 214, 136, 85, 139],
      InstantSellPaymentResultEvent: [242, 224, 155, 109, 131, 121, 91, 134],
      ExpressSellOrderCreatedEvent: [71, 107, 238, 113, 181, 139, 174, 53],
      ValidatorVoteExecutedEvent: [42, 193, 150, 227, 217, 85, 224, 208],
      ExpressClosedEvent: [4, 0, 45, 30, 70, 31, 156, 161],
      ValidatorVoteCastEvent: [241, 101, 64, 163, 26, 185, 154, 33],
    };
  }

  /**
   * Decode program data to extract event information
   */
  decodeProgramData(programDataBase64: string): DecodedEvent | null {
    try {
      const buffer = Buffer.from(programDataBase64, "base64");

      const eventType = this.identifyEventType(buffer);
      if (!eventType) {
        return null;
      }

      switch (eventType) {
        // Trust Vault events
        case "TrustVaultCreatedEvent":
          return this.decodeTrustVaultCreatedEvent(buffer);
        case "TokensReservedEvent":
          return this.decodeTokensReservedEvent(buffer);
        case "ReservationCancelledEvent":
          return this.decodeReservationCancelledEvent(buffer);
        case "PaymentSentEvent":
          return this.decodePaymentSentEvent(buffer);
        case "PaymentConfirmedEvent":
          return this.decodePaymentConfirmedEvent(buffer);
        case "PartialWithdrawalEvent":
          return this.decodePartialWithdrawalEvent(buffer);
        case "TrustVaultClosedEvent":
          return this.decodeTrustVaultClosedEvent(buffer);
        case "PriceUpdatedEvent":
          return this.decodePriceUpdatedEvent(buffer);
        case "BuyOrderCreatedEvent":
          return this.decodeBuyOrderCreatedEvent(buffer);
        case "BuyOrderCancelledEvent":
          return this.decodeBuyOrderCancelledEvent(buffer);
        case "BuyOrderReducedEvent":
          return this.decodeBuyOrderReducedEvent(buffer);
        case "BuyOrderReservedEvent":
          return this.decodeBuyOrderReservedEvent(buffer);
        case "BuyerPaymentSentEvent":
          return this.decodeBuyerPaymentSentEvent(buffer);
        case "SellerConfirmsPaymentEvent":
          return this.decodeSellerConfirmsPaymentEvent(buffer);
        case "DisputeCreatedEvent":
          return this.decodeDisputeCreatedEvent(buffer);
        case "DisputeResolvedEvent":
          return this.decodeDisputeResolvedEvent(buffer);
        
        // Trust Express events
        case "ExpressPriceUpdatedEvent":
          return this.decodeExpressPriceUpdatedEvent(buffer);
        case "ExpressBuyOrderReducedEvent":
          return this.decodeExpressBuyOrderReducedEvent(buffer);
        case "ExpressBuyOrderCancelledEvent":
          return this.decodeExpressBuyOrderCancelledEvent(buffer);
        case "ExpressBuyOrderCreatedEvent":
          return this.decodeExpressBuyOrderCreatedEvent(buffer);
        case "InstantPaymentReservedEvent":
          return this.decodeInstantPaymentReservedEvent(buffer);
        case "InstantPaymentPayoutResultEvent":
          return this.decodeInstantPaymentPayoutResultEvent(buffer);
        case "InstantSellReservationCreatedEvent":
          return this.decodeInstantSellReservationCreatedEvent(buffer);
        case "InstantSellPaymentResultEvent":
          return this.decodeInstantSellPaymentResultEvent(buffer);
        case "ExpressSellOrderCreatedEvent":
          return this.decodeExpressSellOrderCreatedEvent(buffer);
        case "ValidatorVoteExecutedEvent":
          return this.decodeValidatorVoteExecutedEvent(buffer);
        case "ExpressClosedEvent":
          return this.decodeExpressClosedEvent(buffer);
        case "ValidatorVoteCastEvent":
          return null; // informational only — no action needed
        
        default:
          return null;
      }
    } catch (error) {
      console.error("Error decoding program data:", error);
      return null;
    }
  }

  /**
   * Identify event type from buffer discriminator
   */
  private identifyEventType(buffer: Buffer): string | null {
    if (buffer.length < 8) {
      return null;
    }

    const discriminator = Array.from(buffer.slice(0, 8));

    for (const [eventType, expectedDiscriminator] of Object.entries(
      this.eventDiscriminators
    )) {
      if (this.arraysEqual(discriminator, expectedDiscriminator)) {
        return eventType;
      }
    }

    return null;
  }

  /**
   * Helper function to compare two arrays
   */
  private arraysEqual(a: number[], b: number[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  /**
   * Decode TrustVaultCreatedEvent from buffer
   */
  private decodeTrustVaultCreatedEvent(buffer: Buffer): DecodedEvent | null {
    try {
      let offset = 8;

      const trustVault = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const maker = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const mint = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const amount = buffer.readBigUInt64LE(offset);
      offset += 8;

      const feePercentage = buffer.readUInt16LE(offset);
      offset += 2;

      const feeDestination = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const pricePerToken = buffer.readBigUInt64LE(offset);
      offset += 8;

      const currencyLength = buffer.readUInt32LE(offset);
      offset += 4;

      const currency = buffer
        .slice(offset, offset + currencyLength)
        .toString("utf8");

      return {
        eventType: "TrustVaultCreatedEvent",
        trustVault: trustVault.toString(),
        maker: maker.toString(),
        mint: mint.toString(),
        amount: amount.toString(),
        feePercentage,
        feeDestination: feeDestination.toString(),
        pricePerToken: pricePerToken.toString(),
        currency,
        amountFormatted: (Number(amount) / 1e9).toFixed(2),
        pricePerTokenFormatted: (Number(pricePerToken) / 1e9).toFixed(2),
        participants: { seller: maker.toString() },
      };
    } catch (error) {
      console.error(
        "❌ EventDecoder: Error decoding TrustVaultCreatedEvent:",
        error
      );
      return null;
    }
  }

  /**
   * Decode TokensReservedEvent from buffer
   */
  private decodeTokensReservedEvent(buffer: Buffer): DecodedEvent | null {
    try {
      let offset = 8;

      if (buffer.length < offset + 32 + 32 + 32 + 8 + 8 + 4) {
        return this.createGenericDecoding(buffer, "TokensReservedEvent");
      }

      const trustVault = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const maker = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const taker = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const amount = buffer.readBigUInt64LE(offset);
      offset += 8;

      const fiatAmount = buffer.readBigUInt64LE(offset);
      offset += 8;

      const currencyLength = buffer.readUInt32LE(offset);
      offset += 4;

      if (buffer.length < offset + currencyLength) {
        return {
          eventType: "TokensReservedEvent",
          trustVault: trustVault.toString(),
          maker: maker.toString(),
          taker: taker.toString(),
          amount: amount.toString(),
          fiatAmount: fiatAmount.toString(),
          currency: "unknown",
          amountFormatted: (Number(amount) / 1e9).toLocaleString(),
          fiatAmountFormatted: Number(fiatAmount).toLocaleString(),
          participants: { seller: maker.toString(), buyer: taker.toString() },
        };
      }

      const currency = buffer
        .slice(offset, offset + currencyLength)
        .toString("utf8");

      return {
        eventType: "TokensReservedEvent",
        trustVault: trustVault.toString(),
        maker: maker.toString(),
        taker: taker.toString(),
        amount: amount.toString(),
        fiatAmount: fiatAmount.toString(),
        currency,
        amountFormatted: (Number(amount) / 1e9).toLocaleString(),
        fiatAmountFormatted: Number(fiatAmount).toLocaleString(),
        participants: { seller: maker.toString(), buyer: taker.toString() },
      };
    } catch (error) {
      console.error(
        "❌ EventDecoder: Error decoding TokensReservedEvent:",
        error
      );
      return this.createGenericDecoding(buffer, "TokensReservedEvent");
    }
  }

  /**
   * Decode ReservationCancelledEvent from buffer
   */
  private decodeReservationCancelledEvent(buffer: Buffer): DecodedEvent | null {
    try {
      let offset = 8;

      if (buffer.length < 112) {
        return this.createGenericDecoding(buffer, "ReservationCancelledEvent");
      }

      const trustVault = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const maker = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const taker = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const amount = buffer.readBigUInt64LE(offset);
      offset += 8;

      if (buffer.length < offset + 32) {
        return {
          eventType: "ReservationCancelledEvent",
          trustVault: trustVault.toString(),
          maker: maker.toString(),
          taker: taker.toString(),
          amount: amount.toString(),
          cancelledBy: "unknown",
          amountFormatted: (Number(amount) / 1e9).toFixed(2),
          participants: {
            seller: maker.toString(),
            buyer: taker.toString(),
            canceller: "unknown",
          },
        };
      }

      const cancelledBy = new PublicKey(buffer.slice(offset, offset + 32));

      return {
        eventType: "ReservationCancelledEvent",
        trustVault: trustVault.toString(),
        maker: maker.toString(),
        taker: taker.toString(),
        amount: amount.toString(),
        cancelledBy: cancelledBy.toString(),
        amountFormatted: (Number(amount) / 1e9).toFixed(6),
        participants: {
          seller: maker.toString(),
          buyer: taker.toString(),
          canceller: cancelledBy.toString(),
        },
      };
    } catch (error) {
      console.error(
        "❌ EventDecoder: Error decoding ReservationCancelledEvent:",
        error
      );
      return this.createGenericDecoding(buffer, "ReservationCancelledEvent");
    }
  }

  /**
   * Decode PaymentSentEvent from buffer
   */
  private decodePaymentSentEvent(buffer: Buffer): DecodedEvent | null {
    try {
      let offset = 8;

      if (buffer.length < offset + 32 + 32 + 32 + 8 + 8 + 8 + 4) {
        return this.createGenericDecoding(buffer, "PaymentSentEvent");
      }

      const trustVault = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const maker = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const taker = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const amount = buffer.readBigUInt64LE(offset);
      offset += 8;

      const fiatAmount = buffer.readBigUInt64LE(offset);
      offset += 8;

      const feeAmount = buffer.readBigUInt64LE(offset);
      offset += 8;

      if (buffer.length < offset + 4) {
        return {
          eventType: "PaymentSentEvent",
          trustVault: trustVault.toString(),
          maker: maker.toString(),
          taker: taker.toString(),
          amount: amount.toString(),
          fiatAmount: fiatAmount.toString(),
          feeAmount: feeAmount.toString(),
          currency: "unknown",
          amountFormatted: (Number(amount) / 1e9).toFixed(2),
          fiatAmountFormatted: Number(fiatAmount).toLocaleString(),
          participants: { seller: maker.toString(), buyer: taker.toString() },
        };
      }

      const currencyLength = buffer.readUInt32LE(offset);
      offset += 4;

      if (buffer.length < offset + currencyLength) {
        return {
          eventType: "PaymentSentEvent",
          trustVault: trustVault.toString(),
          maker: maker.toString(),
          taker: taker.toString(),
          amount: amount.toString(),
          fiatAmount: fiatAmount.toString(),
          feeAmount: feeAmount.toString(),
          currency: "unknown",
          amountFormatted: (Number(amount) / 1e9).toFixed(2),
          fiatAmountFormatted: Number(fiatAmount).toLocaleString(),
          participants: { seller: maker.toString(), buyer: taker.toString() },
        };
      }

      const currency = buffer
        .slice(offset, offset + currencyLength)
        .toString("utf8");
      offset += currencyLength;

      let timestamp: string | null = null;
      if (buffer.length >= offset + 8) {
        timestamp = buffer.readBigInt64LE(offset).toString();
      }

      return {
        eventType: "PaymentSentEvent",
        trustVault: trustVault.toString(),
        maker: maker.toString(),
        taker: taker.toString(),
        amount: amount.toString(),
        fiatAmount: fiatAmount.toString(),
        feeAmount: feeAmount.toString(),
        currency,
        timestamp: timestamp || undefined,
        amountFormatted: (Number(amount) / 1e9).toFixed(2),
        fiatAmountFormatted: Number(fiatAmount).toLocaleString(),
        participants: { seller: maker.toString(), buyer: taker.toString() },
      };
    } catch (error) {
      console.error("❌ EventDecoder: Error decoding PaymentSentEvent:", error);
      return this.createGenericDecoding(buffer, "PaymentSentEvent");
    }
  }

  /**
   * Decode PaymentConfirmedEvent from buffer
   */
  private decodePaymentConfirmedEvent(buffer: Buffer): DecodedEvent | null {
    try {
      let offset = 8;

      const trustVault = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const maker = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const taker = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const amount = buffer.readBigUInt64LE(offset);
      offset += 8;

      const feeAmount = buffer.readBigUInt64LE(offset);
      offset += 8;

      const fiatAmount = buffer.readBigUInt64LE(offset);
      offset += 8;

      const currencyLength = buffer.readUInt32LE(offset);
      offset += 4;

      const currency = buffer
        .slice(offset, offset + currencyLength)
        .toString("utf8");

      return {
        eventType: "PaymentConfirmedEvent",
        trustVault: trustVault.toString(),
        maker: maker.toString(),
        taker: taker.toString(),
        amount: amount.toString(),
        feeAmount: feeAmount.toString(),
        fiatAmount: fiatAmount.toString(),
        currency,
        amountFormatted: (Number(amount) / 1e9).toFixed(2),
        feeAmountFormatted: (Number(feeAmount) / 1e9).toLocaleString(),
        participants: { seller: maker.toString(), buyer: taker.toString() },
      };
    } catch (error) {
      console.error(
        "❌ EventDecoder: Error decoding PaymentConfirmedEvent:",
        error
      );
      return null;
    }
  }

  /**
   * Decode PartialWithdrawalEvent from buffer
   */
  private decodePartialWithdrawalEvent(buffer: Buffer): DecodedEvent | null {
    try {
      let offset = 8;

      const trustVault = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const maker = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const withdrawalAmount = buffer.readBigUInt64LE(offset);
      offset += 8;

      const remainingAmount = buffer.readBigUInt64LE(offset);

      return {
        eventType: "PartialWithdrawalEvent",
        trustVault: trustVault.toString(),
        maker: maker.toString(),
        withdrawalAmount: withdrawalAmount.toString(),
        remainingAmount: remainingAmount.toString(),
        withdrawalAmountFormatted: (Number(withdrawalAmount) / 1e9).toFixed(2),
        remainingAmountFormatted: (Number(remainingAmount) / 1e9).toFixed(2),
        participants: { seller: maker.toString() },
      };
    } catch (error) {
      console.error(
        "❌ EventDecoder: Error decoding PartialwithdrawalEvent:",
        error
      );
      return null;
    }
  }

  /**
   * Decode TrustVaultClosedEvent from buffer
   */
  private decodeTrustVaultClosedEvent(buffer: Buffer): DecodedEvent | null {
    try {
      let offset = 8;

      const trustVault = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const maker = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const remainingAmount = buffer.readBigUInt64LE(offset);

      return {
        eventType: "TrustVaultClosedEvent",
        trustVault: trustVault.toString(),
        maker: maker.toString(),
        remainingAmount: remainingAmount.toString(),
        participants: { seller: maker.toString() },
      };
    } catch (error) {
      console.error(
        "❌ EventDecoder: Error decoding TrustVaultClosedEvent:",
        error
      );
      return null;
    }
  }

  /**
   * Decode PriceUpdatedEvent from buffer
   */
  private decodePriceUpdatedEvent(buffer: Buffer): DecodedEvent | null {
    try {
      let offset = 8;

      const trustVault = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const maker = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const oldPrice = buffer.readBigUInt64LE(offset);
      offset += 8;

      const newPrice = buffer.readBigUInt64LE(offset);
      offset += 8;

      const currencyLength = buffer.readUInt32LE(offset);
      offset += 4;

      const currency = buffer
        .slice(offset, offset + currencyLength)
        .toString("utf8");

      return {
        eventType: "PriceUpdatedEvent",
        trustVault: trustVault.toString(),
        maker: maker.toString(),
        oldPrice: oldPrice.toString(),
        newPrice: newPrice.toString(),
        currency,
        oldPriceFormatted: (Number(oldPrice) / 1e9).toFixed(2),
        newPriceFormatted: (Number(newPrice) / 1e9).toFixed(2),
        participants: { seller: maker.toString() },
      };
    } catch (error) {
      console.error(
        "❌ EventDecoder: Error decoding PriceUpdatedEvent:",
        error
      );
      return this.createGenericDecoding(buffer, "PriceUpdatedEvent");
    }
  }

  /**
   * Decode BuyOrderCreatedEvent from buffer
   */
  private decodeBuyOrderCreatedEvent(buffer: Buffer): DecodedEvent | null {
    try {
      let offset = 8;

      const trustVault = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const buyer = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const mint = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const amount = buffer.readBigUInt64LE(offset);
      offset += 8;

      const pricePerToken = buffer.readBigUInt64LE(offset);
      offset += 8;

      const currencyLength = buffer.readUInt32LE(offset);
      offset += 4;

      const currency = buffer
        .slice(offset, offset + currencyLength)
        .toString("utf8");
      offset += currencyLength;

      const instructionsLength = buffer.readUInt32LE(offset);
      offset += 4;

      const paymentInstructions = buffer
        .slice(offset, offset + instructionsLength)
        .toString("utf8");

      return {
        eventType: "BuyOrderCreatedEvent",
        trustVault: trustVault.toString(),
        buyer: buyer.toString(),
        mint: mint.toString(),
        amount: amount.toString(),
        pricePerToken: pricePerToken.toString(),
        currency,
        paymentInstructions,
        amountFormatted: (Number(amount) / 1e9).toFixed(2),
        pricePerTokenFormatted: (Number(pricePerToken) / 1e9).toLocaleString(),
        participants: { buyer: buyer.toString() },
      };
    } catch (error) {
      console.error(
        "❌ EventDecoder: Error decoding BuyOrderCreatedEvent:",
        error
      );
      return null;
    }
  }

  /**
   * Decode BuyOrderCancelledEvent from buffer
   */
  private decodeBuyOrderCancelledEvent(buffer: Buffer): DecodedEvent | null {
    try {
      let offset = 8;

      const trustVault = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const maker = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const originalAmount = buffer.readBigUInt64LE(offset);

      return {
        eventType: "BuyOrderCancelledEvent",
        trustVault: trustVault.toString(),
        maker: maker.toString(),
        originalAmount: originalAmount.toString(),
        participants: { buyer: maker.toString() },
      };
    } catch (error) {
      console.error(
        "❌ EventDecoder: Error decoding BuyOrderCancelledEvent:",
        error
      );
      return null;
    }
  }

  /**
   * Decode BuyOrderReducedEvent from buffer
   */
  private decodeBuyOrderReducedEvent(buffer: Buffer): DecodedEvent | null {
    try {
      let offset = 8;

      const trustVault = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const maker = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const originalAmount = buffer.readBigUInt64LE(offset);
      offset += 8;

      const newAmount = buffer.readBigUInt64LE(offset);

      return {
        eventType: "BuyOrderReducedEvent",
        trustVault: trustVault.toString(),
        maker: maker.toString(),
        originalAmount: originalAmount.toString(),
        newAmount: newAmount.toString(),
        participants: { buyer: maker.toString() },
      };
    } catch (error) {
      console.error(
        "❌ EventDecoder: Error decoding BuyOrderReducedEvent:",
        error
      );
      return null;
    }
  }

  /**
   * Decode BuyOrderReservedEvent from buffer
   */
  private decodeBuyOrderReservedEvent(buffer: Buffer): DecodedEvent | null {
    try {
      let offset = 8;

      const trustVault = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const buyer = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const seller = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const amount = buffer.readBigUInt64LE(offset);
      offset += 8;

      const fiatAmount = buffer.readBigUInt64LE(offset);
      offset += 8;

      const currencyLength = buffer.readUInt32LE(offset);
      offset += 4;

      const currency = buffer
        .slice(offset, offset + currencyLength)
        .toString("utf8");

      return {
        eventType: "BuyOrderReservedEvent",
        trustVault: trustVault.toString(),
        buyer: buyer.toString(),
        seller: seller.toString(),
        amount: amount.toString(),
        fiatAmount: fiatAmount.toString(),
        currency,
        amountFormatted: (Number(amount) / 1e9).toFixed(2),
        fiatAmountFormatted: Number(fiatAmount).toLocaleString(),
        participants: {
          buyer: buyer.toString(),
          seller: seller.toString(),
        },
      };
    } catch (error) {
      console.error(
        "❌ EventDecoder: Error decoding BuyOrderReservedEvent:",
        error
      );
      return this.createGenericDecoding(buffer, "BuyOrderReservedEvent");
    }
  }

  /**
   * Decode BuyerPaymentSentEvent from buffer
   */
  private decodeBuyerPaymentSentEvent(buffer: Buffer): DecodedEvent | null {
    try {
      let offset = 8;

      const trustVault = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const buyer = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const seller = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const amount = buffer.readBigUInt64LE(offset);
      offset += 8;

      const fiatAmount = buffer.readBigUInt64LE(offset);
      offset += 8;

      const currencyLength = buffer.readUInt32LE(offset);
      offset += 4;

      const currency = buffer
        .slice(offset, offset + currencyLength)
        .toString("utf8");
      offset += currencyLength;

      const timestamp = buffer.readBigInt64LE(offset);

      return {
        eventType: "BuyerPaymentSentEvent",
        trustVault: trustVault.toString(),
        buyer: buyer.toString(),
        seller: seller.toString(),
        amount: amount.toString(),
        fiatAmount: fiatAmount.toString(),
        currency,
        timestamp: timestamp.toString(),
        amountFormatted: (Number(amount) / 1e9).toFixed(2),
        fiatAmountFormatted: Number(fiatAmount).toLocaleString(),
        participants: {
          buyer: buyer.toString(),
          seller: seller.toString(),
        },
      };
    } catch (error) {
      console.error(
        "❌ EventDecoder: Error decoding BuyerPaymentSentEvent:",
        error
      );
      return this.createGenericDecoding(buffer, "BuyerPaymentSentEvent");
    }
  }

  /**
   * Decode SellerConfirmsPaymentEvent from buffer
   */
  private decodeSellerConfirmsPaymentEvent(buffer: Buffer): DecodedEvent | null {
    try {
      let offset = 8;

      const trustVault = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const buyer = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const seller = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const amount = buffer.readBigUInt64LE(offset);
      offset += 8;

      const fiatAmount = buffer.readBigUInt64LE(offset);
      offset += 8;

      const currencyLength = buffer.readUInt32LE(offset);
      offset += 4;

      const currency = buffer
        .slice(offset, offset + currencyLength)
        .toString("utf8");

      return {
        eventType: "SellerConfirmsPaymentEvent",
        trustVault: trustVault.toString(),
        buyer: buyer.toString(),
        seller: seller.toString(),
        amount: amount.toString(),
        fiatAmount: fiatAmount.toString(),
        currency,
        amountFormatted: (Number(amount) / 1e9).toFixed(2),
        fiatAmountFormatted: Number(fiatAmount).toLocaleString(),
        participants: {
          buyer: buyer.toString(),
          seller: seller.toString(),
        },
      };
    } catch (error) {
      console.error(
        "❌ EventDecoder: Error decoding SellerConfirmsPaymentEvent:",
        error
      );
      return this.createGenericDecoding(buffer, "SellerConfirmsPaymentEvent");
    }
  }

  /**
   * Decode DisputeCreatedEvent from buffer
   */
  private decodeDisputeCreatedEvent(buffer: Buffer): DecodedEvent | null {
    try {
      let offset = 8;

      const trustVault = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const maker = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const taker = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const reservationIndex = buffer.readUInt8(offset);
      offset += 1;

      const amount = buffer.readBigUInt64LE(offset);
      offset += 8;

      const fiatAmount = buffer.readBigUInt64LE(offset);
      offset += 8;

      const currencyLength = buffer.readUInt32LE(offset);
      offset += 4;

      const currency = buffer
        .slice(offset, offset + currencyLength)
        .toString("utf8");
      offset += currencyLength;

      const disputer = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const reasonLength = buffer.readUInt32LE(offset);
      offset += 4;

      const reason = buffer
        .slice(offset, offset + reasonLength)
        .toString("utf8");
      offset += reasonLength;

      const disputeIdLength = buffer.readUInt32LE(offset);
      offset += 4;

      const disputeId = buffer
        .slice(offset, offset + disputeIdLength)
        .toString("utf8");

      const disputerStr = disputer.toString();
      const makerStr = maker.toString();
      const takerStr = taker.toString();

      let disputerRole: string;
      let otherPartyAddress: string;

      if (disputerStr === makerStr) {
        disputerRole = "seller";
        otherPartyAddress = takerStr;
      } else if (disputerStr === takerStr) {
        disputerRole = "buyer";
        otherPartyAddress = makerStr;
      } else {
        console.warn("⚠️ EventDecoder: Disputer is neither maker nor taker");
        disputerRole = "unknown";
        otherPartyAddress = disputerStr === makerStr ? takerStr : makerStr;
      }

      return {
        eventType: "DisputeCreatedEvent",
        trustVault: trustVault.toString(),
        maker: maker.toString(),
        taker: taker.toString(),
        reservationIndex,
        amount: amount.toString(),
        fiatAmount: fiatAmount.toString(),
        currency,
        disputer: disputerStr,
        reason,
        disputeId,
        amountFormatted: (Number(amount) / 1e9).toFixed(2),
        fiatAmountFormatted: Number(fiatAmount).toLocaleString(),
        disputerRole,
        otherPartyAddress,
        participants: {
          seller: maker.toString(),
          buyer: taker.toString(),
          disputer: disputerStr,
          disputerAddress: disputerStr,
          otherPartyAddress: otherPartyAddress,
        },
      };
    } catch (error) {
      console.error(
        "❌ EventDecoder: Error decoding DisputeCreatedEvent:",
        error
      );
      return this.createGenericDecoding(buffer, "DisputeCreatedEvent");
    }
  }

  /**
   * Decode DisputeResolvedEvent from buffer
   */
  private decodeDisputeResolvedEvent(buffer: Buffer): DecodedEvent | null {
    try {
      let offset = 8;

      if (buffer.length < 40) {
        return this.createGenericDecoding(buffer, "DisputeResolvedEvent");
      }

      const trustVault = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const maker = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const taker = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      if (buffer.length < offset + 1 + 8 + 8 + 8 + 8 + 4) {
        return {
          eventType: "DisputeResolvedEvent",
          trustVault: trustVault.toString(),
          maker: maker.toString(),
          taker: taker.toString(),
          reservationIndex: 0,
          amount: "0",
          fiatAmount: "0",
          feeAmount: "0",
          transferAmount: "0",
          currency: "unknown",
          resolver: "unknown",
          resolution: 0,
          resolutionReason: "unknown",
          trustVaultType: 0,
          amountFormatted: "0.00",
          fiatAmountFormatted: "0",
          participants: {
            seller: maker.toString(),
            buyer: taker.toString(),
          },
        };
      }

      const reservationIndex = buffer.readUInt8(offset);
      offset += 1;

      const amount = buffer.readBigUInt64LE(offset);
      offset += 8;

      const fiatAmount = buffer.readBigUInt64LE(offset);
      offset += 8;

      const feeAmount = buffer.readBigUInt64LE(offset);
      offset += 8;

      const transferAmount = buffer.readBigUInt64LE(offset);
      offset += 8;

      if (buffer.length < offset + 4) {
        return {
          eventType: "DisputeResolvedEvent",
          trustVault: trustVault.toString(),
          maker: maker.toString(),
          taker: taker.toString(),
          reservationIndex,
          amount: amount.toString(),
          fiatAmount: fiatAmount.toString(),
          feeAmount: feeAmount.toString(),
          transferAmount: transferAmount.toString(),
          currency: "unknown",
          resolver: "unknown",
          resolution: 0,
          resolutionReason: "unknown",
          trustVaultType: 0,
          amountFormatted: (Number(amount) / 1e9).toFixed(2),
          fiatAmountFormatted: Number(fiatAmount).toLocaleString(),
          participants: {
            seller: maker.toString(),
            buyer: taker.toString(),
          },
        };
      }

      const currencyLength = buffer.readUInt32LE(offset);
      offset += 4;

      if (buffer.length < offset + currencyLength) {
        return {
          eventType: "DisputeResolvedEvent",
          trustVault: trustVault.toString(),
          maker: maker.toString(),
          taker: taker.toString(),
          reservationIndex,
          amount: amount.toString(),
          fiatAmount: fiatAmount.toString(),
          feeAmount: feeAmount.toString(),
          transferAmount: transferAmount.toString(),
          currency: "unknown",
          resolver: "unknown",
          resolution: 0,
          resolutionReason: "unknown",
          trustVaultType: 0,
          amountFormatted: (Number(amount) / 1e9).toFixed(2),
          fiatAmountFormatted: Number(fiatAmount).toLocaleString(),
          participants: {
            seller: maker.toString(),
            buyer: taker.toString(),
          },
        };
      }

      const currency = buffer
        .slice(offset, offset + currencyLength)
        .toString("utf8");
      offset += currencyLength;

      if (buffer.length < offset + 32) {
        return {
          eventType: "DisputeResolvedEvent",
          trustVault: trustVault.toString(),
          maker: maker.toString(),
          taker: taker.toString(),
          reservationIndex,
          amount: amount.toString(),
          fiatAmount: fiatAmount.toString(),
          feeAmount: feeAmount.toString(),
          transferAmount: transferAmount.toString(),
          currency,
          resolver: "unknown",
          resolution: 0,
          resolutionReason: "unknown",
          trustVaultType: 0,
          amountFormatted: (Number(amount) / 1e9).toFixed(2),
          fiatAmountFormatted: Number(fiatAmount).toLocaleString(),
          participants: {
            seller: maker.toString(),
            buyer: taker.toString(),
          },
        };
      }

      const resolver = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      if (buffer.length < offset + 1 + 1) {
        return {
          eventType: "DisputeResolvedEvent",
          trustVault: trustVault.toString(),
          maker: maker.toString(),
          taker: taker.toString(),
          reservationIndex,
          amount: amount.toString(),
          fiatAmount: fiatAmount.toString(),
          feeAmount: feeAmount.toString(),
          transferAmount: transferAmount.toString(),
          currency,
          resolver: resolver.toString(),
          resolution: 0,
          resolutionReason: "unknown",
          trustVaultType: 0,
          amountFormatted: (Number(amount) / 1e9).toFixed(2),
          fiatAmountFormatted: Number(fiatAmount).toLocaleString(),
          participants: {
            seller: maker.toString(),
            buyer: taker.toString(),
          },
        };
      }

      const resolution = buffer.readUInt8(offset);
      offset += 1;

      if (buffer.length < offset + 4) {
        return {
          eventType: "DisputeResolvedEvent",
          trustVault: trustVault.toString(),
          maker: maker.toString(),
          taker: taker.toString(),
          reservationIndex,
          amount: amount.toString(),
          fiatAmount: fiatAmount.toString(),
          feeAmount: feeAmount.toString(),
          transferAmount: transferAmount.toString(),
          currency,
          resolver: resolver.toString(),
          resolution,
          resolutionReason: "unknown",
          trustVaultType: 0,
          amountFormatted: (Number(amount) / 1e9).toFixed(2),
          fiatAmountFormatted: Number(fiatAmount).toLocaleString(),
          participants: {
            seller: maker.toString(),
            buyer: taker.toString(),
          },
        };
      }

      const resolutionReasonLength = buffer.readUInt32LE(offset);
      offset += 4;

      if (buffer.length < offset + resolutionReasonLength) {
        return {
          eventType: "DisputeResolvedEvent",
          trustVault: trustVault.toString(),
          maker: maker.toString(),
          taker: taker.toString(),
          reservationIndex,
          amount: amount.toString(),
          fiatAmount: fiatAmount.toString(),
          feeAmount: feeAmount.toString(),
          transferAmount: transferAmount.toString(),
          currency,
          resolver: resolver.toString(),
          resolution,
          resolutionReason: "unknown",
          trustVaultType: 0,
          amountFormatted: (Number(amount) / 1e9).toFixed(2),
          fiatAmountFormatted: Number(fiatAmount).toLocaleString(),
          participants: {
            seller: maker.toString(),
            buyer: taker.toString(),
          },
        };
      }

      const resolutionReason = buffer
        .slice(offset, offset + resolutionReasonLength)
        .toString("utf8");
      offset += resolutionReasonLength;

      if (buffer.length < offset + 1) {
        return {
          eventType: "DisputeResolvedEvent",
          trustVault: trustVault.toString(),
          maker: maker.toString(),
          taker: taker.toString(),
          reservationIndex,
          amount: amount.toString(),
          fiatAmount: fiatAmount.toString(),
          feeAmount: feeAmount.toString(),
          transferAmount: transferAmount.toString(),
          currency,
          resolver: resolver.toString(),
          resolution,
          resolutionReason,
          trustVaultType: 0,
          amountFormatted: (Number(amount) / 1e9).toFixed(2),
          fiatAmountFormatted: Number(fiatAmount).toLocaleString(),
          participants: {
            seller: maker.toString(),
            buyer: taker.toString(),
          },
        };
      }

      const trustVaultType = buffer.readUInt8(offset);

      return {
        eventType: "DisputeResolvedEvent",
        trustVault: trustVault.toString(),
        maker: maker.toString(),
        taker: taker.toString(),
        reservationIndex,
        amount: amount.toString(),
        fiatAmount: fiatAmount.toString(),
        feeAmount: feeAmount.toString(),
        transferAmount: transferAmount.toString(),
        currency,
        resolver: resolver.toString(),
        resolution,
        resolutionReason,
        trustVaultType,
        amountFormatted: (Number(amount) / 1e9).toFixed(2),
        fiatAmountFormatted: Number(fiatAmount).toLocaleString(),
        participants: {
          seller: maker.toString(),
          buyer: taker.toString(),
          resolver: resolver.toString(),
        },
      };
    } catch (error) {
      console.error(
        "❌ EventDecoder: Error decoding DisputeResolvedEvent:",
        error
      );
      return this.createGenericDecoding(buffer, "DisputeResolvedEvent");
    }
  }

                         /** TRUST EXPRESS*/
    /**
   * Decode PriceUpdatedEvent from buffer
   * Updated to match: trust_express, maker, old_price, new_price, currency
   */
  private decodeExpressPriceUpdatedEvent(buffer: Buffer): DecodedEvent | null {
    try {
      let offset = 8;

      const trustExpress = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const maker = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const oldPrice = buffer.readBigUInt64LE(offset);
      offset += 8;

      const newPrice = buffer.readBigUInt64LE(offset);
      offset += 8;

      const currencyLength = buffer.readUInt32LE(offset);
      offset += 4;

      const currency = buffer
        .slice(offset, offset + currencyLength)
        .toString("utf8");

      return {
        eventType: "ExpressPriceUpdatedEvent",
        trustExpress: trustExpress.toString(),
        maker: maker.toString(),
        oldPrice: oldPrice.toString(),
        newPrice: newPrice.toString(),
        currency,
        oldPriceFormatted: (Number(oldPrice) / 1e9).toFixed(2),
        newPriceFormatted: (Number(newPrice) / 1e9).toFixed(2),
        participants: { seller: maker.toString() },
      };
    } catch (error) {
      console.error(
        "❌ EventDecoder: Error decoding ExpressPriceUpdatedEvent:",
        error
      );
      return this.createGenericDecoding(buffer, "ExpressPriceUpdatedEvent");
    }
  }

  /**
   * Decode BuyOrderCreatedEvent from buffer
   * Updated to match: trust_express, buyer, mint, amount, price_per_token, currency, payment_instructions
   */
  private decodeExpressBuyOrderCreatedEvent(buffer: Buffer): DecodedEvent | null {
    try {
      let offset = 8;

      const trustExpress = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const buyer = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const mint = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const amount = buffer.readBigUInt64LE(offset);
      offset += 8;

      const pricePerToken = buffer.readBigUInt64LE(offset);
      offset += 8;

      const currencyLength = buffer.readUInt32LE(offset);
      offset += 4;

      const currency = buffer
        .slice(offset, offset + currencyLength)
        .toString("utf8");
      offset += currencyLength;

      const instructionsLength = buffer.readUInt32LE(offset);
      offset += 4;

      const paymentInstructions = buffer
        .slice(offset, offset + instructionsLength)
        .toString("utf8");

      return {
        eventType: "ExpressBuyOrderCreatedEvent",
        trustExpress: trustExpress.toString(),
        buyer: buyer.toString(),
        mint: mint.toString(),
        amount: amount.toString(),
        pricePerToken: pricePerToken.toString(),
        currency,
        paymentInstructions,
        amountFormatted: (Number(amount) / 1e9).toFixed(2),
        pricePerTokenFormatted: (Number(pricePerToken) / 1e9).toLocaleString(),
        participants: { buyer: buyer.toString() },
      };
    } catch (error) {
      console.error(
        "❌ EventDecoder: Error decoding ExpressBuyOrderCreatedEvent:",
        error
      );
      return null;
    }
  }

  /**
   * Decode BuyOrderReducedEvent from buffer
   * Updated to match: trust_express, buyer, original_amount, new_amount, timestamp
   */
  private decodeExpressBuyOrderReducedEvent(buffer: Buffer): DecodedEvent | null {
    try {
      let offset = 8;

      const trustExpress = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const buyer = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const originalAmount = buffer.readBigUInt64LE(offset);
      offset += 8;

      const newAmount = buffer.readBigUInt64LE(offset);
      offset += 8;

      const timestamp = buffer.readBigInt64LE(offset);

      return {
        eventType: "ExpressBuyOrderReducedEvent",
        trustExpress: trustExpress.toString(),
        buyer: buyer.toString(),
        originalAmount: originalAmount.toString(),
        newAmount: newAmount.toString(),
        timestamp: timestamp.toString(),
        participants: { buyer: buyer.toString() },
      };
    } catch (error) {
      console.error(
        "❌ EventDecoder: Error decoding ExpressBuyOrderReducedEvent:",
        error
      );
      return null;
    }
  }

  /**
   * Decode BuyOrderCancelledEvent from buffer
   * Updated to match: trust_express, buyer, original_amount, timestamp
   */
  private decodeExpressBuyOrderCancelledEvent(buffer: Buffer): DecodedEvent | null {
    try {
      let offset = 8;

      const trustExpress = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const buyer = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const originalAmount = buffer.readBigUInt64LE(offset);
      offset += 8;

      const timestamp = buffer.readBigInt64LE(offset);

      return {
        eventType: "ExpressBuyOrderCancelledEvent",
        trustExpress: trustExpress.toString(),
        buyer: buyer.toString(),
        originalAmount: originalAmount.toString(),
        timestamp: timestamp.toString(),
        participants: { buyer: buyer.toString() },
      };
    } catch (error) {
      console.error(
        "❌ EventDecoder: Error decoding ExpressBuyOrderCancelledEvent:",
        error
      );
      return null;
    }
  }

   /**
   * Decode InstantPaymentReservedEvent from buffer
   * Updated to match: trust_express, taker, amount, fiat_amount, currency, payout_details, payout_reference
   */
  private decodeInstantPaymentReservedEvent(buffer: Buffer): DecodedEvent | null {
    try {
      let offset = 8;

      const trustExpress = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const taker = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;
     

      const amount = buffer.readBigUInt64LE(offset);
      offset += 8;

      const fiatAmount = buffer.readBigUInt64LE(offset);
      offset += 8;

      if (buffer.length < offset + 4) {
        return null;
      }

      const currencyLength = buffer.readUInt32LE(offset);
      offset += 4;

      if (buffer.length < offset + currencyLength) {
        return null;
      }

      const currency = buffer
        .slice(offset, offset + currencyLength)
        .toString("utf8");
      offset += currencyLength;
      let payoutDetails: string | null = null;
      if (buffer.length > offset) {
        const hasPayoutDetails = buffer.readUInt8(offset) === 1;
        offset += 1;

        if (hasPayoutDetails) {
          if (buffer.length >= offset + 4) {
            const payoutDetailsLength = buffer.readUInt32LE(offset);
            offset += 4;


            if (
              payoutDetailsLength > 0 &&
              payoutDetailsLength < 10000 && 
              buffer.length >= offset + payoutDetailsLength
            ) {
              payoutDetails = buffer
                .slice(offset, offset + payoutDetailsLength)
                .toString("utf8");
              offset += payoutDetailsLength;
            } else {
            }
          } else {
          }
        }
      }
      let payoutReference: string | null = null;
      if (buffer.length >= offset + 4) {
        const payoutReferenceLength = buffer.readUInt32LE(offset);
        offset += 4;

        if (
          payoutReferenceLength > 0 &&
          payoutReferenceLength < 1000 && 
          buffer.length >= offset + payoutReferenceLength
        ) {
          payoutReference = buffer
            .slice(offset, offset + payoutReferenceLength)
            .toString("utf8");
          offset += payoutReferenceLength;
        } else {
        }
      } else {
      }


      return {
        eventType: "InstantPaymentReservedEvent",
        trustExpress: trustExpress.toString(),
        taker: taker.toString(),
        amount: amount.toString(),
        fiatAmount: fiatAmount.toString(),
        currency,
        payoutDetails,
        payoutReference,
        amountFormatted: (Number(amount) / 1e9).toFixed(2),
        fiatAmountFormatted: Number(fiatAmount).toLocaleString(),
        participants: {
          taker: taker.toString(),
          user: taker.toString(),
        },
      };
    } catch (error) {
      console.error(
        "❌ EventDecoder: Error decoding InstantPaymentReservedEvent:",
        error
      );
      return null;
    }
  }

  /**
   * Decode InstantPaymentPayoutResultEvent from buffer
   * Updated to match: trust_express, taker, amount, fiat_amount, currency, payout_reference, success, message
   */
  private decodeInstantPaymentPayoutResultEvent(buffer: Buffer): DecodedEvent | null {
    try {
      let offset = 8; 

      const trustExpress = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const taker = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const amount = buffer.readBigUInt64LE(offset);
      offset += 8;

      const fiatAmount = buffer.readBigUInt64LE(offset);
      offset += 8;

      
      const currencyLength = buffer.readUInt32LE(offset);
      offset += 4;
      const currency = buffer
        .slice(offset, offset + currencyLength)
        .toString("utf8");
      offset += currencyLength;

      
      const payoutReferenceLength = buffer.readUInt32LE(offset);
      offset += 4;
      const payoutReference = buffer
        .slice(offset, offset + payoutReferenceLength)
        .toString("utf8");
      offset += payoutReferenceLength;

      
      const success = buffer.readUInt8(offset) === 1;
      offset += 1;

      
      const messageLength = buffer.readUInt32LE(offset);
      offset += 4;
      const message = buffer
        .slice(offset, offset + messageLength)
        .toString("utf8");

      return {
        eventType: "InstantPaymentPayoutResultEvent",
        trustExpress: trustExpress.toString(),
        taker: taker.toString(),
        amount: amount.toString(),
        fiatAmount: fiatAmount.toString(),
        currency,
        payoutReference,
        success,
        message,
        amountFormatted: (Number(amount) / 1e9).toFixed(2),
        fiatAmountFormatted: Number(fiatAmount).toLocaleString(),
        participants: {
          taker: taker.toString(),
          user: taker.toString(),
        },
      };
    } catch (error) {
      console.error(
        "❌ EventDecoder: Error decoding InstantPaymentPayoutResultEvent:",
        error
      );
      return null;
    }
  }

  private decodeExpressSellOrderCreatedEvent(buffer: Buffer): DecodedEvent | null {
  try {
    let offset = 8;

    const trustExpress = new PublicKey(buffer.slice(offset, offset + 32));
    offset += 32;

    const seller = new PublicKey(buffer.slice(offset, offset + 32));
    offset += 32;

    const mint = new PublicKey(buffer.slice(offset, offset + 32));
    offset += 32;

    const amount = buffer.readBigUInt64LE(offset);
    offset += 8;

    const pricePerToken = buffer.readBigUInt64LE(offset);
    offset += 8;

    const currencyLength = buffer.readUInt32LE(offset);
    offset += 4;

    const currency = buffer
      .slice(offset, offset + currencyLength)
      .toString("utf8");
    offset += currencyLength;

    const instructionsLength = buffer.readUInt32LE(offset);
    offset += 4;

    const paymentInstructions = buffer
      .slice(offset, offset + instructionsLength)
      .toString("utf8");

    return {
      eventType: "ExpressSellOrderCreatedEvent",
      trustExpress: trustExpress.toString(),
      seller: seller.toString(),
      mint: mint.toString(),
      amount: amount.toString(),
      pricePerToken: pricePerToken.toString(),
      currency,
      paymentInstructions,
      amountFormatted: (Number(amount) / 1e9).toFixed(2),
      pricePerTokenFormatted: (Number(pricePerToken) / 1e9).toLocaleString(),
      participants: { seller: seller.toString() },
    };
  } catch (error) {
    console.error(
      "❌ EventDecoder: Error decoding ExpressSellOrderCreatedEvent:",
      error
    );
    return null;
  }
}

private decodeInstantSellReservationCreatedEvent(buffer: Buffer): DecodedEvent | null {
  try {
    let offset = 8;

    const trustExpress = new PublicKey(buffer.slice(offset, offset + 32));
    offset += 32;

    const maker = new PublicKey(buffer.slice(offset, offset + 32));
    offset += 32;

    const taker = new PublicKey(buffer.slice(offset, offset + 32));
    offset += 32;

    const amount = buffer.readBigUInt64LE(offset);
    offset += 8;

    const fiatAmount = buffer.readBigUInt64LE(offset);
    offset += 8;

    const currencyLength = buffer.readUInt32LE(offset);
    offset += 4;

    const currency = buffer
      .slice(offset, offset + currencyLength)
      .toString("utf8");
    offset += currencyLength;

    const paymentMode = buffer.readUInt8(offset);
    offset += 1;

    const payoutReferenceLength = buffer.readUInt32LE(offset);
    offset += 4;

    const payoutReference = buffer
      .slice(offset, offset + payoutReferenceLength)
      .toString("utf8");

    return {
      eventType: "InstantSellReservationCreatedEvent",
      trustExpress: trustExpress.toString(),
      maker: maker.toString(),
      taker: taker.toString(),
      amount: amount.toString(),
      fiatAmount: fiatAmount.toString(),
      currency,
      paymentMode,
      payoutReference,
      amountFormatted: (Number(amount) / 1e9).toFixed(2),
      fiatAmountFormatted: Number(fiatAmount).toLocaleString(),
      participants: {
        seller: maker.toString(),
        buyer: taker.toString(),
      },
    };
  } catch (error) {
    console.error(
      "❌ EventDecoder: Error decoding InstantSellReservationCreatedEvent:",
      error
    );
    return null;
  }
}

private decodeInstantSellPaymentResultEvent(buffer: Buffer): DecodedEvent | null {
  try {
    let offset = 8;

    const trustExpress = new PublicKey(buffer.slice(offset, offset + 32));
    offset += 32;

    const maker = new PublicKey(buffer.slice(offset, offset + 32));
    offset += 32;

    const taker = new PublicKey(buffer.slice(offset, offset + 32));
    offset += 32;

    const amount = buffer.readBigUInt64LE(offset);
    offset += 8;

    const fiatAmount = buffer.readBigUInt64LE(offset);
    offset += 8;

    const currencyLength = buffer.readUInt32LE(offset);
    offset += 4;

    const currency = buffer
      .slice(offset, offset + currencyLength)
      .toString("utf8");
    offset += currencyLength;

    const payoutReferenceLength = buffer.readUInt32LE(offset);
    offset += 4;

    const payoutReference = buffer
      .slice(offset, offset + payoutReferenceLength)
      .toString("utf8");
    offset += payoutReferenceLength;

    const success = buffer.readUInt8(offset) === 1;
    offset += 1;

    const messageLength = buffer.readUInt32LE(offset);
    offset += 4;

    const message = buffer
      .slice(offset, offset + messageLength)
      .toString("utf8");
    offset += messageLength;

    const feeAmount = buffer.readBigUInt64LE(offset);

    return {
      eventType: "InstantSellPaymentResultEvent",
      trustExpress: trustExpress.toString(),
      maker: maker.toString(),
      taker: taker.toString(),
      amount: amount.toString(),
      fiatAmount: fiatAmount.toString(),
      currency,
      payoutReference,
      success,
      message,
      feeAmount: feeAmount.toString(),
      amountFormatted: (Number(amount) / 1e9).toFixed(2),
      fiatAmountFormatted: Number(fiatAmount).toLocaleString(),
      participants: {
        seller: maker.toString(),
        buyer: taker.toString(),
      },
    };
  } catch (error) {
    console.error(
      "❌ EventDecoder: Error decoding InstantSellPaymentResultEvent:",
      error
    );
    return null;
  }
}

  /**
   * Decode ValidatorVoteExecutedEvent
   *
   * Actual on-chain layout (from validator_events.rs):
   *   discriminator(8)
   *   trust_express:    Pubkey        →  32 bytes   (offset 8)
   *   taker:            Pubkey        →  32 bytes   (offset 40)
   *   payout_reference: String        →  4+N bytes  (offset 72)
   *   success:          bool          →  1 byte
   *   message:          String        →  4+N bytes
   *   amount:           u64           →  8 bytes
   *   fiat_amount:      u64           →  8 bytes
   *   currency:         String        →  4+N bytes
   *   timestamp:        i64           →  8 bytes
   *
   * Previous decoder had amount/fiat_amount/currency BEFORE payout_reference —
   * the wrong order caused currencyLen to read garbage and throw RangeError.
   */
  private decodeValidatorVoteExecutedEvent(buffer: Buffer): DecodedEvent | null {
    try {
      // Minimum fixed bytes before any variable-length data:
      // discriminator(8) + trust_express(32) + taker(32) + refLen(4) = 76
      const MIN_SIZE = 76;
      if (buffer.length < MIN_SIZE) {
        console.warn(
          `EventDecoder: ValidatorVoteExecutedEvent buffer too small ` +
          `(${buffer.length} bytes, need >= ${MIN_SIZE}) — skipping.`
        );
        return null;
      }

      let offset = 8;

      // trust_express: Pubkey (32)
      const trustExpress = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      // taker: Pubkey (32)
      const taker = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      // payout_reference: String (4 + N)
      const refLen = buffer.readUInt32LE(offset);
      offset += 4;
      if (refLen > 128 || offset + refLen > buffer.length) {
        console.warn(
          `EventDecoder: ValidatorVoteExecutedEvent — invalid refLen ` +
          `${refLen} at offset ${offset - 4} (bufLen=${buffer.length}), skipping.`
        );
        return null;
      }
      const payoutReference = buffer.slice(offset, offset + refLen).toString('utf8');
      offset += refLen;

      // success: bool (1)
      if (offset + 1 > buffer.length) {
        console.warn(`EventDecoder: ValidatorVoteExecutedEvent — buffer exhausted before success, skipping.`);
        return null;
      }
      const success = buffer.readUInt8(offset) === 1;
      offset += 1;

      // message: String (4 + N)
      if (offset + 4 > buffer.length) {
        console.warn(`EventDecoder: ValidatorVoteExecutedEvent — buffer exhausted before msgLen, skipping.`);
        return null;
      }
      const msgLen = buffer.readUInt32LE(offset);
      offset += 4;
      if (msgLen > 512 || offset + msgLen > buffer.length) {
        console.warn(
          `EventDecoder: ValidatorVoteExecutedEvent — invalid msgLen ` +
          `${msgLen} at offset ${offset - 4} (bufLen=${buffer.length}), skipping.`
        );
        return null;
      }
      const message = buffer.slice(offset, offset + msgLen).toString('utf8');
      offset += msgLen;

      // amount: u64 (8)
      if (offset + 8 > buffer.length) {
        console.warn(`EventDecoder: ValidatorVoteExecutedEvent — buffer exhausted before amount, skipping.`);
        return null;
      }
      const amount = buffer.readBigUInt64LE(offset);
      offset += 8;

      // fiat_amount: u64 (8)
      if (offset + 8 > buffer.length) {
        console.warn(`EventDecoder: ValidatorVoteExecutedEvent — buffer exhausted before fiatAmount, skipping.`);
        return null;
      }
      const fiatAmount = buffer.readBigUInt64LE(offset);
      offset += 8;

      // currency: String (4 + N)
      if (offset + 4 > buffer.length) {
        console.warn(`EventDecoder: ValidatorVoteExecutedEvent — buffer exhausted before currencyLen, skipping.`);
        return null;
      }
      const currencyLen = buffer.readUInt32LE(offset);
      offset += 4;
      if (currencyLen > 16 || offset + currencyLen > buffer.length) {
        console.warn(
          `EventDecoder: ValidatorVoteExecutedEvent — invalid currencyLen ` +
          `${currencyLen} at offset ${offset - 4} (bufLen=${buffer.length}), skipping.`
        );
        return null;
      }
      const currency = buffer.slice(offset, offset + currencyLen).toString('utf8');
      offset += currencyLen;

      // timestamp: i64 (8) — optional tail field, safe to skip if absent
      const timestamp = buffer.length >= offset + 8
        ? buffer.readBigInt64LE(offset)
        : 0n;

      return {
        eventType: 'ValidatorVoteExecutedEvent',
        trustExpress: trustExpress.toString(),
        taker: taker.toString(),
        payoutReference,
        success,
        message,
        amount: amount.toString(),
        fiatAmount: fiatAmount.toString(),
        currency,
        timestamp: timestamp.toString(),
        amountFormatted: (Number(amount) / 1e9).toFixed(2),
        fiatAmountFormatted: Number(fiatAmount).toLocaleString(),
        participants: {
          taker: taker.toString(),
        },
      };
    } catch (error) {
      console.warn('EventDecoder: Unexpected error decoding ValidatorVoteExecutedEvent (skipping):', error);
      return null;
    }
  }

  /**
   * Decode ExpressClosedEvent
   * Layout: trust_express(32) + maker(32) + remaining_amount(8)
   */
  private decodeExpressClosedEvent(buffer: Buffer): DecodedEvent | null {
    try {
      let offset = 8;

      const trustExpress = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const maker = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      const remainingAmount = buffer.readBigUInt64LE(offset);

      return {
        eventType: 'ExpressClosedEvent',
        trustExpress: trustExpress.toString(),
        maker: maker.toString(),
        remainingAmount: remainingAmount.toString(),
        participants: { maker: maker.toString() },
      };
    } catch (error) {
      console.error('❌ EventDecoder: Error decoding ExpressClosedEvent:', error);
      return null;
    }
  }

  /**
   * Generic decoding for events not yet fully implemented
   */
  private createGenericDecoding(buffer: Buffer, eventType: string): DecodedEvent {
    try {
      let offset = 8;
      const addresses: string[] = [];

      while (offset + 32 <= buffer.length) {
        try {
          const potentialKey = new PublicKey(buffer.slice(offset, offset + 32));
          if (this.isValidSolanaAddress(potentialKey.toString())) {
            addresses.push(potentialKey.toString());
          }
        } catch (error) {
          // Not a valid public key, continue
        }
        offset += 32;
      }

      const participants = this.mapAddressesToParticipants(
        addresses,
        eventType
      );

      return {
        eventType,
        addresses,
        participants,
        note: `Generic decoding for ${eventType} - implement specific decoder for full functionality`,
      };
    } catch (error) {
      console.error(
        `❌ EventDecoder: Error in generic decoding for ${eventType}:`,
        error
      );
      return {
        eventType,
        error: "Failed to decode generically",
        participants: {},
      };
    }
  }

  /**
   * Map extracted addresses to likely participant roles based on event type
   */
  private mapAddressesToParticipants(addresses: string[], eventType: string): Participants {
    const participants: Participants = {};

    if (addresses.length === 0) {
      return participants;
    }

    switch (eventType) {
      case "DisputeResolvedEvent":
        if (addresses.length >= 3) {
          participants.seller = addresses[1];
          participants.buyer = addresses[2];
        } else if (addresses.length >= 2) {
          participants.seller = addresses[1];
          participants.buyer = addresses[0];
        } else if (addresses.length >= 1) {
          participants.seller = addresses[0];
        }
        break;

      case "BuyOrderReservedEvent":
        if (addresses.length >= 3) {
          participants.buyer = addresses[1];
          participants.seller = addresses[2];
        } else if (addresses.length >= 2) {
          participants.buyer = addresses[1];
          participants.seller = addresses[0];
        } else if (addresses.length >= 1) {
          participants.buyer = addresses[0];
        }
        break;

      case "BuyerPaymentSentEvent":
        if (addresses.length >= 3) {
          participants.buyer = addresses[1];
          participants.seller = addresses[2];
        } else if (addresses.length >= 2) {
          participants.buyer = addresses[1];
          participants.seller = addresses[0];
        } else if (addresses.length >= 1) {
          participants.buyer = addresses[0];
        }
        break;

      case "SellerConfirmsPaymentEvent":
        if (addresses.length >= 3) {
          participants.buyer = addresses[1];
          participants.seller = addresses[2];
        } else if (addresses.length >= 2) {
          participants.buyer = addresses[1];
          participants.seller = addresses[0];
        } else if (addresses.length >= 1) {
          participants.seller = addresses[0];
        }
        break;
      default:
        if (addresses.length >= 1) {
          participants.participant1 = addresses[0];
        }
        if (addresses.length >= 2) {
          participants.participant2 = addresses[1];
        }
        if (addresses.length >= 3) {
          participants.participant3 = addresses[2];
        }
        break;
    }

    return participants;
  }

  /**
   * Alternative method: Try to extract addresses using pattern matching
   */
  private extractAddressesFromBuffer(buffer: Buffer): AddressInfo[] {
    const addresses: AddressInfo[] = [];

    for (let i = 0; i <= buffer.length - 32; i++) {
      try {
        const potentialKey = new PublicKey(buffer.slice(i, i + 32));
        const keyString = potentialKey.toString();
        if (this.isValidSolanaAddress(keyString)) {
          addresses.push({
            address: keyString,
            offset: i,
            type: this.guessAddressType(keyString, i),
          });
        }
      } catch (error) {
        // Not a valid public key, continue
      }
    }

    return addresses;
  }

  /**
   * Guess the type of address based on position and known patterns
   */
  private guessAddressType(address: string, offset: number): string {
    const knownAddresses: { [key: string]: string } = {
      ComputeBudget111111111111111111111111111111: "compute_budget_program",
      TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb: "token_program",
      "11111111111111111111111111111111": "system_program",
    };

    if (knownAddresses[address]) {
      return knownAddresses[address];
    }

    if (offset === 8) return "trust_vault";
    if (offset === 40) return "maker";
    if (offset === 72) return "taker_or_mint";

    return "unknown";
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
}