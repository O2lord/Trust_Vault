// hooks/express/useExpressGlobalStats.ts

import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useQuery } from "@tanstack/react-query";
import useTrustExpress from "@/hooks/express/useTrustExpress";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ExpressGlobalStats {
  activeEscrows: number;
  totalVolume: number;
  totalVolumeFormatted: string;
  totalCreated: number;
  totalClosed: number;
  isLoading: boolean;
  totalConfirmations: number;
  totalFees: number;
  totalFeesFormatted: string;
  activeVoteCount: number;
  validatorCount: number;
  requiredVotes: number;
  refresh: () => void;
}

// ── Formatter ──────────────────────────────────────────────────────────────

function formatVolume(value: number): string {
  if (!value || isNaN(value)) return '$0.00';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000)     return `$${(value / 1_000).toFixed(1)}K`;
  if (value >= 0.01)      return `$${value.toFixed(2)}`;
  // For very small values (e.g. $0.0007 in fees) show enough significant
  // digits so the number isn't swallowed by rounding to $0.00
  if (value > 0)          return `$${value.toPrecision(2)}`;
  return '$0.00';
}

// ── Allowed mints from env ─────────────────────────────────────────────────
//
// NEXT_PUBLIC_ALLOWED_MINTS is a comma-separated list of mint addresses.
// e.g. NEXT_PUBLIC_ALLOWED_MINTS="MintAddr1,MintAddr2"
// The first entry is used as the decimals source when no active escrows exist.

const ALLOWED_MINTS: string[] = (
  process.env.NEXT_PUBLIC_ALLOWED_MINTS ?? ""
)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

// ── Mint decimals fetcher ──────────────────────────────────────────────────
//
// Reads decimals directly from the mint account (byte offset 44 in the
// standard SPL mint layout). Cached by TanStack Query — one RPC call ever.

function useMintDecimals(mintAddress: string | null | undefined): number | null {
  const { connection } = useConnection();

  const { data } = useQuery({
    queryKey: ["mint-decimals", mintAddress],
    enabled: !!mintAddress,
    staleTime: Infinity, // decimals never change for a given mint
    queryFn: async () => {
      const info = await connection.getAccountInfo(new PublicKey(mintAddress!));
      if (!info) throw new Error(`Mint account not found: ${mintAddress}`);
      // SPL Mint layout: decimals is at byte offset 44
      return info.data[44];
    },
  });

  return data ?? null;
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useExpressGlobalStats(): ExpressGlobalStats {
  const { getGlobalState, getTrustExpressAccounts } = useTrustExpress();
  const queryClient = useQueryClient();

  // Prefer the mint from a live vault account.
  // When there are no active escrows, fall back to the first entry in
  // NEXT_PUBLIC_ALLOWED_MINTS so decimals (and therefore volume) still resolve.
  const mintAddress = useMemo(() => {
    const accounts = getTrustExpressAccounts.data;
    if (accounts && accounts.length > 0) {
      return accounts[0].account.mint.toString();
    }
    return ALLOWED_MINTS[0] ?? null;
  }, [getTrustExpressAccounts.data]);

  // Live decimals from the mint account — fetched once, cached forever
  const decimals = useMintDecimals(mintAddress);

  const isLoading =
    getGlobalState.isLoading ||
    getTrustExpressAccounts.isLoading ||
    // Hold loading state until decimals resolve so we never divide by wrong value.
    // If there are no allowed mints configured at all, don't block forever.
    (mintAddress !== null && decimals === null);

  const activeEscrows = getTrustExpressAccounts.data?.length ?? 0;

  const gs = getGlobalState.data as
    | {
        totalVolume:              { toString(): string };
        totalTrustExpressCreated: { toNumber(): number };
        totalTrustExpressClosed:  { toNumber(): number };
        totalConfirmations:       { toNumber(): number };
        totalFeesCollected:       { toString(): string };
        activeVoteCount:          { toNumber(): number };
        validatorCount:           number;
        requiredVotes:            number;
        validators:               PublicKey[];
      }
    | null
    | undefined;

  const totalVolume = useMemo(() => {
    if (!gs || decimals === null) return 0;
    const raw = Number(gs.totalVolume.toString());
    if (isNaN(raw)) return 0;
    return raw / Math.pow(10, decimals);
  }, [gs, decimals]);

  const totalFees = useMemo(() => {
    if (!gs || decimals === null) return 0;
    const raw = Number(gs.totalFeesCollected?.toString() ?? '0');
    if (isNaN(raw)) return 0;
    return raw / Math.pow(10, decimals);
  }, [gs, decimals]);

  const totalCreated       = gs?.totalTrustExpressCreated.toNumber() ?? 0;
  const totalClosed        = gs?.totalTrustExpressClosed.toNumber()  ?? 0;
  const totalConfirmations = gs?.totalConfirmations?.toNumber()      ?? 0;
  const activeVoteCount    = gs?.activeVoteCount?.toNumber()         ?? 0;
  const validatorCount     = gs?.validatorCount                      ?? 0;
  const requiredVotes      = gs?.requiredVotes                       ?? 0;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["get-global-state"] });
    queryClient.invalidateQueries({ queryKey: ["get-trust-express-accounts"] });
  };

  return {
    activeEscrows,
    totalVolume,
    totalVolumeFormatted:  formatVolume(totalVolume),
    totalCreated,
    totalClosed,
    totalConfirmations,
    totalFees,
    totalFeesFormatted:    formatVolume(totalFees),
    activeVoteCount,
    validatorCount,
    requiredVotes,
    isLoading,
    refresh,
  };
}