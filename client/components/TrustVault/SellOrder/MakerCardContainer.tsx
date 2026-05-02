"use client";
import React, { useMemo, useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import useTrustVaultProgram from "@/hooks/useTrustVaultProgram";
import PendingReservationCard from "./MakerCard";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { useQueryClient } from "@tanstack/react-query";
import { useTrustVaultAccounts } from "@/hooks/queries/useTrustVaultAccounts";
import {getMintInfo} from "@/utils/solana";
import {TRUST_VAULT_TYPE_SELL_ORDER} from "@/utils/constants";
import { MintInfo } from "@/types/trustVault";


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
    reservedAmounts: {
      taker: PublicKey;
      amount: BN;
      fiatAmount: BN;
      timestamp: BN;
      status: number;
      disputeReason: string | null;
      disputeId: string | null;
    }[];
    bump: number;
  };
  reservationIndex: number;
  reservation: {
    taker: PublicKey;
    amount: BN;
    fiatAmount: BN;
    timestamp: BN;
    status: number;
    disputeReason: string | null;
    disputeId: string | null;
    paymentInstructions: string;
    trustVaultType: number;
    sellerInstructions?: string | null;
  };
};


// Define the ref handle type
export interface PendingReservationsRef {
  refresh: () => void;
}

const MakerCardContainer = forwardRef<PendingReservationsRef>((_, ref) => {
  const { publicKey } = useWallet();
  const {  program } = useTrustVaultProgram();
  const getTrustVaultAccounts = useTrustVaultAccounts(program);
  const [mintInfoCache, setMintInfoCache] = useState<Record<string, MintInfo>>({});
  const queryClient = useQueryClient();
  
  // Expose the refresh method via ref
  useImperativeHandle(ref, () => ({
    refresh: () => {
      queryClient.invalidateQueries({ queryKey: ["get-pending-reservations"] });
      getTrustVaultAccounts.refetch();
    }
  }));
  
  // Filter trustVaults that belong to the current user and have pending reservations, disputed reservations
  // filter for only SELL_FIRST type trustVaults
  const pendingReservations = useMemo(() => {
    if (!publicKey || !getTrustVaultAccounts.data) return [];
    
    const userTrustVaults = getTrustVaultAccounts.data.filter(trustVault => 
      trustVault.account.maker.equals(publicKey) && 
      trustVault.account.trustVaultType === TRUST_VAULT_TYPE_SELL_ORDER &&
      trustVault.account.reservedAmounts.some(reservation => 
        reservation.status === 0 || reservation.status === 1 || reservation.status === 4
      )
    );
    
    // Flatten to reservation level with metadata
    const reservations: ReservationType[] = [];
    
    for (const trustVault of userTrustVaults) {
  // Filter to get only pending or disputed reservations
  trustVault.account.reservedAmounts.forEach((reservation, index) => {
    if (reservation.status === 0 || reservation.status === 1 || reservation.status === 4) {
      reservations.push({
        trustVault: trustVault.publicKey,
        trustVaultAccount: trustVault.account,
        reservationIndex: index,
        reservation: {
          ...reservation,
          paymentInstructions: trustVault.account.paymentInstructions,
          trustVaultType: trustVault.account.trustVaultType
        },
      });
    }
  });
}
    
    return reservations;
  }, [publicKey, getTrustVaultAccounts.data]);
  
  // Fetch mint info for all relevant mints
  useEffect(() => {
    const fetchMintInfo = async () => {
      if (pendingReservations.length === 0) return;
      
      // Create a unique set of mint addresses
      const mintAddresses = Array.from(
        new Set(
          pendingReservations.map(item => 
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
            const mintInfo = await getMintInfo(mintPublicKey, program.provider.connection);
            newMintInfoCache[mintAddress] = mintInfo;
          } catch (error) {
            console.error(`Error fetching mint info for ${mintAddress}:`, error);
            // Set default values if there's an error
            newMintInfoCache[mintAddress] = { 
              address: new PublicKey(mintAddress),
              decimals: 6,
              isToken2022: false,
              tokenProgram: PublicKey.default, 
              };
          }
        })
      );
      
      setMintInfoCache(newMintInfoCache);
    };
    
    fetchMintInfo();
  }, [pendingReservations, program.provider.connection, mintInfoCache]);
  
  // No pending reservations
  if (pendingReservations.length === 0) {
    return getTrustVaultAccounts.isLoading ? (
      <div className="text-center py-8">Loading reservations...</div>
    ) : (
      <div className="text-center py-8 text-muted-foreground">
        No pending or disputed reservations found
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
        Pending Confirmations ({pendingReservations.length})
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {pendingReservations.map((item) => {
          const currencyStr = String.fromCharCode(...item.trustVaultAccount.currency).trim();
          const pricePerToken = (item.trustVaultAccount.pricePerToken.toNumber() / 100);
          const mintAddress = item.trustVaultAccount.mint.toString();
          
          // Get mint info from cache or use fallback
          const mintInfo = mintInfoCache[mintAddress] || { decimals: 6 };
          
          return (
            <PendingReservationCard
              key={`${item.trustVault.toString()}-${item.reservationIndex}`}
              trustVault={item.trustVault}
              reservationIndex={item.reservationIndex}
              mint={item.trustVaultAccount.mint}
              reservation={item.reservation}
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

MakerCardContainer.displayName = "MakerCardContainer";

export default MakerCardContainer;