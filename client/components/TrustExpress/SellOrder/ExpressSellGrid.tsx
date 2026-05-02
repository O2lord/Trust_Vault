"use client";
import useTrustExpress from "@/hooks/express/useTrustExpress";
import React, { forwardRef, useMemo, useImperativeHandle, useEffect, useRef } from "react";
import SellOrderCard from "./SellOrderCard";
import SkeletonWapper from "@/components/SkeletonWapper";
import { useWallet } from "@solana/wallet-adapter-react";
import { SortOrder, TokenFilter, CurrencyFilter } from "../BuyOrder/Filter";
import { useExpressBalances } from "@/hooks/express/useTrustExpressBalance";
import { useQueryClient } from "@tanstack/react-query";
import type { AiIntent } from "@/app/(dashboard)/express/page";

export interface TrustExpressSellGridRef {
  refresh: () => void;
}

interface TrustExpressSellGridProps {
  filterByCurrentUser?: boolean;
  tokenFilter?: TokenFilter;
  currencyFilter?: CurrencyFilter;
  sortOrder?: SortOrder;
  title?: string;
  aiIntent?: AiIntent;
}

const TrustExpressSellGrid = forwardRef<TrustExpressSellGridRef, TrustExpressSellGridProps>(
  ({
    filterByCurrentUser = false,
    tokenFilter = null,
    currencyFilter = null,
    sortOrder = null,
    title,
    aiIntent,
  }, ref) => {
    const { getTrustExpressAccounts } = useTrustExpress();
    const { publicKey } = useWallet();
    const queryClient = useQueryClient();

    // Single refresh interval for the whole grid — replaces per-card intervals
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    useEffect(() => {
      intervalRef.current = setInterval(() => {
        if (document.hasFocus()) {
          queryClient.invalidateQueries({
            queryKey: ["get-trust-express-accounts"],
            refetchType: "active",
          });
        }
      }, 60000);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }, [queryClient]);

    useImperativeHandle(ref, () => ({
      refresh: () => {
        getTrustExpressAccounts.refetch();
      }
    }), [getTrustExpressAccounts]);

    // Filter to only EXPRESS_SELL (escrowType === 0) accounts
    const sellAccounts = useMemo(() => {
      return (getTrustExpressAccounts.data ?? []).filter(
        (a) => a.account.escrowType === 0
      );
    }, [getTrustExpressAccounts.data]);

    // ── ONE batched balance fetch for all sell orders ──────────────────
    const balanceMap = useExpressBalances(sellAccounts);

    const filteredAccounts = useMemo(() => {
      if (filterByCurrentUser && !publicKey) return [];

      let filtered = filterByCurrentUser && publicKey
        ? sellAccounts.filter(
            (a) => a.account.maker.toString() === publicKey.toString()
          )
        : sellAccounts;

      if (tokenFilter) {
        filtered = filtered.filter(
          (a) => a.account.mint?.toString() === tokenFilter
        );
      }

      if (currencyFilter) {
        filtered = filtered.filter((a) => {
          const str = String.fromCharCode(...a.account.currency).trim();
          return str === currencyFilter;
        });
      }

      if (sortOrder) {
        filtered = [...filtered].sort((a, b) => {
          const pA = Number(a.account.pricePerToken);
          const pB = Number(b.account.pricePerToken);
          return sortOrder === "asc" ? pA - pB : pB - pA;
        });
      }

      return filtered;
    }, [sellAccounts, filterByCurrentUser, publicKey, tokenFilter, currencyFilter, sortOrder]);

    if (getTrustExpressAccounts.isError) {
      return (
        <div className="text-center my-10">
          <h2 className="text-2xl font-semibold text-red-500">Error loading sell orders</h2>
          <p className="mt-2 text-gray-600">There was an error loading the sell order data.</p>
        </div>
      );
    }

    const displayTitle = title || (filterByCurrentUser ? "Your Sell Orders" : "Sell Orders");

    if (filteredAccounts.length === 0) {
      return (
        <div className="flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold">{displayTitle}</h2>
          </div>
          <div className="text-center my-10">
            <h2 className="text-2xl font-semibold">No sell orders found</h2>
            <p className="mt-2 text-gray-600">
              {filterByCurrentUser
                ? "You haven't created any sell orders matching these filters."
                : "No sell orders match the selected filters."}
            </p>
          </div>
        </div>
      );
    }

    return (
      <SkeletonWapper isLoading={getTrustExpressAccounts.isLoading}>
        <div className="flex flex-col">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAccounts.map((account) => (
              <SellOrderCard
                key={account.publicKey.toString()}
                data={account}
                // Pass pre-fetched balance — card makes zero RPC calls
                balanceData={balanceMap[account.publicKey.toString()] ?? null}
                isLPView={filterByCurrentUser}
                aiIntent={aiIntent}
              />
            ))}
          </div>
        </div>
      </SkeletonWapper>
    );
  }
);

TrustExpressSellGrid.displayName = "TrustExpressSellGrid";

export default TrustExpressSellGrid;