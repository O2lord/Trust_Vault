"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart, TrendingDown, Calendar, QrCode, X, MinusCircle, Tag } from "lucide-react";
import { ChatAction } from "@/app/api/chat/route";
import dynamic from "next/dynamic";
import { mintForSymbol } from "@/lib/mintConstants";

const CreateExpressBuyDialog = dynamic(
  () => import("@/components/TrustExpress/BuyOrder/CreateExpressBuyDialog"),
  { ssr: false }
);
const CreateExpressSellDialog = dynamic(
  () => import("@/components/TrustExpress/SellOrder/CreateExpressSellDialog"),
  { ssr: false }
);
// ── NEW: inline reduce dialog — no navigation needed ─────────────────────────
const ReduceOrderDialog = dynamic(
  () => import("@/components/TrustExpress/Chat/ReduceOrderDialog"),
  { ssr: false }
);

const BRAND = {
  orange: "#E8480A",
  black: "#0F0D0A",
  cream: "#F5F0E8",
  border: "#E8E2D8",
  gray: "#6B6558",
  lightGray: "#C8C2B4",
} as const;

export interface OrderPrefill {
  mint?: string;
  token?: string;
  deposit?: number;
  pricePerToken?: number;
  currency?: string;
  paymentType?: string;
}

interface ActionCardProps {
  action: ChatAction;
  onDismiss: () => void;
}

const ACTION_META = {
  buy:         { icon: ShoppingCart, label: "Buy Order",      color: "#22c55e"    },
  sell:        { icon: TrendingDown, label: "Sell Order",     color: BRAND.orange },
  reserve:     { icon: Calendar,     label: "Reservation",    color: "#6366f1"    },
  qr:          { icon: QrCode,       label: "Merchant QR",    color: "#0A7B6B"    },
  reduce:      { icon: MinusCircle,  label: "Reduce Order",   color: "#f59e0b"    },
  updatePrice: { icon: Tag,          label: "Update Price",   color: "#6366f1"    },
} as const;

