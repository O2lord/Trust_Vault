// components/TrustExpress/CredentialsManager/BuyOrder/PaystackBuyerCredentialManager.tsx

import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, Plus, Trash2, RefreshCw, Shield } from 'lucide-react';
import { toast } from 'sonner';
import bs58 from 'bs58';

interface Credential {
  id: string;
  label: string | null;
  created_at: string;
  is_active: boolean;
  balance?: number;
  currency?: string;
  checking?: boolean;
}

const PaystackBuyerCredentialManager = () => {
  const { publicKey, signMessage } = useWallet();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [secretKey, setSecretKey] = useState('');
  const [label, setLabel] = useState('');
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ valid: boolean; balance?: number; currency?: string } | null>(null);

  useEffect(() => { if (publicKey) fetchCredentials(); }, [publicKey]);

  const genMsg = (action: string) => `Sign this message to authenticate with TrustExpress.\n\nAction: ${action}\nTimestamp: ${Date.now()}\nNonce: ${Math.random().toString(36).substring(2, 15)}\n\nThis signature will not cost any gas fees.`;

  const signMsg = async (message: string) => {
    if (!signMessage || !publicKey) throw new Error('Wallet not connected');
    return bs58.encode(await signMessage(new TextEncoder().encode(message)));
  };

  const fetchCredentials = async () => {
    if (!publicKey) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/payment-processors/paystack/buyer-credentials/list?walletAddress=${publicKey.toBase58()}`);
      const data = await res.json();
      if (res.ok) setCredentials(data.credentials || []);
      else toast.error(data.error || 'Failed to fetch credentials');
    } catch { toast.error('Failed to fetch credentials'); }
    finally { setLoading(false); }
  };

  const testConnection = async () => {
    if (!secretKey.trim()) { toast.error('Please enter a secret key'); return; }
    setTestingConnection(true); setTestResult(null);
    try {
      // Quick format validation before hitting the API
      if (!secretKey.startsWith('sk_test_') && !secretKey.startsWith('sk_live_')) {
        setTestResult({ valid: false });
        toast.error('Invalid key format. Must start with sk_test_ or sk_live_');
        return;
      }
      const res = await fetch('/api/payment-processors/paystack/buyer-credentials/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: publicKey?.toBase58() ?? 'validate_only', secretKey: secretKey.trim(), signature: 'test', message: genMsg('validate'), label: null }),
      });
      // We only care if Paystack accepted the key, not if the full store succeeded
      const data = await res.json();
      const valid = res.ok || data.error?.includes('signature'); // signature error means key was valid
      setTestResult({ valid, balance: data.balance, currency: data.currency });
      if (valid) toast.success('Paystack key is valid!');
      else toast.error(data.error || 'Invalid credentials');
    } catch { setTestResult({ valid: false }); toast.error('Failed to verify'); }
    finally { setTestingConnection(false); }
  };

  const saveCredential = async () => {
    if (!publicKey || !signMessage || !secretKey.trim()) { toast.error('Please connect wallet and enter a key'); return; }
    setSaving(true);
    try {
      const message = genMsg('store_buyer_credentials');
      const signature = await signMsg(message);
      const res = await fetch('/api/payment-processors/paystack/buyer-credentials/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: publicKey.toBase58(), secretKey: secretKey.trim(), signature, message, label: label.trim() || null }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Paystack buyer credentials saved!');
        setShowAddDialog(false); setSecretKey(''); setLabel(''); setTestResult(null);
        fetchCredentials();
      } else toast.error(data.error || 'Failed to save credentials');
    } catch { toast.error('Failed to save credentials'); }
    finally { setSaving(false); }
  };

  const deleteCredential = async (credentialId: string) => {
    if (!publicKey || !signMessage) return;
    try {
      const message = genMsg('delete_buyer_credential');
      const signature = await signMsg(message);
      const params = new URLSearchParams({ credentialId, walletAddress: publicKey.toBase58(), signature, message });
      const res = await fetch(`/api/payment-processors/paystack/buyer-credentials/delete?${params}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.success) { toast.success('Credential deleted'); setDeleteConfirmId(null); fetchCredentials(); }
      else toast.error(data.error || 'Failed to delete');
    } catch { toast.error('Failed to delete credential'); }
  };

  const checkStatus = async (credentialId: string) => {
    setCredentials(prev => prev.map(c => c.id === credentialId ? { ...c, checking: true } : c));
    try {
      const params = new URLSearchParams({ credentialId, walletAddress: publicKey!.toBase58() });
      const res = await fetch(`/api/payment-processors/paystack/buyer-credentials/status?${params}`);
      const data = await res.json();
      setCredentials(prev => prev.map(c => c.id === credentialId ? { ...c, checking: false, balance: data.balance, currency: data.currency } : c));
      if (data.valid) toast.success(`Balance: ₦${data.balance?.toLocaleString() ?? 'N/A'}`);
      else toast.error(data.error || 'Check failed');
    } catch {
      setCredentials(prev => prev.map(c => c.id === credentialId ? { ...c, checking: false } : c));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-[#6B6558]">Single secret key — no public key or merchant ID needed. Transfers work in test mode immediately.</p>
        <Button onClick={() => setShowAddDialog(true)} size="sm" className="bg-[#0F0D0A] hover:bg-[#333] text-white text-xs font-bold uppercase tracking-wider">
          <Plus className="w-4 h-4 mr-1.5" />Add Key
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-[#6B6558]" /></div>
      ) : credentials.length === 0 ? (
        <div className="text-center py-8 text-[#6B6558]">
          <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No Paystack buyer credentials saved yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {credentials.map((cred) => (
            <div key={cred.id} className="bg-[#F5F0E8] rounded-xl p-4 flex items-center justify-between border border-[#E8E2D8]">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-semibold text-[#0F0D0A]">{cred.label || 'Unnamed'}</p>
                  <Badge variant={cred.is_active ? 'default' : 'secondary'} className="text-xs"
                    style={cred.is_active ? { background: 'rgba(10,123,107,0.12)', color: '#0A7B6B' } : {}}>
                    {cred.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <p className="text-xs text-[#6B6558]">Added {new Date(cred.created_at).toLocaleDateString()}</p>
                {cred.balance !== undefined && (
                  <p className="text-xs text-[#0A7B6B] mt-1 font-medium">Balance: ₦{cred.balance?.toLocaleString()}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="sm" variant="ghost" onClick={() => checkStatus(cred.id)} disabled={cred.checking}
                        className="text-[#6B6558] hover:text-[#0F0D0A] hover:bg-[#E8E2D8]">
                        {cred.checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Check balance</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Button size="sm" variant="ghost" onClick={() => setDeleteConfirmId(cred.id)}
                  className="text-red-400 hover:text-red-500 hover:bg-red-50">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="bg-[#F5F0E8] border-[#C8C2B4] max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#0F0D0A]">Add Paystack Buyer Credential</DialogTitle>
            <DialogDescription className="text-[#6B6558]">
              Paystack Dashboard → Settings → API Keys & Webhooks → Secret Key
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-[#0F0D0A]">Label (Optional)</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. My Paystack Account" className="bg-white border-[#C8C2B4] text-[#0F0D0A]" />
            </div>
            <div className="space-y-2">
              <Label className="text-[#0F0D0A]">Secret Key</Label>
              <div className="relative">
                <Input type={showSecretKey ? 'text' : 'password'} value={secretKey} onChange={(e) => setSecretKey(e.target.value)}
                  placeholder="sk_test_... or sk_live_..." className="bg-white border-[#C8C2B4] text-[#0F0D0A] pr-10" />
                <button type="button" onClick={() => setShowSecretKey(!showSecretKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B6558] hover:text-[#0F0D0A]">
                  {showSecretKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {testResult && (
              <div className={`rounded-lg p-3 ${testResult.valid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                <div className="flex items-center gap-2">
                  {testResult.valid
                    ? <><CheckCircle2 className="w-4 h-4 text-green-600" /><p className="text-sm text-green-700">Valid credentials{testResult.balance !== undefined ? ` — Balance: ₦${testResult.balance?.toLocaleString()}` : ''}</p></>
                    : <><AlertCircle className="w-4 h-4 text-red-500" /><p className="text-sm text-red-600">Invalid credentials</p></>
                  }
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowAddDialog(false)} disabled={saving}>Cancel</Button>
            <Button onClick={saveCredential} disabled={saving || !secretKey.trim()} className="bg-[#0F0D0A] hover:bg-[#333] text-white">
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : 'Save Credential'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent className="bg-[#F5F0E8] border-[#C8C2B4]">
          <DialogHeader>
            <DialogTitle className="text-[#0F0D0A]">Delete Credential?</DialogTitle>
            <DialogDescription className="text-[#6B6558]">This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirmId && deleteCredential(deleteConfirmId)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PaystackBuyerCredentialManager;