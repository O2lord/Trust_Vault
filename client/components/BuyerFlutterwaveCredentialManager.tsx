import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, Plus, Trash2, RefreshCw, Shield, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import bs58 from 'bs58';

interface Credential {
  id: string;
  label: string | null;
  created_at: string;
  is_active: boolean;
}

interface CredentialWithBalance extends Credential {
  balance?: number;
  currency?: string;
  checking?: boolean;
}

const BuyerFlutterwaveCredentialManager = () => {
  const { publicKey, signMessage } = useWallet();
  const [credentials, setCredentials] = useState<CredentialWithBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  // Form state
  const [secretKey, setSecretKey] = useState('');
  const [label, setLabel] = useState('');
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ 
    valid: boolean; 
    balance?: number; 
    currency?: string;
  } | null>(null);

  // Load credentials on mount
  useEffect(() => {
    if (publicKey) {
      fetchCredentials();
    }
  }, [publicKey]);

  const generateAuthMessage = (action: string) => {
    const timestamp = Date.now();
    const nonce = Math.random().toString(36).substring(2, 15);
    return `Sign this message to authenticate with TrustExpress.\n\nAction: ${action}\nTimestamp: ${timestamp}\nNonce: ${nonce}\n\nThis signature will not cost any gas fees.`;
  };

  const signAuthMessage = async (message: string) => {
    if (!signMessage || !publicKey) {
      throw new Error('Wallet not connected');
    }
    const messageBytes = new TextEncoder().encode(message);
    const signature = await signMessage(messageBytes);
    return bs58.encode(signature);
  };

  // Fetch buyer credentials
  const fetchCredentials = async () => {
    if (!publicKey) return;
    
    setLoading(true);
    try {
      const params = new URLSearchParams({
        walletAddress: publicKey.toBase58(),
      });

      const response = await fetch(`/api/flutterwave/buyer-credentials/list?${params}`);
      const data = await response.json();

      if (response.ok) {
        setCredentials(data.credentials || []);
      } else {
        toast.error(data.error || 'Failed to fetch credentials');
      }
    } catch (error) {
      console.error('Error fetching credentials:', error);
      toast.error('Failed to fetch credentials');
    } finally {
      setLoading(false);
    }
  };

  // Test connection (verify key is valid)
  const testConnection = async () => {
    if (!secretKey.trim()) {
      toast.error('Please enter a secret key');
      return;
    }

    setTestingConnection(true);
    setTestResult(null);

    try {
      // Use the platform's verify endpoint
      const params = new URLSearchParams({ secretKey: secretKey.trim() });
      const response = await fetch(`/api/flutterwave/credentials/verify?${params}`);
      const data = await response.json();

      if (response.ok && data.valid) {
        setTestResult({ 
          valid: true, 
          balance: data.balance, 
          currency: data.currency 
        });
        toast.success('Credentials verified successfully!');
      } else {
        setTestResult({ valid: false });
        toast.error(data.message || 'Invalid credentials');
      }
    } catch (error) {
      console.error('Error testing connection:', error);
      setTestResult({ valid: false });
      toast.error('Failed to verify credentials');
    } finally {
      setTestingConnection(false);
    }
  };

  // Save credential
  const saveCredential = async () => {
    if (!publicKey || !signMessage) {
      toast.error('Please connect your wallet');
      return;
    }

    if (!secretKey.trim()) {
      toast.error('Please enter a secret key');
      return;
    }

    setSaving(true);
    try {
      const message = generateAuthMessage('store_buyer_credentials');
      const signature = await signAuthMessage(message);

      const response = await fetch('/api/flutterwave/buyer-credentials/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: publicKey.toBase58(),
          secretKey: secretKey.trim(),
          signature,
          message,
          label: label.trim() || null,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success('Buyer credentials saved successfully!');
        setShowAddDialog(false);
        setSecretKey('');
        setLabel('');
        setTestResult(null);
        fetchCredentials();
      } else {
        toast.error(data.error || 'Failed to save credentials');
      }
    } catch (error) {
      console.error('Error saving credentials:', error);
      toast.error('Failed to save credentials');
    } finally {
      setSaving(false);
    }
  };

  // Delete credential
  const deleteCredential = async (credentialId: string) => {
    if (!publicKey || !signMessage) return;

    try {
      const message = generateAuthMessage('delete_buyer_credential');
      const signature = await signAuthMessage(message);

      const params = new URLSearchParams({
        credentialId,
        walletAddress: publicKey.toBase58(),
        signature,
        message,
      });

      const response = await fetch(`/api/flutterwave/buyer-credentials/delete?${params}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success('Credential deleted successfully');
        setDeleteConfirmId(null);
        fetchCredentials();
      } else {
        toast.error(data.error || 'Failed to delete credential');
      }
    } catch (error) {
      console.error('Error deleting credential:', error);
      toast.error('Failed to delete credential');
    }
  };

  // Check credential status
  const checkStatus = async (credentialId: string) => {
    if (!publicKey) return;

    setCredentials(prev => prev.map(c => 
      c.id === credentialId ? { ...c, checking: true } : c
    ));

    try {
      const params = new URLSearchParams({
        credentialId,
        walletAddress: publicKey.toBase58(),
      });

      const response = await fetch(`/api/flutterwave/buyer-credentials/status?${params}`);
      const data = await response.json();

      if (response.ok) {
        setCredentials(prev => prev.map(c => 
          c.id === credentialId 
            ? { 
                ...c, 
                checking: false,
                is_active: data.valid,
                balance: data.balance,
                currency: data.currency 
              } 
            : c
        ));

        if (data.valid) {
          toast.success(`Credential is valid${data.balance !== undefined ? ` - Balance: ${data.balance} ${data.currency}` : ''}`);
        } else {
          toast.error('Credential is invalid or expired');
        }
      } else {
        toast.error(data.error || 'Failed to check credential status');
        setCredentials(prev => prev.map(c => 
          c.id === credentialId ? { ...c, checking: false } : c
        ));
      }
    } catch (error) {
      console.error('Error checking credential status:', error);
      toast.error('Failed to check credential status');
      setCredentials(prev => prev.map(c => 
        c.id === credentialId ? { ...c, checking: false } : c
      ));
    }
  };

  return (
    <div className="space-y-4">
      <Card className="bg-[#F5F0E8] border-[#C8C2B4]">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-green-500/10 p-2 rounded-lg">
                <ShoppingCart className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <CardTitle className="text-[#0F0D0A]">Buyer Payment Processor Credentials</CardTitle>
                <CardDescription className="text-[#6B6558]">
                  Manage your Payment Processor API credentials securely
                </CardDescription>
              </div>
            </div>
            <Button 
              onClick={() => setShowAddDialog(true)} 
              size="sm"
              className="bg-green-600 hover:bg-green-700"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Credential
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-blue-900/50 border border-blue-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-blue-200">Secure Storage</p>
                <p className="text-xs text-blue-300">
                  Your credentials are encrypted using AES-256-GCM and stored securely. They are only decrypted when processing seller payouts.
                </p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-[#6B6558]" />
            </div>
          ) : credentials.length === 0 ? (
            <div className="text-center py-8 text-[#6B6558]">
              <Shield className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No credentials saved yet</p>
              <p className="text-sm">Add your Payment Processor secret key to process seller payments</p>
            </div>
          ) : (
            <div className="space-y-3">
              {credentials.map((credential) => (
                <div key={credential.id} className="bg-[#EDE8DF] rounded-lg p-4 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-[#0F0D0A] font-medium">
                        {credential.label || 'Unnamed Credential'}
                      </p>
                      <Badge variant={credential.is_active ? 'default' : 'secondary'} className="text-xs">
                        {credential.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-400">
                      Created: {new Date(credential.created_at).toLocaleDateString()}
                    </p>
                    {credential.balance !== undefined && (
                      <p className="text-xs text-green-400 mt-1">
                        Balance: {credential.balance} {credential.currency}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => checkStatus(credential.id)}
                            disabled={credential.checking}
                            className="text-blue-400 hover:text-blue-300 hover:bg-blue-900/50"
                          >
                            {credential.checking ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <RefreshCw className="w-4 h-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Check status & balance</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteConfirmId(credential.id)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-900/50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Credential Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="bg-[#F5F0E8] border-[#C8C2B4] max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#0F0D0A]">Add Buyer Payment Processor Credential</DialogTitle>
            <DialogDescription className="text-[#6B6558]">
              Enter your Payment Processor secret key to enable seller payment processing for buy orders
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="label" className="text-[#0F0D0A]">Label (Optional)</Label>
              <Input
                id="label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g., My Flutterwave Account"
                className="bg-[#FFFFFF] border-[#C8C2B4] text-[#0F0D0A]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="secretKey" className="text-[#0F0D0A]">Secret Key</Label>
              <div className="relative">
                <Input
                  id="secretKey"
                  type={showSecretKey ? 'text' : 'password'}
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  placeholder="FLWSECK_TEST-..."
                  className="bg-[#FFFFFF] border-[#C8C2B4] text-[#0F0D0A] pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowSecretKey(!showSecretKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B6558] hover:text-[#0F0D0A]"
                >
                  {showSecretKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-500">
                Find this in: Flutterwave Dashboard → Settings → API Keys
              </p>
            </div>
            <Button
              onClick={testConnection}
              disabled={testingConnection || !secretKey.trim()}
              variant="outline"
              className="w-full"
            >
              {testingConnection ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                'Test Connection'
              )}
            </Button>
            {testResult && (
              <div className={`rounded-lg p-3 ${testResult.valid ? 'bg-green-900/50 border border-green-800' : 'bg-red-900/50 border border-red-800'}`}>
                <div className="flex items-center gap-2">
                  {testResult.valid ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                      <div>
                        <p className="text-sm text-green-200">Valid credentials</p>
                        {testResult.balance !== undefined && (
                          <p className="text-xs text-green-300">Balance: {testResult.balance} {testResult.currency}</p>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4 text-red-400" />
                      <p className="text-sm text-red-200">Invalid credentials</p>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowAddDialog(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveCredential} disabled={saving || !secretKey.trim()} className="bg-green-600 hover:bg-green-700">
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Credential'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent className="bg-[#F5F0E8] border-[#C8C2B4]">
          <DialogHeader>
            <DialogTitle className="text-[#0F0D0A]">Delete Credential?</DialogTitle>
            <DialogDescription className="text-[#6B6558]">
              This action cannot be undone. Make sure this credential is not being used by any active buy orders.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && deleteCredential(deleteConfirmId)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BuyerFlutterwaveCredentialManager;