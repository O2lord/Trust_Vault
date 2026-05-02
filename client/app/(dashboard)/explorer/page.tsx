"use client";
import TrustVaultCountCard from "@/components/TrustVault/Shared/TrustVaultCountCard";
import CreateSellOrder from "@/components/TrustVault/SellOrder/CreateSellOrderButton";
import CreateBuyButton from "@/components/TrustVault/BuyOrder/CreateaBuyButton";
import VolumeCard from "@/components/TrustVault/Shared/VolumeCard";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import useTrustVaultProgram from "@/hooks/useTrustVaultProgram";
import { SellOrderGridRef } from "@/components/TrustVault/SellOrder/SellOrderGrid";
import BuySellTabs from "./BuySellTabs";
import  { FilterState } from "@/components/TrustVault/Shared/Filter";
import ConnectButton from "@/components/discord/ConnectButton";
import AirdropTokens from "@/components/AirdropTokens";


const ExplorerPage: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 100);
    
    return () => clearTimeout(timer);
  }, []);

  const [filters, setFilters] = useState<FilterState>({
    token: null,
    currency: null,
    sort: null,
  });

  // Reference to the TrustVaultGrid component
  const sellOrderGridRef = useRef<SellOrderGridRef>(null);
  
  // Get trustVault program
  const { program } = useTrustVaultProgram();
  
  // Query for trustVault accounts - shared with the whole page
  const { data: trustVaultAccounts, isLoading, refetch } = useQuery({
    queryKey: ["get-trustVault-accounts"],
    queryFn: async () => {
      if (!program) return [];
      return await program.account.trustVault.all();
    },
    enabled: !!program,
  });

  // Extract unique tokens and currencies for filter options
  const { tokens, currencies } = useMemo(() => {
    if (!trustVaultAccounts) {
      return { tokens: [], currencies: [] };
    }

    const uniqueTokens = new Set<string>();
    const uniqueCurrencies = new Set<string>();

    trustVaultAccounts.forEach((account) => {
      // Add token if it exists
      if (account.account.mint) {
        uniqueTokens.add(account.account.mint.toString());
      }
      
      // Add currency if it exists
      if (account.account.currency) {
        try {
          const currencyStr = String.fromCharCode(...account.account.currency).trim();
          if (currencyStr) {
            uniqueCurrencies.add(currencyStr);
          }
        } catch (error) {
          console.warn("Error parsing currency:", error);
        }
      }
    });

    return {
      tokens: Array.from(uniqueTokens).map((token) => ({
        value: token,
        label: token.substring(0, 4) + "..." + token.substring(token.length - 4),
      })),
      currencies: Array.from(uniqueCurrencies).map((currency) => ({
        value: currency,
        label: currency,
      })),
    };
  }, [trustVaultAccounts]);

  // Handle filter changes with useCallback to prevent unnecessary re-renders
  const handleFilterChange = useCallback((newFilters: FilterState) => {
    setFilters(newFilters);
  }, []);

  // Handle refresh with useCallback
  
  const handleRefresh = () => {
    sellOrderGridRef.current?.refresh();
  };

  return (
  <div className="container mx-auto py-10">
    <div className={`space-y-6 transition-all duration-1000 ${isVisible ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform translate-y-10'}`}>
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
        <Card className="sm:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle>Your Trust Vault</CardTitle>
            <CardDescription className="max-w-lg text-balance leading-relaxed">
              Manage your vaults
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-wrap gap-2 sm:gap-3">
            <CreateBuyButton />
            <CreateSellOrder />
            <ConnectButton />
            <AirdropTokens />
          </CardFooter>
        </Card>
        <TrustVaultCountCard />
        
        <VolumeCard />
        
      </div>
      
      <BuySellTabs 
        tokens={tokens}
        currencies={currencies}
        onFilterChange={handleFilterChange}
        sellOrderGridRef={sellOrderGridRef}
        filters={filters}
      />
    </div>
  </div>
);
};

export default ExplorerPage;