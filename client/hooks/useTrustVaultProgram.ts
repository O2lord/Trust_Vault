import { BN, Program } from "@coral-xyz/anchor";
import useAnchorProvider from "./useAnchorProvider";
import { useMutation,  useQueryClient } from "@tanstack/react-query";
import { randomBytes, sign } from "crypto";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {  PublicKey, SystemProgram} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  getMint,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {  useCallback, useMemo, useState } from "react";
import {TrustVault } from "@/relics/trust_vault";
import idl from "@/relics/trust_vault.json";
import { TrustVaultAccountData, MintInfo, ReservationData,ReservationStatus, DisputeResolution, FeeInfo, TransactionType} from "@/types/trustVault"
import { DEFAULT_FEE_DESTINATION} from "@/utils/constants";
import {isToken2022, getMintInfo} from "@/utils/solana"
import {transactionDispatcher} from "./transactionEventDispatcher"
import { useTrustVaultInfo } from "./queries/useTrustVaultInfo";
import { closeVault } from "@/lib/encryptionApi";


export default function useTrustVaultProgram() {
    const provider = useAnchorProvider();
    const { publicKey} = useWallet();
    const program = useMemo(() => {
    return new Program<TrustVault>(idl as TrustVault, provider);
    }, [provider]);
    const queryClient = useQueryClient();
    const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);
    const {getTrustVaultInfo} = useTrustVaultInfo(program);
    
    
    const initializeGlobalState = useMutation ({
        mutationKey: ["initialize-global-state"],
        mutationFn: async () => {
        if (!publicKey) {
            console.error("No public key available!");
            return;
        }

        try {
            const [globalState] = PublicKey.findProgramAddressSync(
            [Buffer.from("global-state")],
            program.programId
            );

            const signature = await program.methods
            .initializeGlobalState()
            .accountsPartial({
                admin: publicKey,
                globalState: globalState,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

            transactionDispatcher.dispatchEvent({
            type: TransactionType.GLOBAL_STATE_INITIALIZED,
            signature,
            timestamp: Date.now(),
            details: {
                authority: publicKey.toString(),
            },
            });

            return signature;
        } catch (error) {
            console.error("Error in initializeGlobalState execution:", error);
            throw error;
        }
        },
        onError: (error) => {
        console.error(
            "Error initializing global state (from onError handler):",
            error
        );
        if (error instanceof Error) {
            console.error("Error name:", error.name);
            console.error("Error message:", error.message);
            console.error("Error stack:", error.stack);
        }
        },
    });

    const createSellOrder = useMutation({
        mutationKey: ["create-sell-order"],
        mutationFn: async (params: {
            mint: string;
            deposit: number;
            pricePerToken: number;
            currency: string;
            paymentInstructions: string;
            keyId?: string;
        }) => {

        if (!publicKey) {
        console.error("No public key available!");
        throw new Error("Wallet not connected");
      }

      if (!program) {
        console.error("Program not initialized!");
        throw new Error("Program not initialized");
      }

      try {
        const seed = new BN(randomBytes(8));

        const {
            mint,
            deposit,
            pricePerToken,
            currency,
            paymentInstructions,
            keyId,
        } = params;

        const isToken2022Result = await isToken2022(new PublicKey(mint), program.provider.connection);

        const tokenProgram = isToken2022Result
          ? TOKEN_2022_PROGRAM_ID
          : TOKEN_PROGRAM_ID;

        let mintInfo;
        try {
            mintInfo = await getMint(
                program.provider.connection,
                new PublicKey(mint),
                undefined,
                tokenProgram
            );

        }catch(error) {
          console.error("Error getting mint info:", error);
          throw new Error("Failed to get mint information");

        }

        const totalDepositAmount = new BN(
          Math.floor(deposit * 10 ** mintInfo.decimals)
        );

        const makerAta = getAssociatedTokenAddressSync(
            new PublicKey(mint),
            publicKey,
            false,
            tokenProgram
        );

        let balanceBN;
        try {
          const ataInfo = await program.provider.connection.getAccountInfo(
            makerAta
          );
          if (!ataInfo) {
            throw new Error(
              `Associated token account ${makerAta.toString()} does not exist. Please create it first.`
            );
          }

        const makerBalance =
            await program.provider.connection.getTokenAccountBalance(makerAta);
          balanceBN = new BN(makerBalance.value.amount);
         
        } catch (error) {
          console.error("Error checking ATA:", error);
          throw new Error("Failed to verify associated token account");
        }

        const [trustVault] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("trust-vault"),
            publicKey.toBuffer(),
            seed.toArrayLike(Buffer, "le", 8),
          ],
          program.programId
        );

        const vault = getAssociatedTokenAddressSync(
          new PublicKey(mint),
          trustVault,
          true,
          tokenProgram
        );

        const [globalState] = PublicKey.findProgramAddressSync(
          [Buffer.from("global-state")],
          program.programId
        );
       
        const feeDestination = DEFAULT_FEE_DESTINATION;

        const validCurrency =
          currency.length === 3
            ? currency
            : currency.padEnd(3, " ").substring(0, 3);
       

        const maxAllowed = 300;
        const validPaymentInstructions =
          paymentInstructions.length <= maxAllowed
            ? paymentInstructions
            : paymentInstructions.substring(0, maxAllowed);
      

        const pricePerTokenBN = new BN(pricePerToken)

        if (balanceBN.lt(totalDepositAmount)) {
          throw new Error(
            `Insufficient balance. Need ${(
              totalDepositAmount.toNumber() /
              10 ** mintInfo.decimals
            ).toFixed(mintInfo.decimals)}, have ${(
              balanceBN.toNumber() /
              10 ** mintInfo.decimals
            ).toFixed(mintInfo.decimals)}`
          );
        }

        const signature = await program.methods
        .createSellOrder(
            seed,
            totalDepositAmount,
            pricePerTokenBN,
            validCurrency,
            validPaymentInstructions
        )
        .accountsPartial(
            {maker: publicKey,
            mint: new PublicKey(mint),
            makerAta: makerAta,
            vault: vault,
            tokenProgram: tokenProgram,
            feeDestination,
            trustVault: trustVault,
            globalState: globalState,
            systemProgram: SystemProgram.programId,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc()

        try {
            await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (verificationError) {
            console.error("Verification error:", verificationError);
        }

        if (keyId) {
          try {
            const { associateKeyWithVault} = await import ("@/lib/encryptionApi");

            const associationResponse = await associateKeyWithVault(
              keyId,
              trustVault.toString()
            );

            if (associationResponse.success) {

            } else {
              console.error( "❌ Failed to associate encryption key:",
                associationResponse.error
              );
            }
          } catch (associationError) {
            console.error("❌ Error during key association:", associationError);
          }
        }
        transactionDispatcher.dispatchEvent({
          type: TransactionType.SELL_ORDER_CREATED,
          trustVault,
          amount: deposit,
          signature,
          timestamp: Date.now(),
         
        });

        return {
          signature,
          trustVaultPubkey: trustVault.toString(),
          keyId: keyId || null,
        };

      } catch (error) {
        console.error("Error in makeNewTrustVault execution:", error);
        throw error;
      }

        }
    })

    const updatePrice = useMutation({
        mutationKey: ["update-price"],
        mutationFn: async (params: {
        trustVault: PublicKey;
        newPricePerToken: number;
        }) => {

         if (!program || !publicKey) {
            throw new Error("Program or wallet not initialized");
        }

        const { trustVault, newPricePerToken } = params;

        try {
            const trustVaultAccount = await getTrustVaultInfo(trustVault);

            if (!trustVaultAccount.maker.equals(publicKey)) {
            throw new Error("Only the trust vault creator can update the price");
            }

            const mintInfo = await getMintInfo(
            new PublicKey(trustVaultAccount.mint),
            program.provider.connection

            );
            const newPriceBN = new BN(newPricePerToken);
            const currentPrice = Number(
            (trustVaultAccount.pricePerToken || new BN(0)).toString()
            );

        

            const signature = await program.methods
            .updatePrice(newPriceBN)
            .accountsPartial({
                maker: publicKey,
                trustVault,
            })
            .rpc();

        transactionDispatcher.dispatchEvent({
          type: TransactionType.PRICE_UPDATED,
          trustVault,
          signature,
          timestamp: Date.now(),
          details: {
            oldPrice: currentPrice,
            newPrice: newPricePerToken,
            currency: String.fromCharCode(...trustVaultAccount.currency).trim(),
            maker: publicKey.toString(),
          },
        });

        return signature;

        } catch (error) {
            console.error("Error updating price:", error);
            throw error;
        }
        },
        onError: (error) => {
        console.error("Error during update-price:", error);
        },
    });;

    const withdraw = useMutation({
        mutationKey: ["withdraw-tokens"],
        mutationFn: async (params: {
            trustVault: PublicKey;
            withdrawAmount: number;
        }) => {
        const { trustVault, withdrawAmount} = params;
        if (!program || !publicKey) {
            throw new Error("Program or wallet not initialized");
        }

        const trustVaultAccount = await getTrustVaultInfo(trustVault);

        // Check for any reservations with PENDING (0) or PAYMENT_SENT (1) status
        const activeReservations = (
            trustVaultAccount.reservedAmounts || []
        ).filter(
            (reservation: ReservationData) =>
            reservation.status === ReservationStatus.PENDING ||
            reservation.status === ReservationStatus.PAYMENT_SENT
        );
        // Calculate total amount that's reserved and cannot be withdrawn
        const reservedAmount = activeReservations.reduce(
            (total: BN, r: ReservationData) => total.add(r.amount),
            new BN(0)
        );

        const tokenProgram = (await isToken2022((trustVaultAccount.mint), program.provider.connection))
            ? TOKEN_2022_PROGRAM_ID
            : TOKEN_PROGRAM_ID;

        const mintInfo = await getMintInfo(
            new PublicKey(trustVaultAccount.mint), program.provider.connection
        );
        const smallestUnitAmount = new BN(
            Math.floor(withdrawAmount * 10 ** mintInfo.decimals)
        );

        const vault = getAssociatedTokenAddressSync(
            new PublicKey(trustVaultAccount.mint),
            trustVault,
            true,
            tokenProgram
        );

        const vaultInfo = await provider.connection.getTokenAccountBalance(vault);
        const vaultBalance = new BN(vaultInfo.value.amount);

        const availableForWithdrawal = vaultBalance.sub(reservedAmount);

            if (availableForWithdrawal.lt(smallestUnitAmount)) {
            throw new Error(
            `Cannot withdraw ${withdrawAmount} tokens. Only ${
                availableForWithdrawal.toNumber() / 10 ** mintInfo.decimals
            } available due to pending/in-progress transactions.`
            );
        }

        const totalDeposit = (trustVaultAccount.amount || new BN(0)).add(
            trustVaultAccount.reservedFee || new BN(0)
        );
        const withdrawRatio =
            smallestUnitAmount.toNumber() / totalDeposit.toNumber();
        const feeTowithdraw = (trustVaultAccount.reservedFee || new BN(0)).muln(
            withdrawRatio
        );

        const makerAta = getAssociatedTokenAddressSync(
            new PublicKey(trustVaultAccount.mint),
            trustVaultAccount.maker,
            false,
            tokenProgram,
        );

        const isfullWithdral = smallestUnitAmount.toNumber() >= availableForWithdrawal.toNumber() * 0.99;
        const signature = await program.methods
        .withdraw(smallestUnitAmount)
        .accountsPartial({
            maker: trustVaultAccount.maker,
            mint: new PublicKey(trustVaultAccount.mint),
            vault,
            makerAta,
            trustVault,
            tokenProgram
        })
        .rpc();

        transactionDispatcher.dispatchEvent({
            type: TransactionType.TRUST_VAULT_REFUNDED,
            trustVault,
            amount: withdrawAmount,
            signature,
            timestamp: Date.now(),
            details: {
            mintA: trustVaultAccount.mint.toString(),
            maker: trustVaultAccount.maker.toString(),
            isfullWithdral,
            },
        });
        
        return signature;
        },
        onError: (error) => {
        console.error("Error during withdrawing tokens:", error);
        },
        });

    const reserveTokens = useMutation({
        mutationKey: ["reserve-token"],
        mutationFn: async (param: {trustVault: PublicKey; amount: number}) => {

        if (!program || !publicKey) {
            throw new Error("Program or wallet not initialized");
        }

        const {trustVault, amount} = param;
        const trustVaultAccount = await getTrustVaultInfo(trustVault);

        const tokenProgram = ( await isToken2022((trustVaultAccount.mint), program.provider.connection))
            ? TOKEN_2022_PROGRAM_ID
            : TOKEN_PROGRAM_ID;
        
        const mintInfo = await getMintInfo(
            new PublicKey(trustVaultAccount.mint), program.provider.connection
        );


        const amountBn = new BN(Math.floor(amount * 10 ** mintInfo.decimals));

        const takerAta = getAssociatedTokenAddressSync(
            new PublicKey(trustVaultAccount.mint),
            publicKey,
            false,
            tokenProgram
        );

        const vault = getAssociatedTokenAddressSync(
            new PublicKey(trustVaultAccount.mint),
            trustVault,
            true,
            tokenProgram
        );

        const signature = await program.methods
        .reserveTokens(amountBn, null)
        .accountsPartial({
            taker: publicKey,
            maker: trustVaultAccount.maker,
            trustVault,
            mint: new PublicKey(trustVaultAccount.mint),
            takerAta,
            vault,
            tokenProgram,
            systemProgram: SystemProgram.programId,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();

        transactionDispatcher.dispatchEvent({
            type: TransactionType.TOKENS_RESERVED,
            trustVault,
            amount,
            signature,
            timestamp: Date.now(),
            details: {
            taker: publicKey.toString(),
            mintA: trustVaultAccount.mint.toString(),
            },
        });

        return signature;
        },
         onError: (error) => {
        console.error("Error during reserve-token:", error);
        },
    });

    const cancelReservation = useMutation({
        mutationKey: ["cancel-reservation"],
        mutationFn: async (params: {
            trustVault: PublicKey,
            reservationIndex: number;
        }) => {
        const {trustVault, reservationIndex} = params;

        if (!program || !publicKey) {
            throw new Error("Program or wallet not initialized");
        }

        const signature = await program.methods
        .cancelReservation(reservationIndex)
        .accountsPartial({
            user: publicKey,
            trustVault,
        })
        .rpc();

        transactionDispatcher.dispatchEvent({
            type: TransactionType.RESERVATION_CANCELLED,
            trustVault,
            signature,
            timestamp: Date.now(),
            details: {
            reservationIndex,
            user: publicKey.toString(),
            },
        });
        return signature;
        },
        onError: (error) => {
         console.error("Error during cancel-reservation:", error);
        },
    });

    const markPaymentSent = useMutation({
        mutationKey: ["mark-payment-sent"],
        mutationFn: async ({
            trustVault,
            reservationIndex,
        }: {
            trustVault: PublicKey;
            reservationIndex: number;
        }) => {

        if (!program || !publicKey) {
            throw new Error("Program or wallet not initialized");
        }
        try {
            const trustVaultAccount = await program.account.trustVault.fetch(
            trustVault
            );
        
        const signature = await program.methods
        .markPaymentSent(reservationIndex)
        .accountsPartial({
            taker: publicKey,
            maker: trustVaultAccount.maker,
            trustVault: trustVault,
            systemProgram: SystemProgram.programId
        })
        .rpc();

        transactionDispatcher.dispatchEvent({
          type: TransactionType.PAYMENT_SENT,
          trustVault,
          signature,
          timestamp: Date.now(),
          details: {
            reservationIndex,
            taker: publicKey.toString(),
            maker: trustVaultAccount .maker.toString(),
          },
        });

        return signature;
        
        } catch (error) {
            console.error("Error marking payment as sent:", error);
            throw error
        } 
        }
    })

    const confirmPayment = useMutation ({
        mutationKey: ["confirm-payment"],
        mutationFn: async (params: {
            trustVault: PublicKey;
            reservationIndex: number;
        }) => {
        const connection = program.provider.connection;

        if (!program || !publicKey) {
            throw new Error("Program or wallet not initialized");
        }
        const { trustVault, reservationIndex } = params;

        setIsConfirmingPayment(true);

        try {
            const trustVaultAccount = await getTrustVaultInfo(trustVault);

            const isFullClosure =
            (trustVaultAccount.reservedAmounts || []).length === 1;
            const remainingReservations =
            (trustVaultAccount.reservedAmounts || []).length - 1;
        
            const isToken2022Mint = await isToken2022((trustVaultAccount.mint), program.provider.connection);
            const tokenProgram = isToken2022Mint
            ? TOKEN_2022_PROGRAM_ID
            : TOKEN_PROGRAM_ID;

            const vault = getAssociatedTokenAddressSync(
            new PublicKey(trustVaultAccount.mint),
            trustVault,
            true,
            tokenProgram
            );

            const reservation = (trustVaultAccount.reservedAmounts || [])[
          reservationIndex
        ];

        const taker = reservation.taker;

        const takerAta = getAssociatedTokenAddressSync(
          new PublicKey(trustVaultAccount.mint),
          taker,
          false,
          tokenProgram
        );

        const feeDestination =
          trustVaultAccount.feeDestination ||
          new PublicKey("11111111111111111111111111111111");
        const feeDestinationAta = getAssociatedTokenAddressSync(
          new PublicKey(trustVaultAccount.mint),
          feeDestination,
          false,
          tokenProgram
        );

        const signature = await program.methods
        .confirmPayment(reservationIndex)
        .accountsPartial({
            maker: trustVaultAccount.maker,
            taker,
            trustVault,
            mint: new PublicKey(trustVaultAccount.mint),
            vault,
            takerAta,
            feeDestination,
            feeDestinationAta,
            systemProgram: SystemProgram.programId,
            tokenProgram,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();

        const confirmation = await connection.confirmTransaction(
          signature,
          "confirmed"
        );

        if (confirmation.value.err) {
          console.error(
            "❌ Transaction failed on-chain:",
            confirmation.value.err
          );
          throw new Error(
            `Transaction failed: ${JSON.stringify(confirmation.value.err)}`
          );
        }

        const postTrustVaultInfo = await connection.getAccountInfo(trustVault);
        const trustVaultClosed = !postTrustVaultInfo;

        if (trustVaultClosed) {
          try {

          } catch (keyError){
            console.error("⚠️ Failed to destroy encryption key:", keyError);
          }
        }

        return signature;

        } catch (error) {
        console.error("💥 Error during confirm-payment:", error);
        throw error;
      } finally {
        setIsConfirmingPayment(false);
      }
    },
    });

    const createBuyOrder = useMutation({
        mutationKey: ["create-buy-order"],
        mutationFn: async ( params: {
            mint: string;
            amount: number;
            pricePerToken: number;
            currency: string;
            paymentInstructions: string,
            keyId?: string;

        }) => {

        if (!publicKey) {
            throw new Error("Wallet not connected");
        }

        try {
            const seed = new BN(randomBytes(8));

            const {
                mint,
                amount,
                pricePerToken,
                currency,
                paymentInstructions,
                keyId,
            } = params;

            const isToken2022Result = await isToken2022((new PublicKey(mint)), program.provider.connection);

            const tokenProgram = isToken2022Result
            ? TOKEN_2022_PROGRAM_ID
            : TOKEN_PROGRAM_ID;

            let mintInfo;

            try {
            mintInfo = await getMint(
                program.provider.connection,
                new PublicKey(mint),
                undefined,
                tokenProgram
            );
            } catch (error) {
            throw  error;
            
            }

            const amountBN = new BN(Math.floor(amount * 10 ** mintInfo.decimals));
            const pricePerTokenBN = new BN(pricePerToken);

            const validCurrency =
            currency.length === 3
                ? currency
                : currency.padEnd(3, " ").substring(0, 3);

            const [globalState] = PublicKey.findProgramAddressSync(
            [Buffer.from("global-state")],
            program.programId
            );

            const maxAllowed = 500;

            const validPaymentInstructions =
            paymentInstructions.length <= maxAllowed
                ? paymentInstructions
                : paymentInstructions.substring(0, maxAllowed);

            const [trustVault] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("trust-vault"),
                publicKey.toBuffer(),
                seed.toArrayLike(Buffer, "le", 8),
            ],
            program.programId
            );

            const signature = await program.methods
            .createBuyOrder(
                seed,
                amountBN,
                pricePerTokenBN,
                validCurrency,
                validPaymentInstructions
            )
            .accountsPartial({
                buyer: publicKey,
                mint,
                trustVault,
                globalState,
                systemProgram: SystemProgram.programId,
                tokenProgram: tokenProgram,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID
            })
            .rpc();

            if (keyId) {
              try {
              const { associateKeyWithVault } = await import(
                "@/lib/encryptionApi"
              );

              const associationResponse = await associateKeyWithVault(
              keyId,
              trustVault.toString()
            );

            if (associationResponse.success) {
            
            } else {
              console.error(
              "❌ Failed to associate encryption key:",
                  associationResponse.error
                  );
                }

                  } catch (associationError) {
                console.error("❌ Error during key association:", associationError);
              }
            }

            transactionDispatcher.dispatchEvent({
            type: TransactionType.BUY_ORDER_CREATED,
            trustVault,
            amount,
            signature,
            timestamp: Date.now(),
            details: {
                mint: mint,
                pricePerToken,
                currency: validCurrency,
                trustVaultPubkey: trustVault.toString(),
            
            },
            });

            return {
              signature,
              trustVaultPubkey: trustVault.toString(),
              keyId: keyId || null,
            };
        } catch (error) {
            console.error("Error creating buy order:", error);
            throw error;
        }
        },
            onError: (error) => {
            console.error("Error during create-buy-order:", error);
            },
    });

    const reserveBuyOrder = useMutation ({
        mutationKey: ["reserve-buy-order"],
        mutationFn: async (params: {
            trustVault: PublicKey;
            amount: number;
            sellerInstructions: string;
            keyId?: string;
        }) => {
        if (!publicKey) {
            throw new Error("Wallet not connected");
        }

        const { trustVault, amount, sellerInstructions, keyId } = params;

        try {
              const trustVaultAccount = await getTrustVaultInfo(trustVault);

        const mint = new PublicKey(trustVaultAccount.mint);
        const mintInfo = await getMintInfo((mint), program.provider.connection);

        const amountBN = new BN(Math.floor(amount * 10 ** mintInfo.decimals));

        const maxAllowed = 500;
        const validSellerInstructions =
          sellerInstructions.length <= maxAllowed
            ? sellerInstructions
            : sellerInstructions.substring(0, maxAllowed);


        const tokenProgram = (await isToken2022((mint), program.provider.connection))
          ? TOKEN_2022_PROGRAM_ID
          : TOKEN_PROGRAM_ID;

         const sellerAta = getAssociatedTokenAddressSync(
          mint,
          publicKey,
          false,
          tokenProgram
        );

        const vault = getAssociatedTokenAddressSync(
          mint,
          trustVault,
          true,
          tokenProgram
        );

         const signature = await program.methods
          .reserveBuyOrder(amountBN, validSellerInstructions)
          .accountsPartial({
            seller: publicKey,
            buyer: trustVaultAccount.maker,
            trustVault,
            sellerAta,
            vault,
            mint,
            systemProgram: SystemProgram.programId,
            tokenProgram,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .rpc();

          if (keyId) {

          }

          try {
            await new Promise((resolve) => setTimeout(resolve, 1000));

          const updatedTrustVaultAccount = await getTrustVaultInfo(trustVault);
     

         
          const connection = program.provider.connection;
          const txDetails = await connection.getTransaction(signature, {
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0,
          });

          if (txDetails) {
            let instructionCount = 0;
            try {
              if ("compiledInstructions" in txDetails.transaction.message) {
                instructionCount = txDetails.transaction.message.compiledInstructions?.length || 0;
              } else {
                instructionCount = 0;
              }

            } catch (e) {
              instructionCount = 0;

            }
            const instructionLogs = txDetails.meta?.logMessages?.filter(
              (log) =>
                log.includes("instruction") ||
              log.includes("seller") ||
              log.includes("Instructions")
            ) || [];

            const instructionInLogs = txDetails.meta?.logMessages?.some((log) =>
            log.includes(validSellerInstructions.substring(
              0, 20
            ))) || false;
          }

          } catch (postTxError) {
            console.error(
              "❌ POST-TRANSACTION - Error during post-transaction verification:",
              postTxError
            );
          }

          transactionDispatcher.dispatchEvent({
          type: TransactionType.BUY_ORDER_RESERVED,
          trustVault,
          amount,
          signature,
          timestamp: Date.now(),
        });

       return {
          signature,
          trustVaultPubkey: trustVault.toString(),
          keyId: keyId || null,
        };

        } catch (error) {
            console.error("failed to reserve buy order")

        }
        },
    });

   const buyOrderPaymentSent = useMutation({
        mutationKey: ["buyer-mark-payment-sent"],
        mutationFn: async (params: {
            trustVault: PublicKey;
            reservationIndex: number;
            seller: PublicKey;
        }) => {
            if (!publicKey) {
                throw new Error("Wallet not connected");
            }

            const { trustVault, reservationIndex, seller } = params;

            try {
                const trustVaultAccountRaw = await program.account.trustVault.fetch(
                    trustVault
                );

                // Properly type the account data instead of using 'any'
                const trustVaultAccount = trustVaultAccountRaw as TrustVaultAccountData;

                if (!trustVaultAccount.maker.equals(publicKey)) {
                    throw new Error("You are not the buyer (maker) of this trustVault");
                }

                if (
                    !trustVaultAccount.reservedAmounts ||
                    reservationIndex >= trustVaultAccount.reservedAmounts.length
                ) {
                    throw new Error(`Invalid reservation index: ${reservationIndex}`);
                }

                const reservationSeller = trustVaultAccount.reservedAmounts[
                    reservationIndex
                ].taker;
                
                if (!reservationSeller.equals(seller)) {
                    throw new Error(
                        "Provided seller does not match the reservation's taker"
                    );
                }

                const signature = await program.methods
                    .buyOrderPaymentSent(reservationIndex)
                    .accountsPartial({
                        buyer: publicKey,
                        seller: seller,
                        trustVault: trustVault,
                        systemProgram: SystemProgram.programId,
                    })
                    .rpc();

                transactionDispatcher.dispatchEvent({
                    type: TransactionType.BUYER_PAYMENT_SENT,
                    trustVault,
                    signature,
                    timestamp: Date.now(),
                    details: {
                        reservationIndex,
                        buyer: publicKey.toString(),
                        seller: seller.toString(),
                    },
                });

                return signature;
            } catch (error) {
                console.error("Error marking payment as sent:", error);
                throw error;
            }
        },
        onError: (error) => {
            console.error("Error during buyer-mark-payment-sent:", error);
        },
    });

    const sellerConfirmsPayment = useMutation({
        mutationKey: ["seller-confirms-payment"],
        mutationFn: async ( params: {
            trustVault: PublicKey;
            reservationIndex: number;
        }) => {

        if (!publicKey) {
            throw new Error("Wallet not connected");
        }

        const { trustVault, reservationIndex } = params;

        try {
            const trustVaultAccount = await getTrustVaultInfo(trustVault);

        if (
          reservationIndex >= (trustVaultAccount.reservedAmounts || []).length
            ) {
            throw new Error("Invalid reservation index");
            }

            const reservation = (trustVaultAccount.reservedAmounts || [])[
            reservationIndex
            ];
            const buyer = trustVaultAccount.maker;
            const feeDestination =
            trustVaultAccount.feeDestination ||
            new PublicKey("11111111111111111111111111111111");

            const isFullClosure =
            (trustVaultAccount.reservedAmounts || []).length === 1;
            
             const isToken2022Mint = await isToken2022((trustVaultAccount.mint), program.provider.connection);
        const tokenProgram = isToken2022Mint
          ? TOKEN_2022_PROGRAM_ID
          : TOKEN_PROGRAM_ID;

     

        const mintInfo = await getMintInfo((trustVaultAccount.mint), program.provider.connection);

        const vault = getAssociatedTokenAddressSync(
          trustVaultAccount.mint,
          trustVault,
          true,
          tokenProgram
        );

        const buyerTokenAccount = getAssociatedTokenAddressSync(
          trustVaultAccount.mint,
          buyer,
          false,
          tokenProgram
        );
        
        const feeDestinationAta = getAssociatedTokenAddressSync(
          trustVaultAccount.mint,
          feeDestination,
          false,
          tokenProgram
        );

        const [globalState] = PublicKey.findProgramAddressSync(
          [Buffer.from("global-state")],
          program.programId
        );

        const signature = await program.methods
          .sellerConfirmsPayment(reservationIndex)
          .accountsPartial({
            seller: publicKey,
            buyer,
            trustVault,
            vault,
            mint: trustVaultAccount.mint,
            buyerTokenAccount,
            feeDestination,
            feeDestinationAta,
            globalState,
            tokenProgram,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

          const postTrustVaultInfo = await provider.connection.getAccountInfo(
            trustVault
            );
          const trustVaultClosed = !postTrustVaultInfo;

          // ALWAYS destroy the seller's specific reservation key after successful payment confirmation
          try {
            const destroySellerKeyResponse = await fetch(
            "/api/encryption-api/destroy-key",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                trustVaultPubkey: trustVault.toString(),
                sellerPubkey: publicKey.toString(),
                reason: "Seller payment confirmed",
              }),
            }
          );
          if (!destroySellerKeyResponse.ok) {
            const errorData = await destroySellerKeyResponse.json();
            console.error("⚠️ Failed to destroy seller's key:", errorData);
          } else {
            
          }

          } catch (keyError) {
          console.error("⚠️ Error destroying seller's key:", keyError);
          }

          // Only destroy the main vault key if the entire vault is being closed
          if (trustVaultClosed) {
            try {
            // Destroy the main vault key (sell order key with no seller pubkey)
            const closeResult = await handleVaultClosure.mutateAsync({
              trustVault,
              reason: "completed",
            });

            } catch (keyError) {
              console.error("⚠️ Failed to destroy main vault key:", keyError);
            }
          }

          transactionDispatcher.dispatchEvent({
          type: TransactionType.SELLER_CONFIRMS_PAYMENT,
          trustVault,
          signature,
          timestamp: Date.now(),
        });

        return signature;
        } catch (error) {
        console.error("Error confirming payment as seller:", error);
        throw error;
      }
        },
        onError: (error) => {
        console.error("Error during seller-confirm-payment:", error);
        },
    });

    const cancelOrReduceBuyOrder = useMutation({
        mutationKey: ["cancel-or-reduce-buy-order"],
        mutationFn: async (params:{
            trustVault: PublicKey;
            newAmount: number;
        }) => {
            const { trustVault, newAmount} = params;

            if (!publicKey) {
                throw new Error("Wallet not connected");
            }

            const trustVaultAccount = await getTrustVaultInfo(trustVault);

            if (!trustVaultAccount.maker.equals(publicKey)) {
                throw new Error("Only the buyer can modify this order");
            }

            if (newAmount < 0) {
                throw new Error("Amount cannot be negative");
            }

            const totalReserved = (trustVaultAccount.reservedAmounts || [])
            .filter(
            (r: ReservationData) =>
                r.status !== ReservationStatus.CANCELLED &&
                r.status !== ReservationStatus.COMPLETED &&
                r.status !== ReservationStatus.DISPUTED
            )
            .reduce((sum: BN, r: ReservationData) => sum.add(r.amount), new BN(0));

        const mintInfo = await getMintInfo(
            new PublicKey((trustVaultAccount.mint)
        ), program.provider.connection);

        const newAmountSmallestUnit = new BN(
            Math.floor(newAmount * 10 ** mintInfo.decimals)
        );

        const currentAmount = trustVaultAccount.amount || new BN(0);

        if (newAmount ===0) {
            if (totalReserved.gt(new BN(0))) {
            throw new Error(
                `Cannot cancel order with active reservations (${
                totalReserved.toNumber() / 10 ** mintInfo.decimals
                } tokens reserved)`
            );
        }
        } else {
            if (newAmountSmallestUnit.gte(currentAmount)) {
            throw new Error(
                `New amount (${newAmount}) must be less than current amount (${
                currentAmount.toNumber() / 10 ** mintInfo.decimals
                })`
            );
            }

            if (newAmountSmallestUnit.lt(totalReserved)) {
            throw new Error(
                `Cannot reduce below reserved amount (${
                totalReserved.toNumber() / 10 ** mintInfo.decimals
                } tokens reserved)`
            );
            }
        }

        const tokenProgram = (await isToken2022((trustVaultAccount.mint), program.provider.connection))
            ? TOKEN_2022_PROGRAM_ID
            : TOKEN_PROGRAM_ID;


        const isFullCancellation = newAmount === 0;

        const signature = await program.methods
        .cancelOrReduceBuyOrder(newAmountSmallestUnit)
        .accountsPartial({
          buyer: publicKey,
          trustVault,
          tokenProgram,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

        if (isFullCancellation) {
          try {
            const closeResult = await handleVaultClosure.mutateAsync({
                trustVault,
                reason: "cancelled",
              });
            } catch (keyError) {
              console.error("⚠️ Failed to destroy encryption key:", keyError);
            }
          } 

        const eventType =
        newAmount === 0
          ? TransactionType.BUY_ORDER_CANCELLED
          : TransactionType.BUY_ORDER_REDUCED;

        transactionDispatcher.dispatchEvent({
        type: eventType,
        trustVault,
        signature,
        timestamp: Date.now(),
      });

      return signature;

        },
        onError: (error) => {
      console.error("Error during cancel or reduce buy order:", error);
        },
    });

      const disputePayment = useMutation({
        mutationKey: ["dispute-payment"],
        mutationFn: async (params: {
        trustVault: PublicKey;
        reservationIndex: number;
        disputeReason: string;
        }) => {
        if (!publicKey) {
            throw new Error("Wallet not connected");
        }

        const { trustVault, reservationIndex, disputeReason } = params;

        try {
            const trustVaultAccount = await getTrustVaultInfo(trustVault);

            if (
            reservationIndex >= (trustVaultAccount.reservedAmounts || []).length
            ) {
            throw new Error("Invalid reservation index");
            }

            const reservation = (trustVaultAccount.reservedAmounts || [])[
            reservationIndex
            ];

            if (reservation.status !== ReservationStatus.PAYMENT_SENT) {
            throw new Error(
                `Cannot dispute a reservation with status: ${
                ReservationStatus[reservation.status]
                }. Only PAYMENT_SENT reservations can be disputed.`
            );
            }

            const isMaker = trustVaultAccount.maker.equals(publicKey);
            const isTaker = reservation.taker.equals(publicKey);

            if (!isMaker && !isTaker) {
            throw new Error(
                "Only the seller or buyer involved in the transaction can dispute a payment"
            );
            }

            const [globalState] = PublicKey.findProgramAddressSync(
            [Buffer.from("global-state")],
            program.programId
            );

            const maxReasonLength = 500;
            const validReason =
            disputeReason.length <= maxReasonLength
                ? disputeReason
                : disputeReason.substring(0, maxReasonLength);

            const signature = await program.methods
            .disputePayment(reservationIndex, validReason)
            .accountsPartial({
                disputer: publicKey,
                maker: trustVaultAccount.maker,
                taker: reservation.taker,
                trustVault,
                globalState,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

            transactionDispatcher.dispatchEvent({
            type: TransactionType.PAYMENT_DISPUTED,
            trustVault,
            signature,
            timestamp: Date.now(),
            });

            return signature;
        } catch (error) {
            console.error("Error disputing payment:", error);
            throw error;
        }
        },
        onError: (error) => {
        console.error("Error during dispute-payment:", error);
        },
    });

    const resolveDisputes = useMutation({
      mutationKey: ["resolve-dispute"],
      mutationFn: async (params: {
        trustVault: PublicKey;
        reservationIndex: number;
        resolution: DisputeResolution;
        comment: string;
      }) => {
        if (!publicKey) {
          throw new Error("Wallet not connected");
        }

        const { trustVault, reservationIndex, resolution, comment } = params;

        try {
          const trustVaultAccount = await getTrustVaultInfo(trustVault);

          if (
            reservationIndex >= (trustVaultAccount.reservedAmounts || []).length
          ) {
            throw new Error("Invalid reservation index");
          }

          const reservation = (trustVaultAccount.reservedAmounts || [])[
            reservationIndex
          ];

          if (reservation.status !== ReservationStatus.DISPUTED) {
            throw new Error(
              `Cannot resolve a reservation with status: ${
                ReservationStatus[reservation.status]
              }. Only DISPUTED reservations can be resolved.`
            );
          }

          const [globalState] = PublicKey.findProgramAddressSync(
            [Buffer.from("global-state")],
            program.programId
          );

          const globalStateInfo = await program.account.globalState.fetch(
            globalState
          );

          if (!globalStateInfo.admin.equals(publicKey)) {
            throw new Error("Only the admin can resolve disputes");
          }

          const isToken2022Mint = await isToken2022((trustVaultAccount.mint), program.provider.connection);
          const tokenProgram = isToken2022Mint
            ? TOKEN_2022_PROGRAM_ID
            : TOKEN_PROGRAM_ID;

        

          const vault = getAssociatedTokenAddressSync(
            new PublicKey(trustVaultAccount.mint),
            trustVault,
            true,
            tokenProgram
          );

          const takerAta = getAssociatedTokenAddressSync(
            new PublicKey(trustVaultAccount.mint),
            reservation.taker,
            false,
            tokenProgram
          );

          const makerAta = getAssociatedTokenAddressSync(
            new PublicKey(trustVaultAccount.mint),
            trustVaultAccount.maker,
            false,
            tokenProgram
          );

          const feeDestination =
            trustVaultAccount.feeDestination ||
            new PublicKey("11111111111111111111111111111111");
          const feeDestinationAta = getAssociatedTokenAddressSync(
            new PublicKey(trustVaultAccount.mint),
            feeDestination,
            false,
            tokenProgram
          );

          const maxCommentLength = 500;
          const validComment =
            comment.length <= maxCommentLength
              ? comment
              : comment.substring(0, maxCommentLength);

      

      

          const signature = await program.methods
            .resolveDisputes(reservationIndex, resolution, validComment)
            .accountsPartial({
              resolver: publicKey,
              maker: trustVaultAccount.maker,
              taker: reservation.taker,
              trustVault: trustVault,
              mint: new PublicKey(trustVaultAccount.mint),
              vault: vault,
              takerAta: takerAta,
              makerAta: makerAta,
              globalState: globalState,
              feeDestinationAta: feeDestinationAta,
              systemProgram: SystemProgram.programId,
              tokenProgram: tokenProgram,
              associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            })
            .rpc();

            // Check for buy order trust vault
            //Destroy key after successful resolution
            if (trustVaultAccount.trustVaultType ===1) {
              try {

                const destroySellerKeyResponse = await fetch(
                  "/api/encryption-api/destroy-key",
                  {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    trustVaultPubkey: trustVault.toString(),
                    sellerPubkey: reservation.taker.toString(),
                    reason: "Buy-sell order dispute resolved",
                  }),
                }
                );

                if (!destroySellerKeyResponse.ok) {
                  const errorData = await destroySellerKeyResponse.json();
                  console.error(
                  "⚠️ Failed to destroy seller's key after dispute resolution:",
                  errorData
                );
                } else {

                }

              } catch (keyError) {
                console.error(
                  "⚠️ Error destroying seller's key after dispute resolution:",
                  keyError
                );
              }
            }

            //Check if trust vault was closed after resolution
            const postTrustVaultInfo = await provider.connection.getAccountInfo(
              trustVault
            );
            const trustVaultClosed = !postTrustVaultInfo;

            // If the entire vault is closed, destroy the main vault key
            if (trustVaultClosed) {
              try {
                const closeResult = await handleVaultClosure.mutateAsync({
                trustVault,
                reason: "dispute_resolved",
              });
              } catch (keyError) {
              console.error(
                "⚠️ Failed to destroy main vault key after dispute resolution:",
                keyError
              );
            }
            }

            const mintInfo = await getMintInfo((trustVaultAccount.mint), program.provider.connection);
            const amount = reservation.amount
            ? Number(reservation.amount.toString()) /
              Math.pow(10, mintInfo.decimals)
            : 0;

          transactionDispatcher.dispatchEvent({
            type: TransactionType.DISPUTE_RESOLVED,
            trustVault,
            amount,
            signature,
            timestamp: Date.now(),
          });

          return signature;
        } catch (error) {
          console.error("Error resolving dispute:", error);
          throw error;
        }
      },
      onError: (error) => {
        console.error("Error during resolve-dispute:", error);
      },
    });

    const handleVaultClosure = useMutation({
      mutationKey: ["handle-vault-closure"],
      mutationFn: async (params: {
        trustVault: PublicKey;
        reason:
          | "completed"
          | "cancelled"
          | "disputed"
          | "manual"
          | "dispute_resolved";
      }) => {
          if (!publicKey) {
            throw new Error("Wallet not connected");
          }

          const { trustVault, reason } = params;

          try {
            const result = await closeVault(
              trustVault.toString(),
              reason,
              publicKey.toString()
            );

            if (!result.success) {
              throw new Error(result.error || "Failed to close vault");
            }

          

            return {
              success: true,
              keyDestroyed: result.keyDestroyed || false,
            };

          } catch (error) {
            console.error("❌ Error closing vault:", error);
            throw error;
          }

      }
    })

    return {
        program,
        createSellOrder,
        updatePrice,
        withdraw,
        reserveTokens,
        cancelReservation,
        markPaymentSent,
        isConfirmingPayment,
        confirmPayment,
        initializeGlobalState,
        createBuyOrder,
        reserveBuyOrder,
        buyOrderPaymentSent,
        sellerConfirmsPayment,
        cancelOrReduceBuyOrder,
        disputePayment,
        resolveDisputes,
        handleVaultClosure,
    }
}