"use client";
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import { PublicKey, Connection } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import useTrustExpress from "@/hooks/express/useTrustExpress";
import { useTokenMetadata } from "@/hooks/useTokenMetadata";
import { useProcessorBanks } from "@/hooks/express/useProcessorBanks";
import { PaymentLinkDisplay } from "@/components/TrustExpress/SellOrder/PaymentLinkDisplay";
import { Separator } from "@/components/ui/seperator";
import { ellipsify } from "@/lib/utils";
import Link from "next/link";
import {
  Zap,
  Shield,
  Clock,
  Copy,
  CheckCircle2,
  CheckCircle,
  AlertCircle,
  Loader2,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Wallet,
  ArrowLeft,
  Info,
  Building2,
  ChevronDown,
} from "lucide-react";
import Image from "next/image";

// ─── Constants ────────────────────────────────────────────────────────────────
// escrowType=0 → LP is SELLING tokens → user BUYS (pays fiat, receives tokens) → payment link flow
// escrowType=1 → LP is BUYING tokens  → user SELLS (sends tokens, receives fiat) → bank details flow
const EXPRESS_SELL = 0;

// ─── Types ────────────────────────────────────────────────────────────────────
interface ReservationEntry {
  taker: PublicKey;
  amount: BN;
  fiatAmount: BN;
  timestamp: BN;
  status: number;
}

