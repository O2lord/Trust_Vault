"use client";

import { useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useQuery } from "@tanstack/react-query";
import { PublicKey } from "@solana/web3.js";
import useTrustExpress from "@/hooks/express/useTrustExpress";

// Known token mint → symbol map (extend as more tokens are supported)
const TOKEN_SYMBOLS: Record<string, string> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
};

// Fallback decimals if mint info hasn't loaded yet
const FALLBACK_DECIMALS = 6;

const RESERVATION_STATUS: Record<number, string> = {
  0: "Pending",
  1: "Payment Sent",
  2: "Completed",
  3: "Cancelled",
  4: "Disputed",
};

function truncate(pubkey: string): string {
  return pubkey.slice(0, 4) + "…" + pubkey.slice(-4);
}

function decodeCurrency(currency: number[]): string {
  try {
    return String.fromCharCode(...currency.filter((c) => c > 0)).trim();
  } catch {
    return "???";
  }
}

function formatAmount(raw: unknown, decimals: number): string {
  const n = Number(raw);
  if (isNaN(n)) return "0";
  return (n / Math.pow(10, decimals)).toFixed(2);
}

function tokenSymbol(mintStr: string): string {
  return TOKEN_SYMBOLS[mintStr] ?? truncate(mintStr);
}

/**
 * Fetches all TrustExpress on-chain accounts (shared cache with LP dashboard)
 * and serialises the connected user's live context into a plain-text block that
 * gets injected into the AI system prompt.
 *
 * Returns null when no wallet is connected — the chat falls back to static KB.
 */
