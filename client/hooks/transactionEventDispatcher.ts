import { PublicKey } from "@solana/web3.js";
import {TransactionDetails,TransactionType,  } from "@/types/trustVault"

export const TRANSACTION_EVENT = "trust_vault:transaction";

// Define a specific type for additional details
export interface AdditionalDetails {
  [key: string]: string | number | boolean | PublicKey | null | undefined;
}

// Define a specific type for payment instructions
export interface PaymentInstructions {
  method: string;
  accountNumber?: string;
  bankName?: string;
  routingNumber?: string;
  instructions?: string;
  [key: string]: string | number | undefined;
}

class TransactionEventDispatcher {
  // Dispatch a transaction event
  public dispatchEvent(details: TransactionDetails): void {
    // Create and dispatch custom event
    const event = new CustomEvent(TRANSACTION_EVENT, {
      detail: details,
      bubbles: true
    });
    
  
    window.dispatchEvent(event);
    
    // Also store the last transaction in local storage for components that load later
    this.storeLastTransaction(details);
  }

  // Store transaction data in localStorage
  private storeLastTransaction(details: TransactionDetails): void {
    try {
      // Convert PublicKey to string for storage
      const storableDetails = {
        ...details,
        trustVault: details.trustVault ? details.trustVault.toString() : undefined
      };
      
      localStorage.setItem("last_trust_vault_transaction", JSON.stringify(storableDetails));
    } catch (e) {
      console.error("Error storing transaction details:", e);
    }
  }

  // Get the last transaction from localStorage
  public getLastTransaction(): TransactionDetails | null {
    try {
      const stored = localStorage.getItem("last_trust_vault_transaction");
      if (!stored) return null;
      
      const details = JSON.parse(stored) as TransactionDetails;
      
      // Convert string back to PublicKey if needed
      if (details.trustVault && typeof details.trustVault === 'string') {
        details.trustVault = new PublicKey(details.trustVault);
      }
      
      return details;
    } catch (e) {
      console.error("Error getting last transaction:", e);
      return null;
    }
  }
  
  // Utility function to dispatch an VAULT_CLOSED event
  public dispatchTrustVaultClosedEvent(trustVault: PublicKey, amount: number, details?: AdditionalDetails): void {
  
    
    const eventDetail: TransactionDetails = {
      type: TransactionType.TRUST_VAULT_CLOSED,
      signature: `trust-vault-closed-${Date.now()}`,
      timestamp: Date.now(),
      trustVault: trustVault,
      amount: amount,
      details: details
    };
    
    this.dispatchEvent(eventDetail);
  }
  
  // Utility function to dispatch a BUY_ORDER_CREATED event
  public dispatchBuyOrderCreatedEvent(trustVault: PublicKey, amount: number, signature: string, mintA: string, pricePerToken: number, currency: string): void {
   
    
    const eventDetail: TransactionDetails = {
      type: TransactionType.BUY_ORDER_CREATED,
      signature,
      timestamp: Date.now(),
      trustVault,
      amount,
      details: {
        mintA,
        pricePerToken,
        currency
      }
    };
    
    this.dispatchEvent(eventDetail);
  }
  
  // Utility function to dispatch a BUY_ORDER_RESERVED event
  public dispatchBuyOrderReservedEvent(trustVault: PublicKey, amount: number, signature: string, seller: string, buyer: string, paymentInstructions: PaymentInstructions): void {
   
    
    const eventDetail: TransactionDetails = {
      type: TransactionType.BUY_ORDER_RESERVED,
      signature,
      timestamp: Date.now(),
      trustVault,
      amount,
      details: {
        seller,
        buyer,
        paymentInstructions
      }
    };
    
    this.dispatchEvent(eventDetail);
  }
  
  // Utility function to dispatch a BUY_ORDER_CANCELLED event
  public dispatchBuyOrderCancelledEvent(trustVault: PublicKey, signature: string, buyer: string): void {
  
    
    const eventDetail: TransactionDetails = {
      type: TransactionType.BUY_ORDER_CANCELLED,
      signature,
      timestamp: Date.now(),
      trustVault,
      details: {
        buyer
      }
    };
    
    this.dispatchEvent(eventDetail);
  }
  
  // Utility function to dispatch a BUYER_PAYMENT_SENT event
  public dispatchBuyerPaymentSentEvent(trustVault: PublicKey, signature: string, reservationIndex: number, buyer: string, seller: string): void {
  
    
    const eventDetail: TransactionDetails = {
      type: TransactionType.BUYER_PAYMENT_SENT,
      signature,
      timestamp: Date.now(),
      trustVault,
      details: {
        reservationIndex,
        buyer,
        seller
      }
    };
    
    this.dispatchEvent(eventDetail);
  }
  
  // Utility function to dispatch a SELLER_PAYMENT_CONFIRMED event
  public dispatchSellerPaymentConfirmedEvent(trustVault: PublicKey, amount: number, signature: string, reservationIndex: number, seller: string, buyer: string): void {
   
    
    const eventDetail: TransactionDetails = {
      type: TransactionType.SELLER_CONFIRMS_PAYMENT,
      signature,
      timestamp: Date.now(),
      trustVault,
      amount,
      details: {
        reservationIndex,
        seller,
        buyer
      }
    };
    
    this.dispatchEvent(eventDetail);
  }
}

// Export singleton instance
export const transactionDispatcher = new TransactionEventDispatcher();
export default transactionDispatcher;