interface TrustExpressData {
  seed: BN;
  maker: PublicKey;
  mint: PublicKey;
  currency: number[];
  escrowType: number;
  amount: BN;
  pricePerToken: BN;
  paymentInstructions: string;
  reservedAmounts: ReservationEntry[];
  bump: number;
  feePercentage?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatCurrency(n: number, currency: string) {
  return (
    new Intl.NumberFormat("en-NG", { maximumFractionDigits: 2 }).format(n) +
    " " +
    currency
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ReservePoolPage() {
  const params = useParams();
  const rawPubkey = params?.pubkey as string;
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const queryClient = useQueryClient();

  const { program, getMintInfo, instantReserve, instantSellReserve } =
    useTrustExpress();

  // ── General form state ──
  const [amount, setAmount] = useState("");
  const [reserving, setReserving] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── BUY POOL state (user buys tokens, pays fiat via payment link) ──
  // PaymentLinkDisplay handles its own "ready" / "waiting" / "completed" UI.
  // But its onPaymentComplete is commented out intentionally — the parent must
  // do its own receipt polling (same as InlineBuyForm in the main express page).
  const [showPaymentLink, setShowPaymentLink] = useState(false);
  const [currentPayoutReference, setCurrentPayoutReference] = useState<string | null>(null);
  const [transactionSignature, setTransactionSignature] = useState<string | null>(null);

  // Receipt polling for buy pool — mirrors InlineBuyForm exactly
  const subscriptionIdRef = useRef<number | null>(null);
  const receiptPollRef = useRef<NodeJS.Timeout | null>(null);
  const [buyReceiptId, setBuyReceiptId] = useState<string | null>(null);
  const [buyDone, setBuyDone] = useState(false);

  // ── SELL POOL state (user sells tokens, receives fiat) ──
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [bankSearch, setBankSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [verifiedName, setVerifiedName] = useState<string | null>(null);
  const lastVerified = useRef<{ accountNumber: string; bankCode: string } | null>(null);

  // Receipt polling for sell pool
  const [paymentState, setPaymentState] = useState<
    "idle" | "submitted" | "polling" | "completed" | "timeout"
  >("idle");
  const [sellReceiptId, setSellReceiptId] = useState<string | null>(null);
  const sellPollingRef = useRef<NodeJS.Timeout | null>(null);
  const submittedAtRef = useRef<string | null>(null);

  // Cleanup all timers + subscription on unmount
  useEffect(() => {
    return () => {
      if (sellPollingRef.current) clearInterval(sellPollingRef.current);
      if (receiptPollRef.current) clearInterval(receiptPollRef.current);
      if (subscriptionIdRef.current !== null) {
        const connection = new Connection(
          process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com"
        );
        connection.removeAccountChangeListener(subscriptionIdRef.current);
      }
    };
  }, []);

  // ── Validate pubkey ──
  const trustExpressPubkey = useMemo(() => {
    try {
      return new PublicKey(rawPubkey);
    } catch {
      return null;
    }
  }, [rawPubkey]);

  // ── Fetch on-chain account ──
  const {
    data: account,
    isLoading: accountLoading,
    error: accountError,
  } = useQuery<TrustExpressData>({
    queryKey: ["trust-express-reserve-account", rawPubkey],
    queryFn: () =>
      program.account.trustExpress.fetch(
        trustExpressPubkey!
      ) as Promise<TrustExpressData>,
    enabled: !!trustExpressPubkey && !!program,
    retry: 1,
    staleTime: 30_000,
  });

  // ── Fetch mint decimals ──
  const { data: mintDecimals = 9 } = useQuery<number>({
    queryKey: ["mint-decimals", account?.mint?.toString()],
    queryFn: () => getMintInfo(account!.mint).then((m) => m.decimals),
    enabled: !!account?.mint,
    staleTime: 5 * 60_000,
  });

  const tokenMint = account?.mint?.toString();
  const { metadata: tokenMetadata } = useTokenMetadata(tokenMint || "");

  // ── Derived values ──
  const currency = useMemo(() => {
    if (!account) return "";
    try {
      return String.fromCharCode(...account.currency).trim();
    } catch {
      return "";
    }
  }, [account]);

  const availableAmount = useMemo(
    () => (account ? account.amount.toNumber() / 10 ** mintDecimals : 0),
    [account, mintDecimals]
  );

  const pricePerToken = useMemo(
    () => (account ? account.pricePerToken.toNumber() : 0),
    [account]
  );

  const slotsUsed = account?.reservedAmounts?.length ?? 0;
  const slotsRemaining = Math.max(0, 10 - slotsUsed);
  const isSellPool = account?.escrowType === EXPRESS_SELL;
  const poolDrained = availableAmount <= 0;
  const isFull = slotsRemaining === 0 || poolDrained;

  const parsedAmount = parseFloat(amount) || 0;
  const fiatTotal = parsedAmount > 0 ? parsedAmount * pricePerToken : 0;

  // ── Bank data — only for sell-tokens flow ──
  const {
    banks,
    loading: banksLoading,
    verifyAccount: verifyAccountFn,
  } = useProcessorBanks({
    trustExpressPda: !isSellPool ? (trustExpressPubkey?.toBase58() ?? null) : null,
    currency: currency || "NGN",
  });

  useEffect(() => {
    setBankCode("");
    setAccountNumber("");
    setBeneficiaryName("");
    setVerifyStatus("idle");
    setVerifiedName(null);
    lastVerified.current = null;
  }, [banks]);

  useEffect(() => {
    if (isSellPool) return;
    if (!accountNumber || !bankCode) {
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
  }, [accountNumber, bankCode, beneficiaryName, verifyAccountFn, isSellPool]);

  const filteredBanks = banks.filter(
    (b) => !bankSearch || b.name.toLowerCase().includes(bankSearch.toLowerCase())
  );

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Receipt polling for buy pool — mirrors InlineBuyForm exactly ──
  // Called from onPaymentLinkReady (the payment link is now live, user is about to pay).
  // We open an on-chain subscription; when the escrow account changes (validators settled),
  // we poll /api/receipts/by-transaction until the receipt appears.
  const startReceiptMonitoring = useCallback(
    (trustExpressAddress: string) => {
      console.log("[ReservePoolPage] Starting receipt monitoring for:", trustExpressAddress);

      const connection = new Connection(
        process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com"
      );
      const trustExpressPubkeyObj = new PublicKey(trustExpressAddress);

      let pollCount = 0;
      const maxPolls = 90;
      let hasDetectedTransaction = false;
      let pollingStartTime: string | null = null;

      const pollForReceipt = async (): Promise<boolean> => {
        try {
          if (!pollingStartTime) return false;
          const res = await fetch(
            `/api/receipts/by-transaction?trustExpressAddress=${trustExpressAddress}&since=${pollingStartTime}`
          );
          if (!res.ok) return false;
          const data = await res.json();
          if (data?.id) {
            console.log("[ReservePoolPage] Receipt found:", data.id);
            setBuyReceiptId(data.id);
            setTimeout(() => setBuyDone(true), 1000);
            return true;
          }
          return false;
        } catch {
          return false;
        }
      };

      const subId = connection.onAccountChange(
        trustExpressPubkeyObj,
        async () => {
          if (hasDetectedTransaction) return;
          hasDetectedTransaction = true;
          pollingStartTime = new Date().toISOString();
          console.log("[ReservePoolPage] On-chain change detected — starting receipt poll");

          await queryClient.invalidateQueries({
            queryKey: ["trust-express-reserve-account", rawPubkey],
          });

          // Give validators 8s to write the receipt, then poll every 3s
          setTimeout(() => {
            pollCount = 0;
            receiptPollRef.current = setInterval(async () => {
              pollCount++;
              if (pollCount >= maxPolls) {
                clearInterval(receiptPollRef.current!);
                receiptPollRef.current = null;
                console.warn("[ReservePoolPage] Receipt polling timed out");
                return;
              }
              const found = await pollForReceipt();
              if (found && receiptPollRef.current) {
                clearInterval(receiptPollRef.current);
                receiptPollRef.current = null;
              }
            }, 3000);
          }, 8000);
        },
        "confirmed"
      );

      subscriptionIdRef.current = subId;
      console.log("[ReservePoolPage] Subscription registered:", subId);
    },
    [queryClient, rawPubkey]
  );

  // ── Submit ──
  const handleReserve = useCallback(async () => {
    if (!publicKey) {
      setVisible(true);
      return;
    }
    if (!parsedAmount || parsedAmount <= 0) {
      toast.error("Enter a valid amount.");
      return;
    }
    if (parsedAmount > availableAmount) {
      toast.error(
        `Amount exceeds available liquidity (${availableAmount.toLocaleString(
          undefined,
          { maximumFractionDigits: 4 }
        )} ${tokenMetadata?.symbol || "tokens"}).`
      );
      return;
    }

    setReserving(true);
    try {
      if (isSellPool) {
        // BUY POOL: user pays fiat → receives tokens
        // No bank details. Show PaymentLinkDisplay, then monitor on-chain for receipt.
        const result = await instantSellReserve.mutateAsync({
          trustExpress: trustExpressPubkey!,
          amount: parsedAmount,
          paymentMode: 0,
          buyerPayoutDetails: undefined,
          tokenDecimals: mintDecimals,
        });

        const sig = result.signature || null;
        const payoutRef = result.payoutReference;

        if (!sig || sig === "undefined") {
          throw new Error("Failed to get transaction signature");
        }

        setTransactionSignature(sig);
        setCurrentPayoutReference(payoutRef);
        queryClient.invalidateQueries({ queryKey: ["trust-express-reserve-account", rawPubkey] });
        setShowPaymentLink(true);

      } else {
        // SELL POOL: user sends tokens → receives fiat
        if (verifyStatus !== "success") {
          toast.error("Please verify your bank account before reserving.");
          return;
        }

        const payoutDetails = JSON.stringify({
          type: "bank_transfer",
          account_number: accountNumber,
          bank_code: bankCode,
          beneficiary_name: beneficiaryName,
        });

        const fiatAmt = Math.floor(parsedAmount * pricePerToken);
        await instantReserve.mutateAsync({
          trustExpress: trustExpressPubkey!,
          amount: parsedAmount,
          fiatAmount: fiatAmt,
          currency,
          payoutDetails,
        });

        queryClient.invalidateQueries({ queryKey: ["trust-express-reserve-account", rawPubkey] });

        const trustExpressAddress = trustExpressPubkey!.toString();
        submittedAtRef.current = new Date().toISOString();

        setAmount("");
        setAccountNumber("");
        setBankCode("");
        setBeneficiaryName("");
        setVerifyStatus("idle");
        setVerifiedName(null);
        lastVerified.current = null;

        // Start sell-pool receipt polling
        setPaymentState("submitted");
        await new Promise((r) => setTimeout(r, 8000));
        setPaymentState("polling");

        let pollCount = 0;
        const maxPolls = 90;

        sellPollingRef.current = setInterval(async () => {
          pollCount++;
          if (pollCount >= maxPolls) {
            clearInterval(sellPollingRef.current!);
            sellPollingRef.current = null;
            setPaymentState("timeout");
            return;
          }
          try {
            const res = await fetch(
              `/api/receipts/by-transaction?trustExpressAddress=${trustExpressAddress}&since=${submittedAtRef.current}`
            );
            if (!res.ok) return;
            const data = await res.json();
            if (data?.id) {
              clearInterval(sellPollingRef.current!);
              sellPollingRef.current = null;
              setSellReceiptId(data.id);
              setTimeout(() => setPaymentState("completed"), 1500);
            }
          } catch { /* silently retry */ }
        }, 3000);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Reservation failed. Try again.";
      toast.error(msg);
      setPaymentState("idle");
    } finally {
      setReserving(false);
    }
  }, [
    publicKey, parsedAmount, availableAmount, tokenMetadata, verifyStatus,
    accountNumber, bankCode, beneficiaryName, isSellPool, mintDecimals,
    pricePerToken, currency, trustExpressPubkey, rawPubkey,
    instantReserve, instantSellReserve, queryClient, setVisible,
  ]);

  // ─────────────────────────────────────────────────────────────────────────
  // Error / loading screens
  // ─────────────────────────────────────────────────────────────────────────

  if (!trustExpressPubkey) {
    return (
      <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center px-4">
        <div className="text-center space-y-5 max-w-sm w-full">
          <div className="bg-[#0F0D0A] p-4 rounded-2xl inline-flex">
            <AlertCircle className="w-8 h-8 text-[#E8480A]" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-[#0F0D0A]" style={{ fontFamily: "'Syne', sans-serif" }}>
              Invalid Pool Address
            </h2>
            <p className="text-sm text-[#0F0D0A]/50 mt-1.5">
              The address in this URL is not a valid Solana public key.
            </p>
          </div>
          <Link href="/express">
            <Button className="bg-[#E8480A] hover:bg-[#E8480A]/90 text-white font-black">Browse Pools</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (accountLoading) {
    return (
      <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full border-4 border-[#0F0D0A]/10 border-t-[#E8480A] animate-spin" />
          <p className="text-sm text-[#0F0D0A]/50 font-bold tracking-wide" style={{ fontFamily: "'Syne', sans-serif" }}>
            Loading pool...
          </p>
        </div>
      </div>
    );
  }

  if (accountError || !account) {
    return (
      <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center px-4">
        <div className="text-center space-y-5 max-w-sm w-full">
          <div className="bg-[#0F0D0A] p-4 rounded-2xl inline-flex">
            <AlertCircle className="w-8 h-8 text-[#E8480A]" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-[#0F0D0A]" style={{ fontFamily: "'Syne', sans-serif" }}>
              Pool Not Found
            </h2>
            <p className="text-sm text-[#0F0D0A]/50 mt-1.5">
              This pool no longer exists or has been closed by the LP.
            </p>
          </div>
          <Link href="/express">
            <Button className="bg-[#E8480A] hover:bg-[#E8480A]/90 text-white font-black">Browse Pools</Button>
          </Link>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BUY POOL: receipt found → done screen
  // ─────────────────────────────────────────────────────────────────────────
  if (isSellPool && buyDone) {
    return (
      <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center px-4">
        <div className="text-center space-y-5 max-w-sm w-full">
          <div className="bg-[#0F0D0A] p-4 rounded-2xl inline-flex">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-[#0F0D0A]" style={{ fontFamily: "'Syne', sans-serif" }}>
              Payment Complete!
            </h2>
            <p className="text-sm text-[#0F0D0A]/50 mt-1.5">
              Your tokens are on their way to your wallet.
            </p>
          </div>
          {buyReceiptId && (
            <button
              onClick={() => window.open(`/receipts/${buyReceiptId}`, "_blank")}
              className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-white border-none cursor-pointer hover:opacity-90"
              style={{ background: "#0A7B6B" }}
            >
              View Receipt
            </button>
          )}
          <Link href="/express">
            <Button variant="outline" className="border-2 border-[#0F0D0A]/15 font-bold text-[#0F0D0A] hover:border-[#0F0D0A] hover:bg-[#0F0D0A] hover:text-white transition-all">
              Express Home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BUY POOL: PaymentLinkDisplay view
  // ─────────────────────────────────────────────────────────────────────────
  if (isSellPool && showPaymentLink) {
    return (
      <div className="min-h-screen bg-[#F5F0E8]">
        <div className="container mx-auto max-w-md py-8 px-4 space-y-4">
          <div className="flex items-center">
            <button
              onClick={() => {
                setShowPaymentLink(false);
                setCurrentPayoutReference(null);
                setTransactionSignature(null);
                // Clean up subscription if user backs out
                if (receiptPollRef.current) clearInterval(receiptPollRef.current);
                if (subscriptionIdRef.current !== null) {
                  const connection = new Connection(
                    process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com"
                  );
                  connection.removeAccountChangeListener(subscriptionIdRef.current);
                  subscriptionIdRef.current = null;
                }
              }}
              className="flex items-center gap-1.5 text-sm font-bold text-[#0F0D0A]/40 hover:text-[#0F0D0A] transition-colors"
              style={{ fontFamily: "'Syne', sans-serif" }}
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          </div>

          {currentPayoutReference ? (
            <PaymentLinkDisplay
              payoutReference={currentPayoutReference}
              trustExpressAddress={trustExpressPubkey?.toString() || ""}
              transactionSignature={transactionSignature || undefined}
              tokenAmount={parsedAmount}
              fiatAmount={fiatTotal}
              currency={currency}
              onPaymentLinkReady={(link) => {
                // Payment link is live — start monitoring for on-chain settlement.
                // This is the correct trigger point (matches InlineBuyForm behaviour).
                console.log("[ReservePoolPage] Payment link ready, starting receipt monitoring:", link);
                if (trustExpressPubkey) {
                  startReceiptMonitoring(trustExpressPubkey.toString());
                }
              }}
              onPaymentComplete={() => {
                // PaymentLinkDisplay's onPaymentComplete is intentionally commented out
                // inside the component itself. Receipt monitoring above drives buyDone.
                // This callback is kept as a no-op safety net.
                console.log("[ReservePoolPage] onPaymentComplete fired (receipt monitoring is primary)");
              }}
              onBack={() => {
                setShowPaymentLink(false);
                setCurrentPayoutReference(null);
                setTransactionSignature(null);
              }}
            />
          ) : (
            <div className="flex items-center justify-center py-14 gap-3 text-[#6B6558]">
              <Loader2 className="w-5 h-5 animate-spin text-[#E8480A]" />
              <span className="text-sm font-bold" style={{ fontFamily: "'Syne', sans-serif" }}>
                Preparing your payment link…
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SELL POOL: receipt polling states
  // ─────────────────────────────────────────────────────────────────────────
  if (!isSellPool && paymentState !== "idle") {
    return (
      <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center px-4">
        <div className="text-center space-y-5 max-w-sm w-full">
          {paymentState === "submitted" && (
            <>
              <div className="bg-[#0F0D0A] p-4 rounded-2xl inline-flex">
                <Loader2 className="w-8 h-8 text-[#E8480A] animate-spin" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-[#0F0D0A]" style={{ fontFamily: "'Syne', sans-serif" }}>
                  Transaction Confirmed!
                </h2>
                <p className="text-sm text-[#0F0D0A]/50 mt-1.5">
                  Waiting for validators to process your payout…
                </p>
              </div>
            </>
          )}
          {paymentState === "polling" && (
            <>
              <div className="bg-[#0F0D0A] p-4 rounded-2xl inline-flex">
                <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-[#0F0D0A]" style={{ fontFamily: "'Syne', sans-serif" }}>
                  Processing Payout…
                </h2>
                <p className="text-sm text-[#0F0D0A]/50 mt-1.5">
                  Generating your receipt, this may take a moment.
                </p>
              </div>
            </>
          )}
          {paymentState === "completed" && sellReceiptId && (
            <>
              <div className="bg-[#0F0D0A] p-4 rounded-2xl inline-flex">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-[#0F0D0A]" style={{ fontFamily: "'Syne', sans-serif" }}>
                  Payment Successful!
                </h2>
                <p className="text-sm text-[#0F0D0A]/50 mt-1.5">
                  Fiat is on its way to your bank account.
                </p>
              </div>
              <button
                onClick={() => window.open(`/receipts/${sellReceiptId}`, "_blank")}
                className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-white border-none cursor-pointer hover:opacity-90"
                style={{ background: "#0A7B6B" }}
              >
                View Receipt
              </button>
              <button
                onClick={() => { setPaymentState("idle"); setSellReceiptId(null); }}
                className="block w-full text-xs text-[#6B6558] underline cursor-pointer bg-transparent border-none mt-1"
              >
                New transaction
              </button>
            </>
          )}
          {paymentState === "timeout" && (
            <>
              <div className="bg-[#0F0D0A] p-4 rounded-2xl inline-flex">
                <AlertCircle className="w-8 h-8 text-[#E8480A]" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-[#0F0D0A]" style={{ fontFamily: "'Syne', sans-serif" }}>
                  Taking Longer Than Expected
                </h2>
                <p className="text-sm text-[#0F0D0A]/50 mt-1.5">
                  Your payout is still processing. Check your receipts page for the final status.
                </p>
              </div>
              <Link href="/receipts">
                <Button className="bg-[#0F0D0A] hover:bg-[#0F0D0A]/90 text-white font-black">
                  Go to Receipts
                </Button>
              </Link>
              <button
                onClick={() => { setPaymentState("idle"); setSellReceiptId(null); }}
                className="block w-full text-xs text-[#6B6558] underline cursor-pointer bg-transparent border-none mt-1"
              >
                Back
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ─── Main UI ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <div className="container mx-auto max-w-md py-8 px-4 space-y-4">

        {/* ── Top nav ── */}
        <div className="flex items-center justify-between">
          <Link
            href="/express"
            className="flex items-center gap-1.5 text-sm font-bold text-[#0F0D0A]/40 hover:text-[#0F0D0A] transition-colors"
            style={{ fontFamily: "'Syne', sans-serif" }}
          >
            <ArrowLeft className="w-4 h-4" />
            Express
          </Link>
          <button
            onClick={copyLink}
            className="flex items-center gap-1.5 text-xs font-bold text-[#0F0D0A]/40 hover:text-[#0F0D0A] transition-colors"
            style={{ fontFamily: "'Syne', sans-serif" }}
          >
            {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied!" : "Share pool"}
          </button>
        </div>

        {/* ── Pool info card ── */}
        <div className="rounded-2xl border-2 border-[#0F0D0A]/10 bg-white overflow-hidden">
          <div className={`px-5 py-3 flex items-center justify-between ${isSellPool ? "bg-[#E8480A]" : "bg-[#0F0D0A]"}`}>
            <div className="flex items-center gap-2">
              {isSellPool
                ? <TrendingDown className="w-4 h-4 text-white" />
                : <TrendingUp className="w-4 h-4 text-[#E8480A]" />}
              <span className="text-white text-xs font-black uppercase tracking-widest" style={{ fontFamily: "'Syne', sans-serif" }}>
                {isSellPool ? "Buy Crypto · Pay with Fiat" : "Sell Crypto · Receive Fiat"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {slotsRemaining <= 3 && slotsRemaining > 0 && (
                <Badge className="bg-white/20 text-white border-0 text-xs font-bold">{slotsRemaining} left</Badge>
              )}
              {isFull && <Badge className="bg-white/20 text-white border-0 text-xs font-bold">Full</Badge>}
            </div>
          </div>

          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {tokenMetadata?.logoURI ? (
                  <Image
                    src={tokenMetadata.logoURI}
                    alt={tokenMetadata.symbol ?? "token"}
                    height={10}
                    width={10}
                    className="w-10 h-10 rounded-full border border-[#0F0D0A]/10"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-[#F5F0E8] border border-[#0F0D0A]/10 flex items-center justify-center">
                    <span className="text-xs font-black text-[#0F0D0A]/40">
                      {tokenMetadata?.symbol?.slice(0, 2) ??
                        ellipsify(tokenMint || "", 2).slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                )}
                <div>
                  <p className="font-black text-xl text-[#0F0D0A] leading-tight" style={{ fontFamily: "'Syne', sans-serif" }}>
                    {tokenMetadata?.symbol || ellipsify(tokenMint || "")}
                  </p>
                  <p className="text-xs text-[#0F0D0A]/40 font-medium mt-0.5">
                    LP · {ellipsify(account.maker.toString())}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black text-[#0F0D0A] leading-none" style={{ fontFamily: "'Syne', sans-serif" }}>
                  {pricePerToken.toLocaleString()}
                </p>
                <p className="text-xs text-[#0F0D0A]/40 font-bold uppercase tracking-wider mt-0.5" style={{ fontFamily: "'Syne', sans-serif" }}>
                  {currency} / token
                </p>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-3 gap-2.5">
              {[
                { label: "Available", value: availableAmount.toLocaleString(undefined, { maximumFractionDigits: 4 }) },
                { label: "Currency", value: currency },
                { label: "Slots", value: `${slotsRemaining}/10`, warn: slotsRemaining <= 3 },
              ].map(({ label, value, warn }) => (
                <div key={label} className="rounded-xl bg-[#F5F0E8] px-3 py-3 text-center">
                  <p className="text-[10px] font-black text-[#0F0D0A]/40 uppercase tracking-widest" style={{ fontFamily: "'Syne', sans-serif" }}>
                    {label}
                  </p>
                  <p className={`text-sm font-black mt-1 ${warn ? "text-[#E8480A]" : "text-[#0F0D0A]"}`} style={{ fontFamily: "'Syne', sans-serif" }}>
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Reserve form or full state ── */}
        {!isFull ? (
          <div className="rounded-2xl border-2 border-[#0F0D0A]/10 bg-white p-5 space-y-4">
            <h3 className="text-base font-black text-[#0F0D0A]" style={{ fontFamily: "'Syne', sans-serif" }}>
              {isSellPool ? "Buy tokens from this pool" : "Sell your tokens to this pool"}
            </h3>

            {/* Amount */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-[#0F0D0A]/40 uppercase tracking-widest block" style={{ fontFamily: "'Syne', sans-serif" }}>
                Amount ({tokenMetadata?.symbol || "tokens"})
              </label>
              <div className="relative">
                <Input
                  type="number"
                  min={0}
                  step="any"
                  placeholder={`Max ${availableAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })}`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="border-2 border-[#0F0D0A]/10 focus:border-[#E8480A] bg-[#F5F0E8] text-[#0F0D0A] font-bold pr-16 h-11 rounded-xl"
                />
                <button
                  type="button"
                  onClick={() => setAmount(availableAmount.toLocaleString("en-US", { maximumFractionDigits: 9, useGrouping: false }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-[#E8480A] hover:opacity-70 transition-opacity"
                  style={{ fontFamily: "'Syne', sans-serif" }}
                >
                  MAX
                </button>
              </div>
              {fiatTotal > 0 && (
                <div className="flex items-center gap-1.5 pt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <p className="text-xs text-[#0F0D0A]/55 font-semibold">
                    {isSellPool
                      ? `You'll pay approximately ${formatCurrency(fiatTotal, currency)}`
                      : `You'll receive approximately ${formatCurrency(fiatTotal, currency)}`}
                  </p>
                </div>
              )}
            </div>

            {/* BUY POOL: info box only */}
            {isSellPool && (
              <div className="rounded-xl bg-[#F5F0E8] border border-[#0F0D0A]/8 p-3.5 space-y-2">
                <p className="text-[10px] font-black text-[#0F0D0A]/40 uppercase tracking-widest flex items-center gap-1.5" style={{ fontFamily: "'Syne', sans-serif" }}>
                  <Info className="w-3 h-3" /> What happens next
                </p>
                <ol className="text-xs text-[#0F0D0A]/55 space-y-1.5 list-decimal list-inside font-medium leading-relaxed">
                  <li>Your reservation is locked on-chain immediately</li>
                  <li>A payment link is generated — pay fiat securely via Flutterwave</li>
                  <li>Once payment is confirmed, tokens are released to your wallet automatically</li>
                </ol>
              </div>
            )}

            {/* SELL POOL: bank fields */}
            {!isSellPool && (
              <>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-[#0F0D0A]/40 mb-1.5 flex items-center gap-1.5" style={{ fontFamily: "'Syne', sans-serif" }}>
                    <Building2 className="w-3.5 h-3.5" /> Select Bank
                  </label>
                  <div className="relative">
                    <div
                      className="rounded-xl border-2 border-[#0F0D0A]/10 bg-[#F5F0E8] p-3 flex items-center justify-between cursor-pointer hover:border-[#0F0D0A]/30 transition-colors select-none"
                      onClick={() => setShowDropdown((v) => !v)}
                    >
                      <span className={`text-sm ${bankCode ? "text-[#0F0D0A]" : "text-[#0F0D0A]/30"}`}>
                        {bankCode
                          ? banks.find((b) => b.code === bankCode)?.name ?? "Choose bank"
                          : banksLoading ? "Loading banks…" : "Choose bank"}
                      </span>
                      <ChevronDown className={`w-4 h-4 text-[#6B6558] transition-transform ${showDropdown ? "rotate-180" : ""}`} />
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
                              onClick={() => { setBankCode(b.code); setShowDropdown(false); setBankSearch(""); }}
                              className={`w-full text-left px-4 py-2.5 text-sm hover:bg-[#F5F0E8] transition-colors border-none bg-transparent cursor-pointer ${bankCode === b.code ? "bg-[#F5F0E8] font-bold" : ""}`}
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
                  <label className="block text-xs font-black uppercase tracking-widest text-[#0F0D0A]/40 mb-1.5" style={{ fontFamily: "'Syne', sans-serif" }}>
                    Account Number
                  </label>
                  <div className="relative rounded-xl border-2 border-[#0F0D0A]/10 bg-[#F5F0E8] focus-within:border-[#E8480A] flex items-center px-3">
                    <input
                      type="text"
                      placeholder="1234567890"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      className="flex-1 bg-transparent py-3 text-sm text-[#0F0D0A] focus:outline-none placeholder:text-[#0F0D0A]/30"
                    />
                    <div className="ml-2 flex-shrink-0">
                      {verifyStatus === "loading" && <Loader2 className="w-4 h-4 animate-spin text-[#E8480A]" />}
                      {verifyStatus === "success" && <CheckCircle className="w-4 h-4 text-[#0A7B6B]" />}
                      {verifyStatus === "error" && <AlertCircle className="w-4 h-4 text-red-400" />}
                    </div>
                  </div>
                  {verifyStatus === "success" && verifiedName && (
                    <p className="text-xs text-[#0A7B6B] mt-1 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> {verifiedName}
                    </p>
                  )}
                  {verifyStatus === "error" && (
                    <p className="text-xs text-red-400 mt-1">Could not verify account. Check details.</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-[#0F0D0A]/40 mb-1.5" style={{ fontFamily: "'Syne', sans-serif" }}>
                    Beneficiary Name
                  </label>
                  <div className="rounded-xl border-2 border-[#0F0D0A]/10 bg-[#F5F0E8] focus-within:border-[#E8480A]">
                    <input
                      type="text"
                      placeholder="Auto-filled on verification"
                      value={beneficiaryName}
                      onChange={(e) => setBeneficiaryName(e.target.value)}
                      className="w-full bg-transparent px-3 py-3 text-sm text-[#0F0D0A] focus:outline-none placeholder:text-[#0F0D0A]/30"
                    />
                  </div>
                </div>

                <div className="rounded-xl bg-[#F5F0E8] border border-[#0F0D0A]/8 p-3.5 space-y-2">
                  <p className="text-[10px] font-black text-[#0F0D0A]/40 uppercase tracking-widest flex items-center gap-1.5" style={{ fontFamily: "'Syne', sans-serif" }}>
                    <Info className="w-3 h-3" /> What happens next
                  </p>
                  <ol className="text-xs text-[#0F0D0A]/55 space-y-1.5 list-decimal list-inside font-medium leading-relaxed">
                    <li>Your tokens move into escrow on-chain</li>
                    <li>LP sends fiat to your bank account</li>
                    <li>Validators confirm payment — escrow releases automatically</li>
                  </ol>
                </div>

                {verifyStatus !== "success" && accountNumber && bankCode && (
                  <p className="text-xs text-center text-[#C8C2B4]">
                    Waiting for account verification before you can submit
                  </p>
                )}
              </>
            )}

            <Button
              onClick={handleReserve}
              disabled={
                reserving ||
                (!isSellPool && verifyStatus !== "success") ||
                !parsedAmount ||
                parsedAmount <= 0
              }
              className="w-full bg-[#E8480A] hover:bg-[#E8480A]/90 disabled:opacity-60 text-white font-black text-sm h-12 rounded-xl transition-all duration-200 flex items-center justify-center gap-2"
              style={{ fontFamily: "'Syne', sans-serif" }}
            >
              {reserving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Confirming on-chain...</>
              ) : !publicKey ? (
                <><Wallet className="w-4 h-4" /> Connect Wallet to Continue</>
              ) : isSellPool ? (
                <><Zap className="w-4 h-4" /> Get Payment Link <ArrowRight className="w-4 h-4" /></>
              ) : (
                <><Zap className="w-4 h-4" /> Sell Tokens <ArrowRight className="w-4 h-4" /></>
              )}
            </Button>
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-[#0F0D0A]/10 bg-white p-6 text-center space-y-3">
            <Clock className="w-8 h-8 text-[#0F0D0A]/25 mx-auto" />
            <div>
              <p className="font-black text-[#0F0D0A]" style={{ fontFamily: "'Syne', sans-serif" }}>
                {poolDrained ? "Pool drained" : "All slots taken"}
              </p>
              <p className="text-sm text-[#0F0D0A]/45 mt-1">
                {poolDrained
                  ? "This pool has no remaining liquidity."
                  : "All 10 slots are active. Slots free up when reservations complete or expire."}
              </p>
            </div>
            <Link href="/express">
              <Button variant="outline" className="border-2 border-[#0F0D0A]/15 font-bold text-[#0F0D0A] hover:border-[#0F0D0A] hover:bg-[#0F0D0A] hover:text-white transition-all mt-1">
                Find Another Pool
              </Button>
            </Link>
          </div>
        )}

        {/* Trust footer */}
        <div className="flex items-center justify-center gap-5 py-1">
          <span className="flex items-center gap-1.5 text-[11px] text-[#0F0D0A]/35 font-semibold">
            <Shield className="w-3.5 h-3.5" /> Non-custodial escrow
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-[#0F0D0A]/35 font-semibold">
            <Zap className="w-3.5 h-3.5" /> Validator consensus
          </span>
        </div>

      </div>
    </div>
  );
}