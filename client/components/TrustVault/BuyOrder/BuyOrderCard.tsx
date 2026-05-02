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
  RefreshCcw,
  Clock,
  FileText,
  Bell,
  RefreshCwOff,
  SendToBack,
  DollarSign,
  ExternalLink,
  ShieldAlert,
  Info
} from "lucide-react";
import { Separator } from "@/components/ui/seperator";
import ExplorerLink from "@/components/ui/explorer-link";
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
import useTrustVaultProgram from "@/hooks/useTrustVaultProgram";
import { useVaultBalance } from "@/hooks/useVaultBalance";
import UpdatePriceForm from "../Shared/PriceUpdate";
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
import { ChevronDown, ChevronUp} from "lucide-react";
import SellTokensButton from "./SellTokenButton";
import EncryptedPaymentDisplay from "@/components/TrustVault/Shared/EncryptedPaymentDisplay";
import { useTokenMetadata } from "@/hooks/useTokenMetadata";
import TokenDisplay from "@/components/ui/token-display";
import { TRUST_VAULT_TYPE_BUY_ORDER } from "@/utils/constants";
import {getMintInfo} from "@/utils/solana"
import {TrustVaultAccountData} from "@/types/trustVault";



// Type definitions for better TypeScript support
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
    trustVaultType: number;
    amount: BN;
    pricePerToken: BN;
    paymentInstructions: string;
    reservedAmounts: Array<ReservationData>;
    bump: number;
    createdAt?: BN; 
  }>;
}

interface PaymentInstructions {
  paymentType?: string;
  additionalInstructions?: string;
}

