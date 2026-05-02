import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Program } from "@coral-xyz/anchor";
import { TrustVault } from "../../../target/types/trust_vault";

export const useTrustVaultAccounts = (program: Program<TrustVault>) => {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ["get-trust-vault-accounts"],
    queryFn: async () => {
      const maxRetries = 3;
      let retryCount = 0;
      let backoffTime = 1000;

      const executeQuery = async () => {
        try {
          const responses = await program.account.trustVault.all();
          const sortedResponses = responses.sort((a, b) =>
            a.account.seed.cmp(b.account.seed)
          );

          // Pre-populate cache for individual trust vault info
          sortedResponses.forEach((response) => {
            const key = response.publicKey.toString();
            queryClient.setQueryData(
              [`trust-vault-info-${key}`],
              response.account,
              {
                updatedAt: Date.now(),
              }
            );
          });

          return sortedResponses;
        } catch (error: unknown) {
          if (retryCount >= maxRetries) {
            console.error(
              "Max retries reached when fetching trustVault accounts:",
              error
            );
            throw error;
          }

          const isRateLimitError =
            (error instanceof Error && error.message?.includes("429")) ||
            (typeof error === "object" &&
              error !== null &&
              "toString" in error &&
              error.toString().includes("429")) ||
            (typeof error === "object" &&
              error !== null &&
              "code" in error &&
              error.code === 429);

          const isConnectionError =
            error instanceof Error &&
            (error.message?.includes("failed to fetch") ||
              error.message?.includes("network error"));

          if (isRateLimitError || isConnectionError) {
            console.warn(
              `Rate limit or connection error, retrying in ${backoffTime}ms (attempt ${
                retryCount + 1
              }/${maxRetries})`,
              error
            );
            retryCount++;
            await new Promise((resolve) => setTimeout(resolve, backoffTime));
            backoffTime *= 2;
            return executeQuery();
          } else {
            console.error("Error fetching trustVault accounts:", error);
            throw error;
          }
        }
      };

      return executeQuery();
    },
    staleTime: 120000, // 2 minutes stale time
    refetchOnWindowFocus: false,
    refetchInterval: false,
    retry: false,
  });
};