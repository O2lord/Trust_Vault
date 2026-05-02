"use client";
import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Settings, LayoutDashboard, TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import { Separator } from "@/components/ui/seperator";
import { Button } from "@/components/ui/button";
import { TrustExpressSellGridRef } from "@/components/TrustExpress/SellOrder/ExpressSellGrid";
import useTrustExpress from "@/hooks/express/useTrustExpress";
import CreateBuyButton from "@/components/TrustExpress/BuyOrder/CreateBuyButton";
import CreateExpressSellButton from "@/components/TrustExpress/SellOrder/CreateSellButton";
import { ExpressFilterState } from "@/components/TrustExpress/BuyOrder/Filter";
import ExpressTabs from "./Tabs";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAiIntent, type AiIntent } from "@/app/(dashboard)/express/page";

// Inner component that safely uses useSearchParams()
const LPDashboardPageInner: React.FC = () => {
  const searchParams = useSearchParams();
  const { publicKey } = useWallet();
  const [isVisible, setIsVisible] = useState(false);
  const [filters, setFilters] = useState<ExpressFilterState>({
    token: null,
    currency: null,
    sort: null,
  });

  const expressGridRef = useRef<TrustExpressSellGridRef>(null);
  const { program } = useTrustExpress();

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // ── AI intent — parsed by the shared hook (same logic as express/page.tsx) ──
  // useAiIntent reads: ?intent=reduce&orderAddress=4msu…Tqq9&reduceBy=1 etc.
  const rawAiIntent = useAiIntent();
  // Convert to undefined when there's no active intent so grids skip the check
  const aiIntent: AiIntent | undefined =
    rawAiIntent.type !== null ? rawAiIntent : undefined;

  // Which tab to start on — ActionCard sets ?tab=buy-orders or ?tab=sell-orders
  const initialTab = useMemo<"buy" | "sell">(() => {
    const tab = searchParams.get("tab");
    if (tab === "sell-orders") return "sell";
    return "buy";
  }, [searchParams]);

  const { data: trustExpressAccounts } = useQuery({
    queryKey: ["get-trustExpress-accounts"],
    queryFn: async () => {
      if (!program) return [];
      return await program.account.trustExpress.all();
    },
    enabled: !!program,
  });

  const { tokens, currencies, stats } = useMemo(() => {
    if (!trustExpressAccounts) return { tokens: [], currencies: [], stats: { buyOrders: 0, sellOrders: 0 } };
    const uniqueTokens = new Set<string>();
    const uniqueCurrencies = new Set<string>();
    let buyOrders = 0;
    let sellOrders = 0;

    trustExpressAccounts.forEach((account) => {
      if (account.account.mint) uniqueTokens.add(account.account.mint.toString());
      if (account.account.currency) {
        try {
          const s = String.fromCharCode(...account.account.currency).trim();
          if (s) uniqueCurrencies.add(s);
        } catch {}
      }
      if (publicKey && account.account.maker.toString() === publicKey.toString()) {
        if (account.account.escrowType === 1) buyOrders++;
        if (account.account.escrowType === 0) sellOrders++;
      }
    });

    return {
      tokens: Array.from(uniqueTokens).map((t) => ({
        value: t,
        label: t.substring(0, 4) + "..." + t.substring(t.length - 4),
      })),
      currencies: Array.from(uniqueCurrencies).map((c) => ({ value: c, label: c })),
      stats: { buyOrders, sellOrders },
    };
  }, [trustExpressAccounts, publicKey]);

  const handleFilterChange = useCallback((newFilters: ExpressFilterState) => {
    setFilters(newFilters);
  }, []);

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <div className="container mx-auto py-10">
        <div
          className={`space-y-8 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {/* ── Header ── */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-[#0F0D0A] p-3 rounded-xl">
                <LayoutDashboard className="w-6 h-6 text-[#E8480A]" />
              </div>
              <div>
                <h1
                  className="text-3xl font-black tracking-tight text-[#0F0D0A]"
                  style={{ fontFamily: "'Syne', sans-serif" }}
                >
                  LP Dashboard
                </h1>
                <p className="text-sm text-[#0F0D0A]/55 mt-0.5">
                  Manage your liquidity positions on Trust Express
                </p>
              </div>
            </div>

            {/* Settings CTA */}
            <Link href="/express/providers/settings">
              <Button
                variant="outline"
                className="flex items-center gap-2 border-2 border-[#0F0D0A]/15 text-[#0F0D0A] hover:border-[#0F0D0A] hover:bg-[#0F0D0A] hover:text-white transition-all duration-200 font-semibold"
                style={{ fontFamily: "'Syne', sans-serif" }}
              >
                <Settings className="w-4 h-4" />
                Settings
                <ArrowRight className="w-3.5 h-3.5 opacity-60" />
              </Button>
            </Link>
          </div>

          {/* ── Stats Strip ── */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border-2 border-[#0F0D0A]/10 bg-white px-6 py-5 flex items-center gap-4">
              <div className="bg-[#0F0D0A] p-2.5 rounded-lg">
                <TrendingUp className="w-5 h-5 text-[#E8480A]" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#0F0D0A]/40" style={{ fontFamily: "'Syne', sans-serif" }}>
                  Your Buy Orders
                </p>
                <p className="text-3xl font-black text-[#0F0D0A] leading-none mt-1" style={{ fontFamily: "'Syne', sans-serif" }}>
                  {stats.buyOrders}
                </p>
              </div>
            </div>
            <div className="rounded-xl border-2 border-[#0F0D0A]/10 bg-white px-6 py-5 flex items-center gap-4">
              <div className="bg-[#E8480A] p-2.5 rounded-lg">
                <TrendingDown className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#0F0D0A]/40" style={{ fontFamily: "'Syne', sans-serif" }}>
                  Your Sell Orders
                </p>
                <p className="text-3xl font-black text-[#0F0D0A] leading-none mt-1" style={{ fontFamily: "'Syne', sans-serif" }}>
                  {stats.sellOrders}
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* ── Action Buttons ── */}
          <div className="flex flex-wrap gap-3 items-center">
            <CreateBuyButton />
            <CreateExpressSellButton />
          </div>

          <Separator />

          {/* ── My Orders Grids ── */}
          <div>
            <ExpressTabs
              tokens={tokens}
              currencies={currencies}
              onFilterChange={handleFilterChange}
              expressGridRef={expressGridRef}
              filters={filters}
              filterByCurrentUser={true}
              aiIntent={aiIntent}
              initialTab={initialTab}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

// Wrap in Suspense because useSearchParams() requires it in Next.js App Router
const LPDashboardPage: React.FC = () => (
  <Suspense fallback={null}>
    <LPDashboardPageInner />
  </Suspense>
);

export default LPDashboardPage;