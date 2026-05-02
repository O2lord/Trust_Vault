import * as React from "react";
import { cn } from "@/lib/utils";
import TokenDisplay from "./token-display";
import { useTokenMetadata } from "@/hooks/useTokenMetadata";

export interface TokenInfo {
  mint: string;
  balance: number;
  tokenMetadata?: {
    logoURI?: string;
    symbol?: string;
  };
}

export interface TokenSelectProps {
  tokens: TokenInfo[];
  onTokenChange: (token: TokenInfo | null) => void;
  onMaxClick: (balance: number) => void;
  onHalfClick: (balance: number) => void;
  className?: string;
  ringColorClass?: string;
  /** Optional controlled value — pass the mint address to pre-select a token */
  value?: string;
}

const TokenSelect: React.FC<TokenSelectProps> = ({
  tokens,
  onTokenChange,
  onMaxClick,
  onHalfClick,
  className,
  ringColorClass,
  value,
}) => {
  const [selectedToken, setSelectedToken] = React.useState<TokenInfo | null>(
    () => (value ? (tokens.find((t) => t.mint === value) ?? null) : null)
  );

  const tokenMetadata = useTokenMetadata(selectedToken?.mint || "");

  // Sync when `value` changes (e.g. from prefill) or when `tokens` first loads
  React.useEffect(() => {
    if (!value) return;
    const match = tokens.find((t) => t.mint === value) ?? null;
    if (match && match.mint !== selectedToken?.mint) {
      setSelectedToken(match);
      onTokenChange(match);
    }
  }, [value, tokens]);

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedMint = event.target.value;
    const token = tokens.find((t) => t.mint === selectedMint) ?? null;
    setSelectedToken(token);
    onTokenChange(token);
  };

  return (
    <div>
      {selectedToken && (
        <div className="absolute right-7 top-2 flex items-center space-x-2">
          <TokenDisplay
            logoURI={tokenMetadata?.metadata?.logoURI}
            amount={selectedToken.balance.toFixed(2)}
            symbol={tokenMetadata?.metadata?.symbol}
          />
          <button
            type="button"
            className="px-2 py-1 text-xs text-[#FFFFFF] bg-[#E8480A] hover:opacity-90 rounded transition-opacity"
            onClick={() => onMaxClick(parseFloat(Number(selectedToken.balance).toFixed(2)))}
          >
            Max
          </button>
          <button
            type="button"
            className="px-2 py-1 text-xs text-[#0F0D0A] bg-[#EDE8DF] hover:bg-[#E2DAC8] border border-[rgba(15,13,10,0.12)] rounded transition-colors"
            onClick={() => onHalfClick(parseFloat(Number(selectedToken.balance).toFixed(2)))}
          >
            Half
          </button>
        </div>
      )}

      <select
        className={cn(
          "relative rounded-lg border border-[rgba(15,13,10,0.12)] p-3 bg-[#EDE8DF] text-[#0F0D0A] focus-within:border-[#E8480A] focus:outline-none focus:ring-2 focus:ring-[#E8480A]/20 transition-colors",
          ringColorClass,
          className
        )}
        value={selectedToken?.mint ?? ""}
        onChange={handleChange}
      >
        <option value="" disabled className="bg-[#F5F0E8] text-[rgba(15,13,10,0.5)]">
          Select a token
        </option>
        {tokens.map((token, index) => (
          <option key={index} value={token.mint} className="bg-[#EDE8DF] text-[#0F0D0A]">
            {token.mint.slice(0, 4)}
          </option>
        ))}
      </select>
    </div>
  );
};

TokenSelect.displayName = "TokenSelect";

export { TokenSelect };