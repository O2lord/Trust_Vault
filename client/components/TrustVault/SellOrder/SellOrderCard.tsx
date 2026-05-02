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
  BicepsFlexed,
  SendToBack,
  DollarSign,
  Copy,
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
import ReserveTokensButton from "./ReserveSellOrder";
import CancelReservationButton from "./CancelReservationButton";
import UpdatePriceForm from "../Shared/PriceUpdate";
import {
  AlertDialog,
  AlertDialogAction,
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
import EncryptedPaymentDisplay from "@/components/TrustVault/Shared/EncryptedPaymentDisplay";
import { useTokenMetadata } from "@/hooks/useTokenMetadata";
import TokenDisplay from "@/components/ui/token-display";
import { TRUST_VAULT_TYPE_SELL_ORDER } from "@/utils/constants";

// Type definitions for better TypeScript support
interface ReservationData {
  taker: PublicKey;
  amount: BN;
  fiatAmount: BN;
  timestamp: BN;
  sellerInstructions: string | null;
  status: number;
  disputeReason?: string | null;
  disputeId?: string | null;
}

// Base account structure that all accounts share
interface BaseTrustVaultAccount {
  seed: BN;
  maker: PublicKey;
  mint: PublicKey;
  currency: number[];
  trustVaultType: number;
  bump: number;
}

// Legacy account structure
interface LegacyTrustVaultAccount extends BaseTrustVaultAccount {
  taker?: PublicKey;
  amount: BN;
  pricePerToken: BN;
  paymentInstructions: string;
  reservation: {
    taker: PublicKey;
    amount: BN;
    fiatAmount: BN;
    timestamp: BN;
    status: number;
    disputeReason?: string | null;
    disputeId?: string | null;
  };
  reservedAmounts: Array<ReservationData>;
}

// account structure
interface NewTrustVaultAccount extends BaseTrustVaultAccount {
  feePercentage: number;
  feeDestination: PublicKey;
  reservedFee: BN;
  taker?: PublicKey;
  amount?: BN;
  pricePerToken?: BN;
  paymentInstructions?: string;
  reservation?: {
    taker: PublicKey;
    amount: BN;
    fiatAmount: BN;
    timestamp: BN;
    status: number;
    disputeReason?: string | null;
    disputeId?: string | null;
  };
  reservedAmounts?: Array<ReservationData>;
}

// Union type that can handle both structures
type TrustVaultAccount = LegacyTrustVaultAccount | NewTrustVaultAccount;

// Type guard to check if account is legacy structure 
function isLegacyAccount(account: TrustVaultAccount): account is LegacyTrustVaultAccount {
  // Check if the essential legacy fields exist (the ones needed for the card to function)
  // We need at least: reservedAmounts, amount, pricePerToken for the card to work
  const hasEssentialFields = 'reservedAmounts' in account && 
                            'amount' in account && 
                            'pricePerToken' in account;
  
  // Optional fields that are nice to have but not required
  const hasPaymentInstructions = 'paymentInstructions' in account;
  
  const hasRequiredFields = hasEssentialFields;
  
  // Additional check: if it has new structure fields, it might be a hybrid
  // In that case, we should still treat it as legacy if it has the legacy fields
  const isHybridWithLegacyFields = hasRequiredFields;
  
  const result = hasRequiredFields;
  
  return result;
}

// Props type that accepts the union type
interface Props {
  data: ProgramAccount<TrustVaultAccount>;
}

interface PaymentInstructions {
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
  additionalInstructions?: string;
}

const SellOrderCard: React.FC<Props> = ({ data }) => {
  const { publicKey } = useWallet();
  const { withdraw } = useTrustVaultProgram();
  const queryClient = useQueryClient();
  const [hasPendingReservations, setHasPendingReservations] = useState(false);
  const [withAmount, setWithdrawAmount] = useState<string>("");
  const [paymentInstructionsOpen, setPaymentInstructionsOpen] = useState(false);
  const [hasdispute, setHasDispute] = useState(false);
  const { metadata: tokenMetadata } = useTokenMetadata(data.account.mint);

  // Call useMemo unconditionally at the top level
  const isValidTrustVault = useMemo(() => {
    // You can put conditional logic INSIDE the hook
    if (!data || !data.account) {
      return null;
    }
    
    return data.account.trustVaultType === TRUST_VAULT_TYPE_SELL_ORDER;
  }, [data]);

  const isSameWallet = useMemo(() => {
    return publicKey && data.account.maker.equals(publicKey);
  }, [publicKey, data.account.maker]);
  
  const isTaker = useMemo(() => {
    if (!publicKey || !isLegacyAccount(data.account)) return false;
    
    return data.account.reservedAmounts.some(
      (reservation: ReservationData) => reservation.taker.equals(publicKey) && (reservation.status === 0 || reservation.status === 1 || reservation.status === 4)
    );
  }, [publicKey, data.account]);

  // Optimized balance fetching - only fetch when needed
  const shouldFetchBalance = useMemo(() => {
    return data.account.trustVaultType === TRUST_VAULT_TYPE_SELL_ORDER ||
    (publicKey && (isSameWallet || isTaker));
  }, [publicKey, isSameWallet, isTaker, data.account.trustVaultType]);

  const { 
    vaultBalance, 
    totalBalance,
    availableBalance, 
    lockedBalance,
    reservedFee,
    loading: balanceLoading, 
    error: balanceError 
  } = useVaultBalance(
    shouldFetchBalance ? data.publicKey : undefined,
    shouldFetchBalance ? data.account.mint : undefined
  );

  const currencyStr = useMemo(() => {
    return String.fromCharCode(...data.account.currency).trim();
  }, [data.account.currency]);

  const takerHasDispute = useMemo(() => {
    if (!publicKey || !isLegacyAccount(data.account)) return false;
    
    return data.account.reservedAmounts.some(
      (reservation: ReservationData) => reservation.taker.equals(publicKey) && reservation.status === 4
    );
  }, [publicKey, data.account]);

  useEffect(() => {
    if (!isLegacyAccount(data.account)) return;
    
    // Check for dispute - either as maker or taker
    const activeDispute = data.account.reservedAmounts.filter(
      (reservation: ReservationData) => reservation.status === 4 && (
        (publicKey && data.account.maker.equals(publicKey)) || // Maker's perspective
        (publicKey && reservation.taker.equals(publicKey))     // Taker's perspective
      )
    );
    const newValue = activeDispute.length > 0;
    setHasDispute(prev => {
      if (prev === newValue) return prev; // Prevent unnecessary updates
      return newValue;
    });
  }, [data.account, publicKey]);
  
  // divide the price by some factor
 const pricePerToken = useMemo(() => {
  if (!isLegacyAccount(data.account) || !data.account.pricePerToken) {
    return "0";
  }

  return data.account.pricePerToken.toString();
}, [data.account]);
  
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

  
  const calculateAvailableTokens = useCallback((vaultBalance: number | null, reservedAmounts?: Array<ReservationData>) => {
    if (vaultBalance === null || !reservedAmounts) return null;
    
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
  const availableTokens = useMemo(() => {
    const reservedAmounts = isLegacyAccount(data.account) ? data.account.reservedAmounts : [];
    return calculateAvailableTokens(vaultBalance, reservedAmounts);
  }, [vaultBalance, data.account, calculateAvailableTokens]);

  // Optimized refresh
  useEffect(() => {
    if (!shouldFetchBalance) return;
    
    // Only set up refresh for users who need real-time updates
    const intervalId = setInterval(() => {
      // Only refresh if user is actively interacting and has focus
      if (document.hasFocus() && (isSameWallet || isTaker)) {
        queryClient.invalidateQueries({
          queryKey: ["get-trustVault-accounts"],
          refetchType: 'active' // Only refetch if query is active/mounted
        });
      }
    }, 60000); 
    
    return () => clearInterval(intervalId);
  }, [queryClient, shouldFetchBalance, isSameWallet, isTaker]);

  const getUserReservationIndex = useCallback(() => {
    if (!publicKey || !isLegacyAccount(data.account)) return -1;
    
    return data.account.reservedAmounts.findIndex(
      (reservation: ReservationData) => reservation.taker.equals(publicKey) && (reservation.status === 0 || reservation.status === 1)
    );
  }, [publicKey, data.account]);
  
  // Parse payment instructions with improved error handling
  const parsePaymentInstructions = (): PaymentInstructions => {
    const paymentInstructions = isLegacyAccount(data.account) ? data.account.paymentInstructions : "";
    
    if (!paymentInstructions) {
      return {};
    }
    
    try {
      // Try to parse JSON
      const parsed = JSON.parse(paymentInstructions);
      return {
        bankName: parsed.bankName,
        accountNumber: parsed.accountNumber,
        accountName: parsed.accountName,
        additionalInstructions: parsed.additionalInstructions,
      };
    } catch (e) {
      // If it fails, check if it's already a string format that looks like JSON
      const rawInstructions = paymentInstructions;
      
      // Try to extract fields from a malformed JSON string
      const bankNameMatch = rawInstructions.match(/"bankName"\s*:\s*"([^"]+)"/);
      const accountNumberMatch = rawInstructions.match(/"accountNumber"\s*:\s*"([^"]+)"/);
      const accountNameMatch = rawInstructions.match(/"accountName"\s*:\s*"([^"]+)"/);
      const additionalInstructionsMatch = rawInstructions.match(/"additionalInstructions"\s*:\s*"([^"]+)"/);
      
      if (bankNameMatch || accountNumberMatch || accountNameMatch) {
        return {
          bankName: bankNameMatch ? bankNameMatch[1] : undefined,
          accountNumber: accountNumberMatch ? accountNumberMatch[1] : undefined,
          accountName: accountNameMatch ? accountNameMatch[1] : undefined,
          additionalInstructions: additionalInstructionsMatch ? additionalInstructionsMatch[1] : undefined,
        };
      }
      
      // If we can't extract fields, create a simple structure with the raw text
      return {
        additionalInstructions: rawInstructions,
      };
    }
  };

  const parsedInstructions = parsePaymentInstructions();
  
  const copyAccountNumber = () => {
    const paymentInstructions = isLegacyAccount(data.account) ? data.account.paymentInstructions : "";
    
    if (parsedInstructions && parsedInstructions.accountNumber) {
      navigator.clipboard.writeText(parsedInstructions.accountNumber);
      toast.success("Account number copied to clipboard");
    } else {
      navigator.clipboard.writeText(paymentInstructions);
      toast.success("Payment instructions copied to clipboard");
    }
  };

  const handleWithdraw = useCallback(() => {
    const parsedAmount = parseFloat(withAmount);

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error("Please enter a valid withdrawal amount.");
      return;
    }

    if (availableBalance === null) {
      toast.error("Available balance calculation is unavailable.");
      return;
    }

    // Check against available tokens 
    if (parsedAmount > availableBalance) {
      toast.error(`Withdraw amount (${parsedAmount}) exceeds available tokens (${availableBalance}).`);
      return;
    }

    toast.promise(withdraw.mutateAsync({ trustVault: data.publicKey, withdrawAmount: parsedAmount }), {
      loading: "withdrawing from trustVault...",
      success: "Tokens withdrawn",
      error: "Failed to withdraw from trustVault",
      finally() {
        queryClient.invalidateQueries({
          queryKey: ["get-trustVault-accounts"],
        });
        setWithdrawAmount("");
      },
    });
  }, [withAmount, availableBalance, withdraw, data.publicKey, queryClient]);

  const handleHalfWithdraw = useCallback(() => {
    if (availableBalance !== null) {
      // Use available tokens (after reservations) instead of vault balance
      const halfBalance = Math.floor((availableBalance / 2) * 100) / 100; // Round to 2 decimal places
      setWithdrawAmount(halfBalance.toString());
    }
  }, [availableBalance]);

  const handleMaxWithdraw = useCallback(() => {
    if (availableBalance !== null) {
      // Use available tokens (after reservations) instead of vault balance
      setWithdrawAmount(availableBalance.toString());
    }
  }, [availableBalance]);

  // Price update success handler
  const handlePriceUpdateSuccess = () => {
    queryClient.invalidateQueries({
      queryKey: ["get-trustVault-accounts"],
    });
    toast.success("Price updated successfully");
  };

  // Check for pending reservations effect
  useEffect(() => {
    if (!isLegacyAccount(data.account)) return;
    
    // Check if there are any pending or payment sent reservations
    const activeReservations = data.account.reservedAmounts.filter(
      (reservation: ReservationData) => reservation.status === 0 || reservation.status === 1
    );
    
    const newValue = activeReservations.length > 0;
    setHasPendingReservations(prev => {
      if (prev === newValue) return prev; // Prevent unnecessary updates
      return newValue;
    });
  }, [data.account]);

  useEffect(() => {
    if (!isLegacyAccount(data.account)) return;
    
    //check for dispute
    const activeDispute = data.account.reservedAmounts.filter(
      (reservation: ReservationData) => reservation.status === 4
    );
    const newValue = activeDispute.length > 0;
    setHasDispute(prev => {
      if (prev === newValue) return prev; // Prevent unnecessary updates
      return newValue;
    });
  }, [data.account]);

  // Render payment instructions in a structured format (LEGACY - for fallback)
  const renderPaymentInstructions = () => {
    return (
      <div className="space-y-1">
        {parsedInstructions.bankName && (
          <div>
            <span className="text-amber-400 font-medium">Bank Name:</span> {parsedInstructions.bankName}
          </div>
        )}
        {parsedInstructions.accountNumber && (
          <div className="flex items-center justify-between">
            <div>
              <span className="text-amber-400 font-medium">Account Number:</span> {parsedInstructions.accountNumber}
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={copyAccountNumber} 
              className="h-6 w-6"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        )}
        {parsedInstructions.accountName && (
          <div>
            <span className="text-amber-400 font-medium">Account Name:</span> {parsedInstructions.accountName}
          </div>
        )}
        {/* Make sure additional instructions are properly rendered */}
        {parsedInstructions.additionalInstructions && parsedInstructions.additionalInstructions.trim() !== "" && (
          <div>
            <span className="text-amber-400 font-medium">Additional Info:</span>
            <p className="text-sm mt-1">{parsedInstructions.additionalInstructions}</p>
          </div>
        )}
      </div>
    );
  };

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

  // Skip rendering for new account structure that doesn't have the required fields yet

