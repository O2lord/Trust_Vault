"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useQueryClient } from "@tanstack/react-query";
import { PublicKey } from "@solana/web3.js";
import { Loader2, MinusCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import useTrustExpress from "@/hooks/express/useTrustExpress";
import { useQuery } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderAddress?: string;  // truncated PDA e.g. "EWkT…jQr7"
  orderType?: "buy" | "sell";
  token?: string;
  reduceBy?: number;      // pre-filled from AI
}

const BRAND = {
  orange: "#E8480A",
  black: "#0F0D0A",
  cream: "#F5F0E8",
  border: "#E8E2D8",
  gray: "#6B6558",
  lightGray: "#C8C2B4",
} as const;

export default function ReduceOrderDialog({
  open,
  onOpenChange,
  orderAddress,
  orderType = "buy",
  token = "USDC",
  reduceBy,
}: Props): JSX.Element {
  const { publicKey } = useWallet();
  const queryClient = useQueryClient();
  const { program, cancelOrReduceBuyOrder, expressWithdraw, getMintInfo } =
    useTrustExpress();

  const [amount, setAmount] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availableBalance, setAvailableBalance] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  // ── Fetch all accounts (shared cache with LP dashboard) ───────────────────
  const { data: allAccounts } = useQuery({
    queryKey: ["get-trustExpress-accounts"],
    queryFn: () => program.account.trustExpress.all(),
    enabled: !!program && !!publicKey && open,
    staleTime: 60_000,
  });

  // ── Find target account by matching the truncated PDA ─────────────────────
  const targetAccount = allAccounts?.find((a) => {
    if (!orderAddress) return false;
    const pda = a.publicKey.toString();
    const truncated = pda.slice(0, 4) + "…" + pda.slice(-4);
    return truncated === orderAddress;
  });

  // ── Derive available balance ───────────────────────────────────────────────
  useEffect(() => {
    if (!targetAccount) return;
    const fetchBalance = async () => {
      try {
        const mintInfo = await getMintInfo(
          new PublicKey(targetAccount.account.mint)
        );
        const decimals = mintInfo.decimals;
        const total =
          targetAccount.account.amount.toNumber() / Math.pow(10, decimals);

        const reserved = (targetAccount.account.reservedAmounts ?? [])
          .filter(
            (r: { status: number }) =>
              r.status === 0 || r.status === 1 || r.status === 4
          )
          .reduce(
            (sum: number, r: { amount: { toString: () => string } }) =>
              sum +
              parseInt(r.amount.toString(), 10) / Math.pow(10, decimals),
            0
          );

        setAvailableBalance(Math.max(0, total - reserved));
      } catch (e) {
        console.error("ReduceOrderDialog: could not derive balance", e);
      }
    };
    fetchBalance();
  }, [targetAccount, getMintInfo]);

  // ── Prefill + start countdown when dialog opens with AI data ──────────────
  // Mirrors the exact pattern in CreateExpressBuyDialog
  useEffect(() => {
    if (!open || !reduceBy) return;
    setAmount(String(reduceBy));
    setCountdown(10); // 10-second countdown before auto-submit
  }, [open, reduceBy]);

  // ── Countdown ticker — auto-submits at 0 ──────────────────────────────────
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      handleSubmit();
      setCountdown(null);
      return;
    }
    const t = setTimeout(
      () => setCountdown((c) => (c !== null ? c - 1 : null)),
      1000
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown]);

  // ── Reset on close ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      setAmount("");
      setIsSubmitting(false);
      setCountdown(null);
    }
  }, [open]);

  // ── Quick-fill buttons ────────────────────────────────────────────────────
  const handleMax = () => {
    if (availableBalance !== null) {
      setAmount(String(availableBalance));
      setCountdown(null); // user is manually editing — stop countdown
    }
  };
  const handleHalf = () => {
    if (availableBalance !== null) {
      setAmount(String(Math.floor((availableBalance / 2) * 100) / 100));
      setCountdown(null);
    }
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!targetAccount || isSubmitting) return;

    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
      toast.error("Enter a valid amount.");
      return;
    }
    if (availableBalance !== null && parsed > availableBalance) {
      toast.error(
        `Amount exceeds available balance (${availableBalance} ${token}).`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      if (orderType === "buy") {
        const mintInfo = await getMintInfo(
          new PublicKey(targetAccount.account.mint)
        );
        const totalDecimal =
          targetAccount.account.amount.toNumber() /
          Math.pow(10, mintInfo.decimals);
        const newAmount =
          parsed >= totalDecimal ? 0 : totalDecimal - parsed;
        toast.loading("Reducing buy order…");
        await cancelOrReduceBuyOrder.mutateAsync({
          trustExpress: targetAccount.publicKey,
          newAmount,
        });
      } else {
        toast.loading("Withdrawing from sell order…");
        await expressWithdraw.mutateAsync({
          trustExpress: targetAccount.publicKey,
          withdrawAmount: parsed,
        });
      }

      toast.dismiss();
      toast.success(
        parsed >= (availableBalance ?? 0)
          ? "Order closed successfully."
          : "Order reduced successfully."
      );
      queryClient.invalidateQueries({
        queryKey: ["get-trustExpress-accounts"],
      });
      queryClient.invalidateQueries({
        queryKey: ["get-trust-express-accounts"],
      });
      onOpenChange(false);
    } catch (err) {
      toast.dismiss();
      toast.error("Transaction failed. Please try again.");
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    targetAccount,
    amount,
    availableBalance,
    orderType,
    token,
    cancelOrReduceBuyOrder,
    expressWithdraw,
    getMintInfo,
    queryClient,
    onOpenChange,
    isSubmitting,
  ]);

  const isFullClose =
    availableBalance !== null && parseFloat(amount) >= availableBalance;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-[#F5F0E8] border-2 border-[#0F0D0A]"
        style={{ fontFamily: "'Syne', sans-serif" }}
      >
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div
              style={{
                background: "#f59e0b20",
                borderRadius: 8,
                padding: 8,
                display: "flex",
                alignItems: "center",
              }}
            >
              <MinusCircle size={20} color="#f59e0b" />
            </div>
            <div>
              <DialogTitle
                className="text-[#0F0D0A] font-bold uppercase tracking-wide"
                style={{ fontFamily: "'Syne', sans-serif" }}
              >
                {orderType === "buy"
                  ? "Reduce Buy Order"
                  : "Withdraw from Sell Order"}
              </DialogTitle>
              <DialogDescription className="text-[#6B6558]">
                {orderAddress && (
                  <span className="font-mono text-xs">{orderAddress}</span>
                )}
                {" · "}
                {availableBalance !== null
                  ? `${availableBalance} ${token} available`
                  : "Loading balance…"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Countdown banner — only shown when AI pre-filled and timer is running */}
        {countdown !== null && (
          <div
            style={{
              background: "#fff3e0",
              border: "1.5px solid #f59e0b",
              borderRadius: 8,
              padding: "10px 14px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 13,
              fontWeight: 700,
              color: "#92400e",
            }}
          >
            <span>
              Auto-submitting in{" "}
              <span style={{ fontSize: 18, color: "#f59e0b" }}>
                {countdown}
              </span>
              s…
            </span>
            <button
              onClick={() => setCountdown(null)}
              style={{
                background: "none",
                border: "1.5px solid #f59e0b",
                borderRadius: 6,
                padding: "3px 10px",
                cursor: "pointer",
                color: "#92400e",
                fontWeight: 800,
                fontSize: 12,
              }}
            >
              Stop
            </button>
          </div>
        )}

        {/* Available balance pill */}
        {availableBalance !== null && (
          <div
            style={{
              background: "#fff",
              border: `1.5px solid ${BRAND.border}`,
              borderRadius: 8,
              padding: "10px 14px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 13, color: BRAND.gray }}>
              Available to withdraw
            </span>
            <span
              style={{ fontSize: 14, fontWeight: 800, color: "#0A7B6B" }}
            >
              {availableBalance} {token}
            </span>
          </div>
        )}

        {/* Half / Max buttons */}
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleHalf}
            disabled={availableBalance === null}
            className="border-[#C8C2B4] text-[#0F0D0A] text-xs font-bold uppercase tracking-wider hover:border-[#0F0D0A]"
            style={{ fontFamily: "'Syne', sans-serif" }}
          >
            Half
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleMax}
            disabled={availableBalance === null}
            className="border-[#C8C2B4] text-[#0F0D0A] text-xs font-bold uppercase tracking-wider hover:border-[#0F0D0A]"
            style={{ fontFamily: "'Syne', sans-serif" }}
          >
            Max (close order)
          </Button>
        </div>

        {/* Amount input */}
        <input
          type="number"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setCountdown(null); // user is editing — cancel auto-submit
          }}
          placeholder={`Amount in ${token}`}
          className="w-full p-3 border-2 rounded-lg text-[#0F0D0A] bg-[#F5F0E8] border-[#C8C2B4] placeholder-[#C8C2B4] text-lg font-semibold outline-none focus:border-[#0F0D0A]"
          disabled={isSubmitting}
        />

        {/* Close warning */}
        {isFullClose && (
          <div
            style={{
              background: "#fff3e0",
              border: "1.5px solid #f59e0b",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 12,
              color: "#92400e",
              fontWeight: 600,
            }}
          >
            ⚠️ This will fully close the order and return all tokens to your
            wallet.
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button
              variant="secondary"
              type="button"
              disabled={isSubmitting}
              onClick={() => setCountdown(null)}
              className="text-xs font-bold uppercase tracking-wider"
              style={{ fontFamily: "'Syne', sans-serif" }}
            >
              Cancel
            </Button>
          </DialogClose>
          <Button
            onClick={handleSubmit}
            disabled={
              isSubmitting || !amount.trim() || availableBalance === null
            }
            className={`text-xs font-bold uppercase tracking-wider text-white border-0 ${
              isSubmitting || !amount.trim()
                ? "bg-[#C8C2B4] cursor-not-allowed"
                : isFullClose
                ? "bg-red-600 hover:bg-red-700"
                : "bg-[#f59e0b] hover:bg-[#d97706]"
            }`}
            style={{ fontFamily: "'Syne', sans-serif" }}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Approve in wallet…
              </>
            ) : isFullClose ? (
              "Close Order"
            ) : (
              "Withdraw Tokens"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}