"use client";
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Store, QrCode, Plus, Trash2, ChevronDown,
  ArrowRight, CheckCircle2, Building2, Hash, User, Globe,
  Banknote, X, Sparkles, AlertCircle, Pencil, Star, Loader2,
  ArrowLeft, CheckCircle, InfoIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/seperator";
import { cn } from "@/lib/utils";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { createQR } from "@solana/pay";
import useTrustExpress from "@/hooks/express/useTrustExpress";
import { useTransactionMonitoring } from "@/hooks/express/useTransactionMonitoring";
import {
  useMerchantBankAccounts,
  MerchantBankAccount,
  AddAccountInput,
  UpdateAccountInput,
} from "@/hooks/express/useMerchantBankAccounts";
import { supabase } from "@/lib/client";
import { useSolsticeYield, useExecuteYieldVault, YieldVaultStatus } from "@/hooks/useSolsticeYield";
import { useSearchParams, useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AccountData {
  publicKey: PublicKey;
  account: {
    seed: BN;
    maker: PublicKey;
    mint: PublicKey;
    currency: number[];
    escrowType: number;
    feePercentage: number;
    feeDestination: PublicKey;
    reservedFee: BN;
    amount: BN;
    pricePerToken: BN;
    paymentInstructions: string;
    reservedAmounts: {
      taker: PublicKey;
      amount: BN;
      fiatAmount: BN;
      timestamp: BN;
      status: number;
      payoutDetails: string | null;
      payoutReference: string | null;
    }[];
    bump: number;
  };
}

interface PayoutDetails {
  beneficiary_name?: string;
  account_number?:   string;
  bank_name?:        string;
  bank_code?:        string;
}

interface ReceiptData {
  id:                string;
  created_at?:       string | null;
  status?:           string | null;
  fiat_amount?:      number | null;
  token_amount?:     number | null;
  currency?:         string | null;
  account_name?:     string | null;
  account_number?:   string | null;
  bank_name?:        string | null;
  reference?:        string | null;
  payout_reference?: string | null;
  payout_details?:   PayoutDetails | null;
  trust_express_address?: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPPORTED_CURRENCIES = [
  { code: "NGN", symbol: "₦" },
  { code: "KES", symbol: "KSh" },
  { code: "GHS", symbol: "₵" },
  { code: "ZAR", symbol: "R" },
  { code: "UGX", symbol: "USh" },
];

// Key used to persist active QR state across refreshes
const QR_STORAGE_KEY = "merchant-qr-state";

// ─── Step badge ───────────────────────────────────────────────────────────────

function StepBadge({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <div
      className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center text-sm font-black transition-all duration-300",
        done ? "bg-[#0A7B6B] text-white" : active ? "bg-[#E8480A] text-white" : "bg-[#0F0D0A]/10 text-[#0F0D0A]/30"
      )}
      style={{ fontFamily: "'Syne', sans-serif" }}
    >
      {done ? <CheckCircle2 className="w-4 h-4" /> : n}
    </div>
  );
}

// ─── Account card ─────────────────────────────────────────────────────────────

