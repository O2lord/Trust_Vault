/**
 * useExpressBalances.ts
 *
 * REPLACES: per-card useTrustExpressBalance calls
 *
 * Fetches ALL vault token balances and mint info in two batched
 * getMultipleAccountsInfo calls — regardless of how many cards are rendered.
 * Cards receive pre-computed BalanceData as props and make zero RPC calls.
 */

import { useCallback, useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { BN, ProgramAccount } from "@coral-xyz/anchor";

// ── Types ──────────────────────────────────────────────────────────────────

const EXPRESS_SELL = 0;
const EXPRESS_BUY  = 1;

enum ReservationStatus {
  PENDING      = 0,
  PAYMENT_SENT = 1,
  COMPLETED    = 2,
  CANCELLED    = 3,
  DISPUTED     = 4,
}

interface ReservationData {
  taker: PublicKey;
  amount: BN;
  fiatAmount: BN;
  timestamp: BN;
  status: number;
}

interface TrustExpressAccount {
  escrowType: number;
  maker: PublicKey;
  mint: PublicKey;
  amount: BN;
  pricePerToken: BN;
  reservedAmounts: ReservationData[];
  reservedFee?: BN;
  feePercentage?: number;
  currency: number[];
  seed: BN;
  bump: number;
}

export interface BalanceData {
  /** Raw vault token balance (human-readable, already divided by decimals) */
  totalBalance: number | null;
  availableBalance: number | null;
  lockedBalance: number | null;
  reservedFee: number | null;
  /** Only set for EXPRESS_BUY orders */
  totalWanted: number | null;
  totalReserved: number | null;
  escrowType: number | null;
  decimals: number;
  loading: boolean;
  error: string | null;
}

export type BalanceMap = Record<string, BalanceData>;

// ── Helper: parse raw token-account bytes → u64 amount ────────────────────

function parseTokenAccountBalance(data: Buffer): number {
  try {
    return Number(data.readBigUInt64LE(64));
  } catch {
    return 0;
  }
}

// ── Main hook ──────────────────────────────────────────────────────────────

/**
 * Call this ONCE at the grid level (ExpressSellGrid / ExpressBuyGrid).
 * Pass the full account list returned by getTrustExpressAccounts.
 *
 * Returns a map: publicKey.toString() → BalanceData
 */
export function useExpressBalances(
  accounts: ProgramAccount<TrustExpressAccount>[] | undefined
): BalanceMap {
  const { connection } = useConnection();
  const [balanceMap, setBalanceMap] = useState<BalanceMap>({});

  const fetchAll = useCallback(async () => {
    if (!accounts || accounts.length === 0) {
      setBalanceMap({});
      return;
    }

    // ── 1. Fetch all mint accounts in one call ──────────────────────────
    const uniqueMints = Array.from(
      new Set(accounts.map((a) => a.account.mint.toString()))
    ).map((s) => new PublicKey(s));

    const mintAccountInfos = await connection.getMultipleAccountsInfo(uniqueMints);

    // Build mint-info lookup: mintAddress → { decimals, tokenProgram }
    const mintInfoMap: Record<string, { decimals: number; tokenProgram: PublicKey }> = {};
    uniqueMints.forEach((mint, i) => {
      const info = mintAccountInfos[i];
      if (!info) return;
      const isToken2022 = info.owner.equals(TOKEN_2022_PROGRAM_ID);
      mintInfoMap[mint.toString()] = {
        decimals: info.data[44], // offset 44 in mint layout
        tokenProgram: isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
      };
    });

    // ── 2. Derive all vault ATAs ────────────────────────────────────────
    const vaultATAs: (PublicKey | null)[] = accounts.map((acc) => {
      const mintStr = acc.account.mint.toString();
      const minfo = mintInfoMap[mintStr];
      if (!minfo) return null;
      return getAssociatedTokenAddressSync(
        acc.account.mint,
        acc.publicKey,
        true,
        minfo.tokenProgram
      );
    });

    // ── 3. Fetch all vault token accounts in one call ───────────────────
    const validATAs = vaultATAs.map((a) => a ?? PublicKey.default);
    const vaultAccountInfos = await connection.getMultipleAccountsInfo(validATAs);

    // ── 4. Compute BalanceData for each account ─────────────────────────
    const newMap: BalanceMap = {};

    accounts.forEach((acc, i) => {
      const pubkeyStr = acc.publicKey.toString();
      const mintStr   = acc.account.mint.toString();
      const minfo     = mintInfoMap[mintStr];

      if (!minfo) {
        newMap[pubkeyStr] = {
          totalBalance: null, availableBalance: null, lockedBalance: null,
          reservedFee: null, totalWanted: null, totalReserved: null,
          escrowType: acc.account.escrowType, decimals: 0,
          loading: false, error: "Mint info unavailable",
        };
        return;
      }

      const { decimals, tokenProgram } = minfo;
      const pow = Math.pow(10, decimals);

      // Raw vault balance
      const vaultInfo  = vaultAccountInfos[i];
      const rawBalance = vaultInfo ? parseTokenAccountBalance(vaultInfo.data as Buffer) : 0;
      const vaultBalance = rawBalance / pow;

      // Reserved fee
      const rawReservedFee = acc.account.reservedFee?.toNumber() ?? 0;
      const formattedReservedFee = rawReservedFee / pow;

      // Active reservations (PENDING | PAYMENT_SENT | DISPUTED)
      const activeRes = (acc.account.reservedAmounts ?? []).filter(
        (r) =>
          r.status === ReservationStatus.PENDING ||
          r.status === ReservationStatus.PAYMENT_SENT ||
          r.status === ReservationStatus.DISPUTED
      );

      const lockedRaw = activeRes.reduce(
        (sum, r) => sum + Number(r.amount.toString()),
        0
      );
      const lockedBalance = lockedRaw / pow;

      let availableBalance: number;
      let totalWanted: number | null    = null;
      let totalReserved: number | null  = null;

      if (acc.account.escrowType === EXPRESS_SELL) {
        // For sell orders, on-chain `amount` is the net available capacity.
        // instant_sell_reserve decrements it on reservation; confirm_sell_payment
        // restores it on failure/timeout. Tokens are NOT physically moved out of
        // the ATA on reservation — they stay until confirm_sell_payment succeeds.
        // account.amount is therefore the authoritative source of truth for what
        // buyers can still purchase and what the LP can withdraw.
        const onChainAvail = acc.account.amount.toNumber() / pow;
        availableBalance   = Math.max(0, onChainAvail);
        totalWanted        = null;
        totalReserved      = null;
      } else {
        // EXPRESS_BUY: amount = total the buyer committed to buy
        const rawWanted   = acc.account.amount?.toNumber() ?? 0;
        totalWanted        = rawWanted / pow;
        totalReserved      = lockedBalance;

        if (!vaultInfo) {
          availableBalance = totalWanted;
        } else {
          availableBalance = Math.max(0, totalWanted - totalReserved);
        }
      }

      newMap[pubkeyStr] = {
        totalBalance:     vaultBalance,
        availableBalance,
        lockedBalance,
        reservedFee:      formattedReservedFee,
        totalWanted,
        totalReserved,
        escrowType:       acc.account.escrowType,
        decimals,
        loading:          false,
        error:            null,
      };
    });

    setBalanceMap(newMap);
  }, [accounts, connection]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return balanceMap;
}