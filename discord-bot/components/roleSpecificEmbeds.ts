import { EmbedBuilder } from "discord.js";

interface BaseEventData {
  trustVault?: string;
  trustExpress?: string;
  timestamp?: number;
  transactionHash?: string;
  blockNumber?: number;
}

interface TrustVaultCreatedEventData extends BaseEventData {
  seller: string;
  amountFormatted: string;
  pricePerToken: string;
  currency: string;
}

interface BuyOrderCreatedEventData extends BaseEventData {
  buyer: string;
  amountFormatted: string;
  pricePerToken: string;
  currency: string;
}

interface TokensReservedEventData extends BaseEventData {
  seller: string;
  buyer: string;
  amountFormatted: string;
  fiatAmountFormatted: string;
  currency: string;
}

interface BuyOrderReservedEventData extends BaseEventData {
  seller: string;
  buyer: string;
  amountFormatted: string;
  fiatAmountFormatted: string;
  currency: string;
}

interface PaymentSentEventData extends BaseEventData {
  seller: string;
  buyer: string;
  amountFormatted: string;
  fiatAmountFormatted: string;
  currency: string;
}

interface BuyerPaymentSentEventData extends BaseEventData {
  seller: string;
  buyer: string;
  amountFormatted: string;
  fiatAmountFormatted: string;
  currency: string;
}

interface PaymentConfirmedEventData extends BaseEventData {
  seller: string;
  buyer: string;
  amountFormatted: string;
  fiatAmountFormatted: string;
  currency: string;
}

interface SellerConfirmsPaymentEventData extends BaseEventData {
  seller: string;
  buyer: string;
  amountFormatted: string;
  fiatAmountFormatted: string;
  currency: string;
}

interface WithdrawalProcessedEventData extends BaseEventData {
  withdrawAmount: string;
  feeRefund: string;
  vaultClosed: boolean;
}

interface BuyOrderReducedEventData extends BaseEventData {
  buyer: string;
  originalAmount: string;
  newAmount: string;
}

interface BuyOrderCancelledEventData extends BaseEventData {
  buyer: string;
}

interface TrustVaultClosedEventData extends BaseEventData {
  seller: string;
}

interface PriceUpdatedEventData extends BaseEventData {
  seller: string;
  oldPrice?: string;
  newPrice: string;
  currency: string;
}

interface ReservationCancelledEventData extends BaseEventData {
  seller: string;
  buyer: string;
  amountFormatted: string;
}

interface DisputeCreatedEventData extends BaseEventData {
  disputeId: string;
  disputer: string;
  disputerAddress?: string;
  otherPartyAddress: string;
  amountFormatted: string;
  fiatAmountFormatted: string;
  currency: string;
  reason?: string;
  seller?: string;
  buyer?: string;
  maker?: string;
  taker?: string;
}

interface DisputeResolvedEventData extends BaseEventData {
  disputeId: string;
  disputer: string;
  disputerAddress?: string;
  otherPartyAddress: string;
  amountFormatted: string;
  fiatAmountFormatted: string;
  currency: string;
  reason?: string;
  seller?: string;
  buyer?: string;
  maker?: string;
  taker?: string;
}

/** TRUST EXPRESS */
interface ExpressBuyOrderCreatedEventData extends BaseEventData {
  buyer: string;
  amountFormatted: string;
  pricePerToken: string;
  currency: string;
}

interface ExpressBuyOrderReducedEventData extends BaseEventData {
  buyer: string;
  originalAmount: string;
  newAmount: string;
}

interface ExpressBuyOrderCancelledEventData extends BaseEventData {
  buyer: string;
}

interface ExpressPriceUpdatedEventData extends BaseEventData {
  seller: string;
  oldPrice?: string;
  newPrice: string;
  currency: string;
}

interface InstantPaymentReservedEventData extends BaseEventData {
  taker: string;
  maker: string;
  amountFormatted: string;
  fiatAmountFormatted: string;
  currency: string;
  payoutReference: string;
}

interface InstantPaymentPayoutResultEventData extends BaseEventData {
  taker: string;
  maker: string;
  amountFormatted: string;
  fiatAmountFormatted: string;
  currency: string;
  payoutReference: string;
  success: boolean;
  message?: string;
}

interface ExpressSellOrderCreatedEventData extends BaseEventData {
  seller: string;
  amountFormatted: string;
  pricePerToken: string;
  currency: string;
}

interface InstantSellReservationCreatedEventData extends BaseEventData {
  seller: string;
  maker: string;
  buyer: string;
  taker: string;
  amountFormatted: string;
  fiatAmountFormatted: string;
  currency: string;
  paymentMode: number;
  payoutReference: string;
}

interface InstantSellPaymentResultEventData extends BaseEventData {
  seller: string;
  maker: string;
  buyer: string;
  taker: string;
  amountFormatted: string;
  fiatAmountFormatted: string;
  currency: string;
  payoutReference: string;
  success: boolean;
  message?: string;
  feeAmount: string;
}

type EventData =
  | TrustVaultCreatedEventData
  | BuyOrderCreatedEventData
  | TokensReservedEventData
  | BuyOrderReservedEventData
  | PaymentSentEventData
  | BuyerPaymentSentEventData
  | PaymentConfirmedEventData
  | SellerConfirmsPaymentEventData
  | WithdrawalProcessedEventData
  | BuyOrderReducedEventData
  | BuyOrderCancelledEventData
  | TrustVaultClosedEventData
  | PriceUpdatedEventData
  | ReservationCancelledEventData
  | DisputeCreatedEventData
  | DisputeResolvedEventData
  | InstantPaymentReservedEventData
  | InstantPaymentPayoutResultEventData
  
  ;

type UserRole = "buyer" | "seller" | "disputer" | "disputerAddress" | "otherPartyAddress" | 'taker' | 'maker' | 'user';

type EventType =
  | "TrustVaultCreatedEvent"
  | "BuyOrderCreatedEvent"
  | "TokensReservedEvent"
  | "BuyOrderReservedEvent"
  | "PaymentSentEvent"
  | "PaymentConfirmedEvent"
  | "SellerConfirmsPaymentEvent"
  | "WithdrawalProcessedEvent"
  | "ReservationCancelledEvent"
  | "DisputeCreatedEvent"
  | "DisputeResolvedEvent"
  | "BuyOrderReducedEvent"
  | "BuyerPaymentSentEvent"
  | "BuyOrderCancelledEvent"
  | "PriceUpdatedEvent"
  | "TrustVaultClosedEvent"
      /** TRUST EXPRESS */
  | "ExpressBuyOrderCreatedEvent" 
  | "ExpressBuyOrderReducedEvent"
  | "ExpressBuyOrderCancelledEvent"
  | "ExpressPriceUpdatedEvent"   
  | 'InstantPaymentReservedEvent'
  | 'InstantPaymentPayoutResultEvent'
  | "ExpressSellOrderCreatedEvent"
  | "InstantSellReservationCreatedEvent"
  | "InstantSellPaymentResultEvent"
  ;

interface Colors {
  readonly SUCCESS: number;
  readonly WARNING: number;
  readonly ERROR: number;
  readonly INFO: number;
  readonly NEUTRAL: number;
  readonly PURPLE: number;
}

/**
 * Creates role-specific Discord embeds for different Trust Vault events
 */
export class RoleSpecificEmbeds {
  private readonly colors: Colors = {
    SUCCESS: 0x00ff00,
    WARNING: 0xffaa00,
    ERROR: 0xff0000,
    INFO: 0x0099ff,
    NEUTRAL: 0x808080,
    PURPLE: 0x9932cc,
  };

