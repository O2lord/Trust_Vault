import { useCallback } from "react";
import { BN, Program } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { useQueryClient } from "@tanstack/react-query";
import { TrustVault } from "@/relics/trust_vault";
import { TrustVaultAccountData } from "../../types/trustVault";
import { parseTokenAccountBalance } from "../../utils/solana";
import { BATCH_DELAY } from "../../utils/constants";
import { MintInfo } from "@/types/trustVault"

// Batch management for trust vault info
const batchedTrustVaultRequests = new Map<
  string,
  {
    resolve: (value: TrustVaultAccountData) => void;
    reject: (error: unknown) => void;
  }
>();

let trustVaultBatchTimeout: NodeJS.Timeout | null = null;

// Batch management for token balances
const batchedBalanceRequests = new Map<
  string,
  {
    resolve: (value: number) => void;
    reject: (error: unknown) => void;
  }
>();

let balanceBatchTimeout: NodeJS.Timeout | null = null;

// Batch management for mint info
const batchedMintRequests = new Map<
  string,
  {
    resolve: (value: MintInfo) => void;
    reject: (error: unknown) => void;
  }
>();

let mintBatchTimeout: NodeJS.Timeout | null = null;

export const useSolanaBatching = (
  connection: Connection,
  program: Program<TrustVault>
) => {
  const queryClient = useQueryClient();

  const getBatchedTrustVaultInfo = useCallback(
    async (trustVaultPubkey: PublicKey): Promise<TrustVaultAccountData> => {
      const key = trustVaultPubkey.toString();

      // Check cache first
      const cachedData = queryClient.getQueryData<TrustVaultAccountData>([
        `trust-vault-info-${key}`,
      ]);
      if (cachedData) {
        return cachedData;
      }

      return new Promise((resolve, reject) => {
        batchedTrustVaultRequests.set(key, { resolve, reject });

        if (trustVaultBatchTimeout) {
          clearTimeout(trustVaultBatchTimeout);
        }

        trustVaultBatchTimeout = setTimeout(async () => {
          const requests = Array.from(batchedTrustVaultRequests.entries());
          batchedTrustVaultRequests.clear();

          if (requests.length === 0) return;

          try {
            const pubkeys = requests.map(([key]) => new PublicKey(key));
            const accounts = await connection.getMultipleAccountsInfo(pubkeys);

            requests.forEach(([key, { resolve, reject }], index) => {
              try {
                const accountInfo = accounts[index];
                if (!accountInfo) {
                  reject(new Error(`Trust vault account not found: ${key}`));
                  return;
                }

                // Parse the account data using the program
                const parsedData =
                  program.account.trustVault.coder.accounts.decode(
                    "trustVault",
                    accountInfo.data
                  ) as TrustVaultAccountData;

                // Cache the result
                queryClient.setQueryData(
                  [`trust-vault-info-${key}`],
                  parsedData,
                  {
                    updatedAt: Date.now(),
                  }
                );

                resolve(parsedData);
              } catch (error) {
                reject(error);
              }
            });
          } catch (error) {
            requests.forEach(([, { reject }]) => reject(error));
          }
        }, BATCH_DELAY);
      });
    },
    [connection, program, queryClient]
  );

  const getBatchedTokenBalance = useCallback(
    async (tokenAccount: PublicKey): Promise<number> => {
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
            const accounts = await connection.getMultipleAccountsInfo(pubkeys);

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
              } catch (error) {
                reject(error);
              }
            });
          } catch (error) {
            requests.forEach(([, { reject }]) => reject(error));
          }
        }, BATCH_DELAY);
      });
    },
    [connection, queryClient]
  );

  const getBatchedMintInfo = useCallback(
    async (mintPubkey: PublicKey) => {
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
            const accounts = await connection.getMultipleAccountsInfo(pubkeys);

            requests.forEach(([key, { resolve, reject }], index) => {
              try {
                const accountInfo = accounts[index];
                if (!accountInfo) {
                  reject(new Error(`Mint account not found: ${key}`));
                  return;
                }

                const isToken2022 = accountInfo.owner.equals(
                  new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb")
                );
                const tokenProgram = isToken2022
                  ? new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb")
                  : new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

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
              } catch (error) {
                reject(error);
              }
            });
          } catch (error) {
            requests.forEach(([, { reject }]) => reject(error));
          }
        }, BATCH_DELAY);
      });
    },
    [connection, queryClient]
  );

  return {
    getBatchedTrustVaultInfo,
    getBatchedTokenBalance,
    getBatchedMintInfo,
  };
};