"use client";

import { useState, useEffect } from "react";
import TrustVaultChat from "@/components/TrustExpress/Chat/TrustVaultChat";
import useChatContext from "@/hooks/express/useChatContext";
import useBuyerFlutterwaveCredentials from "@/hooks/useBuyerFlutterwaveCredentials";
import useSellerFlutterwaveCredentials from "@/hooks/useSellerFlutterwaveCredentials";
import { useWallet } from "@solana/wallet-adapter-react";

const BRAND = {
  orange: "#E8480A",
  black: "#0F0D0A",
} as const;

export default function FloatingChat(): JSX.Element {
  const [open, setOpen] = useState<boolean>(false);
  const { publicKey } = useWallet();

  /**
   * useChatContext fetches all TrustExpress accounts when a wallet is connected
   * and returns a serialised plain-text block for the AI system prompt.
   * Returns null when no wallet is present — the chat works in general-knowledge
   * mode in that case (no change to unauthenticated UX).
   */
  const walletContext = useChatContext();

  // Pre-warm credential caches as soon as the wallet connects so that when the
  // AI triggers a buy/sell dialog the credentials are already loaded and the
  // auto-select fires immediately with no visible delay.
  const { fetchCredentials: fetchBuyerCreds } = useBuyerFlutterwaveCredentials();
  const { fetchCredentials: fetchSellerCreds } = useSellerFlutterwaveCredentials();

  useEffect(() => {
    if (publicKey) {
      fetchBuyerCreds();
      fetchSellerCreds();
    }
  }, [publicKey]);

  return (
    <>
      {/* Chat window */}
      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 88,
            right: 24,
            width: 380,
            height: 580,
            borderRadius: 16,
            overflow: "hidden",
            boxShadow:
              "0 24px 60px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.10)",
            zIndex: 9998,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <TrustVaultChat embedded={true} walletContext={walletContext} />
        </div>
      )}

      {/* Toggle bubble */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        aria-label={open ? "Close chat" : "Open Trust Vault AI chat"}
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: BRAND.orange,
          border: "none",
          cursor: "pointer",
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 20px rgba(232,72,10,0.4)",
          transition: "transform .2s, box-shadow .2s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.08)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
        }}
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M18 6L6 18M6 6l12 12"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
    </>
  );
}