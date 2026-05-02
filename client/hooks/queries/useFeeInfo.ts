import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PublicKey } from "@solana/web3.js";
import { FeeInfo, TrustVaultAccountData } from "../../types/trustVault";

export const useFeeInfoLogic = (
  getTrustVaultInfo: (trustVault: PublicKey) => Promise<TrustVaultAccountData>
) => {
  const queryClient = useQueryClient();

  const getTrustVaultFeeInfo = useCallback(
    async (trustVault: PublicKey): Promise<FeeInfo> => {
      const cacheKey = `fee-info-${trustVault.toString()}`;

      const cachedData = queryClient.getQueryData<FeeInfo>([cacheKey]);
      if (cachedData) {
        return cachedData;
      }

      const maxRetries = 5;
      let retryCount = 0;
      let delay = 500;

      while (retryCount < maxRetries) {
        try {
          const info = await getTrustVaultInfo(trustVault);
          const result: FeeInfo = {
            feePercentage: info.feePercentage || 0,
            feeDestination:
              info.feeDestination ||
              new PublicKey("11111111111111111111111111111111"),
          };

          // Cache with longer expiration for fee info
          queryClient.setQueryData<FeeInfo>([cacheKey], result, {
            updatedAt: Date.now(),
          });
          return result;
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

      throw new Error("Failed to fetch fee info after multiple retries");
    },
    [queryClient, getTrustVaultInfo]
  );

  const useFeeInfo = (trustVault: PublicKey | undefined) => {
    return useQuery<FeeInfo, Error>({
      queryKey: trustVault ? [`fee-info-${trustVault.toString()}`] : [],
      queryFn: () =>
        trustVault
          ? getTrustVaultFeeInfo(trustVault)
          : Promise.reject("No trust vault provided"),
      enabled: !!trustVault,
      staleTime: 5 * 60 * 1000,
      retry: (failureCount, error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes("429")) {
          return failureCount < 5;
        }
        return failureCount < 3;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    });
  };

  return {
    getTrustVaultFeeInfo,
    useFeeInfo,
  };
};