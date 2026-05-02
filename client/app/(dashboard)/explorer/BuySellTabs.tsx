"use client";
import React, { useState, useRef } from "react";
import { DollarSign, ShoppingCart, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import UnifiedFilter, { FilterState } from "@/components/TrustVault/Shared/Filter";
import SellOrderGrid from "@/components/TrustVault/SellOrder/SellOrderGrid";
import BuyGrid from "@/components/TrustVault/BuyOrder/BuyOrderGrid";
import { SellOrderGridRef } from "@/components/TrustVault/SellOrder/SellOrderGrid";
import { BuyGridRef } from "@/components/TrustVault/BuyOrder/BuyOrderGrid";
import { toast } from "sonner";


interface BuySellTabsProps {
    tokens: { value: string; label: string }[];
    currencies: { value: string; label: string }[];
    onFilterChange: (filters: FilterState) => void;
    sellOrderGridRef: React.RefObject<SellOrderGridRef | null>;
    filters: FilterState;
}

const BuySellTabs: React.FC<BuySellTabsProps> = ({
    tokens,
    currencies,
    onFilterChange,
    sellOrderGridRef,
    filters

}) => {
  // State to track active tab
  const [activeTab, setActiveTab] = useState("buy");
  const [isTabChanging, setIsTabChanging] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Create ref for BuyGrid
  const buyGridRef = useRef<BuyGridRef>(null);
  
  // Handler for tab change
  const handleTabChange = (tab: string) => {
    if (tab === activeTab) return;
    
    setIsTabChanging(true);
    setTimeout(() => {
      setActiveTab(tab);
      setIsTabChanging(false);
    }, 150);
  };

  // Refresh handler with animations
  const handleRefresh = async () => {
    if (isRefreshing) return;
    
    setIsRefreshing(true);
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    try {
    
      if (activeTab === "buy" && sellOrderGridRef.current) {
        sellOrderGridRef.current.refresh();
      } else if (activeTab === "sell" && buyGridRef.current) {
        buyGridRef.current.refresh();
      }
      

      await new Promise(resolve => setTimeout(resolve, 500));
      toast.success("Data refreshed successfully");
    } catch (error) {
      console.error("Error refreshing data:", error);
      toast.error("Failed to refresh data");
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="w-full mx-auto">
      {/* Enhanced Tab Navigation with Filter */}
      <div className="relative mb-8">
        {/* Background glow */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-gray-700/20 to-transparent h-px top-12" />
        
        <div className="flex relative justify-between items-center">
          {/* Left side - Tab buttons */}
          <div className="flex">
            {/* Buy Tab */}
            <Button
              variant="ghost"
              className={cn(
                "group relative px-8 py-4 rounded-none border-b-2 transition-all duration-300 font-semibold text-base",
                activeTab === "buy" 
                  ? "border-green-500 text-green-400 bg-green-500/5" 
                  : "border-transparent text-gray-400 hover:text-gray-300 hover:bg-gray-800/50"
              )}
              onClick={() => handleTabChange("buy")}
            >
              <div className="flex items-center space-x-2">
                <ShoppingCart className={cn(
                  "w-5 h-5 transition-all duration-300",
                  activeTab === "buy" ? "text-green-400" : "text-gray-500 group-hover:text-gray-400"
                )} />
                <span>Buy</span>
              </div>
              
              {/* Active tab glow effect */}
              {activeTab === "buy" && (
                <div className="absolute inset-0 bg-gradient-to-r from-green-500/10 via-green-500/20 to-green-500/10 rounded-lg blur-sm" />
              )}
            </Button>

            {/* Sell Tab */}
            <Button
              variant="ghost"
              className={cn(
                "group relative px-8 py-4 rounded-none border-b-2 transition-all duration-300 font-semibold text-base",
                activeTab === "sell" 
                  ? "border-orange-500 text-orange-400 bg-orange-500/5" 
                  : "border-transparent text-gray-400 hover:text-gray-300 hover:bg-gray-800/50"
              )}
              onClick={() => handleTabChange("sell")}
            >
              <div className="flex items-center space-x-2">
                <DollarSign className={cn(
                  "w-5 h-5 transition-all duration-300",
                  activeTab === "sell" ? "text-orange-400" : "text-gray-500 group-hover:text-gray-400"
                )} />
                <span>Sell</span>
              </div>
              
              {/* Active tab glow effect */}
              {activeTab === "sell" && (
                <div className="absolute inset-0 bg-gradient-to-r from-orange-500/10 via-orange-500/20 to-orange-500/10 rounded-lg blur-sm" />
              )}
            </Button>
          </div>

          {/* Right side - Filter */}
          <div className="transition-all duration-300">
            <UnifiedFilter
              tokens={tokens}
              currencies={currencies}
              onFilterChange={onFilterChange}
              initialFilters={filters}
            />
          </div>
        </div>
      </div>

      {/* Tab Header Section */}
      <div className="transition-all duration-300 mb-6">
        <div className="flex justify-between items-center">
          {/* Left side - Tab header content */}
          <div>
            {activeTab === "buy" ? (
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg blur-sm opacity-30" />
                  <div className="relative bg-gradient-to-r from-green-500 to-emerald-600 p-2 rounded-lg">
                    <ShoppingCart className="w-4 h-4 text-white" />
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Buy Digital Assets</h3>
                  <p className="text-sm text-gray-400 font-medium">Exchange your local currency for USDT/USDC</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-red-600 rounded-lg blur-sm opacity-30" />
                  <div className="relative bg-gradient-to-r from-orange-500 to-red-600 p-2 rounded-lg">
                    <DollarSign className="w-4 h-4 text-white" />
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Sell Digital Assets</h3>
                  <p className="text-sm text-gray-400 font-medium">Exchange your USDT/USDC for local currency</p>
                </div>
              </div>
            )}
          </div>

          {/* Right side - Refresh button */}
          <div className="transition-all duration-300">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRefresh}
              disabled={isRefreshing}
              className={cn(
                "transition-all duration-300 transform hover:scale-105",
                isRefreshing && "scale-95 opacity-80"
              )}
            >
              <RefreshCcw className={cn(
                "mr-2 h-4 w-4 transition-all duration-300",
                isRefreshing ? 'animate-spin text-blue-500' : 'hover:rotate-180'
              )} />
              <span className="transition-all duration-300">
                {isRefreshing ? 'Refreshing...' : 'Refresh'}
              </span>
            </Button>
          </div>
        </div>
      </div>
      
      {/* Content area with smooth transitions and refresh animation */}
      <div className={cn(
        "transition-all duration-500 transform",
        isRefreshing ? "opacity-70 scale-[0.98]" : "opacity-100 scale-100"
      )}>
        {activeTab === "buy" ? (
          <div className="space-y-6">
            <div className="relative">
              <SellOrderGrid 
                ref={sellOrderGridRef}
                tokenFilter={filters.token}
                currencyFilter={filters.currency}
                sortOrder={filters.sort}
                title=""
              />
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="relative">
              <BuyGrid
                ref={buyGridRef}
                tokenFilter={filters.token}
                currencyFilter={filters.currency}
                sortOrder={filters.sort}
                title=""
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BuySellTabs;