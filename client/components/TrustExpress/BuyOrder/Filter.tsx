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

export interface ExpressFilterState {
  token: TokenFilter;
  currency: CurrencyFilter;
  sort: SortOrder;
}

interface UnifiedFilterProps {
  onFilterChange: (filters: ExpressFilterState) => void;
  tokens: Array<{ value: string; label: string }>;
  currencies: Array<{ value: string; label: string }>;
  className?: string;
  initialFilters?: ExpressFilterState;
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
  
 
  useEffect(() => {
    onFilterChange({
      token: selectedToken,
      currency: selectedCurrency,
      sort: sortOrder,
    });
  }, [selectedToken, selectedCurrency, sortOrder, onFilterChange]);

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
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="flex flex-wrap items-center gap-2 md:gap-3">
          {/* Token Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "flex items-center gap-1.5 border text-xs font-bold uppercase tracking-wider h-8 transition-all",
                  selectedToken
                    ? "border-[#E8480A] bg-[#E8480A] text-white hover:bg-[#CC3300]"
                    : "border-[#C8C2B4] bg-[#F5F0E8] text-[#6B6558] hover:border-[#0F0D0A] hover:text-[#0F0D0A]"
                )}
                style={{ fontFamily: "'Syne', sans-serif" }}
              >
                <Filter className="h-3 w-3" />
                <span className="hidden sm:inline truncate max-w-[80px] md:max-w-none">{getTokenDisplay()}</span>
                <span className="sm:hidden">Token</span>
                <ChevronDown className="h-3 w-3 flex-shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="bg-[#F5F0E8] border-2 border-[#0F0D0A] text-[#0F0D0A] min-w-[120px] w-auto rounded-md"
            >
              <DropdownMenuItem 
                onClick={() => setSelectedToken(null)}
                className="hover:bg-[#F5F0E8] focus:bg-[#F5F0E8] text-xs font-medium"
              >
                All Tokens
              </DropdownMenuItem>
              {tokens.map((token) => (
                <DropdownMenuItem
                  key={token.value}
                  onClick={() => setSelectedToken(token.value)}
                  className="hover:bg-[#F5F0E8] focus:bg-[#F5F0E8] text-xs font-medium"
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
                  "flex items-center gap-1.5 border text-xs font-bold uppercase tracking-wider h-8 transition-all",
                  selectedCurrency
                    ? "border-[#E8480A] bg-[#E8480A] text-white hover:bg-[#CC3300]"
                    : "border-[#C8C2B4] bg-[#F5F0E8] text-[#6B6558] hover:border-[#0F0D0A] hover:text-[#0F0D0A]"
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
              className="bg-[#F5F0E8] border-2 border-[#0F0D0A] text-[#0F0D0A] min-w-[120px] w-auto rounded-md"
            >
              <DropdownMenuItem 
                onClick={() => setSelectedCurrency(null)}
                className="hover:bg-[#F5F0E8] focus:bg-[#F5F0E8] text-xs font-medium"
              >
                All Currencies
              </DropdownMenuItem>
              {currencies.map((currency) => (
                <DropdownMenuItem
                  key={currency.value}
                  onClick={() => setSelectedCurrency(currency.value)}
                  className="hover:bg-[#F5F0E8] focus:bg-[#F5F0E8] text-xs font-medium"
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
                  "flex items-center gap-1.5 border text-xs font-bold uppercase tracking-wider h-8 transition-all",
                  sortOrder
                    ? "border-[#E8480A] bg-[#E8480A] text-white hover:bg-[#CC3300]"
                    : "border-[#C8C2B4] bg-[#F5F0E8] text-[#6B6558] hover:border-[#0F0D0A] hover:text-[#0F0D0A]"
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
              className="bg-[#F5F0E8] border-2 border-[#0F0D0A] text-[#0F0D0A] min-w-[140px] w-auto rounded-md"
            >
              <DropdownMenuItem 
                onClick={() => setSortOrder(null)} 
                className="hover:bg-[#F5F0E8] focus:bg-[#F5F0E8] text-xs font-medium"
              >
                Default
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => setSortOrder("asc")} 
                className="hover:bg-[#F5F0E8] focus:bg-[#F5F0E8] text-xs font-medium"
              >
                Price (Low to High)
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => setSortOrder("desc")} 
                className="hover:bg-[#F5F0E8] focus:bg-[#F5F0E8] text-xs font-medium"
              >
                Price (High to Low)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Reset Filters Button */}
          <Button
            variant="ghost"
            onClick={resetFilters}
            className="text-xs text-[#E8480A] hover:text-[#CC3300] px-2 h-8 whitespace-nowrap font-bold uppercase tracking-wider"
            title="Reset filters"
          >
            clear
          </Button>
      </div>
    </div>
  );
};

export default UnifiedFilter;