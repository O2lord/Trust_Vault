// hooks/express/useTransactionMonitoring.ts
//
// Dual-path payment detection:
//
//  Path A — WebSocket (onAccountChange):
//    Fast, fires in ~1-2s. Works on desktop and most mobile browsers.
//    On Android, switching to Phantom/Backpack drops the WS connection so this
//    path silently dies — it never fires, pollingStartTime never gets set.
//
//  Path B — Independent HTTP polling (starts immediately, not gated on WS):
//    Polls /api/receipts/by-transaction every 3s from the moment startMonitoring
//    is called. Since pollingStartTime is captured at call-time (not at WS event
//    time), it keeps working even when the tab is background-throttled or the WS
//    drops. This is what saves Phantom and Backpack on Android.
//
//  Whichever path lands first wins. The other is cancelled.

import { useState, useCallback, useRef } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export type PaymentStatus =
  | 'idle'
  | 'detecting'
  | 'processing'
  | 'generating_receipt'
  | 'completed';

interface UseTransactionMonitoringReturn {
  paymentStatus: PaymentStatus;
  receiptId: string | null;
  startMonitoring: (trustExpressAddress: string) => () => void;
  stopMonitoring: () => void;
  resetStatus: () => void;
}

export function useTransactionMonitoring(): UseTransactionMonitoringReturn {
  const queryClient = useQueryClient();
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('idle');
  const [receiptId, setReceiptId] = useState<string | null>(null);

  const subscriptionIdRef  = useRef<number | null>(null);
  const wsIntervalRef      = useRef<NodeJS.Timeout | null>(null); // Path A WS poll interval
  const indIntervalRef     = useRef<NodeJS.Timeout | null>(null); // Path B independent poll interval
  const connectionRef      = useRef<Connection | null>(null);
  const completedRef       = useRef(false);

  // Legacy alias so stopMonitoring still works
  const pollIntervalRef = wsIntervalRef;

  const stopMonitoring = useCallback(() => {
    if (wsIntervalRef.current) { clearInterval(wsIntervalRef.current); wsIntervalRef.current = null; }
    if (indIntervalRef.current) { clearInterval(indIntervalRef.current); indIntervalRef.current = null; }
    if (subscriptionIdRef.current !== null && connectionRef.current) {
      connectionRef.current.removeAccountChangeListener(subscriptionIdRef.current).catch(() => {});
      subscriptionIdRef.current = null;
    }
    setPaymentStatus('idle');
  }, []);

  const resetStatus = useCallback(() => {
    stopMonitoring();
    setReceiptId(null);
    completedRef.current = false;
  }, [stopMonitoring]);

  // Recover from Fast Refresh / HMR remount — if complete() fired but the
  // component remounted before the 800ms timeout, read back from sessionStorage
  const recoverFromStorage = useCallback(() => {
    try {
      const stored = sessionStorage.getItem('trust-express:pending-receipt');
      if (!stored) return;
      const { id, ts } = JSON.parse(stored);
      // Only recover if it happened in the last 30 seconds
      if (Date.now() - ts < 30_000 && id) {
        console.log('[monitoring] Recovering completed receipt from sessionStorage:', id);
        sessionStorage.removeItem('trust-express:pending-receipt');
        setPaymentStatus('completed');
        setReceiptId(id);
      }
    } catch { /* ignore */ }
  }, []);

  const startMonitoring = useCallback(
    (trustExpressAddress: string): (() => void) => {
      completedRef.current = false;
      recoverFromStorage(); // check if a previous session completed during HMR

      const rpcUrl =
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||  // matches your .env
        process.env.NEXT_PUBLIC_RPC_URL ||          // fallback alias
        'https://api.devnet.solana.com';

      const connection = new Connection(rpcUrl);
      connectionRef.current = connection;

      const trustExpressPubkey = new PublicKey(trustExpressAddress);

      // Capture start time NOW — before the wallet even scans —
      // so polling is not gated on the WS event firing.
      // This is the key fix: old code set pollingStartTime inside the WS callback,
      // meaning if the WS dropped (Android), polling never started at all.
      const pollingStartTime = new Date().toISOString();

      setPaymentStatus('detecting');

      // ── Shared completion handler (called by whichever path wins) ─────────
      const complete = (id: string) => {
        console.log('[monitoring] complete() called with id:', id, '| already completed:', completedRef.current);
        if (completedRef.current) return;
        completedRef.current = true;

        // Clear BOTH intervals — WS path and independent path
        if (wsIntervalRef.current) { clearInterval(wsIntervalRef.current); wsIntervalRef.current = null; }
        if (indIntervalRef.current) { clearInterval(indIntervalRef.current); indIntervalRef.current = null; }
        if (subscriptionIdRef.current !== null) {
          connection.removeAccountChangeListener(subscriptionIdRef.current).catch(() => {});
          subscriptionIdRef.current = null;
        }

        // Set state immediately — no setTimeout delay.
        // The 800ms delay was decorative and caused state updates to be swallowed
        // if anything triggered a re-render in that window.
        setPaymentStatus('completed');
        setReceiptId(id);
        toast.success('Payment completed! View your receipt.');

        // Also write to sessionStorage as a backup for Fast Refresh remounts
        try {
          sessionStorage.setItem(
            'trust-express:pending-receipt',
            JSON.stringify({ id, trustExpressAddress, ts: Date.now() })
          );
          window.dispatchEvent(new Event('trust-express:complete'));
        } catch { /* sessionStorage unavailable */ }
      };

      // ── Path A: WebSocket account change listener ─────────────────────────
      // Fast when it works. On Android it silently drops when the app loses focus.
      let wsDetected = false;
      try {
        const subId = connection.onAccountChange(
          trustExpressPubkey,
          async () => {
            if (completedRef.current || wsDetected) return;
            wsDetected = true;

            setPaymentStatus('processing');
            queryClient.invalidateQueries({ queryKey: ['get-trust-express-accounts'] });
            toast.info('Transaction detected! Processing payout...');
            setPaymentStatus('generating_receipt');

            // WS fired — we know the tx landed, so poll aggressively (every 2s)
            // starting immediately rather than waiting 8s like before
            let wsPolls = 0;
            const WS_MAX_POLLS = 60; // 60 × 2s = 2 min

            wsIntervalRef.current = setInterval(async () => {
              wsPolls++;
              if (wsPolls >= WS_MAX_POLLS) {
                if (wsIntervalRef.current) clearInterval(wsIntervalRef.current);
                wsIntervalRef.current = null;
                if (!completedRef.current) {
                  setPaymentStatus('idle');
                  toast.info('Taking longer than expected. Check your receipts page.');
                }
                return;
              }
              try {
                const res = await fetch(
                  `/api/receipts/by-transaction?trustExpressAddress=${trustExpressAddress}&since=${pollingStartTime}`
                );
                if (!res.ok) return;
                const data = await res.json();
                console.log('[monitoring] WS-path poll result:', data?.id ?? 'no receipt yet');
                if (data?.id) {
                  if (wsIntervalRef.current) clearInterval(wsIntervalRef.current);
                  wsIntervalRef.current = null;
                  complete(data.id);
                }
              } catch { /* keep polling */ }
            }, 2000);
          },
          'confirmed'
        );
        subscriptionIdRef.current = subId;
      } catch (err) {
        console.warn('[monitoring] WebSocket subscription failed, relying on polling:', err);
      }

      // ── Path B: Independent polling — starts immediately, no WS dependency ──
      // Safety net for Phantom/Backpack on Android where the WS drops.
      // Polls every 3s after an initial 5s wait (bot needs time to process).
      // Because pollingStartTime was set above, this works even if Path A never fired.
      let indPolls    = 0;
      let indDetected = false;
      const IND_INITIAL_DELAY = 5000;  // wait 5s before first poll
      const IND_INTERVAL      = 3000;  // then every 3s
      const IND_MAX_POLLS     = 90;    // 90 × 3s = 4.5 min timeout

      const startIndependentPolling = () => {
        indIntervalRef.current = setInterval(async () => {
          if (completedRef.current) {
            if (indIntervalRef.current) clearInterval(indIntervalRef.current);
            return;
          }

          indPolls++;

          if (indPolls >= IND_MAX_POLLS) {
            if (indIntervalRef.current) {
              clearInterval(indIntervalRef.current);
              indIntervalRef.current = null;
            }
            if (!completedRef.current) {
              setPaymentStatus('idle');
              toast.info('Taking longer than expected. Check your receipts page.');
            }
            return;
          }

          try {
            const res = await fetch(
              `/api/receipts/by-transaction?trustExpressAddress=${trustExpressAddress}&since=${pollingStartTime}`
            );
            if (!res.ok) return;
            const data = await res.json();
            console.log(`[monitoring] Independent poll #${indPolls} result:`, data?.id ?? 'no receipt yet', '| completed:', completedRef.current);
            if (data?.id && !completedRef.current) {
              // WS hasn't shown processing states yet — show them briefly before completing
              if (!wsDetected && !indDetected) {
                indDetected = true;
                setPaymentStatus('generating_receipt');
                queryClient.invalidateQueries({ queryKey: ['get-trust-express-accounts'] });
              }
              complete(data.id);
            }
          } catch { /* keep polling */ }
        }, IND_INTERVAL);
      };

      const indDelayTimer = setTimeout(startIndependentPolling, IND_INITIAL_DELAY);

      // ── Cleanup ───────────────────────────────────────────────────────────
      return () => {
        clearTimeout(indDelayTimer);
        // Clear BOTH intervals — WS path and independent path
        if (wsIntervalRef.current) { clearInterval(wsIntervalRef.current); wsIntervalRef.current = null; }
        if (indIntervalRef.current) { clearInterval(indIntervalRef.current); indIntervalRef.current = null; }
        if (subscriptionIdRef.current !== null) {
          connection.removeAccountChangeListener(subscriptionIdRef.current).catch(() => {});
          subscriptionIdRef.current = null;
        }
        setPaymentStatus('idle');
      };
    },
    [queryClient, recoverFromStorage]
  );

  return {
    paymentStatus,
    receiptId,
    startMonitoring,
    stopMonitoring,
    resetStatus,
  };
}