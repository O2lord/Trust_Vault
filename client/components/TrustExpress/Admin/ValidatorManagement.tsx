// components/ValidatorManagement.tsx
'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  UserPlus,
  UserMinus,
  Settings2,
  Vote,
  AlertCircle,
  CheckCircle2,
  Copy,
  ShieldAlert,
  Coins,
  TrendingUp,
  Award,
} from "lucide-react";
import { PublicKey } from '@solana/web3.js';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useQuery } from '@tanstack/react-query';
import useAnchorProvider from '@/hooks/useAnchorProvider';
import { Program } from '@coral-xyz/anchor';
import { TrustVault as TrustExpress } from '@/relics/trust_express/trust_express';
import idl from '@/relics/trust_express/trust_express.json';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import useTrustExpress from '@/hooks/express/useTrustExpress';
import { toast } from 'sonner';
import { useMemo } from 'react';

interface ValidatorManagementProps {
  globalState?: any;
  onUpdate?: () => void;
}

// ─── API key reveal modal ──────────────────────────────────────────────────────

interface ApiKeyModalProps {
  apiKey: string;
  validatorPubkey: string;
  onClose: () => void;
}

function ApiKeyModal({ apiKey, validatorPubkey, onClose }: ApiKeyModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-yellow-500" />
            Save this API Key
          </DialogTitle>
          <DialogDescription>
            This key will <strong>never be shown again</strong>. Copy it now and
            give it to the validator operator to put in their <code>.env</code> file
            as <code>VALIDATOR_API_KEY</code>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Validator wallet
            </p>
            <p className="font-mono text-xs bg-muted px-3 py-2 rounded-md break-all">
              {validatorPubkey}
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              API Key
            </p>
            <div className="flex gap-2 items-center">
              <code className="flex-1 font-mono text-sm bg-muted px-3 py-2 rounded-md break-all select-all">
                {apiKey}
              </code>
              <Button
                size="icon"
                variant={copied ? 'default' : 'outline'}
                onClick={handleCopy}
                className="shrink-0"
              >
                {copied
                  ? <CheckCircle2 className="h-4 w-4" />
                  : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-md border border-yellow-400/40 bg-yellow-400/10 px-3 py-2 text-sm text-yellow-700 dark:text-yellow-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              This key grants the ability to query payment verification on behalf
              of this validator. Store it securely — it cannot be recovered.
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose} className="w-full">
            I&apos;ve saved the key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Per-validator earnings row ──────────────────────────────────────────────

function useValidatorEarningsData(validatorKey: PublicKey, mintAddress: string | null) {
  const { connection } = useConnection();
  const provider = useAnchorProvider();
  const program = useMemo(() => new Program<TrustExpress>(idl as TrustExpress, provider), [provider]);

  return useQuery({
    queryKey: ['admin-validator-earnings', validatorKey.toBase58(), mintAddress],
    enabled: !!mintAddress,
    staleTime: 20_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      if (!mintAddress) return null;
      const mintPubkey = new PublicKey(mintAddress);

      const [earningsPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('validator-earnings'), validatorKey.toBytes(), mintPubkey.toBytes()],
        program.programId
      );

      const [mintInfo, earningsInfo] = await connection.getMultipleAccountsInfo([mintPubkey, earningsPDA]);
      if (!mintInfo) return null;

      const decimals: number = mintInfo.data[44];
      const pow = Math.pow(10, decimals);

      if (!earningsInfo || earningsInfo.data.length < 8) {
        return { decimals, accumulated: 0, totalEarned: 0, totalCredits: 0, lastCreditedAt: null, initialized: false };
      }

      try {
        const decoded = program.account.validatorEarnings.coder.accounts.decode(
          'validatorEarnings', earningsInfo.data
        ) as any;
        return {
          decimals,
          accumulated: Number(decoded.accumulatedAmount.toString()) / pow,
          totalEarned: Number(decoded.totalEarned.toString()) / pow,
          totalCredits: Number(decoded.totalCredits.toString()),
          lastCreditedAt: Number(decoded.lastCreditedAt.toString()),
          initialized: true,
        };
      } catch {
        return { decimals, accumulated: 0, totalEarned: 0, totalCredits: 0, lastCreditedAt: null, initialized: false };
      }
    },
  });
}