if (!isLegacyAccount(data.account)) {
  // Show available fields for new account structure
  const availableFields = [];
  const missingFields = [];
  
  // Check which fields are available
  if ('taker' in data.account && data.account.taker) availableFields.push('Taker');
  if ('amount' in data.account && data.account.amount) availableFields.push('Amount');
  if ('pricePerToken' in data.account && data.account.pricePerToken) availableFields.push('Price per Token');
  if ('paymentInstructions' in data.account && data.account.paymentInstructions) availableFields.push('Payment Instructions');
  if ('reservation' in data.account && data.account.reservation) availableFields.push('Reservation');
  if ('reservedAmounts' in data.account && data.account.reservedAmounts) availableFields.push('Reserved Amounts');
  
  // Check which legacy fields are missing
  if (!('taker' in data.account) || !data.account.taker) missingFields.push('Taker');
  if (!('amount' in data.account) || !data.account.amount) missingFields.push('Amount');
  if (!('pricePerToken' in data.account) || !data.account.pricePerToken) missingFields.push('Price per Token');
  if (!('paymentInstructions' in data.account) || !data.account.paymentInstructions) missingFields.push('Payment Instructions');
  if (!('reservation' in data.account) || !data.account.reservation) missingFields.push('Reservation');
  if (!('reservedAmounts' in data.account) || !data.account.reservedAmounts) missingFields.push('Reserved Amounts');

  return (
    <Card className="group cursor-pointer border-yellow-300">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCcw className="text-primary/70" />
          Trust Vault
        </CardTitle>
        <CardDescription>
          This vault uses a newer account structure. Some features may be limited.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Separator />
        
        {/* Show basic account info that's always available */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Seed:</span>
          </div>
          <span className="text-primary/70">
            {ellipsify(data.account.seed.toString())}
          </span>
        </div>
        
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <CircleUser className="w-4 h-4" />
            Seller:
          </div>
          <ExplorerLink type="address" value={data.account.maker.toString()}>
            <Avatar>
              <AvatarFallback>
                {ellipsify(data.account.maker.toString(), 1)}
              </AvatarFallback>
            </Avatar>
          </ExplorerLink>
        </div>
        
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
            <span className="text-gray-500">Currency:</span>
          </div>
          <span className="font-medium">
            {currencyStr}
          </span>
        </div>

        {/* Show new account structure specific fields */}
        {'feePercentage' in data.account && (
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Fee Percentage:
            </div>
            <span className="font-medium">
              {data.account.feePercentage}%
            </span>
          </div>
        )}

        {'feeDestination' in data.account && (
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Fee Destination:</span>
            </div>
            <ExplorerLink type="address" value={data.account.feeDestination.toString()}>
              <span className="text-primary/70 text-sm flex items-center">
                {ellipsify(data.account.feeDestination.toString(), 4)}
                <ExternalLink className="h-3 w-3 ml-1" />
              </span>
            </ExplorerLink>
          </div>
        )}

        {'reservedFee' in data.account && (
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4" />
              Reserved Fee:
            </div>
            <span className="font-medium">
              {data.account.reservedFee.toString()} Tokens
            </span>
          </div>
        )}

        <Separator />

        {/* Show available and missing fields */}
        {availableFields.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium text-green-600 dark:text-green-400">Available Fields:</h4>
            <div className="flex flex-wrap gap-2">
              {availableFields.map((field) => (
                <Badge key={field} variant="outline" className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300">
                  {field}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {missingFields.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium text-amber-600 dark:text-amber-400">Missing Legacy Fields:</h4>
            <div className="flex flex-wrap gap-2">
              {missingFields.map((field) => (
                <Badge key={field} variant="outline" className="bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300">
                  {field}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-md">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            This vault is using a newer account structure. Full functionality will be available once all required fields are populated.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

  return (
    <Card className={`group cursor-pointer ${getCardBorderClass()}`}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCcw className="text-primary/70 group-hover:animate-spin" />
            Trust Vault
            {isSameWallet && (
              <Badge variant="outline" className="ml-2 bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-300">
                You are the Seller
              </Badge>
            )}
            {isTaker && (
              <Badge variant="outline" className="ml-2 bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300">
                <Link href="/my_vault?tab=pending-confirmations">
                You have a Reservation
                </Link>
              </Badge>
            )}
            {publicKey && data.account.maker.equals(publicKey) && hasPendingReservations && (
              <div className="relative ml-2">
                <Link href="/my_vault?tab=pending-reservations" className="block">
                  <Bell className="h-5 w-5 text-amber-500 animate-pulse cursor-pointer" />
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
                    {data.account.reservedAmounts.filter((r: ReservationData) => r.status === 0 || r.status === 1).length}
                  </span>
                </Link>
              </div>
            )}
           {((publicKey && data.account.maker.equals(publicKey)) || takerHasDispute) && hasdispute && ( 
              <div className="relative ml-2">
                <Link href={publicKey && data.account.maker.equals(publicKey) 
                  ? "/my_vault?tab=pending-reservations" 
                  : "/my_vault?tab=pending-confirmations"
                } className="block">
                  <ShieldAlert className="h-5 w-5 text-red-500 animate-pulse cursor-pointer" />
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
                    {publicKey && data.account.maker.equals(publicKey) 
                      ? data.account.reservedAmounts.filter((r: ReservationData) => r.status === 4).length
                      : takerHasDispute ? 1 : 0
                    }
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
                <DropdownMenuLabel className="text-slate-100">Sellers Actions</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-slate-700" />
                
               {/* Withdraw TrustVault - using AlertDialog */}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-slate-100 hover:bg-slate-700">
                      <RefreshCwOff className="w-4 h-4 mr-2 text-red-400" />
                      Withdraw From TrustVault
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="bg-gray-900/80 rounded-lg p-4 border border-gray-600">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-slate-100">Withdraw Tokens</AlertDialogTitle>
                      <AlertDialogDescription className="text-slate-300">
                        Enter the amount you want to withdraw from the vault. If you enter the
                        full available amount, the vault will be closed and your rent and remaining fee refunded.
                      </AlertDialogDescription>
                    </AlertDialogHeader>

                    <div className="mt-4 p-4 bg-slate-700 rounded-md">
                      <div className="font-bold text-slate-100">Vault Summary:</div>
                      <div className="flex justify-between mt-2 text-slate-200">
                        <span>total in vault:</span>
                        <TokenDisplay 
                          amount={`${availableBalance}`} 
                          symbol={tokenMetadata?.symbol} 
                          logoURI={tokenMetadata?.logoURI}
                        />
                      </div>
                      {hasPendingReservations && (
                        <div className="flex justify-between mt-1 text-amber-400">
                          <span>Reserved by buyers:</span>
                          <TokenDisplay 
                            amount={vaultBalance !== null && availableBalance !== null ? 
                              `${lockedBalance}` : "Loading..."}
                            symbol={tokenMetadata?.symbol} 
                            logoURI={tokenMetadata?.logoURI}
                          />
                        </div>
                      )}
                    <div className="flex justify-between mt-1 text-blue-400">
                      <div className="flex items-center gap-1">
                        <span>Protocol Fee Reserve:</span>
                        <div className="relative inline-block">
                          <Info className="w-3 h-3 text-gray-400 cursor-help hover:text-gray-300 peer" />
                          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 p-2 bg-gray-800 text-white text-xs rounded opacity-0 invisible peer-hover:opacity-100 peer-hover:visible transition-all duration-200 z-10 pointer-events-none">
                            Fee is charged on successful trades. Withdrawed if you close the vault early.
                          </div>
                        </div>
                      </div>
                      <TokenDisplay 
                        amount={`${reservedFee}`} 
                        symbol={tokenMetadata?.symbol} 
                        logoURI={tokenMetadata?.logoURI}
                      />
                    </div>
                      <div className="flex justify-between mt-1 pt-2 border-t border-slate-600 font-medium text-slate-100">
                        <span>Available for withdrawal:</span>
                        <TokenDisplay 
                          amount={availableBalance !== null ? 
                            `${availableBalance + (reservedFee ?? 0)}` : "Loading..."} 
                          symbol={tokenMetadata?.symbol} 
                          logoURI={tokenMetadata?.logoURI}
                        />
                      </div>
                    </div>
                    {/* Half and Max buttons */}
                    <div className="flex gap-4 mt-4">
                      <Button 
                        variant="outline" 
                        onClick={handleHalfWithdraw}
                        disabled={availableBalance === null || availableBalance <= 0}
                        className="border-slate-600 text-slate-100 hover:bg-slate-700"
                      >
                        Half
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={handleMaxWithdraw}
                        disabled={availableBalance === null || availableBalance <= 0}
                        className="border-slate-600 text-slate-100 hover:bg-slate-700"
                      >
                        Max
                      </Button>
                    </div>

                    <input
                      type="number"
                      value={withAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      placeholder="Enter withdrawal amount"
                      className="mt-4 w-full p-2 border rounded text-slate-100 bg-slate-700 border-slate-600 placeholder-slate-400 focus:border-slate-500 focus:ring-slate-500"
                      disabled={availableBalance === null || availableBalance <= 0}
                    />

                    <AlertDialogFooter>
                      <AlertDialogCancel className="border-slate-600 text-slate-100 hover:bg-slate-700">Cancel</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={handleWithdraw}
                        disabled={availableBalance === null || availableBalance <= 0 || !withAmount || parseFloat(withAmount) <= 0 || parseFloat(withAmount) > (availableBalance ?? 0)}
                        className="bg-green-600 hover:bg-green-500 text-white disabled:bg-slate-600 disabled:hover:bg-slate-600"
                      >
                        <BicepsFlexed className="w-4 h-4 mr-2" /> Confirm Withdrawal
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                {/* Price Update AlertDialog */}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-slate-100 hover:bg-slate-700">
                      <DollarSign className="w-4 h-4 mr-2 text-green-400" />
                      Update Token Price
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="bg-gray-900/80 rounded-lg p-4 border border-gray-600">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-slate-100">Update Token Price</AlertDialogTitle>
                      <AlertDialogDescription className="text-slate-300">
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
                      <AlertDialogCancel className="border-slate-600 text-slate-100 hover:bg-slate-700">Cancel</AlertDialogCancel>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                
                {hasPendingReservations && (
                  <DropdownMenuItem className="text-slate-100 hover:bg-slate-700">
                    <Link href="/my_vault?tab=pending-reservations" className="flex items-center text-slate-100">
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
            Seller:
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
              Available Tokens:
            </div>
            <span className="text-green-600 dark:text-green-400 font-medium">
              {balanceLoading ? (
                <span className="flex items-center">
              <RefreshCcw className="w-3 h-3 mr-1 animate-spin" />
              Loading...
            </span>
              ) : balanceError ? (
                <span className="text-red-500" title={balanceError}>Error</span>
              ) : availableBalance === null ? (
                <TokenDisplay 
                  amount="0.00" 
                  symbol={tokenMetadata?.symbol} 
                  logoURI={tokenMetadata?.logoURI}
                />
              ) : (
                <TokenDisplay 
                  amount={Number(availableBalance).toFixed(2)} 
                  symbol={tokenMetadata?.symbol} 
                  logoURI={tokenMetadata?.logoURI}
                />
              )}
                </span>
          </div>
        
        {/* Only show reserved info to the vault maker/owner */}
        {isSameWallet && hasPendingReservations && vaultBalance !== null && availableBalance !== null && (
          <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                Reserved by Buyers:
              </div>
              <span className="text-amber-500 font-medium">
                {balanceLoading ? (
                  <span className="flex items-center">
                    <RefreshCcw className="w-3 h-3 mr-1 animate-spin" />
                    Loading...
                  </span>
                ) : balanceError ? (
                  <span className="text-red-500" title={balanceError}>Error</span>
                ) : lockedBalance === null ? (
                 <TokenDisplay 
                  amount="0" 
                  symbol={tokenMetadata?.symbol} 
                  logoURI={tokenMetadata?.logoURI}
                />
              ) : (
                <TokenDisplay 
                  amount={lockedBalance} 
                  symbol={tokenMetadata?.symbol} 
                  logoURI={tokenMetadata?.logoURI}
                />
                )}
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
        <div className="border border-gray-700 rounded-lg bg-gray-800/50 backdrop-blur-sm">
            <div 
              className="flex justify-between items-center cursor-pointer p-2 hover:bg-gray-700/50 rounded-lg transition-colors"
              onClick={() => setPaymentInstructionsOpen(!paymentInstructionsOpen)}
            >
              {/* Left side: icon + text */}
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                <h3 className="text-lg font-medium">Payment Details</h3>
              </div>

              {/* Right side: chevron button */}
              <Button variant="ghost" size="icon" type="button" className="shrink-0">
                {paymentInstructionsOpen ? (
                  <ChevronUp className="h-5 w-5" />
                ) : (
                  <ChevronDown className="h-5 w-5" />
                )}
              </Button>
            </div>

            {/* Collapsible content with EncryptedPaymentDisplay */}
            {paymentInstructionsOpen && data.account.paymentInstructions && (
              <div className="flex flex-col gap-2 w-full mt-2">
                
                  <EncryptedPaymentDisplay
                    trustVaultPubkey={data.publicKey.toString()}
                    paymentInstructions={data.account.paymentInstructions}
                    className="bg-transparent border-none p-0"
                  />
              
              </div>
            )}
          </div>
        
        <Separator className="bg-gray-700" />

        {isTaker ? (
          <div className="flex flex-col gap-2">
            {takerHasDispute ? (
              <Button 
                className="flex-1"
                disabled={true}
                variant="outline"
              >
                <ShieldAlert className="w-4 h-4 mr-2 text-red-500" />
                Transaction Disputed
              </Button>
            ) : (
              <>
                <Link href="/my_vault?tab=pending-confirmations">
                  <div className="text-center text-sm p-2 bg-amber-100 dark:bg-amber-900 rounded-md cursor-pointer hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors">
                    You have a pending reservation for this trust vault
                  </div>
                </Link>
                
                {/* CancelReservationButton for users who have made a reservation */}
                <CancelReservationButton 
                  trustVault={data.publicKey}
                  reservationIndex={getUserReservationIndex()}
                  reservationStatus={data.account.reservedAmounts[getUserReservationIndex()]?.status}
                />
              </>
            )}
          </div>
        ) : isSameWallet ? (
         <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span>Protocol Fee Reserve:</span>
              <div className="relative inline-block">
                <Info className="w-3 h-3 text-gray-400 cursor-help hover:text-gray-300 peer" />
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 p-2 bg-gray-800 text-white text-xs rounded opacity-0 invisible peer-hover:opacity-100 peer-hover:visible transition-all duration-200 z-10 pointer-events-none">
                  Fee is charged on successful trades. Withdrawed if you close the vault early.
                </div>
              </div>
            </div>
            <span className="text-blue-600 dark:text-blue-400 font-medium">
               <TokenDisplay 
                         amount={`${reservedFee}`} 
                         symbol={tokenMetadata?.symbol} 
                          logoURI={tokenMetadata?.logoURI}
                           />
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <ReserveTokensButton
              disabled={isSameWallet}
              trustVault={data.publicKey}
              mint={data.account.mint}
              vaultBalance={vaultBalance}
              availableTokens={availableBalance}
              pricePerToken={parseFloat(pricePerToken)}
              currency={currencyStr}
              paymentInstructions={data.account.paymentInstructions}
            />
          </div>
        )}
      </CardContent>
    </Card>
    
  );
};

export default SellOrderCard;