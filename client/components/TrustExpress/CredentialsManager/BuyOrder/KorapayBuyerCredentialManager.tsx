"use client";
// components/TrustExpress/CredentialsManager/BuyOrder/KorapayBuyerCredentialManager.tsx
//
// UI for buyers to add/manage Korapay payment credentials.
// Mirrors OPayBuyerCredentialManager layout but targets Korapay-specific
// API endpoints. Korapay only requires a Secret Key (no publicKey / merchantId).

import React, { useState, useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Plus,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import bs58 from "bs58";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface KorapayBuyerCredential {
  id: string;
  label: string | null;
  created_at: string;
  is_active: boolean;
  last_verified: string;
  processor: string;
  processor_account_id: string | null;
}

interface AddCredentialForm {
  secretKey: string;
  label: string;
}

interface CredentialBalance {
  balance: number | null;
  currency: string | null;
  loading: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const KorapayBuyerCredentialManager: React.FC = () => {
  const { publicKey, signMessage } = useWallet();
  const [credentials, setCredentials] = useState<KorapayBuyerCredential[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [balances, setBalances] = useState<Record<string, CredentialBalance>>({});

  const [form, setForm] = useState<AddCredentialForm>({
    secretKey: "",
    label: "",
  });

  // ── Fetch existing credentials ──────────────────────────────────────────────

  const fetchCredentials = useCallback(async () => {
    if (!publicKey) return;
    try {
      const res = await fetch(
        `/api/payment-processors/korapay/buyer-credentials/list?walletAddress=${publicKey.toString()}`
      );
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setCredentials(data.credentials ?? []);
    } catch {
      toast.error("Failed to load Korapay credentials");
    } finally {
      setIsLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  // ── Fetch balance for a single credential ───────────────────────────────────

  const fetchBalance = useCallback(
    async (credId: string) => {
      if (!publicKey) return;
      setBalances((prev) => ({
        ...prev,
        [credId]: { balance: null, currency: null, loading: true },
      }));
      try {
        const res = await fetch(
          `/api/payment-processors/korapay/buyer-credentials/status?credentialId=${credId}&walletAddress=${publicKey.toString()}`
        );
        if (!res.ok) throw new Error("Failed to fetch balance");
        const data = await res.json();
        setBalances((prev) => ({
          ...prev,
          [credId]: {
            balance: data.balance ?? null,
            currency: data.currency ?? null,
            loading: false,
          },
        }));
      } catch {
        setBalances((prev) => ({
          ...prev,
          [credId]: { balance: null, currency: null, loading: false },
        }));
        toast.error("Failed to fetch balance");
      }
    },
    [publicKey]
  );

  // ── Sign auth message ───────────────────────────────────────────────────────

  async function signAuthMessage(action: string): Promise<{
    signature: string;
    message: string;
  } | null> {
    if (!signMessage || !publicKey) {
      toast.error("Wallet not connected");
      return null;
    }
    const timestamp = Date.now();
    const nonce = Math.random().toString(36).substring(2, 15);
    const message =
      `Sign this message to authenticate with TrustExpress.\n\n` +
      `Action: ${action}\n` +
      `Timestamp: ${timestamp}\n` +
      `Nonce: ${nonce}\n\n` +
      `This signature will not cost any gas fees.`;
    const encoded = new TextEncoder().encode(message);
    try {
      const sig = await signMessage(encoded);
      return { signature: bs58.encode(sig), message };
    } catch {
      toast.error("Signature rejected");
      return null;
    }
  }

  // ── Add credentials ─────────────────────────────────────────────────────────

  async function handleAddCredential() {
    if (!form.secretKey) {
      toast.error("Secret key is required");
      return;
    }

    const auth = await signAuthMessage("store_buyer_credentials");
    if (!auth) return;

    setIsAdding(true);
    try {
      const res = await fetch(
        "/api/payment-processors/korapay/buyer-credentials/store",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletAddress: publicKey!.toString(),
            secretKey: form.secretKey,
            label: form.label || undefined,
            signature: auth.signature,
            message: auth.message,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Failed to store credentials");
        return;
      }

      toast.success("Korapay credentials added successfully");
      setForm({ secretKey: "", label: "" });
      setShowForm(false);
      await fetchCredentials();
    } catch {
      toast.error("Failed to add credentials");
    } finally {
      setIsAdding(false);
    }
  }

  // ── Toggle active state ─────────────────────────────────────────────────────

  async function handleToggleActive(credId: string, currentState: boolean) {
    const auth = await signAuthMessage("toggle_buyer_credential");
    if (!auth) return;

    try {
      const res = await fetch(
        `/api/payment-processors/korapay/buyer-credentials/toggle`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            credentialId: credId,
            walletAddress: publicKey!.toString(),
            signature: auth.signature,
            message: auth.message,
          }),
        }
      );
      if (!res.ok) throw new Error("Failed to update");
      toast.success(
        `Credential ${!currentState ? "activated" : "deactivated"}`
      );
      await fetchCredentials();
    } catch {
      toast.error("Failed to update credential status");
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  if (!publicKey) {
    return (
      <Card className="border-2 border-[#0F0D0A]/8">
        <CardHeader>
          <CardTitle
            className="text-[#0F0D0A]"
            style={{ fontFamily: "'Syne', sans-serif" }}
          >
            Korapay Buyer Credentials
          </CardTitle>
          <CardDescription>
            Connect your wallet to manage Korapay credentials
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3
            className="text-base font-bold text-[#0F0D0A]"
            style={{ fontFamily: "'Syne', sans-serif" }}
          >
            Korapay Buyer Credentials
          </h3>
          <p className="text-xs text-[#0F0D0A]/50 mt-0.5">
            Used to make fiat payments to sellers via Korapay
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowForm(!showForm)}
          className="bg-[#0F0D0A] text-white hover:bg-[#0F0D0A]/85"
          style={{ fontFamily: "'Syne', sans-serif" }}
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Add Korapay Account
        </Button>
      </div>

      {/* Add form */}
      {showForm && (
        <Card className="border-2 border-[#E8480A]/20 bg-[#E8480A]/3">
          <CardHeader className="pb-3">
            <CardTitle
              className="text-sm font-bold text-[#0F0D0A]"
              style={{ fontFamily: "'Syne', sans-serif" }}
            >
              Add Korapay Credentials
            </CardTitle>
            <CardDescription className="text-xs">
              Find your Secret Key in Korapay Dashboard → Settings → API Keys
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Label */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[#0F0D0A]">
                Label (optional)
              </Label>
              <Input
                placeholder="e.g. My Korapay Account"
                value={form.label}
                onChange={(e) =>
                  setForm((p) => ({ ...p, label: e.target.value }))
                }
                className="text-sm border-[#0F0D0A]/15"
              />
            </div>

            {/* Secret Key */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[#0F0D0A]">
                Secret Key <span className="text-[#E8480A]">*</span>
              </Label>
              <div className="relative">
                <Input
                  type={showSecretKey ? "text" : "password"}
                  placeholder="sk_..."
                  value={form.secretKey}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, secretKey: e.target.value }))
                  }
                  className="text-sm border-[#0F0D0A]/15 font-mono pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowSecretKey(!showSecretKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#0F0D0A]/40 hover:text-[#0F0D0A]"
                >
                  {showSecretKey ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-[#0F0D0A]/40">
                Used to authenticate API calls — never shared
              </p>
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                onClick={handleAddCredential}
                disabled={isAdding}
                className="bg-[#E8480A] text-white hover:bg-[#E8480A]/85 flex-1"
              >
                {isAdding ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Verifying & Saving...
                  </>
                ) : (
                  "Save Korapay Credentials"
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setForm({ secretKey: "", label: "" });
                }}
                className="border-[#0F0D0A]/15"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Credentials list */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-[#0F0D0A]/40 py-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading credentials...
        </div>
      ) : credentials.length === 0 ? (
        <Card className="border-2 border-dashed border-[#0F0D0A]/10">
          <CardContent className="py-8 text-center">
            <p className="text-sm text-[#0F0D0A]/40">
              No Korapay credentials added yet
            </p>
            <p className="text-xs text-[#0F0D0A]/30 mt-1">
              Add your Korapay account to start making payments
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {credentials.map((cred) => {
            const bal = balances[cred.id];
            return (
              <Card
                key={cred.id}
                className={cn(
                  "border-2 transition-all",
                  cred.is_active
                    ? "border-[#0A7B6B]/20 bg-[#0A7B6B]/3"
                    : "border-[#0F0D0A]/8 opacity-60"
                )}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {cred.is_active ? (
                        <CheckCircle className="w-4 h-4 text-[#0A7B6B] flex-shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-[#0F0D0A]/30 flex-shrink-0" />
                      )}
                      <div>
                        <p className="text-sm font-semibold text-[#0F0D0A]">
                          {cred.label ?? "Unnamed Korapay Account"}
                        </p>
                        <p className="text-xs text-[#0F0D0A]/40 font-mono">
                          Account:{" "}
                          {cred.processor_account_id
                            ? `${cred.processor_account_id.slice(0, 6)}...${cred.processor_account_id.slice(-4)}`
                            : "—"}
                        </p>
                        {/* Balance row */}
                        {bal && !bal.loading && bal.balance !== null && (
                          <p className="text-xs text-[#0A7B6B] font-semibold mt-0.5">
                            {bal.currency ?? "NGN"}{" "}
                            {bal.balance.toLocaleString("en-NG", {
                              minimumFractionDigits: 2,
                            })}
                          </p>
                        )}
                        {bal?.loading && (
                          <p className="text-xs text-[#0F0D0A]/30 mt-0.5 flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" />{" "}
                            Fetching balance...
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs",
                          cred.is_active
                            ? "border-[#0A7B6B]/30 text-[#0A7B6B]"
                            : "border-[#0F0D0A]/20 text-[#0F0D0A]/40"
                        )}
                      >
                        {cred.is_active ? "Active" : "Inactive"}
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => fetchBalance(cred.id)}
                        disabled={bal?.loading}
                        className="text-xs h-7 px-2 text-[#0F0D0A]/50 hover:text-[#0F0D0A]"
                        title="Check balance"
                      >
                        <RefreshCw
                          className={cn(
                            "w-3.5 h-3.5",
                            bal?.loading && "animate-spin"
                          )}
                        />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          handleToggleActive(cred.id, cred.is_active)
                        }
                        className="text-xs h-7 px-2 text-[#0F0D0A]/50 hover:text-[#0F0D0A]"
                      >
                        {cred.is_active ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default KorapayBuyerCredentialManager;