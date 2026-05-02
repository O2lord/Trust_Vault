import { useEffect, useState } from "react";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, } from "@solana/spl-token";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import useTrustVaultProgram from "./useTrustVaultProgram";
import { ReservationStatus } from "@/types/trustVault";
import { useSolanaBatching } from "@/hooks/utils/useBatching";
import { TRUST_VAULT_TYPE_BUY_ORDER, TRUST_VAULT_TYPE_SELL_ORDER } from "@/utils/constants";
import { getMintInfo } from "@/utils/solana";

// Type definitions for batched operations
interface BatchedTrustVaultInfo {
  trustVaultType: number;
  reservedFee: { toNumber: () => number };
  amount: { toNumber: () => number };
  reservedAmounts: ReservationData[];
  maker: PublicKey;
  mint: PublicKey;
}

interface ReservationData {
  taker: PublicKey;
  amount: { toString: () => string };
  fiatAmount: { toString: () => string };
  timestamp: { toString: () => string };
  status: number;
  disputeReason?: string;
  disputeId?: string;
}

export const useVaultBalance = (trustVault: PublicKey | undefined, mintAddress: PublicKey | undefined) => {
  const { connection } = useConnection();
  const [totalBalance, setTotalBalance] = useState<number | null>(null);
  const [availableBalance, setAvailableBalance] = useState<number | null>(null);
  const [lockedBalance, setLockedBalance] = useState<number | null>(null);
  const [reservedFee, setReservedFee] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [totalWanted, setTotalWanted] = useState<number | null>(null);
  const [totalReserved, setTotalReserved] = useState<number | null>(null);
  const [trustVaultType, setTrustVaultType] = useState<number | null>(null);
  const trustVaultProgram = useTrustVaultProgram();
  
  // Use the batching hook
  const batching = useSolanaBatching(connection, trustVaultProgram.program);

  // Utility function to check if vault account exists
  const checkVaultExists = async (vaultAddress: PublicKey): Promise<boolean> => {
    try {
      const accountInfo = await connection.getAccountInfo(vaultAddress);
      return accountInfo !== null;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    const fetchVaultBalance = async () => {
      try {
        if (!trustVault || !mintAddress) {
          setError("Invalid input data.");
          return;
        }

        // Use batched trust vault info if available
        let trustVaultAccount: BatchedTrustVaultInfo;
        try {
          trustVaultAccount = await batching.getBatchedTrustVaultInfo(trustVault) as BatchedTrustVaultInfo;
        } catch {
          // Fallback to direct program call
          trustVaultAccount = await trustVaultProgram.program.account.trustVault.fetch(trustVault) as BatchedTrustVaultInfo;
        }
        
        const trustVaultTypeValue = trustVaultAccount.trustVaultType;
        setTrustVaultType(trustVaultTypeValue);

        // Get mint info and token program for decimal calculations
        const mintInfo = await getMintInfo((mintAddress), trustVaultProgram.program.provider.connection);
        const tokenProgram = mintInfo.tokenProgram || (mintInfo.isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID);
        const decimals = mintInfo.decimals || 0;

        // Calculate reserved fee (common to both types)
        const rawReservedFee = trustVaultAccount.reservedFee?.toNumber() || 0;
        const formattedReservedFee = rawReservedFee / Math.pow(10, decimals);
        setReservedFee(formattedReservedFee);

        // Calculate the associated token address for the vault PDA using the CORRECT token program
        const vaultAccount = getAssociatedTokenAddressSync(
          mintAddress,
          trustVault,
          true,
          tokenProgram  
        );
        
        // Check if vault exists first
        const vaultExists = await checkVaultExists(vaultAccount);
        
        // Fetch the vault token account balance with batching
        let vaultBalance = 0;
        
        if (vaultExists) {
          try {
            // Prefer batched balance fetching
            const rawBalance = await batching.getBatchedTokenBalance(vaultAccount);
            vaultBalance = rawBalance / Math.pow(10, decimals);
          } catch (batchError) {
            console.warn("Batched token balance fetch failed, falling back to direct fetch:", batchError);
            // Fallback to direct fetch if batching fails
            const tokenAccountInfo = await connection.getTokenAccountBalance(vaultAccount);
            vaultBalance = Number(tokenAccountInfo.value.amount) / Math.pow(10, decimals);
          }
        } else {
          vaultBalance = 0;
          
          if (trustVaultTypeValue === TRUST_VAULT_TYPE_SELL_ORDER) {
            console.error("ERROR: Sell-order vault should have tokens but vault account not found");
            setError("Vault account not found - this indicates a problem with vault creation");
            return;
          }
        }
        
        setTotalBalance(vaultBalance);

        if (trustVaultTypeValue === TRUST_VAULT_TYPE_SELL_ORDER) {
          // SELL-FIRST LOGIC (original logic)
          let lockedAmount = 0;
          if (trustVaultAccount.reservedAmounts && trustVaultAccount.reservedAmounts.length > 0) {
            const activeReservations = trustVaultAccount.reservedAmounts.filter(
              (r: ReservationData) => r.status === ReservationStatus.PENDING || 
                   r.status === ReservationStatus.PAYMENT_SENT || 
                   r.status === ReservationStatus.DISPUTED
            );
            
            lockedAmount = activeReservations.reduce((total: number, r: ReservationData) => {
              return total + Number(r.amount.toString());
            }, 0);
          }
          
          const formattedLockedBalance = lockedAmount / Math.pow(10, decimals);
          setLockedBalance(formattedLockedBalance);
          
          const available = vaultBalance - formattedLockedBalance - formattedReservedFee;
          setAvailableBalance(available > 0 ? available : 0);
          
          setTotalWanted(null);
          setTotalReserved(null);

        } else if (trustVaultTypeValue === TRUST_VAULT_TYPE_BUY_ORDER) {
          // BUY-FIRST LOGIC
          const rawTotalWanted = trustVaultAccount.amount?.toNumber() || 0;
          const formattedTotalWanted = rawTotalWanted / Math.pow(10, decimals);
          setTotalWanted(formattedTotalWanted);

          let totalReservedAmount = 0;
          if (trustVaultAccount.reservedAmounts && trustVaultAccount.reservedAmounts.length > 0) {
            const activeReservations = trustVaultAccount.reservedAmounts.filter(
              (r: ReservationData) => r.status === ReservationStatus.PENDING || 
                   r.status === ReservationStatus.PAYMENT_SENT || 
                   r.status === ReservationStatus.DISPUTED
            );
            
            totalReservedAmount = activeReservations.reduce((total: number, r: ReservationData) => {
              return total + Number(r.amount.toString());
            }, 0);
          }
          
          const formattedTotalReserved = totalReservedAmount / Math.pow(10, decimals);
          setTotalReserved(formattedTotalReserved);
          
          if (!vaultExists) {
            setLockedBalance(0);
            setAvailableBalance(formattedTotalWanted);
          } else {
            setLockedBalance(vaultBalance);
            
            const available = formattedTotalWanted - formattedTotalReserved;
            setAvailableBalance(available > 0 ? available : 0);
          }
        }
        
        setError(null);
      } catch (error) {
        console.error("Error fetching vault balance:", error);
        
        let errorMessage = "Failed to fetch vault balance.";
        if (error instanceof Error) {
          if (error.message.includes("TokenInvalidAccountOwnerError")) {
            errorMessage = "Token mint uses unsupported token program or mint account is invalid.";
          } else if (error.message.includes("AccountNotFound")) {
            errorMessage = "Trust vault account not found.";
          } else {
            errorMessage = `Error: ${error.message}`;
          }
        }
        
        setTotalBalance(null);
        setAvailableBalance(null);
        setLockedBalance(null);
        setReservedFee(null);
        setTotalWanted(null);
        setTotalReserved(null);
        setTrustVaultType(null);
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    if (trustVault && mintAddress) {
      fetchVaultBalance();
    } else {
      setLoading(false);
      setError("Invalid input data.");
    }
  }, [trustVault, mintAddress, connection, trustVaultProgram.program, batching]);

  return { 
    vaultBalance: totalBalance, 
    totalBalance,
    availableBalance,
    lockedBalance,
    reservedFee,
    totalWanted, 
    totalReserved, 
    trustVaultType, 
    loading, 
    error 
  };
};