  /**
   * Create an embed for a specific event type and user role
   */
  createEmbed(eventType: EventType, eventData: EventData, userRole: UserRole): EmbedBuilder {
    switch (eventType) {
      case "TrustVaultCreatedEvent":
        return this.createTrustVaultEmbed(eventData as TrustVaultCreatedEventData, userRole);

      case "BuyOrderCreatedEvent":
        return this.createBuyOrderEmbed(eventData as BuyOrderCreatedEventData, userRole);

      case "TokensReservedEvent":
        return this.createTokensReservedEmbed(eventData as TokensReservedEventData, userRole);

      case "BuyOrderReservedEvent":
        return this.createBuyOrderReservedEmbed(eventData as BuyOrderReservedEventData, userRole);

      case "PaymentSentEvent":
        return this.createPaymentSentEmbed(eventData as PaymentSentEventData, userRole);

      case "PaymentConfirmedEvent":
        return this.createPaymentConfirmedEmbed(eventData as PaymentConfirmedEventData, userRole);

      case "SellerConfirmsPaymentEvent":
        return this.createSellerConfirmsPaymentEmbed(eventData as SellerConfirmsPaymentEventData, userRole);

      case "WithdrawalProcessedEvent":
        return this.createWithdrawalEmbed(eventData as WithdrawalProcessedEventData, userRole);

      case "ReservationCancelledEvent":
        return this.createCancellationEmbed(eventData as ReservationCancelledEventData, userRole);

      case "DisputeCreatedEvent":
        return this.createDisputeEmbed(eventData as DisputeCreatedEventData, userRole);

      case "DisputeResolvedEvent":
        return this.createDisputeResolvedEmbed(eventData as DisputeResolvedEventData, userRole);

      case "BuyOrderReducedEvent":
        return this.createBuyOrderReduceEmbed(eventData as BuyOrderReducedEventData, userRole);

      case "BuyerPaymentSentEvent":
        return this.createBuyerPaymentSentEmbed(eventData as BuyerPaymentSentEventData, userRole);

      case "BuyOrderCancelledEvent":
        return this.createBuyOrderCancelledEmbed(eventData as BuyOrderCancelledEventData, userRole);

      case "PriceUpdatedEvent":
        return this.createPriceUpdatedEmbed(eventData as PriceUpdatedEventData, userRole);

      case "TrustVaultClosedEvent":
        return this.createTrustVaultClosedEmbed(eventData as TrustVaultClosedEventData, userRole);

        /** TRUST EXPRESS  */

      case "ExpressBuyOrderCreatedEvent":
        return this.createExpressBuyOrderEmbed(eventData as BuyOrderCreatedEventData, userRole);
  
      case "ExpressBuyOrderReducedEvent":
        return this.createExpressBuyOrderReduceEmbed(eventData as BuyOrderReducedEventData, userRole);
  
      case "ExpressBuyOrderCancelledEvent":
        return this.createExpressBuyOrderCancelledEmbed(eventData as BuyOrderCancelledEventData, userRole);

      case "ExpressPriceUpdatedEvent":
        return this.createExpressPriceUpdatedEmbed(eventData as PriceUpdatedEventData, userRole);

      case "InstantPaymentReservedEvent":
        return this.createInstantPaymentReservedEmbed(eventData as InstantPaymentReservedEventData, userRole);

      case "InstantPaymentPayoutResultEvent":
        return this.createInstantPaymentPayoutResultEmbed(eventData as InstantPaymentPayoutResultEventData, userRole);

      case "ExpressSellOrderCreatedEvent":
        return this.createExpressSellOrderEmbed(eventData as ExpressSellOrderCreatedEventData, userRole);

      case "InstantSellReservationCreatedEvent":
        return this.createInstantSellReservationEmbed(eventData as InstantSellReservationCreatedEventData, userRole);

      case "InstantSellPaymentResultEvent":
        return this.createInstantSellPaymentResultEmbed(eventData as InstantSellPaymentResultEventData, userRole);

      default:
        return this.createGenericEmbed(eventType, eventData, userRole);
    }
  }

  /**
   * Sell Order Created - Role-specific messages
   */
  private createTrustVaultEmbed(data: TrustVaultCreatedEventData, role: UserRole): EmbedBuilder {
    if (role === "seller") {
      return new EmbedBuilder()
        .setTitle("🏦 Your Sell Order is Live!")
        .setColor(this.colors.SUCCESS)
        .setDescription("Your tokens are now available for purchase by buyers.")
        .addFields(
          {
            name: "💰 Amount",
            value: `${data.amountFormatted} tokens`,
            inline: true,
          },
          {
            name: "💵 Price",
            value: `${data.pricePerToken} ${data.currency} per token`,
            inline: true,
          },
          {
            name: "🏪 Vault Address",
            value: `\`${data.trustVault || 'N/A'}\``,
            inline: false,
          },
          {
            name: "📋 Next Steps",
            value:
              "Wait for buyers to reserve your tokens. You'll be notified when someone makes a reservation.",
            inline: false,
          }
        )
        .setTimestamp()
        .setFooter({ text: "Trust Vault Notification" });
    }

    return new EmbedBuilder()
      .setTitle("🏦 New Sell Order Available")
      .setColor(this.colors.INFO)
      .addFields(
        { name: "Seller", value: `\`${data.seller}\``, inline: true },
        {
          name: "Amount",
          value: `${data.amountFormatted} tokens`,
          inline: true,
        },
        {
          name: "Price",
          value: `${data.pricePerToken} ${data.currency}`,
          inline: true,
        }
      )
      .setTimestamp()
      .setFooter({ text: "Trust Vault Notification" });
  }

  /**
   * Buy Order Created - Role-specific messages
   */
  private createBuyOrderEmbed(data: BuyOrderCreatedEventData, role: UserRole): EmbedBuilder {
    if (role === "buyer") {
      return new EmbedBuilder()
        .setTitle("🛒 Your Buy Order is Active!")
        .setColor(this.colors.SUCCESS)
        .setDescription(
          "Your buy order is now live. Sellers can now reserve tokens for you."
        )
        .addFields(
          {
            name: "🎯 Buying",
            value: `${data.amountFormatted} tokens`,
            inline: true,
          },
          {
            name: "💵 At price of",
            value: `${data.pricePerToken} ${data.currency} per token`,
            inline: true,
          },
          {
            name: "🏪 Vault Address",
            value: `\`${data.trustVault || 'N/A'}\``,
            inline: false,
          },
          {
            name: "📋 Next Steps",
            value:
              "Wait for sellers to reserve tokens for you. You'll be notified when someone accepts your order.",
            inline: false,
          }
        )
        .setTimestamp()
        .setFooter({ text: "Trust Vault Notification" });
    }

    return new EmbedBuilder()
      .setTitle("🛒 New Buy Order Available")
      .setColor(this.colors.INFO)
      .addFields(
        { name: "Buyer", value: `\`${data.buyer}\``, inline: true },
        {
          name: "Amount",
          value: `${data.amountFormatted} tokens`,
          inline: true,
        },
        {
          name: "Price",
          value: `${data.pricePerToken} ${data.currency}`,
          inline: true,
        }
      )
      .setTimestamp()
      .setFooter({ text: "Trust Vault Notification" });
  }

