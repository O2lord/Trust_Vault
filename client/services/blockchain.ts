import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
  createMintToInstruction,
  getAccount,
  getMint,
} from '@solana/spl-token'

// Function to detect which token program a mint uses
const getTokenProgramId = async (
  connection: Connection,
  mintAddress: PublicKey
): Promise<PublicKey> => {
  try {
    // Try to get mint info using TOKEN_2022_PROGRAM_ID first
    await getMint(connection, mintAddress, 'confirmed', TOKEN_2022_PROGRAM_ID)
   
    return TOKEN_2022_PROGRAM_ID
  } catch (error) {
    try {
      // Fall back to legacy TOKEN_PROGRAM_ID
      await getMint(connection, mintAddress, 'confirmed', TOKEN_PROGRAM_ID)
    
      return TOKEN_PROGRAM_ID
    } catch (legacyError) {
      console.error('Failed to detect token program for mint:', mintAddress.toBase58())
      throw new Error(`Invalid mint address or unsupported token program: ${mintAddress.toBase58()}`)
    }
  }
}

const airdropTokens = async (
  connection: Connection,
  mintPubKey: PublicKey,
  ownerPubKey: PublicKey,
  recipientPubKey: PublicKey,
  amount: number,
  decimals: number
): Promise<TransactionInstruction[]> => {
  const instructions: TransactionInstruction[] = []

  try {
    // Detect which token program this mint uses
    const tokenProgramId = await getTokenProgramId(connection, mintPubKey)
   

    const receiverAta = await getAssociatedTokenAddress(
      mintPubKey,
      recipientPubKey,
      false,
      tokenProgramId,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )

    const senderAta = await getAssociatedTokenAddress(
      mintPubKey,
      ownerPubKey,
      false,
      tokenProgramId,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )

    // Check if receiver ATA exists
    const receiverAccountInfo = await connection.getAccountInfo(receiverAta)
    if (!receiverAccountInfo) {
     
      instructions.push(createAtaInstruction(ownerPubKey, recipientPubKey, receiverAta, mintPubKey, tokenProgramId))
    }

    // Check if sender ATA exists
    const senderAccountInfo = await connection.getAccountInfo(senderAta)
    if (!senderAccountInfo) {
     
      instructions.push(createAtaInstruction(ownerPubKey, ownerPubKey, senderAta, mintPubKey, tokenProgramId))
      
      // Mint tokens to sender ATA since it doesn't exist
      const mintAmount = amount * Math.pow(10, decimals)
     
      instructions.push(createMintToInstruction(
        mintPubKey,
        senderAta,
        ownerPubKey, // mint authority
        mintAmount,
        [],
        tokenProgramId
      ))
    } else {
      // Check sender balance and mint more if needed
      try {
        const senderTokenAccount = await getAccount(connection, senderAta, 'confirmed', tokenProgramId)
        const currentBalance = Number(senderTokenAccount.amount)
        const requiredAmount = amount * Math.pow(10, decimals)
        
        if (currentBalance < requiredAmount) {
          const mintAmount = requiredAmount - currentBalance
          
          instructions.push(createMintToInstruction(
            mintPubKey,
            senderAta,
            ownerPubKey, // mint authority
            mintAmount,
            [],
            tokenProgramId
          ))
        }
      } catch (error) {
        
        const mintAmount = amount * Math.pow(10, decimals)
        instructions.push(createMintToInstruction(
          mintPubKey,
          senderAta,
          ownerPubKey, // mint authority
          mintAmount,
          [],
          tokenProgramId
        ))
      }
    }

    // Add transfer instruction
    instructions.push(tokenTransferInstruction(senderAta, receiverAta, ownerPubKey, amount, decimals, tokenProgramId))
    return instructions
  } catch (error) {
    console.error('Error creating airdrop instructions:', error)
    throw error
  }
}

const tokenTransferInstruction = (
  senderATA: PublicKey,
  receiverATA: PublicKey,
  ownerPubKey: PublicKey,
  amount: number,
  decimals: number,
  tokenProgramId: PublicKey
): TransactionInstruction => {
  const transferAmount = amount * Math.pow(10, decimals)
  
  const instruction = createTransferInstruction(
    senderATA,
    receiverATA,
    ownerPubKey,
    transferAmount,
    [],
    tokenProgramId
  )

  return instruction
}

const createAtaInstruction = (
  payerAccount: PublicKey,   
  ownerAccount: PublicKey,   
  ata: PublicKey,            
  mintPubKey: PublicKey,     
  tokenProgramId: PublicKey  
): TransactionInstruction => {
  const instruction = createAssociatedTokenAccountInstruction(
    payerAccount, 
    ata,         
    ownerAccount,
    mintPubKey,  
    tokenProgramId
  )
  return instruction
}

const solanaTransferInstruction = (
  fromPubkey: PublicKey,
  toPubkey: PublicKey,
  amount: number
): TransactionInstruction => {
  const lamports = Math.floor(amount * LAMPORTS_PER_SOL)
  
  const instruction = SystemProgram.transfer({
    fromPubkey,
    toPubkey,
    lamports,
  })

  return instruction
}

// Helper function to check account balances
const checkAccountBalance = async (
  connection: Connection,
  publicKey: PublicKey
): Promise<number> => {
  try {
    const balance = await connection.getBalance(publicKey)
    return balance / LAMPORTS_PER_SOL
  } catch (error) {
    console.error('Error checking balance:', error)
    return 0
  }
}

// Helper function to validate mint and get its info
const validateMint = async (
  connection: Connection,
  mintAddress: PublicKey
): Promise<{ isValid: boolean; programId?: PublicKey; decimals?: number; supply?: bigint }> => {
  try {
    const tokenProgramId = await getTokenProgramId(connection, mintAddress)
    const mintInfo = await getMint(connection, mintAddress, 'confirmed', tokenProgramId)
    
    return {
      isValid: true,
      programId: tokenProgramId,
      decimals: mintInfo.decimals,
      supply: mintInfo.supply
    }
  } catch (error) {
    console.error('Mint validation failed:', error)
    return { isValid: false }
  }
}

export { 
  airdropTokens, 
  solanaTransferInstruction, 
  checkAccountBalance,
  validateMint,
  getTokenProgramId
}