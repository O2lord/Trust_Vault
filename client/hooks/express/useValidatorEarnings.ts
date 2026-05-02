// hooks/express/useValidatorEarnings.ts
//
// Fetches the ValidatorEarnings PDA for the connected wallet + a given mint,
// along with the pool balance and mint decimals so the UI can display
// claimable / lifetime / credits without any extra RPC calls.

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { BN, Program } from '@coral-xyz/anchor';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import useAnchorProvider from '../useAnchorProvider';
import { TrustVault as TrustExpress } from '@/relics/trust_express/trust_express';
import idl from '@/relics/trust_express/trust_express.json';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ValidatorEarningsData {
  /** Claimable balance (raw u64 from chain) */
  accumulatedAmount: BN;
  /** Lifetime earned (never decrements) */
  totalEarned: BN;
  /** Number of vote executions credited */
  totalCredits: BN;
  /** Unix timestamp of last credit */
  lastCreditedAt: BN;
  /** PDA bump */
  bump: number;
}

export interface ValidatorEarningsResult {
  /** null if PDA hasn't been initialised yet (validator hasn't earned anything) */
  earnings: ValidatorEarningsData | null;
  /** Token decimals read from the mint account */
  decimals: number;
  /** Human-readable claimable amount */
  claimableFormatted: string;
  /** Human-readable lifetime earned */
  totalEarnedFormatted: string;
  /** Whether the validator has any claimable balance */
  hasClaimable: boolean;
  /** Pool ATA balance (raw) — for display/sanity check */
  poolBalance: number;
  isLoading: boolean;
  error: string | null;
  /** Refetch everything */
  refetch: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatTokenAmount(raw: BN | null | undefined, decimals: number): string {
  if (!raw) return '0.000000';
  const value = Number(raw.toString()) / Math.pow(10, decimals);
  if (value === 0) return '0.000000';
  if (value < 0.000001) return value.toPrecision(2);
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useValidatorEarnings(mintAddress: string | null | undefined): ValidatorEarningsResult {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const provider = useAnchorProvider();

  const program = useMemo(
    () => new Program<TrustExpress>(idl as TrustExpress, provider),
    [provider]
  );

  const enabled = !!publicKey && !!mintAddress;

  const query = useQuery({
    queryKey: ['validator-earnings', publicKey?.toString(), mintAddress],
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!publicKey || !mintAddress) throw new Error('Not ready');

      const mintPubkey = new PublicKey(mintAddress);
      const validatorKey = publicKey;

      // ── 1. Derive PDAs ──────────────────────────────────────────────────
      const [earningsPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('validator-earnings'), validatorKey.toBytes(), mintPubkey.toBytes()],
        program.programId
      );

      const [poolAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from('validator-fee-pool-authority')],
        program.programId
      );

      // ── 2. Fetch mint, earnings PDA, and pool ATA in one batch ──────────
      const mintInfo = await connection.getAccountInfo(mintPubkey);
      if (!mintInfo) throw new Error('Mint account not found');

      const isToken2022 = mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID);
      const tokenProgram = isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
      const decimals: number = mintInfo.data[44]; // SPL Mint: decimals at offset 44

      const poolATA = getAssociatedTokenAddressSync(mintPubkey, poolAuthority, true, tokenProgram);

      const [earningsInfo, poolInfo] = await connection.getMultipleAccountsInfo([
        earningsPDA,
        poolATA,
      ]);

      // ── 3. Parse earnings PDA ───────────────────────────────────────────
      let earnings: ValidatorEarningsData | null = null;
      if (earningsInfo && earningsInfo.data.length >= 8) {
        try {
          const decoded = program.account.validatorEarnings.coder.accounts.decode(
            'validatorEarnings',
            earningsInfo.data
          ) as ValidatorEarningsData;
          earnings = decoded;
        } catch {
          // PDA exists but can't decode — treat as uninitialized
          earnings = null;
        }
      }

      // ── 4. Parse pool ATA balance ───────────────────────────────────────
      let poolBalance = 0;
      if (poolInfo && poolInfo.data.length >= 72) {
        const buf = poolInfo.data as Buffer;
        poolBalance = Number(buf.readBigUInt64LE(64));
      }

      return { earnings, decimals, poolBalance };
    },
  });

  const data = query.data;
  const earnings = data?.earnings ?? null;
  const decimals = data?.decimals ?? 9;
  const poolBalance = data?.poolBalance ?? 0;

  const hasClaimable =
    earnings !== null && Number(earnings.accumulatedAmount.toString()) > 0;

  return {
    earnings,
    decimals,
    claimableFormatted: formatTokenAmount(earnings?.accumulatedAmount, decimals),
    totalEarnedFormatted: formatTokenAmount(earnings?.totalEarned, decimals),
    hasClaimable,
    poolBalance,
    isLoading: query.isLoading,
    error: query.error ? String(query.error) : null,
    refetch: query.refetch,
  };
}