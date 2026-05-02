import { BN, Program } from "@coral-xyz/anchor";
import useAnchorProvider from "../useAnchorProvider";
import { TrustVault as TrustExpress } from "@/relics/trust_express/trust_express";
import idl from "@/relics/trust_express/trust_express.json";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { randomBytes } from "crypto";
import {  useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  getMint,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import transactionDispatcher from "../transactionEventDispatcher";
import {TransactionType} from "@/types/trustVault"
import { useState, useEffect, useCallback, useMemo } from "react";
import { generatePayoutReference } from '../../../discord-bot/lib/payout-reference';

interface ReservationData {
  taker: PublicKey;
  amount: BN;
  fiatAmount: BN;
  timestamp: BN;
  status: number;
  disputeReason?: string;
  disputeId?: string;
  payoutDetails?: string; 
  payoutReference?: string; 
}

interface TrustExpressAccountData {
  seed: BN;
  maker: PublicKey;
  mint: PublicKey;
  currency: number[];
  escrowType: number;
  bump: number;
  feePercentage?: number;
  feeDestination?: PublicKey;
  reservedFee?: BN;
  taker?: PublicKey;
  amount?: BN;
  pricePerToken?: BN;
  paymentInstructions?: string;
  paymentLink?: string; 
  flutterwaveCredentialId?: string; 
  reservation?: ReservationData;
  reservedAmounts?: ReservationData[];
}


// Tracking reservation statuses
export enum ReservationStatus {
  PENDING = 0,
  PAYMENT_SENT = 1,
  COMPLETED = 2,
  CANCELLED = 3,
  DISPUTED = 4,
}



type FeeInfo = {
  feePercentage: number;
  feeDestination: PublicKey;
};

// Batching configuration
const BATCH_DELAY = 50; // 50ms batching window

// Batch management for trust express info
const batchedTrustExpressRequests = new Map<
  string,
  {
    resolve: (value: TrustExpressAccountData) => void;
    reject: (error: Error) => void;
  }
>();

let trustExpressBatchTimeout: NodeJS.Timeout | null = null;

// Batch management for token balances
const batchedBalanceRequests = new Map<
  string,
  {
    resolve: (value: number) => void;
    reject: (error: Error) => void;
  }
>();

let balanceBatchTimeout: NodeJS.Timeout | null = null;

// Batch management for mint info
const batchedMintRequests = new Map<
  string,
  {
     resolve: (value: { address: PublicKey; decimals: number; isToken2022: boolean; tokenProgram: PublicKey }) => void;
    reject: (error: Error) => void;
  }
>();

let mintBatchTimeout: NodeJS.Timeout | null = null;

export default function useTrustExpress() {
  const provider = useAnchorProvider();
  const { publicKey } = useWallet();
const program = useMemo(() => new Program<TrustExpress>(idl as TrustExpress, provider), [provider]);
  const [isConfirmingPayment] = useState(false);
  const queryClient = useQueryClient();
  const [pendingSellReservations, setPendingSellReservations] = useState<Set<string>>(new Set());

  // Optimized batch trust express info fetcher
const getBatchedTrustExpressInfo = useCallback(async (
  trustExpressPubkey: PublicKey
): Promise<TrustExpressAccountData> => {
  const key = trustExpressPubkey.toString();

  // Check cache first
  const cachedData = queryClient.getQueryData<TrustExpressAccountData>([
    `trust-express-info-${key}`,
  ]);
  if (cachedData) {
    return cachedData;
  }

  return new Promise((resolve, reject) => {
    batchedTrustExpressRequests.set(key, { resolve, reject });

    if (trustExpressBatchTimeout) {
      clearTimeout(trustExpressBatchTimeout);
    }

    trustExpressBatchTimeout = setTimeout(async () => {
      const requests = Array.from(batchedTrustExpressRequests.entries());
      batchedTrustExpressRequests.clear();

      if (requests.length === 0) return;

      try {
        const pubkeys = requests.map(([key]) => new PublicKey(key));
        const accounts = await provider.connection.getMultipleAccountsInfo(
          pubkeys
        );

        requests.forEach(([key, { resolve, reject }], index) => {
          try {
            const accountInfo = accounts[index];
            if (!accountInfo) {
              reject(new Error(`trust express account not found: ${key}`));
              return;
            }

            // Parse the account data using the program
            const parsedData =
              program.account.trustExpress.coder.accounts.decode(
                "trustExpress",
                accountInfo.data
              ) as TrustExpressAccountData;

            // Cache the result
            queryClient.setQueryData(
              [`trust-express-info-${key}`],
              parsedData,
              {
                updatedAt: Date.now(),
              }
            );

            resolve(parsedData);
          } catch (error: unknown) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
      } catch (error: unknown) {
        requests.forEach(([, { reject }]) => 
          reject(error instanceof Error ? error : new Error(String(error)))
        );
      }
    }, BATCH_DELAY);
  });
}, [provider, program, queryClient]);

  // Optimized batch token balance fetcher
  const getBatchedTokenBalance = async (
    tokenAccount: PublicKey
  ): Promise<number> => {
    const key = tokenAccount.toString();

    // Check cache first
    const cachedBalance = queryClient.getQueryData<number>([
      `token-balance-${key}`,
    ]);
    if (cachedBalance !== undefined) {
      return cachedBalance;
    }

    return new Promise((resolve, reject) => {
      batchedBalanceRequests.set(key, { resolve, reject });

      if (balanceBatchTimeout) {
        clearTimeout(balanceBatchTimeout);
      }

      balanceBatchTimeout = setTimeout(async () => {
        const requests = Array.from(batchedBalanceRequests.entries());
        batchedBalanceRequests.clear();

        if (requests.length === 0) return;

        try {
          const pubkeys = requests.map(([key]) => new PublicKey(key));
          const accounts = await provider.connection.getMultipleAccountsInfo(
            pubkeys
          );

          requests.forEach(([key, { resolve, reject }], index) => {
            try {
              const accountInfo = accounts[index];
              if (!accountInfo) {
                resolve(0); // Account doesn't exist, balance is 0
                return;
              }

              // Parse token account data manually for better performance
              const balance = parseTokenAccountBalance(accountInfo.data);

              // Cache for 30 seconds
              queryClient.setQueryData([`token-balance-${key}`], balance, {
                updatedAt: Date.now(),
              });

              resolve(balance);
            } catch (error: unknown) {
              reject(error instanceof Error ? error : new Error(String(error)));
            }
          });
        } catch (error) {
          requests.forEach(([, { reject }]) => reject(error instanceof Error ? error : new Error(String(error))) );
        }
      }, BATCH_DELAY);
    });
  };

  // Helper function to parse token account balance from raw data
  const parseTokenAccountBalance = (data: Buffer): number => {
    try {
      // Token account layout: 32 bytes mint + 32 bytes owner + 8 bytes amount + ...
      const amountOffset = 64;
      const amountBuffer = data.slice(amountOffset, amountOffset + 8);
      return Number(Buffer.from(amountBuffer).readBigUInt64LE());
    } catch {
      return 0;
    }
  };

 // Optimized batch mint info fetcher
const getBatchedMintInfo = async (mintPubkey: PublicKey) => {
  const key = mintPubkey.toString();

  // Check cache first
  const cachedMintInfo = queryClient.getQueryData([`mint-info-${key}`]);
  if (cachedMintInfo) {
    return cachedMintInfo;
  }

  return new Promise((resolve, reject) => {
    batchedMintRequests.set(key, { resolve, reject });

    if (mintBatchTimeout) {
      clearTimeout(mintBatchTimeout);
    }

    mintBatchTimeout = setTimeout(async () => {
      const requests = Array.from(batchedMintRequests.entries());
      batchedMintRequests.clear();

      if (requests.length === 0) return;

      try {
        const pubkeys = requests.map(([key]) => new PublicKey(key));
        const accounts = await provider.connection.getMultipleAccountsInfo(
          pubkeys
        );

        requests.forEach(([key, { resolve, reject }], index) => {
          try {
            const accountInfo = accounts[index];
            if (!accountInfo) {
              reject(new Error(`Mint account not found: ${key}`));
              return;
            }

            const isToken2022 = accountInfo.owner.equals(
              TOKEN_2022_PROGRAM_ID
            );
            const tokenProgram = isToken2022
              ? TOKEN_2022_PROGRAM_ID
              : TOKEN_PROGRAM_ID;

            const mintInfo = {
              address: new PublicKey(key),
              decimals: accountInfo.data[44], // Decimals at offset 44
              isToken2022,
              tokenProgram,
            };

            // Cache for 5 minutes (mint info rarely changes)
            queryClient.setQueryData([`mint-info-${key}`], mintInfo, {
              updatedAt: Date.now(),
            });

            resolve(mintInfo);
          } catch (error: unknown) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
      } catch (error: unknown) {
        requests.forEach(([, { reject }]) => 
          reject(error instanceof Error ? error : new Error(String(error)))
        );
      }
    }, BATCH_DELAY);
  });
};

  const isToken2022 = useCallback(async (mint: PublicKey) => {
    try {
      const mintInfo = await provider.connection.getAccountInfo(mint);

      if (!mintInfo || !mintInfo.owner) {
        console.warn(`Could not fetch mint info for ${mint.toString()}`);
        return false;
      }

      return mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID);
    } catch (error) {
      console.error(
        `Error checking if mint ${mint.toString()} is Token2022:`,
        error
      );
      return false;
    }
  }, [provider]);

  const getMintInfo = useCallback(async (mint: PublicKey) => {
  try {
    const tokenProgram = (await isToken2022(mint))
      ? TOKEN_2022_PROGRAM_ID
      : TOKEN_PROGRAM_ID;
    return await getMint(provider.connection, mint, undefined, tokenProgram);
  } catch (error) {
    console.error(`Error getting mint info for ${mint.toString()}:`, error);
    throw new Error(
      `Failed to fetch mint information: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}, [provider, isToken2022]); 

  const getTrustExpressInfo = useCallback(
    async (TrustExpress: PublicKey): Promise<TrustExpressAccountData> => {
      // Try batched version first, fallback to individual call
      try {
        return await getBatchedTrustExpressInfo(TrustExpress);
      } catch (error) {
        console.warn(
          "Batched request failed, falling back to individual call:",
          error
        );
        return program.account.trustExpress.fetch(
          TrustExpress
        ) as Promise<TrustExpressAccountData>;
      }
    },
    [program, getBatchedTrustExpressInfo]
  );

 const getGlobalState = useQuery({
  queryKey: ["get-global-state"],
  queryFn: async () => {
    const maxRetries = 3;
    let retryCount = 0;
    let backoffTime = 1000;

    const executeQuery = async (): Promise<unknown> => {
      try {
        const [globalState] = PublicKey.findProgramAddressSync(
          [Buffer.from("global-state")],
          program.programId
        );

        return await program.account.globalState.fetch(globalState);
      } catch (error: unknown) {
        // ✅ Handle "account does not exist" error
        const isAccountNotFound =
          error instanceof Error &&
          (error.message?.includes("Account does not exist") ||
            error.message?.includes("has no data"));

        if (isAccountNotFound) {
          console.log("Global state account does not exist yet");
          return null; // Return null instead of throwing
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

        if (
          (isRateLimitError || isConnectionError) &&
          retryCount < maxRetries
        ) {
          console.warn(
            `Query failed, retrying in ${backoffTime}ms (attempt ${
              retryCount + 1
            }/${maxRetries})`,
            error
          );
          retryCount++;
          await new Promise((resolve) => setTimeout(resolve, backoffTime));
          backoffTime *= 2;
          return executeQuery();
        }

        console.error("Error fetching global state after retries:", error);
        return null;
      }
    };

    return executeQuery();
  },
  staleTime: 30000,
  refetchOnWindowFocus: false,
  refetchInterval: false,
  retry: false,
});

  const dispatchPaymentConfirmedEvent = (
    trustExpress: PublicKey,
    reservationIndex: number,
    amount?: number
  ) => {
  

    const eventDetail = {
      type: TransactionType.PAYMENT_CONFIRMED,
      signature: `recovery-${Date.now()}`,
      timestamp: Date.now(),
      trustExpress: trustExpress,
      details: {
        reservationIndex: reservationIndex,
      },
      amount: amount,
    };

    localStorage.setItem(
      "last_trustExpress_transaction",
      JSON.stringify(eventDetail)
    );

    transactionDispatcher.dispatchEvent(eventDetail);

    return true;
  };

  
const getTrustExpressAccounts = useQuery({
  queryKey: ["get-trust-express-accounts"],
  queryFn: async () => {
    const maxRetries = 3;
    let retryCount = 0;
    let backoffTime = 1000;

    const executeQuery = async () => {
      try {
        const responses = await program.account.trustExpress.all();
        const sortedResponses = responses.sort((a, b) =>
          a.account.seed.cmp(b.account.seed)
        );

        // Pre-populate cache for individual trust express info
        sortedResponses.forEach((response) => {
          const key = response.publicKey.toString();
          queryClient.setQueryData(
            [`trust-express-info-${key}`],
            response.account,
            {
              updatedAt: Date.now(),
            }
          );
        });

        return sortedResponses;
      } catch (error: unknown) {
        // ✅ Handle "no accounts found" gracefully
        const isNoAccountsFound =
          error instanceof Error &&
          (error.message?.includes("Account does not exist") ||
            error.message?.includes("has no data"));

        if (isNoAccountsFound) {
          console.log("No trust express accounts found yet");
          return []; // Return empty array instead of throwing
        }

        if (retryCount >= maxRetries) {
          console.error(
            "Max retries reached when fetching trustExpress accounts:",
            error
          );
          return []; // Return empty array instead of throwing
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
          console.error("Error fetching trustExpress accounts:", error);
          return []; // Return empty array instead of throwing
        }
      }
    };

    return executeQuery();
  },
  staleTime: 0,
  refetchOnWindowFocus: true,
  refetchInterval: false,
  retry: false,
});

  useEffect(() => {
    const intervalId = setInterval(() => {
      const trustExpressAccountsQuery = queryClient.getQueryCache().find({
        queryKey: ["get-trust-express-accounts"],
      });

      const globalStateQuery = queryClient.getQueryCache().find({
        queryKey: ["get-global-state"],
      });

      const liquidityProvidersQuery = queryClient.getQueryCache().find({
        queryKey: ["liquidity-providers"],
      });

      if (
        trustExpressAccountsQuery &&
        trustExpressAccountsQuery.getObserversCount() > 0 &&
        trustExpressAccountsQuery.state.fetchStatus !== "fetching"
      ) {
        
        queryClient.invalidateQueries({
          queryKey: ["get-trust-express-accounts"],
          refetchType: "active",
        });
      }

      if (
        globalStateQuery &&
        globalStateQuery.getObserversCount() > 0 &&
        globalStateQuery.state.fetchStatus !== "fetching"
      ) {
        queryClient.invalidateQueries({
          queryKey: ["get-global-state"],
          refetchType: "active",
        });
      }

      if (
        liquidityProvidersQuery &&
        liquidityProvidersQuery.getObserversCount() > 0 &&
        liquidityProvidersQuery.state.fetchStatus !== "fetching"
      ) {
        queryClient.invalidateQueries({
          queryKey: ["liquidity-providers"],
          refetchType: "active",
        });
      }
    }, 120000); 

    return () => clearInterval(intervalId);
  }, [queryClient]);

  const calculateFeeAmount = (amount: BN, feePercentage: number): BN => {
    const feeDecimal = feePercentage / 10000;
    return amount.muln(Math.floor(feeDecimal * 10000) / 10000);
  };

  
  const getTrustExpressFeeInfo = useCallback(
    async (trustExpress: PublicKey): Promise<FeeInfo> => {
      const cacheKey = `fee-info-${trustExpress.toString()}`;

      const cachedData = queryClient.getQueryData<FeeInfo>([cacheKey]);
      if (cachedData) {
        return cachedData;
      }

      const maxRetries = 5;
      let retryCount = 0;
      let delay = 500;

      while (retryCount < maxRetries) {
        try {
          const info = await getTrustExpressInfo(trustExpress);
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
          if (error instanceof Error && error.message && error.message.includes("429")) {
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
    [queryClient, getTrustExpressInfo]
  );

  const useFeeInfo = (trustExpress: PublicKey | undefined) => {
  return useQuery<FeeInfo, Error>({
    queryKey: trustExpress ? [`fee-info-${trustExpress.toString()}`] : [],
    queryFn: () =>
      trustExpress
        ? getTrustExpressFeeInfo(trustExpress)
        : Promise.reject("No trust express provided"),
    enabled: !!trustExpress,
    staleTime: 5 * 60 * 1000,
    retry: (failureCount, error: Error) => {
      if (error.message && error.message.includes("429")) {
        return failureCount < 5;
      }
      return failureCount < 3;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
};

  // Hook to get global fee percentage
  const useGlobalFeePercentage = () => {
    return useQuery<number, Error>({
      queryKey: ["global-fee-percentage"],
      queryFn: async () => {
        try {
          const [globalState] = PublicKey.findProgramAddressSync(
            [Buffer.from("global-state")],
            program.programId
          );
          
          const globalStateData = await program.account.globalState.fetch(globalState);
          // fee_percentage is stored in basis points (e.g., 5 = 0.05%)
          return (globalStateData as any).feePercentage || 5;
        } catch (error) {
          console.error("Error fetching global fee percentage:", error);
          // Return default 5 basis points (0.05%) if global state doesn't exist
          return 5;
        }
      },
      staleTime: 5 * 60 * 1000, // Cache for 5 minutes
      retry: 3,
    });
  };

  const initializeGlobalState = useMutation({
    mutationKey: ["initialize-global-state"],
    mutationFn: async () => {
      if (!publicKey) {
        console.error("No public key available!");
        return;
      }

      try {
        const [globalState] = PublicKey.findProgramAddressSync(
          [Buffer.from("global-state")],
          program.programId
        );

        const signature = await program.methods
          .initializeGlobalState()
          .accountsPartial({
            authority: publicKey,
            globalState: globalState,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        transactionDispatcher.dispatchEvent({
          type: TransactionType.GLOBAL_STATE_INITIALIZED,
          signature,
          timestamp: Date.now(),
          details: {
            authority: publicKey.toString(),
          },
        });

        return signature;
      } catch (error) {
        console.error("Error in initializeGlobalState execution:", error);
        throw error;
      }
    },
    onError: (error) => {
      console.error(
        "Error initializing global state (from onError handler):",
        error
      );
      if (error instanceof Error) {
        console.error("Error name:", error.name);
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
      }
    },
  });

  const updatePrice = useMutation({
    mutationKey: ["update-price"],
    mutationFn: async (params: {
      trustExpress: PublicKey;
      newPricePerToken: number;
    }) => {
      if (!publicKey) {
        throw new Error("Wallet not connected");
      }

      const { trustExpress, newPricePerToken } = params;

      try {
        const trustExpressAccount = await getTrustExpressInfo(trustExpress);

        if (!trustExpressAccount.maker.equals(publicKey)) {
          throw new Error("Only the trust express creator can update the price");
        }
        const newPriceBN = new BN(newPricePerToken);
        const currentPrice = Number(
          (trustExpressAccount.pricePerToken || new BN(0)).toString()
        );

      

        const signature = await program.methods
          .updatePrice(newPriceBN)
          .accountsPartial({
            maker: publicKey,
            trustExpress,
          })
          .rpc();

        transactionDispatcher.dispatchEvent({
          type: TransactionType.EXPRESS_PRICE_UPDATED,
          trustExpress,
          signature,
          timestamp: Date.now(),
          details: {
            oldPrice: currentPrice,
            newPrice: newPricePerToken,
            currency: String.fromCharCode(...trustExpressAccount.currency).trim(),
            maker: publicKey.toString(),
          },
        });

        return signature;
      } catch (error) {
        console.error("Error updating price:", error);
        throw error;
      }
    },
    onError: (error) => {
      console.error("Error during update-price:", error);
    },
  });


  const calculateAmountAfterFee = async (
    amount: number,
    trustExpress: PublicKey
  ) => {
    const trustExpressAccount = await getTrustExpressInfo(trustExpress);
    const feePercentage = trustExpressAccount.feePercentage || 0;
    const feeAmount = amount * (feePercentage / 10000);
    return amount - feeAmount;
  };

  const calculateRemainingFee = async (
    trustExpress: PublicKey,
    refundAmount: number,
    originalDeposit: number
  ) => {
    const trustExpressAccount = await getTrustExpressInfo(trustExpress);
    const mintInfo = await getMintInfo(trustExpressAccount.mint);
    const decimals = mintInfo.decimals;

    const totalReservedFee =
      (trustExpressAccount.reservedFee || new BN(0)).toNumber() / 10 ** decimals;
    const refundRatio = refundAmount / originalDeposit;
    const feeToRefund = totalReservedFee * refundRatio;

    return feeToRefund;
  };

  const getAvailableTrustExpressBalance = async (trustExpress: PublicKey) => {
    const trustExpressAccount = await getTrustExpressInfo(trustExpress);

    const totalReserved = (trustExpressAccount.reservedAmounts || [])
      .filter(
        (reservation: ReservationData) =>
          reservation.status === ReservationStatus.PENDING ||
          reservation.status === ReservationStatus.PAYMENT_SENT
      )
      .reduce(
        (total: BN, reservation: ReservationData) =>
          total.add(reservation.amount),
        new BN(0)
      );

    const tokenProgram = (await isToken2022(trustExpressAccount.mint))
      ? TOKEN_2022_PROGRAM_ID
      : TOKEN_PROGRAM_ID;

    const trust_express = getAssociatedTokenAddressSync(
      trustExpressAccount.mint,
      trustExpress,
      true,
      tokenProgram
    );

    try {
      const tokenBalance = await provider.connection.getTokenAccountBalance(
        trust_express
      );
      const actualBalance = new BN(tokenBalance.value.amount);

      return {
        total: actualBalance,
        reserved: totalReserved,
        available: actualBalance.sub(totalReserved),
        reservedFee: trustExpressAccount.reservedFee || new BN(0),
      };
    } catch (error) {
      console.error("Error getting token account balance:", error);
      throw error;
    }
  };


  const cancelOrReduceBuyOrder = useMutation({
    mutationKey: ["cancel-or-reduce-buy-order"],
    mutationFn: async (params: {
      trustExpress: PublicKey;
      newAmount: number;
    }) => {
      const { trustExpress, newAmount } = params;

      if (!publicKey) {
        throw new Error("Wallet not connected");
      }

      const trustExpressAccount = await getTrustExpressInfo(trustExpress);

      if (!trustExpressAccount.maker.equals(publicKey)) {
        throw new Error("Only the buyer can modify this order");
      }

      if (newAmount < 0) {
        throw new Error("Amount cannot be negative");
      }

      const totalReserved = (trustExpressAccount.reservedAmounts || [])
        .filter(
          (r: ReservationData) =>
            r.status !== ReservationStatus.CANCELLED &&
            r.status !== ReservationStatus.COMPLETED &&
            r.status !== ReservationStatus.DISPUTED
        )
        .reduce((sum: BN, r: ReservationData) => sum.add(r.amount), new BN(0));

      const mintInfo = await getMintInfo(
        new PublicKey(trustExpressAccount.mint)
      );

      const newAmountSmallestUnit = new BN(
        Math.floor(newAmount * 10 ** mintInfo.decimals)
      );

      const currentAmount = trustExpressAccount.amount || new BN(0);

      if (newAmount === 0) {
        if (totalReserved.gt(new BN(0))) {
          throw new Error(
            `Cannot cancel order with active reservations (${
              totalReserved.toNumber() / 10 ** mintInfo.decimals
            } tokens reserved)`
          );
        }
      } else {
        if (newAmountSmallestUnit.gte(currentAmount)) {
          throw new Error(
            `New amount (${newAmount}) must be less than current amount (${
              currentAmount.toNumber() / 10 ** mintInfo.decimals
            })`
          );
        }

        if (newAmountSmallestUnit.lt(totalReserved)) {
          throw new Error(
            `Cannot reduce below reserved amount (${
              totalReserved.toNumber() / 10 ** mintInfo.decimals
            } tokens reserved)`
          );
        }
      }

      const tokenProgram = (await isToken2022(trustExpressAccount.mint))
        ? TOKEN_2022_PROGRAM_ID
        : TOKEN_PROGRAM_ID;


      const isFullCancellation = newAmount === 0;

      const signature = await program.methods
        .cancelOrReduceBuyOrder(newAmountSmallestUnit)
        .accountsPartial({
          buyer: publicKey,
          trustExpress,
          tokenProgram,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();


      const eventType =
        newAmount === 0
          ? TransactionType.EXPRESS_BUY_ORDER_CANCELLED
          : TransactionType.EXPRESS_BUY_ORDER_REDUCED;

      transactionDispatcher.dispatchEvent({
        type: eventType,
        trustExpress,
        signature,
        timestamp: Date.now(),
        details: {
          buyer: publicKey.toString(),
          originalAmount: currentAmount.toNumber() / 10 ** mintInfo.decimals,
          newAmount,
          totalReserved: totalReserved.toNumber() / 10 ** mintInfo.decimals,
          isFullCancellation,
        },
      });

      return signature;
    },
    onError: (error) => {
      console.error("Error during cancel or reduce buy order:", error);
    },
  });

const createBuyOrder = useMutation({
  mutationKey: ["create-buy-order"],
  mutationFn: async (params: {
    mint_a: string;
    amount: number;
    pricePerToken: number;
    currency: string;
    paymentInstructions: string;
    flutterwaveCredentialId?: string; // ADD THIS PARAMETER
  }) => {
    if (!publicKey) {
      throw new Error("Wallet not connected");
    }

    try {
      const seed = new BN(randomBytes(8));

      const {
        mint_a,
        amount,
        pricePerToken,
        currency,
        paymentInstructions,
        flutterwaveCredentialId, // DESTRUCTURE THE NEW PARAMETER
      } = params;

      const mint = new PublicKey(mint_a);

      const isToken2022Result = await isToken2022(mint);
      const tokenProgram = isToken2022Result
        ? TOKEN_2022_PROGRAM_ID
        : TOKEN_PROGRAM_ID;

      let mintInfo;
      try {
        mintInfo = await getMint(
          program.provider.connection,
          mint,
          undefined,
          tokenProgram
        );
      } catch (error) {
        throw new Error("failed to get mint information");
      }

      const amountBN = new BN(Math.floor(amount * 10 ** mintInfo.decimals));
      const pricePerTokenBN = new BN(pricePerToken);

      const validCurrency =
        currency.length === 3
          ? currency
          : currency.padEnd(3, " ").substring(0, 3);

      const [globalState] = PublicKey.findProgramAddressSync(
        [Buffer.from("global-state")],
        program.programId
      );

      const maxAllowed = 500;
      const validPaymentInstructions =
        paymentInstructions.length <= maxAllowed
          ? paymentInstructions
          : paymentInstructions.substring(0, maxAllowed);

      const [trustExpress] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("trust-express"),
          publicKey.toBuffer(),
          seed.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      // VALIDATE CREDENTIAL ID IF PROVIDED
      if (flutterwaveCredentialId) {
        if (flutterwaveCredentialId.length === 0 || flutterwaveCredentialId.length > 64) {
          throw new Error("Flutterwave credential ID must be between 1 and 64 characters");
        }
      } else {
      }

      const signature = await program.methods
        .createExpressBuyOrder(
          seed,
          amountBN,
          pricePerTokenBN,
          validCurrency,
          validPaymentInstructions,
          flutterwaveCredentialId ?? "" // PASS THE CREDENTIAL ID (or null if not provided)
        )
        .accountsPartial({
          buyer: publicKey,
          mint,
          trustExpress,
          globalState,
          systemProgram: SystemProgram.programId,
          tokenProgram: tokenProgram,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();

      transactionDispatcher.dispatchEvent({
        type: TransactionType.EXPRESS_BUY_ORDER_CREATED,
        trustExpress,
        amount,
        signature,
        timestamp: Date.now(),
        details: {
          mint: mint_a,
          pricePerToken,
          currency: validCurrency,
          trustExpressPubkey: trustExpress.toString(),
          flutterwaveCredentialId, // ADD TO EVENT DETAILS FOR TRACKING
        },
      });

      return {
        signature,
        trustExpressPubkey: trustExpress.toString(),
      };
    } catch (error) {
      console.error("Error creating buy order:", error);
      throw error;
    }
  },
  onError: (error) => {
    console.error("Error during create-buy-order:", error);
  },
});


const instantReserve = useMutation({
  mutationKey: ["instant-reserve"],
  mutationFn: async (params: {
    trustExpress: PublicKey;
    amount: number;
    fiatAmount: number;
    currency: string;
    payoutDetails?: string;
  }) => {
    if (!publicKey) {
      throw new Error("Wallet not connected");
    }

    const { trustExpress, amount, fiatAmount, currency, payoutDetails } = params;

    try {
      const trustExpressAccount = await getTrustExpressInfo(trustExpress);
      const mintInfo = await getMintInfo(trustExpressAccount.mint);
      
      const amountBN = new BN(Math.floor(amount * 10 ** mintInfo.decimals));
      const fiatAmountBN = new BN(fiatAmount);

      const tokenProgram = (await isToken2022(trustExpressAccount.mint))
        ? TOKEN_2022_PROGRAM_ID
        : TOKEN_PROGRAM_ID;

      const takerAta = getAssociatedTokenAddressSync(
        trustExpressAccount.mint,
        publicKey,
        false,
        tokenProgram
      );

      const trustExpressAta = getAssociatedTokenAddressSync(
        trustExpressAccount.mint,
        trustExpress,
        true,
        tokenProgram
      );

            try {
        const balance = await provider.connection.getTokenAccountBalance(takerAta);
        const balanceAmount = new BN(balance.value.amount);
        
        if (balanceAmount.lt(amountBN)) {
          throw new Error(
            `Insufficient balance. You have ${
              balanceAmount.toNumber() / 10 ** mintInfo.decimals
            } tokens but need ${amount} tokens`
          );
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes("could not find account")) {
          throw new Error(
            `You don't have a token account for this token. Balance: 0, Required: ${amount}`
          );
        }
        throw error;
      }

      const [globalStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from('global-state')],
        program.programId
      );

      const signature = await program.methods
        .instantReserve(amountBN, fiatAmountBN, currency, payoutDetails || null)
        .accountsPartial({
          trustExpress,
          maker: trustExpressAccount.maker,
          taker: publicKey,
          mint: trustExpressAccount.mint,
          takerAta,
          trustExpressAta,
          globalState: globalStatePda,
          tokenProgram,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      transactionDispatcher.dispatchEvent({
        type: TransactionType.INSTANT_PAYMENT_RESERVED,
        trustExpress,
        amount,
        signature,
        timestamp: Date.now(),
        details: {
          taker: publicKey.toString(),
          fiatAmount,
          currency,
          payoutDetails,
        },
      });

      return signature;
    } catch (error) {
      console.error("Error during instant reserve:", error);
      throw error;
    }
  },
  onError: (error) => {
    console.error("Error during instant-reserve:", error);
  },
});

const confirmPayout = useMutation({
  mutationKey: ["confirm-payout"],
  mutationFn: async (params: {
    trustExpress: PublicKey;
    taker: PublicKey;
    amount: number;
    fiatAmount: number;
    currency: string;
    payoutReference: string;
    success: boolean;
    message: string;
  }) => {
    if (!publicKey) {
      throw new Error("Wallet not connected");
    }

    const { 
      trustExpress, 
      taker, 
      amount, 
      fiatAmount, 
      currency, 
      payoutReference, 
      success, 
      message 
    } = params;

    try {
      const trustExpressAccount = await getTrustExpressInfo(trustExpress);
      const mintInfo = await getMintInfo(trustExpressAccount.mint);
      
      const amountBN = new BN(Math.floor(amount * 10 ** mintInfo.decimals));
      const fiatAmountBN = new BN(fiatAmount);

      const tokenProgram = (await isToken2022(trustExpressAccount.mint))
        ? TOKEN_2022_PROGRAM_ID
        : TOKEN_PROGRAM_ID;

      const trustExpressAta = getAssociatedTokenAddressSync(
        trustExpressAccount.mint,
        trustExpress,
        true,
        tokenProgram
      );

      const takerAta = getAssociatedTokenAddressSync(
        trustExpressAccount.mint,
        taker,
        false,
        tokenProgram
      );

      const feeDestination = trustExpressAccount.feeDestination ||
        new PublicKey("BoWaX34cU74HMhCym4t3W1NvieQJKJ3P7ZU8BZSyVKum");

      const feeDestinationAta = getAssociatedTokenAddressSync(
        trustExpressAccount.mint,
        feeDestination,
        false,
        tokenProgram
      );

      // makerAta needed for dust-close path in confirmPayout
      const makerAta = getAssociatedTokenAddressSync(
        trustExpressAccount.mint,
        trustExpressAccount.maker,
        false,
        tokenProgram
      );

      const signature = await program.methods
        .confirmPayout(
          taker,
          amountBN,
          fiatAmountBN,
          currency,
          payoutReference,
          success,
          message
        )
        .accountsPartial({
          trustExpress,
          botAuthority: publicKey,
          maker: trustExpressAccount.maker,
          mint: trustExpressAccount.mint,
          trustExpressAta,
          feeDestinationAta,
          takerAta,
          makerAta,
          tokenProgram,
        })
        .rpc();

      transactionDispatcher.dispatchEvent({
        type: success ? TransactionType.INSTANT_PAYMENT_SUCCESS : TransactionType.INSTANT_PAYMENT_FAILED,
        trustExpress,
        amount,
        signature,
        timestamp: Date.now(),
        details: {
          taker: taker.toString(),
          fiatAmount,
          currency,
          payoutReference,
          message,
        },
      });

      return signature;
    } catch (error) {
      console.error("Error confirming payout:", error);
      throw error;
    }
  },
  onError: (error) => {
    console.error("Error during confirm-payout:", error);
  },
});

/** SELL */

// Link seller credential function
const linkSellerCredential = useCallback(
  async (trustExpressPda: string, credentialId: string) => {
    try {
      const response = await fetch('/api/flutterwave/seller-credentials/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trustExpressPda,
          credentialId,
          walletAddress: publicKey?.toBase58(),
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to link seller credential');
      }
      return await response.json();
    } catch (error) {
      console.error('Error linking seller credential:', error);
      throw error;
    }
  },
  [publicKey]
);

const createSellOrder = useMutation({
  mutationKey: ["create-sell-order"],
  mutationFn: async (params: {
    mint_a: string;
    amount: number;
    pricePerToken: number;
    currency: string;
    paymentInstructions: string;
    flutterwaveCredentialId?: string;
  }) => {
    if (!publicKey) {
      throw new Error("Wallet not connected");
    }

    try {
      const seed = new BN(randomBytes(8));

      const {
        mint_a,
        amount,
        pricePerToken,
        currency,
        paymentInstructions,
        flutterwaveCredentialId,
      } = params;

      const mint = new PublicKey(mint_a);

      const isToken2022Result = await isToken2022(mint);
      const tokenProgram = isToken2022Result
        ? TOKEN_2022_PROGRAM_ID
        : TOKEN_PROGRAM_ID;

      let mintInfo;
      try {
        mintInfo = await getMint(
          program.provider.connection,
          mint,
          undefined,
          tokenProgram
        );
      } catch (error) {
        throw new Error("failed to get mint information");
      }

      const amountBN = new BN(Math.floor(amount * 10 ** mintInfo.decimals));
      const pricePerTokenBN = new BN(pricePerToken);

      const validCurrency =
        currency.length === 3
          ? currency
          : currency.padEnd(3, " ").substring(0, 3);

      const [globalState] = PublicKey.findProgramAddressSync(
        [Buffer.from("global-state")],
        program.programId
      );

      const maxAllowed = 500;
      const validPaymentInstructions =
        paymentInstructions.length <= maxAllowed
          ? paymentInstructions
          : paymentInstructions.substring(0, maxAllowed);

      const [trustExpress] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("trust-express"),
          publicKey.toBuffer(),
          seed.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      const sellerAta = getAssociatedTokenAddressSync(
        mint,
        publicKey,
        false,
        tokenProgram
      );

      const trustExpressAta = getAssociatedTokenAddressSync(
        mint,
        trustExpress,
        true,
        tokenProgram
      );

      if (flutterwaveCredentialId) {
        if (flutterwaveCredentialId.length === 0 || flutterwaveCredentialId.length > 64) {
          throw new Error("Flutterwave credential ID must be between 1 and 64 characters");
        }
      } else {
      }

      console.log("Token program:", tokenProgram.toString());
console.log("Seller ATA:", sellerAta.toString());
console.log("TrustExpress ATA:", trustExpressAta.toString());
console.log("Mint:", mint.toString());


      const signature = await program.methods
        .createExpressSell(
          seed,
          amountBN,
          pricePerTokenBN,
          validCurrency,
          validPaymentInstructions,
          flutterwaveCredentialId ?? ""
        )
        .accountsPartial({
          seller: publicKey,
          mint,
          sellerAta,
          trustExpress,
          trustExpressAta,
          globalState,
          systemProgram: SystemProgram.programId,
          tokenProgram: tokenProgram,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();

      // Automatically link credential if provided
      {/*if (flutterwaveCredentialId) {
        await linkSellerCredential(trustExpress.toString(), flutterwaveCredentialId);
      } */}

      transactionDispatcher.dispatchEvent({
        type: TransactionType.EXPRESS_SELL_ORDER_CREATED,
        trustExpress,
        amount,
        signature,
        timestamp: Date.now(),
        details: {
          mint: mint_a,
          pricePerToken,
          currency: validCurrency,
          trustExpressPubkey: trustExpress.toString(),
          flutterwaveCredentialId,
        },
      });

      return {
        signature,
        trustExpressPubkey: trustExpress.toString(),
      };
    } catch (error) {
  // Add this to see the actual on-chain error
  if (error instanceof Error && 'getLogs' in error) {
    const logs = await (error as any).getLogs();
    console.error("Transaction logs:", logs);
  }
  console.error("Error creating sell order:", error);
  throw error;

    }
  },
  onError: (error) => {
    console.error("Error during create-sell-order:", error);
  },
});

const instantSellReserve = useMutation({
  mutationKey: ["instant-sell-reserve"],
  mutationFn: async (params: {
    trustExpress: PublicKey;
    amount: number;
    paymentMode: number;
    buyerPayoutDetails?: string;
    tokenDecimals: number;
  }) => {
    if (!publicKey) {
      throw new Error("Wallet not connected");
    }

    const { trustExpress, amount, paymentMode, buyerPayoutDetails, tokenDecimals } = params;

    const reservationKey = `${trustExpress.toString()}-${amount}-${paymentMode}`;
    
    if (pendingSellReservations.has(reservationKey)) {
      throw new Error("This reservation is already being processed. Please wait.");
    }

    setPendingSellReservations(prev => new Set(prev).add(reservationKey));

    try {
      const trustExpressAccount = await getTrustExpressInfo(trustExpress);
      
      const amountBN = new BN(Math.floor(amount * 10 ** tokenDecimals));
      const fiatAmount = amountBN.mul(trustExpressAccount.pricePerToken || new BN(0));

      // ✅ Generate reference ONCE before transaction
      const payoutReference = `IS-${Date.now()}-${publicKey.toString().slice(0, 8)}`;
      
      console.log('[instantSellReserve] 🔑 Generated payout reference:', payoutReference);

      let signature: string = '';
      
      try {
        // ✅ Use the SAME reference in transaction
        const [globalStatePda] = PublicKey.findProgramAddressSync(
          [Buffer.from('global-state')],
          program.programId,
        );

        signature = await program.methods
          .instantSellReserve(amountBN, paymentMode, buyerPayoutDetails || null, payoutReference)
          .accountsPartial({
            trustExpress,
            maker: trustExpressAccount.maker,
            buyer: publicKey,
            globalState: globalStatePda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        console.log('[instantSellReserve] ✅ Transaction sent:', signature);

        // Wait for confirmation
        const latestBlockhash = await provider.connection.getLatestBlockhash();
        await provider.connection.confirmTransaction({
          signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        }, 'confirmed');

        console.log('[instantSellReserve] ✅ Transaction confirmed');

      } catch (error) {
        console.error("Error during instant sell reserve:", error);
        throw error;
      }

      // Dispatch event
      transactionDispatcher.dispatchEvent({
        type: TransactionType.INSTANT_SELL_RESERVATION_CREATED,
        trustExpress,
        amount,
        signature,
        timestamp: Date.now(),
        details: {
          buyer: publicKey.toString(),
          fiatAmount: fiatAmount.toString(),
          paymentMode,
          buyerPayoutDetails,
          payoutReference, // ✅ Include in event details
        },
      });

      // ✅ Return both signature and the SAME reference used on-chain
      return {
        signature,
        payoutReference, // Same reference as on-chain
      };
    } finally {
      setTimeout(() => {
        setPendingSellReservations(prev => {
          const newSet = new Set(prev);
          newSet.delete(reservationKey);
          return newSet;
        });
      }, 5000);
    }
  },
  onError: (error) => {
    console.error("Error during instant-sell-reserve:", error);
  },
});

const confirmSellPayment = useMutation({
  mutationKey: ["confirm-sell-payment"],
  mutationFn: async (params: {
    trustExpress: PublicKey;
    taker: PublicKey;
    payoutReference: string;
    success: boolean;
    message: string;
  }) => {
    if (!publicKey) {
      throw new Error("Wallet not connected");
    }

    const { trustExpress, taker, payoutReference, success, message } = params;

    try {
      const trustExpressAccount = await getTrustExpressInfo(trustExpress);
      const mintInfo = await getMintInfo(trustExpressAccount.mint);

      const tokenProgram = (await isToken2022(trustExpressAccount.mint))
        ? TOKEN_2022_PROGRAM_ID
        : TOKEN_PROGRAM_ID;

      const trustExpressAta = getAssociatedTokenAddressSync(
        trustExpressAccount.mint,
        trustExpress,
        true,
        tokenProgram
      );

      const takerAta = getAssociatedTokenAddressSync(
        trustExpressAccount.mint,
        taker,
        false,
        tokenProgram
      );

      const feeDestination = trustExpressAccount.feeDestination ||
        new PublicKey("BoWaX34cU74HMhCym4t3W1NvieQJKJ3P7ZU8BZSyVKum");

      const feeDestinationAta = getAssociatedTokenAddressSync(
        trustExpressAccount.mint,
        feeDestination,
        false,
        tokenProgram
      );

      // makerAta needed for dust-close path in confirmSellPayment
      const makerAta = getAssociatedTokenAddressSync(
        trustExpressAccount.mint,
        trustExpressAccount.maker,
        false,
        tokenProgram
      );

      const signature = await program.methods
        .confirmSellPayment(
          taker,
          payoutReference,
          success,
          message
        )
        .accountsPartial({
          trustExpress,
          botAuthority: publicKey,
          maker: trustExpressAccount.maker,
          mint: trustExpressAccount.mint,
          trustExpressAta,
          feeDestinationAta,
          takerAta,
          makerAta,
          tokenProgram,
        })
        .rpc();

      transactionDispatcher.dispatchEvent({
        type: success ? TransactionType.INSTANT_SELL_PAYMENT_SUCCESS : TransactionType.INSTANT_SELL_PAYMENT_FAILED,
        trustExpress,
        signature,
        timestamp: Date.now(),
        details: {
          taker: taker.toString(),
          payoutReference,
          message,
        },
      });

      return signature;
    } catch (error) {
      console.error("Error confirming sell payment:", error);
      throw error;
    }
  },
  onError: (error) => {
    console.error("Error during confirm-sell-payment:", error);
  },
});

const expressWithdraw = useMutation({
  mutationKey: ["express-withdraw"],
  mutationFn: async (params: {
    trustExpress: PublicKey;
    withdrawAmount: number;
  }) => {
    if (!publicKey) {
      throw new Error("Wallet not connected");
    }

    const { trustExpress, withdrawAmount } = params;

    try {
      const trustExpressAccount = await getTrustExpressInfo(trustExpress);
      const mintInfo = await getMintInfo(trustExpressAccount.mint);
      
      const withdrawAmountBN = new BN(Math.floor(withdrawAmount * 10 ** mintInfo.decimals));

      const tokenProgram = (await isToken2022(trustExpressAccount.mint))
        ? TOKEN_2022_PROGRAM_ID
        : TOKEN_PROGRAM_ID;

      const trustExpressAta = getAssociatedTokenAddressSync(
        trustExpressAccount.mint,
        trustExpress,
        true,
        tokenProgram
      );

      const makerAta = getAssociatedTokenAddressSync(
        trustExpressAccount.mint,
        publicKey,
        false,
        tokenProgram
      );

      const signature = await program.methods
        .expressWithdraw(withdrawAmountBN)
        .accountsPartial({
          maker: publicKey,
          mint: trustExpressAccount.mint,
          trustExpress,
          trustExpressAta,
          makerAta,
          systemProgram: SystemProgram.programId,
          tokenProgram,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();

      transactionDispatcher.dispatchEvent({
        type: TransactionType.EXPRESS_WITHDRAWAL,
        trustExpress,
        amount: withdrawAmount,
        signature,
        timestamp: Date.now(),
        details: {
          maker: publicKey.toString(),
          withdrawAmount,
        },
      });

      return signature;
    } catch (error) {
      console.error("Error during express withdraw:", error);
      throw error;
    }
  },
  onError: (error) => {
    console.error("Error during express-withdraw:", error);
  },
});

// Admin: Update fee percentage
  const updateFeePercentage = useCallback(
    async (newFeePercentage: number) => {
      if (!program || !publicKey) throw new Error("Wallet not connected");

      const [globalState] = PublicKey.findProgramAddressSync(
        [Buffer.from("global-state")],
        program.programId
      );

      const tx = await program.methods
        .updateFeePercentage(newFeePercentage)
        .accounts({
          authority: publicKey,
          globalState,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      return tx;
    },
    [program, publicKey]
  );

  // Admin: Update fee destination
  const updateFeeDestination = useCallback(
    async (newFeeDestination: PublicKey) => {
      if (!program || !publicKey) throw new Error("Wallet not connected");

      const [globalState] = PublicKey.findProgramAddressSync(
        [Buffer.from("global-state")],
        program.programId
      );

      const tx = await program.methods
        .updateFeeDestination(newFeeDestination)
        .accounts({
          authority: publicKey,
          globalState,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      return tx;
    },
    [program, publicKey]
  );

  // Admin: Pause/unpause buy orders
  const pauseBuyOrders = useCallback(
    async (paused: boolean) => {
      if (!program || !publicKey) throw new Error("Wallet not connected");

      const [globalState] = PublicKey.findProgramAddressSync(
        [Buffer.from("global-state")],
        program.programId
      );

      const tx = await program.methods
        .pauseBuyOrders(paused)
        .accounts({
          authority: publicKey,
          globalState,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      return tx;
    },
    [program, publicKey]
  );

  // Admin: Pause/unpause sell orders
  const pauseSellOrders = useCallback(
    async (paused: boolean) => {
      if (!program || !publicKey) throw new Error("Wallet not connected");

      const [globalState] = PublicKey.findProgramAddressSync(
        [Buffer.from("global-state")],
        program.programId
      );

      const tx = await program.methods
        .pauseSellOrders(paused)
        .accounts({
          authority: publicKey,
          globalState,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      return tx;
    },
    [program, publicKey]
  );

  // Admin: Register a validator
  const registerValidator = useCallback(
    async (validatorPubkey: PublicKey) => {
      if (!program || !publicKey) throw new Error("Wallet not connected");

      const [globalState] = PublicKey.findProgramAddressSync(
        [Buffer.from("global-state")],
        program.programId
      );

      const tx = await program.methods
        .registerValidator(validatorPubkey)
        .accounts({
          authority: publicKey,
          globalState,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      return tx;
    },
    [program, publicKey]
  );

  // Admin: Remove a validator
  const removeValidator = useCallback(
    async (validatorPubkey: PublicKey) => {
      if (!program || !publicKey) throw new Error("Wallet not connected");

      const [globalState] = PublicKey.findProgramAddressSync(
        [Buffer.from("global-state")],
        program.programId
      );

      const tx = await program.methods
        .removeValidator(validatorPubkey)
        .accounts({
          authority: publicKey,
          globalState,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      return tx;
    },
    [program, publicKey]
  );

  // Admin: Update required votes threshold
  const updateRequiredVotes = useCallback(
    async (requiredVotes: number) => {
      if (!program || !publicKey) throw new Error("Wallet not connected");

      const [globalState] = PublicKey.findProgramAddressSync(
        [Buffer.from("global-state")],
        program.programId
      );

      const tx = await program.methods
        .updateRequiredVotes(requiredVotes)
        .accounts({
          authority: publicKey,
          globalState,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      return tx;
    },
    [program, publicKey]
  );
// Admin: Set global stats (total volume, confirmations, etc.)
  const setGlobalStats = useCallback(
  async (params: {
    totalVolume?: number;
    totalConfirmations?: number;
    totalTrustExpressCreated?: number;
    totalTrustExpressClosed?: number;
    totalFeesCollected?: number;
  }) => {
    if (!program || !publicKey) throw new Error("Wallet not connected");

    const [globalState] = PublicKey.findProgramAddressSync(
      [Buffer.from("global-state")],
      program.programId
    );

    const tx = await program.methods
      .setGlobalStats(
        params.totalVolume != null ? new BN(params.totalVolume) : null,
        params.totalConfirmations != null ? new BN(params.totalConfirmations) : null,
        params.totalTrustExpressCreated != null ? new BN(params.totalTrustExpressCreated) : null,
        params.totalTrustExpressClosed != null ? new BN(params.totalTrustExpressClosed) : null,
        params.totalFeesCollected != null ? new BN(params.totalFeesCollected) : null,
      )
      .accounts({
        authority: publicKey,
        globalState,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return tx;
  },
  [program, publicKey]
);

const claimValidatorFees = useMutation({
  mutationFn: async (mintPubkey: PublicKey) => {
    if (!program || !publicKey) throw new Error('Wallet not connected');

    // ── 1. Detect token program from the mint account ───────────────────
    const mintAccountInfo = await provider.connection.getAccountInfo(mintPubkey);
    if (!mintAccountInfo) throw new Error('Mint account not found');
    const tokenProgram = mintAccountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)
      ? TOKEN_2022_PROGRAM_ID
      : TOKEN_PROGRAM_ID;

    // ── 2. Derive PDAs ──────────────────────────────────────────────────
    const [globalState] = PublicKey.findProgramAddressSync(
      [Buffer.from('global-state')],
      program.programId
    );

    const [validatorFeePoolAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from('validator-fee-pool-authority')],
      program.programId
    );

    const [validatorEarnings] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('validator-earnings'),
        publicKey.toBytes(),
        mintPubkey.toBytes(),
      ],
      program.programId
    );

    // ── 3. Derive ATAs explicitly (accountsPartial does NOT auto-resolve) ──
    const validatorFeePoolAta = getAssociatedTokenAddressSync(
      mintPubkey,
      validatorFeePoolAuthority,
      true,          // allowOwnerOffCurve — pool authority is a PDA
      tokenProgram
    );

    const validatorAta = getAssociatedTokenAddressSync(
      mintPubkey,
      publicKey,
      false,
      tokenProgram
    );

    // ── 4. Send the transaction ─────────────────────────────────────────
    const signature = await program.methods
      .claimValidatorFees()
      .accountsPartial({
        validator: publicKey,
        globalState,
        mint: mintPubkey,
        validatorEarnings,
        validatorFeePoolAuthority,
        validatorFeePoolAta,   // must be explicit — Anchor won't derive it
        validatorAta,          // init_if_needed, but address still needed
        tokenProgram,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return signature;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['validator-earnings'] });
    queryClient.invalidateQueries({ queryKey: ['get-global-state'] });
  },
  onError: (error) => {
    console.error('claimValidatorFees error:', error);
  },
});


  return {
    program,
    getGlobalState,
    getTrustExpressAccounts,
    getTrustExpressInfo,
    getMintInfo,
    isConfirmingPayment,
    dispatchPaymentConfirmedEvent,
    updatePrice,
    initializeGlobalState,
    createBuyOrder,
    cancelOrReduceBuyOrder,
    instantReserve,
    confirmPayout,
    getTrustExpressFeeInfo,
    useFeeInfo,
    useGlobalFeePercentage,
    calculateFeeAmount,
    calculateAmountAfterFee,
    calculateRemainingFee,
    getAvailableTrustExpressBalance,
    getBatchedTrustExpressInfo,
    getBatchedTokenBalance,
    getBatchedMintInfo,
    createSellOrder,
    instantSellReserve,
    confirmSellPayment,
    expressWithdraw,
    updateFeePercentage,
    updateFeeDestination,
    pauseBuyOrders,
    pauseSellOrders,
    registerValidator,
    removeValidator,
    updateRequiredVotes,
    setGlobalStats,
    claimValidatorFees,
  };
}