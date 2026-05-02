"use client";
import React, { useCallback, useState, useEffect } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../ui/dialog";
import {
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from "../../ui/form";
import { useForm } from "react-hook-form";
import { CreateBuyOrderSchema, CreateBuyOrderSchemaType } from "@/schemas/buyOrderSchema";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "../../ui/input";
import { Button } from "../../ui/button";
import { toast } from "sonner";
import useTrustVaultProgram from "@/hooks/useTrustVaultProgram";
import { ChevronDown, ChevronUp, Coins, DollarSign, InfoIcon, Loader2, ShoppingCart } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { TokenSelect } from "../../ui/select";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, PublicKey } from "@solana/web3.js";
import { z } from 'zod';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../ui/tooltip";
import { encryptPaymentInstructions } from "@/lib/encryptionApi";
import  TokenDisplay  from "@/components/ui/token-display";
import { useTokenMetadata } from "@/hooks/useTokenMetadata";
import { FEE_PERCENTAGE, MIN_FEE,MAX_FEE_PERCENTAGE} from "@/utils/constants";

// Extended schema with payment instruction fields
const ExtendedTrustVaultSchema = CreateBuyOrderSchema.extend({
  paymentType: z.string().min(1, "Payment type is required"),
  additionalInstructions: z.string().optional(),
});

// Extended schema type
type ExtendedTrustVaultSchemaType = CreateBuyOrderSchemaType & {
  paymentType: string;
  additionalInstructions?: string;
};

type TokenInfo = {  
  mint: string;
  balance: number;
};

type Props = {
  trigger: React.ReactNode;
};