const BuyOrderCard: React.FC<Props> = ({ data }) => {
 
  const { publicKey } = useWallet();
  const { cancelOrReduceBuyOrder, program  } = useTrustVaultProgram();
  const queryClient = useQueryClient();
  const [hasPendingReservations, setHasPendingReservations] = useState(false);
  const [newAmount, setNewAmount] = useState<string>("");
  const [paymentInstructionsOpen, setPaymentInstructionsOpen] = useState(false);
  const [hasDispute, setHasDispute] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { metadata: tokenMetadata } = useTokenMetadata(data.account.mint);

  // Only call useVaultBalance when needed - memoize the call
const shouldFetchBalance = useMemo(() => {
  // For buy-order trustVaults, always fetch to show correct available amounts to potential sellers
  if (data.account.trustVaultType === TRUST_VAULT_TYPE_BUY_ORDER) {
    return true;
  }
  
  // For sell-order trustVaults, only fetch for involved parties
  return publicKey && (
    data.account.maker.equals(publicKey) || 
    data.account.reservedAmounts.some(
      (reservation: ReservationData) => reservation.taker.equals(publicKey) && (reservation.status === 0 || reservation.status === 1)
    )
  );
}, [publicKey, data.account.maker, data.account.reservedAmounts, data.account.trustVaultType]);

const { 
  totalBalance, 
  availableBalance, 
  trustVaultType 
} = useVaultBalance(
  shouldFetchBalance ? data.publicKey : undefined,
  shouldFetchBalance ? data.account.mint : undefined
);
  
  const isValidTrustVault = useMemo(() => {
    
    if (!data || !data.account) {
      return null;
    }
    
    return data.account.trustVaultType === TRUST_VAULT_TYPE_BUY_ORDER;
  }, [data]);

  const isSameWallet = useMemo(() => {
    return publicKey && data.account.maker.equals(publicKey);
  }, [publicKey, data.account.maker]);
  
  const isTaker = useMemo(() => {
    return publicKey && data.account.reservedAmounts.some(
      (reservation: ReservationData) => reservation.taker.equals(publicKey) && (reservation.status === 0 || reservation.status === 1)
    );
  }, [publicKey, data.account.reservedAmounts]);

  // Use cached balance data instead of making additional calls
  const vaultBalance = shouldFetchBalance ? totalBalance : null;

  const currencyStr = useMemo(() => {
    return String.fromCharCode(...data.account.currency).trim();
  }, [data.account.currency]);
  
  const pricePerToken = useMemo(() => {
    return data.account.pricePerToken.toString();
  }, [data.account.pricePerToken]);
  
  // Helper function to log reservation details for debugging
  const logReservationDetails = useCallback((reservations: Array<ReservationData>) => {
    if (process.env.NODE_ENV === 'development') {
     
      reservations.forEach((res: ReservationData, index: number) => {
        // Check if taker exists before trying to use it
        const takerDisplay = res.taker ? 
          res.taker.toString().substring(0, 8) + '...' : 
          'N/A';
          
       
      });
    }
  }, []);

  // Fixed calculateAvailableTokens function matching the Rust backend logic
  const calculateAvailableTokens = useCallback((vaultBalance: number | null, reservedAmounts: Array<ReservationData>) => {
    if (vaultBalance === null) return null;
    
    // Log reservation details for debugging
    if (process.env.NODE_ENV === 'development') {
      logReservationDetails(reservedAmounts);
    }
    
    // Sum up all pending (status 0), payment sent (status 1), and disputed (status 4) reservations
    // We consider all these statuses as "locked" since tokens can't be withdrawn while in these states
    let totalReserved = 0;

    // Filter to only PENDING, PAYMENT_SENT, and DISPUTED statuses
    const lockedReservations = reservedAmounts.filter((r: ReservationData) => r.status === 0 || r.status === 1 || r.status === 4);
  
    for (const reservation of lockedReservations) {
      try {
        // Parse the BN as a string and divide by 100 to handle decimal places correctly
        // This assumes the amount is stored with 2 decimal places (e.g., 200 represents 2.00 tokens)
        const amountStr = reservation.amount.toString();
        const amountNum = parseInt(amountStr, 10);
          
        // Divide by 100 to convert from the stored representation to actual token count
        totalReserved += amountNum / 100;
      } catch (error) {
        console.error("Error converting BN to number:", error);
        // Fallback to a safer conversion method
        const amountStr = reservation.amount.toString();
        totalReserved += parseInt(amountStr, 10) / 100;
      }
    }
    
    
    // Available tokens = vault balance - total reserved
    const available = vaultBalance - totalReserved;
  
    return Math.max(0, available); // Never return negative values
  }, [logReservationDetails]);
  
  // Calculate available tokens with memoization
  const availableTokens = useMemo(() => 
    calculateAvailableTokens(vaultBalance, data.account.reservedAmounts),
    [vaultBalance, data.account.reservedAmounts, calculateAvailableTokens]
  );

  // Calculate the total amount of tokens in the order
  const totalOrderAmount = useMemo(() => {
    const amountBN = data.account.amount;
    return (amountBN.toNumber() / 100).toFixed(0);
  }, [data.account.amount]);

 const yetToBeFilled = useMemo(() => {
  // For buy-order trustVaults, use availableBalance from the hook (which is totalWanted - totalReserved)
  if (trustVaultType === TRUST_VAULT_TYPE_BUY_ORDER && availableBalance !== null) {
    return availableBalance;
  }
  
  // Fallback calculation for when hook data isn't available or for sell-first trustVaults
  const med = Number(totalOrderAmount);
  return med - (totalBalance ?? 0);
}, [trustVaultType, availableBalance, totalOrderAmount, totalBalance]);


  // Reduced refresh frequency and only for essential data
  useEffect(() => {
    // Only set up refresh for users who need real-time updates
    if (!shouldFetchBalance) return;
    
    // Increase interval to reduce API calls
    const intervalId = setInterval(() => {
      // Only refresh if user is actively interacting with this trust vault
      if (document.hasFocus() && (isSameWallet || isTaker)) {
        queryClient.invalidateQueries({
          queryKey: ["get-trust-vault-accounts"],
          refetchType: 'active' // Only refetch if query is active/mounted
        });
      }
    }, 60000); 
    
    return () => clearInterval(intervalId);
  }, [queryClient, shouldFetchBalance, isSameWallet, isTaker]);

  const getUserReservationIndex = useCallback(() => {
    if (!publicKey) return -1;
    
    return data.account.reservedAmounts.findIndex(
      (reservation: ReservationData) => reservation.taker.equals(publicKey) && (reservation.status === 0 || reservation.status === 1)
    );
  }, [publicKey, data.account.reservedAmounts]);
  
  const parsePaymentInstructions = (): PaymentInstructions => {
    const paymentInstructions = data.account.paymentInstructions || '';
    
    // Handle empty instructions
    if (!paymentInstructions || paymentInstructions.trim() === '') {
      return {
        additionalInstructions: 'No payment instructions provided',
      };
    }

    try {
      // Try to parse JSON
      const parsed = JSON.parse(paymentInstructions);
      
      return {
        paymentType: parsed.paymentType || parsed.payment_type || parsed.paymentMethod || parsed.payment_method || parsed.bankName || parsed.bank_name || parsed.type || parsed.method,
        additionalInstructions: parsed.additionalInstructions || parsed.additional_instructions || parsed.instructions,
      };
      
    } catch (e) {
      // If JSON parse fails, try regex extraction
      const rawInstructions = paymentInstructions;
      
      // Try to extract fields from a malformed JSON string
      const paymentTypeMatch = rawInstructions.match(/"(?:paymentType|payment_type|paymentMethod|payment_method|bankName|bank_name|type|method)"\s*:\s*"([^"]+)"/);
      const additionalInstructionsMatch = rawInstructions.match(/"(?:additionalInstructions|additional_instructions|instructions)"\s*:\s*"([^"]+)"/);
      
      if (paymentTypeMatch || additionalInstructionsMatch) {
        return {
          paymentType: paymentTypeMatch ? paymentTypeMatch[1] : undefined,
          additionalInstructions: additionalInstructionsMatch ? additionalInstructionsMatch[1] : undefined,
        };
      }
      
      // Fallback to raw text
      return {
        additionalInstructions: rawInstructions,
      };
    }
  };

  const parsedInstructions = parsePaymentInstructions();

