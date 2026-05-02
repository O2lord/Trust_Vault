// hooks/useProcessorBanks.ts
//
// Detects which payment processor the buyer (escrow) uses, then fetches the
// correct bank list and provides an account-verification function.
//
// Usage:
//   const { banks, loading, verifyAccount, processor } = useProcessorBanks({
//     trustExpressPda: order.publicKey.toBase58(),
//     currency: 'NGN',
//   });

import { useState, useEffect, useCallback } from 'react';

export type Processor = 'flutterwave' | 'paystack' | 'opay' | 'korapay';

export interface Bank {
  id: number;
  code: string;
  name: string;
}

export interface VerifyAccountResult {
  success: boolean;
  account_name?: string;
  account_number?: string;
  is_test_mode?: boolean;
  error?: string;
}

interface UseProcessorBanksOptions {
  trustExpressPda: string | null;
  currency?: string;   // e.g. 'NGN'
}

interface UseProcessorBanksResult {
  processor: Processor | null;
  banks: Bank[];
  loading: boolean;
  error: string | null;
  verifyAccount: (accountNumber: string, bankCode: string) => Promise<VerifyAccountResult>;
}

// ─── Processor → API paths ───────────────────────────────────────────────────

function banksUrl(processor: Processor, currency: string): string {
  switch (processor) {
    case 'paystack':
      return `/api/payment-processors/paystack/banks?currency=${currency}`;
      case 'korapay':
      return `/api/payment-processors/korapay/banks?country=NG`;
    case 'opay':
      // OPay uses Flutterwave's bank list for NG (same NUBAN codes)
      return `/api/flutterwave/banks?country=NG`;
    default:
      return `/api/flutterwave/banks?country=NG`;
  }
}

function verifyUrl(processor: Processor): string {
  switch (processor) {
    case 'paystack':
      return '/api/payment-processors/paystack/verify-account';
      case 'korapay':
      return '/api/payment-processors/korapay/verify-account';
    case 'opay':
      return '/api/flutterwave/verify-account';
    default:
      return '/api/flutterwave/verify-account';
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useProcessorBanks({
  trustExpressPda,
  currency = 'NGN',
}: UseProcessorBanksOptions): UseProcessorBanksResult {
  const [processor, setProcessor] = useState<Processor | null>(null);
  const [banks, setBanks]         = useState<Bank[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // Step 1: detect processor for this escrow
  useEffect(() => {
    if (!trustExpressPda) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res  = await fetch(`/api/payment-processors?trust_express_pda=${trustExpressPda}`);
        const data = await res.json() as { processor?: Processor; error?: string };

        if (cancelled) return;

        if (!res.ok || !data.processor) {
          setProcessor('flutterwave'); // safe fallback
        } else {
          setProcessor(data.processor);
        }
      } catch {
        if (!cancelled) setProcessor('flutterwave');
      }
    })();

    return () => { cancelled = true; };
  }, [trustExpressPda]);

  // Step 2: fetch banks once we know the processor
  useEffect(() => {
    if (!processor) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res  = await fetch(banksUrl(processor, currency));
        const data = await res.json() as { success?: boolean; banks?: Bank[]; error?: string };

        if (cancelled) return;

        if (!res.ok || !data.success) {
          setError(data.error ?? 'Failed to fetch banks');
          setBanks([]);
        } else {
          setBanks(data.banks ?? []);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to fetch banks');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [processor, currency]);

  // Step 3: account verification — uses the processor-specific endpoint
  const verifyAccount = useCallback(
    async (accountNumber: string, bankCode: string): Promise<VerifyAccountResult> => {
      if (!processor) return { success: false, error: 'Processor not yet resolved' };

      try {
        const res = await fetch(verifyUrl(processor), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account_number: accountNumber, account_bank: bankCode }),
        });
        const data = await res.json() as VerifyAccountResult;
        return data;
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Verification failed' };
      }
    },
    [processor]
  );

  return { processor, banks, loading, error, verifyAccount };
}