  /**
   * Tokens Reserved - Role-specific messages
   */
  private createTokensReservedEmbed(data: TokensReservedEventData, role: UserRole): EmbedBuilder {
    if (role === "seller") {
      return new EmbedBuilder()
        .setTitle("🔒 Your Tokens Have Been Reserved!")
        .setColor(this.colors.WARNING)
        .setDescription(
          "A buyer has reserved some of your tokens. They will now send payment."
        )
        .addFields(
          { name: "👤 Buyer", value: `\`${data.buyer}\``, inline: true },
          {
            name: "🪙 Reserved Amount",
            value: `${data.amountFormatted} tokens`,
            inline: true,
          },
          {
            name: "💰 Expected Payment",
            value: `${data.fiatAmountFormatted} ${data.currency}`,
            inline: true,
          },
          {
            name: "📋 Next Steps",
            value:
              "Wait for the buyer to send payment. You'll be notified when they mark payment as sent.",
            inline: false,
          }
        )
        .setTimestamp()
        .setFooter({ text: "Trust Vault Notification" });
    } else if (role === "buyer") {
      return new EmbedBuilder()
        .setTitle("🔒 Tokens Reserved Successfully!")
        .setColor(this.colors.SUCCESS)
        .setDescription(
          "You have successfully reserved tokens. Please send payment to the seller."
        )
        .addFields(
          { name: "👤 Seller", value: `\`${data.seller}\``, inline: true },
          {
            name: "🪙 Reserved Amount",
            value: `${data.amountFormatted} tokens`,
            inline: true,
          },
          {
            name: "💸 Payment Due",
            value: `${data.fiatAmountFormatted} ${data.currency}`,
            inline: true,
          },
          {
            name: "📋 Next Steps",
            value:
              "Send payment to the seller according to their payment instructions, then mark payment as sent.",
            inline: false,
          }
        )
        .setTimestamp()
        .setFooter({ text: "Trust Vault Notification" });
    }

    return this.createGenericEmbed("TokensReservedEvent", data, role);
  }

  /**
   * Buy order Reserved - Role-specific messages
   */
  private createBuyOrderReservedEmbed(data: BuyOrderReservedEventData, role: UserRole): EmbedBuilder {
    if (role === "seller") {
      return new EmbedBuilder()
        .setTitle("🔒 You have deposited tokens into a buy order!")
        .setColor(this.colors.WARNING)
        .setDescription("They will now send payment to your account.")
        .addFields(
          { name: "👤 Buyer", value: `\`${data.buyer}\``, inline: true },
          {
            name: "🪙 Reserved Amount",
            value: `${data.amountFormatted} tokens`,
            inline: true,
          },
          {
            name: "💰 Expected Payment",
            value: `${data.fiatAmountFormatted} ${data.currency}`,
            inline: true,
          },
          {
            name: "📋 Next Steps",
            value:
              "Wait for the buyer to send payment. You'll be notified when they mark payment as sent.",
            inline: false,
          }
        )
        .setTimestamp()
        .setFooter({ text: "Trust Vault Notification" });
    } else if (role === "buyer") {
      return new EmbedBuilder()
        .setTitle("🔒 Buy order filled!")
        .setColor(this.colors.SUCCESS)
        .setDescription(
          "A seller has filled your buy order. Please send payment to the seller."
        )
        .addFields(
          { name: "👤 Seller", value: `\`${data.seller}\``, inline: true },
          {
            name: "🪙 Reserved Amount",
            value: `${data.amountFormatted} tokens`,
            inline: true,
          },
          {
            name: "💸 Payment Due",
            value: `${data.fiatAmountFormatted} ${data.currency}`,
            inline: true,
          },
          {
            name: "📋 Next Steps",
            value:
              "Send payment to the seller according to their payment instructions, then mark payment as sent.",
            inline: false,
          }
        )
        .setTimestamp()
        .setFooter({ text: "Trust Vault Notification" });
    }

    return this.createGenericEmbed("BuyOrderReservedEvent", data, role);
  }

  /**
   * Payment Sent - Role-specific messages
   */
  private createPaymentSentEmbed(data: PaymentSentEventData, role: UserRole): EmbedBuilder {
    if (role === "seller") {
      return new EmbedBuilder()
        .setTitle("💸 Payment Sent - Action Required!")
        .setColor(this.colors.WARNING)
        .setDescription(
          "The buyer has marked payment as sent. Please verify and confirm receipt."
        )
        .addFields(
          { name: "👤 Buyer", value: `\`${data.buyer}\``, inline: true },
          {
            name: "🪙 Token Amount",
            value: `${data.amountFormatted} tokens`,
            inline: true,
          },
          {
            name: "💰 Payment Amount",
            value: `${data.fiatAmountFormatted} ${data.currency}`,
            inline: true,
          },
          {
            name: "⚠️ Action Required",
            value:
              "Check your payment method and confirm receipt to release the tokens.",
            inline: false,
          }
        )
        .setTimestamp()
        .setFooter({ text: "Trust Vault Notification" });
    } else if (role === "buyer") {
      return new EmbedBuilder()
        .setTitle("💸 Payment Marked as Sent")
        .setColor(this.colors.INFO)
        .setDescription(
          "You have successfully marked payment as sent. Wait for seller confirmation."
        )
        .addFields(
          { name: "👤 Seller", value: `\`${data.seller}\``, inline: true },
          {
            name: "🪙 Token Amount",
            value: `${data.amountFormatted} tokens`,
            inline: true,
          },
          {
            name: "💰 Payment Amount",
            value: `${data.fiatAmountFormatted} ${data.currency}`,
            inline: true,
          },
          {
            name: "📋 Next Steps",
            value:
              "Wait for the seller to confirm payment receipt. Tokens will be released automatically.",
            inline: false,
          }
        )
        .setTimestamp()
        .setFooter({ text: "Trust Vault Notification" });
    }

    return this.createGenericEmbed("PaymentSentEvent", data, role);
  }

  /**
   * Buyer Payment Sent - Role-specific messages
   */
  private createBuyerPaymentSentEmbed(data: BuyerPaymentSentEventData, role: UserRole): EmbedBuilder {
    if (role === "seller") {
      return new EmbedBuilder()
        .setTitle("💸 Payment Sent - Action Required!")
        .setColor(this.colors.WARNING)
        .setDescription(
          "The buyer has marked payment as sent. Please verify and confirm receipt."
        )
        .addFields(
          { name: "👤 Buyer", value: `\`${data.buyer}\``, inline: true },
          {
            name: "🪙 Token Amount",
            value: `${data.amountFormatted} tokens`,
            inline: true,
          },
          {
            name: "💰 Payment Amount",
            value: `${data.fiatAmountFormatted} ${data.currency}`,
            inline: true,
          },
          {
            name: "⚠️ Action Required",
            value:
              "Check your payment method and confirm receipt to release the tokens.",
            inline: false,
          }
        )
        .setTimestamp()
        .setFooter({ text: "Trust Vault Notification" });
    } else if (role === "buyer") {
      return new EmbedBuilder()
        .setTitle("💸 Payment Marked as Sent")
        .setColor(this.colors.INFO)
        .setDescription(
          "You have successfully marked payment as sent. Wait for seller confirmation."
        )
        .addFields(
          { name: "👤 Seller", value: `\`${data.seller}\``, inline: true },
          {
            name: "🪙 Token Amount",
            value: `${data.amountFormatted} tokens`,
            inline: true,
          },
          {
            name: "💰 Payment Amount",
            value: `${data.fiatAmountFormatted} ${data.currency}`,
            inline: true,
          },
          {
            name: "📋 Next Steps",
            value:
              "Wait for the seller to confirm payment receipt. Tokens will be released automatically.",
            inline: false,
          }
        )
        .setTimestamp()
        .setFooter({ text: "Trust Vault Notification" });
    }

    return this.createGenericEmbed("BuyerPaymentSentEvent", data, role);
  }

