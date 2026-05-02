"use client";
import React, { useState } from "react";
import { Copy, CheckCircle2, Link2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface CopyPoolLinkButtonProps {
  trustExpressPubkey: string;
  /** "icon" renders a small icon-only button for card dropdowns.
   *  "full"  renders a labelled outline button. Default: "icon" */
  variant?: "icon" | "full";
}

/**
 * Copies `{origin}/reserve/{pubkey}` to clipboard.
 * Drop into BuyOrderCard / SellOrderCard wherever you want the share affordance.
 *
 * Usage in BuyOrderCard / SellOrderCard:
 *   import CopyPoolLinkButton from "@/components/TrustExpress/ReservePool/CopyPoolLinkButton";
 *   ...
 *   <CopyPoolLinkButton trustExpressPubkey={data.publicKey.toString()} variant="icon" />
 */
export default function CopyPoolLinkButton({
  trustExpressPubkey,
  variant = "icon",
}: CopyPoolLinkButtonProps) {
  const [copied, setCopied] = useState<null | "blink" | "link">(null);

  const getUrls = () => {
    const appUrl =
      //process.env.NEXT_PUBLIC_APP_URL ||
      (typeof window !== "undefined" ? window.location.origin : "");

    const pageLink = `${appUrl}/reserve/${trustExpressPubkey}`;
    const actionUrl = `solana-action:${appUrl}/api/actions/reserve/${trustExpressPubkey}`;
    const blinkUrl = `https://dial.to/?action=${encodeURIComponent(actionUrl)}`;

    return { pageLink, blinkUrl };
  };

  const handleCopy = (type: "blink" | "link") => (e: React.MouseEvent) => {
    e.stopPropagation();
    const { pageLink, blinkUrl } = getUrls();
    const text = type === "blink" ? blinkUrl : pageLink;

    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(type);
        toast.success(type === "blink" ? "Blink link copied!" : "Pool link copied!", {
          description:
            type === "blink"
              ? "Share on X/Twitter to render the blink UI."
              : "Share it anywhere — WhatsApp, Telegram, X.",
          duration: 3000,
        });
        setTimeout(() => setCopied(null), 2500);
      })
      .catch(() => toast.error("Failed to copy link."));
  };

  if (variant === "full") {
    return (
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy("link")}
          className="flex items-center gap-1.5 border-2 border-[#0F0D0A]/10 text-[#0F0D0A]/60 hover:border-[#E8480A] hover:text-[#E8480A] font-bold text-xs transition-all duration-200"
          style={{ fontFamily: "'Syne', sans-serif" }}
        >
          {copied === "link" ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          ) : (
            <Link2 className="w-3.5 h-3.5" />
          )}
          {copied === "link" ? "Copied!" : "Copy pool link"}
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy("blink")}
          className="flex items-center gap-1.5 border-2 border-[#0F0D0A]/10 text-[#0F0D0A]/60 hover:border-[#E8480A] hover:text-[#E8480A] font-bold text-xs transition-all duration-200"
          style={{ fontFamily: "'Syne', sans-serif" }}
        >
          {copied === "blink" ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          ) : (
            <Zap className="w-3.5 h-3.5" />
          )}
          {copied === "blink" ? "Copied!" : "Copy blink"}
        </Button>
      </div>
    );
  }

  // icon variant — two rows in dropdown
  return (
    <div className="flex flex-col w-full">
      <button
        onClick={handleCopy("link")}
        title="Copy pool link"
        className="flex items-center gap-2 w-full text-sm text-[#0F0D0A]/70 hover:text-[#E8480A] transition-colors py-1"
        style={{ fontFamily: "'Syne', sans-serif" }}
      >
        {copied === "link" ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
        ) : (
          <Copy className="w-4 h-4 shrink-0" />
        )}
        {copied === "link" ? "Copied!" : "Copy pool link"}
      </button>

      <button
        onClick={handleCopy("blink")}
        title="Copy blink"
        className="flex items-center gap-2 w-full text-sm text-[#0F0D0A]/70 hover:text-[#E8480A] transition-colors py-1"
        style={{ fontFamily: "'Syne', sans-serif" }}
      >
        {copied === "blink" ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
        ) : (
          <Zap className="w-4 h-4 shrink-0" />
        )}
        {copied === "blink" ? "Copied!" : "Copy blink"}
      </button>
    </div>
  );
}