const handleCancelOrReduceBuyOrder = useCallback(async () => {
  if (isSubmitting) return;
  
  const parsedAmount = parseFloat(newAmount);

  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    toast.error("Please enter a valid withdrawal amount.");
    return;
  }

  if (yetToBeFilled === null) {
    toast.error("Available balance calculation is unavailable.");
    return;
  }

  // Check against available tokens (not vault balance)
  if (parsedAmount > yetToBeFilled) {
    toast.error(`Withdrawal amount (${parsedAmount}) exceeds available tokens (${yetToBeFilled}).`);
    return;
  }
  
  setIsSubmitting(true);
  
  try {
    toast.loading("Reducing buy order...");
    
    // Get mint info to determine the correct decimals
    const mintAddress = new PublicKey(data.account.mint);
    const mintInfo = await getMintInfo((mintAddress), program.provider.connection); 
    
    const currentTotalDecimal = data.account.amount.toNumber() / Math.pow(10, mintInfo.decimals);
    
    // Determine the final amount
    let finalAmount: number;
    
    if (parsedAmount >= currentTotalDecimal) {
      finalAmount = 0;
      toast.loading("Cancelling buy order...");
    } else {
      finalAmount = currentTotalDecimal - parsedAmount;
      toast.loading("Reducing buy order...");
    }
    
    // Pass the decimal amount to the mutation - let the mutation handle the scaling
    await cancelOrReduceBuyOrder.mutateAsync({ 
      trustVault: data.publicKey,
      newAmount: finalAmount, // Pass 0 for complete cancellation, otherwise the reduced amount
    });
    
    toast.dismiss();
    toast.success("Buy order reduced successfully");
    
    // Refetch data to update UI
    queryClient.invalidateQueries({
      queryKey: ["get-trustVault-accounts"],
    });
    
    setNewAmount("");
    setConfirmCancelOpen(false);
  } catch (error) {
    toast.dismiss();
    toast.error("Failed to reduce buy order");
    console.error("Error reducing buy order:", error);
  } finally {
    setIsSubmitting(false);
  }
}, [newAmount, yetToBeFilled, cancelOrReduceBuyOrder, data.publicKey, data.account.amount, queryClient, isSubmitting, getMintInfo]);


  const handleHalfRefund = useCallback(() => {
    if (yetToBeFilled !== null) {
      // Use available tokens (after reservations) instead of vault balance
      const halfBalance = Math.floor((yetToBeFilled / 2) * 100) / 100; // Round to 2 decimal places
      setNewAmount(halfBalance.toString());
    }
  }, [yetToBeFilled]);

  const handleMaxRefund = useCallback(() => {
    if (yetToBeFilled !== null) {
      // Use available tokens (after reservations) instead of vault balance
      setNewAmount(yetToBeFilled.toString());
    }
  }, [yetToBeFilled]);

  // Price update success handler
  const handlePriceUpdateSuccess = () => {
    queryClient.invalidateQueries({
      queryKey: ["get-trust-Vault-accounts"],
    });
    toast.success("Price updated successfully");
  };

  // Check for pending reservations effect
  useEffect(() => {
    // Check if there are any pending or payment sent reservations
    const activeReservations = data.account.reservedAmounts.filter(
      (reservation: ReservationData) => reservation.status === 0 || reservation.status === 1
    );
    
    const newValue = activeReservations.length > 0;
    setHasPendingReservations(prev => {
      if (prev === newValue) return prev; // Prevent unnecessary updates
      return newValue;
    });
  }, [data.account.reservedAmounts]);

  useEffect(() => {
    //check for dispute
    const activeDispute = data.account.reservedAmounts.filter(
      (reservation: ReservationData) => reservation.status === 4
    );
    const newValue = activeDispute.length > 0;
    setHasDispute(prev => {
      if (prev === newValue) return prev; // Prevent unnecessary updates
      return newValue;
    });
  }, [data.account.reservedAmounts]);

  // Get card border class based on user role
  const getCardBorderClass = () => {
    if (isTaker) {
      return "border-amber-500 dark:border-amber-600";
    } else if (isSameWallet) {
      return "border-blue-500 dark:border-blue-600";
    }
    return "";
  };
  
  // Only after all hooks are called, you can have conditional returns
  if (!isValidTrustVault) {
    return null;
  }

  return (
    <Card className={`group cursor-pointer ${getCardBorderClass()}`}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCcw className="text-primary/70 group-hover:animate-spin" />
            Trust Vault
            {isSameWallet && (
              <Badge variant="outline" className="ml-2 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300">
                You are the Buyer
              </Badge>
            )}
            {isTaker && (
              <Badge variant="outline" className="ml-2 bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300">
                <Link href="/my_vault?tab=pending-reservations">
                You have a Reservation
                </Link>
              </Badge>
            )}
           {publicKey && data.account.maker.equals(publicKey) && hasPendingReservations && (
              <div className="relative ml-2 flex items-center">
                <Link href="/my_vault?tab=pending-confirmations" className="flex items-center">
                  <Bell className="h-5 w-5 text-amber-500 animate-pulse cursor-pointer" />
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
                    {data.account.reservedAmounts.filter((r: ReservationData) => r.status === 0 || r.status === 1).length}
                  </span>
                </Link>
              </div>
            )}
            {publicKey && data.account.maker.equals(publicKey) && hasDispute && ( 
              <div className="relative ml-2 flex items-center">
                <Link href="/my_vault?tab=pending-confirmations" className="flex items-center">
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
                <Button size={"icon"} variant={"ghost"} className="h-6 w-6 p-0">
                  <span className="sr-only">Open menu</span>
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-gray-900/80 rounded-lg p-4 border border-gray-600">
                <DropdownMenuLabel>Buyer Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                
                {/* Cancel Buy Order option */}
                <AlertDialog open={confirmCancelOpen} onOpenChange={setConfirmCancelOpen}>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-red-500">
                      <RefreshCwOff className="w-4 h-4 mr-2" />
                      Reduce Buy Order
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="bg-gray-900/80 rounded-lg p-4 border border-gray-600">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-slate-100">Reduce Buy Order</AlertDialogTitle>
                      <AlertDialogDescription className="text-slate-300">
                      You can withdraw a portion of your available tokens from this buy order. This will reduce the total amount available for sellers.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    {/* Display vault balance and available balance */}
                    <div className="mt-4 w-full p-2 border rounded text-slate-100 bg-slate-700 border-slate-600 placeholder-slate-400 focus:border-slate-500 focus:ring-slate-500">
                      <div className="flex justify-between font-medium">
                        <span>Available to reduce:</span>
                        <span className="text-green-600 dark:text-green-400">
                          <TokenDisplay 
                          amount={yetToBeFilled} 
                          symbol={tokenMetadata?.symbol} 
                          logoURI={tokenMetadata?.logoURI}
                        />
                        </span>
                      </div>
                      {hasPendingReservations && (
                        <div className="flex justify-between text-amber-600 dark:text-amber-400">
                          <span>orders filled by sellers:</span>
                          <span>
                            <TokenDisplay 
                              amount={vaultBalance !== null && availableTokens !== null ? 
                                  `${vaultBalance - availableTokens} ` : "Loading..."}
                              symbol={tokenMetadata?.symbol} 
                              logoURI={tokenMetadata?.logoURI}
                            />
                            
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Half and Max buttons */}
                    <div className="flex gap-4 mt-4">
                      <Button 
                        variant="outline" 
                        onClick={handleHalfRefund}
                        disabled={yetToBeFilled === null || yetToBeFilled <= 0}
                      >
                        Half
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={handleMaxRefund}
                        disabled={yetToBeFilled === null || yetToBeFilled <= 0}
                      >
                        Max
                      </Button>
                    </div>

                    <input
                      type="number"
                      value={newAmount}
                      onChange={(e) => setNewAmount(e.target.value)}
                      placeholder="Enter withdrawal amount"
                      className="mt-4 w-full p-2 border rounded text-slate-100 bg-slate-700 border-slate-600 placeholder-slate-400 focus:border-slate-500 focus:ring-slate-500"
                      disabled={yetToBeFilled === null || yetToBeFilled <= 0}
                    />

                    <AlertDialogFooter>
                      <AlertDialogCancel>No, keep it</AlertDialogCancel>
                      <Button 
                        onClick={handleCancelOrReduceBuyOrder} 
                        className={`border border-transparent rounded-md shadow-sm text-sm font-medium text-white 
                          ${
                          isSubmitting || newAmount.trim() === "" || yetToBeFilled === null || yetToBeFilled <= 0
                            ? "bg-slate-600  cursor-not-allowed" 
                            : "bg-red-600 hover:bg-red-700"
                        }`}
                        disabled={isSubmitting || newAmount.trim() === "" || yetToBeFilled === null || yetToBeFilled <= 0}
                      >
                        {isSubmitting ? "Processing..." : "Yes, cancel order"}
                      </Button>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                
                 {/* Price Update AlertDialog */}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                        <DollarSign className="w-4 h-4 mr-2 text-green-400"  />
                        Update Token Price
                      </DropdownMenuItem>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Update Token Price</AlertDialogTitle>
                        <AlertDialogDescription>
                          Set a new price per token for your vault. Current price is {pricePerToken} {currencyStr}.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
  
                      <div className="py-4">
                        <UpdatePriceForm 
                          trustVault={data.publicKey.toString()} 
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
                    <Link href="/my_vault?tab=pending-reservations" className="flex items-center">
                      <SendToBack className="w-4 h-4 mr-2" />
                      Manage Reservations
                    </Link>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </CardTitle>
        <CardDescription className="space-y-1">
            <span className="block">
              <span className="text-gray-500">Seed:</span>
              <span className="text-primary/70 ml-2">
                {ellipsify(data.account.seed.toString())}
              </span>
            </span>
            <span className="flex items-center">
              <span className="text-gray-500">pda:</span>
              <ExplorerLink type="address" value={data.publicKey.toString()}>
                <span className="text-primary/70 text-sm ml-2 flex items-center">
                  {ellipsify(data.publicKey.toString(), 4)}
                  <ExternalLink className="h-3 w-3 ml-1" />
                </span>
              </ExplorerLink>
            </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Separator />
          <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <CircleUser className="w-4 h-4" />
                  Buyer:
                </div>
                <ExplorerLink type="address" value={data.account.maker.toString()}>
                  <Avatar>
                    <AvatarFallback>
                      {ellipsify(data.account.maker.toString(), 1)}
                    </AvatarFallback>
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
        {/* Available Balance - shown to all users */}
       <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-green-600 dark:text-green-400" />
            Available to Fill:
          </div>
          <span className="text-green-600 dark:text-green-400">
            <TokenDisplay 
            amount={availableBalance} 
            symbol={tokenMetadata?.symbol} 
            logoURI={tokenMetadata?.logoURI}
             />
          </span>
        </div>

        
        {/* Only show reserved info to the trust vault maker/owner */}
        {isSameWallet && hasPendingReservations && vaultBalance !== null && availableTokens !== null && (
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              Filled Orders:
            </div>
            <span className="text-amber-500 font-medium">
              <TokenDisplay 
            amount={`${vaultBalance - availableTokens}`} 
            symbol={tokenMetadata?.symbol} 
            logoURI={tokenMetadata?.logoURI}
             />
              
            </span>
          </div>
        )}
        
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-green-400" />
            Price per Token:
          </div>
          <span className="font-semibold text-lg">
            {`${pricePerToken} ${currencyStr}`}
          </span>
        </div>
        <Separator />
       
        {/* Integrated EncryptedPaymentDisplay Component */}
        <div className="border border-gray-700 rounded-lg bg-gray-800/50 backdrop-blur-sm">
          <div 
            className="flex justify-between items-center cursor-pointer p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
            onClick={() => setPaymentInstructionsOpen(!paymentInstructionsOpen)}
          >
            {/* Left: Icon + Heading */}
            <div className="flex items-center space-x-2">
              <FileText className="w-4 h-4" />
              <h3 className="text-lg font-medium">Payment Details</h3>
            </div>

            {/* Right: Chevron Button */}
            <Button variant="ghost" size="icon" type="button" onClick={(e) => {
              e.stopPropagation(); // prevents click from toggling twice
              setPaymentInstructionsOpen(!paymentInstructionsOpen);
            }}>
              {paymentInstructionsOpen ? (
                <ChevronUp className="h-5 w-5" />
              ) : (
                <ChevronDown className="h-5 w-5" />
              )}
            </Button>
          </div>

          {/* Collapsible content with EncryptedPaymentDisplay */}
          {paymentInstructionsOpen && (
            <div className="mt-2">
             <EncryptedPaymentDisplay
                trustVaultPubkey={data.publicKey.toString()} 
                paymentInstructions={data.account.paymentInstructions}
                className="w-full"
              />
            </div>
          )}
        </div>
        
        <Separator />

        {isTaker ? (
          <div className="flex flex-col gap-2">
            <Link href="/my_vault?tab=pending-reservations">
              <div className="text-center text-sm p-2 bg-amber-100 dark:bg-amber-900 rounded-md cursor-pointer hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors">
                You have a pending reservation for this vault
              </div>
            </Link>
            
          </div>
        ) : isSameWallet ? (
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span>Protocol Fee Reserve:</span>
              <div className="relative inline-block">
                <Info className="w-3 h-3 text-gray-400 cursor-help hover:text-gray-300 peer" />
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 p-2 bg-gray-800 text-white text-xs rounded opacity-0 invisible peer-hover:opacity-100 peer-hover:visible transition-all duration-200 z-10 pointer-events-none">
                  Fee is charged on successful trades. Refunded if you close the vault early.
                </div>
              </div>
            </div>
            <span className="text-blue-600 dark:text-blue-400 font-medium">
               <TokenDisplay 
                amount={`${(yetToBeFilled * 0.0005).toFixed(3)}`} 
                symbol={tokenMetadata?.symbol} 
                logoURI={tokenMetadata?.logoURI}
                  />
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-2   ">
            <SellTokensButton
              trustVault={data.publicKey}
              disabled={isSameWallet}
              trustVaultType={data.account.trustVaultType}
              mint={data.account.mint}
              vaultBalance={vaultBalance}
              availableTokens={availableTokens}
              pricePerToken={parseFloat(pricePerToken)}
              currency={currencyStr}
              totalOrderAmount={totalOrderAmount}
              paymentInstructions={data.account.paymentInstructions}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
export default BuyOrderCard;