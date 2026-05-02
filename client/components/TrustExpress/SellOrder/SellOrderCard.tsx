"use client";
import { BN, ProgramAccount } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ellipsify } from "@/lib/utils";
import {
  CircleUser,
  Coins,
  Ellipsis,
  RedoDot,
  TrendingDown,
  Clock,
  Bell,
  SendToBack,
  DollarSign,
  ExternalLink,
  ShieldAlert,
  Info,
  X,
} from "lucide-react";
import { Separator } from "../../ui/seperator";
import ExplorerLink from "../../ui/explorer-link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWallet } from "@solana/wallet-adapter-react";
import useTrustExpress from "@/hooks/express/useTrustExpress";
import UpdatePriceForm from "../BuyOrder/PriceUpdate";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useTokenMetadata } from "@/hooks/useTokenMetadata";
import TokenDisplay from "../../ui/token-display";
import type { BalanceData } from "@/hooks/express/useTrustExpressBalance";
import CopyPoolLinkButton from "../ReservePool/CopyPoolLinkButton";
import type { AiIntent } from "@/app/(dashboard)/express/page";

interface ReservationData {
  taker: PublicKey;
  amount: BN;
  fiatAmount: BN;
  timestamp: BN;
  status: number;
}

interface Props {
  data: ProgramAccount<{
    seed: BN;
    maker: PublicKey;
    mint: PublicKey;
    currency: number[];
    escrowType: number;
    amount: BN;
    pricePerToken: BN;
    paymentInstructions: string;
    reservedAmounts: Array<ReservationData>;
    bump: number;
    createdAt?: BN;
    feePercentage?: number;
    reservedFee?: BN;
  }>;
  /** Pre-fetched by the parent grid — no RPC calls needed inside the card */
  balanceData: BalanceData | null;
  /**
   * LP view: hides the isTaker reservation banner and public-facing buy CTA
   * so LPs only see their own order management controls.
   */
  isLPView?: boolean;
  /** Passed from the dashboard when the AI triggers a reduce / updatePrice intent */
  aiIntent?: AiIntent;
}

