import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { TrustVault } from "../../../target/types/trust_vault";
import { TrustVaultAccountData } from "@/types/trustVault";

export const useTrustVaultInfo = (program: Program<TrustVault>) => {
  const queryClient = useQueryClient();

  const getTrustVaultInfo = useCallback(
    async (trustVault: PublicKey): Promise<TrustVaultAccountData> => {
      const cacheKey = `trust-vault-info-${trustVault.toString()}`;
      
      // Check cache first
      const cachedData = queryClient.getQueryData<TrustVaultAccountData>([cacheKey]);
      if (cachedData) {
        return cachedData;
      }

      const maxRetries = 3;
      let retryCount = 0;
      let delay = 500;

      while (retryCount < maxRetries) {
        try {
          const rawAccount = await program.account.trustVault.fetch(trustVault);
          
          // Transform the account data to match TrustVaultAccountData type
          const account: TrustVaultAccountData = {
            ...rawAccount,
            reservedAmounts: rawAccount.reservedAmounts.map(reservation => ({
              taker: reservation.taker,
              amount: reservation.amount,
              fiatAmount: reservation.fiatAmount,
              timestamp: reservation.timestamp,
              status: reservation.status,
              disputeReason: reservation.disputeReason ?? undefined,
              disputeId: reservation.disputeId ?? undefined,
            }))
          };
          
          // Cache the result
          queryClient.setQueryData<TrustVaultAccountData>([cacheKey], account, {
            updatedAt: Date.now(),
          });
          
          return account;
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (errorMessage.includes("429")) {
            retryCount++;
            await new Promise((resolve) => setTimeout(resolve, delay));
            delay *= 2;
          } else {
            throw error;
          }
        }
      }

      throw new Error("Failed to fetch trust vault info after multiple retries");
    },
    [program, queryClient]
  );

  return { getTrustVaultInfo };
};