export default function useChatContext(): string | null {
  const { publicKey } = useWallet();
  const { program, getBatchedMintInfo } = useTrustExpress();

  // Reuse the same query key as the LP dashboard so the cache is shared
  const { data: allAccounts } = useQuery({
    queryKey: ["get-trustExpress-accounts"],
    queryFn: () => program.account.trustExpress.all(),
    enabled: !!program && !!publicKey,
    staleTime: 60_000, // 60s — live enough, not hammering RPC
  });

  // Collect unique mint addresses from all accounts so we can fetch their decimals
  const uniqueMints = useMemo<string[]>(() => {
    if (!allAccounts) return [];
    const seen = new Set<string>();
    allAccounts.forEach((a) => seen.add(a.account.mint.toString()));
    return Array.from(seen);
  }, [allAccounts]);

  // Fetch decimals for every mint we've seen — results are cached by getBatchedMintInfo
  const { data: mintDecimalsMap } = useQuery({
    queryKey: ["mint-decimals-map", uniqueMints],
    queryFn: async () => {
      const entries = await Promise.all(
        uniqueMints.map(async (mintStr) => {
          try {
            const info = await getBatchedMintInfo(new PublicKey(mintStr)) as { decimals: number };
            return [mintStr, info.decimals] as [string, number];
          } catch {
            return [mintStr, FALLBACK_DECIMALS] as [string, number];
          }
        })
      );
      return Object.fromEntries(entries) as Record<string, number>;
    },
    enabled: uniqueMints.length > 0,
    staleTime: Infinity, // mint decimals never change
  });

  return useMemo(() => {
    if (!publicKey || !allAccounts) return null;

    const walletStr = publicKey.toString();

    // Helper: look up decimals for a given mint, fall back to 6
    const getDecimals = (mintStr: string): number =>
      mintDecimalsMap?.[mintStr] ?? FALLBACK_DECIMALS;

    // ── Partition accounts ────────────────────────────────────────────────

    const myBuyOrders = allAccounts.filter(
      (a) =>
        a.account.maker.toString() === walletStr &&
        a.account.escrowType === 1
    );

    const mySellOrders = allAccounts.filter(
      (a) =>
        a.account.maker.toString() === walletStr &&
        a.account.escrowType === 0
    );

    // Reservations where this wallet is the taker (across ALL orders)
    type MyReservation = {
      orderAddr: string;
      orderType: string;
      token: string;
      amount: string;
      fiatAmount: number;
      currency: string;
      status: string;
    };

    const myReservations: MyReservation[] = [];

    allAccounts.forEach((a) => {
      const mintStr = a.account.mint.toString();
      const decimals = getDecimals(mintStr);
      const reservedAmounts: any[] = a.account.reservedAmounts ?? [];
      reservedAmounts.forEach((r) => {
        if (r.taker.toString() !== walletStr) return;
        const currency = decodeCurrency(a.account.currency);
        const token = tokenSymbol(mintStr);
        myReservations.push({
          orderAddr: truncate(a.publicKey.toString()),
          orderType: a.account.escrowType === 1 ? "Buy Order" : "Sell Order",
          token,
          amount: formatAmount(r.amount, decimals),
          fiatAmount: Number(r.fiatAmount),
          currency,
          status: RESERVATION_STATUS[r.status as number] ?? "Unknown",
        });
      });
    });

    // ── Best market rates (highest pricePerToken buy orders per pair) ─────

    const rateMap = new Map<string, { price: number; addr: string }>();

    allAccounts.forEach((a) => {
      // Only active buy orders (escrowType=1) with available liquidity
      if (a.account.escrowType !== 1) return;
      if (Number(a.account.amount) <= 0) return;
      const reservations: any[] = a.account.reservedAmounts ?? [];
      if (reservations.length >= 10) return; // fully booked

      const token = tokenSymbol(a.account.mint.toString());
      const currency = decodeCurrency(a.account.currency);
      const key = `${token}/${currency}`;
      const price = Number(a.account.pricePerToken);

      const existing = rateMap.get(key);
      if (!existing || price > existing.price) {
        rateMap.set(key, { price, addr: truncate(a.publicKey.toString()) });
      }
    });

    // ── Serialise ─────────────────────────────────────────────────────────

    const lines: string[] = [
      "## LIVE WALLET CONTEXT",
      `Connected wallet: ${truncate(walletStr)}`,
      "",
    ];

    // Buy orders
    lines.push(`### Your Buy Orders (${myBuyOrders.length})`);
    if (myBuyOrders.length === 0) {
      lines.push("None.");
    } else {
      myBuyOrders.forEach((a) => {
        const mintStr = a.account.mint.toString();
        const decimals = getDecimals(mintStr);
        const token = tokenSymbol(mintStr);
        const currency = decodeCurrency(a.account.currency);
        const available = formatAmount(a.account.amount, decimals);
        const price = Number(a.account.pricePerToken).toLocaleString();
        const resCount = (a.account.reservedAmounts ?? []).length;
        lines.push(
          `- ${available} ${token} available | Rate: ${price} ${currency}/${token} | ${resCount}/10 reservation slots used | PDA: ${truncate(a.publicKey.toString())}`
        );
      });
    }
    lines.push("");

    // Sell orders
    lines.push(`### Your Sell Orders (${mySellOrders.length})`);
    if (mySellOrders.length === 0) {
      lines.push("None.");
    } else {
      mySellOrders.forEach((a) => {
        const mintStr = a.account.mint.toString();
        const decimals = getDecimals(mintStr);
        const token = tokenSymbol(mintStr);
        const currency = decodeCurrency(a.account.currency);
        const available = formatAmount(a.account.amount, decimals);
        const price = Number(a.account.pricePerToken).toLocaleString();
        const resCount = (a.account.reservedAmounts ?? []).length;
        lines.push(
          `- ${available} ${token} available | Rate: ${price} ${currency}/${token} | ${resCount}/10 reservation slots used | PDA: ${truncate(a.publicKey.toString())}`
        );
      });
    }
    lines.push("");

    // Active reservations as taker
    const activeReservations = myReservations.filter(
      (r) => r.status !== "Completed" && r.status !== "Cancelled"
    );
    lines.push(
      `### Your Active Reservations as Taker (${activeReservations.length})`
    );
    if (activeReservations.length === 0) {
      lines.push("None.");
    } else {
      activeReservations.forEach((r) => {
        lines.push(
          `- ${r.amount} ${r.token} | ${r.fiatAmount.toLocaleString()} ${r.currency} | Status: ${r.status} | In: ${r.orderType} ${r.orderAddr}`
        );
      });
    }
    lines.push("");

    // Best market rates
    lines.push("### Best Available Market Rates");
    if (rateMap.size === 0) {
      lines.push("No active buy orders found on-chain right now.");
    } else {
      rateMap.forEach((val, key) => {
        lines.push(
          `- ${key}: ${val.price.toLocaleString()} | Best LP: ${val.addr}`
        );
      });
    }
    lines.push("");
    lines.push(
      "Note: Amounts are in token units. Rates are fiat per 1 whole token. Use this data to answer user-specific questions accurately."
    );

    return lines.join("\n");
  }, [publicKey, allAccounts, mintDecimalsMap]);
}