export default function ActionCard({ action, onDismiss }: ActionCardProps): JSX.Element {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const meta = ACTION_META[action.type];
  const Icon = meta.icon;

  useEffect(() => {
    if (!meta) return;

    // ── Inline dialogs (no navigation) ───────────────────────────────────────
    if (action.type === "buy" || action.type === "sell" || action.type === "reduce") {
      const t = setTimeout(() => setDialogOpen(true), 300);
      return () => clearTimeout(t);
    }

    // ── Navigate-based actions ────────────────────────────────────────────────
    if (action.type === "qr") {
      const params = new URLSearchParams();
      if (action.fiatAmount) params.set("amount", String(action.fiatAmount));
      if (action.currency)   params.set("currency", action.currency);
      setTimeout(() => router.push(`/express/merchant?${params.toString()}`), 300);
    }

    if (action.type === "reserve") {
      const params = new URLSearchParams({ intent: "reserve" });
      if (action.token)    params.set("token", action.token);
      if (action.amount)   params.set("amount", String(action.amount));
      if (action.currency) params.set("currency", action.currency ?? "");
      setTimeout(() => router.push(`/express?${params.toString()}`), 300);
    }

    if (action.type === "updatePrice") {
      const params = new URLSearchParams({ intent: "updatePrice" });
      if (action.orderAddress) params.set("orderAddress", action.orderAddress);
      if (action.orderType)    params.set("orderType", action.orderType);
      if (action.newPrice)     params.set("newPrice", String(action.newPrice));
      if (action.token)        params.set("token", action.token);
      if (action.currency)     params.set("currency", action.currency);
      const tab = action.orderType === "sell" ? "sell-orders" : "buy-orders";
      setTimeout(() => router.push(`/express/providers?tab=${tab}&${params.toString()}`), 300);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolvedMint =
    (action.token ? mintForSymbol(action.token) : undefined) ?? action.mint;

  const prefill: OrderPrefill = {
    mint:          resolvedMint,
    token:         action.token,
    deposit:       action.amount,
    pricePerToken: action.pricePerToken,
    currency:      action.currency,
    paymentType:   action.paymentType,
  };

  // Summary chips — tailored per action type
  const summaryParts: string[] = [];
  if (action.token) summaryParts.push(action.token);

  if (action.type === "reduce") {
    if (action.reduceBy)     summaryParts.push(`−${action.reduceBy} tokens`);
    if (action.orderAddress) summaryParts.push(`Order: ${action.orderAddress}`);
    if (action.orderType)    summaryParts.push(action.orderType === "buy" ? "Buy Order" : "Sell Order");
  } else if (action.type === "updatePrice") {
    if (action.newPrice)     summaryParts.push(`New price: ${action.newPrice}`);
    if (action.currency)     summaryParts.push(action.currency);
    if (action.orderAddress) summaryParts.push(`Order: ${action.orderAddress}`);
    if (action.orderType)    summaryParts.push(action.orderType === "buy" ? "Buy Order" : "Sell Order");
  } else {
    if (action.amount)        summaryParts.push(`${action.amount} tokens`);
    if (action.fiatAmount)    summaryParts.push(`${action.currency ?? ""} ${action.fiatAmount.toLocaleString()}`);
    if (action.currency && !action.fiatAmount) summaryParts.push(`in ${action.currency}`);
    if (action.pricePerToken) summaryParts.push(`@ ${action.pricePerToken}/token`);
    if (action.paymentType)   summaryParts.push(`via ${action.paymentType}`);
  }

  const destinationNote = (): string => {
    switch (action.type) {
      case "qr":          return "Taking you to the merchant page with this pre-filled…";
      case "reserve":     return "Taking you to Express to find a matching order…";
      case "reduce":      return "Opening the reduce dialog — review and approve in your wallet.";
      case "updatePrice": return "Taking you to your LP dashboard to confirm the price update…";
      default:            return "Opening the form pre-filled. Review everything before signing.";
    }
  };

  if (dismissed) return <></>;

  return (
    <>
      <div style={{
        background: BRAND.cream,
        border: `2px solid ${meta.color}`,
        borderRadius: 12, padding: "12px 14px", marginTop: 8,
        position: "relative", fontFamily: "'Syne', sans-serif",
      }}>
        {/* Dismiss */}
        <button
          onClick={() => { setDismissed(true); onDismiss(); }}
          aria-label="Dismiss"
          style={{
            position: "absolute", top: 8, right: 8,
            background: "none", border: "none", cursor: "pointer",
            color: BRAND.lightGray, padding: 2,
          }}
        >
          <X size={14} />
        </button>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <div style={{
            background: meta.color + "20", borderRadius: 8, padding: 6,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icon size={16} color={meta.color} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: BRAND.gray }}>
              {action.type === "reduce" || action.type === "updatePrice" ? "Updating order" : "Ready to create"}
            </div>
            <div style={{ fontSize: 13, fontWeight: 900, color: BRAND.black }}>
              {meta.label}
            </div>
          </div>
        </div>

        {/* Summary chips */}
        {summaryParts.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {summaryParts.map((part) => (
              <span key={part} style={{
                background: "#fff", border: `1.5px solid ${BRAND.border}`,
                borderRadius: 20, padding: "3px 10px",
                fontSize: 12, color: BRAND.black, fontWeight: 700,
              }}>
                {part}
              </span>
            ))}
          </div>
        )}

        <div style={{ fontSize: 11, color: BRAND.gray }}>
          {destinationNote()}
        </div>
      </div>

      {/* ── Inline dialogs — rendered here, no navigation ──────────────────── */}
      {action.type === "buy" && (
        <CreateExpressBuyDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          prefill={prefill}
        />
      )}
      {action.type === "sell" && (
        <CreateExpressSellDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          prefill={prefill}
        />
      )}
      {action.type === "reduce" && (
        <ReduceOrderDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          orderAddress={action.orderAddress}
          orderType={action.orderType ?? "buy"}
          token={action.token ?? "USDC"}
          reduceBy={action.reduceBy}
        />
      )}
    </>
  );
}