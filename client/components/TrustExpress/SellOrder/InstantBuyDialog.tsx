// InstantBuyDialog.tsx
"use client";
import React, { useCallback, useState, useEffect, useMemo, useRef } from "react";
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
  FormMessage,
} from "@/components/ui/form";
import { useForm, Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import useTrustExpress from "@/hooks/express/useTrustExpress";
import { 
  ShoppingCart, 
  DollarSign, 
  InfoIcon, 
  Loader2, 
  CreditCard, 
  ChevronDown, 
  ArrowLeft, 
  Link as LinkIcon,
  CheckCircle, 
  TrendingDown,
  Wallet
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { PublicKey } from "@solana/web3.js";
import { z } from 'zod';
import { BN } from '@coral-xyz/anchor';
import { Connection } from '@solana/web3.js';
import { useWallet } from "@solana/wallet-adapter-react";
import { PaymentLinkDisplay } from '@/components/TrustExpress/SellOrder/PaymentLinkDisplay';
import { supabase } from '@/lib/client';
import { generatePayoutReference } from '../../../../discord-bot/lib/payout-reference';

const InstantBuySchema = z.object({
  currency: z.string().length(3, "Currency must be exactly 3 characters"),
  tokenAmount: z.coerce.number().positive("Token amount must be positive"),
  // Payment mode is always "0" (Payment Link) - no need for user selection
});

type InstantBuySchemaType = z.infer<typeof InstantBuySchema>;

type Props = {
  trigger?: React.ReactNode;
  paymentLinkData?: {
    trustExpressAddress: string;
    transactionSignature: string;
    tokenAmount: string;
    currency: string;
  } | null;
  autoOpen?: boolean;
  onAutoOpenComplete?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};


type AccountData = {
  publicKey: PublicKey;
  account: {
    seed: BN;
    maker: PublicKey;
    mint: PublicKey;
    currency: number[]; 
    escrowType: number; 
    feePercentage: number; 
    feeDestination: PublicKey;
    reservedFee: BN; 
    amount: BN; 
    pricePerToken: BN; 
    paymentInstructions: string;
    reservedAmounts: {
      taker: PublicKey;
      amount: BN; 
      fiatAmount: BN; 
      timestamp: BN; 
      sellerInstructions: string | null; 
      status: number; 
      disputeReason: string | null; 
      disputeId: string | null; 
      payoutDetails: string | null; 
      payoutReference: string | null;
    }[];
    bump: number; 
  };
};

const InstantBuyDialog: React.FC<Props> = ({ 
  trigger, 
  paymentLinkData = null,
  autoOpen = false,
  onAutoOpenComplete,
  open: controlledOpen,
  onOpenChange
}) => {
  const queryClient = useQueryClient();
  const [internalOpen, setInternalOpen] = useState(false);
  
  // Use controlled open if provided, otherwise use internal state
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;
  
  const [showCurrencySelector, setShowCurrencySelector] = useState(true);
  const { instantSellReserve, getTrustExpressAccounts, getMintInfo } = useTrustExpress();
  const [availableAccounts, setAvailableAccounts] = useState<AccountData[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<AccountData | null>(null); 
  const [selectedLPAccount, setSelectedLPAccount] = useState<AccountData | null>(null); 
  const [tokenDecimals, setTokenDecimals] = useState<number>(9); 
  const [loading, setLoading] = useState(false);
  // Payment mode is always "0" (Payment Link) - removed state
  const [selectedCurrency, setSelectedCurrency] = useState<string>("");
  const fetchedCurrenciesRef = useRef<Set<string>>(new Set());
  const { publicKey } = useWallet();
  const [showAvailableRates, setShowAvailableRates] = useState(false);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [subscriptionId, setSubscriptionId] = useState<number | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'detecting' | 'processing' | 'generating_receipt' | 'completed'>('idle');
  const [isGeneratingReceipt, setIsGeneratingReceipt] = useState(false);
  const [showPaymentLink, setShowPaymentLink] = useState(false);
  const [paymentLinkUrl, setPaymentLinkUrl] = useState<string | null>(null);
  const currentLP = selectedLPAccount || selectedAccount;
  const [showPaymentLinkDisplay, setShowPaymentLinkDisplay] = useState(false);
  const [currentPayoutReference, setCurrentPayoutReference] = useState<string | null>(null);
  const [isPaymentLinkDisplayed, setIsPaymentLinkDisplayed] = useState(false);
const [isSubmittingBuy, setIsSubmittingBuy] = useState(false);
  const [transactionSignature, setTransactionSignature] = useState<string | null>(null);
   
  const currencyToCountryMap = useMemo(() => ({
    'NGN': 'NG',
    'GHS': 'GH', 
    'KES': 'KE',
    'UGX': 'UG',
    'TZS': 'TZ',
    'ZAR': 'ZA',
  }), []);

  const availableCurrencies = useMemo(() => [
    { code: "USD", symbol: "$" },
    { code: "NGN", symbol: "₦" },
    { code: "KES", symbol: "KSh" },
    { code: "GHS", symbol: "₵" },
    { code: "ZAR", symbol: "R" },
  ], []);

  const defaultValues = useMemo(() => ({
    currency: "",
    tokenAmount: 0,
    // paymentMode always "0" (Payment Link) - no need for field
  }), []);

  const form = useForm<InstantBuySchemaType>({
    resolver: zodResolver(InstantBuySchema) as Resolver<InstantBuySchemaType>,
    defaultValues,
  });

  const tokenAmount = form.watch("tokenAmount");

  useEffect(() => {
    if (!showCurrencySelector && selectedCurrency) {
      const interval = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: ["get-trust-express-accounts"] });
      }, 30000);
      
      return () => clearInterval(interval);
    }
  }, [showCurrencySelector, selectedCurrency, queryClient]);

  const calculatedFiatAmount = useMemo(() => {
    if (!currentLP || !tokenAmount || tokenAmount <= 0) return 0;
    
    const pricePerToken = currentLP.account.pricePerToken ? 
      Number(currentLP.account.pricePerToken.toString()) : 0;
    
    if (pricePerToken === 0) return 0;
    
    return tokenAmount * pricePerToken;
  }, [currentLP, tokenAmount]);

  const getTokenSymbol = useCallback(() => {
    return "USDC";
  }, []);

  const startTransactionMonitoring = useCallback((trustExpressAddress: string) => {
    const connection = new Connection(
      process.env.NEXT_PUBLIC_RPC_URL || 'https://api.devnet.solana.com'
    );

    const trustExpressPubkey = new PublicKey(trustExpressAddress);
    setPaymentStatus('detecting');
    
    
    
    let pollCount = 0;
    const maxPolls = 90;
    let pollIntervalId: NodeJS.Timeout | null = null;
    let hasDetectedTransaction = false;
    let pollingStartTime: string | null = null;
    
    const pollForReceipt = async () => {
      try {
        if (!pollingStartTime) return false;

        
        
        const response = await fetch(
          `/api/receipts/by-transaction?trustExpressAddress=${trustExpressAddress}&since=${pollingStartTime}`
        );
        
        if (!response.ok) {
          console.error('[Polling] API returned error status:', response.status);
          return false;
        }

        const data = await response.json();

        if (data && data.id) {
          
          
          setTimeout(() => {
            setPaymentStatus('completed');
            setIsGeneratingReceipt(false);
            setReceiptId(data.id);
            setShowReceipt(true);
            toast.success("Purchase completed! View your receipt.");
          }, 1500);
        
          if (subscriptionId !== null) {
            connection.removeAccountChangeListener(subscriptionId);
            setSubscriptionId(null);
          }
          
          if (pollIntervalId) {
            clearInterval(pollIntervalId);
          }
          
          return true;
        }
        
        return false;
      } catch (error) {
        console.error('[Polling] Failed to fetch receipt:', error);
        return false;
      }
    };
    
    const subId = connection.onAccountChange(
      trustExpressPubkey,
      async (accountInfo, context) => {
        if (hasDetectedTransaction) return;

        
        hasDetectedTransaction = true;
        
        pollingStartTime = new Date().toISOString();
        
        
        setPaymentStatus('processing');
        
        await queryClient.invalidateQueries({
          queryKey: ["get-trust-express-accounts"],
        });
        
        toast.info("Payment detected! Processing...");
        
        setPaymentStatus('generating_receipt');
        setIsGeneratingReceipt(true);

        setTimeout(() => {
          pollCount = 0;
          
          pollIntervalId = setInterval(async () => {
            pollCount++;
            
            if (pollCount >= maxPolls) {
              
              if (pollIntervalId) clearInterval(pollIntervalId);
              setPaymentStatus('idle');
              setIsGeneratingReceipt(false);
              toast.info("Transaction is taking longer than expected. Check your receipts page.");
              setTimeout(() => setOpen(false), 2000);
              return;
            }
            
            const found = await pollForReceipt();
            
            if (found && pollIntervalId) {
              clearInterval(pollIntervalId);
            }
          }, 3000);
        }, 8000);
      },
      'confirmed'
    );

    setSubscriptionId(subId);
    
    return () => {
      if (pollIntervalId) clearInterval(pollIntervalId);
      if (subId !== null) connection.removeAccountChangeListener(subId);
      setPaymentStatus('idle');
    };
  }, [queryClient, subscriptionId]);

  useEffect(() => {
    if (!selectedCurrency || showCurrencySelector) return;
    if (!getTrustExpressAccounts.data) return;
    if (fetchedCurrenciesRef.current.has(selectedCurrency)) return;
    
    const fetchAccountsForCurrency = async () => {
      setLoading(true);
      fetchedCurrenciesRef.current.add(selectedCurrency);
      
      try {
        const allAccounts = getTrustExpressAccounts.data;
        
        const trustExpressAccounts = allAccounts.filter((account: AccountData) => {
          const currencyStr = String.fromCharCode(...account.account.currency).trim();
          const hasAmount = account.account.amount && Number(account.account.amount.toString()) > 0;
          const hasCapacity = account.account.reservedAmounts.length < 10;
          return (
            account.account.escrowType === 0 && 
            currencyStr === selectedCurrency &&
            hasAmount &&
            hasCapacity
          );
        });

        if (trustExpressAccounts.length === 0) {
          const allLPsForCurrency = allAccounts.filter((account: AccountData) => {
            const currencyStr = String.fromCharCode(...account.account.currency).trim();
            const hasAmount = account.account.amount && Number(account.account.amount.toString()) > 0;
            
            return (
              account.account.escrowType === 0 && 
              currencyStr === selectedCurrency &&
              hasAmount
            );
          });
          
          if (allLPsForCurrency.length > 0) {
            toast.error(`All sellers for ${selectedCurrency} are currently at capacity. Please try again in a few minutes.`);
          } else {
            toast.error(`No sellers available for ${selectedCurrency}`);
          }
          setShowCurrencySelector(true);
          return;
        }

        const sortedAccounts = trustExpressAccounts.sort((a, b) => {
          const priceA = a.account.pricePerToken ? Number(a.account.pricePerToken.toString()) : Infinity;
          const priceB = b.account.pricePerToken ? Number(b.account.pricePerToken.toString()) : Infinity;
          return priceA - priceB;
        });

        setAvailableAccounts(sortedAccounts);
        const bestAccount = sortedAccounts[0];
        setSelectedAccount(bestAccount);
        
        if (bestAccount) {
          try {
            const mintInfo = await getMintInfo(bestAccount.account.mint);
            setTokenDecimals(mintInfo.decimals);
          } catch (error) {
            console.warn("Could not fetch mint info, using default decimals:", error);
            setTokenDecimals(9);
          }
        }
        
      } catch (error) {
        console.error("Error fetching trust express accounts:", error);
        toast.error("Failed to load available sellers");
        setShowCurrencySelector(true);
        fetchedCurrenciesRef.current.delete(selectedCurrency);
      } finally {
        setLoading(false);
      }
    };

    const timeoutId = setTimeout(() => {
      fetchAccountsForCurrency();
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [selectedCurrency, showCurrencySelector, getMintInfo, getTrustExpressAccounts.data]);


    useEffect(() => {
    if (paymentLinkData && autoOpen) {
      
      
      // Open the dialog
      setOpen(true);
      
      // Pre-fill the currency and skip currency selector
      setSelectedCurrency(paymentLinkData.currency);
      form.setValue("currency", paymentLinkData.currency);
      setShowCurrencySelector(false);
      
      // Pre-fill token amount
      form.setValue("tokenAmount", parseFloat(paymentLinkData.tokenAmount));
      
      // Clear the auto-open flag
      if (onAutoOpenComplete) {
        onAutoOpenComplete();
      }
    }
  }, [paymentLinkData, autoOpen, onAutoOpenComplete, form]);


    useEffect(() => {
    if (!paymentLinkData?.trustExpressAddress) return;
    if (!availableAccounts.length) return;
    if (selectedAccount) return; // Already selected

    // Find the account matching the payment link
    const matchingAccount = availableAccounts.find(
      acc => acc.publicKey.toString() === paymentLinkData.trustExpressAddress
    );

    if (matchingAccount) {
      setSelectedAccount(matchingAccount);
      setSelectedLPAccount(matchingAccount);
    } else {
      console.warn("Trust Express account from payment link not found in available accounts");
    }
  }, [paymentLinkData, availableAccounts, selectedAccount]);


const handleAlreadyProcessedError = useCallback(
  async (trustExpressAddress: PublicKey, tokenAmount: number) => {
    
    let attempts = 0;
    const maxAttempts = 10; // 10 attempts * 2 seconds = 20 seconds
    
    const pollInterval = setInterval(async () => {
      attempts++;
      
      try {
        // OPTION B: Query database for payment link matching this transaction
        const { data, error } = await supabase
          .from('payment_links')
          .select('payout_reference, link_url, status')
          .eq('trust_express_address', trustExpressAddress.toString())
          .eq('buyer_address', publicKey?.toString())
          .gte('created_at', new Date(Date.now() - 60000).toISOString()) // Last 60 seconds
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error("❌ Error querying payment links:", error);
          return;
        }

        if (data) {
          clearInterval(pollInterval);
          
          // Display the found payment link
          setCurrentPayoutReference(data.payout_reference);
          setShowPaymentLinkDisplay(true);
          
          if (data.link_url) {
            setPaymentLinkUrl(data.link_url);
          }
          
          toast.success("Found your payment link!");
          return;
        }

        if (attempts >= maxAttempts) {
          console.warn("⏱️ Polling timeout - payment link not found");
          clearInterval(pollInterval);
          toast.error("Could not find your payment link. Please contact support or try again.");
        }
      } catch (error) {
        console.error("❌ Error in payment link polling:", error);
      }
    }, 2000); // Poll every 2 seconds
  },
  [publicKey]
);


const onSubmit = useCallback(
  async (values: InstantBuySchemaType) => {
        console.log('[InstantBuyDialog] onSubmit called');

    if (!currentLP) {
      toast.error("No seller selected.");
      return;
    }

    if (!publicKey) {
      toast.error("Please connect your wallet.");
      return;
    }

    if (isSubmittingBuy) {
      console.warn("⚠️ Submission already in progress, ignoring duplicate");
      return;
    }

    setIsSubmittingBuy(true);

    try {
      // Payment mode is always "0" (Payment Link)
      const paymentModeNum = 0;

      // Step 1: Create the reservation and get transaction signature
      console.log('[InstantBuyDialog] Creating reservation...');
      const result = await instantSellReserve.mutateAsync({
        trustExpress: currentLP.publicKey,
        amount: values.tokenAmount,
        paymentMode: paymentModeNum,
        buyerPayoutDetails: undefined, // Not needed for payment link
        tokenDecimals: tokenDecimals,
      });

      const signature = result.signature || null;

      if (!signature || signature === 'undefined') {
        console.error('❌ Invalid transaction signature received:', signature);
        throw new Error("Failed to get transaction signature");
      }
      console.log('[InstantBuyDialog] ✅ Got signature:', signature);

           // ✅ CRITICAL: Generate payout reference using same logic as bot
const payoutRef = result.payoutReference; // Already generated in hook
      console.log('[InstantBuyDialog] ✅ Generated payout reference:', payoutRef);

      // Store both
      setTransactionSignature(signature);
      setCurrentPayoutReference(payoutRef);

      toast.success("Reservation created successfully!");

      // Always use Payment Link Mode
      toast.info("Generating payment link...");
      
      // ✅ Show the payment link display with the signature
      setShowPaymentLinkDisplay(true);
      
      
      toast.info("Generating payment link...");
      // ✅ DON'T start monitoring here - wait for onPaymentLinkReady callback

    } catch (error) {
      console.error("❌ Error processing purchase:", error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('ReservationLimitReached')) {
        toast.error("This seller is now at capacity. Please select a different one.");
        queryClient.invalidateQueries({ queryKey: ["get-trust-express-accounts"] });
      } else if (errorMessage.includes('already being processed')) {
        toast.warning("Your order is already being processed. Please wait.");
      } else if (errorMessage.includes('Transaction timeout')) {
        toast.error("Transaction is taking longer than expected. Please check your orders page.");
      } else if (errorMessage.includes('already been processed')) {
        toast.info("Processing your previous order...");
        handleAlreadyProcessedError(currentLP.publicKey, values.tokenAmount);
      } else {
        toast.error(error instanceof Error ? error.message : "Failed to process purchase");
      }
    } finally {
      setTimeout(() => {
        setIsSubmittingBuy(false);
      }, 2000);
    }
  },
  [
    instantSellReserve, 
    currentLP, 
    queryClient, 
    startTransactionMonitoring, 
    publicKey, 
    tokenDecimals,
    isSubmittingBuy,
    handleAlreadyProcessedError
  ]
);




  const handleBackToForm = useCallback(() => {
    setShowPaymentLink(false);
    setPaymentLinkUrl(null);
  }, []);

  const handleCurrencySelect = useCallback((currency: string) => {
    setSelectedCurrency(currency);
    form.setValue("currency", currency);
    setShowCurrencySelector(false);
    
    setAvailableAccounts([]);
    setSelectedAccount(null);
    setSelectedLPAccount(null);
    
    fetchedCurrenciesRef.current.delete(currency);
  }, [form]);

  // Payment mode is always "0" (Payment Link) - no options needed

  const isSubmitting = instantSellReserve.isPending;

  const handleDialogClose = useCallback((newOpen: boolean) => {
    setOpen(newOpen);
    
    if (subscriptionId !== null) {
      const connection = new Connection(
        process.env.NEXT_PUBLIC_RPC_URL || 'https://api.devnet.solana.com'
      );
      connection.removeAccountChangeListener(subscriptionId);
      setSubscriptionId(null);
    }

    if (!newOpen) {
      form.reset(defaultValues);
      setShowCurrencySelector(true);
      setSelectedCurrency("");
      setSelectedAccount(null);
      setAvailableAccounts([]);
      setTokenDecimals(9);
      setShowPaymentLink(false);
      setPaymentLinkUrl(null);
      setSelectedLPAccount(null);
      setShowAvailableRates(false);
      setIsGeneratingReceipt(false);
      fetchedCurrenciesRef.current.clear();
    }
  }, [form, defaultValues, subscriptionId]);

  const handleCancel = useCallback(() => {
    form.reset(defaultValues);
    setShowCurrencySelector(true);
    setSelectedCurrency("");
    setSelectedAccount(null);
    setAvailableAccounts([]);
    setTokenDecimals(9);
    setShowPaymentLink(false);
    setPaymentLinkUrl(null);
    setSelectedLPAccount(null);
    setShowAvailableRates(false);
    setOpen(false);
  }, [form, defaultValues]);

  const getCurrencySymbol = useCallback((currencyCode: string) => {
    const currency = availableCurrencies.find(c => c.code === currencyCode);
    return currency?.symbol || currencyCode;
  }, [availableCurrencies]);

  const getFormattedPrice = useCallback((account: AccountData | null) => {
    if (!account || !account.account.pricePerToken) return "0";
    const price = Number(account.account.pricePerToken.toString());
    return price.toFixed(2);
  }, []);

  const getTruncatedKey = useCallback((publicKey: PublicKey) => {
    const keyStr = publicKey.toString();
    return `${keyStr.slice(0, 4)}...${keyStr.slice(-4)}`;
  }, []);

  const getAvailableAmount = useCallback((account: AccountData) => {
    if (!account.account.amount) return "0";
    const amount = Number(account.account.amount.toString());
    return (amount / Math.pow(10, tokenDecimals)).toFixed(2);
  }, [tokenDecimals]);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  }, []);

