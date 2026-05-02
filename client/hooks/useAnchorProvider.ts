import {
  AnchorWallet,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { AnchorProvider } from "@coral-xyz/anchor";
import { useMemo } from "react";

export default function useAnchorProvider() {
  const { connection } = useConnection();
  const wallet = useWallet();

  return useMemo(
    () => new AnchorProvider(connection, wallet as AnchorWallet, {
      commitment: "confirmed",
    }),
    [connection, wallet]
  );
}