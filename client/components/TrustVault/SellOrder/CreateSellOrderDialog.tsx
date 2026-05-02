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
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import useTrustVaultProgram from "@/hooks/useTrustVaultProgram";
import { ChevronDown, ChevronUp, Coins, CreditCard, DollarSign, InfoIcon, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { TokenSelect } from "@/components/ui/select";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, PublicKey } from "@solana/web3.js";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import TokenDisplay from "@/components/ui/token-display";
import { useTokenMetadata } from "@/hooks/useTokenMetadata";
import { encryptPaymentInstructions } from "@/lib/encryptionApi";
import {FEE_PERCENTAGE, MAX_FEE_PERCENTAGE, MIN_FEE } from "@/utils/constants"
import {Props, TokenInfo,ExtendedSellOrderSchemaType, ExtendedSellOrderSchema } from "@/types/trustVault"


const CreateSellOrderDialog: React.FC<Props> = ({ trigger }) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { createSellOrder } = useTrustVaultProgram();
  const { publicKey, wallet } = useWallet();
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [selectedToken, setSelectedToken] = useState<string | null>(null);
  const [feeAmount, setFeeAmount] = useState<number>(0);
  const [paymentInstructionsOpen, setPaymentInstructionsOpen] = useState(false);
  const [isEncrypting, setIsEncrypting] = useState(false);
  const allowedMints = process.env.NEXT_PUBLIC_ALLOWED_MINTS?.split(",") || [];
  const tokenMetadata = useTokenMetadata(selectedToken || "");
  const form = useForm<ExtendedSellOrderSchemaType>({
    resolver: zodResolver(ExtendedSellOrderSchema),
    defaultValues: {
      mint: "",
      deposit: 0,
      pricePerToken: 0,
      currency: "",
      bankName: "",
      accountNumber: "",
      accountName: "",
      additionalInstructions: "",
    },
  });

  // Calculate fee whenever deposit amount changes
  useEffect(() => {
    const depositAmount = form.watch("deposit");
    if (depositAmount > 0) {
      const calculatedFee = Math.max(depositAmount * (FEE_PERCENTAGE / 100), MIN_FEE);
      // Cap the fee at the maximum percentage
      const cappedFee = Math.min(calculatedFee, depositAmount * (MAX_FEE_PERCENTAGE / 100));
      setFeeAmount(parseFloat(cappedFee.toFixed(6))); // Limit to 6 decimal places for display
    } else {
      setFeeAmount(0);
    }
  }, [form.watch("deposit")]);

  // FetchTokens function for both SPL Token and Token-2022
  useEffect(() => {
    const fetchTokens = async () => {
      if (!publicKey) {
       
        // show allowed mints for buy orders
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
       
        
        // Add connection test
        const slot = await connection.getSlot();
       

        // Import getAssociatedTokenAddress for direct token account lookups
        const { getAssociatedTokenAddress } = await import("@solana/spl-token");

        // Fetch specific token accounts for each allowed mint
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
    async (values: ExtendedSellOrderSchemaType) => {
      if (!selectedToken) {
        toast.error("Please select a token.");
        return;
      }

      setIsEncrypting(true);

      try {
        // Step 1: Construct payment instructions for CreateSellOrderDialog format
        const paymentData = {
          bankName: values.bankName,
          accountNumber: values.accountNumber,
          accountName: values.accountName,
          additionalInstructions: values.additionalInstructions || ""
        };

       

        // Step 2: Encrypt payment instructions via API
        const encryptionResponse = await encryptPaymentInstructions(paymentData);

        if (!encryptionResponse.success) {
          throw new Error(encryptionResponse.error || 'Failed to encrypt payment instructions');
        }

       

        // Step 3: Submit to Solana with encrypted data and keyId for association
        const trustVaultData = {
          mint: values.mint,
          deposit: values.deposit,
          pricePerToken: values.pricePerToken,
          currency: values.currency,
          // Use encrypted data instead of plain text
          paymentInstructions: encryptionResponse.encryptedData!,
          // Pass keyId for automatic association
          keyId: encryptionResponse.keyId!
        };

        

        // Step 4: Execute Solana transaction (now includes automatic key association)
        const solanaResult = await createSellOrder.mutateAsync(trustVaultData);

      

        toast.success("Sell Order created with encrypted payment instructions!");

        // Reset form and close dialog
        form.reset();
        queryClient.invalidateQueries({
          queryKey: ["get-trust-vault-accounts"],
        });
        setOpen(false);

      } catch (error) {
        console.error("❌ Error in encrypted sell order creation:", error);
        toast.error(error instanceof Error ? error.message : "Failed to sell order vault");
      } finally {
        setIsEncrypting(false);
      }
    },
    [form, createSellOrder, queryClient, selectedToken]
  );

  const depositAmount = (amount: number) => {
   
    form.setValue("deposit", amount);
  };

  // Calculate effective deposit (after fee)
  const effectiveDeposit = form.watch("deposit") - feeAmount;

  const isSubmitting = createSellOrder.isPending || isEncrypting;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger> 
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-gray-900 border-gray-700">

        <DialogHeader className="relative"> 
          <div className="flex items-center space-x-3">
            <div className="relative">
              <div className="relative bg-gradient-to-r from-orange-500 to-orange-600 p-2.5 rounded-lg">
                <DollarSign className="w-5 h-5 text-white" />
              </div>
            </div>
              <div>
                <DialogTitle className="text-xl font-bold text-white">
                   Make a new Sell Order
                </DialogTitle >
                <DialogDescription className="text-gray-400">
                   This will create a new sell order for you to trade tokens. Your payment instructions will be encrypted for security.
                </DialogDescription>
              </div>
          </div>
        </DialogHeader>
        <Form {...form}>
        <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
          
          {/* SECTION 1: TOKEN SELECTION */}
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
                          value={form.watch("deposit") === 0 ? "" : form.watch("deposit")}
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

          {/* SECTION 2: PRICE SECTION */}
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

          {/* SECTION 3: PAYMENT SECTION */}
          <div className="relative flex flex-col rounded-xl border border-gray-600 bg-gray-800">
            <button
                type="button"
                onClick={() => setPaymentInstructionsOpen(!paymentInstructionsOpen)}
                className="flex items-center justify-between p-4 hover:bg-gray-700 transition-colors rounded-t-xl"
              >
                <div className="flex items-center">
                  <CreditCard className="w-4 h-4 mr-2" />
                  <h3 className="font-medium">Payment Details 🔐</h3>
                </div>
                {paymentInstructionsOpen ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
            
            {paymentInstructionsOpen && (
              <div className="space-y-4 p-4 border border-gray-600 rounded-xl bg-gray-800 animate-in fade-in duration-200">
                <div className="text-xs text-gray-400 p-3 bg-blue-900/20 rounded-lg border border-blue-800">
                  🔒 Your payment details will be encrypted before being stored on the blockchain for security.
                </div>
                
                {/* Bank Name and Account Number side by side */}
                <div className="grid grid-cols-2 gap-4">
                  <FormItem>
                    <FormLabel className="text-gray-300 text-sm">Bank Name</FormLabel>
                    <FormControl>
                      <div className="relative rounded-lg border border-gray-600 p-3 bg-gray-700 focus-within:border-blue-500">
                        <input
                          type="text"
                          placeholder="Enter bank name"
                          className="w-full bg-transparent text-white outline-none placeholder:text-gray-500"
                          {...form.register("bankName")}
                        />
                      </div>
                    </FormControl>
                  </FormItem>
                  
                  <FormItem>
                    <FormLabel className="text-gray-300 text-sm">Account Number</FormLabel>
                    <FormControl>
                      <div className="relative rounded-lg border border-gray-600 p-3 bg-gray-700 focus-within:border-blue-500">
                        <input
                          type="text"
                          placeholder="Enter account number"
                          className="w-full bg-transparent text-white outline-none placeholder:text-gray-500"
                          {...form.register("accountNumber")}
                        />
                      </div>
                    </FormControl>
                  </FormItem>
                </div>
                
                <FormItem>
                  <FormLabel className="text-gray-300 text-sm">Account Name</FormLabel>
                  <FormControl>
                    <div className="relative rounded-lg border border-gray-600 p-3 bg-gray-700 focus-within:border-blue-500">
                      <input
                        type="text"
                        placeholder="Enter account name"
                        className="w-full bg-transparent text-white outline-none placeholder:text-gray-500"
                        {...form.register("accountName")}
                      />
                    </div>
                  </FormControl>
                </FormItem>
                
                <FormItem>
                  <div className="text-sm text-gray-300 mb-2">
                    <FormLabel className="font-medium inline">
                      Additional Instructions:
                    </FormLabel>
                    <FormDescription className="text-xs text-gray-500 inline ml-1">
                      (Optional additional instructions or notes)
                    </FormDescription>
                  </div>
                  <FormControl>
                    <div className="relative rounded-lg border border-gray-600 p-3 bg-gray-700 focus-within:border-blue-500">
                      <textarea
                        placeholder="Any additional payment instructions for the buyer"
                        rows={3}
                        className="w-full bg-transparent text-white outline-none placeholder:text-gray-500 resize-none"
                        {...form.register("additionalInstructions")}
                      />
                    </div>
                  </FormControl>
                  
                </FormItem>
              </div>
            )}
          </div>

          {/* SECTION 4: FEE DISPLAY SECTION */}
          {form.watch("deposit") > 0 && (
            <div className="rounded-xl bg-gray-800 border border-gray-600 p-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-300">Protocol Fee ({FEE_PERCENTAGE}%)</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <InfoIcon className="h-4 w-4 text-gray-500" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="w-[250px] text-xs">
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
              <div className="flex justify-between items-center mt-2">
                <span className="text-sm font-medium text-gray-300">Effective Deposit</span>
                <TokenDisplay
                  amount={effectiveDeposit.toFixed(2)}
                  symbol={tokenMetadata?.metadata?.symbol}
                  logoURI={tokenMetadata?.metadata?.logoURI}
                />
              </div>
            </div>
          )}

          <FormMessage />
        </form>
        </Form>
        <DialogFooter className="flex gap-3 pt-4">
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
            className="bg-orange-700 hover:bg-orange-800 text-white border border-black p-2 disabled:opacity-50"
          >
            {isEncrypting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Encrypting...
              </>
            ) : createSellOrder.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Sell Tokens"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateSellOrderDialog;