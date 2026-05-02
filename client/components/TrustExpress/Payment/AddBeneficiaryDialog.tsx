"use client";
import React, { useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Save, User, Building2, ChevronDown } from "lucide-react";
import { useBeneficiaries } from "@/hooks/express/useBeneficiaries";
import { useWallet } from "@solana/wallet-adapter-react";

interface Props {
  trigger: React.ReactNode;
}

const AddBeneficiaryDialog: React.FC<Props> = ({ trigger }) => {
  const [open, setOpen] = useState(false);
  const [includeBank, setIncludeBank] = useState(false);
  const { publicKey } = useWallet();
  const { saveBeneficiary } = useBeneficiaries(publicKey?.toString());

  const [formData, setFormData] = useState({
    nickname: "",
    wallet_address: "",
    bank_name: "",
    account_number: "",
    account_name: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!publicKey) return;

    await saveBeneficiary.mutateAsync({
      user_wallet: publicKey.toString(),
      nickname: formData.nickname,
      wallet_address: formData.wallet_address,
      bank_name: includeBank ? formData.bank_name : undefined,
      account_number: includeBank ? formData.account_number : undefined,
      account_name: includeBank ? formData.account_name : undefined,
    });

    // Reset form
    setFormData({
      nickname: "",
      wallet_address: "",
      bank_name: "",
      account_number: "",
      account_name: "",
    });
    setIncludeBank(false);
    setOpen(false);
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-gray-900 border-gray-700">
        <DialogHeader>
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-2.5 rounded-lg">
              <User className="w-6 h-6 text-white" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-white">
                Add Beneficiary
              </DialogTitle>
              <DialogDescription className="text-gray-400">
                Save contact details for quick payments
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Nickname */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">
              Nickname *
            </label>
            <Input
              type="text"
              placeholder="e.g., John - Supplier"
              value={formData.nickname}
              onChange={(e) => handleChange("nickname", e.target.value)}
              className="bg-gray-800 border-gray-600 text-white placeholder:text-gray-500"
              required
            />
            <p className="text-xs text-gray-400">
              A friendly name to identify this beneficiary
            </p>
          </div>

          {/* Wallet Address */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-gray-300">
              <User className="w-4 h-4 text-blue-400"/>
              <span className="text-sm font-medium">Wallet Address *</span>
            </div>
            <Input
              type="text"
              placeholder="Enter Solana wallet address"
              value={formData.wallet_address}
              onChange={(e) => handleChange("wallet_address", e.target.value)}
              className="bg-gray-800 border-gray-600 text-white placeholder:text-gray-500"
              required
            />
          </div>

          {/* Include Bank Details Toggle */}
          <div className="flex items-center justify-between p-4 bg-gray-800 rounded-lg border border-gray-700">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-orange-400"/>
              <span className="text-sm font-medium text-gray-300">
                Add Bank Details (Optional)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIncludeBank(!includeBank)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                includeBank ? "bg-green-600" : "bg-gray-600"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  includeBank ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Bank Details */}
          {includeBank && (
            <div className="space-y-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">
                  Bank Name / Code
                </label>
                <Input
                  type="text"
                  placeholder="e.g., Access Bank or 044"
                  value={formData.bank_name}
                  onChange={(e) => handleChange("bank_name", e.target.value)}
                  className="bg-gray-800 border-gray-600 text-white placeholder:text-gray-500"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">
                  Account Number
                </label>
                <Input
                  type="text"
                  placeholder="1234567890"
                  value={formData.account_number}
                  onChange={(e) => handleChange("account_number", e.target.value)}
                  className="bg-gray-800 border-gray-600 text-white placeholder:text-gray-500"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">
                  Account Name
                </label>
                <Input
                  type="text"
                  placeholder="John Doe"
                  value={formData.account_name}
                  onChange={(e) => handleChange("account_name", e.target.value)}
                  className="bg-gray-800 border-gray-600 text-white placeholder:text-gray-500"
                />
              </div>
            </div>
          )}

          {/* Info Box */}
          <div className="rounded-xl bg-blue-900/20 border border-blue-800 p-4">
            <div className="flex items-start gap-3">
              <div className="text-blue-400 text-xl">ℹ️</div>
              <div className="text-sm text-blue-200">
                <div className="font-medium mb-1">Beneficiary Information</div>
                <ul className="text-xs text-blue-300 space-y-1 list-disc list-inside">
                  <li>Wallet address is required for all payments</li>
                  <li>Bank details are optional but useful for fiat requests</li>
                  <li>You can edit beneficiaries anytime</li>
                </ul>
              </div>
            </div>
          </div>
        </form>

        <DialogFooter>
          <DialogClose asChild>
            <Button
              variant="secondary"
              type="button"
              disabled={saveBeneficiary.isPending}
            >
              Cancel
            </Button>
          </DialogClose>
          <Button
            onClick={handleSubmit}
            disabled={saveBeneficiary.isPending || !formData.nickname || !formData.wallet_address}
            className="bg-green-600 hover:bg-green-700"
          >
            {saveBeneficiary.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Beneficiary
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddBeneficiaryDialog;