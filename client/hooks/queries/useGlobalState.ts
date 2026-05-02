import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { TrustVault } from "@/relics/trust_vault";

export const useGlobalState = (program: Program<TrustVault>) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["get-global-state"],
    queryFn: async () => {
      const maxRetries = 3;
      let retryCount = 0;
      let backoffTime = 1000;

      const executeQuery = async () => {
        try {
          const [globalState] = PublicKey.findProgramAddressSync(
            [Buffer.from("global-state")],
            program.programId
          );

          const globalStateAccount = await program.account.globalState.fetch(globalState);
          
          // Cache the global state PDA for potential reuse
          queryClient.setQueryData(
            ["global-state-pda"],
            globalState,
            {
              updatedAt: Date.now(),
            }
          );

          return {
            account: globalStateAccount,
            publicKey: globalState,
          };
        } catch (error: unknown) {
          if (retryCount >= maxRetries) {
            console.error("Max retries reached when fetching global state:", error);
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
              `Global state query failed, retrying in ${backoffTime}ms (attempt ${
                retryCount + 1
              }/${maxRetries})`,
              error
            );
            retryCount++;
            await new Promise((resolve) => setTimeout(resolve, backoffTime));
            backoffTime *= 2;
            return executeQuery();
          } else {
            console.error("Error fetching global state:", error);
            throw error;
          }
        }
      };

      return executeQuery();
    },
    staleTime: 60000, // 1 minute - global state changes less frequently
    refetchOnWindowFocus: false,
    refetchInterval: false,
    retry: false, // We handle retries manually
  });

  // Helper function to get just the global state PDA
  const getGlobalStatePDA = (): PublicKey => {
    const cachedPDA = queryClient.getQueryData<PublicKey>(["global-state-pda"]);
    if (cachedPDA) {
      return cachedPDA;
    }

    const [globalState] = PublicKey.findProgramAddressSync(
      [Buffer.from("global-state")],
      program.programId
    );
    
    queryClient.setQueryData(["global-state-pda"], globalState);
    return globalState;
  };

  return {
    ...query,
    getGlobalStatePDA,
  };
};