function AccountCard({
  account, selected, onSelect, onDelete, onEdit, isDeleting,
}: {
  account: MerchantBankAccount;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onEdit: () => void;
  isDeleting: boolean;
}) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        "relative rounded-xl border-2 px-5 py-4 cursor-pointer transition-all duration-200 group",
        selected ? "border-[#E8480A] bg-[#E8480A]/5" : "border-[#0F0D0A]/10 bg-white hover:border-[#0F0D0A]/30"
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-lg transition-colors", selected ? "bg-[#E8480A]" : "bg-[#0F0D0A]/8")}>
            <Building2 className={cn("w-4 h-4", selected ? "text-white" : "text-[#0F0D0A]/50")} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-bold text-sm text-[#0F0D0A]" style={{ fontFamily: "'Syne', sans-serif" }}>
                {account.label}
              </p>
              {account.is_default && (
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#0A7B6B] bg-[#0A7B6B]/10 px-1.5 py-0.5 rounded-md">
                  <Star className="w-2.5 h-2.5" /> Default
                </span>
              )}
            </div>
            <p className="text-xs text-[#0F0D0A]/40 mt-0.5">
              {account.account_number} · {account.currency}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="p-1.5 rounded-md hover:bg-[#0F0D0A]/8 text-[#0F0D0A]/40 hover:text-[#0F0D0A] transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} disabled={isDeleting}
            className="p-1.5 rounded-md hover:bg-red-50 text-[#0F0D0A]/40 hover:text-red-500 transition-colors disabled:opacity-40">
            {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Account form (add + edit) ────────────────────────────────────────────────

type AccountFormMode = { type: "add" } | { type: "edit"; account: MerchantBankAccount };

function AccountForm({
  mode, onSave, onCancel, isSaving, errorMessage,
}: {
  mode: AccountFormMode;
  onSave: (data: AddAccountInput) => void;
  onCancel: () => void;
  isSaving: boolean;
  errorMessage?: string;
}) {
  const isEdit = mode.type === "edit";
  const [form, setForm] = useState<AddAccountInput>({
    bankName: isEdit ? mode.account.bank_name : "",
    bankCode: isEdit ? (mode.account as MerchantBankAccount & { bank_code?: string }).bank_code ?? "" : "",
    accountNumber: isEdit ? mode.account.account_number : "",
    accountName: isEdit ? mode.account.account_name : "",
    currency: isEdit ? mode.account.currency : "NGN",
    label: isEdit ? mode.account.label : "",
    setAsDefault: isEdit ? mode.account.is_default : false,
  });

  const [bankList, setBankList] = useState<{ id: number; code: string; name: string }[]>([]);
  const [bankListLoading, setBankListLoading] = useState(false);
  const [showBankDropdown, setShowBankDropdown] = useState(false);
  const [bankSearch, setBankSearch] = useState("");

  useEffect(() => {
    if (!form.currency) return;
    const countryMap: Record<string, string> = { NGN: "NG", GHS: "GH", KES: "KE", ZAR: "ZA", UGX: "UG" };
    const country = countryMap[form.currency];
    if (!country) return;
    setBankListLoading(true);
    fetch(`/api/flutterwave/banks?country=${country}`)
      .then((r) => r.json())
      .then((d) => setBankList((d.banks ?? []).sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name))))
      .catch(() => setBankList([]))
      .finally(() => setBankListLoading(false));
  }, [form.currency]);

  const set = (key: keyof AddAccountInput) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [key]: e.target.value }));

  const isValid = form.bankCode?.trim() && form.accountNumber.trim() && form.accountName.trim();

  return (
    <div className="rounded-xl border-2 border-dashed border-[#E8480A]/40 bg-[#E8480A]/3 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-bold text-sm text-[#0F0D0A]" style={{ fontFamily: "'Syne', sans-serif" }}>
          {isEdit ? "Edit Account" : "New Bank Account"}
        </p>
        <button onClick={onCancel} className="p-1 rounded-md hover:bg-[#0F0D0A]/8 text-[#0F0D0A]/40">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs font-semibold text-[#0F0D0A]/50 uppercase tracking-wider mb-1.5 block">Bank</label>
          <div className="relative">
            <div
              className="rounded-lg border border-[#0F0D0A]/15 bg-white p-2.5 flex items-center justify-between cursor-pointer hover:border-[#E8480A] transition-colors select-none"
              onClick={() => setShowBankDropdown((v) => !v)}
            >
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#0F0D0A]/30" />
                <span className={`text-sm ${form.bankCode ? "text-[#0F0D0A]" : "text-[#0F0D0A]/30"}`}>
                  {form.bankCode
                    ? bankList.find((b) => b.code === form.bankCode)?.name ?? form.bankName
                    : bankListLoading ? "Loading banks…" : "Select bank"}
                </span>
              </div>
              <ChevronDown className={`w-4 h-4 text-[#0F0D0A]/30 transition-transform ${showBankDropdown ? "rotate-180" : ""}`} />
            </div>
            {showBankDropdown && (
              <div className="absolute z-50 w-full mt-1 rounded-xl border-2 border-[#0F0D0A] bg-white shadow-xl max-h-56 flex flex-col">
                <div className="p-2 border-b border-[#E8E2D8]">
                  <input
                    type="text"
                    placeholder="Search banks…"
                    value={bankSearch}
                    onChange={(e) => setBankSearch(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full text-sm p-2 rounded-lg border border-[#E8E2D8] focus:outline-none"
                  />
                </div>
                <div className="overflow-y-auto">
                  {bankList
                    .filter((b) => !bankSearch || b.name.toLowerCase().includes(bankSearch.toLowerCase()))
                    .map((b) => (
                      <button
                        key={b.code}
                        type="button"
                        onClick={() => {
                          setForm((p) => ({ ...p, bankCode: b.code, bankName: b.name }));
                          setShowBankDropdown(false);
                          setBankSearch("");
                        }}
                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-[#F5F0E8] transition-colors ${form.bankCode === b.code ? "bg-[#F5F0E8] font-bold" : ""}`}
                      >
                        {b.name}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-[#0F0D0A]/50 uppercase tracking-wider mb-1.5 block">Account Number</label>
          <div className="relative">
            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#0F0D0A]/30" />
            <input value={form.accountNumber} onChange={set("accountNumber")} placeholder="0123456789"
              className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-[#0F0D0A]/15 bg-white text-sm text-[#0F0D0A] placeholder:text-[#0F0D0A]/30 focus:outline-none focus:border-[#E8480A] transition-colors" />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-[#0F0D0A]/50 uppercase tracking-wider mb-1.5 block">Currency</label>
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#0F0D0A]/30" />
            <select
              value={form.currency}
              onChange={(e) => {
                setForm((p) => ({ ...p, currency: e.target.value, bankCode: "", bankName: "" }));
                setBankList([]);
              }}
              className="w-full pl-9 pr-8 py-2.5 rounded-lg border border-[#0F0D0A]/15 bg-white text-sm text-[#0F0D0A] focus:outline-none focus:border-[#E8480A] transition-colors appearance-none">
              {SUPPORTED_CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#0F0D0A]/30 pointer-events-none" />
          </div>
        </div>

        <div className="col-span-2">
          <label className="text-xs font-semibold text-[#0F0D0A]/50 uppercase tracking-wider mb-1.5 block">Account Name</label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#0F0D0A]/30" />
            <input value={form.accountName} onChange={set("accountName")} placeholder="e.g. Acme Stores Ltd"
              className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-[#0F0D0A]/15 bg-white text-sm text-[#0F0D0A] placeholder:text-[#0F0D0A]/30 focus:outline-none focus:border-[#E8480A] transition-colors" />
          </div>
        </div>

        <div className="col-span-2">
          <label className="text-xs font-semibold text-[#0F0D0A]/50 uppercase tracking-wider mb-1.5 block">
            Nickname <span className="font-normal normal-case text-[#0F0D0A]/30">(optional)</span>
          </label>
          <input value={form.label ?? ""} onChange={set("label")} placeholder="e.g. GTBank - Business"
            className="w-full px-4 py-2.5 rounded-lg border border-[#0F0D0A]/15 bg-white text-sm text-[#0F0D0A] placeholder:text-[#0F0D0A]/30 focus:outline-none focus:border-[#E8480A] transition-colors" />
        </div>

        <div className="col-span-2 flex items-center gap-2.5">
          <input type="checkbox" id="set-default"
            checked={form.setAsDefault ?? false}
            onChange={(e) => setForm((p) => ({ ...p, setAsDefault: e.target.checked }))}
            className="w-4 h-4 accent-[#E8480A]" />
          <label htmlFor="set-default" className="text-sm text-[#0F0D0A]/60 cursor-pointer">
            Set as default payout account
          </label>
        </div>
      </div>

      {errorMessage && (
        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {errorMessage}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button onClick={() => onSave(form)} disabled={!isValid || isSaving}
          className="bg-[#E8480A] hover:bg-[#E8480A]/90 text-white font-bold text-sm flex-1 gap-2"
          style={{ fontFamily: "'Syne', sans-serif" }}>
          {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
          {isEdit ? "Save Changes" : "Save Account"}
        </Button>
        <Button variant="outline" onClick={onCancel}
          className="border-[#0F0D0A]/15 text-[#0F0D0A]/60 font-semibold text-sm">
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ─── QR Modal ─────────────────────────────────────────────────────────────────

function QRModal({
  qrCodeUrl, fiatAmount, currency, tokenAmount, account, paymentStatus, onBack, onClose,
}: {
  qrCodeUrl: string;
  fiatAmount: string;
  currency: string;
  tokenAmount: number;
  account: MerchantBankAccount;
  paymentStatus: "idle" | "detecting" | "processing" | "generating_receipt" | "completed";
  onBack: () => void;
  onClose: () => void;
}) {
  const qrRef = useRef<HTMLDivElement>(null);
  const currencySymbol = SUPPORTED_CURRENCIES.find((c) => c.code === currency)?.symbol ?? currency;

  useEffect(() => {
    const el = qrRef.current;
    if (!qrCodeUrl || !el) return;
    el.innerHTML = "";
    const qr = createQR(qrCodeUrl, 256, "white", "black");
    qr.append(el);
    return () => { el.innerHTML = ""; };
  }, [qrCodeUrl]);

  return (
    <div className="fixed inset-0 bg-[#0F0D0A]/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#F5F0E8] rounded-2xl border-2 border-[#0F0D0A] w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="bg-[#0F0D0A] px-6 py-5 flex items-center justify-between">
          <div>
            <p className="text-white font-black text-lg" style={{ fontFamily: "'Syne', sans-serif" }}>Payment QR</p>
            <p className="text-white/40 text-xs mt-0.5">Ready to scan with Phantom, Backpack & more</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-6 space-y-4">
          <div className="flex justify-center">
            <div className="bg-white p-4 rounded-xl border-2 border-[#0F0D0A]/10">
              <div ref={qrRef} className="flex justify-center items-center min-h-[256px]" />
            </div>
          </div>

          {paymentStatus !== "idle" && (
            <div className="flex items-center justify-center gap-3">
              {paymentStatus === "detecting" && (
                <><Loader2 className="w-5 h-5 text-[#E8480A] animate-spin" /><span className="text-sm text-[#0F0D0A] font-medium">Waiting for payment...</span></>
              )}
              {paymentStatus === "processing" && (
                <><Loader2 className="w-5 h-5 text-amber-500 animate-spin" /><span className="text-sm text-amber-600 font-medium">Processing payout...</span></>
              )}
              {paymentStatus === "generating_receipt" && (
                <><Loader2 className="w-5 h-5 text-[#6B6558] animate-spin" /><span className="text-sm text-[#6B6558] font-medium">Generating receipt...</span></>
              )}
              {paymentStatus === "completed" && (
                <><CheckCircle className="w-5 h-5 text-[#0A7B6B]" /><span className="text-sm text-[#0A7B6B] font-medium">Payment completed!</span></>
              )}
            </div>
          )}

          <div className="rounded-xl border-2 border-[#0F0D0A]/10 bg-white divide-y divide-[#0F0D0A]/8">
            <div className="px-4 py-3 flex justify-between items-center">
              <span className="text-xs text-[#0F0D0A]/40 font-semibold uppercase tracking-wider">Amount</span>
              <span className="font-black text-[#0F0D0A]" style={{ fontFamily: "'Syne', sans-serif" }}>
                {currencySymbol}{parseFloat(fiatAmount).toLocaleString()}
              </span>
            </div>
            <div className="px-4 py-3 flex justify-between items-center">
              <span className="text-xs text-[#0F0D0A]/40 font-semibold uppercase tracking-wider">Tokens</span>
              <span className="font-bold text-[#E8480A]" style={{ fontFamily: "'Syne', sans-serif" }}>
                {tokenAmount.toFixed(4)} USDC
              </span>
            </div>
            <div className="px-4 py-3 flex justify-between items-center">
              <span className="text-xs text-[#0F0D0A]/40 font-semibold uppercase tracking-wider">To</span>
              <span className="font-semibold text-sm text-[#0F0D0A]">{account.label}</span>
            </div>
          </div>

          <div className="rounded-lg border-2 border-[#C8C2B4] bg-[#F5F0E8] p-4">
            <div className="flex items-start gap-3">
              <InfoIcon className="w-4 h-4 text-[#0A7B6B] flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-sm text-[#0F0D0A] uppercase tracking-wide mb-1">Instructions for Customer</p>
                <ol className="text-xs text-[#6B6558] list-decimal pl-4 space-y-1">
                  <li>Open your Solana wallet app</li>
                  <li>Scan this QR code</li>
                  <li>Review and approve the transaction</li>
                  <li>Payment will be processed instantly</li>
                </ol>
              </div>
            </div>
          </div>

          <Button variant="outline" onClick={onBack}
            className="w-full border-2 border-[#0F0D0A] text-[#0F0D0A] font-bold uppercase tracking-wider text-xs hover:bg-[#F5F0E8]">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Edit Details
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Solstice Yield Dashboard Modal ───────────────────────────────────────────

interface StepDef {
  step:       number;
  label:      string;
  detail:     string;
  confirming: boolean;
}

const STATUS_STEP: Record<YieldVaultStatus, StepDef | null> = {
  idle:                            null,
  building_instructions:           null,
  awaiting_signature_mint_request: { step: 1, confirming: false,
    label: "Request mint",
    detail: "Tells Solstice's on-chain program you want to mint USX from your USDC. The oracle will verify your collateral.",
  },
  confirming_mint_request:         { step: 1, confirming: true,
    label: "Request mint",
    detail: "Confirming on Solana… usually a few seconds.",
  },
  awaiting_signature_mint_confirm: { step: 2, confirming: false,
    label: "Confirm mint",
    detail: "Completes the USX mint. Oracle has validated your USDC and USX is now ready to lock.",
  },
  confirming_mint_confirm:         { step: 2, confirming: true,
    label: "Confirm mint",
    detail: "Confirming on Solana…",
  },
  awaiting_signature_lock:         { step: 3, confirming: false,
    label: "Lock into vault",
    detail: "Deposits your USX into Solstice's YieldVault. You receive eUSX — a yield-bearing receipt token.",
  },
  confirming_lock:                 { step: 3, confirming: true,
    label: "Lock into vault",
    detail: "Finalising your vault position…",
  },
  completed: null,
  error:     null,
};

const TOTAL_STEPS = 3;

function YieldDashboardModal({
  initialUsdcAmount,
  vaultStatus,
  vaultError,
  vaultResult,
  onClose,
  onNewPayment,
}: {
  initialUsdcAmount: number;
  vaultStatus: YieldVaultStatus;
  vaultError: string | null;
  vaultResult: { eusxAmount: number; lockSignature: string } | null;
  onClose: () => void;
  onNewPayment: () => void;
}) {
  const { impliedApy, eusxPriceInUsx, loading: yieldLoading } = useSolsticeYield();

  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (vaultStatus !== "completed") return;
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, [vaultStatus]);

  const perSecondRate = impliedApy / (365 * 24 * 60 * 60);
  const lockedEusx  = eusxPriceInUsx > 0 ? initialUsdcAmount / eusxPriceInUsx : initialUsdcAmount;
  const displayEusx = lockedEusx * (1 + perSecondRate * elapsed);
  const yieldEarned = displayEusx - lockedEusx;
  const annualEst   = initialUsdcAmount * impliedApy;
  const apyDisplay  = yieldLoading ? "…" : `${(impliedApy * 100).toFixed(2)}%`;

  const currentStep = STATUS_STEP[vaultStatus];
  const isBuilding  = vaultStatus === "idle" || vaultStatus === "building_instructions";
  const isPending   = vaultStatus !== "completed" && vaultStatus !== "error";
  const isComplete  = vaultStatus === "completed";
  const isError     = vaultStatus === "error";

  const highestStepReached = useRef(0);
  if (currentStep && currentStep.step > highestStepReached.current) {
    highestStepReached.current = currentStep.step;
  }
  if (isComplete) highestStepReached.current = TOTAL_STEPS;

  const stepRows = [
    { n: 1, label: "Request mint" },
    { n: 2, label: "Confirm mint" },
    { n: 3, label: "Lock into vault" },
  ];

  return (
    <div className="fixed inset-0 bg-[#0F0D0A]/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl bg-[#F5F0E8] border-2 border-[#0F0D0A]">

        <div className="bg-[#0F0D0A] px-6 py-5 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-[#7C3AED] flex items-center justify-center text-white text-[9px] font-black flex-shrink-0">S</div>
              <p className="text-white font-black text-base" style={{ fontFamily: "'Syne', sans-serif" }}>
                Solstice YieldVault
              </p>
            </div>
            <p className="text-white/40 text-xs mt-0.5">
              {isComplete  ? "Your funds are earning while you sleep"
              : isError    ? "Something went wrong"
              : isBuilding ? "Preparing your vault deposit…"
              : currentStep
                ? `Step ${currentStep.step} of ${TOTAL_STEPS} — ${currentStep.confirming ? "confirming…" : "approve in your wallet"}`
                : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-3 overflow-y-auto" style={{ maxHeight: "65vh" }}>

          {(isPending || isComplete) && (
            <div className="rounded-xl overflow-hidden border-2 border-[#0F0D0A]/10 bg-white">
              {isBuilding && (
                <div className="px-4 pt-3.5 pb-3 flex items-start gap-2.5 border-b border-[#0F0D0A]/8 bg-[#EDE8DF]">
                  <div className="w-4 h-4 rounded-full bg-[#7C3AED] flex-shrink-0 mt-0.5 flex items-center justify-center">
                    <span className="text-white text-[8px] font-black">!</span>
                  </div>
                  <p className="text-[11px] text-[#0F0D0A]/60 leading-relaxed">
                    Locking into YieldVault requires{" "}
                    <span className="text-[#0F0D0A] font-bold">3 wallet approvals</span>.
                    They appear one after another — approve each one to complete your deposit.
                  </p>
                </div>
              )}

              <div className="divide-y divide-[#0F0D0A]/8">
                {stepRows.map(({ n, label }) => {
                  const isDone   = highestStepReached.current > n || isComplete;
                  const isActive = currentStep?.step === n;
                  const isAhead  = !isDone && !isActive;

                  return (
                    <div
                      key={n}
                      className="px-4 py-3 flex items-start gap-3 transition-opacity"
                      style={{ opacity: isAhead ? 0.35 : 1 }}
                    >
                      <div
                        className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-black mt-0.5"
                        style={{
                          background: isDone ? "#0A7B6B" : isActive ? "#E8480A" : "#EDE8DF",
                          color: isDone || isActive ? "#fff" : "rgba(15,13,10,0.3)",
                        }}
                      >
                        {isDone
                          ? <CheckCircle2 className="w-3.5 h-3.5" />
                          : isActive && currentStep?.confirming
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : n}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p
                            className="text-xs font-bold"
                            style={{
                              fontFamily: "'Syne', sans-serif",
                              color: isDone ? "#0A7B6B" : isActive ? "#0F0D0A" : "rgba(15,13,10,0.3)",
                            }}
                          >
                            {n}/{TOTAL_STEPS} — {label}
                          </p>
                          {isActive && !currentStep?.confirming && (
                            <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-[#E8480A] text-white">
                              Approve now
                            </span>
                          )}
                          {isActive && currentStep?.confirming && (
                            <span className="text-[9px] font-semibold uppercase tracking-widest text-[#0F0D0A]/40">
                              confirming…
                            </span>
                          )}
                          {isDone && (
                            <span className="text-[9px] font-bold text-[#0A7B6B] uppercase tracking-widest">
                              Done
                            </span>
                          )}
                        </div>
                        {isActive && currentStep?.detail && (
                          <p className="text-[10px] text-[#6B6558] mt-0.5 leading-relaxed">
                            {currentStep.detail}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {isError && (
            <div className="rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3.5 space-y-1.5">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                <p className="text-xs font-bold text-red-600" style={{ fontFamily: "'Syne', sans-serif" }}>
                  Transaction failed
                </p>
              </div>
              <p className="text-[10px] text-red-500/80 break-all leading-relaxed">{vaultError}</p>
              <p className="text-[10px] text-[#6B6558] leading-relaxed">
                Your USDC split landed in your wallet but was not deposited into YieldVault.
                No funds were lost — you can try again from Solstice&apos;s app.
              </p>
            </div>
          )}

          {isComplete && (
            <div className="rounded-xl border-2 border-[#0F0D0A]/8 bg-white px-5 py-4">
              <p className="text-[10px] text-[#6B6558] font-semibold uppercase tracking-wider mb-1">eUSX Balance</p>
              <p className="font-black text-3xl text-[#0F0D0A]" style={{ fontFamily: "'Syne', sans-serif" }}>
                {displayEusx.toFixed(6)}
              </p>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-[#6B6558]">≈ ${(displayEusx * eusxPriceInUsx).toFixed(2)} USD · <span className="text-[#0A7B6B] font-semibold">appreciating</span></p>
                {vaultResult?.lockSignature && (
                  <a
                    href={`https://solscan.io/tx/${vaultResult.lockSignature}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-[#0F0D0A]/30 hover:text-[#E8480A] transition-colors font-mono"
                  >
                    {vaultResult.lockSignature.slice(0, 8)}… ↗
                  </a>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2.5">
            {[
              { label: "APY",          value: apyDisplay,                                      color: "#0A7B6B" },
              { label: "Yield earned", value: isComplete ? `$${yieldEarned.toFixed(6)}` : "—", color: "#0F0D0A" },
              { label: "Annual est.",  value: isComplete ? `$${annualEst.toFixed(2)}`   : "—", color: "#0F0D0A" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border-2 border-[#0F0D0A]/8 bg-white p-3 text-center">
                <p className="font-black text-sm text-[#0F0D0A]" style={{ color: s.color, fontFamily: "'Syne', sans-serif" }}>
                  {s.value}
                </p>
                <p className="text-[10px] text-[#6B6558] mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border-2 border-[#0F0D0A]/8 bg-[#EDE8DF] px-4 py-3 space-y-1">
            <p className="text-xs font-bold text-[#0F0D0A]" style={{ fontFamily: "'Syne', sans-serif" }}>How it works</p>
            <p className="text-[10px] text-[#6B6558] leading-relaxed">
              Your USDC was minted into USX and locked in Solstice&apos;s YieldVault.
              The delta-neutral strategy earns from funding rates — no directional risk.
            </p>
            <p className="text-[10px] text-[#0F0D0A]/40">7-day cooldown applies on withdrawal.</p>
          </div>
        </div>

        <div className="flex gap-3 px-5 py-4 border-t-2 border-[#0F0D0A]/8">
          <button
            onClick={() => window.open("https://app.solstice.finance/", "_blank")}
            className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest border-2 border-[#0F0D0A] text-[#0F0D0A] hover:bg-[#EDE8DF] transition-colors bg-transparent"
            style={{ fontFamily: "'Syne', sans-serif" }}
          >
            Solstice ↗
          </button>
          <button
            onClick={onNewPayment}
            className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-white bg-[#0F0D0A] hover:bg-[#0F0D0A]/90 transition-colors"
            style={{ fontFamily: "'Syne', sans-serif" }}
          >
            New Payment
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Module-level receipt store ───────────────────────────────────────────────
let _pendingReceiptId: string | null = null;

// ─── Main page ────────────────────────────────────────────────────────────────

type FormState =
  | { type: "hidden" }
  | { type: "add" }
  | { type: "edit"; account: MerchantBankAccount };

const MerchantPage: React.FC = () => {
  const { connected, publicKey } = useWallet();
  const [isVisible, setIsVisible] = useState(false);
  const router = useRouter();
  const { getTrustExpressAccounts } = useTrustExpress();

  const {
    accounts, isLoading,
    addAccount, isAdding, addError,
    updateAccount, isUpdating, updateError,
    deleteAccount,
  } = useMerchantBankAccounts();

  // ── Account management ──────────────────────────────────────────────────
  const [selectedAccount, setSelectedAccount] = useState<MerchantBankAccount | null>(null);
  const [formState, setFormState] = useState<FormState>({ type: "hidden" });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Payment fields ──────────────────────────────────────────────────────
  const [fiatAmount, setFiatAmount] = useState("");
  const [selectedCurrency, setSelectedCurrency] = useState("NGN");

  // ── LP pool state ───────────────────────────────────────────────────────
  const [bestLP, setBestLP] = useState<AccountData | null>(null);
  const [loadingLP, setLoadingLP] = useState(false);
  const [staleLPError, setStaleLPError] = useState<string | null>(null);

  // ── QR state ────────────────────────────────────────────────────────────
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [generatingQr, setGeneratingQr] = useState(false);

  const searchParams = useSearchParams();

  // ── Transaction monitoring ──────────────────────────────────────────────
  const { paymentStatus, receiptId, startMonitoring, resetStatus } = useTransactionMonitoring();

  // ── Supabase Realtime receipt subscription ──────────────────────────────
  const realtimeActiveRef = useRef(false);
  useEffect(() => {
    if (!showQR || !bestLP) return;
    if (realtimeActiveRef.current) return;
    realtimeActiveRef.current = true;

    const trustExpressAddress = bestLP.publicKey.toString();
    const channel = supabase
      .channel(`receipt-insert-${trustExpressAddress}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "receipts",
          filter: `trust_express_address=eq.${trustExpressAddress}`,
        },
        (payload) => {
          window.dispatchEvent(
            new CustomEvent("trust-express:receipt-detected", {
              detail: { receiptId: payload.new?.id, trustExpressAddress },
            })
          );
        }
      )
      .subscribe();

    return () => {
      realtimeActiveRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [showQR, bestLP]);

  // ── Receipt modal state ─────────────────────────────────────────────────
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);

  // ── Yield split state ───────────────────────────────────────────────────
  const [yieldSplitEnabled, setYieldSplitEnabled] = useState(false);
  const [yieldPercent, setYieldPercent] = useState(30);
  const [showYieldDashboard, setShowYieldDashboard] = useState(false);
  const yieldUsdcAmountRef = useRef<number>(0);

  // ── Solstice YieldVault execution ───────────────────────────────────────
  const {
    status: vaultStatus,
    error: vaultError,
    result: vaultResult,
    execute: executeYieldVault,
    reset: resetVault,
  } = useExecuteYieldVault();

  // ── Realtime → immediate receipt fetch ─────────────────────────────────
  const [realtimeReceiptId, setRealtimeReceiptId] = useState<string | null>(() => _pendingReceiptId);

  const recoverFromSessionStorage = useCallback(() => {
    try {
      const stored = sessionStorage.getItem('trust-express:pending-receipt');
      if (!stored) return;
      const { id, ts } = JSON.parse(stored);
      if (id && Date.now() - ts < 60_000) {
        sessionStorage.removeItem('trust-express:pending-receipt');
        _pendingReceiptId = id;
        setRealtimeReceiptId(id);
        void (async () => {
          try {
            const { data } = await supabase.from("receipts").select("*").eq("id", id).single();
            if (data) setReceiptData(data as ReceiptData);
          } catch { /* ignore */ }
        })();
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { recoverFromSessionStorage(); }, [recoverFromSessionStorage]);

  useEffect(() => {
    const handleReceiptReady = () => recoverFromSessionStorage();
    window.addEventListener('trust-express:complete', handleReceiptReady);
    return () => window.removeEventListener('trust-express:complete', handleReceiptReady);
  }, [recoverFromSessionStorage]);

  useEffect(() => {
  if (!receiptData) return;
  if (receiptData.status !== "completed" && receiptData.status !== "success") return;
  localStorage.setItem("tv_qr_success", JSON.stringify({
    amount: receiptData.fiat_amount,
    currency: receiptData.currency,
    ts: Date.now(),
  }));
}, [receiptData]);

  useEffect(() => {
    const handler = async (e: Event) => {
      const { receiptId: rid } = (e as CustomEvent).detail;
      if (!rid) return;
      _pendingReceiptId = rid;
      setRealtimeReceiptId(rid);
      try {
        const { data } = await supabase.from("receipts").select("*").eq("id", rid).single();
        if (data) setReceiptData(data);
      } catch { /* ignore */ }
      if (yieldSplitEnabled) {
        setTimeout(() => {
          setShowYieldDashboard(true);
          void executeYieldVault(yieldUsdcAmountRef.current);
        }, 1200);
      }
    };
    window.addEventListener("trust-express:receipt-detected", handler);
    return () => window.removeEventListener("trust-express:receipt-detected", handler);
  }, [yieldSplitEnabled, executeYieldVault]);

  const openReceiptModal = useCallback(async () => {
    const activeReceiptId = receiptId ?? realtimeReceiptId;
    if (!activeReceiptId) return;
    setShowReceiptModal(true);
    if (receiptData) return;
    setReceiptLoading(true);
    try {
      const { data } = await supabase
        .from("receipts")
        .select("*")
        .eq("id", activeReceiptId)
        .single();
      setReceiptData(data);
    } catch {
      // fall back to full-page link
    } finally {
      setReceiptLoading(false);
    }
  }, [receiptId, realtimeReceiptId, receiptData]);

  useEffect(() => {
    const t = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (accounts.length && !selectedAccount) {
      setSelectedAccount(accounts.find((a) => a.is_default) ?? accounts[0]);
    }
  }, [accounts, selectedAccount]);

  useEffect(() => {
    if (!getTrustExpressAccounts.data || !selectedCurrency) return;
    const fetch = async () => {
      setLoadingLP(true);
      setBestLP(null);
      try {
        const allAccounts = getTrustExpressAccounts.data;
        const matching = (allAccounts as AccountData[]).filter((a) => {
          const currencyStr = String.fromCharCode(...a.account.currency).trim();
          const hasAmount = a.account.amount && Number(a.account.amount.toString()) > 0;
          const hasCapacity = a.account.reservedAmounts.length < 10;
          return (
            a.account.escrowType === 1 &&
            currencyStr === selectedCurrency &&
            hasAmount &&
            hasCapacity
          );
        });
        if (matching.length === 0) { setBestLP(null); setLoadingLP(false); return; }
        const sorted = matching.sort((a, b) => Number(b.account.pricePerToken.toString()) - Number(a.account.pricePerToken.toString()));
        setBestLP(sorted[0]);
      } finally {
        setLoadingLP(false);
      }
    };
    fetch();
  }, [selectedCurrency, getTrustExpressAccounts.data]);

  // ── Populate form from URL params ───────────────────────────────────────
  useEffect(() => {
    const amt = searchParams.get("amount");
    const cur = searchParams.get("currency");
    if (amt) setFiatAmount(amt);
    if (cur && SUPPORTED_CURRENCIES.find((c) => c.code === cur)) {
      setSelectedCurrency(cur);
    }
  }, [searchParams]);

  // ── Restore QR state on refresh ─────────────────────────────────────────
  // If the merchant refreshes while a QR is active, restore it automatically
  // so they don't lose context. Pressing X clears this storage (see onClose).
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(QR_STORAGE_KEY);
      if (!stored) return;
      const { url, amount, currency } = JSON.parse(stored);
      if (url && amount && currency) {
        setQrCodeUrl(url);
        setFiatAmount(amount);
        setSelectedCurrency(currency);
        setShowQR(true);
      }
    } catch { /* ignore */ }
  }, []); // runs once on mount only

  const calculatedTokenAmount = useMemo(() => {
    if (!bestLP || !fiatAmount || parseFloat(fiatAmount) <= 0) return 0;
    const pricePerToken = Number(bestLP.account.pricePerToken.toString());
    if (pricePerToken === 0) return 0;
    return parseFloat(fiatAmount) / pricePerToken;
  }, [bestLP, fiatAmount]);

  const formattedRate = useMemo(() => {
    if (!bestLP) return null;
    return Number(bestLP.account.pricePerToken.toString()).toFixed(2);
  }, [bestLP]);

  const currencySymbol = useMemo(
    () => SUPPORTED_CURRENCIES.find((c) => c.code === selectedCurrency)?.symbol ?? selectedCurrency,
    [selectedCurrency]
  );

  // ── Derived state (declared before auto-generate effect) ────────────────
  const step = !selectedAccount ? 1 : !fiatAmount || parseFloat(fiatAmount) <= 0 ? 2 : 3;
  const canGenerate = !!selectedAccount && !!bestLP && !!fiatAmount && parseFloat(fiatAmount) > 0 && calculatedTokenAmount > 0;

  // ── Auto-generate ref ───────────────────────────────────────────────────
  const autoGeneratedRef = useRef(false);

  const handleGenerateQR = useCallback(async () => {
    if (!bestLP || !selectedAccount) return;
    setStaleLPError(null);
    setGeneratingQr(true);
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      const apiUrl = new URL("/api/solana-pay/instant-reserve", baseUrl);
      apiUrl.searchParams.set("trustExpressAddress", bestLP.publicKey.toString());
      apiUrl.searchParams.set("tokenAmount", calculatedTokenAmount.toString());
      apiUrl.searchParams.set("fiatAmount", fiatAmount);
      apiUrl.searchParams.set("currency", selectedCurrency);
      apiUrl.searchParams.set("payoutDetails", JSON.stringify({
        type: "bank_transfer",
        account_number: selectedAccount.account_number,
        bank_code: selectedAccount.bank_code,
        bank_name: selectedAccount.bank_name,
        beneficiary_name: selectedAccount.account_name,
      }));

      if (yieldSplitEnabled && yieldPercent > 0 && publicKey) {
        apiUrl.searchParams.set("yieldPercent", yieldPercent.toString());
        apiUrl.searchParams.set("merchantWallet", publicKey.toBase58());
        yieldUsdcAmountRef.current = calculatedTokenAmount * yieldPercent / 100;
      }

      const cluster = process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.includes('devnet')
        ? 'devnet'
        : process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.includes('mainnet')
        ? 'mainnet-beta'
        : 'devnet';
      apiUrl.searchParams.set("cluster", cluster);

      const solanaPayUrl = `solana:${encodeURIComponent(apiUrl.toString())}`;
      setQrCodeUrl(solanaPayUrl);
      setShowQR(true);
      startMonitoring(bestLP.publicKey.toString());

      // Persist QR state so a refresh restores it automatically
      try {
        sessionStorage.setItem(QR_STORAGE_KEY, JSON.stringify({
          url: solanaPayUrl,
          amount: fiatAmount,
          currency: selectedCurrency,
        }));
      } catch { /* ignore */ }
    } catch (err) {
      console.error("Error generating QR:", err);
    } finally {
      setGeneratingQr(false);
    }
  }, [
    bestLP, selectedAccount, calculatedTokenAmount, fiatAmount,
    selectedCurrency, startMonitoring,
    yieldSplitEnabled, yieldPercent, publicKey,
  ]);

  // ── Auto-generate QR when page loads with ?amount + ?currency params ────
  // Fires once when canGenerate first becomes true.
  // If QR was already restored from sessionStorage (refresh case),
  // skip re-generating — the restore effect above already handled it.
  useEffect(() => {
    if (autoGeneratedRef.current) return;
    const amt = searchParams.get("amount");
    const cur = searchParams.get("currency");
    if (!amt || !cur) return;
    if (!canGenerate) return;

    // Don't re-generate if a QR was already restored from storage
    try {
      const stored = sessionStorage.getItem(QR_STORAGE_KEY);
      if (stored) return;
    } catch { /* ignore */ }

    autoGeneratedRef.current = true;
    handleGenerateQR();
  }, [canGenerate, handleGenerateQR, searchParams]);

  const handleAdd = async (input: AddAccountInput) => {
    const account = await addAccount(input);
    setSelectedAccount(account);
    setFormState({ type: "hidden" });
  };

  const handleEdit = async (input: AddAccountInput) => {
    if (formState.type !== "edit") return;
    const updated = await updateAccount({ accountId: formState.account.id, ...input } as UpdateAccountInput);
    if (selectedAccount?.id === updated.id) setSelectedAccount(updated);
    setFormState({ type: "hidden" });
  };

  const handleDelete = async (account: MerchantBankAccount) => {
    setDeletingId(account.id);
    try {
      await deleteAccount(account.id);
      if (selectedAccount?.id === account.id) setSelectedAccount(null);
    } finally {
      setDeletingId(null);
    }
  };

  // ── Wipe QR storage and fully reset all state ───────────────────────────
  const clearQRStorage = useCallback(() => {
    try { sessionStorage.removeItem(QR_STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  const handleNewPayment = useCallback(() => {
    resetStatus();
    setShowQR(false);
    setQrCodeUrl(null);
    setFiatAmount("");
    setShowReceiptModal(false);
    setReceiptData(null);
    realtimeActiveRef.current = false;
    setRealtimeReceiptId(null);
    setShowYieldDashboard(false);
    resetVault();
    yieldUsdcAmountRef.current = 0;
    autoGeneratedRef.current = false;
    clearQRStorage();
    try { sessionStorage.removeItem('trust-express:pending-receipt'); } catch {}
    _pendingReceiptId = null;
  }, [resetStatus, resetVault, clearQRStorage]);

  const formError =
    formState.type === "add" ? (addError as Error)?.message :
    formState.type === "edit" ? (updateError as Error)?.message : undefined;

  const fmt = (v: unknown) => (v !== null && v !== undefined && v !== "" ? String(v) : "—");

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      {showQR && qrCodeUrl && selectedAccount && (
        <QRModal
          qrCodeUrl={qrCodeUrl}
          fiatAmount={fiatAmount}
          currency={selectedCurrency}
          tokenAmount={calculatedTokenAmount}
          account={selectedAccount}
          paymentStatus={paymentStatus}
          onBack={() => {
            // Back just hides the modal — QR storage kept so refresh still restores
            setShowQR(false);
          }}
          onClose={() => {
            // X = merchant intentionally dismissed — fully reset
            setShowQR(false);
            setQrCodeUrl(null);
            autoGeneratedRef.current = false;
            clearQRStorage();
            router.replace(window.location.pathname, { scroll: false });

          }}
        />
      )}

      {showYieldDashboard && yieldSplitEnabled && (
        <YieldDashboardModal
          initialUsdcAmount={calculatedTokenAmount * yieldPercent / 100}
          vaultStatus={vaultStatus}
          vaultError={vaultError}
          vaultResult={vaultResult}
          onClose={() => setShowYieldDashboard(false)}
          onNewPayment={handleNewPayment}
        />
      )}

      {((paymentStatus === "completed" && receiptId) || realtimeReceiptId) && (
        <div className="fixed inset-0 bg-[#0F0D0A]/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div
            className="relative w-full rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            style={{ maxWidth: 440, background: "#F5F0E8", border: "2px solid #0F0D0A" }}
          >
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1.5px solid #E8E2D8" }}>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-[#0A7B6B]" />
                <span className="text-xs font-black uppercase tracking-widest text-[#0F0D0A]">Transaction Receipt</span>
              </div>
              <button
                onClick={() => setShowReceiptModal(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-[#6B6558] hover:bg-[#E8E2D8] bg-transparent border-none cursor-pointer text-lg leading-none"
              >
                ×
              </button>
            </div>

            <div className="px-5 py-5 overflow-y-auto" style={{ maxHeight: "65vh" }}>
              {!showReceiptModal ? (
                <div className="flex flex-col items-center gap-4 py-6 text-center">
                  <CheckCircle className="w-12 h-12 text-[#0A7B6B]" />
                  <div>
                    <p className="text-sm font-bold text-[#0F0D0A]" style={{ fontFamily: "'Syne', sans-serif" }}>
                      Payment Successful!
                    </p>
                    <p className="text-xs text-[#6B6558] mt-1">Your customer&apos;s payment has been processed.</p>
                  </div>
                  <button
                    onClick={openReceiptModal}
                    className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-white border-none cursor-pointer hover:opacity-90"
                    style={{ background: "#0A7B6B" }}
                  >
                    View Receipt
                  </button>
                </div>
              ) : receiptLoading ? (
                <div className="flex items-center justify-center py-10 gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-[#E8480A]" />
                  <span className="text-sm text-[#6B6558]">Loading receipt…</span>
                </div>
              ) : receiptData ? (
                <div className="space-y-1">
                  <div className="text-center pb-4 mb-4" style={{ borderBottom: "1px solid #E8E2D8" }}>
                    <p className="text-lg font-bold text-[#0F0D0A]">Transaction Receipt</p>
                    <p className="text-xs text-[#6B6558]">Trust Express · Merchant Pay</p>
                  </div>

                  {[
                    { label: "Receipt ID",  value: receiptData.id,                                                             mono: true,  truncate: true  },
                    { label: "Date",        value: receiptData.created_at ? new Date(receiptData.created_at).toLocaleString() : null                       },
                    { label: "Name",        value: receiptData.payout_details?.beneficiary_name ?? receiptData.account_name                                },
                    { label: "Acct No",     value: receiptData.payout_details?.account_number   ?? receiptData.account_number                             },
                    { label: "Bank",        value: receiptData.payout_details?.bank_name        ?? receiptData.bank_name                                   },
                    { label: "Amount",      value: receiptData.fiat_amount != null ? `${receiptData.fiat_amount} ${receiptData.currency ?? ""}` : null, bold: true },
                    { label: "Tokens",      value: receiptData.token_amount != null ? `${receiptData.token_amount} TOKEN` : null,                    bold: true },
                    { label: "Reference",   value: receiptData.payout_reference ?? receiptData.reference,                       mono: true               },
                  ].map(({ label, value, mono, truncate, bold }: {
                    label: string; value: string | number | null | undefined; mono?: boolean; truncate?: boolean; bold?: boolean;
                  }) => (
                    <div
                      key={label}
                      className="flex items-start justify-between gap-4 py-2.5"
                      style={{ borderBottom: "1px solid #F0EDE7" }}
                    >
                      <span className="text-xs text-[#6B6558] flex-shrink-0">{label}:</span>
                      <span className={`text-xs text-right ${bold ? "font-black text-[#0F0D0A]" : "text-[#0F0D0A]"} ${mono ? "font-mono" : ""} ${truncate ? "truncate max-w-[200px]" : ""}`}>
                        {fmt(value)}
                      </span>
                    </div>
                  ))}

                  <div className="flex items-center justify-between py-2.5">
                    <span className="text-xs text-[#6B6558]">Status:</span>
                    <span
                      className="text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider"
                      style={{
                        background: receiptData.status === "completed" || receiptData.status === "success"
                          ? "rgba(10,123,107,0.12)" : "rgba(232,72,10,0.12)",
                        color: receiptData.status === "completed" || receiptData.status === "success"
                          ? "#0A7B6B" : "#E8480A",
                      }}
                    >
                      {fmt(receiptData.status).toUpperCase()}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-[#6B6558] mb-4">Could not load receipt data.</p>
                  <button
                    onClick={() => window.open(`/receipts/${receiptId ?? realtimeReceiptId}`, "_blank")}
                    className="px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-white border-none cursor-pointer"
                    style={{ background: "#0F0D0A" }}
                  >
                    Open Receipt Page ↗
                  </button>
                </div>
              )}
            </div>

            <div className="flex gap-3 px-5 py-4" style={{ borderTop: "1.5px solid #E8E2D8" }}>
              {showReceiptModal && (
                <button
                  onClick={() => window.open(`/receipts/${receiptId ?? realtimeReceiptId}`, "_blank")}
                  className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest border cursor-pointer hover:opacity-80 transition-opacity bg-transparent"
                  style={{ borderColor: "#C8C2B4", color: "#6B6558" }}
                >
                  Full Page ↗
                </button>
              )}
              <button
                onClick={handleNewPayment}
                className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-white border-none cursor-pointer hover:opacity-90"
                style={{ background: "#0F0D0A" }}
              >
                New Payment
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="container mx-auto py-10 max-w-2xl">
        <div className={`space-y-8 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>

          {/* ── Header ── */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-[#0F0D0A] p-3 rounded-xl">
                <Store className="w-6 h-6 text-[#E8480A]" />
              </div>
              <div>
                <h1 className="text-3xl font-black tracking-tight text-[#0F0D0A]" style={{ fontFamily: "'Syne', sans-serif" }}>
                  Merchant Pay
                </h1>
                <p className="text-sm text-[#0F0D0A]/55 mt-0.5">
                  Generate a QR code — receive fiat directly to your bank
                </p>
              </div>
            </div>

            {connected ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0A7B6B]/10 border border-[#0A7B6B]/20">
                <div className="w-2 h-2 rounded-full bg-[#0A7B6B]" />
                <span className="text-xs font-semibold text-[#0A7B6B]">
                  {publicKey?.toString().slice(0, 4)}...{publicKey?.toString().slice(-4)}
                </span>
              </div>
            ) : (
              <WalletMultiButton style={{
                background: "transparent",
                border: "2px solid rgba(15,13,10,0.15)",
                color: "#0F0D0A",
                borderRadius: "8px",
                fontSize: "13px",
                fontFamily: "'Syne', sans-serif",
                fontWeight: 600,
                height: "38px",
                padding: "0 14px",
              }} />
            )}
          </div>

          {!connected && (
            <div className="rounded-xl border-2 border-[#0F0D0A]/8 bg-white px-5 py-4 flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-[#E8480A] flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-[#0F0D0A]" style={{ fontFamily: "'Syne', sans-serif" }}>
                  Connect wallet to save bank accounts
                </p>
                <p className="text-xs text-[#0F0D0A]/50 mt-0.5 leading-relaxed">
                  One-time merchants can skip this and enter details below. Returning merchants connect once to save accounts for faster QR generation.
                </p>
              </div>
            </div>
          )}

          <Separator />

          {/* ── STEP 1: Payout account ── */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <StepBadge n={1} active={step === 1} done={step > 1} />
              <div>
                <p className="font-black text-[#0F0D0A]" style={{ fontFamily: "'Syne', sans-serif" }}>Choose payout account</p>
                <p className="text-xs text-[#0F0D0A]/40">Where fiat lands after the swap</p>
              </div>
            </div>

            <div className="space-y-3 pl-11">
              {isLoading && connected && (
                <div className="flex items-center gap-2 text-sm text-[#0F0D0A]/40 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading saved accounts…
                </div>
              )}

              {accounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  selected={selectedAccount?.id === account.id}
                  onSelect={() => setSelectedAccount(account)}
                  onDelete={() => handleDelete(account)}
                  onEdit={() => setFormState({ type: "edit", account })}
                  isDeleting={deletingId === account.id}
                />
              ))}

              {formState.type !== "hidden" ? (
                <AccountForm
                  mode={
                    formState.type === "add"
                      ? { type: "add" }
                      : { type: "edit", account: (formState as { type: "edit"; account: MerchantBankAccount }).account }
                  }
                  onSave={formState.type === "add" ? handleAdd : handleEdit}
                  onCancel={() => setFormState({ type: "hidden" })}
                  isSaving={isAdding || isUpdating}
                  errorMessage={formError}
                />
              ) : (
                <button onClick={() => setFormState({ type: "add" })}
                  className="w-full rounded-xl border-2 border-dashed border-[#0F0D0A]/15 bg-transparent hover:border-[#E8480A]/40 hover:bg-[#E8480A]/3 transition-all duration-200 px-5 py-3.5 flex items-center gap-2.5 text-[#0F0D0A]/40 hover:text-[#E8480A] group">
                  <Plus className="w-4 h-4 transition-transform group-hover:rotate-90 duration-200" />
                  <span className="text-sm font-semibold" style={{ fontFamily: "'Syne', sans-serif" }}>
                    {connected ? "Add new account" : "Enter account details"}
                  </span>
                </button>
              )}
            </div>
          </div>

          <Separator />

          {/* ── STEP 2: Amount + currency ── */}
          <div className={cn("space-y-4 transition-opacity duration-300", !selectedAccount && "opacity-40 pointer-events-none")}>
            <div className="flex items-center gap-3">
              <StepBadge n={2} active={step === 2} done={step > 2} />
              <div>
                <p className="font-black text-[#0F0D0A]" style={{ fontFamily: "'Syne', sans-serif" }}>Set payment amount</p>
                <p className="text-xs text-[#0F0D0A]/40">Enter the fiat amount your customer owes</p>
              </div>
            </div>

            <div className="pl-11 space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#0F0D0A]/30" />
                  <input
                    type="number"
                    value={fiatAmount}
                    onChange={(e) => setFiatAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-9 pr-4 py-3 rounded-xl border-2 border-[#0F0D0A]/10 bg-white text-[#0F0D0A] font-bold text-lg placeholder:text-[#0F0D0A]/20 focus:outline-none focus:border-[#E8480A] transition-colors"
                    style={{ fontFamily: "'Syne', sans-serif" }}
                  />
                </div>
                <div className="relative">
                  <select
                    value={selectedCurrency}
                    onChange={(e) => { setSelectedCurrency(e.target.value); setBestLP(null); setStaleLPError(null); }}
                    className="h-full px-4 pr-8 rounded-xl border-2 border-[#0F0D0A]/10 bg-white text-[#0F0D0A] font-bold focus:outline-none focus:border-[#E8480A] transition-colors appearance-none"
                    style={{ fontFamily: "'Syne', sans-serif" }}
                  >
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>{c.code}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#0F0D0A]/30 pointer-events-none" />
                </div>
              </div>

              {loadingLP && (
                <div className="flex items-center gap-2 text-sm text-[#0F0D0A]/40">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Finding best rate for {selectedCurrency}…
                </div>
              )}
              {!loadingLP && staleLPError && (
                <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{staleLPError}</span>
                </div>
              )}
              {!loadingLP && !bestLP && !staleLPError && selectedCurrency && (
                <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  No liquidity providers available for {selectedCurrency} right now. Try again shortly.
                </div>
              )}

              {bestLP && (
                <div className="rounded-xl border-2 border-[#0A7B6B]/20 bg-[#0A7B6B]/5 px-5 py-3">
                  <p className="text-xs text-[#0A7B6B] font-semibold">
                    Best Rate: {formattedRate} {selectedCurrency} per token
                  </p>
                </div>
              )}

              {fiatAmount && parseFloat(fiatAmount) > 0 && bestLP && calculatedTokenAmount > 0 && (
                <div className="rounded-xl border-2 border-[#0F0D0A]/8 bg-white px-5 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-[#0F0D0A]/40 font-semibold uppercase tracking-wider">Customer pays</p>
                    <p className="font-black text-xl text-[#E8480A] mt-0.5" style={{ fontFamily: "'Syne', sans-serif" }}>
                      {calculatedTokenAmount.toFixed(4)} USDC
                    </p>
                    <p className="text-xs text-[#0F0D0A]/30 mt-0.5">at {formattedRate} {selectedCurrency}/token</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-[#0F0D0A]/20" />
                  <div className="text-right">
                    <p className="text-xs text-[#0F0D0A]/40 font-semibold uppercase tracking-wider">You receive</p>
                    <p className="font-black text-xl text-[#0F0D0A] mt-0.5" style={{ fontFamily: "'Syne', sans-serif" }}>
                      {currencySymbol}{parseFloat(fiatAmount).toLocaleString()}
                    </p>
                  </div>
                </div>
              )}

              {/* ── Yield Split (Solstice) ── */}
              {fiatAmount && parseFloat(fiatAmount) > 0 && bestLP && calculatedTokenAmount > 0 && (
                <div className="rounded-xl border-2 border-[#5B21B6]/20 bg-[#5B21B6]/5 px-5 py-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-[#5B21B6] flex items-center justify-center text-white text-[10px] font-black">S</div>
                      <span className="text-sm font-bold text-[#0F0D0A]" style={{ fontFamily: "'Syne', sans-serif" }}>
                        Earn yield on part of your payment
                      </span>
                    </div>
                    <button
                      onClick={() => setYieldSplitEnabled(!yieldSplitEnabled)}
                      className={cn(
                        "w-10 h-5 rounded-full transition-all duration-200 relative",
                        yieldSplitEnabled ? "bg-[#5B21B6]" : "bg-[#0F0D0A]/20"
                      )}
                    >
                      <div className={cn(
                        "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200",
                        yieldSplitEnabled ? "left-5" : "left-0.5"
                      )} />
                    </button>
                  </div>

                  {yieldSplitEnabled && (
                    <div className="space-y-3">
                      <p className="text-xs text-[#6B6558]">
                        Route a portion of your payment to Solstice YieldVault — earn ~13% APY in USD, protected from naira devaluation. Withdraw anytime.
                      </p>

                      <div className="space-y-2">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-[#0F0D0A]/50">To bank account</span>
                          <span className="text-[#0F0D0A]/50">To YieldVault</span>
                        </div>
                        <input
                          type="range"
                          min={10}
                          max={90}
                          step={5}
                          value={yieldPercent}
                          onChange={(e) => setYieldPercent(Number(e.target.value))}
                          className="w-full accent-[#5B21B6]"
                        />
                        <div className="flex justify-between">
                          <div className="text-center">
                            <p className="font-black text-base text-[#0F0D0A]" style={{ fontFamily: "'Syne', sans-serif" }}>
                              {currencySymbol}{(parseFloat(fiatAmount) * (100 - yieldPercent) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </p>
                            <p className="text-xs text-[#0F0D0A]/40">{100 - yieldPercent}% fiat</p>
                          </div>
                          <div className="text-center">
                            <p className="font-black text-base text-[#5B21B6]" style={{ fontFamily: "'Syne', sans-serif" }}>
                              ${(calculatedTokenAmount * yieldPercent / 100).toFixed(2)} USDC
                            </p>
                            <p className="text-xs text-[#5B21B6]/70">{yieldPercent}% → eUSX</p>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-[#5B21B6]/15">
                        <span className="text-xs text-[#5B21B6] font-semibold">Powered by Solstice · ~13% APY · Withdraw anytime</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* ── STEP 3: Generate ── */}
          <div className={cn("pl-11 transition-opacity duration-300", !canGenerate && "opacity-40 pointer-events-none")}>
            <Button
              onClick={handleGenerateQR}
              disabled={!canGenerate || generatingQr}
              className="w-full bg-[#E8480A] hover:bg-[#E8480A]/90 text-white font-black text-base py-6 rounded-xl gap-3 shadow-lg shadow-[#E8480A]/20"
              style={{ fontFamily: "'Syne', sans-serif" }}
            >
              {generatingQr
                ? <><Loader2 className="w-5 h-5 animate-spin" />Generating…</>
                : <><QrCode className="w-5 h-5" />Generate QR Code<ArrowRight className="w-4 h-4 opacity-70" /></>
              }
            </Button>
            <p className="text-xs text-[#0F0D0A]/35 text-center mt-3">
              Crypto amount locks when customer scans · Rate from lowest-priced pool
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};

export default MerchantPage;