  /**
   * Payment Confirmed - Role-specific messages
   */
  public createPaymentConfirmedEmbed(data: PaymentConfirmedEventData, role: UserRole): EmbedBuilder {
    if (role === "seller") {
      return new EmbedBuilder()
        .setTitle("✅ Payment Confirmed - Tokens Released!")
        .setColor(this.colors.SUCCESS)
        .setDescription(
          "You have successfully confirmed payment receipt. Tokens have been transferred to the buyer."
        )
        .addFields(
          { name: "👤 Buyer", value: `\`${data.buyer}\``, inline: true },
          {
            name: "🪙 Tokens Transferred",
            value: `${data.amountFormatted} tokens`,
            inline: true,
          },
          {
            name: "💰 Payment Received",
            value: `${data.fiatAmountFormatted} ${data.currency}`,
            inline: true,
          },
          {
            name: "🎉 Transaction Complete",
            value: "This transaction has been completed successfully!",
            inline: false,
          }
        )
        .setTimestamp()
        .setFooter({ text: "Trust Vault Notification" });
    } else if (role === "buyer") {
      return new EmbedBuilder()
        .setTitle("🎉 Tokens Received!")
        .setColor(this.colors.SUCCESS)
        .setDescription(
          "The seller has confirmed your payment. Tokens have been transferred to your wallet!"
        )
        .addFields(
          { name: "👤 Seller", value: `\`${data.seller}\``, inline: true },
          {
            name: "🪙 Tokens Received",
            value: `${data.amountFormatted} tokens`,
            inline: true,
          },
          {
            name: "💰 Payment Amount",
            value: `${data.fiatAmountFormatted} ${data.currency}`,
            inline: true,
          },
          {
            name: "🎉 Transaction Complete",
            value: "Check your wallet - the tokens should now be available!",
            inline: false,
          }
        )
        .setTimestamp()
        .setFooter({ text: "Trust Vault Notification" });
    }

    return this.createGenericEmbed("PaymentConfirmedEvent", data, role);
  }

  /**
   * Seller Payment Confirmed - Role-specific messages
   */
  private createSellerConfirmsPaymentEmbed(data: SellerConfirmsPaymentEventData, role: UserRole): EmbedBuilder {
    if (role === "seller") {
      return new EmbedBuilder()
        .setTitle("✅ Payment Confirmed - Tokens Released!")
        .setColor(this.colors.SUCCESS)
        .setDescription(
          "You have successfully confirmed payment receipt. Tokens have been transferred to the buyer."
        )
        .addFields(
          { name: "👤 Buyer", value: `\`${data.buyer}\``, inline: true },
          {
            name: "🪙 Tokens Transferred",
            value: `${data.amountFormatted} tokens`,
            inline: true,
          },
          {
            name: "💰 Payment Received",
            value: `${data.fiatAmountFormatted} ${data.currency}`,
            inline: true,
          },
          {
            name: "🎉 Transaction Complete",
            value: "This transaction has been completed successfully!",
            inline: false,
          }
        )
        .setTimestamp()
        .setFooter({ text: "Trust Vault Notification" });
    } else if (role === "buyer") {
      return new EmbedBuilder()
        .setTitle("🎉 Tokens Received!")
        .setColor(this.colors.SUCCESS)
        .setDescription(
          "The seller has confirmed your payment. Tokens have been transferred to your wallet!"
        )
        .addFields(
          { name: "👤 Seller", value: `\`${data.seller}\``, inline: true },
          {
            name: "🪙 Tokens Received",
            value: `${data.amountFormatted} tokens`,
            inline: true,
          },
          {
            name: "💰 Payment Amount",
            value: `${data.fiatAmountFormatted} ${data.currency}`,
            inline: true,
          },
          {
            name: "🎉 Transaction Complete",
            value: "Check your wallet - the tokens should now be available!",
            inline: false,
          }
        )
        .setTimestamp()
        .setFooter({ text: "Trust Vault Notification" });
    }

    return this.createGenericEmbed("SellerConfirmsPaymentEvent", data, role);
  }

  /**
   * Withdrawal Processed - Role-specific messages
   */
  private createWithdrawalEmbed(data: WithdrawalProcessedEventData, role: UserRole): EmbedBuilder {
    if (role === "seller") {
      return new EmbedBuilder()
        .setTitle("💰 Withdrawal Processed")
        .setColor(this.colors.PURPLE)
        .setDescription(
          data.vaultClosed
            ? "Your vault has been closed and tokens withdrawn."
            : "Partial withdrawal processed successfully."
        )
        .addFields(
          {
            name: "🪙 Withdraw Amount",
            value: `${data.withdrawAmount} tokens`,
            inline: true,
          },
          {
            name: "💸 Fee Refund",
            value: `${data.feeRefund} tokens`,
            inline: true,
          },
          {
            name: "🏪 Vault Status",
            value: data.vaultClosed ? "Closed" : "Still Active",
            inline: true,
          },
          {
            name: "📋 Summary",
            value: data.vaultClosed
              ? "Your vault has been completely closed and all remaining tokens returned."
              : "Partial withdrawal completed. Your vault remains active.",
            inline: false,
          }
        )
        .setTimestamp()
        .setFooter({ text: "Trust Vault Notification" });
    }

    return this.createGenericEmbed("WithdrawalProcessedEvent", data, role);
  }

  /**
   * Buy Order Reduce - Role-specific messages
   */
  private createBuyOrderReduceEmbed(data: BuyOrderReducedEventData, role: UserRole): EmbedBuilder {
    if (role === "buyer") {
      return new EmbedBuilder()
        .setTitle("💰 Buy order reduce")
        .setColor(this.colors.PURPLE)
        .setDescription("Your buy order has been reduced.")
        .addFields(
          {
            name: "🪙 Original amount",
            value: `${data.originalAmount} tokens`,
            inline: true,
          },
          {
            name: "💸 New amount",
            value: `${data.newAmount} tokens`,
            inline: true,
          }
        )
        .setTimestamp()
        .setFooter({ text: "Trust Vault Notification" });
    }

    return this.createGenericEmbed("BuyOrderReducedEvent", data, role);
  }

  /**
   * Buy Order cancelled - Role-specific messages
   */
  private createBuyOrderCancelledEmbed(data: BuyOrderCancelledEventData, role: UserRole): EmbedBuilder {
    if (role === "buyer") {
      return new EmbedBuilder()
        .setTitle("💰 Buy order cancelled")
        .setColor(this.colors.PURPLE)
        .setDescription("You have cancelled your buy order.")
        .addFields()
        .setTimestamp()
        .setFooter({ text: "Trust Vault Notification" });
    }

    return this.createGenericEmbed("BuyOrderCancelledEvent", data, role);
  }

  /**
   * Sell order closed - Role-specific messages
   */
  private createTrustVaultClosedEmbed(data: TrustVaultClosedEventData, role: UserRole): EmbedBuilder {
    if (role === "seller") {
      return new EmbedBuilder()
        .setTitle("💰 Sell order cancelled")
        .setColor(this.colors.PURPLE)
        .setDescription("You have cancelled your sell order.")
        .addFields()
        .setTimestamp()
        .setFooter({ text: "Trust Vault Notification" });
    }

    return this.createGenericEmbed("TrustVaultClosedEvent", data, role);
  }

