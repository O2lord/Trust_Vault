"use client";
import React, { useMemo, useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import useTrustVaultProgram from "@/hooks/useTrustVaultProgram";
import MakerCard from "./MakerCard";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { useQueryClient } from "@tanstack/react-query";
import { getMintInfo } from "@/utils/solana"
import { useTrustVaultAccounts } from "@/hooks/queries/useTrustVaultAccounts";
import { TRUST_VAULT_TYPE_BUY_ORDER } from "@/utils/constants";


type ReservationItem = {
  taker: PublicKey;
  amount: BN;
  fiatAmount: BN;
  timestamp: BN;
  status: number;
  disputeReason: string | null;
  disputeId: string | null;
  sellerInstructions?: string | null; 
};

// Define proper types for the reservation object
type ReservationType = {
  trustVault: PublicKey;
  trustVaultAccount: {
    seed: BN;
    maker: PublicKey;
    mint: PublicKey;
    currency: number[];
    trustVaultType: number;
    amount: BN;
    pricePerToken: BN;
    paymentInstructions: string;
    reservedAmounts: ReservationItem[];
    bump?: number;
  };
  reservationIndex: number;
  reservation:ReservationItem;
};

// mint info
type MintInfo = {
  decimals: number;
};

// ref handle type
export interface BuyerPaymentRef {
  refresh: () => void;
}

const MakerCardContainerBO = forwardRef<BuyerPaymentRef>((_, ref) => {
  const { publicKey } = useWallet();
  const { program } = useTrustVaultProgram();
  const getTrustVaultAccounts = useTrustVaultAccounts(program);
  const [mintInfoCache, setMintInfoCache] = useState<Record<string, MintInfo>>({});
  const queryClient = useQueryClient();
  
  // Expose the refresh method via ref
  useImperativeHandle(ref, () => ({
    refresh: () => {
      queryClient.invalidateQueries({ queryKey: ["get-buyer-reservations"] });
      getTrustVaultAccounts.refetch();
    }
  }));
  
  // Filter trustVaults where the current user is the maker (buyer) in buy-order trustVaults
  const buyerPendingReservations = useMemo(() => {
    if (!publicKey || !getTrustVaultAccounts.data) return [];
    
    const reservations: ReservationType[] = [];
    
    // Find all buy-order trustVaults where the current user is the maker (buyer)
    const userTrustVaults = getTrustVaultAccounts.data.filter(trustVault => 
      trustVault.account.maker.equals(publicKey) && 
      trustVault.account.trustVaultType === TRUST_VAULT_TYPE_BUY_ORDER
    );
    
    // Go through all user's trustVaults and find reservations with pending, payment sent, or disputed status
    for (const trustVault of userTrustVaults) {
      trustVault.account.reservedAmounts.forEach((reservation, index) => {
        // Include reservations with status 0 (pending), 1 (payment sent), or 4 (disputed)
        if (reservation.status === 0 || reservation.status === 1 || reservation.status === 4) {
          reservations.push({
            trustVault: trustVault.publicKey,
            trustVaultAccount: trustVault.account,
            reservationIndex: index,
            reservation,
          });
        }
      });
    }
    
    return reservations;
  }, [publicKey, getTrustVaultAccounts.data]);
  
  // Fetch mint info for all relevant mints
  useEffect(() => {
    const fetchMintInfo = async () => {
      if (buyerPendingReservations.length === 0) return;
      
      // Create a unique set of mint addresses
      const mintAddresses = Array.from(
        new Set(
          buyerPendingReservations.map(item => 
            item.trustVaultAccount.mint.toString()
          )
        )
      );
      
      // Only fetch mint info for addresses we don't already have
      const mintAddressesToFetch = mintAddresses.filter(
        mintAddress => !(mintAddress in mintInfoCache)
      );
      
      if (mintAddressesToFetch.length === 0) return;
      
      const newMintInfoCache = { ...mintInfoCache };
      
      // Fetch mint info for each unique mint
      await Promise.all(
        mintAddressesToFetch.map(async (mintAddress) => {
          try {
            const mintPublicKey = new PublicKey(mintAddress);
            const mintInfo = await getMintInfo((mintPublicKey), program.provider.connection);
            newMintInfoCache[mintAddress] = mintInfo;
          } catch (error) {
            console.error(`Error fetching mint info for ${mintAddress}:`, error);
            // Set default values if there's an error
            newMintInfoCache[mintAddress] = { decimals: 6 };
          }
        })
      );
      
      setMintInfoCache(newMintInfoCache);
    };
    
    fetchMintInfo();
  }, [buyerPendingReservations, getMintInfo, mintInfoCache]);
  
  // No pending reservations as buyer
  if (buyerPendingReservations.length === 0) {
    return getTrustVaultAccounts.isLoading ? (
      <div className="text-center py-8">Loading your reservations...</div>
    ) : (
      <div className="text-center py-8 text-muted-foreground">
        You do not have any pending or disputed token reservations
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold flex items-center gap-2">
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
        </span>
        Sell Orders Pending Payments ({buyerPendingReservations.length})
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {buyerPendingReservations.map((item) => {
          const currencyStr = String.fromCharCode(...item.trustVaultAccount.currency).trim();
          const pricePerToken = (item.trustVaultAccount.pricePerToken.toNumber() / 100);
          const mintAddress = item.trustVaultAccount.mint.toString();
          
          // Get mint info from cache or use fallback
          const mintInfo = mintInfoCache[mintAddress] || { decimals: 6 };
          
          const reservationWithType = {
            taker: item.reservation.taker,
            amount: item.reservation.amount,
            fiatAmount: item.reservation.fiatAmount,
            timestamp: item.reservation.timestamp,
            status: item.reservation.status,
            disputeReason: item.reservation.disputeReason || undefined,
            disputeId: item.reservation.disputeId || undefined
          };

          // Transform the trustVault account to match MakerCard's expected interface
          const transformedTrustVaultAccount = {
            maker: item.trustVaultAccount.maker,
            sellerInstructions: item.trustVaultAccount.paymentInstructions, // Trust vault level fallback
            trustVaultType: item.trustVaultAccount.trustVaultType,
            reservedAmounts: item.trustVaultAccount.reservedAmounts.map((reservation, idx) => ({
              taker: reservation.taker,
              amount: reservation.amount,
              fiatAmount: reservation.fiatAmount,
              timestamp: reservation.timestamp,
              status: reservation.status,
              sellerInstructions: item.reservation.sellerInstructions || undefined,
              disputeReason: reservation.disputeReason || undefined,
              disputeId: reservation.disputeId || undefined
            }))
          };

          return (
            <MakerCard
              key={`${item.trustVault.toString()}-${item.reservationIndex}`}
              trustVault={item.trustVault}
              reservationIndex={item.reservationIndex}
              mint={item.trustVaultAccount.mint}
              reservation={reservationWithType}
              trustVaultAccount={transformedTrustVaultAccount}
              mintInfo={mintInfo}
              currency={currencyStr}
              pricePerToken={pricePerToken}
            />
          );
        })}
      </div>
    </div>
  );
});

MakerCardContainerBO.displayName = "MakerCardContainerBO";

export default MakerCardContainerBO;