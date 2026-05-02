// components/payment-requests/CreateRequestDialog.tsx
"use client";
import React, { useState, useEffect } from "react";
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
  FormDescription,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/text-area";
import { Loader2, Send, User, Building2, ChevronDown, Coins, Plus, Save, Trash } from "lucide-react";
import { usePaymentRequests } from "@/hooks/express/usePaymentRequest";
import { z } from "zod";
import { PublicKey, Connection } from "@solana/web3.js";
import { TokenSelect, TokenInfo } from "@/components/ui/select";
import { useWallet } from "@solana/wallet-adapter-react";
import { useBeneficiaries, Beneficiary } from "@/hooks/express/useBeneficiaries";

type TokenRequestPayload = {
  requestType: 'token';
  payerWallet: string;
  tokenMint: string;
  tokenAmount: number;
  note?: string;
};

type FiatRequestPayload = {
  requestType: 'fiat';
  payerWallet: string;
  fiatAmount: number;
  currency: string;
  payoutDetails: {
    type: 'bank_transfer' | 'mobile_money' | 'flutterwave_wallet';
    account_number: string;
    bank_code?: string;
    beneficiary_name: string;
    phone_number?: string;
    network?: string;
  };
  note?: string;
};

type PaymentRequestPayload = TokenRequestPayload | FiatRequestPayload;
// Schema for Token Request
const TokenRequestSchema = z.object({
  payerWallet: z.string().refine((val) => {
    try {
      new PublicKey(val);
      return true;
    } catch {
      return false;
    }
  }, "Invalid wallet address"),
  tokenMint: z.string().min(1, "Please select a token"),
  tokenAmount: z.number().positive("Amount must be positive"),
  note: z.string().optional(),
});

// Schema for Fiat Request
const FiatRequestSchema = z.object({
  payerWallet: z.string().refine((val) => {
    try {
      new PublicKey(val);
      return true;
    } catch {
      return false;
    }
  }, "Invalid wallet address"),
  fiatAmount: z.number().positive("Amount must be positive").max(10000000),
  currency: z.string().length(3),
  payoutDetails: z.object({
    type: z.enum(["bank_transfer", "mobile_money", "flutterwave_wallet"]),
    account_number: z.string().min(1, "Account number is required"),
    bank_code: z.string().optional(),
    beneficiary_name: z.string().min(1, "Beneficiary name is required"),
    phone_number: z.string().optional(),
    network: z.string().optional(),
  }),
  note: z.string().optional(),
});

type TokenRequestType = z.infer<typeof TokenRequestSchema>;
type FiatRequestType = z.infer<typeof FiatRequestSchema>;

interface Props {
  trigger: React.ReactNode;
}