  /**
   * Price Updated - Role-specific messages
   */
  private createPriceUpdatedEmbed(data: PriceUpdatedEventData, role: UserRole): EmbedBuilder {
    if (role === "seller") {
      return new EmbedBuilder()
        .setTitle("💰 Price changed")
        .setColor(this.colors.PURPLE)
        .setDescription("You have changed the price.")
        .addFields(
          {
            name: "💵 New Price",
            value: `${data.newPrice} ${data.currency}`,
            inline: true,
          },
          ...(data.oldPrice ? [{
            name: "📊 Previous Price",
            value: `${data.oldPrice} ${data.currency}`,
            inline: true,
          }] : [])
        )
        .setTimestamp()
        .setFooter({ text: "Trust Vault Notification" });
    }

    return this.createGenericEmbed("PriceUpdatedEvent", data, role);
  }

  /**
   * Reservation Cancelled - Role-specific messages
   */
  private createCancellationEmbed(data: ReservationCancelledEventData, role: UserRole): EmbedBuilder {
    if (role === "seller") {
      return new EmbedBuilder()
        .setTitle("❌ Reservation Cancelled")
        .setColor(this.colors.WARNING)
        .setDescription("A buyer has cancelled their token reservation.")
        .addFields({
          name: "📋 Status",
          value: "These tokens are now available for other buyers to reserve.",
          inline: false,
        })
        .setTimestamp()
        .setFooter({ text: "Trust Vault Notification" });
    } else if (role === "buyer") {
      return new EmbedBuilder()
        .setTitle("❌ Reservation Cancelled")
        .setColor(this.colors.INFO)
        .setDescription(
          "You have successfully cancelled your token reservation."
        )
        .addFields(
          { name: "👤 Seller", value: `\`${data.seller}\``, inline: true },
          {
            name: "🪙 Cancelled Amount",
            value: `${data.amountFormatted} tokens`,
            inline: true,
          },
          {
            name: "📋 Status",
            value:
              "Your reservation has been cancelled. No payment is required.",
            inline: false,
          }
        )
        .setTimestamp()
        .setFooter({ text: "Trust Vault Notification" });
    }

    return this.createGenericEmbed("ReservationCancelledEvent", data, role);
  }

  /**
   * Updated create Dispute method with better role handling
   */
  private createDisputeEmbed(data: DisputeCreatedEventData, role: UserRole): EmbedBuilder {
    const userWalletAddress = this.getUserWalletFromRole(data, role);
    const isDisputer =
      userWalletAddress === data.disputer ||
      userWalletAddress === data.disputerAddress ||
      role === "disputer" ||
      role === "disputerAddress";

    if (isDisputer) {
      return new EmbedBuilder()
        .setTitle("⚠️ Dispute Created")
        .setColor(this.colors.ERROR)
        .setDescription(
          "You have successfully created a dispute for this transaction."
        )
        .addFields(
          {
            name: "🆔 Dispute ID",
            value: `\`${data.disputeId}\``,
            inline: true,
          },
          {
            name: "👤 Other Party",
            value: `\`${data.otherPartyAddress}\``,
            inline: true,
          },
          {
            name: "💰 Amount",
            value: `${data.amountFormatted} tokens`,
            inline: true,
          },
          {
            name: "💵 Fiat Amount",
            value: `${data.fiatAmountFormatted} ${data.currency}`,
            inline: true,
          },
          {
            name: "📝 Reason",
            value: data.reason || "No reason provided",
            inline: false,
          },
          {
            name: "📋 Next Steps",
            value:
              "Please contact support with your dispute ID in our [Discord server](https://discord.gg/34vsB6xx) and provide your evidence to resolve this issue. The transaction is now frozen until resolved.",
            inline: false,
          }
        )
        .setTimestamp()
        .setFooter({ text: "Trust Vault Notification" });
    } else {
      return new EmbedBuilder()
        .setTitle("⚠️ Dispute Filed Against Transaction")
        .setColor(this.colors.ERROR)
        .setDescription(
          "A dispute has been filed for one of your transactions."
        )
        .addFields(
          {
            name: "🆔 Dispute ID",
            value: `\`${data.disputeId}\``,
            inline: true,
          },
          {
            name: "👤 Filed By",
            value: `\`${data.disputer}\``,
            inline: true,
          },
          {
            name: "💰 Amount",
            value: `${data.amountFormatted} tokens`,
            inline: true,
          },
          {
            name: "💵 Fiat Amount",
            value: `${data.fiatAmountFormatted} ${data.currency}`,
            inline: true,
          },
          {
            name: "📝 Reason",
            value: data.reason || "No reason provided",
            inline: false,
          },
          {
            name: "📋 Action Required",
            value:
              "Please contact support with the dispute ID in our [Discord server](https://discord.gg/34vsB6xx) and provide your evidence to resolve this issue. The transaction is frozen.",
            inline: false,
          }
        )
        .setTimestamp()
        .setFooter({ text: "Trust Vault Notification" });
    }
  }

  /**
   * Dispute Resolved - Role-specific messages
   */
  private createDisputeResolvedEmbed(data: DisputeResolvedEventData, role: UserRole): EmbedBuilder {
    const userWalletAddress = this.getUserWalletFromRole(data, role);
    const isDisputer =
      userWalletAddress === data.disputer ||
      userWalletAddress === data.disputerAddress ||
      role === "disputer" ||
      role === "disputerAddress";

    if (isDisputer) {
      return new EmbedBuilder()
        .setTitle("✅ Dispute Resolved")
        .setColor(this.colors.SUCCESS)
        .setDescription("The dispute has been resolved.")
        .addFields(
          {
            name: "🆔 Dispute ID",
            value: `\`${data.disputeId}\``,
            inline: true,
          },
          {
            name: "👤 Other Party",
            value: `\`${data.otherPartyAddress}\``,
            inline: true,
          },
          {
            name: "💰 Amount",
            value: `${data.amountFormatted} tokens`,
            inline: true,
          },
          {
            name: "💵 Fiat Amount",
            value: `${data.fiatAmountFormatted} ${data.currency}`,
            inline: true,
          },
          {
            name: "📝 Reason",
            value: data.reason || "No reason provided",
            inline: false,
          },
          {
            name: "📋 Status",
            value:
              "The dispute has been resolved. Check with support for details.",
            inline: false,
          }
        )
        .setTimestamp()
        .setFooter({ text: "Trust Vault Notification" });
    } else {
      return new EmbedBuilder()
        .setTitle("✅ Dispute Resolved")
        .setColor(this.colors.INFO)
        .setDescription(
          "A dispute involving your transaction has been resolved."
        )
        .addFields(
          {
            name: "🆔 Dispute ID",
            value: `\`${data.disputeId}\``,
            inline: true,
          },
          {
            name: "👤 Filed By",
            value: `\`${data.disputer}\``,
            inline: true,
          },
          {
            name: "💰 Amount",
            value: `${data.amountFormatted} tokens`,
            inline: true,
          },
          {
            name: "💵 Fiat Amount",
            value: `${data.fiatAmountFormatted} ${data.currency}`,
            inline: true,
          },
          {
            name: "📝 Reason",
            value: data.reason || "No reason provided",
            inline: false,
          },
          {
            name: "📋 Status",
            value:
              "The dispute has been resolved. Check with support for details.",
            inline: false,
          }
        )
        .setTimestamp()
        .setFooter({ text: "Trust Vault Notification" });
    }
  }

                /**
                  *  TRUST EXPRESS
                  */