return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-[#F5F0E8] border-2 border-[#0F0D0A]">
        <DialogHeader className="relative"> 
          <div className="flex items-center space-x-3">
            <div className="relative">
              <div className="bg-[#0A7B6B] p-2.5 rounded">
                <ShoppingCart className="w-5 h-5 text-white" />
              </div>
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-[#0F0D0A] uppercase tracking-wide">
                Instant Buy
              </DialogTitle>
              <DialogDescription className="text-[#6B6558] text-sm">
                {showCurrencySelector 
                  ? "Select your preferred currency to get started"
                  : showPaymentLinkDisplay
                  ? "Your payment link is ready"
                  : showPaymentLink
                  ? "Payment link generated - share with buyer"
                  : "Purchase tokens from sellers instantly"
                }
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="relative h-[500px] overflow-hidden">
          {/* Currency Selection Layer */}
          <div className={`absolute inset-0 transition-all duration-300 ease-in-out ${
            showCurrencySelector 
              ? 'opacity-100 translate-x-0' 
              : 'opacity-0 -translate-x-4 pointer-events-none'
          }`}>
            <div className="space-y-4 h-full overflow-y-auto">
              <div className="flex items-center gap-2 text-[#6B6558]">
                <DollarSign className="w-4 h-4 text-[#0A7B6B]"/>
                <span className="text-sm font-medium">Select Currency</span>
              </div>
              
              <div className="relative rounded-lg border-2 border-[#C8C2B4] bg-[#F5F0E8] focus-within:border-[#0F0D0A]">
                <select
                  className="w-full bg-transparent border-0 p-4 text-[#0F0D0A] text-lg focus:outline-none appearance-none cursor-pointer"
                  value=""
                  onChange={(e) => e.target.value && handleCurrencySelect(e.target.value)}
                >
                  <option value="" disabled className="text-[#6B6558]">
                    Choose your currency
                  </option>
                  {availableCurrencies.map((currency) => (
                    <option 
                      key={currency.code} 
                      value={currency.code}
                      className="text-[#0F0D0A]"
                    >
                      {currency.symbol} ({currency.code})
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
              </div>

              <div className="rounded-lg border-2 border-[#0F0D0A] bg-[#F5F0E8] p-4">
                <div className="flex items-start gap-3">
                  <InfoIcon className="w-4 h-4 text-[#0A7B6B] flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-[#0F0D0A]">
                    <div className="font-medium mb-1">Best Rates Automatically Selected</div>
                    <div className="text-xs text-[#6B6558]">
                      We&apos;ll automatically find the seller with the best exchange rates for your selected currency.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Purchase Form Layer */}
          <div className={`absolute inset-0 transition-all duration-300 ease-in-out ${
            !showCurrencySelector && !showPaymentLink && !showPaymentLinkDisplay
              ? 'opacity-100 translate-x-0'
              : 'opacity-0 translate-x-4 pointer-events-none'
          }`}>
            <div className="h-full overflow-y-auto">
              {loading && (
                <div className="absolute inset-0 bg-[#F5F0E8]/90 z-10 flex items-center justify-center">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-6 h-6 animate-spin text-[#0A7B6B]" />
                    <span className="text-white">Finding best rates for {selectedCurrency}...</span>
                  </div>
                </div>
              )}
              
              <div className={`transition-opacity duration-200 ${loading ? 'opacity-30' : 'opacity-100'}`}>
                {selectedCurrency && (
                  <Form {...form}>
                    <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
                      
                      {/* Selected Currency Display */}
                      <div className="rounded-lg border-2 border-[#0A7B6B] bg-[#F5F0E8] p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-[#0A7B6B] font-semibold text-sm">Currency:</span>
                            <div className="relative">
                              <select
                                className="bg-transparent border-0 text-white font-medium focus:outline-none appearance-none cursor-pointer pr-6"
                                value={selectedCurrency}
                                onChange={(e) => e.target.value !== selectedCurrency && handleCurrencySelect(e.target.value)}
                              >
                                <option value={selectedCurrency} className="bg-gray-800 text-white">
                                  {getCurrencySymbol(selectedCurrency)} {selectedCurrency}
                                </option>
                                {availableCurrencies
                                  .filter(c => c.code !== selectedCurrency)
                                  .map((currency) => (
                                    <option 
                                      key={currency.code} 
                                      value={currency.code}
                                      className="bg-gray-800 text-white"
                                    >
                                      {currency.symbol} {currency.code}
                                    </option>
                                  ))}
                              </select>
                              <ChevronDown className="absolute right-0 top-1/2 transform -translate-y-1/2 w-3 h-3 text-[#0A7B6B] pointer-events-none" />
                            </div>
                          </div>
                        </div>
                        {currentLP && (
                          <div className="text-xs text-[#0A7B6B] mt-1">
                            Current Rate: {getFormattedPrice(currentLP)} {selectedCurrency} per token
                          </div>
                        )}
                      </div>

                      {/* Token Amount Input */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-[#6B6558]">
                          <span className="text-purple-400">🪙</span>
                          <span className="text-sm font-medium">Token Amount</span>
                        </div>
                        <FormItem>
                          <FormControl>
                            <div className="relative rounded-lg border-2 border-[#C8C2B4] p-4 bg-[#F5F0E8] focus-within:border-[#0F0D0A]">
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  placeholder="0.00"
                                  className="flex-1 bg-transparent text-[#0F0D0A] text-lg outline-none placeholder:text-[#C8C2B4]"
                                  {...form.register("tokenAmount", { 
                                    valueAsNumber: true,
                                  })}
                                />
                                <span className="text-[#6B6558] text-sm font-bold">
                                  {getTokenSymbol()}
                                </span>
                              </div>
                              <div className="text-xs text-[#6B6558] mt-1">
                                Enter the amount of tokens you want to buy
                              </div>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      </div>

                      {/* Available Sellers */}
                      {availableAccounts.length > 1 && (
                        <div className="space-y-3">
                          <button
                            type="button"
                            onClick={() => setShowAvailableRates(!showAvailableRates)}
                            className="flex items-center justify-between w-full p-3 rounded-lg border-2 border-[#C8C2B4] bg-[#F5F0E8] hover:border-[#0F0D0A] transition-colors text-left"
                          >
                            <div className="flex items-center gap-2">
                              <TrendingDown className="w-4 h-4 text-green-400"/>
                              <span className="text-[#0F0D0A] text-sm font-bold">Available Sellers</span>
                              <div className="text-xs text-[#6B6558]">({availableAccounts.length} available)</div>
                            </div>
                            <ChevronDown className={`w-4 h-4 text-[#6B6558] transition-transform ${showAvailableRates ? 'rotate-180' : ''}`} />
                          </button>
                          
                          {showAvailableRates && (
                            <div className="space-y-2 pl-4 border-l-2 border-[#C8C2B4]">
                              {availableAccounts.map((account) => {
                                const isSelected = selectedLPAccount?.publicKey.equals(account.publicKey) || 
                                                (!selectedLPAccount && selectedAccount?.publicKey.equals(account.publicKey));
                                const isBestRate = selectedAccount?.publicKey.equals(account.publicKey);
                                
                                return (
                                  <button
                                    key={account.publicKey.toString()}
                                    type="button"
                                    onClick={() => setSelectedLPAccount(account)}
                                    className={`w-full p-3 rounded-lg border text-left transition-colors ${
                                      isSelected
                                        ? "border-[#0A7B6B] bg-[#F5F0E8] text-[#0A7B6B]"
                                        : "border-[#C8C2B4] bg-[#F5F0E8] text-[#0F0D0A] hover:border-[#0F0D0A]"
                                    }`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-3">
                                        <div className="text-xs text-[#6B6558]">
                                          Seller {getTruncatedKey(account.publicKey)}
                                        </div>
                                        {isBestRate && (
                                          <div className="px-2 py-1 rounded border border-[#0A7B6B] text-[#0A7B6B] text-xs font-bold uppercase tracking-wider">
                                            Best Rate
                                          </div>
                                        )}
                                      </div>
                                      <div className="text-right">
                                        <div className="text-sm font-medium">
                                          {getFormattedPrice(account)} {selectedCurrency}
                                        </div>
                                        <div className="text-xs text-[#6B6558]">
                                          Available: {getAvailableAmount(account)} {getTokenSymbol()}
                                          <span className="ml-2">
                                            ({10 - account.account.reservedAmounts.length} slots)
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  </button>
                                );
                              })}

                              <div className="rounded-lg border border-[#C8C2B4] bg-[#F5F0E8] p-3 mt-3">
                                <div className="flex items-start gap-2">
                                  <InfoIcon className="w-4 h-4 text-[#0A7B6B] flex-shrink-0 mt-0.5" />
                                  <div className="text-xs text-[#6B6558]">
                                    Select a different seller or stick with the automatically chosen best rate. 
                                    Lower rates mean better value for your money.
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Fiat Amount Display */}
                      {calculatedFiatAmount > 0 && currentLP && (
                        <div className="rounded-lg border-2 border-[#C8C2B4] bg-[#F5F0E8] p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-[#6B6558] text-sm">You&apos;ll Pay:</div>
                            <div className="text-[#0F0D0A] font-bold text-lg">
                              {getCurrencySymbol(selectedCurrency)}{calculatedFiatAmount.toFixed(2)}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Info Section - Payment Link is always used */}
                      <div className="rounded-xl bg-blue-900/20 border border-blue-800 p-4">
                        <div className="flex items-start gap-3">
                          <InfoIcon className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                          <div className="text-sm text-blue-200">
                            <div className="font-medium mb-1">How it works</div>
                            <div className="text-xs text-blue-300">
                              A payment link is Generated. Once payment us made, tokens will be released automatically.
                            </div>
                          </div>
                        </div>
                      </div>

                      <FormMessage />
                    </form>
                  </Form>
                )}
              </div>
            </div>
          </div>

          {/* Payment Link Display Layer - MOVED OUTSIDE FORM */}
          <div className={`absolute inset-0 transition-all duration-300 ease-in-out ${
            showPaymentLinkDisplay
              ? 'opacity-100 translate-x-0'
              : 'opacity-0 translate-x-4 pointer-events-none'
          }`}>
            <div className="h-full bg-[#F5F0E8] overflow-y-auto p-4">
              {currentPayoutReference ? (
                <PaymentLinkDisplay
                  payoutReference={currentPayoutReference}
                  trustExpressAddress={currentLP?.publicKey.toString() || ''}
                  transactionSignature={transactionSignature || undefined}
                  tokenAmount={tokenAmount}
                  fiatAmount={calculatedFiatAmount}
                  currency={selectedCurrency}
                  onPaymentLinkReady={(link) => {
                    console.log('[InstantBuyDialog] 📗 Payment link ready:', link);
                    setIsPaymentLinkDisplayed(true);
                    // Now start monitoring since payment link is ready
                    if (currentLP) {
                      startTransactionMonitoring(currentLP.publicKey.toString());
                    }
                  }}
                  onPaymentComplete={() => {
                    setPaymentStatus('completed');
                    setTimeout(() => {
                      setOpen(false);
                      setShowPaymentLinkDisplay(false);
                      setCurrentPayoutReference(null);
                      form.reset(defaultValues);
                    }, 3000);
                  }}
                  onBack={() => {
                    setShowPaymentLinkDisplay(false);
                    setCurrentPayoutReference(null);
                    setTransactionSignature(null);
                  }}
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-400 mx-auto mb-3" />
                    <p className="text-[#0F0D0A] font-medium">Preparing your payment link...</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Payment Link Layer - OLD (probably not needed anymore) */}
          <div className={`absolute inset-0 transition-all duration-300 ease-in-out ${
            showPaymentLink
              ? 'opacity-100 translate-x-0'
              : 'opacity-0 translate-x-4 pointer-events-none'
          }`}>
            <div className="h-full overflow-y-auto">
              <div className="space-y-6">
                <div className="text-center space-y-4">
                  <div className="flex justify-center">
                    <div className="bg-green-500/20 p-6 rounded-xl border border-green-500">
                      <LinkIcon className="w-12 h-12 text-green-400" />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-white">
                      Payment Link Generated
                    </h3>
                    
                    {paymentStatus !== 'idle' && (
                      <div className="flex items-center justify-center text-center gap-3">
                        {paymentStatus === 'detecting' && (
                          <>
                            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                            <div className="text-sm text-blue-200">
                              <span className="font-medium">Waiting for payment...</span>
                            </div>
                          </>
                        )}
                        {paymentStatus === 'processing' && (
                          <>
                            <Loader2 className="w-5 h-5 text-orange-400 animate-spin" />
                            <div className="text-sm text-orange-200">
                              <span className="font-medium">Processing transaction...</span>
                            </div>
                          </>
                        )}
                        {paymentStatus === 'generating_receipt' && (
                          <>
                            <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
                            <div className="text-sm text-purple-200">
                              <span className="font-medium">Generating receipt...</span>
                            </div>
                          </>
                        )}
                        {paymentStatus === 'completed' && (
                          <>
                            <CheckCircle className="w-5 h-5 text-green-400" />
                            <div className="text-sm text-green-200">
                              <span className="font-medium">Purchase completed!</span>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    <div className="text-[#6B6558]">
                      <div>Amount: {tokenAmount} {getTokenSymbol()}</div>
                      <div>Cost: {getCurrencySymbol(selectedCurrency)}{calculatedFiatAmount.toFixed(2)}</div>
                    </div>
                  </div>

                  {paymentLinkUrl && (
                    <div className="rounded-xl bg-gray-800 border border-gray-600 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <LinkIcon className="w-4 h-4 text-green-400" />
                        <span className="text-sm font-medium text-[#6B6558]">Payment Link</span>
                      </div>
                      <div className="bg-gray-900 rounded-lg p-3 mb-3">
                        <p className="text-xs text-gray-400 break-all font-mono">
                          {paymentLinkUrl}
                        </p>
                      </div>
                      <Button
                        onClick={() => copyToClipboard(paymentLinkUrl)}
                        variant="outline"
                        className="w-full"
                      >
                        Copy Link
                      </Button>
                    </div>
                  )}

                  <div className="rounded-xl bg-green-900/20 border border-green-800 p-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <InfoIcon className="w-5 h-5 text-green-400 flex-shrink-0" />
                        <div className="font-medium text-sm text-green-200">Share this link</div>
                      </div>
                      <div className="text-xs text-green-300 text-left">
                        Share this payment link with the buyer. Once they complete the payment, 
                        tokens will be automatically released to their wallet.
                      </div>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    onClick={handleBackToForm}
                    className="w-full"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Edit Details
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Receipt View Layer */}
          {showReceipt && receiptId && (
            <div className="absolute inset-0 bg-[#F5F0E8]/97 z-20 flex items-center justify-center">
              <div className="bg-[#F5F0E8] rounded-lg p-6 max-w-md w-full mx-4 border-2 border-[#0F0D0A]">
                <div className="text-center space-y-4">
                  <CheckCircle className="w-16 h-16 text-green-400 mx-auto" />
                  <div>
                    <h3 className="text-xl font-bold text-[#0F0D0A] mb-2 uppercase tracking-wide">
                      Purchase Successful!
                    </h3>
                    <p className="text-[#6B6558] text-sm">
                      Your purchase has been completed successfully
                    </p>
                  </div>
                  
                  <div className="space-y-3 pt-4">
                    <Button
                      onClick={() => {
                        window.open(`/receipts/${receiptId}`, '_blank');
                      }}
                      className="w-full bg-[#0A7B6B] hover:bg-[#085E52] text-xs font-bold uppercase tracking-wider"
                    >
                      View Receipt
                    </Button>
                    
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowReceipt(false);
                        setReceiptId(null);
                        setOpen(false);
                        form.reset(defaultValues);
                        setShowCurrencySelector(true);
                        setShowPaymentLink(false);
                        setPaymentLinkUrl(null);
                      }}
                      className="w-full"
                    >
                      Close
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-3 pt-4">
          <DialogClose asChild>
            <Button
              variant={"secondary"}
              type="button"
              onClick={handleCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </DialogClose>
          {!showCurrencySelector && !showPaymentLinkDisplay && (
            <Button
              onClick={form.handleSubmit(onSubmit)}
              disabled={
                isSubmittingBuy ||  
                isSubmitting || 
                loading || 
                !currentLP || 
                tokenAmount <= 0 || 
                isGeneratingReceipt
              }
              className="bg-[#0A7B6B] hover:bg-[#085E52] text-white border-0 text-xs font-bold uppercase tracking-wider disabled:opacity-50"
            >
             {isGeneratingReceipt ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating Receipt...
                </>
              ) : isSubmittingBuy || isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  Buy {tokenAmount || 0} {getTokenSymbol()}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default InstantBuyDialog;