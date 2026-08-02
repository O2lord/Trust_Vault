"use client";
import React, { useCallback, useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { 
  ExtendedExpressBuyOrderSchema, 
  ExtendedExpressBuyOrderSchemaType 
} from "@/schemas/express/express_buy_order_schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import useTrustExpress from "@/hooks/express/useTrustExpress";
import { ChevronDown, ChevronUp, Coins, DollarSign, InfoIcon, Loader2, ShoppingCart, Shield, Plus, AlertCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { TokenSelect } from "../../ui/select";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, PublicKey } from "@solana/web3.js";
import { z } from 'zod';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import TokenDisplay from "../../ui/token-display";
import { useTokenMetadata } from "@/hooks/useTokenMetadata";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/react-select";
import { Badge } from "@/components/ui/badge";
import bs58 from 'bs58';
import dynamic from 'next/dynamic';
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { parseAnchorError } from "@/lib/parseAnchorError";
import useBuyerFlutterwaveCredentials from "@/hooks/useBuyerFlutterwaveCredentials"; // ✅ NEW IMPORT
import type { OrderPrefill } from "@/components/TrustExpress/Chat/ActionCard";



const BuyerFlutterwaveCredentialManager = dynamic(
  () => import('@/components/BuyerFlutterwaveCredentialManager'),
  { 
    ssr: false,
    loading: () => (
      <Card className="bg-[#F5F0E8] border-2 border-[#0F0D0A]">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-green-500" />
            Buyer Payment Processor Credentials
          </CardTitle>
          <CardDescription className="text-gray-400">
            Loading...
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }
);

type TokenInfo = {
  mint: string;
  balance: number;
};

type Props = {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  prefill?: OrderPrefill;
  onSuccess?: () => void;
};

interface Credential {
  id: string;
  label: string | null;
  created_at: string;
  is_active: boolean;
}

const CreateExpressBuyDialog: React.FC<Props> = ({ trigger, open: controlledOpen, onOpenChange, prefill, onSuccess }) => {
  const queryClient = useQueryClient();
  const [internalOpen, setInternalOpen] = useState(false);
  
  // Use controlled open if provided, otherwise use internal state
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;
  
  const { createBuyOrder, useGlobalFeePercentage } = useTrustExpress();
  const { publicKey, signMessage } = useWallet();
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [selectedToken, setSelectedToken] = useState<string | null>(null);
  const [feeAmount, setFeeAmount] = useState<number>(0);
  const [paymentInstructionsOpen, setPaymentInstructionsOpen] = useState(false);
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [showCredentialManager, setShowCredentialManager] = useState(false);
  const [txStep, setTxStep] = useState<0 | 1 | 2>(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const allowedMints = process.env.NEXT_PUBLIC_ALLOWED_MINTS?.split(",") || [];
  const tokenMetadata = useTokenMetadata(selectedToken || "");
  
  // ✅ USE THE NEW BUYER CREDENTIALS HOOK
  const { 
    credentials, 
    loading: loadingCredentials, 
    fetchCredentials,
    linkToBuyOrder 
  } = useBuyerFlutterwaveCredentials();
  
  // Fetch global fee percentage from the program
  const { data: globalFeePercentageBasisPoints, isLoading: feeLoading } = useGlobalFeePercentage();
  
  // Convert basis points to percentage (e.g., 5 basis points = 0.05%)
  const FEE_PERCENTAGE = globalFeePercentageBasisPoints ? globalFeePercentageBasisPoints / 100 : 0.05;
  const MIN_FEE = 0.001;
  const MAX_FEE_PERCENTAGE = 1;

  const form = useForm<ExtendedExpressBuyOrderSchemaType>({
    resolver: zodResolver(ExtendedExpressBuyOrderSchema),
    defaultValues: {
      mint: "",
      deposit: 0,
      pricePerToken: 0,
      currency: "",
      paymentType: "",
      additionalInstructions: "",
      flutterwaveCredentialId: undefined,
    },
  });


  useEffect(() => {
    const depositAmount = form.watch("deposit");
    if (depositAmount > 0) {
      const calculatedFee = Math.max(depositAmount * (FEE_PERCENTAGE / 100), MIN_FEE);
      const cappedFee = Math.min(calculatedFee, depositAmount * (MAX_FEE_PERCENTAGE / 100));
      setFeeAmount(parseFloat(cappedFee.toFixed(6)));
    } else {
      setFeeAmount(0);
    }
  }, [form.watch("deposit")]);

  useEffect(() => {
    const fetchTokens = async () => {
      if (!publicKey) {
        const tokensWithZeroBalance: TokenInfo[] = allowedMints.map(mint => ({
          mint,
          balance: 0
        }));
        setTokens(tokensWithZeroBalance);
        return;
      }

      try {
        const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
        const connection = new Connection(rpcUrl);
        const { getAssociatedTokenAddress } = await import("@solana/spl-token");

        const tokenPromises = allowedMints.map(async (mint) => {
          try {
            const ata2022 = await getAssociatedTokenAddress(
              new PublicKey(mint),
              publicKey,
              false,
              new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb")
            );
            
            const accountInfo2022 = await connection.getParsedAccountInfo(ata2022);
            if (accountInfo2022.value && 'parsed' in accountInfo2022.value.data) {
              const tokenData = accountInfo2022.value.data.parsed.info;
              return {
                mint: tokenData.mint,
                balance: tokenData.tokenAmount.uiAmount || 0,
              };
            }
          } catch (token2022Error) {
            console.error(token2022Error);
          }

          try {
            const ataRegular = await getAssociatedTokenAddress(
              new PublicKey(mint),
              publicKey,
              false,
              new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
            );
            
            const accountInfoRegular = await connection.getParsedAccountInfo(ataRegular);
            if (accountInfoRegular.value && 'parsed' in accountInfoRegular.value.data) {
              const tokenData = accountInfoRegular.value.data.parsed.info;
              return {
                mint: tokenData.mint,
                balance: tokenData.tokenAmount.uiAmount || 0,
              };
            }
          } catch (splError) {
            console.error(splError);
          }

          return {
            mint,
            balance: 0,
          };
        });

        const userTokens = await Promise.all(tokenPromises);
        setTokens(userTokens);
      } catch (error) {
        console.error("Error fetching tokens:", error);
        const fallbackTokens: TokenInfo[] = allowedMints.map(mint => ({
          mint,
          balance: 0
        }));
        setTokens(fallbackTokens);
      }
    };

    fetchTokens();
  }, [publicKey]);

  // ✅ FETCH CREDENTIALS AS SOON AS WALLET CONNECTS (not gated behind dialog open)
  // This warms the cache so credentials are ready instantly when the dialog opens,
  // whether triggered by the user or by the AI chat action card.
  useEffect(() => {
    if (publicKey) {
      fetchCredentials();
    }
  }, [publicKey, fetchCredentials]);

    // ── Prefill: hydrate form + expand credentials section ──────────────────
    // countdownFired ref ensures the countdown starts ONCE per dialog open,
    // not on every re-render (e.g. when credentials finish loading).
    const countdownFired = useRef(false);

    useEffect(() => {
      if (!open || !prefill) return;

      const resolvedMint = prefill.mint ?? "";

      form.reset({
        mint: resolvedMint,
        deposit: prefill.deposit ?? 0,
        pricePerToken: prefill.pricePerToken ?? 0,
        currency: prefill.currency ?? "",
        paymentType: prefill.paymentType ?? "",
        additionalInstructions: "",
        flutterwaveCredentialId: undefined,
      });

      if (resolvedMint) setSelectedToken(resolvedMint);

      // Open the credentials section so the user can see it's pre-filled
      setCredentialsOpen(true);

      // Only start the countdown once — not after tx1 completes and dialog re-renders
      if (!countdownFired.current) {
        countdownFired.current = true;
        setCountdown(7);
      }
    }, [open, prefill]);

    // ── Countdown timer: auto-submits at 0 ──────────────────────────────────
    useEffect(() => {
      if (countdown === null) return;
      if (countdown === 0) {
        form.handleSubmit(onSubmit)();
        setCountdown(null);
        return;
      }
      const t = setTimeout(() => setCountdown((c) => (c !== null ? c - 1 : null)), 1000);
      return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [countdown]);

    // Reset countdown + fired flag when dialog closes
    useEffect(() => {
      if (!open) {
        setCountdown(null);
        countdownFired.current = false;
      }
    }, [open]);

    // ── Auto-select first active Flutterwave credential ───────────────────────
    useEffect(() => {
      if (!open || !prefill) return;
      if (credentials.length === 0) return;                       // not loaded yet
      if (form.getValues("flutterwaveCredentialId")) return;      // already set

      const firstActive = credentials.find((c) => c.is_active);
      if (firstActive) {
        form.setValue("flutterwaveCredentialId", firstActive.id);
      }
    }, [open, prefill, credentials]);


  const onSubmit = useCallback(
    async (values: ExtendedExpressBuyOrderSchemaType) => {
      if (!publicKey || !signMessage) {
        toast.error("Please connect your wallet.");
        return;
      }

      if (!selectedToken) {
        toast.error("Please select a token.");
        return;
      }

      // ✅ PRODUCTION: Require Flutterwave credentials - NO FALLBACK
      if (!values.flutterwaveCredentialId) {
        toast.error(
          "Flutterwave Credentials Required",
          {
            description: "You must connect your Flutterwave account before creating buy orders. Platform credential fallbacks have been removed for security.",
            duration: 7000,
            action: {
              label: "Setup Credentials",
              onClick: () => {
                setCredentialsOpen(true);
              }
            }
          }
        );
        return;
      }

      // ✅ PRODUCTION: Validate the selected credential is active
      const selectedCred = credentials.find(c => c.id === values.flutterwaveCredentialId);
      if (selectedCred && !selectedCred.is_active) {
        toast.error(
          "Inactive Credentials",
          {
            description: "The selected Flutterwave credential is inactive. Please activate it or choose another credential.",
            duration: 5000,
          }
        );
        return;
      }

      try {
        const paymentInstructions = {
          paymentType: values.paymentType,
          additionalInstructions: values.additionalInstructions || ""
        };

        const trustExpressData = {
          mint_a: values.mint,
          amount: values.deposit,
          pricePerToken: values.pricePerToken,
          currency: values.currency,
          paymentInstructions: JSON.stringify(paymentInstructions),
          flutterwaveCredentialId: values.flutterwaveCredentialId,
        };

        setTxStep(1);
        const solanaResult = await createBuyOrder.mutateAsync(trustExpressData);

        // ✅ NEW: Link credential to buy order in database
        if (values.flutterwaveCredentialId && solanaResult?.trustExpressPubkey) {
          setTxStep(2);
          try {
            await linkToBuyOrder(
              solanaResult.trustExpressPubkey, 
              values.flutterwaveCredentialId
            );
          } catch (linkError) {
            console.warn("⚠️ Failed to link credential, but order was created:", linkError);
          }
        }

        setTxStep(0);
        toast.success("Buy order created successfully!");
        form.reset();
        queryClient.invalidateQueries({ queryKey: ["get-trustExpress-accounts"] });
        queryClient.invalidateQueries({ queryKey: ["get-trust-express-accounts"] });
        queryClient.invalidateQueries({ queryKey: ["get-buy-orders"] });
        onSuccess?.();
        setOpen(false);
      } catch (error) {
        setTxStep(0);
        console.error("Error creating buy order:", error);
        
        // Parse the error and show user-friendly message
        const parsedError = parseAnchorError(error);
        
        // ✅ PRODUCTION: Show specific error for credential issues
        if (parsedError.message?.includes('credential') || 
            parsedError.message?.includes('Flutterwave') ||
            parsedError.message?.includes('BuyOrdersPaused')) {
          toast.error(
            "Cannot Create Buy Order",
            {
              description: parsedError.message + "\n\nIf this is a credential issue, please verify your Flutterwave account is active and has the necessary permissions.",
              duration: 7000,
            }
          );
        } else {
          toast.error(parsedError.title, {
            description: parsedError.message,
            duration: 5000,
          });
        }
      }
    },
    [form, createBuyOrder, queryClient, selectedToken, publicKey, signMessage, credentials, linkToBuyOrder, setCredentialsOpen, setOpen]
  );


  const a_to_b_amount = (amount: number) => {
    form.setValue("deposit", amount);
  };

  const effectiveDeposit = form.watch("deposit") - feeAmount;
  const isSubmitting = createBuyOrder.isPending || txStep > 0;
  const selectedCredentialId = form.watch("flutterwaveCredentialId");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-[#F5F0E8] border-2 border-[#0F0D0A]">
        <DialogHeader className="relative">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <div className="bg-[#0A7B6B] p-2.5 rounded">
                <ShoppingCart className="w-8 h-8 text-white" />
              </div>
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-[#0F0D0A] uppercase tracking-wide">
                Create a new Buy Order
              </DialogTitle>
              <DialogDescription className="text-[rgba(15,13,10,0.5)]">
                This will create a new buy order for you to trade tokens.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
            
            {countdown !== null && (
              <div style={{
                background: "#E8480A",
                borderRadius: 8,
                padding: "10px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}>
                <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>
                  ⚡ Auto-signing in {countdown}s — review the details below
                </span>
                <button
                  type="button"
                  onClick={() => setCountdown(null)}
                  style={{
                    background: "rgba(255,255,255,0.2)",
                    border: "none",
                    borderRadius: 6,
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "4px 10px",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
            
            {/* Section 1: Token Selection */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[#6B6558]">
                <Coins className="w-4 h-4 text-[#0A7B6B]"/>
                <span className="text-xs font-bold uppercase tracking-wider">Select Token To Buy</span>
              </div>
              <FormItem>
                <FormControl>
                  <div className="relative flex min-h-[100px] flex-col space-y-3 rounded-lg border-2 border-[#C8C2B4] p-4 focus-within:border-[#0F0D0A] bg-[#F5F0E8]">
                    <div className="flex flex-1 items-center space-x-2">
                      <div className="group/select flex items-center justify-between">
                        <TokenSelect
                          value={form.watch("mint")}
                          tokens={tokens}
                          onTokenChange={(token) => {
                            if (token && token.mint) {
                              setSelectedToken(token.mint);
                              form.setValue("mint", token.mint);
                              a_to_b_amount(0);
                            } else {
                              setSelectedToken(null);
                              form.setValue("mint", "");
                              a_to_b_amount(0);
                            }
                          }}
                          onMaxClick={(balance) => a_to_b_amount(balance)}
                          onHalfClick={(balance) => a_to_b_amount(balance / 2)}
                          ringColorClass="ring-blue-500"
                        />
                      </div>
                      <span className="flex-1 text-right">
                        <div className="flex h-full flex-col text-right">
                          <input
                            inputMode="decimal"
                            autoComplete="off"
                            name="fromValue"
                            data-lpignore="true"
                            placeholder={form.watch("deposit") === 0 ? "0.00" : String(form.watch("deposit"))}
                            className="h-full w-full bg-transparent text-right placeholder:text-[#C8C2B4] text-2xl outline-none font-semibold text-[#0F0D0A]"
                            type="number"
                            value={form.watch("deposit") === 0 ? "" : form.watch("deposit")}
                            onChange={(e) => {
                              const newValue = e.target.value === "" ? 0 : Number(e.target.value);
                              a_to_b_amount(newValue);
                            }}
                          />
                        </div>
                      </span>
                    </div>
                  </div>
                </FormControl>
              </FormItem>
            </div>

            {/* Section 2: Price Section */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[#6B6558]">
                  <DollarSign className="w-4 h-4 text-[#0A7B6B]"/>
                  <span className="text-xs font-bold uppercase tracking-wider">Price Per Token</span>
                </div>
                <FormItem>
                  <FormControl>
                    <div className="relative rounded-lg border-2 border-[#C8C2B4] p-4 bg-[#F5F0E8] focus-within:border-[#0F0D0A]">
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0"
                        className="w-full bg-transparent text-[#0F0D0A] text-lg outline-none placeholder:text-[#C8C2B4]"
                        {...form.register("pricePerToken", { valueAsNumber: true })}
                      />
                      <div className="text-xs text-[#6B6558] mt-1">Set your desired price per token</div>
                    </div>
                  </FormControl>
                </FormItem>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[#6B6558]">
                  <span className="w-4 h-4 text-purple-400">💱</span>
                  <span className="text-xs font-bold uppercase tracking-wider">Currency</span>
                </div>
                <FormItem>
                  <FormControl>
                    <div className="relative rounded-lg border-2 border-[#C8C2B4] p-4 bg-[#F5F0E8] focus-within:border-[#0F0D0A]">
                      <input
                        type="text"
                        maxLength={3}
                        placeholder=""
                        className="w-full bg-transparent text-[#0F0D0A] text-lg outline-none placeholder:text-[#C8C2B4]"
                        {...form.register("currency")}
                      />
                      <div className="text-xs text-[#6B6558] mt-1">3-letter code (e.g. NGN, USD)</div>
                    </div>
                  </FormControl>
                </FormItem>
              </div>
            </div>

            {/* Section 3: Payment Processor Credentials */}
            <div className="border-2 border-[#C8C2B4] rounded-lg p-4 space-y-3 bg-[#F5F0E8]">
              <div 
                className="flex justify-between items-center cursor-pointer hover:bg-[#F5F0E8] rounded p-2 -m-2"
                onClick={() => setCredentialsOpen(!credentialsOpen)}
              >
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-[#0A7B6B]" />
                  <h3 className="text-sm font-bold text-[#0F0D0A] uppercase tracking-wide">Payment Processor</h3>
                  <Badge variant="destructive" className="text-xs">Required</Badge>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="w-4 h-4 text-[rgba(15,13,10,0.4)] cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs bg-[#F5F0E8] border-2 border-[#0F0D0A] text-[#0F0D0A]">
                        <p className="text-sm">
                          You must connect your own payment processor account to process payments. 
                          Platform credential fallbacks have been removed for security and compliance.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Button variant="ghost" size="icon" type="button" className="text-[#6B6558] hover:text-[#0F0D0A]">
                  {credentialsOpen ? 
                    <ChevronUp className="h-5 w-5" /> : 
                    <ChevronDown className="h-5 w-5" />
                  }
                </Button>
              </div>
              
              {credentialsOpen && (
                <div className="pt-2 space-y-4 animate-in fade-in duration-200">
                  {!publicKey ? (
                    <div className="text-sm text-[#0F0D0A] p-3 bg-[#F5F0E8] rounded border border-[#F5A623]">
                      ⚠️ Connect your wallet to manage Payment Processor credentials
                    </div>
                  ) : loadingCredentials ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-6 w-6 animate-spin text-[#0A7B6B]" />
                      <span className="ml-2 text-[#6B6558]">Loading credentials...</span>
                    </div>
                  ) : credentials.length === 0 ? (
                    <div className="space-y-3">
                      <div className="flex items-start gap-2 p-3 rounded-lg border-l-4 border-[#F5A623] bg-[#F5F0E8]">
                        <AlertCircle className="w-4 h-4 text-[#F5A623] flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-[#0F0D0A]">
                          <p className="font-medium mb-1">No Payment Processor credentials configured</p>
                          <p className="text-[#6B6558]">
                            You need to connect your payment processor account before creating buy orders. 
                            Click &quot;Add New Credential&quot; below to get started.
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        onClick={() => setShowCredentialManager(true)}
                        variant="outline"
                        className="w-full"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add New Credential
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <FormItem>
                        <FormLabel className="text-[#0F0D0A]">Select Payment Processor Account</FormLabel>
                        <Select
                          value={selectedCredentialId}
                          onValueChange={(value) => {
                            form.setValue("flutterwaveCredentialId", value);
                          }}
                        >
                          <SelectTrigger className="bg-[#F5F0E8] border-2 border-[#C8C2B4] text-[#0F0D0A]">
                            <SelectValue placeholder="Choose a credential" />
                          </SelectTrigger>
                          <SelectContent className="bg-[#F5F0E8] border-[#C8C2B4]">
                            {credentials.map((cred) => (
                              <SelectItem key={cred.id} value={cred.id} className="text-[#0F0D0A]">
                                <div className="flex items-center gap-2">
                                  <span>{cred.label || 'Unnamed Credential'}</span>
                                  {cred.is_active ? (
                                    <Badge className="text-xs bg-[#0A7B6B]">Active</Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-xs">Inactive</Badge>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription className="text-[rgba(15,13,10,0.5)] text-xs">
                          Select which Payment Processor account to use for processing seller payouts. 
                          Your credentials are encrypted and never shared.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>

                      <Button
                        type="button"
                        onClick={() => setShowCredentialManager(true)}
                        variant="outline"
                        size="sm"
                        className="w-full"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add New Account
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Section 5: Fee Display Section */}
            {form.watch("deposit") > 0 && (
              <div className="border-2 border-[#C8C2B4] rounded-lg p-4 space-y-3 bg-[#F5F0E8]">
                <h3 className="text-sm font-bold text-[#0F0D0A] uppercase tracking-wide border-b-2 border-[#EDEAE2] pb-2">Earned Fee</h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-medium text-[#0F0D0A]">Earned Fee ({FEE_PERCENTAGE}%)</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <InfoIcon className="h-4 w-4 text-[rgba(15,13,10,0.4)]" />
                          </TooltipTrigger>
                          <TooltipContent className="bg-gray-700 border-gray-600">
                            <p className="w-[250px] text-xs text-[rgba(15,13,10,0.7)]">
                              A {FEE_PERCENTAGE}% fee is earned on all successful trust express trades, with a minimum fee of {MIN_FEE} tokens.
                              This fee is distributed to liquidity providers.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <TokenDisplay
                      amount={feeAmount.toFixed(2)}
                      symbol={tokenMetadata?.metadata?.symbol}
                      logoURI={tokenMetadata?.metadata?.logoURI}
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-[#0F0D0A]">Effective Deposit</span>
                    <TokenDisplay
                      amount={effectiveDeposit.toFixed(2)}
                      symbol={tokenMetadata?.metadata?.symbol}
                      logoURI={tokenMetadata?.metadata?.logoURI}
                    />
                  </div>
                </div>
              </div>
            )}

            <FormMessage />
          </form>
        </Form>
        <DialogFooter className="bg-[#F5F0E8]">
          <DialogClose asChild>
            <Button
              variant="secondary"
              type="button"
              onClick={() => form.reset()}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </DialogClose>
          <Button
            onClick={form.handleSubmit(onSubmit)}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {txStep === 1
                  ? "Approve in wallet (1/2)..."
                  : txStep === 2
                  ? "Approve in wallet (2/2)..."
                  : "Creating..."}
              </>
            ) : (
              "Buy Tokens"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Credential Manager Modal */}
      
{showCredentialManager && (
  <Dialog open={showCredentialManager} onOpenChange={setShowCredentialManager}>
    <DialogContent className="bg-[#F5F0E8] border-2 border-[#0F0D0A] max-w-2xl">
      <DialogHeader>
        <DialogTitle className="text-[#0F0D0A] font-bold uppercase tracking-wide">Manage Buy-Order Payment Processor Credentials</DialogTitle>
      </DialogHeader>
      <BuyerFlutterwaveCredentialManager />
    </DialogContent>
  </Dialog>
)}

    </Dialog>
  );
};

export default CreateExpressBuyDialog;