   /**
   * Buy Order Created - Role-specific messages
   */
  private createExpressBuyOrderEmbed(data: ExpressBuyOrderCreatedEventData, role: UserRole): EmbedBuilder {
    if (role === "buyer") {
      return new EmbedBuilder()
        .setTitle("🛒 Your Express Buy Order is Active!")
        .setColor(this.colors.SUCCESS)
        .setDescription(
          "Your buy order is now live. Sellers can now reserve tokens for you."
        )
        .addFields(
          {
            name: "🎯 Buying",
            value: `${data.amountFormatted} tokens`,
            inline: true,
          },
          {
            name: "💵 At price of",
            value: `${data.pricePerToken} ${data.currency} per token`,
            inline: true,
          },
          {
            name: "🏪 Vault Address",
            value: `\`${data.trustVault || 'N/A'}\``,
            inline: false,
          },
          {
            name: "📋 Next Steps",
            value:
              "Wait for sellers to reserve tokens for you. You'll be notified when someone accepts your order.",
            inline: false,
          }
        )
        .setTimestamp()
        .setFooter({ text: "Trust Vault Notification" });
    }

    return new EmbedBuilder()
      .setTitle("🛒 New Express Buy Order Available")
      .setColor(this.colors.INFO)
      .addFields(
        { name: "Buyer", value: `\`${data.buyer}\``, inline: true },
        {
          name: "Amount",
          value: `${data.amountFormatted} tokens`,
          inline: true,
        },
        {
          name: "Price",
          value: `${data.pricePerToken} ${data.currency}`,
          inline: true,
        }
      )
      .setTimestamp()
      .setFooter({ text: "Trust Vault Notification" });
  }                


  /**
   * Price Updated - Role-specific messages
   */
  private createExpressPriceUpdatedEmbed(data: PriceUpdatedEventData, role: UserRole): EmbedBuilder {
    if (role === "seller") {
      return new EmbedBuilder()
        .setTitle("💰 Express Price changed")
        .setColor(this.colors.PURPLE)
        .setDescription("You have changed the price.")
        .addFields(
          {
            name: "💵 New Price",
            value: `${data.newPrice} ${data.currency}`,
            inline: true,
          },
          ...(data.oldPrice ? [{
            name: "📊 Previous Price",
            value: `${data.oldPrice} ${data.currency}`,
            inline: true,
          }] : [])
        )
        .setTimestamp()
        .setFooter({ text: "Trust Vault Notification" });
    }

    return this.createGenericEmbed("ExpressPriceUpdatedEvent", data, role);
  }
   /**
   * Express Buy Order Reduce - Role-specific messages
   */
  private createExpressBuyOrderReduceEmbed(data: BuyOrderReducedEventData, role: UserRole): EmbedBuilder {
    if (role === "buyer") {
      return new EmbedBuilder()
        .setTitle("💰 Express Buy order reduce")
        .setColor(this.colors.PURPLE)
        .setDescription("Your buy order has been reduced.")
        .addFields(
          {
            name: "🪙 Original amount",
            value: `${data.originalAmount} tokens`,
            inline: true,
          },
          {
            name: "💸 New amount",
            value: `${data.newAmount} tokens`,
            inline: true,
          }
        )
        .setTimestamp()
        .setFooter({ text: "Trust Vault Notification" });
    }

    return this.createGenericEmbed("BuyOrderReducedEvent", data, role);
  }

  /**
   * Express Buy Order cancelled - Role-specific messages
   */
  private createExpressBuyOrderCancelledEmbed(data: BuyOrderCancelledEventData, role: UserRole): EmbedBuilder {
    if (role === "buyer") {
      return new EmbedBuilder()
        .setTitle("💰 Express Buy order cancelled")
        .setColor(this.colors.PURPLE)
        .setDescription("You have cancelled your buy order.")
        .addFields()
        .setTimestamp()
        .setFooter({ text: "Trust Vault Notification" });
    }

    return this.createGenericEmbed("ExpressBuyOrderCancelledEvent", data, role);
  }
    /**
   * Instant Payment Reserved - Role-specific messages
   */
  private createInstantPaymentReservedEmbed(data: InstantPaymentReservedEventData, role: UserRole): EmbedBuilder {
    if (role === "taker" || role === "user") {
      return new EmbedBuilder()
        .setTitle("⚡ Instant Payment Initiated!")
        .setColor(this.colors.INFO)
        .setDescription(
          "Your instant payment request has been processed. Payout is being initiated."
        )
        .addFields(
          {
            name: "💰 Token Amount",
            value: `${data.amountFormatted} tokens`,
            inline: true,
          },
          {
            name: "💵 Fiat Amount",
            value: `${data.fiatAmountFormatted} ${data.currency}`,
            inline: true,
          },
          {
            name: "📖 Reference",
            value: `\`${data.payoutReference}\``,
            inline: true,
          },
          {
            name: "📋 Status",
            value:
              "Processing payout to your account. You'll be notified once complete.",
            inline: false,
          }
        )
        .setTimestamp()
        .setFooter({ text: "Trust Express Instant Payment" });
    } else if (role === "maker") {
      return new EmbedBuilder()
        .setTitle("⚡ Instant Payment Request Received")
        .setColor(this.colors.WARNING)
        .setDescription(
          "A user has initiated an instant payment through your liquidity pool."
        )
        .addFields(
          {
            name: "👤 User",
            value: `\`${data.taker}\``,
            inline: true,
          },
          {
            name: "💰 Token Amount",
            value: `${data.amountFormatted} tokens`,
            inline: true,
          },
          {
            name: "💵 Payout Amount",
            value: `${data.fiatAmountFormatted} ${data.currency}`,
            inline: true,
          },
          {
            name: "📖 Reference",
            value: `\`${data.payoutReference}\``,
            inline: true,
          },
          {
            name: "📋 Status",
            value: "Payout is being processed through your payment service.",
            inline: false,
          }
        )
        .setTimestamp()
        .setFooter({ text: "Trust Express Liquidity Provider" });
    }

    return this.createGenericEmbed("InstantPaymentReservedEvent", data, role);
  }

