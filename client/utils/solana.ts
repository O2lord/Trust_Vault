import { Connection, PublicKey } from "@solana/web3.js";
import { getMint, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { MintInfo } from "@/types/trustVault";

export const parseTokenAccountBalance = (data: Buffer): number => {
  try {
    const amountOffset = 64;
    const amountBuffer = data.slice(amountOffset, amountOffset + 8);

    // Manual conversion from Uint8Array (little-endian) to BigInt
    let rawBalanceBigInt = BigInt(0);
    for (let i = 0; i < 8; i++) {
        rawBalanceBigInt += BigInt(amountBuffer[i]) * (BigInt(2) ** (BigInt(8) * BigInt(i)));
    }

    return Number(rawBalanceBigInt);
  } catch (e) {
    console.error("Error parsing token account balance:", e);
    return 0;
  }
};

export const isToken2022 = async (mint: PublicKey, connection: Connection): Promise<boolean> => {
  try {
    const mintInfo = await connection.getAccountInfo(mint);

    if (!mintInfo || !mintInfo.owner) {
      console.warn(`Could not fetch mint info for ${mint.toString()}`);
      return false;
    }

    return mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID);
  } catch (error) {
    console.error(
      `Error checking if mint ${mint.toString()} is Token2022:`,
      error
    );
    return false;
  }
};

export const getMintInfo = async (mint: PublicKey, connection: Connection): Promise<MintInfo> => {
  try {
    const is2022 = await isToken2022(mint, connection);
    const tokenProgram = is2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

    const mintAccount = await getMint(connection, mint, undefined, tokenProgram);

    return {
      address: mint,
      decimals: mintAccount.decimals,
      isToken2022: is2022,
      tokenProgram: tokenProgram,
    };
  } catch (error) {
    console.error(`Error getting mint info for ${mint.toString()}:`, error);
    throw new Error(
      `Failed to fetch mint information: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
};