function fmt(value: number): string {
  if (value === 0) return '0';
  if (value < 0.0001) return value.toPrecision(2);
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

interface ValidatorEarningsRowProps {
  validator: PublicKey;
  index: number;
  mintAddress: string | null;
}

function ValidatorEarningsRow({ validator, index, mintAddress }: ValidatorEarningsRowProps) {
  const { data, isLoading } = useValidatorEarningsData(validator, mintAddress);
  const addr = validator.toBase58();
  const short = `${addr.slice(0, 8)}...${addr.slice(-8)}`;

  return (
    <div className="p-4 border rounded-lg space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs shrink-0">#{index + 1}</Badge>
          <span className="font-mono text-xs">{short}</span>
        </div>
        {isLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : data?.initialized ? (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">Active</Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">No earnings yet</Badge>
        )}
      </div>

      {data?.initialized && (
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-md bg-orange-50 dark:bg-orange-950/30 border border-orange-200/50 p-2 space-y-0.5">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Coins className="h-3 w-3" />
              Claimable
            </div>
            <div className="font-bold text-orange-600 dark:text-orange-400 tabular-nums">
              {fmt(data.accumulated)}
            </div>
          </div>
          <div className="rounded-md bg-muted/40 p-2 space-y-0.5">
            <div className="flex items-center gap-1 text-muted-foreground">
              <TrendingUp className="h-3 w-3" />
              Lifetime
            </div>
            <div className="font-bold tabular-nums">{fmt(data.totalEarned)}</div>
          </div>
          <div className="rounded-md bg-muted/40 p-2 space-y-0.5">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Award className="h-3 w-3" />
              Votes
            </div>
            <div className="font-bold tabular-nums">{data.totalCredits.toLocaleString()}</div>
          </div>
        </div>
      )}

      {data?.initialized && data.lastCreditedAt && (
        <p className="text-xs text-muted-foreground">
          Last credited: {new Date(data.lastCreditedAt * 1000).toLocaleString()}
        </p>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ValidatorManagement({ globalState, onUpdate }: ValidatorManagementProps) {
  const { registerValidator, removeValidator, updateRequiredVotes, getTrustExpressAccounts } = useTrustExpress();
  const { publicKey } = useWallet();

  // Get mint address from any live vault for earnings lookup
  const mintAddress = useMemo<string | null>(() => {
    const accounts = getTrustExpressAccounts.data;
    if (!accounts || accounts.length === 0) return null;
    return (accounts[0].account as any).mint.toString();
  }, [getTrustExpressAccounts.data]);

  const [newValidatorAddress, setNewValidatorAddress] = useState('');
  const [newValidatorLabel, setNewValidatorLabel] = useState('');
  const [removeValidatorAddress, setRemoveValidatorAddress] = useState('');
  const [requiredVotes, setRequiredVotes] = useState(
    globalState?.requiredVotes?.toString() || '3'
  );
  const [isRegistering, setIsRegistering] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isUpdatingVotes, setIsUpdatingVotes] = useState(false);

  const [revealedApiKey, setRevealedApiKey] = useState<string | null>(null);
  const [revealedPubkey, setRevealedPubkey] = useState<string>('');

  const validators: PublicKey[] =
    globalState?.validators?.slice(0, globalState?.validatorCount || 0) || [];

  // ── Register ──────────────────────────────────────────────────────────────

  const handleRegisterValidator = async () => {
    if (!publicKey) {
      toast.error('Connect your wallet first');
      return;
    }

    try {
      setIsRegistering(true);
      const pubkey = new PublicKey(newValidatorAddress);

      // 1. Register on-chain — Anchor enforces authority via has_one constraint
      const txSignature = await registerValidator(pubkey);

      // 2. Sync to Supabase — server verifies txSignature + on-chain authority
      const res = await fetch('/api/admin/register-validator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminPubkey: publicKey.toBase58(),
          validatorPubkey: newValidatorAddress,
          label: newValidatorLabel.trim() || undefined,
          txSignature,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to register in Supabase');

      // 3. Show the API key modal — onUpdate called when dismissed
      setRevealedPubkey(newValidatorAddress);
      setRevealedApiKey(data.apiKey);

      setNewValidatorAddress('');
      setNewValidatorLabel('');
    } catch (error) {
      console.error('Error registering validator:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to register validator');
    } finally {
      setIsRegistering(false);
    }
  };

  // ── Remove ────────────────────────────────────────────────────────────────

  const handleRemoveValidator = async () => {
    if (!publicKey) {
      toast.error('Connect your wallet first');
      return;
    }

    try {
      setIsRemoving(true);
      const pubkey = new PublicKey(removeValidatorAddress);

      // 1. Remove on-chain
      const txSignature = await removeValidator(pubkey);

      // 2. Deactivate in Supabase — server verifies txSignature + on-chain authority
      const res = await fetch('/api/admin/remove-validator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminPubkey: publicKey.toBase58(),
          validatorToRemove: removeValidatorAddress,
          txSignature,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to deactivate in Supabase');

      if (data.warning) {
        toast.warning(data.warning);
      } else {
        toast.success('Validator removed and API key revoked');
      }

      setRemoveValidatorAddress('');
      onUpdate?.();
    } catch (error) {
      console.error('Error removing validator:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to remove validator');
    } finally {
      setIsRemoving(false);
    }
  };

  // ── Update vote threshold ─────────────────────────────────────────────────

  const handleUpdateRequiredVotes = async () => {
    try {
      setIsUpdatingVotes(true);
      const votes = parseInt(requiredVotes);
      if (isNaN(votes) || votes < 1 || votes > 5) {
        toast.error('Required votes must be between 1 and 5');
        return;
      }
      await updateRequiredVotes(votes);
      toast.success('Required votes threshold updated');
      onUpdate?.();
    } catch (error) {
      console.error('Error updating required votes:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update required votes');
    } finally {
      setIsUpdatingVotes(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {revealedApiKey && (
        <ApiKeyModal
          apiKey={revealedApiKey}
          validatorPubkey={revealedPubkey}
          onClose={() => {
            setRevealedApiKey(null);
            onUpdate?.();
          }}
        />
      )}

      <div className="space-y-6">
        {!publicKey && (
          <div className="flex items-center gap-2 rounded-md border border-yellow-400/40 bg-yellow-400/10 px-3 py-2 text-sm text-yellow-700 dark:text-yellow-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Connect your authority wallet to manage validators.</span>
          </div>
        )}

        {/* Validator Roster */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Vote className="h-5 w-5" />
              Validator Registry
            </CardTitle>
            <CardDescription>
              {validators.length} / 5 validators registered &nbsp;·&nbsp;
              Threshold: {globalState?.requiredVotes || '–'} votes required
            </CardDescription>
          </CardHeader>
          <CardContent>
            {validators.length > 0 ? (
              <div className="space-y-2">
                {validators.map((v: PublicKey, i: number) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 bg-muted rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">#{i + 1}</Badge>
                      <span className="font-mono text-xs break-all">{v.toBase58()}</span>
                    </div>
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300 shrink-0">
                      Active
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground text-sm">
                No validators registered yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Register Validator */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Register Validator
            </CardTitle>
            <CardDescription>
              Add a new validator to the trusted set (max 5). An API key will be
              generated and shown once.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="new-validator">Validator Public Key</Label>
              <Input
                id="new-validator"
                value={newValidatorAddress}
                onChange={(e) => setNewValidatorAddress(e.target.value)}
                placeholder="Solana wallet address"
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-validator-label">
                Label <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="new-validator-label"
                value={newValidatorLabel}
                onChange={(e) => setNewValidatorLabel(e.target.value)}
                placeholder="e.g. Validator Node 1"
                maxLength={100}
              />
            </div>
            <Button
              onClick={handleRegisterValidator}
              disabled={isRegistering || !newValidatorAddress || !publicKey || validators.length >= 5}
              className="w-full"
            >
              {isRegistering ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Registering...</>
              ) : (
                <><UserPlus className="mr-2 h-4 w-4" />Register Validator</>
              )}
            </Button>
            {validators.length >= 5 && (
              <p className="text-sm text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                Maximum of 5 validators reached. Remove one before adding another.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Remove Validator */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserMinus className="h-5 w-5" />
              Remove Validator
            </CardTitle>
            <CardDescription>
              Revokes voting rights on-chain and immediately invalidates the
              validator&apos;s API key.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="remove-validator">Validator Public Key</Label>
              <div className="flex gap-2">
                <Input
                  id="remove-validator"
                  value={removeValidatorAddress}
                  onChange={(e) => setRemoveValidatorAddress(e.target.value)}
                  placeholder="Validator wallet address to remove"
                  className="font-mono text-sm"
                />
                <Button
                  variant="destructive"
                  onClick={handleRemoveValidator}
                  disabled={isRemoving || !removeValidatorAddress || !publicKey}
                >
                  {isRemoving ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Removing...</>
                  ) : (
                    <><UserMinus className="mr-2 h-4 w-4" />Remove</>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Required Votes Threshold */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Vote Threshold
            </CardTitle>
            <CardDescription>
              Minimum votes needed to execute a disputed payout (1–5)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="required-votes">Required Votes</Label>
              <div className="flex gap-2">
                <Input
                  id="required-votes"
                  type="number"
                  min="1"
                  max="5"
                  value={requiredVotes}
                  onChange={(e) => setRequiredVotes(e.target.value)}
                  className="w-32"
                />
                <Button
                  onClick={handleUpdateRequiredVotes}
                  disabled={isUpdatingVotes || !publicKey}
                >
                  {isUpdatingVotes ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating...</>
                  ) : (
                    'Update'
                  )}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Current threshold:{' '}
                <strong>{globalState?.requiredVotes || '–'}</strong> of{' '}
                <strong>{globalState?.validatorCount || 0}</strong> validators
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Active Validator Votes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Vote className="h-5 w-5" />
              Active Dispute Votes
            </CardTitle>
            <CardDescription>
              Pending validator vote accounts — finalize expired ones to reclaim rent
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Validator Earnings Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5" />
              Validator Earnings
            </CardTitle>
            <CardDescription>
              Claimable balance, lifetime earned, and vote credits per validator
              {!mintAddress && ' — no active vaults found to determine mint'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {validators.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-sm">
                No validators registered yet
              </div>
            ) : (
              <div className="space-y-3">
                {validators.map((v: PublicKey, i: number) => (
                  <ValidatorEarningsRow
                    key={v.toBase58()}
                    validator={v}
                    index={i}
                    mintAddress={mintAddress}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}