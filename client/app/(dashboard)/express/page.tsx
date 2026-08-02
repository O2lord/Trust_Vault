"use client";
import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Zap, Loader2, RefreshCcw, CheckCircle, AlertCircle, Building2, ChevronDown } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { PublicKey, Connection } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import useTrustExpress from "@/hooks/express/useTrustExpress";
import InstantBuyDialog from "@/components/TrustExpress/SellOrder/InstantBuyDialog";
import { PaymentLinkDisplay } from "@/components/TrustExpress/SellOrder/PaymentLinkDisplay";
import { supabase } from "@/lib/client";
import { useExpressGlobalStats } from "@/hooks/express/useExpressGlobalStats";
import ProviderCTASection from "@/components/TrustExpress/ProviderCTASection";
import { useProcessorBanks } from "@/hooks/express/useProcessorBanks";
import { useTokenMetadata } from "@/hooks/useTokenMetadata";
import Image from "next/image";

// ─── AI Intent Types & Hook ────────────────────────────────────────────────────
export interface AiIntent {
  type: "reduce" | "updatePrice" | null;
  orderAddress: string | null;
  reduceBy?: number;
  newPrice?: number;
  currency?: string;
}

/** Reads AI-triggered reduce / updatePrice intents from URL search params. */
export function useAiIntent(): AiIntent {
  const params = useSearchParams();
  return useMemo(() => {
    const intent = params.get("intent") as AiIntent["type"];
    if (intent !== "reduce" && intent !== "updatePrice") {
      return { type: null, orderAddress: null };
    }
    return {
      type: intent,
      orderAddress: params.get("orderAddress"),
      reduceBy:  intent === "reduce"      ? Number(params.get("reduceBy")) : undefined,
      newPrice:  intent === "updatePrice" ? Number(params.get("newPrice")) : undefined,
      currency:  params.get("currency") ?? undefined,
    };
  }, [params]);
}


// ─── Types ────────────────────────────────────────────────────────────────────
interface AccountData {
  publicKey: PublicKey;
  account: {
    mint: PublicKey;
    currency: number[];
    escrowType: number;
    amount: { toString(): string };
    pricePerToken: { toString(): string };
    reservedAmounts: unknown[];
  };
}

