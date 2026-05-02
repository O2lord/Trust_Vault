// app/express/providers/settings/page.tsx
// UPDATED: Added Korapay credential managers to both Seller and Buyer tabs.
// Changes: 2 new dynamic() imports + 2 new card blocks (one per tab).

"use client";
import React, { useState, useEffect } from "react";
import {
  Settings,
  ArrowLeft,
  ShoppingCart,
  DollarSign,
  Shield,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/seperator";
import { cn } from "@/lib/utils";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

// ── Flutterwave (existing) ────────────────────────────────────────────────────

const BuyerFlutterwaveCredentialManager = dynamic(
  () => import("@/components/BuyerFlutterwaveCredentialManager"),
  { ssr: false, loading: () => <Card><CardHeader><CardTitle>Buyer Credentials</CardTitle><CardDescription>Loading...</CardDescription></CardHeader></Card> }
);

const SellerFlutterwaveCredentialManager = dynamic(
  () => import("@/components/SellerFlutterwaveCredentialManager"),
  { ssr: false, loading: () => <Card><CardHeader><CardTitle>Seller Credentials</CardTitle><CardDescription>Loading...</CardDescription></CardHeader></Card> }
);

// ── OPay (existing) ───────────────────────────────────────────────────────────

const SellerOpayCredentialManager = dynamic(
  () => import("@/components/TrustExpress/CredentialsManager/SellOrder/opaySellerCredentialsManager"),
  { ssr: false, loading: () => <Card><CardHeader><CardTitle>OPay Seller Credentials</CardTitle><CardDescription>Loading...</CardDescription></CardHeader></Card> }
);

const BuyerOpayCredentialManager = dynamic(
  () => import("@/components/TrustExpress/CredentialsManager/BuyOrder/OPayBuyerCredentialManager"),
  { ssr: false, loading: () => <Card><CardHeader><CardTitle>OPay Buyer Credentials</CardTitle><CardDescription>Loading...</CardDescription></CardHeader></Card> }
);

// ── Paystack (existing) ───────────────────────────────────────────────────────

const SellerPaystackCredentialManager = dynamic(
  () => import("@/components/TrustExpress/CredentialsManager/SellOrder/PaystackSellerCredentialManager"),
  { ssr: false, loading: () => <Card><CardHeader><CardTitle>Paystack Seller Credentials</CardTitle><CardDescription>Loading...</CardDescription></CardHeader></Card> }
);

const BuyerPaystackCredentialManager = dynamic(
  () => import("@/components/TrustExpress/CredentialsManager/BuyOrder/PaystackBuyerCredentialManager"),
  { ssr: false, loading: () => <Card><CardHeader><CardTitle>Paystack Buyer Credentials</CardTitle><CardDescription>Loading...</CardDescription></CardHeader></Card> }
);

// ── Korapay (NEW) ─────────────────────────────────────────────────────────────

const SellerKorapayCredentialManager = dynamic(
  () => import("@/components/TrustExpress/CredentialsManager/SellOrder/KorapaySellerCredentialManager"),
  { ssr: false, loading: () => <Card><CardHeader><CardTitle>Korapay Seller Credentials</CardTitle><CardDescription>Loading...</CardDescription></CardHeader></Card> }
);

const BuyerKorapayCredentialManager = dynamic(
  () => import("@/components/TrustExpress/CredentialsManager/BuyOrder/KorapayBuyerCredentialManager"),
  { ssr: false, loading: () => <Card><CardHeader><CardTitle>Korapay Buyer Credentials</CardTitle><CardDescription>Loading...</CardDescription></CardHeader></Card> }
);

// ─────────────────────────────────────────────────────────────────────────────

type SettingsTab = "buyer" | "seller";

const LPSettingsPage: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>("seller");

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 80);
    return () => clearTimeout(timer);
  }, []);

  // ── Processor logo helper ────────────────────────────────────────────────

  const ProcessorBadge = ({ label, bg, color }: { label: string; bg: string; color: string }) => (
    <div
      className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
      style={{ background: bg }}
    >
      <span className="text-[8px] font-black" style={{ color }}>{label}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <div className="container mx-auto py-10 max-w-4xl">
        <div
          className={`space-y-8 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {/* ── Back + Header ── */}
          <div className="flex items-center gap-4">
            <Link href="/express/providers">
              <Button variant="ghost" size="sm" className="text-[#0F0D0A]/50 hover:text-[#0F0D0A] hover:bg-[#0F0D0A]/8 -ml-2">
                <ArrowLeft className="w-4 h-4 mr-1.5" />
                Back to Dashboard
              </Button>
            </Link>
          </div>

          <div className="flex items-center gap-4">
            <div className="bg-[#0F0D0A] p-3 rounded-xl">
              <Settings className="w-6 h-6 text-[#E8480A]" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-[#0F0D0A]" style={{ fontFamily: "'Syne', sans-serif" }}>
                LP Settings
              </h1>
              <p className="text-sm text-[#0F0D0A]/55 mt-0.5">
                Manage your payment processor credentials for TrustExpress
              </p>
            </div>
          </div>

          <Separator />

          {/* ── Security Banner ── */}
          <div
            className="rounded-xl border-2 px-5 py-4 flex items-start gap-3"
            style={{ borderColor: "rgba(10,123,107,0.25)", background: "rgba(10,123,107,0.06)" }}
          >
            <Shield className="w-5 h-5 text-[#0A7B6B] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-[#0A7B6B]">Secure Credential Storage</p>
              <p className="text-xs text-[#0A7B6B]/70 mt-0.5 leading-relaxed">
                All payment credentials (Flutterwave, OPay, Paystack, Korapay) are encrypted with AES-256-GCM before storage. They are only decrypted in-memory at the moment a payout is processed and are never exposed in plaintext.
              </p>
            </div>
          </div>

          {/* ── Credential Type Explanation ── */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-xl border-2 border-[#0F0D0A]/8 bg-white p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="bg-[#E8480A] p-2 rounded-lg">
                  <DollarSign className="w-4 h-4 text-white" />
                </div>
                <h3 className="font-bold text-[#0F0D0A]" style={{ fontFamily: "'Syne', sans-serif" }}>Seller Credentials</h3>
              </div>
              <p className="text-xs text-[#0F0D0A]/55 leading-relaxed">
                Used when you run <strong>Sell Orders</strong>. When a buyer reserves tokens and sends fiat, these credentials authorize the automated payout to their bank account.
              </p>
            </div>
            <div className="rounded-xl border-2 border-[#0F0D0A]/8 bg-white p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="bg-[#0F0D0A] p-2 rounded-lg">
                  <ShoppingCart className="w-4 h-4 text-[#E8480A]" />
                </div>
                <h3 className="font-bold text-[#0F0D0A]" style={{ fontFamily: "'Syne', sans-serif" }}>Buyer Credentials</h3>
              </div>
              <p className="text-xs text-[#0F0D0A]/55 leading-relaxed">
                Used when you run <strong>Buy Orders</strong>. When a seller sends tokens, these credentials authorize the automated fiat payout to the seller&apos;s bank account.
              </p>
            </div>
          </div>

          <Separator />

          {/* ── Tabs ── */}
          <div>
            <div className="flex border-b border-[#0F0D0A]/10 mb-6">
              {(
                [
                  { id: "seller" as SettingsTab, label: "Seller Credentials", Icon: DollarSign },
                  { id: "buyer" as SettingsTab, label: "Buyer Credentials", Icon: ShoppingCart },
                ] as const
              ).map(({ id, label, Icon }) => {
                const isActive = activeTab === id;
                return (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={cn(
                      "relative flex items-center gap-2 px-5 py-3 text-sm font-semibold transition-all duration-200",
                      "border-b-2 -mb-px",
                      isActive
                        ? "border-[#E8480A] text-[#0F0D0A]"
                        : "border-transparent text-[#0F0D0A]/40 hover:text-[#0F0D0A]/70"
                    )}
                    style={{ fontFamily: "'Syne', sans-serif" }}
                  >
                    <Icon className={cn("w-4 h-4", isActive ? "text-[#E8480A]" : "text-current")} />
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="transition-all duration-300 space-y-6">
              {activeTab === "seller" ? (
                <>
                  {/* Flutterwave seller — UNCHANGED */}
                  <div className="rounded-xl border-2 border-[#0F0D0A]/8 bg-white p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <img src="/flutterwave-icon.png" alt="Flutterwave" className="w-5 h-5"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      <h4 className="text-sm font-bold text-[#0F0D0A] uppercase tracking-wider" style={{ fontFamily: "'Syne', sans-serif" }}>
                        Flutterwave
                      </h4>
                    </div>
                    <SellerFlutterwaveCredentialManager />
                  </div>

                  {/* OPay seller — UNCHANGED */}
                  <div className="rounded-xl border-2 border-[#0F0D0A]/8 bg-white p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <ProcessorBadge label="OP" bg="#0F0D0A" color="#fff" />
                      <h4 className="text-sm font-bold text-[#0F0D0A] uppercase tracking-wider" style={{ fontFamily: "'Syne', sans-serif" }}>
                        OPay
                      </h4>
                    </div>
                    <SellerOpayCredentialManager />
                  </div>

                  {/* Paystack seller — UNCHANGED */}
                  <div className="rounded-xl border-2 border-[#0F0D0A]/8 bg-white p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <ProcessorBadge label="PS" bg="#00C3F7" color="#fff" />
                      <h4 className="text-sm font-bold text-[#0F0D0A] uppercase tracking-wider" style={{ fontFamily: "'Syne', sans-serif" }}>
                        Paystack
                      </h4>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ background: "#0A7B6B" }}>
                        Recommended
                      </span>
                    </div>
                    <SellerPaystackCredentialManager />
                  </div>

                  {/* Korapay seller — NEW */}
                  <div className="rounded-xl border-2 border-[#0F0D0A]/8 bg-white p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <ProcessorBadge label="KP" bg="#F05A28" color="#fff" />
                      <h4 className="text-sm font-bold text-[#0F0D0A] uppercase tracking-wider" style={{ fontFamily: "'Syne', sans-serif" }}>
                        Korapay
                      </h4>
                    </div>
                    <SellerKorapayCredentialManager />
                  </div>
                </>
              ) : (
                <>
                  {/* Flutterwave buyer — UNCHANGED */}
                  <div className="rounded-xl border-2 border-[#0F0D0A]/8 bg-white p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <img src="/flutterwave-icon.png" alt="Flutterwave" className="w-5 h-5"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      <h4 className="text-sm font-bold text-[#0F0D0A] uppercase tracking-wider" style={{ fontFamily: "'Syne', sans-serif" }}>
                        Flutterwave
                      </h4>
                    </div>
                    <BuyerFlutterwaveCredentialManager />
                  </div>

                  {/* OPay buyer — UNCHANGED */}
                  <div className="rounded-xl border-2 border-[#0F0D0A]/8 bg-white p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <ProcessorBadge label="OP" bg="#0F0D0A" color="#fff" />
                      <h4 className="text-sm font-bold text-[#0F0D0A] uppercase tracking-wider" style={{ fontFamily: "'Syne', sans-serif" }}>
                        OPay
                      </h4>
                    </div>
                    <BuyerOpayCredentialManager />
                  </div>

                  {/* Paystack buyer — UNCHANGED */}
                  <div className="rounded-xl border-2 border-[#0F0D0A]/8 bg-white p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <ProcessorBadge label="PS" bg="#00C3F7" color="#fff" />
                      <h4 className="text-sm font-bold text-[#0F0D0A] uppercase tracking-wider" style={{ fontFamily: "'Syne', sans-serif" }}>
                        Paystack
                      </h4>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ background: "#0A7B6B" }}>
                        Recommended
                      </span>
                    </div>
                    <BuyerPaystackCredentialManager />
                  </div>

                  {/* Korapay buyer — NEW */}
                  <div className="rounded-xl border-2 border-[#0F0D0A]/8 bg-white p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <ProcessorBadge label="KP" bg="#F05A28" color="#fff" />
                      <h4 className="text-sm font-bold text-[#0F0D0A] uppercase tracking-wider" style={{ fontFamily: "'Syne', sans-serif" }}>
                        Korapay
                      </h4>
                    </div>
                    <BuyerKorapayCredentialManager />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LPSettingsPage;