const SellOrderCard: React.FC<Props> = ({ data, balanceData, isLPView = false, aiIntent }) => {
  const { publicKey } = useWallet();
  const { expressWithdraw } = useTrustExpress();
  const queryClient = useQueryClient();
  const [hasPendingReservations, setHasPendingReservations] = useState(false);
  const [newAmount, setNewAmount] = useState<string>("");
  const [hasDispute, setHasDispute] = useState(false);
  const [confirmWithdrawOpen, setConfirmWithdrawOpen] = useState(false);
  const [updatePriceOpen, setUpdatePriceOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { metadata: tokenMetadata } = useTokenMetadata(data.account.mint);

  // Destructure balance from prop — zero extra RPC calls
  const vaultBalance     = balanceData?.totalBalance    ?? null;
  const availableBalance = balanceData?.availableBalance ?? null;
  const lockedBalance    = balanceData?.lockedBalance    ?? null;
  const reservedFee      = balanceData?.reservedFee      ?? null;

  const isValidTrustExpress = useMemo(
    () => data?.account?.escrowType === 0,
    [data]
  );

  const isSameWallet = useMemo(
    () => !!publicKey && data.account.maker.equals(publicKey),
    [publicKey, data.account.maker]
  );

  const isTaker = useMemo(
    () =>
      !!publicKey &&
      data.account.reservedAmounts.some(
        (r: ReservationData) =>
          r.taker.equals(publicKey) &&
          (r.status === 0 || r.status === 1)
      ),
    [publicKey, data.account.reservedAmounts]
  );

  const currencyStr = useMemo(
    () => String.fromCharCode(...data.account.currency).trim(),
    [data.account.currency]
  );

  const pricePerToken = useMemo(
    () => data.account.pricePerToken.toString(),
    [data.account.pricePerToken]
  );

  const handleExpressWithdraw = useCallback(async () => {
    if (isSubmitting) return;

    const parsedAmount = parseFloat(newAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error("Please enter a valid withdrawal amount.");
      return;
    }
    if (availableBalance === null) {
      toast.error("Available balance is unavailable.");
      return;
    }
    if (parsedAmount > availableBalance) {
      toast.error(`Withdrawal (${parsedAmount}) exceeds available (${availableBalance}).`);
      return;
    }

    setIsSubmitting(true);
    try {
      toast.loading("Processing withdrawal...");
      await expressWithdraw.mutateAsync({
        trustExpress: data.publicKey,
        withdrawAmount: parsedAmount,
      });
      toast.dismiss();
      toast.success("Withdrawal successful");
      queryClient.invalidateQueries({ queryKey: ["get-trust-express-accounts"] });
      setNewAmount("");
      setConfirmWithdrawOpen(false);
    } catch (error) {
      toast.dismiss();
      toast.error("Failed to withdraw tokens");
      console.error("Error withdrawing tokens:", error);
    } finally {
      setIsSubmitting(false);
    }
  }, [newAmount, availableBalance, expressWithdraw, data.publicKey, queryClient, isSubmitting]);

  const handleHalfWithdraw = useCallback(() => {
    if (availableBalance !== null) {
      setNewAmount((Math.floor((availableBalance / 2) * 100) / 100).toString());
    }
  }, [availableBalance]);

  const handleMaxWithdraw = useCallback(() => {
    if (availableBalance !== null) {
      setNewAmount(availableBalance.toString());
    }
  }, [availableBalance]);

  const handlePriceUpdateSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["get-trust-express-accounts"] });
    toast.success("Price updated successfully");
  };

  useEffect(() => {
    const newValue =
      data.account.reservedAmounts.filter(
        (r: ReservationData) => r.status === 0 || r.status === 1
      ).length > 0;
    setHasPendingReservations((prev) => (prev === newValue ? prev : newValue));
  }, [data.account.reservedAmounts]);

  useEffect(() => {
    const newValue =
      data.account.reservedAmounts.filter(
        (r: ReservationData) => r.status === 4
      ).length > 0;
    setHasDispute((prev) => (prev === newValue ? prev : newValue));
  }, [data.account.reservedAmounts]);

  // Auto-open the correct dialog when the AI targeted this card.
  // Store the desired intent in a ref so we can fire it once availableBalance loads.
  const pendingAiDialog = React.useRef<"reduce" | "updatePrice" | null>(null);

  useEffect(() => {
    if (!aiIntent?.orderAddress) return;
    const truncatedPda =
      data.publicKey.toString().slice(0, 4) + "…" + data.publicKey.toString().slice(-4);
    if (aiIntent.orderAddress !== truncatedPda) return;

    if (aiIntent.type === "reduce") {
      if (aiIntent.reduceBy) setNewAmount(String(aiIntent.reduceBy));
      // Open immediately if balance is loaded, otherwise defer
      if (availableBalance !== null) {
        setConfirmWithdrawOpen(true);
      } else {
        pendingAiDialog.current = "reduce";
      }
    }
    if (aiIntent.type === "updatePrice") {
      setUpdatePriceOpen(true);
    }
  }, [aiIntent, data.publicKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fire the deferred dialog open once availableBalance arrives
  useEffect(() => {
    if (pendingAiDialog.current !== "reduce") return;
    if (availableBalance === null) return;
    pendingAiDialog.current = null;
    setConfirmWithdrawOpen(true);
  }, [availableBalance]);

  const getCardBorderClass = () => {
    if (isTaker) return "border-[#F5A623]";
    if (isSameWallet) return "border-[#E8480A]";
    return "";
  };

  if (!isValidTrustExpress) return null;

  return (
    <Card className={`group cursor-pointer bg-[#F5F0E8] border-2 ${getCardBorderClass()} hover:shadow-md transition-all duration-200 overflow-hidden`}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between bg-[#0F0D0A] px-4 py-3 -mx-6 -mt-6 mb-2">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-3.5 h-3.5 text-[#E8480A] group-hover:animate-bounce" />
            <span className="text-xs font-bold uppercase tracking-[0.1em] text-white" style={{ fontFamily: "'Syne', sans-serif" }}>Sell Order</span>
            {isSameWallet && (
              <Badge variant="outline" className="ml-2 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300">
                You are the Seller
              </Badge>
            )}
            {isTaker && !isLPView && (
              <Badge variant="outline" className="ml-2 bg-[#F5A623] text-white text-[10px] font-bold uppercase tracking-wider border-0">
                <Link href="/express/dashboard?tab=pending-reservations">
                  You have a Reservation
                </Link>
              </Badge>
            )}
            {isSameWallet && hasPendingReservations && (
              <div className="relative ml-2 flex items-center">
                <Link href="/express/dashboard?tab=pending-confirmations" className="flex items-center">
                  <Bell className="h-5 w-5 text-amber-500 animate-pulse cursor-pointer" />
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
                    {data.account.reservedAmounts.filter((r: ReservationData) => r.status === 0 || r.status === 1).length}
                  </span>
                </Link>
              </div>
            )}
            {isSameWallet && hasDispute && (
              <div className="relative ml-2 flex items-center">
                <Link href="/express/dashboard?tab=pending-confirmations" className="flex items-center">
                  <ShieldAlert className="h-5 w-5 text-red-500 animate-pulse cursor-pointer" />
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
                    {data.account.reservedAmounts.filter((r: ReservationData) => r.status === 4).length}
                  </span>
                </Link>
              </div>
            )}
          </div>

          {isSameWallet && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="secondary" className="h-6 w-6 p-0">
                  <span className="sr-only">Open menu</span>
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-[#F5F0E8] border-2 border-[#0F0D0A] text-[#0F0D0A] rounded-md">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-[#6B6558] font-bold">Seller Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />

                <AlertDialog open={confirmWithdrawOpen} onOpenChange={setConfirmWithdrawOpen}>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-orange-500">
                      <X className="w-4 h-4 mr-2" />
                      Withdraw Tokens
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="bg-[#F5F0E8] border-2 border-[#0F0D0A]">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-[#0F0D0A] font-bold uppercase tracking-wide" style={{ fontFamily: "'Syne', sans-serif" }}>Withdraw Tokens</AlertDialogTitle>
                      <AlertDialogDescription className="text-[#6B6558]">
                        Withdraw available tokens from your sell order. Reserved tokens cannot be withdrawn.
                      </AlertDialogDescription>
                    </AlertDialogHeader>

                    <div className="mt-4 w-full p-3 border-2 border-[#EDEAE2] rounded bg-[#F5F0E8] text-[#0F0D0A]">
                      <div className="flex justify-between font-medium">
                        <span>Available to withdraw:</span>
                        <span className="text-[#0A7B6B] font-bold">
                          <TokenDisplay
                            amount={
                              availableBalance !== null && reservedFee !== null
                                ? Math.max(0, availableBalance - reservedFee)
                                : 0
                            }
                            symbol={tokenMetadata?.symbol}
                            logoURI={tokenMetadata?.logoURI}
                          />
                        </span>
                      </div>
                      {hasPendingReservations && (
                        <div className="flex justify-between text-[#F5A623] mt-1">
                          <span>Reserved by buyers:</span>
                          <span>
                            <TokenDisplay
                              amount={lockedBalance}
                              symbol={tokenMetadata?.symbol}
                              logoURI={tokenMetadata?.logoURI}
                            />
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-4 mt-4">
                      <Button variant="outline" onClick={handleHalfWithdraw} disabled={!availableBalance || availableBalance <= 0}>
                        Half
                      </Button>
                      <Button variant="outline" onClick={handleMaxWithdraw} disabled={!availableBalance || availableBalance <= 0}>
                        Max
                      </Button>
                    </div>

                    <input
                      type="number"
                      value={newAmount}
                      onChange={(e) => setNewAmount(e.target.value)}
                      placeholder="Enter withdrawal amount"
                      className="mt-4 w-full p-2 border-2 rounded text-[#0F0D0A] bg-[#F5F0E8] border-[#C8C2B4] placeholder-[#C8C2B4]"
                      disabled={!availableBalance || availableBalance <= 0}
                    />

                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <Button
                        onClick={handleExpressWithdraw}
                        className={`text-xs font-bold uppercase tracking-wider text-white border-0 ${
                          isSubmitting || !newAmount.trim() || !availableBalance || availableBalance <= 0
                            ? "bg-[#C8C2B4] cursor-not-allowed"
                            : "bg-[#E8480A] hover:bg-[#CC3300]"
                        }`}
                        style={{ fontFamily: "'Syne', sans-serif" }}
                        disabled={isSubmitting || !newAmount.trim() || !availableBalance || availableBalance <= 0}
                      >
                        {isSubmitting ? "Processing..." : "Withdraw Tokens"}
                      </Button>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <AlertDialog open={updatePriceOpen} onOpenChange={setUpdatePriceOpen}>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="hover:bg-[#F5F0E8]">
                      <DollarSign className="w-3.5 h-3.5 mr-2 text-[#0A7B6B]" />
                      Update Token Price
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Update Token Price</AlertDialogTitle>
                      <AlertDialogDescription>
                        Set a new price per token. Current price: {pricePerToken} {currencyStr}.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="py-4">
                      <UpdatePriceForm
                        trustExpress={data.publicKey.toString()}
                        currentPrice={pricePerToken}
                        currency={currencyStr}
                        onSuccess={handlePriceUpdateSuccess}
                      />
                    </div>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                {hasPendingReservations && (
                  <DropdownMenuItem>
                    <Link href="/express/dashboard?tab=pending-reservations" className="flex items-center">
                      <SendToBack className="w-4 h-4 mr-2" />
                      Manage Reservations
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <CopyPoolLinkButton trustExpressPubkey={data.publicKey.toString()} variant="icon" />
                </DropdownMenuItem>

              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </CardTitle>

        <CardDescription className="space-y-2 flex justify-between">
          <div>
            <span className="block">
              <span className="text-[#6B6558]">Seed:</span>
              <span className="text-primary/70 ml-2">{ellipsify(data.account.seed.toString())}</span>
            </span>
            <span className="flex items-center">
              <span className="text-[#6B6558]">pda:</span>
              <ExplorerLink type="address" value={data.publicKey.toString()}>
                <span className="text-primary/70 text-sm ml-2 flex items-center">
                  {ellipsify(data.publicKey.toString(), 4)}
                  <ExternalLink className="h-3 w-3 ml-1" />
                </span>
              </ExplorerLink>
            </span>
          </div>
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <Separator />
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <CircleUser className="w-4 h-4" />
            Seller:
          </div>
          <ExplorerLink type="address" value={data.account.maker.toString()}>
            <Avatar>
              <AvatarFallback>{ellipsify(data.account.maker.toString(), 1)}</AvatarFallback>
            </Avatar>
          </ExplorerLink>
        </div>
        <Separator />

        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <RedoDot className="w-4 h-4" />
            Token Address:
          </div>
          <ExplorerLink type="address" value={data.account.mint.toString()}>
            <span className="text-primary/70 text-sm flex items-center">
              {ellipsify(data.account.mint.toString(), 4)}
              <ExternalLink className="h-3 w-3 ml-1" />
            </span>
          </ExplorerLink>
        </div>

        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Coins className="w-3.5 h-3.5 text-[#0A7B6B]" />
            <span className="text-[#6B6558]">Available to Buy</span>
          </div>
          <span className="text-[#0A7B6B] font-bold">
            <TokenDisplay
              amount={availableBalance}
              symbol={tokenMetadata?.symbol}
              logoURI={tokenMetadata?.logoURI}
            />
          </span>
        </div>

        {isSameWallet && hasPendingReservations && vaultBalance !== null && availableBalance !== null && (
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              Reserved by Buyers:
            </div>
            <span className="text-[#F5A623] font-bold">
              <TokenDisplay
                amount={lockedBalance}
                symbol={tokenMetadata?.symbol}
                logoURI={tokenMetadata?.logoURI}
              />
            </span>
          </div>
        )}

        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <DollarSign className="w-3.5 h-3.5 text-[#0A7B6B]" />
            <span className="text-xs font-bold uppercase tracking-wider text-[#6B6558]" style={{ fontFamily: "'Syne', sans-serif" }}>Price / Token</span>
          </div>
          <span className="text-lg font-extrabold text-[#0F0D0A]" style={{ fontFamily: "'Syne', sans-serif" }}>{pricePerToken} <span className="text-[#E8480A]">{currencyStr}</span></span>
        </div>

        {isTaker && !isLPView ? (
          <div className="flex flex-col gap-2">
            <Link href="/express/dashboard?tab=pending-reservations">
              <div className="text-center text-sm p-2 bg-amber-100 dark:bg-amber-900 rounded-md cursor-pointer hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors">
                You have a pending reservation for this order
              </div>
            </Link>
          </div>
        ) : isSameWallet ? (
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span>Est. Settlement Fee:</span>
              <div className="relative inline-block">
                <Info className="w-3 h-3 text-gray-400 cursor-help hover:text-gray-300 peer" />
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 p-2 bg-[#0F0D0A] text-white text-xs rounded opacity-0 invisible peer-hover:opacity-100 peer-hover:visible transition-all duration-200 z-10 pointer-events-none">
                  Protocol fee charged per trade at settlement. Not deducted upfront.
                </div>
              </div>
            </div>
            <span className="text-blue-600 dark:text-blue-400 font-medium">
              <TokenDisplay
                amount={(
                  (availableBalance ?? 0) * ((data.account.feePercentage ?? 5) / 10000)
                ).toFixed(3)}
                symbol={tokenMetadata?.symbol}
                logoURI={tokenMetadata?.logoURI}
              />
            </span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default SellOrderCard;