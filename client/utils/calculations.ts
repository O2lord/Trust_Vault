import { BN } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { TrustVaultAccountData, ReservationStatus } from "../types/trustVault";
import { getMintInfo, isToken2022 } from "./solana";

export const calculateFeeAmount = (amount: BN, feePercentage: number): BN => {
  const feeDecimal = feePercentage / 10000;
  return amount.muln(Math.floor(feeDecimal * 10000) / 10000);
};

export const calculateAmountAfterFee = async (
  amount: number,
  getTrustVaultInfo: (trustVault: PublicKey) => Promise<TrustVaultAccountData>,
  trustVault: PublicKey
) => {
  const trustVaultAccount = await getTrustVaultInfo(trustVault);
  const feePercentage = trustVaultAccount.feePercentage || 0;
  const feeAmount = amount * (feePercentage / 10000);
  return amount - feeAmount;
};

export const calculateRemainingFee = async (
  trustVault: PublicKey,
  refundAmount: number,
  originalDeposit: number,
  getTrustVaultInfo: (trustVault: PublicKey) => Promise<TrustVaultAccountData>,
  connection: Connection
) => {
  const trustVaultAccount = await getTrustVaultInfo(trustVault);
  const mintInfo = await getMintInfo(trustVaultAccount.mint, connection);
  const decimals = mintInfo.decimals;

  const totalReservedFee =
    (trustVaultAccount.reservedFee || new BN(0)).toNumber() / 10 ** decimals;
  const refundRatio = refundAmount / originalDeposit;
  const feeToRefund = totalReservedFee * refundRatio;

  return feeToRefund;
};

export const getAvailableTrustVaultBalance = async (
  trustVault: PublicKey,
  getTrustVaultInfo: (trustVault: PublicKey) => Promise<TrustVaultAccountData>,
  connection: Connection
) => {
  const trustVaultAccount = await getTrustVaultInfo(trustVault);

  const totalReserved = (trustVaultAccount.reservedAmounts || [])
    .filter(
      (reservation) =>
        reservation.status === ReservationStatus.PENDING ||
        reservation.status === ReservationStatus.PAYMENT_SENT
    )
    .reduce(
      (total: BN, reservation) => total.add(reservation.amount),
      new BN(0)
    );

  const tokenProgram = (await isToken2022(trustVaultAccount.mint, connection))
    ? TOKEN_2022_PROGRAM_ID
    : TOKEN_PROGRAM_ID;

  const vault = getAssociatedTokenAddressSync(
    trustVaultAccount.mint,
    trustVault,
    true,
    tokenProgram
  );

  try {
    const tokenBalance = await connection.getTokenAccountBalance(vault);
    const actualBalance = new BN(tokenBalance.value.amount);

    return {
      total: actualBalance,
      reserved: totalReserved,
      available: actualBalance.sub(totalReserved),
      reservedFee: trustVaultAccount.reservedFee || new BN(0),
    };
  } catch (error) {
    console.error("Error getting token account balance:", error);
    throw error;
  }
};