const CreateBuyDialog: React.FC<Props> = ({ trigger }) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { createBuyOrder } = useTrustVaultProgram();
  const { publicKey, wallet } = useWallet();
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [selectedToken, setSelectedToken] = useState<string | null>(null);
  const [feeAmount, setFeeAmount] = useState<number>(0);
  const [paymentInstructionsOpen, setPaymentInstructionsOpen] = useState(false);
  const [isEncrypting, setIsEncrypting] = useState(false);
  const allowedMints = process.env.NEXT_PUBLIC_ALLOWED_MINTS?.split(",") || [];
  const tokenMetadata = useTokenMetadata(selectedToken || "");


  const form = useForm<z.input<typeof ExtendedTrustVaultSchema>>({ 
  resolver: zodResolver(ExtendedTrustVaultSchema),
  defaultValues: {
    mint: "",
    deposit: 0,
    pricePerToken: 0,
    currency: "",
    paymentType: "",
    additionalInstructions: "",
  },
});

  // Calculate fee whenever deposit amount changes
    useEffect(() => {
    const rawDepositAmount = form.watch("deposit");
    // Explicitly convert the watched value to a number
    const depositAmount = parseFloat(String(rawDepositAmount));

    // Check if it's a valid number and greater than 0
    if (!isNaN(depositAmount) && depositAmount > 0) {
        const calculatedFee = Math.max(depositAmount * (FEE_PERCENTAGE / 100), MIN_FEE);
        // Cap the fee at the maximum percentage
        const cappedFee = Math.min(calculatedFee, depositAmount * (MAX_FEE_PERCENTAGE / 100));
        setFeeAmount(parseFloat(cappedFee.toFixed(6))); // Limit to 6 decimal places for display
    } else {
        setFeeAmount(0);
    }
    }, [form.watch("deposit")]);

  useEffect(() => {
    const fetchTokens = async () => {
      if (!publicKey) {
        
        // Still show allowed mints even without wallet connection for buy orders
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
        const slot = await connection.getSlot();
        const { getAssociatedTokenAddress } = await import("@solana/spl-token");
        const tokenPromises = allowedMints.map(async (mint) => {
        
          
          try {
            // Try Token-2022 program first
            const ata2022 = await getAssociatedTokenAddress(
              new PublicKey(mint),
              publicKey,
              false, // allowOwnerOffCurve
              new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb") // Token-2022 program
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
          
          }

          try {
            // Fallback to regular SPL token
            const ataRegular = await getAssociatedTokenAddress(
              new PublicKey(mint),
              publicKey,
              false, // allowOwnerOffCurve
              new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") // Regular SPL Token program
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
            
          }

          // If no account found, return with zero balance (user can still create buy orders)
          
          return {
            mint,
            balance: 0,
          };
        });

        // Wait for all token lookups to complete
        const userTokens = await Promise.all(tokenPromises);
        
        
        setTokens(userTokens);

      } catch (error) {
        console.error("❌ Error fetching tokens:", error);
        
        // Ultimate fallback: show all allowed mints with zero balance
        
        const fallbackTokens: TokenInfo[] = allowedMints.map(mint => ({
          mint,
          balance: 0
        }));
        
        setTokens(fallbackTokens);
      }
    };

    fetchTokens();
  }, [publicKey]);

 const onSubmit = useCallback(
  async (values: z.input<typeof ExtendedTrustVaultSchema>) => {
    const coercedValues = values as ExtendedTrustVaultSchemaType; 

    if (!selectedToken) {
      toast.error("Please select a token.");
      return;
    }

    setIsEncrypting(true);

    try {
      const paymentData = {
        paymentType: coercedValues.paymentType, 
        additionalInstructions: coercedValues.additionalInstructions || "" 
      };

      const encryptionResponse = await encryptPaymentInstructions(paymentData);

      if (!encryptionResponse.success) {
        throw new Error(encryptionResponse.error || 'Failed to encrypt payment instructions');
      }

      const trustVaultData = {
        mint: coercedValues.mint,
        amount: coercedValues.deposit, 
        pricePerToken: coercedValues.pricePerToken, 
        currency: coercedValues.currency, 
        paymentInstructions: encryptionResponse.encryptedData!,
        keyId: encryptionResponse.keyId!
      };

      const solanaResult = await createBuyOrder.mutateAsync(trustVaultData);

      toast.success("Buy order created with encrypted payment instructions!");

      form.reset();
      queryClient.invalidateQueries({
        queryKey: ["get-buy-orders"],
      });
      setOpen(false);

    } catch (error) {
      console.error("❌ Error in encrypted buy order creation:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create buy order");
    } finally {
      setIsEncrypting(false);
    }
  },
  [form, createBuyOrder, queryClient, selectedToken]
);

  const depositAmount = (amount: number) => {
    
    form.setValue("deposit", amount);
  };

  // Calculate effective deposit (after fee)
  const effectiveDeposit = parseFloat(String(form.watch("deposit"))) - feeAmount;
  const watchedDeposit = form.watch("deposit");
  const displayDeposit = typeof watchedDeposit === 'number' && watchedDeposit === 0 ? "" : String(watchedDeposit);
  const isSubmitting = createBuyOrder.isPending || isEncrypting;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-gray-900 border-gray-700">
        <DialogHeader className="relative"> 
          <div className="flex items-center space-x-3">
            <div className="relative">
              <div className="relative bg-gradient-to-r from-green-500 to-green-600 p-2.5 rounded-lg">
                <ShoppingCart className="w-8 h-8 text-white" />
              </div>
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-white">
                Create a new Buy Order
              </DialogTitle>
              <DialogDescription className="text-gray-400">
                This will create a new buy order for you to trade tokens. Your payment instructions will be encrypted for security.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <Form {...form}>
        <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
          
          {/* Section 1: Token Selection */}
           <div className="space-y-3">
            <div className="flex items-center gap-2 text-gray-300">
              <Coins className="w-4 h-4 text-blue-400"/>
              <span className="text-sm font-medium">Select Token To Sell</span>
            </div>
            <FormItem>
              <FormControl>
                <div className="relative flex min-h-[100px] flex-col space-y-3 rounded-xl border border-gray-600 p-4 focus-within:border-blue-500 bg-gray-800">
                 
                  <div className="flex flex-1 items-center space-x-2">
                    <div className="group/select flex items-center justify-between">
                      <TokenSelect
                        tokens={tokens}
                        onTokenChange={(token) => {
                         
                          if (token && token.mint) {
                            setSelectedToken(token.mint);
                            form.setValue("mint", token.mint);
                            depositAmount(0);
                          } else {
                            console.warn("Invalid token or mint received:", token);
                            setSelectedToken(null);
                            form.setValue("mint", "");
                            depositAmount(0);
                          }
                         
                        }}
                        onMaxClick={(balance) => depositAmount(balance)}
                        onHalfClick={(balance) => depositAmount(balance / 2)}
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
                          className="h-full w-full bg-transparent text-right placeholder:text-gray-500 text-2xl outline-none font-semibold text-white"
                          type="number"
                          value={displayDeposit} 
                          onChange={(e) => {
                            const newValue = e.target.value === "" ? 0 : Number(e.target.value);
                            depositAmount(newValue);
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
              <div className="flex items-center gap-2 text-gray-300">
                <DollarSign className="w-4 h-4 text-green-400"/>
                <span className="text-sm font-medium">Price Per Token</span>
              </div>
              <FormItem>
                <FormControl>
                  <div className="relative rounded-xl border border-gray-600 p-4 bg-gray-800 focus-within:border-green-500">
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0"
                      className="w-full bg-transparent text-white text-lg outline-none placeholder:text-gray-500"
                      {...form.register("pricePerToken", { 
                        valueAsNumber: true,
                      })}
                    />
                    <div className="text-xs text-gray-400 mt-1">Set your desired price per token</div>
                  </div>
                </FormControl>
              </FormItem>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-gray-300">
                <span className="w-4 h-4 text-purple-400">💱</span>
                <span className="text-sm font-medium">Currency</span>
              </div>
              <FormItem>
                <FormControl>
                  <div className="relative rounded-xl border border-gray-600 p-4 bg-gray-800 focus-within:border-purple-500">
                    <input
                      type="text"
                      maxLength={3}
                      placeholder=""
                      className="w-full bg-transparent text-white text-lg outline-none placeholder:text-gray-500"
                      {...form.register("currency")}
                    />
                    <div className="text-xs text-gray-400 mt-1">3-letter code (e.g. NGN, USD)</div>
                  </div>
                </FormControl>
              </FormItem>
            </div>
          </div>

          {/* Section 3: Payment Section */}
          <div className="bg-gray-800 rounded-lg p-4 space-y-3">
            <div 
              className="flex justify-between items-center cursor-pointer hover:bg-gray-700 rounded p-2 -m-2"
              onClick={() => setPaymentInstructionsOpen(!paymentInstructionsOpen)}
            >
              <h3 className="text-lg font-medium text-white">Payment Instructions 🔐</h3>
              <Button variant="ghost" size="icon" type="button" className="text-gray-400 hover:text-white">
                {paymentInstructionsOpen ? 
                  <ChevronUp className="h-5 w-5" /> : 
                  <ChevronDown className="h-5 w-5" />
                }
              </Button>
            </div>
            
            {paymentInstructionsOpen && (
              <div className="pt-2 space-y-4 animate-in fade-in duration-200">
                <div className="text-sm text-blue-200 mb-3 p-3 bg-blue-900/50 rounded border border-blue-800">
                  🔒 Your payment details will be encrypted before being stored on the blockchain for security.
                </div>
                
                <FormItem>
                  <FormLabel className="text-gray-200">Payment Type</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      className="bg-gray-700 border-gray-600 text-white placeholder:text-gray-400"
                      {...form.register("paymentType")}
                      placeholder="Enter payment type (e.g., Bank Transfer, Mobile Money)"
                    />
                  </FormControl>
                </FormItem>
                <FormItem>
                  <FormLabel className="text-gray-200">Additional Instructions</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      className="bg-gray-700 border-gray-600 text-white placeholder:text-gray-400 min-h-[80px] py-2"
                      {...form.register("additionalInstructions")}
                      placeholder="Any additional payment instructions for the seller"
                    />
                  </FormControl>
                  <FormDescription className="text-gray-400">Optional additional instructions or notes</FormDescription>
                </FormItem>
              </div>
            )}
          </div>

          {/* Section 4: Fee Display Section */}
          {parseFloat(String(form.watch("deposit"))) > 0 && (
            <div className="bg-gray-800 rounded-lg p-4 space-y-3">
              <h3 className="text-lg font-medium text-white border-b border-gray-700 pb-2">Fee Information</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-medium text-gray-200">Protocol Fee ({FEE_PERCENTAGE}%)</span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <InfoIcon className="h-4 w-4 text-gray-400" />
                        </TooltipTrigger>
                        <TooltipContent className="bg-gray-700 border-gray-600">
                          <p className="w-[250px] text-xs text-gray-200">
                            A {FEE_PERCENTAGE}% fee is charged on all trust vault deposits, with a minimum fee of {MIN_FEE} tokens.
                            This fee helps maintain the platform and its services.
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
                  <span className="text-sm font-medium text-gray-200">Effective Deposit</span>
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
        <DialogFooter className="bg-gray-900">
          <DialogClose asChild>
            <Button
              variant={"secondary"}
              type="button"
              onClick={() => {
                form.reset();
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </DialogClose>
         <Button
            onClick={form.handleSubmit(onSubmit)}
            disabled={isSubmitting}
          >
            {isEncrypting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Encrypting...
              </>
            ) : createBuyOrder.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Buy Tokens"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateBuyDialog;