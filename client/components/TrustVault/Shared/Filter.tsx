"use client";
import React, { useState, useEffect } from "react";
import { ChevronDown, Filter } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SortOrder = "asc" | "desc" | null;
export type TokenFilter = string | null;
export type CurrencyFilter = string | null;

export interface FilterState {
  token: TokenFilter;
  currency: CurrencyFilter;
  sort: SortOrder;
}

interface UnifiedFilterProps {
  onFilterChange: (filters: FilterState) => void;
  tokens: Array<{ value: string; label: string }>;
  currencies: Array<{ value: string; label: string }>;
  className?: string;
  initialFilters?: FilterState;
}

const UnifiedFilter: React.FC<UnifiedFilterProps> = ({
  onFilterChange,
  tokens,
  currencies,
  className,
  initialFilters = { token: null, currency: null, sort: null }
}) => {
  const [selectedToken, setSelectedToken] = useState<TokenFilter>(initialFilters.token);
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyFilter>(initialFilters.currency);
  const [sortOrder, setSortOrder] = useState<SortOrder>(initialFilters.sort);
  
  // Apply filters when any selection changes
  useEffect(() => {
    onFilterChange({
      token: selectedToken,
      currency: selectedCurrency,
      sort: sortOrder,
    });
  }, [selectedToken, selectedCurrency, sortOrder, onFilterChange]);

  // Update local state when initialFilters change (for external control)
  useEffect(() => {
    setSelectedToken(initialFilters.token);
    setSelectedCurrency(initialFilters.currency);
    setSortOrder(initialFilters.sort);
  }, [initialFilters]);

  const resetFilters = () => {
    setSelectedToken(null);
    setSelectedCurrency(null);
    setSortOrder(null);
  };

  // Get a display name for the current filter value
  const getTokenDisplay = () => {
    if (!selectedToken) return "All Tokens";
    const token = tokens.find((t) => t.value === selectedToken);
    return token ? token.label : "All Tokens";
  };

  const getCurrencyDisplay = () => {
    if (!selectedCurrency) return "All Currencies";
    const currency = currencies.find((c) => c.value === selectedCurrency);
    return currency ? currency.label : "All Currencies";
  };

  const getSortDisplay = () => {
    if (!sortOrder) return "Price";
    return sortOrder === "asc" ? "Price (Low to High)" : "Price (High to Low)";
  };

  return (
    <div className={cn("relative group", className)}>
      <div className="absolute inset-0 bg-gradient-to-r from-gray-800/50 to-gray-700/50 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="relative">
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          {/* Token Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "flex items-center gap-1 md:gap-2 bg-gray-800/50 border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white transition-all duration-300 text-xs md:text-sm px-2 md:px-3 py-1 md:py-2 h-8 md:h-10",
                  selectedToken && "border-blue-500/50 bg-blue-900/20 text-blue-300"
                )}
              >
                <Filter className="h-3 w-3" />
                <span className="hidden sm:inline truncate max-w-[80px] md:max-w-none">{getTokenDisplay()}</span>
                <span className="sm:hidden">Token</span>
                <ChevronDown className="h-3 w-3 md:h-4 md:w-4 flex-shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="bg-gray-800 border-gray-700 text-gray-200 min-w-[120px] w-auto"
            >
              <DropdownMenuItem 
                onClick={() => setSelectedToken(null)}
                className="hover:bg-gray-700 focus:bg-gray-700 text-xs md:text-sm"
              >
                All Tokens
              </DropdownMenuItem>
              {tokens.map((token) => (
                <DropdownMenuItem
                  key={token.value}
                  onClick={() => setSelectedToken(token.value)}
                  className="hover:bg-gray-700 focus:bg-gray-700 text-xs md:text-sm"
                >
                  {token.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Currency Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "flex items-center gap-1 md:gap-2 bg-gray-800/50 border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white transition-all duration-300 text-xs md:text-sm px-2 md:px-3 py-1 md:py-2 h-8 md:h-10",
                  selectedCurrency && "border-purple-500/50 bg-purple-900/20 text-purple-300"
                )}
              >
                <Filter className="h-3 w-3" />
                <span className="hidden sm:inline truncate max-w-[80px] md:max-w-none">{getCurrencyDisplay()}</span>
                <span className="sm:hidden">Currency</span>
                <ChevronDown className="h-3 w-3 md:h-4 md:w-4 flex-shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="bg-gray-800 border-gray-700 text-gray-200 min-w-[120px] w-auto"
            >
              <DropdownMenuItem 
                onClick={() => setSelectedCurrency(null)}
                className="hover:bg-gray-700 focus:bg-gray-700 text-xs md:text-sm"
              >
                All Currencies
              </DropdownMenuItem>
              {currencies.map((currency) => (
                <DropdownMenuItem
                  key={currency.value}
                  onClick={() => setSelectedCurrency(currency.value)}
                  className="hover:bg-gray-700 focus:bg-gray-700 text-xs md:text-sm"
                >
                  {currency.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Sort Order Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline" 
                className={cn(
                  "flex items-center gap-1 md:gap-2 bg-gray-800/50 border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white transition-all duration-300 text-xs md:text-sm px-2 md:px-3 py-1 md:py-2 h-8 md:h-10",
                  sortOrder && "border-green-500/50 bg-green-900/20 text-green-300"
                )}
              >
                <Filter className="h-3 w-3" />
                <span className="hidden sm:inline truncate max-w-[80px] md:max-w-none">{getSortDisplay()}</span>
                <span className="sm:hidden">Sort</span>
                <ChevronDown className="h-3 w-3 md:h-4 md:w-4 flex-shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent 
              align="start" 
              className="bg-gray-800 border-gray-700 text-gray-200 min-w-[140px] w-auto"
            >
              <DropdownMenuItem 
                onClick={() => setSortOrder(null)} 
                className="hover:bg-gray-700 focus:bg-gray-700 text-xs md:text-sm"
              >
                Default
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => setSortOrder("asc")} 
                className="hover:bg-gray-700 focus:bg-gray-700 text-xs md:text-sm"
              >
                Price (Low to High)
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => setSortOrder("desc")} 
                className="hover:bg-gray-700 focus:bg-gray-700 text-xs md:text-sm"
              >
                Price (High to Low)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Reset Filters Button */}
          <Button
            variant="ghost"
            onClick={resetFilters}
            className="text-xs text-gray-400 hover:text-white px-2 py-1 h-8 md:h-10 whitespace-nowrap"
            title="Reset filters"
          >
            clear
          </Button>
        </div>
      </div>
    </div>
  );
};

export default UnifiedFilter;