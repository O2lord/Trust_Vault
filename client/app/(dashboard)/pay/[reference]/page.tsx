"use client";

// app/pay/[reference]/page.tsx
//
// Standalone payment page for blink users (SELL pool flow).
//
// This page is linked from the blink's post-signature "completed" screen.
// It renders PaymentLinkDisplay which polls Supabase for the payment link
// the bot generates after detecting the InstantSellReservationCreatedEvent.
//
// Must be OUTSIDE the (dashboard) route group so it's accessible without login.
// Place at: app/pay/[reference]/page.tsx

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PaymentLinkDisplay } from "@/components/TrustExpress/SellOrder/PaymentLinkDisplay";
import Link from "next/link";
import { ArrowLeft, Shield, Zap } from "lucide-react";

function PayPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();

  const reference = params.reference as string;
  const pda = searchParams.get("pda") ?? "";
  const tokens = parseFloat(searchParams.get("tokens") ?? "0");
  const fiat = parseFloat(searchParams.get("fiat") ?? "0");
  const currency = searchParams.get("currency") ?? "NGN";

  return (
    <div
      className="min-h-screen bg-[#F5F0E8] flex flex-col"
      style={{ fontFamily: "'Syne', sans-serif" }}
    >
      {/* Header */}
      <div className="w-full border-b border-[#0F0D0A]/8 bg-[#F5F0E8]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <Link
            href="/express"
            className="flex items-center gap-1.5 text-sm text-[#0F0D0A]/50 hover:text-[#0F0D0A] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Express
          </Link>
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#0F0D0A]/40 uppercase tracking-widest">
            <Shield className="w-3.5 h-3.5" />
            Trust Vault
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="w-full max-w-md space-y-6">

          {/* Title */}
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-black text-[#0F0D0A]">
              Complete Your Payment
            </h1>
            <p className="text-sm text-[#0F0D0A]/50">
              Your reservation is confirmed on-chain. Pay to receive your tokens.
            </p>
          </div>

          {/* PaymentLinkDisplay — polls Supabase for the link the bot generates */}
          <PaymentLinkDisplay
            payoutReference={reference}
            trustExpressAddress={pda}
            tokenAmount={tokens}
            fiatAmount={fiat}
            currency={currency}
          />

          {/* Trust footer */}
          <div className="flex items-center justify-center gap-5 py-2">
            <span className="flex items-center gap-1.5 text-[11px] text-[#0F0D0A]/35 font-semibold">
              <Shield className="w-3.5 h-3.5" /> Non-custodial escrow
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-[#0F0D0A]/35 font-semibold">
              <Zap className="w-3.5 h-3.5" /> Validator consensus
            </span>
          </div>

          {/* Reference */}
          <p className="text-center text-[10px] text-[#0F0D0A]/25 font-mono break-all px-4">
            Ref: {reference}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function PayPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="w-8 h-8 border-2 border-[#E8480A] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-[#0F0D0A]/50" style={{ fontFamily: "'Syne', sans-serif" }}>
              Loading payment page...
            </p>
          </div>
        </div>
      }
    >
      <PayPageContent />
    </Suspense>
  );
}