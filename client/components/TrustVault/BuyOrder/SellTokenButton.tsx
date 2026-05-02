"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
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
} from "../../ui/alert-dialog";
import { Button } from "../../ui/button";
import { 
  LockIcon, 
  Loader2, 
  ShieldAlert, 
  RefreshCcw,
  CreditCard,
  DollarSign,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { toast } from "sonner";
import { PublicKey, Connection } from "@solana/web3.js";
import { useQueryClient } from "@tanstack/react-query";
import useTrustVaultProgram from "@/hooks/useTrustVaultProgram";
import { useVaultBalance } from "@/hooks/useVaultBalance";
import { Input } from "@/components/ui/input";
import { Label } from "../../ui/label";
import { useWallet } from "@solana/wallet-adapter-react";
import cnClassnames from "classnames";
import { encryptPaymentInstructions, associateKeyWithVault } from "@/lib/encryptionApi";
import TokenDisplay  from "@/components/ui/token-display";
import {useTokenMetadata} from "@/hooks/useTokenMetadata";
import { TRUST_VAULT_TYPE_BUY_ORDER } from "@/utils/constants";


// Token program IDs
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

type Props = {
  disabled: boolean | null;
  trustVault: PublicKey;
  mint: PublicKey;
  trustVaultType: number;
  vaultBalance: number | null;
  availableTokens?: number | null;
  pricePerToken: number;
  currency: string;
  paymentInstructions?: string;
  totalOrderAmount?: string;
  rawAmount?: unknown;
  pendingReservations?: number;
  className?: string;
};

type TokenInfo = {
  mint: string;
  balance: number;
  programId: string;
};

// Rate limiting utility
class RateLimiter {
  private lastCall: number = 0;
  private minInterval: number;

  constructor(minIntervalMs: number = 1000) {
    this.minInterval = minIntervalMs;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCall;
    
    if (timeSinceLastCall < this.minInterval) {
      const delay = this.minInterval - timeSinceLastCall;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    this.lastCall = Date.now();
    return fn();
  }
}

const tokenRateLimiter = new RateLimiter(2000);

const SellTokensButton: React.FC<Props> = ({ 
  disabled, 
  trustVault, 
  mint, 
  pricePerToken,
  currency,
  className
}) => {
  const queryClient = useQueryClient();
  const { publicKey } = useWallet();
  const { reserveBuyOrder, program } = useTrustVaultProgram();
  const tokenMetadata = useTokenMetadata(mint);
  
  // Use the useVaultBalance hook instead of direct fetching
  const {
 
    availableBalance,
    totalReserved,
  
    loading: vaultLoading,
    error: vaultError
  } = useVaultBalance(trustVault, mint);
  
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [mintProgramId, setMintProgramId] = useState<PublicKey | null>(null);
  const [isToken2022, setIsToken2022] = useState<boolean>(false);
  const [reserveAmount, setReserveAmount] = useState<string>("");
  const [fiatAmount, setFiatAmount] = useState<number>(0);
  const [open, setOpen] = useState(false);
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [bankName, setBankName] = useState<string>("");
  const [accountName, setAccountName] = useState<string>("");
  const [accountNumber, setAccountNumber] = useState<string>("");
  const [additionalInstructions, setAdditionalInstructions] = useState<string>("");
  const [isPaymentDetailsOpen, setIsPaymentDetailsOpen] = useState(false);
  
  // Connection with retry logic
  const getConnectionWithRetry = useCallback(async (maxRetries: number = 3) => {
    const rpcUrls = [
      "https://api.devnet.solana.com",
    ];

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      for (const rpcUrl of rpcUrls) {
        try {
          const connection = new Connection(rpcUrl, {
            commitment: 'confirmed',
            confirmTransactionInitialTimeout: 60000,
          });
          
          await connection.getLatestBlockhash();
          return connection;
        } catch (error) {
          console.warn(`RPC ${rpcUrl} failed on attempt ${attempt + 1}:`, error);
          continue;
        }
      }
      
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000;
       
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw new Error('All RPC endpoints failed');
  }, []);

  // Check if a mint is Token2022 by examining its account info
  const checkMintProgram = useCallback(async (mint: PublicKey): Promise<PublicKey> => {
    try {
      const connection = await getConnectionWithRetry();
      const mintAccountInfo = await connection.getAccountInfo(mint);
      
      if (!mintAccountInfo) {
        throw new Error('Mint account not found');
      }
      
      const owner = mintAccountInfo.owner;
      
      if (owner.equals(TOKEN_2022_PROGRAM_ID)) {
        
        return TOKEN_2022_PROGRAM_ID;
      } else if (owner.equals(TOKEN_PROGRAM_ID)) {
        
        return TOKEN_PROGRAM_ID;
      } else {
        console.warn(`Unknown token program for mint ${mint.toString()}:`, owner.toString());
        return TOKEN_PROGRAM_ID;
      }
    } catch (error) {
      console.error('Error checking mint program:', error);
      return TOKEN_PROGRAM_ID;
    }
  }, [getConnectionWithRetry]);

  // Check mint program when mintA changes
  useEffect(() => {
    if (mint) {
      checkMintProgram(mint).then((programId) => {
        setMintProgramId(programId);
        setIsToken2022(programId.equals(TOKEN_2022_PROGRAM_ID));
      });
    }
  }, [mint, checkMintProgram]);

  // Enhanced token fetching that supports both Token and Token2022 programs
  useEffect(() => {
    const fetchTokens = async () => {
      if (!publicKey) return;

      setIsLoadingBalance(true);
      try {
        const connection = await getConnectionWithRetry();
        const [standardTokens, token2022Tokens] = await Promise.allSettled([
          tokenRateLimiter.execute(async () => {
            return await connection.getParsedTokenAccountsByOwner(publicKey, {
              programId: TOKEN_PROGRAM_ID,
            });
          }),
          tokenRateLimiter.execute(async () => {
            return await connection.getParsedTokenAccountsByOwner(publicKey, {
              programId: TOKEN_2022_PROGRAM_ID,
            });
          })
        ]);

        const allTokens: TokenInfo[] = [];

        if (standardTokens.status === 'fulfilled') {
          const standardUserTokens: TokenInfo[] = standardTokens.value.value.map(({ account }) => ({
            mint: account.data.parsed.info.mint,
            balance: account.data.parsed.info.tokenAmount.uiAmount || 0,
            programId: TOKEN_PROGRAM_ID.toString(),
          }));
          allTokens.push(...standardUserTokens);
        } else {
          console.warn('Failed to fetch standard tokens:', standardTokens.reason);
        }

        if (token2022Tokens.status === 'fulfilled') {
          const token2022UserTokens: TokenInfo[] = token2022Tokens.value.value.map(({ account }) => ({
            mint: account.data.parsed.info.mint,
            balance: account.data.parsed.info.tokenAmount.uiAmount || 0,
            programId: TOKEN_2022_PROGRAM_ID.toString(),
          }));
          allTokens.push(...token2022UserTokens);
        } else {
          console.warn('Failed to fetch Token2022 tokens:', token2022Tokens.reason);
        }

        setTokens(allTokens);
       
      } catch (error: unknown) {
        console.error("Error fetching tokens:", error);

        const isErrorMessage429 = error instanceof Error && error.message?.includes('429');
        const isStatus429 = typeof error === 'object' && error !== null &&
                            'status' in error && typeof (error as { status: unknown }).status === 'number' &&
                            (error as { status: number }).status === 429;

        if (isErrorMessage429 || isStatus429) {
            toast.error("Rate limit exceeded. Please wait before refreshing.");
        } else {
            toast.error("Failed to fetch token balance");
        }
        }
        finally {
                setIsLoadingBalance(false);
            }
            };

    const timeoutId = setTimeout(fetchTokens, 500);
    return () => clearTimeout(timeoutId);
  }, [publicKey, getConnectionWithRetry]);

  // Get the balance for the specific token from the tokens array
  const walletTokenBalance = useMemo(() => {
    if (!mint || tokens.length === 0) return null;
    
    const mintString = mint.toString();
    const tokenInfo = tokens.find(token => token.mint === mintString);
    
    return tokenInfo ? tokenInfo.balance : 0;
  }, [tokens, mint]);

  // Get token info including program type
  const tokenInfo = useMemo(() => {
    if (!mint || tokens.length === 0) return null;
    
    const mintString = mint.toString();
    return tokens.find(token => token.mint === mintString) || null;
  }, [tokens, mint]);

  const reserveTokens = reserveBuyOrder;

  // Calculate fiat amount whenever token amount changes
  useEffect(() => {
    const tokenAmount = parseFloat(reserveAmount);
    if (!isNaN(tokenAmount)) {
      setFiatAmount(tokenAmount * pricePerToken);
    } else {
      setFiatAmount(0);
    }
  }, [reserveAmount, pricePerToken]);

  // Throttled refresh to prevent rapid successive calls
  const [lastRefresh, setLastRefresh] = useState<number>(0);
  
  useEffect(() => {
    if (open) {
      const now = Date.now();
      if (now - lastRefresh > 5000) {
        queryClient.invalidateQueries({
          queryKey: ["get-trust-vault-accounts"],
          refetchType: "active"
        });
        setLastRefresh(now);
      }
    }
  }, [open, queryClient, lastRefresh]);

  // Create payment instructions based on user input
  const generateSellerInstructions = useCallback(() => {
    return {
      bankName,
      accountName,
      accountNumber,
      additionalInstructions
    };
  }, [bankName, accountName, accountNumber, additionalInstructions]);

  const handleReserveBuyOrder = useCallback(async () => {
    const parsedAmount = parseFloat(reserveAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error("Please enter a valid reserve amount.");
      return;
    }

    if (!bankName.trim()) {
      toast.error("Please enter a bank name.");
      return;
    }
    
    if (!accountName.trim()) {
      toast.error("Please enter an account name.");
      return;
    }
    
    if (!accountNumber.trim()) {
      toast.error("Please enter an account number.");
      return;
    }

    if (walletTokenBalance !== null && parsedAmount > walletTokenBalance) {
      toast.error(`Reserve amount (${parsedAmount}) exceeds your wallet balance (${walletTokenBalance}).`);
      return;
    }
    
    // Use availableBalance from useVaultBalance hook
    if (availableBalance !== null && parsedAmount > availableBalance) {
      toast.error(`Buyer only needs ${availableBalance.toFixed(2)} more tokens to complete their order, but you're trying to sell ${parsedAmount}.`);
      return;
    }

    if (!publicKey) {
      toast.error("Wallet not connected");
      return;
    }

    setIsEncrypting(true);

    try {
      // Step 1: Construct payment instructions for SellTokensButton format
      const paymentData = generateSellerInstructions();

      // Step 2: Encrypt payment instructions via API
      const encryptionResponse = await encryptPaymentInstructions(paymentData);

      if (!encryptionResponse.success) {
        throw new Error(encryptionResponse.error || 'Failed to encrypt payment instructions');
      }      

      // Step 3: Associate key with both trust vault and seller's public key
      // This associates the seller's payment instructions with the specific buy order
      const associationResponse = await associateKeyWithVault(
        encryptionResponse.keyId!, trustVault.toString(), publicKey.toString() 
      );

      if (!associationResponse.success) {
        throw new Error(associationResponse.error || 'Failed to associate key with seller');
      }

      // Step 4: Submit to Solana with encrypted seller instructions     

      const result = await reserveTokens.mutateAsync({ 
        trustVault, 
        amount: parsedAmount, 
        sellerInstructions: encryptionResponse.encryptedData!,
      });

      toast.success("Tokens reserved with encrypted payment instructions!");

      // Reset form and close dialog
      setReserveAmount("");
      setFiatAmount(0);
      setBankName("");
      setAccountName("");
      setAccountNumber("");
      setAdditionalInstructions("");
      setOpen(false);      
      setTimeout(() => {
        return queryClient.invalidateQueries({
          queryKey: ["get-trust-vault-accounts"],
          refetchType: "active",
        });
      }, 1000);

    } catch (error) {
      console.error("❌ Error in encrypted token reservation:", error);
      toast.error(error instanceof Error ? error.message : "Failed to reserve tokens");
    } finally {
      setIsEncrypting(false);
    }
  }, [
    reserveAmount, 
    bankName, 
    accountName, 
    accountNumber, 
    walletTokenBalance, 
    availableBalance,
    trustVault, 
    reserveTokens, 
    queryClient, 
    generateSellerInstructions,
    publicKey
  ]);

  // Set half of available amount
  const handleHalfAmount = useCallback(() => {
    if (availableBalance && availableBalance > 0) {
      const halfAmount = (availableBalance / 2).toFixed(2);
      setReserveAmount(halfAmount);
    }
  }, [availableBalance]);

  // Set max to available or wallet balance (whichever is lower)
  const handleMaxAmount = useCallback(() => {
    if (walletTokenBalance === null || !availableBalance || availableBalance <= 0) {
      return;
    }
    
    const maxAmount = Math.min(walletTokenBalance, availableBalance);
    setReserveAmount(maxAmount.toFixed(2));
  }, [walletTokenBalance, availableBalance]);

  // Throttled manual refresh
  const handleRefresh = useCallback(() => {
    const now = Date.now();
    if (now - lastRefresh < 3000) {
      toast.info("Please wait a moment before refreshing again.");
      return;
    }
    
    setLastRefresh(now);
    
    setTimeout(() => {
      queryClient.invalidateQueries({
        queryKey: ["get-trust-vault-accounts"],
        refetchType: "active"
      });
    }, 500);
    
    toast.info("Refreshing trust vault data...");
  }, [queryClient, lastRefresh]);

  // Format currency for display
  const formatCurrency = useCallback((amount: number) => {
    return new Intl.NumberFormat('en-US', { 
      style: 'decimal', 
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount) + " " + currency;
  }, [currency]);

  const isDisabled = disabled ?? false;
  
  const hasInsufficientFunds = useMemo(() => {
    return walletTokenBalance !== null && walletTokenBalance <= 0;
  }, [walletTokenBalance]);

  const noAvailableTokens = useMemo(() => {
    return availableBalance !== null && availableBalance <= 0;
  }, [availableBalance]);

  const isSubmitting = reserveTokens.isPending || isEncrypting;

  return (
  <AlertDialog open={open} onOpenChange={setOpen}>
    <Button
      asChild
      className="w-full bg-orange-500 hover:bg-orange-600 text-black"
      disabled={isDisabled || isSubmitting || hasInsufficientFunds }
    >
      <div>
        <AlertDialogTrigger
          disabled={isDisabled || isSubmitting}
          className={cnClassnames("flex items-center justify-center", className)}
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : hasInsufficientFunds ? (
            <ShieldAlert className="w-4 h-4 mr-2" />
          ) : (
            <LockIcon className="w-4 h-4 mr-2" />
          )}
          {hasInsufficientFunds ? "Insufficient Token Balance" : "Sell Tokens"}
        </AlertDialogTrigger>
      </div>
    </Button>
    
    <AlertDialogContent className="max-h-[90vh] overflow-y-auto bg-gray-900 border-gray-700">
      <AlertDialogHeader className="relative"> 
        <div className="flex items-center space-x-3">
          <div className="relative">
            <div className="relative bg-gradient-to-r from-orange-500 to-orange-600 p-2.5 rounded-lg">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
          </div>
          <div>
            <AlertDialogTitle className="text-xl font-bold text-white justify-between flex items-center">
              Sell Tokens
              <Button
                onClick={handleRefresh}
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 rounded-full"
                disabled={Date.now() - lastRefresh < 3000}
              >
                <RefreshCcw className="h-4 w-4" />
                <span className="sr-only">Refresh</span>
              </Button>
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Enter the amount of tokens you want to sell to fulfill this buy order. Your payment instructions will be encrypted for security.
            </AlertDialogDescription>
          </div>
        </div>
      </AlertDialogHeader>
      
      {/* Display error if vault data failed to load */}
      {vaultError && (
        <div className="mt-2 p-3 bg-red-50 dark:bg-red-950 rounded-md border border-red-200 dark:border-red-800">
          <div className="text-sm text-red-700 dark:text-red-300">
            Error loading vault data: {vaultError}
          </div>
        </div>
      )}

      {/* Display wallet and trust vault information using data from useVaultBalance */}
     <div className="relative flex min-h-[100px] flex-col space-y-3 rounded-xl border border-gray-600 p-4 focus-within:border-blue-500 bg-gray-800">
        <div className="flex justify-between mb-2">
          <span>Your wallet balance:</span>
          <span>
            {isLoadingBalance ? (
              <span>
                <Loader2 className="h-4 w-4 inline animate-spin" />
              </span>
            )  : (
              <TokenDisplay
                amount={walletTokenBalance !== null ? walletTokenBalance.toFixed(2) : "Loading..."}
                symbol={tokenMetadata?.metadata?.symbol || "Token"}
                logoURI={tokenMetadata?.metadata?.logoURI}
              />
            )}
          </span>
        </div>   
        
        {/* Separator line */}
        <hr className="border-t border-gray-200 dark:border-gray-700 mb-2" />
        
        {/* AVAILABLE FOR RESERVATION - from useVaultBalance hook */}
        <div className="flex justify-between font-medium text-green-600 dark:text-green-400">
          <span>Available for reservation:</span>
          <span>
            {vaultLoading ? (
              <span>
                <Loader2 className="h-4 w-4 inline animate-spin" />
              </span>
            ) : (
              <TokenDisplay
                amount={availableBalance !== null ? availableBalance.toFixed(2) : "Loading..."}
                symbol={tokenMetadata?.metadata?.symbol || "Token"}
                logoURI={tokenMetadata?.metadata?.logoURI}
              />
            )}
          </span>
        </div>
          
          {/* TOTAL RESERVED - from useVaultBalance hook */}
          {totalReserved !== null && totalReserved > 0 && (
            <div className="flex justify-between mt-1 text-amber-600 dark:text-amber-400">
              <span>Already reserved:</span>
              <span>{totalReserved.toFixed(2)} Tokens</span>
            </div>
          )}
        </div>

      {/* Amount input section */}
      <div className="relative flex min-h-[100px] flex-col space-y-3 rounded-xl border border-gray-600 p-4 focus-within:border-blue-500 bg-gray-800">
        <Label htmlFor="reserveAmount" className="block mb-2">Amount to Sell</Label>
        <div className="flex gap-4 mb-2">
          <Button 
            variant="outline" 
            onClick={handleHalfAmount} 
            size="sm"
            disabled={!availableBalance || availableBalance <= 0}
            className="px-2 py-1 text-xs text-white bg-gray-900 rounded"
          >
            Half Order
          </Button>
          <Button 
            variant="outline" 
            onClick={handleMaxAmount} 
            size="sm"
            disabled={!availableBalance || availableBalance <= 0 }
            className="px-2 py-1 text-xs text-white bg-gray-900 rounded"
          >
            Max Order
          </Button>
        </div>
        <Input
          id="reserveAmount"
          type="number"
          value={reserveAmount}
          onChange={(e) => setReserveAmount(e.target.value)}
          placeholder="Enter amount"
          className="relative rounded-lg border border-gray-600 p-3 bg-gray-700 focus-within:border-blue-500"
          max={availableBalance || undefined}
          step="0.01"
        />
        {availableBalance && availableBalance > 0 && (
          <div className="text-sm text-muted-foreground mt-1">
            Maximum allowed: {Math.min(walletTokenBalance || Infinity, availableBalance).toFixed(2)} Tokens
          </div>
        )}
      </div>
      
      {/* Collapsible Payment details section */}
      <div className="relative flex flex-col rounded-xl border border-gray-600 bg-gray-800">
        <button
          type="button"
          onClick={() => setIsPaymentDetailsOpen(!isPaymentDetailsOpen)}
          className="flex items-center justify-between p-4 hover:bg-gray-700 transition-colors rounded-t-xl"
        >
          <div className="flex items-center">
            <CreditCard className="w-4 h-4 mr-2" />
            <h3 className="font-medium">Payment Details 🔐</h3>
          </div>
          {isPaymentDetailsOpen ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>
        
        {isPaymentDetailsOpen && (
          <div className="space-y-4 p-4 border border-gray-600 rounded-xl bg-gray-800 animate-in fade-in duration-200">
            <div className="text-xs text-gray-400 p-3 bg-blue-900/20 rounded-lg border border-blue-800">
              🔒 Your payment details will be encrypted and associated with your wallet address for security.
            </div>
            
            <div className="space-y-4">
              {/* Bank Name and Account Number side by side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="bankName" className="text-gray-300 text-sm">Bank Name</Label>
                  <Input
                    id="bankName"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="Enter your bank name"
                    className="relative rounded-lg border border-gray-600 p-3 bg-gray-700 focus-within:border-blue-500"
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="accountNumber" className="text-gray-300 text-sm">Account Number</Label>
                  <Input
                    id="accountNumber"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder="Enter account number"
                    className="relative rounded-lg border border-gray-600 p-3 bg-gray-700 focus-within:border-blue-500"
                    required
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="accountName" className="block mb-1">Account Name</Label>
                <Input
                  id="accountName"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="Enter account holder name"
                  className="relative rounded-lg border border-gray-600 p-3 bg-gray-700 focus-within:border-blue-500"
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="additionalInstructions" className="block mb-1">Additional Instructions (Optional)</Label>
                <Input
                  id="additionalInstructions"
                  value={additionalInstructions}
                  onChange={(e) => setAdditionalInstructions(e.target.value)}
                  placeholder="Any additional payment instructions"
                  className="relative rounded-lg border border-gray-600 p-3 bg-gray-700 focus-within:border-blue-500"
                />
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Payment calculation summary */}
      {parseFloat(reserveAmount) > 0 && (
        <div className="relative flex min-h-[100px] flex-col space-y-3 rounded-xl border border-gray-600 p-4 focus-within:border-blue-500 bg-gray-800">
          <div className="font-medium">Expected Payment Summary:</div>
          <div className="flex justify-between mt-2">
            <span>Tokens to sell:</span>
            <span>{parseFloat(reserveAmount).toFixed(2)}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span>Price per token:</span>
            <span>{formatCurrency(pricePerToken)}</span>
          </div>
          <div className="flex justify-between mt-1 pt-2 border-t border-gray-200 font-medium">
            <span>Total to Receive:</span>
            <span>{formatCurrency(fiatAmount)}</span>
          </div>
        </div>
      )}

      <AlertDialogFooter className="mt-6">
        <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
        <AlertDialogAction 
          className="bg-orange-500 hover:bg-orange-700 text-black"
          onClick={handleReserveBuyOrder} 
          disabled={
            isDisabled || 
            isSubmitting || 
            !parseFloat(reserveAmount) || 
            !bankName.trim() || 
            !accountName.trim() || 
            !accountNumber.trim() ||
            (availableBalance !== null && parseFloat(reserveAmount) > availableBalance) ||
            (walletTokenBalance !== null && parseFloat(reserveAmount) > walletTokenBalance)
          }
        >
          {isEncrypting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Encrypting...
            </>
          ) : reserveTokens.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Reserving...
            </>
          ) : (
            <>
              <LockIcon className="w-4 h-4 mr-2" />
              Confirm Sell
            </>
          )}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
};

export default SellTokensButton;