"use client";
import '@solana/wallet-adapter-react-ui/styles.css';
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"; 

export default function ConnectWalletButton() {
  const { publicKey, connected, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  const shortKey =
    publicKey?.toBase58().slice(0, 4) +
    "..." +
    publicKey?.toBase58().slice(-4);

  return connected ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="gradient">{shortKey}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          onClick={() =>
            navigator.clipboard.writeText(publicKey!.toBase58())
          }
        >
          Copy Address
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setVisible(true)}>
          Change Wallet
        </DropdownMenuItem>
        <DropdownMenuItem onClick={disconnect}>
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : (
    <Button variant="gradient" onClick={() => setVisible(true)}>
      Connect Wallet
    </Button>
  );
}