  /**
   * Instant Payment Payout Result - Role-specific messages
   */
  private createInstantPaymentPayoutResultEmbed(data: InstantPaymentPayoutResultEventData, role: UserRole): EmbedBuilder {
    if (role === "taker" || role === "user") {
      if (data.success) {
        return new EmbedBuilder()
          .setTitle("🎉 Instant Payment Completed!")
          .setColor(this.colors.SUCCESS)
          .setDescription(
            "Your instant payment has been successfully processed and sent to your account."
          )
          .addFields(
            {
              name: "💰 Token Amount",
              value: `${data.amountFormatted} tokens`,
              inline: true,
            },
            {
              name: "💵 Amount Received",
              value: `${data.fiatAmountFormatted} ${data.currency}`,
              inline: true,
            },
            {
              name: "📖 Reference",
              value: `\`${data.payoutReference}\``,
              inline: true,
            },
            {
              name: "✅ Status",
              value: "Payment completed successfully! Check your account.",
              inline: false,
            }
          )
          .setTimestamp()
          .setFooter({ text: "Trust Express Instant Payment" });
      } else {
        return new EmbedBuilder()
          .setTitle("❌ Instant Payment Failed")
          .setColor(this.colors.ERROR)
          .setDescription(
            "Your instant payment could not be processed. Tokens have been refunded."
          )
          .addFields(
            {
              name: "💰 Refunded Amount",
              value: `${data.amountFormatted} tokens`,
              inline: true,
            },
            {
              name: "📖 Reference",
              value: `\`${data.payoutReference}\``,
              inline: true,
            },
            {
              name: "❌ Error",
              value: String(data.message || "Payout failed"),
              inline: false,
            },
            {
              name: "📋 Next Steps",
              value:
                "Your tokens have been returned to your wallet. You can try again or contact support.",
              inline: false,
            }
          )
          .setTimestamp()
          .setFooter({ text: "Trust Express Instant Payment" });
      }
    } else if (role === "maker") {
      if (data.success) {
        return new EmbedBuilder()
          .setTitle("✅ Instant Payment Processed")
          .setColor(this.colors.SUCCESS)
          .setDescription(
            "An instant payment through your liquidity pool was successfully processed."
          )
          .addFields(
            {
              name: "👤 User",
              value: `\`${data.taker}\``,
              inline: true,
            },
            {
              name: "💰 Token Amount",
              value: `${data.amountFormatted} tokens`,
              inline: true,
            },
            {
              name: "💵 Payout Amount",
              value: `${data.fiatAmountFormatted} ${data.currency}`,
              inline: true,
            },
            {
              name: "📖 Reference",
              value: `\`${data.payoutReference}\``,
              inline: true,
            }
          )
          .setTimestamp()
          .setFooter({ text: "Trust Express Liquidity Provider" });
      } else {
        return new EmbedBuilder()
          .setTitle("❌ Instant Payment Failed")
          .setColor(this.colors.ERROR)
          .setDescription(
            "An instant payment through your liquidity pool failed. User has been refunded."
          )
          .addFields(
            {
              name: "👤 User",
              value: `\`${data.taker}\``,
              inline: true,
            },
            {
              name: "📖 Reference",
              value: `\`${data.payoutReference}\``,
              inline: true,
            },
            {
              name: "❌ Error",
              value: String(data.message || "Payout failed"),
              inline: false,
            }
          )
          .setTimestamp()
          .setFooter({ text: "Trust Express Liquidity Provider" });
      }
    }

    return this.createGenericEmbed("InstantPaymentPayoutResultEvent", data, role);
  }

  private createExpressSellOrderEmbed(data: ExpressSellOrderCreatedEventData, role: UserRole): EmbedBuilder {
  if (role === "seller") {
    return new EmbedBuilder()
      .setTitle("🏪 Your Express Sell Order is Live!")
      .setColor(this.colors.SUCCESS)
      .setDescription("Your tokens are now available for instant purchase by buyers.")
      .addFields(
        {
          name: "💰 Amount",
          value: `${data.amountFormatted} tokens`,
          inline: true,
        },
        {
          name: "💵 Price",
          value: `${data.pricePerToken} ${data.currency} per token`,
          inline: true,
        },
        {
          name: "🏪 Express Address",
          value: `\`${data.trustExpress || 'N/A'}\``,
          inline: false,
        },
        {
          name: "📋 Next Steps",
          value:
            "Wait for buyers to purchase. You'll be notified when someone makes a purchase.",
          inline: false,
        }
      )
      .setTimestamp()
      .setFooter({ text: "Trust Express Notification" });
  }

  return new EmbedBuilder()
    .setTitle("🏪 New Express Sell Order Available")
    .setColor(this.colors.INFO)
    .addFields(
      { name: "Seller", value: `\`${data.seller}\``, inline: true },
      {
        name: "Amount",
        value: `${data.amountFormatted} tokens`,
        inline: true,
      },
      {
        name: "Price",
        value: `${data.pricePerToken} ${data.currency}`,
        inline: true,
      }
    )
    .setTimestamp()
    .setFooter({ text: "Trust Express Notification" });
}

private createInstantSellReservationEmbed(data: InstantSellReservationCreatedEventData, role: UserRole): EmbedBuilder {
  if (role === "seller" || role === "maker") {
    return new EmbedBuilder()
      .setTitle("⚡ Instant Purchase - Payment Pending!")
      .setColor(this.colors.WARNING)
      .setDescription("A buyer has reserved tokens. Awaiting payment confirmation.")
      .addFields(
        {
          name: "👤 Buyer",
          value: `\`${data.buyer}\``,
          inline: true,
        },
        {
          name: "💰 Token Amount",
          value: `${data.amountFormatted} tokens`,
          inline: true,
        },
        {
          name: "💵 Payment Amount",
          value: `${data.fiatAmountFormatted} ${data.currency}`,
          inline: true,
        },
        {
          name: "💳 Payment Mode",
          value: data.paymentMode === 0 ? "Payment Link" : "Direct Transfer",
          inline: true,
        },
        {
          name: "📖 Reference",
          value: `\`${data.payoutReference}\``,
          inline: true,
        },
        {
          name: "📋 Status",
          value: "Waiting for buyer's payment confirmation.",
          inline: false,
        }
      )
      .setTimestamp()
      .setFooter({ text: "Trust Express Instant Sell" });
  } else if (role === "buyer" || role === "taker") {
    return new EmbedBuilder()
      .setTitle("⚡ Purchase Reserved - Complete Payment!")
      .setColor(this.colors.INFO)
      .setDescription("Your purchase has been reserved. Please complete payment.")
      .addFields(
        {
          name: "👤 Seller",
          value: `\`${data.seller}\``,
          inline: true,
        },
        {
          name: "💰 Token Amount",
          value: `${data.amountFormatted} tokens`,
          inline: true,
        },
        {
          name: "💸 Amount to Pay",
          value: `${data.fiatAmountFormatted} ${data.currency}`,
          inline: true,
        },
        {
          name: "💳 Payment Mode",
          value: data.paymentMode === 0 ? "Payment Link" : "Direct Transfer",
          inline: true,
        },
        {
          name: "📖 Reference",
          value: `\`${data.payoutReference}\``,
          inline: true,
        },
        {
          name: "📋 Next Steps",
          value: "Complete payment to receive your tokens.",
          inline: false,
        }
      )
      .setTimestamp()
      .setFooter({ text: "Trust Express Instant Sell" });
  }

  return this.createGenericEmbed("InstantSellReservationCreatedEvent", data, role);
}

private createInstantSellPaymentResultEmbed(data: InstantSellPaymentResultEventData, role: UserRole): EmbedBuilder {
  if (role === "seller" || role === "maker") {
    if (data.success) {
      return new EmbedBuilder()
        .setTitle("✅ Payment Confirmed - Transaction Complete!")
        .setColor(this.colors.SUCCESS)
        .setDescription("Buyer's payment confirmed. Tokens transferred successfully.")
        .addFields(
          {
            name: "👤 Buyer",
            value: `\`${data.buyer}\``,
            inline: true,
          },
          {
            name: "💰 Tokens Sold",
            value: `${data.amountFormatted} tokens`,
            inline: true,
          },
          {
            name: "💵 Amount Received",
            value: `${data.fiatAmountFormatted} ${data.currency}`,
            inline: true,
          },
          {
            name: "💸 Fee Collected",
            value: `${(Number(data.feeAmount) / 1e9).toFixed(2)} tokens`,
            inline: true,
          },
          {
            name: "📖 Reference",
            value: `\`${data.payoutReference}\``,
            inline: true,
          },
          {
            name: "🎉 Status",
            value: "Transaction completed successfully!",
            inline: false,
          }
        )
        .setTimestamp()
        .setFooter({ text: "Trust Express Instant Sell" });
    } else {
      return new EmbedBuilder()
        .setTitle("❌ Payment Failed - Tokens Returned")
        .setColor(this.colors.ERROR)
        .setDescription("Payment verification failed. Tokens returned to available pool.")
        .addFields(
          {
            name: "👤 Buyer",
            value: `\`${data.buyer}\``,
            inline: true,
          },
          {
            name: "💰 Tokens Returned",
            value: `${data.amountFormatted} tokens`,
            inline: true,
          },
          {
            name: "📖 Reference",
            value: `\`${data.payoutReference}\``,
            inline: true,
          },
          {
            name: "❌ Reason",
            value: data.message || "Payment verification failed",
            inline: false,
          }
        )
        .setTimestamp()
        .setFooter({ text: "Trust Express Instant Sell" });
    }
  } else if (role === "buyer" || role === "taker") {
    if (data.success) {
      return new EmbedBuilder()
        .setTitle("🎉 Tokens Received!")
        .setColor(this.colors.SUCCESS)
        .setDescription("Payment confirmed! Tokens have been transferred to your wallet.")
        .addFields(
          {
            name: "👤 Seller",
            value: `\`${data.seller}\``,
            inline: true,
          },
          {
            name: "💰 Tokens Received",
            value: `${data.amountFormatted} tokens`,
            inline: true,
          },
          {
            name: "💸 Amount Paid",
            value: `${data.fiatAmountFormatted} ${data.currency}`,
            inline: true,
          },
          {
            name: "📖 Reference",
            value: `\`${data.payoutReference}\``,
            inline: true,
          },
          {
            name: "🎉 Status",
            value: "Check your wallet - tokens should now be available!",
            inline: false,
          }
        )
        .setTimestamp()
        .setFooter({ text: "Trust Express Instant Sell" });
    } else {
      return new EmbedBuilder()
        .setTitle("❌ Purchase Failed")
        .setColor(this.colors.ERROR)
        .setDescription("Your purchase could not be completed.")
        .addFields(
          {
            name: "📖 Reference",
            value: `\`${data.payoutReference}\``,
            inline: true,
          },
          {
            name: "❌ Reason",
            value: data.message || "Payment verification failed",
            inline: false,
          },
          {
            name: "📋 Next Steps",
            value: "You can try purchasing again or contact support.",
            inline: false,
          }
        )
        .setTimestamp()
        .setFooter({ text: "Trust Express Instant Sell" });
    }
  }

  return this.createGenericEmbed("InstantSellPaymentResultEvent", data, role);
}

