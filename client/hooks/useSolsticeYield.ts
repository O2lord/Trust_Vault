/**
 * useSolsticeYield.ts
 *
 * Fetches live yield data from our server-side proxy (/api/solstice/yield-vault)
 * which in turn calls the Solstice Finance API with the secret API key.
 *
 * Also exports useExecuteYieldVault — the hook that orchestrates the full
 * mint → lock flow using the merchant's connected Solana wallet.
 */

import { useEffect, useState, useCallback } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import {
  Transaction,
  TransactionInstruction,
  PublicKey,
  AccountMeta,
} from "@solana/web3.js";

// ─── Live yield info ──────────────────────────────────────────────────────────

export interface YieldInfo {
  totalAssetsUsx: number;
  totalSharesEusx: number;
  eusxPriceInUsx: number;
  impliedApy: number;
  loading: boolean;
  error: string | null;
}

export function useSolsticeYield(): YieldInfo {
  const [info, setInfo] = useState<YieldInfo>({
    totalAssetsUsx: 0,
    totalSharesEusx: 0,
    eusxPriceInUsx: 1.0247,
    impliedApy: 0.1396,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // Our own API route proxies to Solstice — no API key in browser
        const res = await fetch("/api/solstice/yield-vault");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setInfo({
          totalAssetsUsx:  Number(data.totalAssets    ?? data.totalAssetsUsx    ?? 0),
          totalSharesEusx: Number(data.totalShares    ?? data.totalSharesEusx   ?? 0),
          eusxPriceInUsx:  Number(data.eusxPriceInUsx ?? 1.0247),
          impliedApy:      Number(data.apy            ?? data.impliedApy        ?? 0.1396),
          loading: false,
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        setInfo((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : "Could not fetch live yield data",
        }));
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return info;
}

// ─── Execute yield vault flow ─────────────────────────────────────────────────

export type YieldVaultStatus =
  | "idle"
  | "building_instructions"
  | "awaiting_signature_mint_request"
  | "confirming_mint_request"
  | "awaiting_signature_mint_confirm"
  | "confirming_mint_confirm"
  | "awaiting_signature_lock"
  | "confirming_lock"
  | "completed"
  | "error";

export interface YieldVaultResult {
  eusxAmount: number;
  lockSignature: string;
}

export interface UseExecuteYieldVaultReturn {
  status: YieldVaultStatus;
  error: string | null;
  result: YieldVaultResult | null;
  execute: (usdcAmount: number, collateral?: "usdc" | "usdt") => Promise<void>;
  reset: () => void;
}

function deserialiseInstruction(raw: {
  instruction: string;
  accounts: string[];
  programId: string;
  accountMetas?: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
}): TransactionInstruction {
  const data = Buffer.from(raw.instruction, "base64");
  const programId = new PublicKey(raw.programId);

  const keys: AccountMeta[] = raw.accountMetas
    ? raw.accountMetas.map((m) => ({
        pubkey: new PublicKey(m.pubkey),
        isSigner: m.isSigner,
        isWritable: m.isWritable,
      }))
    : raw.accounts.map((addr) => ({
        pubkey: new PublicKey(addr),
        isSigner: false,
        isWritable: true,
      }));

  return new TransactionInstruction({ programId, keys, data });
}

export function useExecuteYieldVault(): UseExecuteYieldVaultReturn {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const [status, setStatus] = useState<YieldVaultStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<YieldVaultResult | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setResult(null);
  }, []);

  const execute = useCallback(
    async (usdcAmount: number, collateral: "usdc" | "usdt" = "usdc") => {
      if (!publicKey || !sendTransaction) {
        setError("Wallet not connected");
        setStatus("error");
        return;
      }

      // Convert to lamports (USDC = 6 decimals)
      const lamports = Math.round(usdcAmount * 1_000_000).toString();

      try {
        // ── 1. Fetch serialised instructions from our server-side proxy ──────
        setStatus("building_instructions");
        const res = await fetch("/api/solstice/yield-vault", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletAddress: publicKey.toBase58(),
            usdcAmount: lamports,
            collateral,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Unknown error" }));
          throw new Error(err.error ?? `Server error ${res.status}`);
        }

        const steps: Array<{
          step: string;
          instruction: string;
          accounts: string[];
          programId: string;
          accountMetas?: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
          slot: number;
        }> = await res.json();

        const findStep = (name: string) => {
          const s = steps.find((s) => s.step === name);
          if (!s) throw new Error(`Missing step: ${name}`);
          return s;
        };

        // ── 2. request_mint ─────────────────────────────────────────────────
        setStatus("awaiting_signature_mint_request");
        const requestMintIx = deserialiseInstruction(findStep("request_mint"));
        const { blockhash: bh1, lastValidBlockHeight: lv1 } =
          await connection.getLatestBlockhash();
        const tx1 = new Transaction({ recentBlockhash: bh1, feePayer: publicKey });
        tx1.add(requestMintIx);
        const sig1 = await sendTransaction(tx1, connection);
        setStatus("confirming_mint_request");
        await connection.confirmTransaction(
          { signature: sig1, blockhash: bh1, lastValidBlockHeight: lv1 },
          "confirmed"
        );

        // ── 3. confirm_mint ─────────────────────────────────────────────────
        setStatus("awaiting_signature_mint_confirm");
        const confirmMintIx = deserialiseInstruction(findStep("confirm_mint"));
        const { blockhash: bh2, lastValidBlockHeight: lv2 } =
          await connection.getLatestBlockhash();
        const tx2 = new Transaction({ recentBlockhash: bh2, feePayer: publicKey });
        tx2.add(confirmMintIx);
        const sig2 = await sendTransaction(tx2, connection);
        setStatus("confirming_mint_confirm");
        await connection.confirmTransaction(
          { signature: sig2, blockhash: bh2, lastValidBlockHeight: lv2 },
          "confirmed"
        );

        // ── 4. lock ─────────────────────────────────────────────────────────
        setStatus("awaiting_signature_lock");
        const lockIx = deserialiseInstruction(findStep("lock"));
        const { blockhash: bh3, lastValidBlockHeight: lv3 } =
          await connection.getLatestBlockhash();
        const tx3 = new Transaction({ recentBlockhash: bh3, feePayer: publicKey });
        tx3.add(lockIx);
        const sig3 = await sendTransaction(tx3, connection);
        setStatus("confirming_lock");
        await connection.confirmTransaction(
          { signature: sig3, blockhash: bh3, lastValidBlockHeight: lv3 },
          "confirmed"
        );

        setResult({ eusxAmount: usdcAmount, lockSignature: sig3 });
        setStatus("completed");
      } catch (err) {
        console.error("[useExecuteYieldVault]", err);
        setError(err instanceof Error ? err.message : "Unknown error");
        setStatus("error");
      }
    },
    [publicKey, sendTransaction, connection]
  );

  return { status, error, result, execute, reset };
}