const CreateRequestDialog: React.FC<Props> = ({ trigger = [] }) => {
  const [open, setOpen] = useState(false);
  const [requestType, setRequestType] = useState<"token" | "fiat">("fiat");
  const [payoutType, setPayoutType] = useState<"bank_transfer" | "mobile_money" | "flutterwave_wallet">("bank_transfer");
  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(null);
  const { createRequest } = usePaymentRequests();
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const { publicKey } = useWallet();
  const allowedMints = process.env.NEXT_PUBLIC_ALLOWED_MINTS?.split(",") || [];
  const [showBeneficiaries, setShowBeneficiaries] = useState(false);
  const [saveBeneficiaryDialog, setSaveBeneficiaryDialog] = useState(false);
  const [beneficiaryNickname, setBeneficiaryNickname] = useState("");
  const { beneficiaries, saveBeneficiary, deleteBeneficiary } = useBeneficiaries(publicKey?.toString());

  // Token Request Form
  const tokenForm = useForm<TokenRequestType>({
    resolver: zodResolver(TokenRequestSchema),
    defaultValues: {
      payerWallet: "",
      tokenMint: "",
      tokenAmount: 0,
      note: "",
    },
  });

  // Fiat Request Form
  const fiatForm = useForm<FiatRequestType>({
    resolver: zodResolver(FiatRequestSchema),
    defaultValues: {
      payerWallet: "",
      fiatAmount: 0,
      currency: "NGN",
      payoutDetails: {
        type: "bank_transfer" as const,
        account_number: "",
        bank_code: "",
        beneficiary_name: "",
        phone_number: "",
        network: "",
      },
      note: "",
    },
  });

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


  

const onSubmitToken = async (values: TokenRequestType) => {
  try {
    const payload: TokenRequestPayload = {
      requestType: "token",
      ...values,
    };
    await createRequest.mutateAsync(payload);
    tokenForm.reset();
    setOpen(false);
  } catch (error) {
    console.error('Error creating token request:', error);
  }
};


const onSubmitFiat = async (values: FiatRequestType) => {
  try {
    const payload: FiatRequestPayload = {
      requestType: "fiat",
      ...values,
    };
    await createRequest.mutateAsync(payload);
    fiatForm.reset();
    setOpen(false);
  } catch (error) {
    console.error('Error creating fiat request:', error);
  }
};

  const handleTokenChange = (token: TokenInfo | null) => {
    setSelectedToken(token);
    if (token) {
      tokenForm.setValue("tokenMint", token.mint);
    }
  };

const handleBeneficiarySelect = (beneficiary: Beneficiary) => {
  if (requestType === "token") {
    tokenForm.setValue("payerWallet", beneficiary.wallet_address);
  } else {
    fiatForm.setValue("payerWallet", beneficiary.wallet_address);
    
    // Populate payout details if they exist
    if (beneficiary.account_number) {
      fiatForm.setValue("payoutDetails.account_number", beneficiary.account_number);
    }
    if (beneficiary.account_name) {
      fiatForm.setValue("payoutDetails.beneficiary_name", beneficiary.account_name);
    }
    if (beneficiary.bank_name) {
      fiatForm.setValue("payoutDetails.bank_code", beneficiary.bank_name);
    }
  }
  setShowBeneficiaries(false);
};

const handleSaveBeneficiary = async () => {
  if (!publicKey || !beneficiaryNickname) return;
  
  const walletAddress = requestType === "token" 
    ? tokenForm.getValues("payerWallet")
    : fiatForm.getValues("payerWallet");

  const beneficiaryData: Omit<Beneficiary, 'id' | 'created_at' | 'updated_at'> = {
    user_wallet: publicKey.toString(),
    nickname: beneficiaryNickname,
    wallet_address: walletAddress,
  };

  // Only add bank details for fiat requests
  if (requestType === "fiat") {
    const fiatValues = fiatForm.getValues();
    beneficiaryData.bank_name = fiatValues.payoutDetails?.bank_code;
    beneficiaryData.account_number = fiatValues.payoutDetails?.account_number;
    beneficiaryData.account_name = fiatValues.payoutDetails?.beneficiary_name;
  }

  await saveBeneficiary.mutateAsync(beneficiaryData);

  setBeneficiaryNickname("");
  setSaveBeneficiaryDialog(false);
};

  const currencies = [
    { code: "NGN", symbol: "₦" },
    { code: "USD", symbol: "$" },
    { code: "KES", symbol: "KSh" },
    { code: "GHS", symbol: "₵" },
    { code: "ZAR", symbol: "R" },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-gray-900 border-gray-700">
        <DialogHeader>
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-r from-purple-500 to-pink-600 p-2.5 rounded-lg">
              <Send className="w-6 h-6 text-white" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-white">
                Request Payment
              </DialogTitle>
              <DialogDescription className="text-gray-400">
                Request payment from another user
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Request Type Selection */}
        <div className="space-y-3 pb-4 border-b border-gray-700">
          <div className="flex items-center gap-2 text-gray-300">
            <Coins className="w-4 h-4 text-purple-400"/>
            <span className="text-sm font-medium">Request Type</span>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setRequestType("token")}
              className={`p-4 rounded-lg border text-sm font-medium transition-colors ${
                requestType === "token"
                  ? "border-purple-500 bg-purple-500/20 text-purple-300"
                  : "border-gray-600 bg-gray-800 text-gray-300 hover:border-gray-500"
              }`}
            >
              <div className="flex flex-col items-center gap-2">
                <Coins className="w-6 h-6" />
                <span>Token Request</span>
                <span className="text-xs text-gray-400">Request crypto tokens</span>
              </div>
            </button>
            
            <button
              type="button"
              onClick={() => setRequestType("fiat")}
              className={`p-4 rounded-lg border text-sm font-medium transition-colors ${
                requestType === "fiat"
                  ? "border-purple-500 bg-purple-500/20 text-purple-300"
                  : "border-gray-600 bg-gray-800 text-gray-300 hover:border-gray-500"
              }`}
            >
              <div className="flex flex-col items-center gap-2">
                <Building2 className="w-6 h-6" />
                <span>Fiat Request</span>
                <span className="text-xs text-gray-400">Request local currency</span>
              </div>
            </button>
          </div>
        </div>

        {/* Token Request Form */}
        {requestType === "token" && (
          <Form {...tokenForm}>
            <form onSubmit={tokenForm.handleSubmit(onSubmitToken)} className="space-y-6">
              
              {/* Payer Wallet */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-gray-300">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-blue-400"/>
                    <span className="text-sm font-medium">Request From (Wallet Address)</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowBeneficiaries(!showBeneficiaries)}
                    className="text-xs text-purple-400 hover:text-purple-300"
                  >
                    {showBeneficiaries ? "Hide" : "Show"} Beneficiaries
                  </Button>
                </div>
                
                {showBeneficiaries && beneficiaries && beneficiaries.length > 0 && (
                  <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 mb-2 max-h-40 overflow-y-auto">
                    <div className="space-y-2">
                      {beneficiaries.map((beneficiary: Beneficiary) => (
                        <div
                          key={beneficiary.id}
                          className="flex items-center justify-between p-2 hover:bg-gray-700 rounded-lg cursor-pointer transition-colors"
                          onClick={() => handleBeneficiarySelect(beneficiary)}
                        >
                          <div className="flex-1">
                            <div className="text-sm font-medium text-white">{beneficiary.nickname}</div>
                            <div className="text-xs text-gray-400 truncate">{beneficiary.wallet_address}</div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteBeneficiary.mutate(beneficiary.id);
                            }}
                            className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                          >
                            <Trash className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <FormItem>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type="text"
                        placeholder="Enter wallet address"
                        className="bg-gray-800 border-gray-600 text-white placeholder:text-gray-500 pr-10"
                        {...tokenForm.register("payerWallet")}
                      />
                      {tokenForm.watch("payerWallet") && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSaveBeneficiaryDialog(true)}
                          className="absolute right-1 top-1/2 -translate-y-1/2 text-green-400 hover:text-green-300 hover:bg-green-900/20"
                          title="Save as beneficiary"
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </FormControl>
                  <FormDescription className="text-gray-400 text-xs">
                    The wallet address of the person you&apos;re requesting payment from
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              </div>

              {/* Token Selection */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-gray-300">
                  <Coins className="w-4 h-4 text-green-400"/>
                  <span className="text-sm font-medium">Token</span>
                </div>
                <FormItem>
                  <FormControl>
                    <TokenSelect
                      tokens={tokens}
                      onTokenChange={handleTokenChange}
                      onMaxClick={(balance) => tokenForm.setValue("tokenAmount", balance)}
                      onHalfClick={(balance) => tokenForm.setValue("tokenAmount", balance / 2)}
                      className="w-full"
                    />
                  </FormControl>
                  <FormDescription className="text-gray-400 text-xs">
                    Select the token you want to receive
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              </div>

              {/* Token Amount */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-gray-300">
                  <span className="text-sm font-medium">Amount</span>
                </div>
                <FormItem>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.000001"
                      placeholder="0.00"
                      className="bg-gray-800 border-gray-600 text-white placeholder:text-gray-500"
                      {...tokenForm.register("tokenAmount", { 
                        valueAsNumber: true,
                        setValueAs: (v) => parseFloat(v) || 0 
                      })}
                    />
                  </FormControl>
                  {selectedToken && (
                    <FormDescription className="text-gray-400 text-xs">
                      Available: {selectedToken.balance.toFixed(6)} {selectedToken.tokenMetadata?.symbol}
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              </div>

              {/* Note */}
              <FormItem>
                <FormLabel className="text-gray-300 text-sm">Note (Optional)</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Add a note about this request..."
                    className="bg-gray-800 border-gray-600 text-white placeholder:text-gray-500 min-h-[80px]"
                    {...tokenForm.register("note")}
                  />
                </FormControl>
                <FormDescription className="text-gray-400 text-xs">
                  This note will be visible to the payer
                </FormDescription>
              </FormItem>

              {/* Info Box */}
              <div className="rounded-xl bg-blue-900/20 border border-blue-800 p-4">
                <div className="flex items-start gap-3">
                  <div className="text-blue-400 text-xl">ℹ️</div>
                  <div className="text-sm text-blue-200">
                    <div className="font-medium mb-1">Token Request</div>
                    <ul className="text-xs text-blue-300 space-y-1 list-disc list-inside">
                      <li>The payer will send tokens directly to your wallet</li>
                      <li>They&apos;ll receive a notification to accept or reject</li>
                      <li>Transaction happens on-chain when accepted</li>
                    </ul>
                  </div>
                </div>
              </div>

              <FormMessage />
            </form>
          </Form>
        )}

        {/* Fiat Request Form */}
        {requestType === "fiat" && (
          <Form {...fiatForm}>
            <form onSubmit={fiatForm.handleSubmit(onSubmitFiat)} className="space-y-6">
              
              {/* Payer Wallet */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-gray-300">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-blue-400"/>
                    <span className="text-sm font-medium">Request From (Wallet Address)</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowBeneficiaries(!showBeneficiaries)}
                    className="text-xs text-purple-400 hover:text-purple-300"
                  >
                    {showBeneficiaries ? "Hide" : "Show"} Beneficiaries
                  </Button>
                </div>
                
               {showBeneficiaries && beneficiaries && beneficiaries.length > 0 && (
                  <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 mb-2 max-h-40 overflow-y-auto">
                    <div className="space-y-2">
                      {beneficiaries.map((beneficiary: Beneficiary) => (
                        <div
                          key={beneficiary.id}
                          className="flex items-center justify-between p-2 hover:bg-gray-700 rounded-lg cursor-pointer transition-colors"
                          onClick={() => handleBeneficiarySelect(beneficiary)}
                        >
                          <div className="flex-1">
                            <div className="text-sm font-medium text-white">{beneficiary.nickname}</div>
                            <div className="text-xs text-gray-400 truncate">{beneficiary.wallet_address}</div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteBeneficiary.mutate(beneficiary.id);
                            }}
                            className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                          >
                            <Trash className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <FormItem>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type="text"
                        placeholder="Enter wallet address"
                        className="bg-gray-800 border-gray-600 text-white placeholder:text-gray-500 pr-10"
                        {...fiatForm.register("payerWallet")}
                      />
                      {fiatForm.watch("payerWallet") && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSaveBeneficiaryDialog(true)}
                          className="absolute right-1 top-1/2 -translate-y-1/2 text-green-400 hover:text-green-300 hover:bg-green-900/20"
                          title="Save as beneficiary"
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </FormControl>
                  <FormDescription className="text-gray-400 text-xs">
                    The wallet address of the person you&apos;re requesting payment from
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              </div>

              {/* Amount and Currency */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-gray-300">
                    <span className="text-sm font-medium">Amount</span>
                  </div>
                  <FormItem>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        className="bg-gray-800 border-gray-600 text-white placeholder:text-gray-500"
                        {...fiatForm.register("fiatAmount", { 
                          valueAsNumber: true,
                          setValueAs: (v) => parseFloat(v) || 0 
                        })}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-gray-300">
                    <span className="text-sm font-medium">Currency</span>
                  </div>
                  <FormItem>
                    <FormControl>
                      <div className="relative rounded-xl border border-gray-600 bg-gray-800 focus-within:border-purple-500">
                        <select
                          className="w-full bg-transparent border-0 p-3 text-white focus:outline-none appearance-none cursor-pointer"
                          {...fiatForm.register("currency")}
                        >
                          {currencies.map((currency) => (
                            <option 
                              key={currency.code} 
                              value={currency.code}
                              className="bg-gray-800 text-white"
                            >
                              {currency.symbol} ({currency.code})
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                </div>
              </div>

              {/* Payout Type Selection */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-gray-300">
                  <Building2 className="w-4 h-4 text-orange-400"/>
                  <span className="text-sm font-medium">Your Payout Method</span>
                </div>
                
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: "bank_transfer" as const, label: "Bank Transfer", icon: "🏦" },
                    { value: "mobile_money" as const, label: "Mobile Money", icon: "📱" },
                    { value: "flutterwave_wallet" as const, label: "Flutterwave", icon: "💳" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setPayoutType(option.value);
                        fiatForm.setValue("payoutDetails.type", option.value);
                      }}
                      className={`p-3 rounded-lg border text-sm font-medium transition-colors ${
                        payoutType === option.value
                          ? "border-orange-500 bg-orange-500/20 text-orange-300"
                          : "border-gray-600 bg-gray-800 text-gray-300 hover:border-gray-500"
                      }`}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-lg">{option.icon}</span>
                        <span>{option.label}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Payout Details */}
              <div className="space-y-4">
                {/* Bank Code for Bank Transfer */}
                {payoutType === "bank_transfer" && (
                  <FormItem>
                    <FormLabel className="text-gray-300 text-sm">Bank</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="Bank code (e.g., 044)"
                        className="bg-gray-800 border-gray-600 text-white placeholder:text-gray-500"
                        {...fiatForm.register("payoutDetails.bank_code")}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}

                {/* Network for Mobile Money */}
                {payoutType === "mobile_money" && (
                  <FormItem>
                    <FormLabel className="text-gray-300 text-sm">Mobile Network</FormLabel>
                    <FormControl>
                      <div className="relative rounded-xl border border-gray-600 bg-gray-800 focus-within:border-orange-500">
                        <select
                          className="w-full bg-transparent border-0 p-3 text-white focus:outline-none appearance-none cursor-pointer"
                          {...fiatForm.register("payoutDetails.network")}
                        >
                          <option value="" className="bg-gray-800 text-gray-400">Select Network</option>
                          <option value="MTN" className="bg-gray-800 text-white">MTN</option>
                          <option value="AIRTEL" className="bg-gray-800 text-white">Airtel</option>
                          <option value="GLO" className="bg-gray-800 text-white">Glo</option>
                          <option value="9MOBILE" className="bg-gray-800 text-white">9Mobile</option>
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}

                {/* Account Number / Phone Number */}
                <FormItem>
                  <FormLabel className="text-gray-300 text-sm">
                    {payoutType === "mobile_money" ? "Phone Number" : "Account Number"}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder={payoutType === "mobile_money" ? "+234XXXXXXXXXX" : "1234567890"}
                      className="bg-gray-800 border-gray-600 text-white placeholder:text-gray-500"
                      {...fiatForm.register("payoutDetails.account_number")}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>

                {/* Beneficiary Name */}
                <FormItem>
                  <FormLabel className="text-gray-300 text-sm">Beneficiary Name (Your Name)</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder="John Doe"
                      className="bg-gray-800 border-gray-600 text-white placeholder:text-gray-500"
                      {...fiatForm.register("payoutDetails.beneficiary_name")}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              </div>

              {/* Note */}
              <FormItem>
                <FormLabel className="text-gray-300 text-sm">Note (Optional)</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Add a note about this request..."
                    className="bg-gray-800 border-gray-600 text-white placeholder:text-gray-500 min-h-[80px]"
                    {...fiatForm.register("note")}
                  />
                </FormControl>
                <FormDescription className="text-gray-400 text-xs">
                  This note will be visible to the payer
                </FormDescription>
              </FormItem>

              {/* Info Box */}
              <div className="rounded-xl bg-blue-900/20 border border-blue-800 p-4">
                <div className="flex items-start gap-3">
                  <div className="text-blue-400 text-xl">ℹ️</div>
                  <div className="text-sm text-blue-200">
                    <div className="font-medium mb-1">Fiat Request</div>
                    <ul className="text-xs text-blue-300 space-y-1 list-disc list-inside">
                      <li>You&apos;re requesting fiat payment from another user</li>
                      <li>They&apos;ll receive a notification to accept or reject</li>
                      <li>If accepted, payment processed through Trust Express</li>
                      <li>Funds sent directly to your payout details</li>
                    </ul>
                  </div>
                </div>
              </div>

              <FormMessage />
            </form>
          </Form>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button
              variant="secondary"
              type="button"
              disabled={createRequest.isPending}
            >
              Cancel
            </Button>
          </DialogClose>
          <Button
            onClick={requestType === "token" 
              ? tokenForm.handleSubmit(onSubmitToken)
              : fiatForm.handleSubmit(onSubmitFiat)
            }
            disabled={createRequest.isPending}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {createRequest.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send Request
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Save Beneficiary Dialog */}
      {saveBeneficiaryDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-96">
            <h3 className="text-lg font-semibold text-white mb-4">Save Beneficiary</h3>
            <Input
              type="text"
              placeholder="Enter nickname (e.g., John - Delivery)"
              value={beneficiaryNickname}
              onChange={(e) => setBeneficiaryNickname(e.target.value)}
              className="bg-gray-800 border-gray-600 text-white mb-4"
            />
            <div className="flex gap-2 justify-end">
              <Button
                variant="secondary"
                onClick={() => {
                  setSaveBeneficiaryDialog(false);
                  setBeneficiaryNickname("");
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveBeneficiary}
                disabled={!beneficiaryNickname || saveBeneficiary.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                {saveBeneficiary.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
};

export default CreateRequestDialog;