  /**
   * Helper method to get user wallet address from role
   */
  getUserWalletFromRole(data: EventData, role: UserRole): string | null {
    switch (role) {
      case "seller":
        return ('maker' in data && data.maker) || ('seller' in data && data.seller) || null;
      case "buyer":
        return ('taker' in data && data.taker) || ('buyer' in data && data.buyer) || null;
      case "disputer":
      case "disputerAddress":
        return ('disputer' in data && data.disputer) || ('disputerAddress' in data && data.disputerAddress) || null;
      case "otherPartyAddress":
        return ('otherPartyAddress' in data && data.otherPartyAddress) || null;
      default:
        return null;
    }
  }

  /**
   * Helper function to safely convert data values to strings for embeds
   */
  private formatEmbedValue(value: unknown): string {
    if (value === null || value === undefined) {
      return "N/A";
    }
    if (typeof value === "boolean") {
      return value ? "✅ Yes" : "❌ No";
    }
    if (typeof value === "object") {
      return JSON.stringify(value);
    }
    return String(value);
  }

  /**
   * Generic embed for unhandled event types
   */
  private createGenericEmbed(eventType: EventType, data: EventData, role: UserRole): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle(
        `📢 ${eventType
          .replace("Event", "")
          .replace(/([A-Z])/g, " $1")
          .trim()}`
      )
      .setColor(this.colors.NEUTRAL)
      .setDescription(
        `A ${eventType} occurred for your Trust Vault transaction.`
      )
      .setTimestamp()
      .setFooter({ text: "Trust Vault Notification" });

    const fields: Array<{ name: string; value: string; inline: boolean }> = [
      { name: "Event Type", value: eventType as string, inline: true },
      { name: "Your Role", value: role as string, inline: true }
    ];

    for (const [key, value] of Object.entries(data)) {
      if (key !== "timestamp" && key !== "transactionHash" && key !== "blockNumber") {
        fields.push({
          name: key.charAt(0).toUpperCase() + key.slice(1),
          value: this.formatEmbedValue(value),
          inline: true,
        });
      }
    }

    if (fields.length > 0) {
      embed.addFields(fields);
    }

    return embed;
  }

    /**
   * Create an error notification embed
   */
  createErrorEmbed(title: string, description: string, walletAddress?: string): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle(`⚠️ ${title}`)
      .setColor(this.colors.ERROR)
      .setDescription(description)
      .setTimestamp()
      .setFooter({ text: "Trust Express Error Notification" });

    if (walletAddress) {
      embed.addFields({
        name: "👤 Affected Wallet",
        value: `\`${walletAddress}\``,
        inline: false,
      });
    }

    return embed;
  }

  createReceiptEmbed(data: {
  receiptId: string;
  receiptUrl: string;
  payoutReference: string;
  amount: string;
  currency: string;
}): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle('📄 Transaction Receipt Generated')
    .setDescription('Your transaction receipt is ready')
    .addFields(
      { name: 'Receipt ID', value: data.receiptId, inline: true },
      { name: 'Reference', value: data.payoutReference, inline: true },
      { name: 'Amount', value: `${data.amount} ${data.currency}`, inline: true },
      { name: 'View Receipt', value: `[Click here](${data.receiptUrl})` }
    )
    .setTimestamp();
}

/**
 * Create a payment link embed for buyers
 */
createPaymentLinkEmbed(params: {
  paymentLink: string;
  amount: number;
  currency: string;
  reference: string;
}): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(this.colors.INFO)
    .setTitle('💳 Complete Your Payment')
    .setDescription('Your purchase has been reserved. Click the link below to complete payment.')
    .addFields(
      { name: '💰 Amount', value: `${params.amount} ${params.currency}`, inline: true },
      { name: '📖 Reference', value: `\`${params.reference}\``, inline: true },
      { name: '🔗 Payment Link', value: `[Click here to pay](${params.paymentLink})` },
      { 
        name: '📋 Instructions', 
        value: 'After payment, you will receive your tokens automatically.',
        inline: false 
      }
    )
    .setTimestamp()
    .setFooter({ text: "Trust Express Instant Sell" });
}

  /**
   * Create a test notification embed
   */
  createTestEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle("🤖 Bot Started Successfully")
      .setColor(this.colors.SUCCESS)
      .setDescription(
        "The Trust Vault Discord bot is now monitoring blockchain events."
      )
      .addFields(
        { name: "✅ Status", value: "Online and monitoring", inline: true },
        {
          name: "🔔 Notifications",
          value: "You will receive real-time updates",
          inline: true,
        },
        {
          name: "📋 Coverage",
          value: "All Trust Vault events are monitored",
          inline: false,
        }
      )
      .setTimestamp()
      .setFooter({ text: "Trust Vault Notification System" });
  }
}

export type {
  BaseEventData,
  TrustVaultCreatedEventData,
  BuyOrderCreatedEventData,
  TokensReservedEventData,
  BuyOrderReservedEventData,
  PaymentSentEventData,
  BuyerPaymentSentEventData,
  PaymentConfirmedEventData,
  SellerConfirmsPaymentEventData,
  WithdrawalProcessedEventData,
  BuyOrderReducedEventData,
  BuyOrderCancelledEventData,
  TrustVaultClosedEventData,
  PriceUpdatedEventData,
  ReservationCancelledEventData,
  DisputeCreatedEventData,
  DisputeResolvedEventData,
  InstantPaymentReservedEventData,
  InstantPaymentPayoutResultEventData,
  EventData,
  UserRole,
  EventType,
  Colors
};