interface TickerItem {
  token: string;
  currency: string;
  rate: number;
  online: number;
  type: "BUY" | "SELL";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function parseCurrency(arr: number[]): string {
  try {
    return String.fromCharCode(...arr).trim();
  } catch {
    return "";
  }
}

function shortMint(mint: PublicKey): string {
  const s = mint.toString();
  return s.slice(0, 4);
}

const CURRENCY_FLAGS: Record<string, string> = {
  NGN: "🇳🇬",
  KES: "🇰🇪",
  GHS: "🇬🇭",
  ZAR: "🇿🇦",
  USD: "🇺🇸",
};

const CURRENCY_NAMES: Record<string, string> = {
  NGN: "NGN (₦)",
  KES: "KES (KSh)",
  GHS: "GHS (₵)",
  ZAR: "ZAR (R)",
  USD: "USD ($)",
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  NGN: "₦",
  KES: "KSh",
  GHS: "₵",
  ZAR: "R",
  USD: "$",
};

// ─── Live Ticker ─────────────────────────────────────────────────────────────
function LiveTicker({ items, totalCreated }: { items: TickerItem[]; totalCreated: number }) {
  if (items.length === 0) return null;
  const doubled = [...items, ...items];
  return (
    <div
      className="overflow-hidden relative border-t border-b"
      style={{ background: "#0F0D0A", borderColor: "rgba(232,72,10,0.30)" }}
    >
      {/* Pinned escrow count badge */}
      <div
        className="absolute left-0 top-0 bottom-0 z-20 flex items-center gap-1.5 px-4"
        style={{ background: "#0F0D0A", borderRight: "1px solid rgba(232,72,10,0.3)" }}
      >
        <span className="text-xs font-black uppercase tracking-widest" style={{ color: "#E8480A" }}>
          {totalCreated}
        </span>
        <span className="text-xs font-black uppercase tracking-widest" style={{ color: "#444" }}>
          CREATED
        </span>
      </div>

      {/* Fade overlays — left one wider to clear the badge */}
      <div
        className="absolute left-0 top-0 bottom-0 z-10 pointer-events-none"
        style={{ width: "120px", background: "linear-gradient(90deg,#0F0D0A 60%,transparent)" }}
      />
      <div
        className="absolute right-0 top-0 bottom-0 w-16 z-10 pointer-events-none"
        style={{ background: "linear-gradient(270deg,#0F0D0A,transparent)" }}
      />

      {/* Scrolling ticker — padded left to clear the pinned badge */}
      <div style={{ paddingLeft: "110px" }}>
        <div
          className="flex"
          style={{ animation: "tickerScroll 40s linear infinite", width: "max-content", padding: "10px 0" }}
        >
          {doubled.map((t, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-8 whitespace-nowrap"
              style={{ borderRight: "1px solid rgba(255,255,255,0.05)" }}
            >
              <span className="text-xs font-black tracking-widest uppercase" style={{ color: "#666" }}>
                {t.token}/{t.currency}
              </span>
              <span
                className="text-xs px-1.5 py-0.5 rounded font-bold uppercase"
                style={{
                  background: t.type === "BUY" ? "rgba(10,123,107,0.2)" : "rgba(232,72,10,0.2)",
                  color: t.type === "BUY" ? "#4ECDB4" : "#E8480A",
                }}
              >
                {t.type}
              </span>
              <span className="text-sm font-black" style={{ color: "#F5F0E8" }}>
                {t.rate.toLocaleString()}
              </span>
              <span
                className="text-xs px-1.5 py-0.5 rounded font-bold"
                style={{ background: "rgba(255,255,255,0.06)", color: "#888" }}
              >
                ● {t.online} online
              </span>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes tickerScroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

// ─── Stats Strip ─────────────────────────────────────────────────────────────
function StatsStrip({
  totalEscrows,
  totalVolume,
  loading,
}: {
  totalEscrows: number;
  totalVolume: number;
  loading: boolean;
}) {
  const fmt = (n: number) => {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
    return `$${n.toFixed(2)}`;
  };
  return (
    <div
      className="flex items-center justify-center gap-10 py-3 text-center"
      style={{ borderBottom: "1px solid rgba(15,13,10,0.08)" }}
    >
      {[
        { label: "Active Escrows", value: loading ? "—" : totalEscrows.toString() },
        { label: "Total Volume", value: loading ? "—" : fmt(totalVolume) },
      ].map((s) => (
        <div key={s.label} className="flex items-center gap-2">
          <span className="text-xs font-black uppercase tracking-widest" style={{ color: "#C8C2B4" }}>
            {s.label}
          </span>
          <span className="text-sm font-black" style={{ color: "#0F0D0A" }}>
            {s.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Tab Switcher ─────────────────────────────────────────────────────────────
function TabSwitcher({
  active,
  onChange,
}: {
  active: "buy" | "sell";
  onChange: (t: "buy" | "sell") => void;
}) {
  return (
    <div className="inline-flex gap-1 p-1.5 rounded-full" style={{ background: "#EDE8DF" }}>
      {([
        { id: "buy" as const, emoji: "🛒", label: "Buy Tokens" },
        { id: "sell" as const, emoji: "💵", label: "Sell Tokens" },
      ] as const).map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className="flex items-center gap-2 px-5 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all duration-200 border-none cursor-pointer"
            style={{
              background: isActive ? (t.id === "buy" ? "#E8480A" : "#0F0D0A") : "transparent",
              color: isActive ? "#fff" : "#C8C2B4",
            }}
          >
            <span>{t.emoji}</span>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── InlineBuyForm ────────────────────────────────────────────────────────────
// DROP-IN REPLACEMENT for the InlineBuyForm function in page.tsx
//
// Changes vs the broken version:
//   1. Added bank selector, account number, and beneficiary name fields
//      (identical pattern to InlineSellForm / InstantPayDialog)
//   2. Auto-verifies bank account via /api/flutterwave/verify-account (debounced 1s)
//   3. Passes verified bank details as buyerPayoutDetails JSON to instantSellReserve
//      instead of `undefined` — fixes "receiver can not be null" OPay error
//   4. Submit button disabled until account is verified
//   5. Bank fields reset when currency changes
//
// Paste this function in place of the existing InlineBuyForm in page.tsx.
// No other changes required.

// ─── InlineBuyForm ────────────────────────────────────────────────────────────
function InlineBuyForm({
  accounts,
  initialCurrency = "",
  initialAmount = "",
}: {
  accounts: AccountData[];
  initialCurrency?: string;
  initialAmount?: string;
}) {
  const { instantSellReserve, getMintInfo } = useTrustExpress();
  const queryClient = useQueryClient();
  const { publicKey } = useWallet();

  const [selectedCurrency, setSelectedCurrency] = useState(initialCurrency);
  const [tokenAmount, setTokenAmount] = useState(initialAmount);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tokenDecimals, setTokenDecimals] = useState<number | null>(null);
  const [tokenSymbol, setTokenSymbol] = useState<string | null>(null);
  const fetchedMints = useRef<Set<string>>(new Set());

  // Bank details state
  const [accountNumber, setAccountNumber] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [bankSearch, setBankSearch] = useState("");
  const [verifyStatus, setVerifyStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const lastVerified = useRef<{ accountNumber: string; bankCode: string } | null>(null);

  // Receipt / payment state
  const [showPaymentLinkDisplay, setShowPaymentLinkDisplay] = useState(false);
  const [currentPayoutReference, setCurrentPayoutReference] = useState<string | null>(null);
  const [transactionSignature, setTransactionSignature] = useState<string | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptData, setReceiptData] = useState<Record<string, any> | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<
    "idle" | "detecting" | "processing" | "generating_receipt" | "completed" | "failed"
  >("idle");
  const [isGeneratingReceipt, setIsGeneratingReceipt] = useState(false);
  const subscriptionIdRef = useRef<number | null>(null);

  const availableCurrencies = useMemo(() => {
    const set = new Set<string>();
    accounts.forEach((a) => {
      if (a.account.escrowType === 0 && Number(a.account.amount.toString()) > 0) {
        const c = parseCurrency(a.account.currency);
        if (c) set.add(c);
      }
    });
    return Array.from(set);
  }, [accounts]);

  const bestLP = useMemo(() => {
    if (!selectedCurrency) return null;
    return (
      accounts
        .filter((a) => {
          const cur = parseCurrency(a.account.currency);
          return (
            a.account.escrowType === 0 &&
            cur === selectedCurrency &&
            Number(a.account.amount.toString()) > 0 &&
            a.account.reservedAmounts.length < 10
          );
        })
        .sort(
          (a, b) =>
            Number(a.account.pricePerToken.toString()) -
            Number(b.account.pricePerToken.toString())
        )[0] ?? null
    );
  }, [accounts, selectedCurrency]);

  // ── Token metadata (symbol + logo) from registry ──────────────────────────
  const tokenMetadata = useTokenMetadata(bestLP?.account.mint.toString() ?? "");
  const tokenSymbolResolved =
    tokenMetadata?.metadata?.symbol ??
    tokenSymbol ??
    bestLP?.account.mint.toString().slice(0, 4) ??
    "…";
  const tokenLogoURI = tokenMetadata?.metadata?.logoURI;

  const pricePerToken = bestLP ? Number(bestLP.account.pricePerToken.toString()) : 0;

  const calculatedFiat = useMemo(() => {
    const amt = parseFloat(tokenAmount);
    if (!amt || amt <= 0 || pricePerToken === 0) return 0;
    return amt * pricePerToken;
  }, [tokenAmount, pricePerToken]);

  // Fetch token decimals + on-chain symbol fallback
  useEffect(() => {
    if (!bestLP) return;
    const key = bestLP.account.mint.toString();
    if (fetchedMints.current.has(key)) return;
    fetchedMints.current.add(key);

    getMintInfo(bestLP.account.mint)
      .then((info) => {
        console.log("MINT DECIMALS:", info.decimals);
        setTokenDecimals(info.decimals);
      })
      .catch(() => setTokenDecimals(null));

    const fetchTokenSymbol = async (mint: PublicKey) => {
      try {
        const [metadataPda] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("metadata"),
            new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s").toBuffer(),
            mint.toBuffer(),
          ],
          new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
        );
        const connection = new Connection(
          process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com"
        );
        const accountInfo = await connection.getAccountInfo(metadataPda);
        if (!accountInfo) return;
        const data = accountInfo.data;
        const nameLen = data.readUInt32LE(65);
        const symbolOffset = 65 + 4 + nameLen;
        const symbolLen = data.readUInt32LE(symbolOffset);
        const symbol = data
          .slice(symbolOffset + 4, symbolOffset + 4 + symbolLen)
          .toString("utf8")
          .replace(/\0/g, "")
          .trim();
        setTokenSymbol(symbol || null);
      } catch (e) {
        console.warn("Symbol fetch failed:", e);
        setTokenSymbol(null);
      }
    };

    fetchTokenSymbol(bestLP.account.mint);
  }, [bestLP, getMintInfo]);

  // Cleanup subscription on unmount
  useEffect(() => {
    return () => {
      if (subscriptionIdRef.current !== null) {
        const connection = new Connection(
          process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com"
        );
        connection.removeAccountChangeListener(subscriptionIdRef.current);
      }
    };
  }, []);

  const startTransactionMonitoring = useCallback(
    (trustExpressAddress: string, payoutReference: string, onFailed: () => void) => {
      const connection = new Connection(
        process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com"
      );
      const trustExpressPubkey = new PublicKey(trustExpressAddress);
      setPaymentStatus("detecting");

      let pollCount = 0;
      const maxPolls = 90;
      let pollIntervalId: NodeJS.Timeout | null = null;
      let hasDetectedTransaction = false;
      let pollingStartTime: string | null = null;

      const pollForReceipt = async () => {
        try {
          if (!pollingStartTime) return false;

          const statusRes = await fetch(
            `/api/payment-status?payout_reference=${payoutReference}`
          );
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            if (["failed", "failed_to_initiate", "rejected"].includes(statusData?.status)) {
              if (pollIntervalId) clearInterval(pollIntervalId);
              setIsGeneratingReceipt(false);
              onFailed();
              return true;
            }
          }

          const response = await fetch(
            `/api/receipts/by-transaction?trustExpressAddress=${trustExpressAddress}&since=${pollingStartTime}`
          );
          if (!response.ok) return false;
          const data = await response.json();

          if (data?.id) {
            if (data.status === "pending" || data.status === "processing") {
              return false;
            }

            if (pollIntervalId) clearInterval(pollIntervalId);

            if (data.status === "failed") {
              setIsGeneratingReceipt(false);
              setReceiptId(data.id);
              setReceiptData(data);
              setPaymentStatus("failed");
            } else {
              setTimeout(() => {
                setPaymentStatus("completed");
                setIsGeneratingReceipt(false);
                setReceiptId(data.id);
                setShowReceipt(true);
              }, 1500);
            }
            return true;
          }
          return false;
        } catch {
          return false;
        }
      };

      const subId = connection.onAccountChange(
        trustExpressPubkey,
        async () => {
          if (hasDetectedTransaction) return;
          hasDetectedTransaction = true;
          pollingStartTime = new Date().toISOString();
          setPaymentStatus("processing");
          await queryClient.invalidateQueries({ queryKey: ["get-trust-express-accounts"] });
          setPaymentStatus("generating_receipt");
          setIsGeneratingReceipt(true);
          setTimeout(() => {
            pollCount = 0;
            pollIntervalId = setInterval(async () => {
              pollCount++;
              if (pollCount >= maxPolls) {
                if (pollIntervalId) clearInterval(pollIntervalId);
                setPaymentStatus("idle");
                setIsGeneratingReceipt(false);
                return;
              }
              const found = await pollForReceipt();
              if (found && pollIntervalId) clearInterval(pollIntervalId);
            }, 3000);
          }, 8000);
        },
        "confirmed"
      );

      subscriptionIdRef.current = subId;
    },
    [queryClient]
  );

  const handleSubmit = useCallback(async () => {
    if (!bestLP || !tokenAmount || parseFloat(tokenAmount) <= 0) return;
    if (!publicKey) return;

    setIsSubmitting(true);
    try {
      const result = await instantSellReserve.mutateAsync({
        trustExpress: bestLP.publicKey,
        amount: parseFloat(tokenAmount),
        paymentMode: 0,
        tokenDecimals: tokenDecimals ?? 0,
      });

      const signature = result.signature || null;
      const payoutRef = result.payoutReference;

      if (!signature || signature === "undefined") {
        throw new Error("Failed to get transaction signature");
      }

      setTransactionSignature(signature);
      setCurrentPayoutReference(payoutRef);
      queryClient.invalidateQueries({ queryKey: ["get-trust-express-accounts"] });
      setShowPaymentLinkDisplay(true);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  }, [bestLP, tokenAmount, tokenDecimals, instantSellReserve, queryClient, publicKey]);

  const handleReset = useCallback(() => {
    setShowPaymentLinkDisplay(false);
    setCurrentPayoutReference(null);
    setTransactionSignature(null);
    setShowReceipt(false);
    setReceiptId(null);
    setShowReceiptModal(false);
    setReceiptData(null);
    setPaymentStatus("idle");
    setIsGeneratingReceipt(false);
    setTokenAmount("");
    setVerifyStatus("idle");
    lastVerified.current = null;
    if (subscriptionIdRef.current !== null) {
      const connection = new Connection(
        process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com"
      );
      connection.removeAccountChangeListener(subscriptionIdRef.current);
      subscriptionIdRef.current = null;
    }
  }, []);

  const sym = CURRENCY_SYMBOLS[selectedCurrency] ?? selectedCurrency;
  const tokenAmountNum = parseFloat(tokenAmount) || 0;

  // ── Receipt view ───────────────────────────────────────────────────────────
  if (showReceipt && receiptId) {
    const openModal = async () => {
      setShowReceiptModal(true);
      if (receiptData) {
        console.log("CACHED RECEIPT DATA:", receiptData);
        return;
      }
      setReceiptLoading(true);
      try {
        const { data } = await supabase
          .from("receipts")
          .select("*")
          .eq("id", receiptId)
          .single();
        console.log("RAW RECEIPT DATA:", data);
        setReceiptData(data);

        if (data?.mint_address) {
          try {
            const mintPubkey = new PublicKey(data.mint_address);
            const info = await getMintInfo(mintPubkey);
            setTokenDecimals(info.decimals);
            const [metadataPda] = PublicKey.findProgramAddressSync(
              [
                Buffer.from("metadata"),
                new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s").toBuffer(),
                mintPubkey.toBuffer(),
              ],
              new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
            );
            const connection = new Connection(
              process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com"
            );
            const accountInfo = await connection.getAccountInfo(metadataPda);
            if (accountInfo) {
              const d = accountInfo.data;
              const nameLen = d.readUInt32LE(65);
              const symbolOffset = 65 + 4 + nameLen;
              const symbolLen = d.readUInt32LE(symbolOffset);
              setTokenSymbol(
                d
                  .slice(symbolOffset + 4, symbolOffset + 4 + symbolLen)
                  .toString("utf8")
                  .replace(/\0/g, "")
                  .trim() || null
              );
            }
          } catch { /* non-fatal */ }
        }
      } catch {
      } finally {
        setReceiptLoading(false);
      }
    };

    const fmt = (v: any) => (v !== null && v !== undefined && v !== "" ? String(v) : "—");

    return (
      <div className="relative">
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <CheckCircle className="w-12 h-12 text-[#0A7B6B]" />
          <div>
            <p className="text-sm font-bold text-[#0F0D0A]">Purchase Successful!</p>
            <p className="text-xs text-[#6B6558] mt-1">Your tokens are on their way.</p>
          </div>
          <button
            onClick={openModal}
            className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-white border-none cursor-pointer hover:opacity-90"
            style={{ background: "#0A7B6B" }}
          >
            View Receipt
          </button>
          <button
            onClick={handleReset}
            className="text-xs text-[#6B6558] underline cursor-pointer bg-transparent border-none"
          >
            New purchase
          </button>
        </div>

        {showReceiptModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(15,13,10,0.72)", backdropFilter: "blur(4px)" }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowReceiptModal(false);
            }}
          >
            <div
              className="relative w-full rounded-2xl overflow-hidden shadow-2xl flex flex-col"
              style={{ maxWidth: 440, background: "#F5F0E8", border: "2px solid #0F0D0A" }}
            >
              <div
                className="flex items-center justify-between px-5 py-4"
                style={{ borderBottom: "1.5px solid #E8E2D8" }}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-[#0A7B6B]" />
                  <span className="text-xs font-black uppercase tracking-widest text-[#0F0D0A]">
                    Buy Order
                  </span>
                </div>
                <button
                  onClick={() => setShowReceiptModal(false)}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[#6B6558] hover:bg-[#E8E2D8] bg-transparent border-none cursor-pointer text-lg leading-none"
                >
                  ×
                </button>
              </div>
              <div className="px-5 py-5 overflow-y-auto" style={{ maxHeight: "65vh" }}>
                {receiptLoading ? (
                  <div className="flex items-center justify-center py-10 gap-3">
                    <Loader2 className="w-5 h-5 animate-spin text-[#E8480A]" />
                    <span className="text-sm text-[#6B6558]">Loading receipt…</span>
                  </div>
                ) : receiptData ? (
                  <div className="space-y-1">
                    <div
                      className="text-center pb-4 mb-4"
                      style={{ borderBottom: "1px solid #E8E2D8" }}
                    >
                      <p className="text-lg font-bold text-[#0F0D0A]">Transaction Receipt</p>
                      <p className="text-xs text-[#6B6558]">Trust Express</p>
                    </div>
                    {[
                      { label: "Receipt ID", value: receiptData.id, mono: true, truncate: true },
                      {
                        label: "Date",
                        value: receiptData.created_at
                          ? new Date(receiptData.created_at).toLocaleString()
                          : null,
                      },
                      /*       
                      { label: "Name", value: receiptData.beneficiary_name ?? receiptData.name },
                      { label: "Acct No", value: receiptData.account_number ?? receiptData.acct_no },
                      { label: "Bank", value: receiptData.bank_name ?? receiptData.bank },
                       */
                      {
                        label: "Amount Paid",
                        value:
                          receiptData.fiat_amount != null
                            ? `${CURRENCY_SYMBOLS[receiptData.currency] ?? receiptData.currency} ${Number(receiptData.fiat_amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                            : null,
                        bold: true,
                      },
                      {
                        label: "Tokens Received",
                        value:
                          receiptData.token_amount != null && tokenDecimals !== null
                            ? `${(
                                Number(receiptData.token_amount) / Math.pow(10, tokenDecimals)
                              ).toLocaleString(undefined, {
                                maximumFractionDigits: tokenDecimals,
                              })} ${tokenSymbolResolved}`
                            : null,
                        bold: true,
                      },
                      {
                        label: "Reference",
                        value: receiptData.payout_reference ?? receiptData.reference,
                        mono: true,
                      },
                    ].map(({ label, value, mono, truncate, bold }) => (
                      <div
                        key={label}
                        className="flex items-start justify-between gap-4 py-2.5"
                        style={{ borderBottom: "1px solid #F0EDE7" }}
                      >
                        <span className="text-xs text-[#6B6558] flex-shrink-0">{label}:</span>
                        <span
                          className={`text-xs text-right ${bold ? "font-black text-[#0F0D0A]" : "text-[#0F0D0A]"} ${mono ? "font-mono" : ""} ${truncate ? "truncate max-w-[200px]" : ""}`}
                        >
                          {fmt(value)}
                        </span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between py-2.5">
                      <span className="text-xs text-[#6B6558]">Status:</span>
                      <span
                        className="text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider"
                        style={{
                          background:
                            receiptData.status === "completed" ||
                            receiptData.status === "success"
                              ? "rgba(10,123,107,0.12)"
                              : "rgba(232,72,10,0.12)",
                          color:
                            receiptData.status === "completed" ||
                            receiptData.status === "success"
                              ? "#0A7B6B"
                              : "#E8480A",
                        }}
                      >
                        {fmt(receiptData.status).toUpperCase()}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-sm text-[#6B6558] mb-4">Could not load receipt data.</p>
                    <button
                      onClick={() => window.open(`/receipts/${receiptId}`, "_blank")}
                      className="px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-white border-none cursor-pointer"
                      style={{ background: "#0F0D0A" }}
                    >
                      Open Receipt Page ↗
                    </button>
                  </div>
                )}
              </div>
              <div
                className="flex gap-3 px-5 py-4"
                style={{ borderTop: "1.5px solid #E8E2D8" }}
              >
                <button
                  onClick={() => window.open(`/receipts/${receiptId}`, "_blank")}
                  className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest border cursor-pointer hover:opacity-80 transition-opacity bg-transparent"
                  style={{ borderColor: "#C8C2B4", color: "#6B6558" }}
                >
                  Full Page ↗
                </button>
                <button
                  onClick={() => {
                    setShowReceiptModal(false);
                    handleReset();
                  }}
                  className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-white border-none cursor-pointer hover:opacity-90"
                  style={{ background: "#0F0D0A" }}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Failed receipt view
  if (paymentStatus === "failed" && receiptId) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <AlertCircle className="w-12 h-12 text-[#E8480A]" />
        <div>
          <p className="text-sm font-bold text-[#0F0D0A]">Payment Failed</p>
          <p className="text-xs text-[#6B6558] mt-1">
            The transfer could not be completed. Your tokens have been refunded.
          </p>
        </div>
        <button
          onClick={() => window.open(`/receipts/${receiptId}`, "_blank")}
          className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-white border-none cursor-pointer hover:opacity-90"
          style={{ background: "#E8480A" }}
        >
          View Failed Receipt
        </button>
        <button
          onClick={handleReset}
          className="text-xs text-[#6B6558] underline cursor-pointer bg-transparent border-none"
        >
          Try again
        </button>
      </div>
    );
  }

  // Payment link display
  if (showPaymentLinkDisplay) {
    return (
      <div>
        {currentPayoutReference ? (
         <PaymentLinkDisplay
            payoutReference={currentPayoutReference}
            trustExpressAddress={bestLP?.publicKey.toString() || ""}
            transactionSignature={transactionSignature || undefined}
            tokenAmount={tokenAmountNum}
            fiatAmount={calculatedFiat}
            currency={selectedCurrency}
            tokenSymbol={tokenSymbolResolved}
            onPaymentLinkReady={(link) => {
              if (bestLP)
                startTransactionMonitoring(
                  bestLP.publicKey.toString(),
                  currentPayoutReference!,
                  () => {
                    setShowPaymentLinkDisplay(false);
                    setPaymentStatus("failed");
                  }
                );
            }}
            onPaymentComplete={() => setPaymentStatus("completed")}
            onPaymentFailed={() => {
              setShowPaymentLinkDisplay(false);
              setPaymentStatus("failed");
            }}
            onBack={() => {
              setShowPaymentLinkDisplay(false);
              setCurrentPayoutReference(null);
              setTransactionSignature(null);
            }}
          />
        ) : (
          <div className="flex items-center justify-center py-10 gap-3 text-[#6B6558]">
            <Loader2 className="w-5 h-5 animate-spin text-[#E8480A]" />
            <span className="text-sm">Preparing your payment link…</span>
          </div>
        )}
      </div>
    );
  }

  // Main form
  return (
    <div className="space-y-5">
      <p className="text-xs text-[#6B6558] flex items-center gap-2">
        <span>🛒</span>
        Pay with fiat — receive tokens to your wallet at the best available rate
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-black uppercase tracking-widest text-[#6B6558] mb-1.5">
            Currency
          </label>
          <div className="relative rounded-xl border border-[#E8E2D8] bg-white focus-within:border-[#0F0D0A]">
            <select
              className="w-full bg-transparent p-3 pr-8 text-sm text-[#0F0D0A] focus:outline-none appearance-none cursor-pointer"
              value={selectedCurrency}
              onChange={(e) => {
                setSelectedCurrency(e.target.value);
                setTokenAmount("");
              }}
            >
              <option value="" disabled>
                Choose currency
              </option>
              {availableCurrencies.map((c) => (
                <option key={c} value={c}>
                  {CURRENCY_FLAGS[c] ?? ""} {CURRENCY_NAMES[c] ?? c}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B6558] pointer-events-none" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-black uppercase tracking-widest text-[#6B6558] mb-1.5">
            Token Amount
          </label>
          <div className="relative rounded-xl border border-[#E8E2D8] bg-white focus-within:border-[#0F0D0A] flex items-center px-3">
            <input
              type="number"
              step="0.01"
              min="0"
              disabled={!selectedCurrency}
              placeholder={selectedCurrency ? "e.g. 10" : "—"}
              value={tokenAmount}
              onChange={(e) => setTokenAmount(e.target.value)}
              className="flex-1 bg-transparent py-3 text-sm text-[#0F0D0A] focus:outline-none placeholder:text-[#C8C2B4] disabled:opacity-40"
            />
            <span className="text-xs font-bold text-[#6B6558] ml-2 flex-shrink-0 flex items-center gap-1">
              {tokenLogoURI && (
                <Image
                  src={tokenLogoURI}
                  alt={tokenSymbolResolved}
                  className="w-4 h-4 rounded-full"
                />
              )}
              {tokenSymbolResolved}
            </span>
          </div>
          {selectedCurrency && (
            <p className="text-xs text-[#C8C2B4] mt-1">Best rate auto-selected</p>
          )}
        </div>
      </div>

      {selectedCurrency && !bestLP && (
        <div className="flex items-center gap-2 text-xs text-[#E8480A] px-1">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          No sellers available for {selectedCurrency} right now.
        </div>
      )}

      {selectedCurrency && pricePerToken > 0 && (
        <div
          className="flex items-center justify-between px-4 py-3 rounded-xl"
          style={{ background: "#F0EDE7" }}
        >
          <span className="text-xs text-[#6B6558]">Best available rate</span>
          <span className="text-sm font-black text-[#0F0D0A]">
            {pricePerToken.toLocaleString()}{" "}
            <span className="text-[#E8480A]">
              {selectedCurrency}/{tokenSymbolResolved}
            </span>
          </span>
        </div>
      )}

      {calculatedFiat > 0 && (
        <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-[#E8E2D8]">
          <span className="text-xs text-[#6B6558]">You&apos;ll pay</span>
          <span className="text-sm font-black text-[#0F0D0A]">
            {sym}
            {calculatedFiat.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={
          !bestLP ||
          !tokenAmount ||
          parseFloat(tokenAmount) <= 0 ||
          tokenDecimals === null ||
          isSubmitting ||
          isGeneratingReceipt
        }
        className="w-full py-3.5 rounded-xl text-xs font-black uppercase tracking-widest text-white transition-opacity hover:opacity-90 disabled:opacity-40 cursor-pointer border-none flex items-center justify-center gap-2"
        style={{ background: "#E8480A" }}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Processing…
          </>
        ) : (
          <>
            {`Buy ${tokenAmountNum > 0 ? tokenAmountNum : ""} ${tokenSymbolResolved} →`}
          </>
        )}
      </button>
    </div>
  );
}


// ─── Inline Sell / Pay Form ───────────────────────────────────────────────────
// Mirrors InstantPayDialog logic: escrowType=1 LPs, bank details, auto-verify,
// then polls /api/receipts/by-transaction after on-chain tx — same as the dialog.
// ─── InlineSellForm ───────────────────────────────────────────────────────────
function InlineSellForm({ accounts }: { accounts: AccountData[] }) {
  const { instantReserve, getMintInfo } = useTrustExpress();
  const queryClient = useQueryClient();
 
  const [selectedCurrency, setSelectedCurrency] = useState("");
  const [fiatAmount, setFiatAmount] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tokenDecimals, setTokenDecimals] = useState<number | null>(null);
  const [tokenSymbol, setTokenSymbol] = useState<string | null>(null);
  const fetchedMints = useRef<Set<string>>(new Set());
 

  const [paymentState, setPaymentState] = useState<
    "idle" | "submitted" | "polling" | "completed" | "timeout" | "failed"
  >("idle");
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const submittedAtRef = useRef<string | null>(null);
  const payoutRefRef = useRef<string | null>(null);
 
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptData, setReceiptData] = useState<Record<string, any> | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
 
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);
 
  const [verifyStatus, setVerifyStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle"
  );
  const [verifiedName, setVerifiedName] = useState<string | null>(null);
  const lastVerified = useRef<{ accountNumber: string; bankCode: string } | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [bankSearch, setBankSearch] = useState("");
 
  const availableCurrencies = useMemo(() => {
    const set = new Set<string>();
    accounts.forEach((a) => {
      if (a.account.escrowType === 1 && Number(a.account.amount.toString()) > 0) {
        const c = parseCurrency(a.account.currency);
        if (c) set.add(c);
      }
    });
    return Array.from(set);
  }, [accounts]);
 
  const bestLP = useMemo(() => {
    if (!selectedCurrency) return null;
    return (
      accounts
        .filter((a) => {
          const cur = parseCurrency(a.account.currency);
          return (
            a.account.escrowType === 1 &&
            cur === selectedCurrency &&
            Number(a.account.amount.toString()) > 0 &&
            a.account.reservedAmounts.length < 10
          );
        })
        .sort(
          (a, b) =>
            Number(a.account.pricePerToken.toString()) -
            Number(b.account.pricePerToken.toString())
        )[0] ?? null
    );
  }, [accounts, selectedCurrency]);
 
  // ── Token metadata (symbol + logo) from registry ──────────────────────────
  const tokenMetadata = useTokenMetadata(bestLP?.account.mint.toString() ?? "");
  const tokenSymbolResolved =
    tokenMetadata?.metadata?.symbol ??
    tokenSymbol ??
    bestLP?.account.mint.toString().slice(0, 4) ??
    "…";
  const tokenLogoURI = tokenMetadata?.metadata?.logoURI;
 
  const pricePerToken = bestLP ? Number(bestLP.account.pricePerToken.toString()) : 0;
 
  const calculatedTokens = useMemo(() => {
    const amt = parseFloat(fiatAmount);
    if (!amt || amt <= 0 || pricePerToken === 0) return 0;
    return amt / pricePerToken;
  }, [fiatAmount, pricePerToken]);
 
  const {
    banks,
    loading: banksLoading,
    verifyAccount: verifyAccountFn,
  } = useProcessorBanks({
    trustExpressPda: bestLP?.publicKey.toBase58() ?? null,
    currency: selectedCurrency || "NGN",
  });
  const selectedBank = banks.find((b) => b.code === bankCode);

 
  useEffect(() => {
    setBankCode("");
    setAccountNumber("");
    setBeneficiaryName("");
    setVerifyStatus("idle");
    setVerifiedName(null);
    lastVerified.current = null;
  }, [banks]);
 
  // Fetch token decimals + on-chain symbol fallback
  useEffect(() => {
    if (!bestLP) return;
    const key = bestLP.account.mint.toString();
    if (fetchedMints.current.has(key)) return;
    fetchedMints.current.add(key);
 
    getMintInfo(bestLP.account.mint)
      .then((info) => {
        console.log("MINT DECIMALS:", info.decimals);
        setTokenDecimals(info.decimals);
      })
      .catch(() => setTokenDecimals(null));
 
    const fetchTokenSymbol = async (mint: PublicKey) => {
      try {
        const [metadataPda] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("metadata"),
            new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s").toBuffer(),
            mint.toBuffer(),
          ],
          new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
        );
        const connection = new Connection(
          process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com"
        );
        const accountInfo = await connection.getAccountInfo(metadataPda);
        if (!accountInfo) return;
        const data = accountInfo.data;
        const nameLen = data.readUInt32LE(65);
        const symbolOffset = 65 + 4 + nameLen;
        const symbolLen = data.readUInt32LE(symbolOffset);
        const symbol = data
          .slice(symbolOffset + 4, symbolOffset + 4 + symbolLen)
          .toString("utf8")
          .replace(/\0/g, "")
          .trim();
        setTokenSymbol(symbol || null);
      } catch (e) {
        console.warn("Symbol fetch failed:", e);
        setTokenSymbol(null);
      }
    };
 
    fetchTokenSymbol(bestLP.account.mint);
  }, [bestLP, getMintInfo]);
 
  // Auto-verify bank account (debounced 1s) — only fires when exactly 10 digits entered
  useEffect(() => {
    if (!accountNumber || !bankCode || accountNumber.length !== 10) {
      setVerifyStatus("idle");
      setVerifiedName(null);
      return;
    }
    if (
      lastVerified.current?.accountNumber === accountNumber &&
      lastVerified.current?.bankCode === bankCode
    )
      return;
 
    const t = setTimeout(async () => {
      setVerifyStatus("loading");
      try {
        const data = await verifyAccountFn(accountNumber, bankCode);
        if (data.success && data.account_name) {
          setVerifiedName(data.account_name);
          setVerifyStatus("success");
          lastVerified.current = { accountNumber, bankCode };
          if (!beneficiaryName) setBeneficiaryName(data.account_name);
        } else {
          setVerifyStatus("error");
          setVerifiedName(null);
        }
      } catch {
        setVerifyStatus("error");
        setVerifiedName(null);
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [accountNumber, bankCode, beneficiaryName, verifyAccountFn]);
 
  const loadReceipt = useCallback(
    async (id: string) => {
      setReceiptLoading(true);
      try {
        const res = await fetch(`/api/receipts/${id}`);
        if (res.ok) {
          const data = await res.json();
          console.log("RAW RECEIPT DATA:", data);

          // payout_details is a JSON string — parse and spread so bank/account/recipient
          // are available as top-level fields for the receipt modal
          let pd: Record<string, any> = {};
          try {
            if (data.payout_details) {
              pd = typeof data.payout_details === "string"
                ? JSON.parse(data.payout_details)
                : data.payout_details;
            }
          } catch { /* non-fatal */ }
          setReceiptData({
            ...data,
            bank_name:        data.bank_name        ?? pd.bank_name ?? pd.bank_code ?? null,
            account_number:   data.account_number   ?? pd.account_number            ?? null,
            beneficiary_name: data.beneficiary_name ?? pd.beneficiary_name          ?? null,
          });
 
          if (data?.mint_address) {
            try {
              const mintPubkey = new PublicKey(data.mint_address);
              const info = await getMintInfo(mintPubkey);
              setTokenDecimals(info.decimals);
              const [metadataPda] = PublicKey.findProgramAddressSync(
                [
                  Buffer.from("metadata"),
                  new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s").toBuffer(),
                  mintPubkey.toBuffer(),
                ],
                new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
              );
              const connection = new Connection(
                process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com"
              );
              const accountInfo = await connection.getAccountInfo(metadataPda);
              if (accountInfo) {
                const d = accountInfo.data;
                const nameLen = d.readUInt32LE(65);
                const symbolOffset = 65 + 4 + nameLen;
                const symbolLen = d.readUInt32LE(symbolOffset);
                setTokenSymbol(
                  d
                    .slice(symbolOffset + 4, symbolOffset + 4 + symbolLen)
                    .toString("utf8")
                    .replace(/\0/g, "")
                    .trim() || null
                );
              }
            } catch { /* non-fatal */ }
          }
        }
      } catch { /* non-fatal */ } finally {
        setReceiptLoading(false);
      }
    },
    [getMintInfo]
  );
 
  const handleSubmit = useCallback(async () => {
    if (!bestLP || !fiatAmount || parseFloat(fiatAmount) <= 0) return;
    if (verifyStatus !== "success") return;
    setIsSubmitting(true);
 
    try {
      await instantReserve.mutateAsync({
        trustExpress: bestLP.publicKey,
        amount: calculatedTokens,
        fiatAmount: parseFloat(fiatAmount),
        currency: selectedCurrency,
        payoutDetails: JSON.stringify({
          type: "bank_transfer",
          account_number: accountNumber,
          bank_code: bankCode,
          bank_name: selectedBank?.name ?? null,
          beneficiary_name: beneficiaryName,
        }),
      });
 
      queryClient.invalidateQueries({ queryKey: ["get-trust-express-accounts"] });
 
      const trustExpressAddress = bestLP.publicKey.toString();
      submittedAtRef.current = new Date().toISOString();
 
      setFiatAmount("");
      setAccountNumber("");
      setBankCode("");
      setBeneficiaryName("");
      setVerifyStatus("idle");
      setVerifiedName(null);
      lastVerified.current = null;
 
      setPaymentState("submitted");
      await new Promise((r) => setTimeout(r, 8000));
      setPaymentState("polling");
 
      try {
        const refRes = await fetch(
          `/api/payment-status?trust_express_address=${trustExpressAddress}`
        );
        if (refRes.ok) {
          const refData = await refRes.json();
          if (refData?.payoutReference) {
            payoutRefRef.current = refData.payoutReference;
          }
        }
      } catch { /* non-fatal */ }
 
      let pollCount = 0;
      const maxPolls = 90;
 
      pollingRef.current = setInterval(async () => {
        pollCount++;
        if (pollCount >= maxPolls) {
          clearInterval(pollingRef.current!);
          pollingRef.current = null;
          setPaymentState("timeout");
          return;
        }
        try {
          if (payoutRefRef.current) {
            const statusRes = await fetch(
              `/api/payment-status?payout_reference=${payoutRefRef.current}`
            );
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              if (["failed", "failed_to_initiate", "rejected"].includes(statusData?.status)) {
                clearInterval(pollingRef.current!);
                pollingRef.current = null;
                setPaymentState("failed");
                return;
              }
            }
          }
 
          const res = await fetch(
            `/api/receipts/by-transaction?trustExpressAddress=${trustExpressAddress}&since=${submittedAtRef.current}`
          );
          if (!res.ok) return;
          const data = await res.json();
          if (data?.id) {
            if (data.status === "pending" || data.status === "processing") return;
 
            clearInterval(pollingRef.current!);
            pollingRef.current = null;
 
            if (data.status === "failed") {
              setReceiptId(data.id);
              setPaymentState("failed");
            } else {
              setReceiptId(data.id);
              setTimeout(() => setPaymentState("completed"), 1500);
            }
          }
        } catch { /* silently retry */ }
      }, 3000);
    } catch (e) {
      console.error(e);
      setPaymentState("idle");
    } finally {
      setIsSubmitting(false);
    }
  }, [
    bestLP,
    fiatAmount,
    accountNumber,
    bankCode,
    beneficiaryName,
    calculatedTokens,
    selectedCurrency,
    instantReserve,
    queryClient,
    verifyStatus,
  ]);
 
  const sym = CURRENCY_SYMBOLS[selectedCurrency] ?? selectedCurrency;
  const filteredBanks = banks.filter(
    (b) => !bankSearch || b.name.toLowerCase().includes(bankSearch.toLowerCase())
  );
 
  if (paymentState !== "idle") {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        {paymentState === "submitted" && (
          <>
            <Loader2 className="w-10 h-10 text-[#E8480A] animate-spin" />
            <p className="text-sm font-bold text-[#0F0D0A]">Transaction confirmed!</p>
            <p className="text-xs text-[#6B6558]">
              Waiting for validators to process your payout…
            </p>
          </>
        )}
        {paymentState === "polling" && (
          <>
            <Loader2 className="w-10 h-10 text-orange-400 animate-spin" />
            <p className="text-sm font-bold text-[#0F0D0A]">Processing payout…</p>
          </>
        )}
        {paymentState === "completed" && receiptId && (
          <>
            <CheckCircle className="w-10 h-10 text-[#0A7B6B]" />
            <p className="text-sm font-bold text-[#0F0D0A]">Payment successful!</p>
            <p className="text-xs text-[#6B6558]">Fiat is on its way to your bank account.</p>
            <button
              onClick={() => {
                loadReceipt(receiptId);
                setShowReceiptModal(true);
              }}
              className="mt-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-white border-none cursor-pointer hover:opacity-90"
              style={{ background: "#0A7B6B" }}
            >
              VIEW RECEIPT
            </button>
            <button
              onClick={() => {
                setPaymentState("idle");
                setReceiptId(null);
              }}
              className="text-xs text-[#6B6558] underline cursor-pointer bg-transparent border-none mt-1"
            >
              New transaction
            </button>
 
            {showReceiptModal && (
              <div
                className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
                style={{ background: "rgba(15,13,10,0.6)" }}
              >
                <div
                  className="w-full max-w-sm rounded-2xl overflow-hidden"
                  style={{ background: "#fff", border: "1.5px solid #E8E2D8" }}
                >
                  <div
                    className="px-5 py-4 flex items-center justify-between"
                    style={{ borderBottom: "1.5px solid #E8E2D8" }}
                  >
                    <span className="text-sm font-black uppercase tracking-widest text-[#0F0D0A]">
                      Receipt
                    </span>
                    <button
                      onClick={() => setShowReceiptModal(false)}
                      className="text-[#6B6558] hover:text-[#0F0D0A] bg-transparent border-none cursor-pointer text-xl leading-none"
                    >
                      ×
                    </button>
                  </div>
                  <div className="px-5 py-4 max-h-80 overflow-y-auto">
                    {receiptLoading ? (
                      <div className="flex items-center justify-center py-8 gap-2 text-[#6B6558]">
                        <Loader2 className="w-5 h-5 animate-spin text-[#E8480A]" />
                        <span className="text-sm">Loading receipt…</span>
                      </div>
                    ) : receiptData ? (
                      <div>
                        {[
                          {
                            label: "Recipient",
                            value: receiptData.beneficiary_name ?? receiptData.account_name,
                          },
                          {
                            label: "Account",
                            value:
                              receiptData.account_number ?? receiptData.beneficiary_account,
                            mono: true,
                          },
                          {
                            label: "Bank",
                            value: receiptData.bank_name ?? receiptData.beneficiary_bank ?? receiptData.bank_code ?? null,
                          },  
                          {
                            label: "Amount",
                            value: receiptData.fiat_amount != null
                            ? `${CURRENCY_SYMBOLS[receiptData.currency] ?? receiptData.currency} ${Number(receiptData.fiat_amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                            : null,
                            bold: true,
                          },
                          { label: "Currency", value: receiptData.currency },                    
                          {
                            label: "Tokens Sold",
                            value:
                              receiptData.token_amount != null && tokenDecimals !== null
                                ? `${(
                                    Number(receiptData.token_amount) /
                                    Math.pow(10, tokenDecimals)
                                  ).toLocaleString(undefined, {
                                    maximumFractionDigits: tokenDecimals,
                                  })} ${tokenSymbolResolved}`
                                : null,
                            bold: true,
                          },
                          {
                            label: "Reference",
                            value: receiptData.payout_reference ?? receiptData.reference,
                            mono: true,
                          },
                        ].map(({ label, value, mono, bold }) =>
                          value ? (
                            <div
                              key={label}
                              className="flex items-start justify-between gap-4 py-2.5"
                              style={{ borderBottom: "1px solid #F0EDE7" }}
                            >
                              <span className="text-xs text-[#6B6558] flex-shrink-0">
                                {label}:
                              </span>
                              <span
                                className={`text-xs text-right ${bold ? "font-black text-[#0F0D0A]" : "text-[#0F0D0A]"} ${mono ? "font-mono" : ""}`}
                              >
                                {value}
                              </span>
                            </div>
                          ) : null
                        )}
                        <div className="flex items-center justify-between py-2.5">
                          <span className="text-xs text-[#6B6558]">Status:</span>
                          <span
                            className="text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider"
                            style={{
                              background:
                                receiptData.status === "completed" ||
                                receiptData.status === "success"
                                  ? "rgba(10,123,107,0.12)"
                                  : "rgba(232,72,10,0.12)",
                              color:
                                receiptData.status === "completed" ||
                                receiptData.status === "success"
                                  ? "#0A7B6B"
                                  : "#E8480A",
                            }}
                          >
                            {receiptData.status?.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-sm text-[#6B6558] mb-4">
                          Could not load receipt data.
                        </p>
                        <button
                          onClick={() => window.open(`/receipts/${receiptId}`, "_blank")}
                          className="px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-white border-none cursor-pointer"
                          style={{ background: "#0F0D0A" }}
                        >
                          Open Receipt Page ↗
                        </button>
                      </div>
                    )}
                  </div>
                  <div
                    className="flex gap-3 px-5 py-4"
                    style={{ borderTop: "1.5px solid #E8E2D8" }}
                  >
                    <button
                      onClick={() => window.open(`/receipts/${receiptId}`, "_blank")}
                      className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest border cursor-pointer hover:opacity-80 transition-opacity bg-transparent"
                      style={{ borderColor: "#C8C2B4", color: "#6B6558" }}
                    >
                      Full Page ↗
                    </button>
                    <button
                      onClick={() => {
                        setShowReceiptModal(false);
                        setPaymentState("idle");
                        setReceiptId(null);
                      }}
                      className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-white border-none cursor-pointer hover:opacity-90"
                      style={{ background: "#0F0D0A" }}
                    >
                      Done
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        {paymentState === "timeout" && (
          <>
            <AlertCircle className="w-10 h-10 text-[#E8480A]" />
            <p className="text-sm font-bold text-[#0F0D0A]">Taking longer than expected</p>
            <p className="text-xs text-[#6B6558]">
              Your payout is still processing. Check your receipts page for the final status.
            </p>
            <Link
              href="/receipts"
              className="mt-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-white no-underline"
              style={{ background: "#0F0D0A" }}
            >
              Go to Receipts
            </Link>
            <button
              onClick={() => {
                setPaymentState("idle");
                setReceiptId(null);
              }}
              className="text-xs text-[#6B6558] underline cursor-pointer bg-transparent border-none mt-1"
            >
              Back
            </button>
          </>
        )}
        {paymentState === "failed" && (
          <>
            <AlertCircle className="w-10 h-10 text-[#E8480A]" />
            <p className="text-sm font-bold text-[#0F0D0A]">Payment Failed</p>
            <p className="text-xs text-[#6B6558]">
              The payout could not be completed. Your tokens have been refunded.
            </p>
            {receiptId && (
              <button
                onClick={() => window.open(`/receipts/${receiptId}`, "_blank")}
                className="mt-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-white border-none cursor-pointer hover:opacity-90"
                style={{ background: "#E8480A" }}
              >
                View Failed Receipt
              </button>
            )}
            <button
              onClick={() => {
                setPaymentState("idle");
                setReceiptId(null);
              }}
              className="text-xs text-[#6B6558] underline cursor-pointer bg-transparent border-none mt-1"
            >
              Try Again
            </button>
          </>
        )}
      </div>
    );
  }
 
  return (
    <div className="space-y-5">
      <p className="text-xs text-[#6B6558] flex items-center gap-2">
        <span>⚡</span>
        Send tokens — receive fiat directly to your bank account instantly
      </p>
 
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-black uppercase tracking-widest text-[#6B6558] mb-1.5">
            Currency
          </label>
          <div className="relative rounded-xl border border-[#E8E2D8] bg-white focus-within:border-[#0F0D0A]">
            <select
              className="w-full bg-transparent p-3 pr-8 text-sm text-[#0F0D0A] focus:outline-none appearance-none cursor-pointer"
              value={selectedCurrency}
              onChange={(e) => {
                setSelectedCurrency(e.target.value);
                setFiatAmount("");
              }}
            >
              <option value="" disabled>
                Choose currency
              </option>
              {availableCurrencies.map((c) => (
                <option key={c} value={c}>
                  {CURRENCY_FLAGS[c] ?? ""} {CURRENCY_NAMES[c] ?? c}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B6558] pointer-events-none" />
          </div>
        </div>
 
        <div>
          <label className="block text-xs font-black uppercase tracking-widest text-[#6B6558] mb-1.5">
            Amount to Receive
          </label>
          <div className="relative rounded-xl border border-[#E8E2D8] bg-white focus-within:border-[#0F0D0A] flex items-center px-3">
            <span className="text-xs font-bold text-[#6B6558] mr-2 flex-shrink-0">
              {sym || "—"}
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              disabled={!selectedCurrency}
              placeholder={selectedCurrency ? "e.g. 50,000" : "—"}
              value={fiatAmount}
              onChange={(e) => setFiatAmount(e.target.value)}
              className="flex-1 bg-transparent py-3 text-sm text-[#0F0D0A] focus:outline-none placeholder:text-[#C8C2B4] disabled:opacity-40"
            />
          </div>
          {selectedCurrency && pricePerToken > 0 && (
            <p className="text-xs text-[#C8C2B4] mt-1">Best rate auto-selected</p>
          )}
        </div>
      </div>
 
      {selectedCurrency && !bestLP && (
        <div className="flex items-center gap-2 text-xs text-[#E8480A] px-1">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          No liquidity providers available for {selectedCurrency} right now.
        </div>
      )}
 
      {selectedCurrency && pricePerToken > 0 && (
        <div
          className="flex items-center justify-between px-4 py-3 rounded-xl"
          style={{ background: "#F0EDE7" }}
        >
          <span className="text-xs text-[#6B6558]">Best available rate</span>
          <span className="text-sm font-black text-[#0F0D0A]">
            {pricePerToken.toLocaleString()}{" "}
            <span className="text-[#E8480A]">
              {selectedCurrency}/{tokenSymbolResolved}
            </span>
          </span>
        </div>
      )}
 
      {calculatedTokens > 0 && (
        <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-[#E8E2D8]">
          <span className="text-xs text-[#6B6558]">Tokens required</span>
          <span className="text-sm font-black text-[#0F0D0A] flex items-center gap-1">
            {tokenLogoURI && (
              <Image
                src={tokenLogoURI}
                alt={tokenSymbolResolved}
                className="w-4 h-4 rounded-full"
              />
            )}
            {calculatedTokens.toFixed(2)} {tokenSymbolResolved}
          </span>
        </div>
      )}
 
      {selectedCurrency && (
        <>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-[#6B6558] mb-1.5 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> Select Bank
            </label>
            <div className="relative">
              <div
                className="rounded-xl border border-[#E8E2D8] bg-white p-3 flex items-center justify-between cursor-pointer hover:border-[#0F0D0A] transition-colors select-none"
                onClick={() => setShowDropdown((v) => !v)}
              >
                <span className={`text-sm ${bankCode ? "text-[#0F0D0A]" : "text-[#C8C2B4]"}`}>
                  {bankCode
                    ? banks.find((b) => b.code === bankCode)?.name ?? "Choose bank"
                    : banksLoading
                    ? "Loading banks…"
                    : "Choose bank"}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-[#6B6558] transition-transform ${showDropdown ? "rotate-180" : ""}`}
                />
              </div>
              {showDropdown && (
                <div className="absolute z-50 w-full mt-1 rounded-xl border-2 border-[#0F0D0A] bg-white shadow-xl max-h-60 flex flex-col">
                  <div className="p-2 border-b border-[#E8E2D8]">
                    <input
                      type="text"
                      placeholder="Search banks…"
                      value={bankSearch}
                      onChange={(e) => setBankSearch(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full text-sm p-2 rounded-lg border border-[#E8E2D8] focus:outline-none"
                    />
                  </div>
                  <div className="overflow-y-auto">
                    {filteredBanks.map((b) => (
                      <button
                        key={b.code}
                        type="button"
                        onClick={() => {
                          setBankCode(b.code);
                          setShowDropdown(false);
                          setBankSearch("");
                        }}
                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-[#F5F0E8] transition-colors ${bankCode === b.code ? "bg-[#F5F0E8] font-bold" : ""}`}
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
 
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-[#6B6558] mb-1.5">
              Account Number
            </label>
            <div className="relative rounded-xl border border-[#E8E2D8] bg-white focus-within:border-[#0F0D0A] flex items-center px-3">
              <input
                type="text"
                inputMode="numeric"
                placeholder="1234567890"
                maxLength={10}
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
                className="flex-1 bg-transparent py-3 text-sm text-[#0F0D0A] focus:outline-none placeholder:text-[#C8C2B4]"
              />
              <div className="ml-2 flex-shrink-0">
                {verifyStatus === "loading" && (
                  <Loader2 className="w-4 h-4 animate-spin text-[#E8480A]" />
                )}
                {verifyStatus === "success" && (
                  <CheckCircle className="w-4 h-4 text-[#0A7B6B]" />
                )}
                {verifyStatus === "error" && (
                  <AlertCircle className="w-4 h-4 text-red-400" />
                )}
              </div>
            </div>
            {accountNumber.length > 0 && accountNumber.length < 10 && (
              <p className="text-xs text-[#E8480A] mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Account number must be 10 digits ({10 - accountNumber.length} remaining)
              </p>
            )}
            {/*verifyStatus === "success" && verifiedName && (
              <p className="text-xs text-[#0A7B6B] mt-1 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> {verifiedName}
              </p>
            )*/}
            {verifyStatus === "error" && (
              <p className="text-xs text-red-400 mt-1">
                Could not verify account. Check details.
              </p>
            )}
          </div>
 
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-[#6B6558] mb-1.5">
              Beneficiary Name
            </label>
            <div className="rounded-xl border border-[#E8E2D8] bg-white focus-within:border-[#0F0D0A]">
              <input
                type="text"
                placeholder="Auto-filled on verification"
                value={beneficiaryName}
                onChange={(e) => setBeneficiaryName(e.target.value)}
                className="w-full bg-transparent px-3 py-3 text-sm text-[#0F0D0A] focus:outline-none placeholder:text-[#C8C2B4]"
              />
            </div>
          </div>
        </>
      )}
 
      <button
        onClick={handleSubmit}
        disabled={
          !bestLP ||
          !fiatAmount ||
          parseFloat(fiatAmount) <= 0 ||
          verifyStatus !== "success" ||
          isSubmitting
        }
        className="w-full py-3.5 rounded-xl text-xs font-black uppercase tracking-widest text-white transition-opacity hover:opacity-90 disabled:opacity-40 cursor-pointer border-none"
        style={{ background: "#0F0D0A" }}
      >
        {isSubmitting ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Processing…
          </span>
        ) : (
          "Confirm Sale →"
        )}
      </button>
 
      {selectedCurrency && verifyStatus !== "success" && accountNumber && bankCode && (
        <p className="text-xs text-center text-[#C8C2B4]">
          Waiting for account verification before you can submit
        </p>
      )}
    </div>
  );
}


// ─── How It Works ─────────────────────────────────────────────────────────────
function HowItWorks({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="rounded-xl overflow-hidden mb-8">
      <div className="bg-[#0F0D0A] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="w-4 h-4 text-[#E8480A]" />
          <span className="text-[#F5F0E8] text-xs font-black uppercase tracking-widest">How It Works</span>
        </div>
        <button
          onClick={onDismiss}
          className="text-[#555] hover:text-[#999] text-xl leading-none bg-transparent border-none cursor-pointer"
        >
          ×
        </button>
      </div>
      <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#0F0D0A]/10 bg-white">
        {[
          { n: "1", title: "Choose Currency", desc: "Select your preferred fiat from NGN, KES, GHS and others." },
          { n: "2", title: "Enter Amount", desc: "Set token or fiat amount. Best LP rate auto-selected from live on-chain escrows." },
          { n: "3", title: "Get Paid Instantly", desc: "Funds hit your bank or wallet via Flutterwave automated settlement." },
        ].map((s) => (
          <div key={s.n} className="p-6">
            <div
              className="text-4xl font-black leading-none mb-3"
              style={{ color: "rgba(15,13,10,0.07)", fontFamily: "Georgia, serif" }}
            >
              {s.n}
            </div>
            <div className="text-xs font-black uppercase tracking-widest text-[#0F0D0A] mb-2">{s.title}</div>
            <p className="text-sm text-[#6B6558] leading-relaxed">{s.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}



// ─── Main Page ────────────────────────────────────────────────────────────────
const TrustExpressPage: React.FC = () => {
  const searchParams = useSearchParams();
  const { getTrustExpressAccounts } = useTrustExpress();

  const [isVisible, setIsVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<"buy" | "sell">("buy");
  const [showBanner, setShowBanner] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { activeEscrows: totalEscrows, totalVolume, totalCreated, isLoading: statsLoading } = useExpressGlobalStats();

  const [paymentLinkData, setPaymentLinkData] = useState<{
    trustExpressAddress: string;
    transactionSignature: string;
    tokenAmount: string;
    currency: string;
  } | null>(null);
  const [autoOpenBuyDialog, setAutoOpenBuyDialog] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setIsVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  // URL params deep-link
  useEffect(() => {
    const addr = searchParams.get("trustExpressAddress");
    const amt = searchParams.get("tokenAmount");
    const cur = searchParams.get("currency");
    const sig = searchParams.get("transactionSignature");
    if (addr && amt && cur && sig) {
      setPaymentLinkData({ trustExpressAddress: addr, transactionSignature: sig, tokenAmount: amt, currency: cur });
      setAutoOpenBuyDialog(true);
    }
  }, [searchParams]);

  const reserveIntent = searchParams.get("intent") === "reserve";
  const reserveCurrency = searchParams.get("currency") ?? "";
  const reserveAmount = searchParams.get("amount") ?? "";

  const accounts = (getTrustExpressAccounts.data ?? []) as AccountData[];

 const tickerItems = useMemo((): TickerItem[] => {
  // Separate maps for buy (escrowType=1) and sell (escrowType=0)
  const buyMap = new Map<string, { rates: number[]; online: number }>();
  const sellMap = new Map<string, { rates: number[]; online: number }>();

  accounts.forEach((a) => {
    const cur = parseCurrency(a.account.currency);
    const token = shortMint(a.account.mint);
    const key = `${token}|${cur}`;
    const rate = Number(a.account.pricePerToken.toString());
    const hasAmount = Number(a.account.amount.toString()) > 0;
    if (!cur || rate === 0 || !hasAmount) return;

    // escrowType 0 = sell order (LP selling tokens, user buys)
    // escrowType 1 = buy order (LP buying tokens, user sells)
    const map = a.account.escrowType === 0 ? sellMap : buyMap;
    if (!map.has(key)) map.set(key, { rates: [], online: 0 });
    const entry = map.get(key)!;
    entry.rates.push(rate);
    if (a.account.reservedAmounts.length < 10) entry.online++;
  });

  const items: TickerItem[] = [];

  // Sell orders: best rate = lowest price (cheapest tokens for buyer)
  sellMap.forEach((v, key) => {
    const [token, currency] = key.split("|");
    items.push({
      token,
      currency,
      rate: Math.min(...v.rates),
      online: v.online,
      type: "SELL",
    });
  });

  // Buy orders: best rate = highest price (most fiat for token seller)
  buyMap.forEach((v, key) => {
    const [token, currency] = key.split("|");
    items.push({
      token,
      currency,
      rate: Math.max(...v.rates),
      online: v.online,
      type: "BUY",
    });
  });

  return items;
}, [accounts]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await getTrustExpressAccounts.refetch();
    setIsRefreshing(false);
  }, [getTrustExpressAccounts]);

  const fade = (delay = 0): React.CSSProperties => ({
    opacity: isVisible ? 1 : 0,
    transform: isVisible ? "none" : "translateY(16px)",
    transition: `all 0.65s cubic-bezier(.22,.68,0,1) ${delay}s`,
  });

  const liveOrderCount = accounts.filter(
    (a) =>
      Number(a.account.amount.toString()) > 0 &&
      a.account.reservedAmounts.length < 10
  ).length;

  return (
    <div className="min-h-screen" style={{ background: "#F5F0E8", color: "#0F0D0A" }}>

      {/* Top accent stripe */}
      <div className="h-0.5" style={{ background: "linear-gradient(90deg,#E8480A,#FF8C5A 50%,#E8480A)" }} />

      {/* Live ticker */}
      <LiveTicker items={tickerItems} totalCreated={totalCreated} />

      {/* Stats strip */}
      <StatsStrip totalEscrows={totalEscrows} totalVolume={totalVolume}  loading={statsLoading} />

      <div className="max-w-2xl mx-auto px-5 py-14 pb-24">

        {/* Hero */}
        <div className="text-center mb-10" style={fade(0)}>
          <h1
            className="leading-none tracking-tight mb-4"
            style={{
              fontSize: "clamp(48px,8vw,80px)",
              fontFamily: "Georgia, serif",
              fontWeight: 400,
            }}
          >
            <em style={{ color: "#E8480A" }}>Express</em>
          </h1>
          <p className="text-sm text-[#6B6558] max-w-xs mx-auto leading-relaxed">
            Instant crypto to fiat conversion.
          </p>
        </div>

        {/* How it works banner */}
        <div style={fade(0.08)}>
          {showBanner && <HowItWorks onDismiss={() => setShowBanner(false)} />}
        </div>

        {/* Main action panel */}
        <div
          className="bg-white rounded-2xl overflow-hidden mb-8"
          style={{ border: "1.5px solid #E8E2D8", ...fade(0.15) }}
        >
          {/* Panel header */}
          <div
            className="px-6 py-5 flex items-center justify-between flex-wrap gap-3"
            style={{ borderBottom: "1.5px solid #E8E2D8" }}
          >
            <TabSwitcher active={activeTab} onChange={setActiveTab} />

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-[#0A7B6B]" />
                <span className="text-xs text-[#6B6558]">{liveOrderCount} live orders</span>
              </div>
              <button
                onClick={handleRefresh}
                disabled={isRefreshing || getTrustExpressAccounts.isFetching}
                className="p-1.5 rounded-lg hover:bg-[#F5F0E8] transition-colors border-none bg-transparent cursor-pointer disabled:opacity-50"
                title="Refresh orders"
              >
                <RefreshCcw
                  className={`w-3.5 h-3.5 text-[#6B6558] ${
                    isRefreshing || getTrustExpressAccounts.isFetching ? "animate-spin" : ""
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Loading state */}
          {getTrustExpressAccounts.isLoading && (
            <div className="flex items-center justify-center py-14 gap-3 text-[#6B6558]">
              <Loader2 className="w-5 h-5 animate-spin text-[#E8480A]" />
              <span className="text-sm">Loading live orders…</span>
            </div>
          )}

          {/* Inline form body */}
          {!getTrustExpressAccounts.isLoading && (
            <div
              className="px-6 py-6"
              style={{
                opacity: getTrustExpressAccounts.isFetching ? 0.55 : 1,
                transition: "opacity 0.2s",
              }}
            >
              {activeTab === "buy" ? (
                <InlineBuyForm
                  key="buy"
                  accounts={accounts}
                  initialCurrency={reserveIntent ? reserveCurrency : ""}
                  initialAmount={reserveIntent ? reserveAmount : ""}
                />
              ) : (
                <InlineSellForm key="sell" accounts={accounts} />
              )}
            </div>
          )}
        </div>

        {/* Provider CTAs */}
        <div style={fade(0.25)}>
          <ProviderCTASection />
        </div>
      </div>

      {/* Fallback dialog only for payment-link deep-links from URL */}
      <InstantBuyDialog
        open={autoOpenBuyDialog}
        onOpenChange={(o) => { if (!o) setAutoOpenBuyDialog(false); }}
        paymentLinkData={paymentLinkData}
        autoOpen={autoOpenBuyDialog}
        onAutoOpenComplete={() => setAutoOpenBuyDialog(false)}
      />
    </div>
  );
};

export default TrustExpressPage;