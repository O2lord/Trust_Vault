import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import address from '@/services/tokenMint.json'
import React, { useState, useEffect } from 'react'
import { Keypair, PublicKey, Transaction } from '@solana/web3.js'
import { airdropTokens, solanaTransferInstruction, validateMint } from '@/services/blockchain'
import { toast } from "sonner";

// Button component placeholder - replace with your actual Button component
const Button = ({ children, disabled, onClick, type, className }: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
  className?: string;
}) => (
  <button
    disabled={disabled}
    onClick={onClick}
    type={type}
    className={`px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-medium hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 ${className}`}
  >
    {children}
  </button>
)

const AirdropTokens = () => {
  const { connection } = useConnection()
  const { publicKey } = useWallet()
  const [isLoading, setIsLoading] = useState(false)
  const [isValidating, setIsValidating] = useState(true)
  const [mintValidation, setMintValidation] = useState<{
    usdt: { isValid: boolean; programType?: string; decimals?: number }
  }>({ usdt: { isValid: false } })
  
  // Airdrop configuration
  const TOKEN_AIRDROP_AMOUNT = 1000
  const TOKEN_DECIMALS = 9
  const SOL_AIRDROP_AMOUNT = 0.1

  const TOKEN_OWNER = process.env.NEXT_PUBLIC_TOKEN_OWNER_KEY_PAIR || ''
  const USDT_MINT_ADDRESS = new PublicKey(address.address_USDT)

  let OWNER: Keypair | null = null
  if (TOKEN_OWNER) {
    try {
      const ownerArray = Uint8Array.from(TOKEN_OWNER.split(',').map(Number))
      OWNER = Keypair.fromSecretKey(ownerArray)
    } catch (error) {
      console.error('Error parsing TOKEN_OWNER keypair:', error)
    }
  }

  // Validate mints on component mount
 useEffect(() => {
    const validateMints = async () => {
      if (!connection) return

      setIsValidating(true) 
      try {
        const [usdtValidation] = await Promise.all([
          validateMint(connection, USDT_MINT_ADDRESS)
        ])

        setMintValidation({
          usdt: {
            isValid: usdtValidation.isValid,
            programType: usdtValidation.programId?.toBase58().includes('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb') ? 'Token-2022' : 'Legacy Token',
            decimals: usdtValidation.decimals
          }
        })
      } catch (error) {
        console.error('Error validating mints:', error)
        toast.error('Failed to validate token mints')
      } finally {
        setIsValidating(false)
      }
    }

    validateMints()
  }, [connection])


  const executeTransaction = async (transaction: Transaction, description: string): Promise<string> => {
    const toastId = description.toLowerCase().replace(/\s+/g, '-')
    
    try {
      toast.loading(`${description}...`, { id: toastId })
      
      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash()
      transaction.recentBlockhash = blockhash
      transaction.feePayer = OWNER!.publicKey

      // Sign the transaction with the owner keypair
      transaction.sign(OWNER!)
      
      // Send the raw signed transaction
      const signature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed'
      })
      
      // Wait for confirmation
      await connection.confirmTransaction(signature, 'confirmed')
    
      toast.success(`${description} completed`, { id: toastId })
      return signature
    } catch (error) {
      console.error(`${description} failed:`, error)
      toast.error(`${description} failed`, { id: toastId })
      throw error
    }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    
    if (!connection || !publicKey) {
      toast.error('Please connect your wallet')
      return
    }
    
    if ( !USDT_MINT_ADDRESS) {
      toast.error('Token mint addresses not configured')
      return
    }
    
    if (!TOKEN_OWNER || !OWNER) {
      toast.error('Token owner keypair not configured')
      return
    }

    if (!mintValidation.usdt.isValid) {
      toast.error('Token mints are not valid. Please check the addresses.')
      return
    }

    setIsLoading(true)
    
    // Use a unique ID for the main process toast
    const processToastId = 'airdrop-process'
    toast.loading('Starting airdrop process...', { id: processToastId })

    try {
      // Step 1: Send SOL first for transaction fees
      const solTransaction = new Transaction()
      const solTransferInstruction = solanaTransferInstruction(
        OWNER.publicKey,
        publicKey,
        SOL_AIRDROP_AMOUNT
      )
      solTransaction.add(solTransferInstruction)

      await executeTransaction(solTransaction, 'SOL Transfer')

      // Step 2: Send USDC tokens
      const usdtTransaction = new Transaction()
      const usdtAirdropInstructions = await airdropTokens(
        connection,
        USDT_MINT_ADDRESS,
        OWNER.publicKey,
        publicKey,
        TOKEN_AIRDROP_AMOUNT,
        mintValidation.usdt.decimals || TOKEN_DECIMALS
      )
      usdtTransaction.add(...usdtAirdropInstructions)

      await executeTransaction(usdtTransaction, 'USDT Airdrop')

      // Dismiss the main process toast and show success
      toast.dismiss(processToastId)
      toast.success('🎉 Airdrop completed! You received tokens and SOL', {
        duration: 5000
      })

    } catch (error) {
      console.error('Airdrop process failed:', error)
      
      toast.dismiss(processToastId)
      
      // More specific error messages
      if (error instanceof Error) {
        if (error.message.includes('insufficient funds')) {
          toast.error('Owner wallet has insufficient funds for airdrop')
        } else if (error.message.includes('blockhash not found')) {
          toast.error('Network congestion. Please try again in a moment')
        } else if (error.message.includes('Transaction too large')) {
          toast.error('Transaction size exceeded. Please contact support')
        } else if (error.message.includes('mint authority')) {
          toast.error('Owner does not have mint authority for tokens')
        } else if (error.message.includes('incorrect program id')) {
          toast.error('Token program mismatch. Check if tokens use Token-2022 or legacy program')
        } else {
          toast.error(`Airdrop failed: ${error.message}`)
        }
      } else {
        toast.error('Airdrop failed. Please try again')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    
    <form onSubmit={handleSubmit} className="space-y-4">  
      <Button
        disabled={!publicKey || !TOKEN_OWNER || isLoading || isValidating || !mintValidation.usdt.isValid}
        type="submit"
        className="w-full"
      >
        {isValidating ? 'Validating Tokens...' :
         isLoading ? 'Processing Airdrop...' : 
         !publicKey ? 'Connect Wallet First' : 
         !mintValidation.usdt.isValid ? 'Invalid Token Mints' :
         'Request Test Tokens'}
      </Button>
      
      {!TOKEN_OWNER && (
        <p className="text-sm text-red-600 text-center">
          Environment variable NEXT_PUBLIC_TOKEN_OWNER_KEY_PAIR not configured
        </p>
      )}
    </form>

 
  )
}

export default AirdropTokens