"use client";
import React, { useState, useRef } from "react";
import { DollarSign, ShoppingCart, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import UnifiedFilter, { ExpressFilterState } from "@/components/TrustExpress/BuyOrder/Filter";
import TrustExpressSellGrid, { TrustExpressSellGridRef } from "@/components/TrustExpress/SellOrder/ExpressSellGrid";
import TrustExpressBuyGrid, { TrustExpressGridRef } from "@/components/TrustExpress/BuyOrder/ExpressBuyGrid";
import { toast } from "sonner";

interface ExpressTabsProps {
  tokens: { value: string; label: string }[];
  currencies: { value: string; label: string }[];
  onFilterChange: (filters: ExpressFilterState) => void;
  expressGridRef: React.RefObject<TrustExpressSellGridRef>;
  filters: ExpressFilterState;
}

const ExpressTabs: React.FC<ExpressTabsProps> = ({
  tokens,
  currencies,
  onFilterChange,
  expressGridRef,
  filters,
}) => {
  const [activeTab, setActiveTab] = useState("buy");
  const [isTabChanging, setIsTabChanging] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const buyGridRef = useRef<TrustExpressGridRef>(null);

  const handleTabChange = (tab: string) => {
    if (tab === activeTab) return;
    setIsTabChanging(true);
    setTimeout(() => {
      setActiveTab(tab);
      setIsTabChanging(false);
    }, 150);
  };

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    await new Promise((r) => setTimeout(r, 300));
    try {
      if (activeTab === "buy" && expressGridRef.current) expressGridRef.current.refresh();
      else if (activeTab === "sell" && buyGridRef.current) buyGridRef.current.refresh();
      await new Promise((r) => setTimeout(r, 500));
      toast.success("Data refreshed successfully");
    } catch {
      toast.error("Failed to refresh data");
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="w-full mx-auto">

      {/* ── Tab bar ── */}
      <div className="flex justify-between items-end mb-0 border-b border-[#0F0D0A]/10">
        {/* Tabs */}
        <div className="flex">
          {[
            { id: "buy",  label: "Buy Tokens",  Icon: ShoppingCart },
            { id: "sell", label: "Sell Tokens", Icon: DollarSign },
          ].map(({ id, label, Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => handleTabChange(id)}
                className={cn(
                  "relative flex items-center gap-2 px-6 py-3 text-sm font-semibold transition-all duration-200",
                  "border-b-2 -mb-px",
                  isActive
                    ? "border-[#E8480A] text-[#0F0D0A]"
                    : "border-transparent text-[#0F0D0A]/45 hover:text-[#0F0D0A]/70 hover:border-[#0F0D0A]/20"
                )}
              >
                <Icon
                  className={cn(
                    "w-4 h-4 transition-colors",
                    isActive ? "text-[#E8480A]" : "text-current"
                  )}
                />
                {label}
              </button>
            );
          })}
        </div>

        {/* Right: filter */}
        <div className="pb-2">
          <UnifiedFilter
            tokens={tokens}
            currencies={currencies}
            onFilterChange={onFilterChange}
            initialFilters={filters}
          />
        </div>
      </div>

      {/* ── Tab sub-header ── */}
      <div className="flex justify-between items-center py-5">
        <div className="flex items-center gap-3">
          {/* Icon pill */}
          <div
            className={cn(
              "p-2 rounded-lg",
              activeTab === "buy"
                ? "bg-[#E8480A]"
                : "bg-[#0F0D0A]"
            )}
          >
            {activeTab === "buy" ? (
              <ShoppingCart className="w-4 h-4 text-white" />
            ) : (
              <DollarSign className="w-4 h-4 text-white" />
            )}
          </div>

          <div>
            <h3 className="text-lg font-bold text-[#0F0D0A]">
              {activeTab === "buy" ? "Buy Digital Assets" : "Sell Digital Assets"}
            </h3>
            <p className="text-sm text-[#0F0D0A]/50">
              {activeTab === "buy"
                ? "Exchange your local currency for tokens instantly"
                : "Exchange your tokens for local currency instantly"}
            </p>
          </div>
        </div>

        {/* Refresh */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className={cn(
            "transition-all duration-300",
            isRefreshing && "opacity-70"
          )}
        >
          <RefreshCcw
            className={cn(
              "mr-2 h-4 w-4 transition-all duration-300",
              isRefreshing && "animate-spin"
            )}
          />
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {/* ── Grid content ── */}
      <div
        className={cn(
          "transition-all duration-500",
          isTabChanging || isRefreshing ? "opacity-50 scale-[0.99]" : "opacity-100 scale-100"
        )}
      >
        {activeTab === "buy" ? (
          <TrustExpressSellGrid
            ref={expressGridRef}
            tokenFilter={filters.token}
            currencyFilter={filters.currency}
            sortOrder={filters.sort}
            title=""
          />
        ) : (
          <TrustExpressBuyGrid
            ref={buyGridRef}
            tokenFilter={filters.token}
            currencyFilter={filters.currency}
            sortOrder={filters.sort}
            title=""
          />
        )}
      </div>
    </div>
  );
};

export default ExpressTabs;