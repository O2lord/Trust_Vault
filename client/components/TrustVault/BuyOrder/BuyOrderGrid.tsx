"use client";
import useTrustVaultProgram from "@/hooks/useTrustVaultProgram";
import React, { forwardRef, useMemo, useImperativeHandle } from "react";
import BuyOrderCard from "./BuyOrderCard";
import SkeletonWapper from "../../SkeletonWapper";
import { useWallet } from "@solana/wallet-adapter-react";
import { SortOrder, TokenFilter, CurrencyFilter } from "@/components/TrustVault/Shared/Filter";
import { useTrustVaultAccounts } from "@/hooks/queries/useTrustVaultAccounts";

// Define the ref handle type with refresh method
export interface BuyGridRef {
  refresh: () => void;
}

interface BuyGridProps {
  filterByCurrentUser?: boolean;
  tokenFilter?: TokenFilter;
  currencyFilter?: CurrencyFilter;
  sortOrder?: SortOrder;
  title?: string;
}

const BuyGrid = forwardRef<BuyGridRef, BuyGridProps>(
  ({ 
    filterByCurrentUser = false, 
    tokenFilter = null,
    currencyFilter = null,
    sortOrder = null,
    title
  }, ref) => {
    const { program } = useTrustVaultProgram();
    const getTrustVaultAccounts = useTrustVaultAccounts(program);
    const { publicKey } = useWallet();

    // Expose refresh method to parent component
    useImperativeHandle(ref, () => ({
      refresh: () => {
        // Refetch the data
        getTrustVaultAccounts.refetch();
      }
    }), [getTrustVaultAccounts]);
    
    // Get the trustVaults data and apply filters - memoize this to prevent unnecessary recalculations
    const filteredTrustVaults = useMemo(() => {
      const trustVaultsData = getTrustVaultAccounts.data || [];
      
      // If filtering by current user but no wallet is connected, return empty array
      if (filterByCurrentUser && (!publicKey)) {
        return [];
      }

      // First, filter trustVaults by user if needed
      let filtered = filterByCurrentUser && publicKey
        ? trustVaultsData.filter(trustVault => 
            trustVault.account.maker.toString() === publicKey.toString())
        : trustVaultsData;
        
      // Apply token filter if selected
      if (tokenFilter) {
        filtered = filtered.filter(trustVault => 
          trustVault.account.mint && trustVault.account.mint.toString() === tokenFilter
        );
      }
      
      // Apply currency filter if selected
      if (currencyFilter) {
        filtered = filtered.filter(trustVault => {
          // Handle currency filter appropriately based on your data structure
          const currencyStr = String.fromCharCode(...trustVault.account.currency).trim();
          return currencyStr === currencyFilter;
        });
      }
      
      // Apply sort if selected
      if (sortOrder) {
        filtered = [...filtered].sort((a, b) => {
          const priceA = Number(a.account.pricePerToken);
          const priceB = Number(b.account.pricePerToken);
          
          return sortOrder === 'asc' ? priceA - priceB : priceB - priceA;
        });
      }
      
      return filtered;
    }, [
      getTrustVaultAccounts.data, 
      filterByCurrentUser, 
      publicKey, 
      tokenFilter, 
      currencyFilter, 
      sortOrder
    ]);

    if (getTrustVaultAccounts.isError) {
      return (
        <div className="text-center my-10">
          <h2 className="text-2xl font-semibold text-red-500">Error loading trustVaults</h2>
          <p className="mt-2 text-gray-600">There was an error loading the trustVault data.</p>
        </div>
      );
    }

    const displayTitle = title || (filterByCurrentUser ? "Your Buy Orders" : "Sell Orders");

    if (filteredTrustVaults.length === 0) {
      return (
        <div className="flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold">{displayTitle}</h2>
          </div>
          <div className="text-center my-10">
            <h2 className="text-2xl font-semibold">No buy orders found</h2>
            <p className="mt-2 text-gray-600">
              {filterByCurrentUser 
                ? "You haven't created any buy orders matching these filters." 
                : "No buy orders match the selected filters."}
            </p>
          </div>
        </div>
      );
    }
    
    return (
      <SkeletonWapper isLoading={getTrustVaultAccounts.isLoading}>
        <div className="flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold">{displayTitle}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTrustVaults.map((trustVault) => (
              <BuyOrderCard key={trustVault.publicKey.toString()} data={trustVault} />
            ))}
          </div>
        </div>
      </SkeletonWapper>
    );
  }
);

BuyGrid.displayName = "BuyGrid";

export default BuyGrid;