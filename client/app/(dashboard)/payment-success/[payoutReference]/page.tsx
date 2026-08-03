'use client';

import React, { useEffect, useState, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, XCircle, Loader2, Receipt, ExternalLink, AlertCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface PaymentSuccessPageProps {
  params: Promise<{
    payoutReference: string;
  }>;
}

type ConfirmationStatus = 'loading' | 'success' | 'failed' | 'invalid' | 'already_processed';

interface ConfirmationResult {
  success: boolean;
  message: string;
  transactionSignature?: string;
  tokenAmount?: string;
  fiatAmount?: string;
  currency?: string;
  processingTime?: string;
  alreadyProcessed?: boolean;
}

const PaymentSuccessPage: React.FC<PaymentSuccessPageProps> = ({ params }) => {
  const router = useRouter();
  const searchParams = useSearchParams();

  // FIXED: Unwrap async params with React.use()
  const { payoutReference } = use(params);

  const [status, setStatus] = useState<ConfirmationStatus>('loading');
  const [result, setResult] = useState<ConfirmationResult | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 3;

  // Receipt lookup — resolves payoutReference -> the receipt's actual DB id
  // via /api/receipts/by-reference/[reference]. The receipt row is created
  // asynchronously by the validators, so this polls for a bit after success.
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [receiptLookup, setReceiptLookup] = useState<'idle' | 'polling' | 'found' | 'not_found'>('idle');
  const RECEIPT_POLL_ATTEMPTS = 10;
  const RECEIPT_POLL_INTERVAL_MS = 3000;

  // Extract Flutterwave parameters from URL
  const flutterwaveStatus = searchParams.get('status');
  const txRef = searchParams.get('tx_ref');
  const transactionId = searchParams.get('transaction_id');

  // Extract OPay parameters from URL
  const opayStatus = searchParams.get('status'); // SUCCESS | FAIL | CLOSE
  const orderNo = searchParams.get('orderNo');

  // Detect which processor redirected here
  // OPay sends: ?status=SUCCESS&orderNo=xxx  (no tx_ref / transaction_id)
  // Flutterwave sends: ?status=completed&tx_ref=xxx&transaction_id=xxx
  const isOpay = !!orderNo || (opayStatus === 'SUCCESS' && !txRef);

  const confirmPayment = async () => {
    if (isOpay) {
      // ── OPay path ──────────────────────────────────────────────────────
      // OPay already called our webhook which updated payment_links to 'completed'.
      // Validators are polling verify-payment and will cast their votes.
      // We just need to show the right state based on the status param.
      if (opayStatus === 'SUCCESS') {
        setStatus('success');
        setResult({
          success: true,
          message:
            'Payment received via OPay! Validators are confirming your transaction. Tokens will be released to your wallet automatically within 30 seconds.',
        });
      } else if (opayStatus === 'FAIL' || opayStatus === 'CLOSE') {
        setStatus('failed');
        setResult({
          success: false,
          message: `OPay payment ${opayStatus === 'CLOSE' ? 'was cancelled or timed out' : 'failed'}. No funds have been deducted.`,
        });
      } else {
        // No status param — user may have navigated here directly
        setStatus('success');
        setResult({
          success: true,
          message:
            'If your payment was completed, validators are confirming it now. Tokens will be released to your wallet automatically within 30 seconds.',
        });
      }
      return;
    }

    // ── Flutterwave path (existing logic) ────────────────────────────────
    if (!flutterwaveStatus || !txRef || !transactionId) {
      setStatus('invalid');
      setResult({ success: false, message: 'Missing payment parameters.' });
      return;
    }

    if (flutterwaveStatus !== 'completed') {
      setStatus('failed');
      setResult({ success: false, message: `Payment not completed. Status: ${flutterwaveStatus}` });
      return;
    }

    // Payment is done on Flutterwave's side.
    // Validators will verify and release tokens automatically via on-chain voting.
    setStatus('success');
    setResult({
      success: true,
      message:
        'Payment received! Validators are confirming your transaction. Tokens will be released to your wallet automatically within 30 seconds.',
    });
  };

  useEffect(() => {
    confirmPayment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once payment is confirmed, look up the receipt row by payout reference.
  // The row may not exist the instant we land here, so retry for a bit.
  useEffect(() => {
    if (status !== 'success' && status !== 'already_processed') return;
    if (receiptId) return;

    let cancelled = false;
    let attempts = 0;

    const fetchReceiptId = async (): Promise<string | null> => {
      try {
        const res = await fetch(`/api/receipts/by-reference/${payoutReference}`);
        if (!res.ok) return null;
        const data = await res.json();
        return data?.id ?? null;
      } catch {
        return null;
      }
    };

    setReceiptLookup('polling');

    const poll = async () => {
      const id = await fetchReceiptId();
      if (cancelled) return;

      if (id) {
        setReceiptId(id);
        setReceiptLookup('found');
        return;
      }

      attempts += 1;
      if (attempts >= RECEIPT_POLL_ATTEMPTS) {
        setReceiptLookup('not_found');
        return;
      }
      setTimeout(poll, RECEIPT_POLL_INTERVAL_MS);
    };

    poll();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const handleViewReceipt = () => {
    if (receiptId) {
      router.push(`/receipts/${receiptId}`);
    }
  };

  const handleViewTransaction = () => {
    if (result?.transactionSignature) {
      const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
      const explorerUrl = `https://explorer.solana.com/tx/${result.transactionSignature}?cluster=${network}`;
      window.open(explorerUrl, '_blank');
    }
  };

  const handleRetry = () => {
    setStatus('loading');
    setRetryCount(0);
    confirmPayment();
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-card border-border">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {status === 'loading' && (
              <div className="relative">
                <Loader2 className="w-16 h-16 text-primary animate-spin" />
                {retryCount > 0 && (
                  <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-xs text-muted-foreground whitespace-nowrap">
                    Retry {retryCount}/{MAX_RETRIES}
                  </div>
                )}
              </div>
            )}
            {(status === 'success' || status === 'already_processed') && (
              <CheckCircle className="w-16 h-16 text-green-600" />
            )}
            {status === 'failed' && <XCircle className="w-16 h-16 text-destructive" />}
            {status === 'invalid' && <AlertCircle className="w-16 h-16 text-yellow-600" />}
          </div>

          <CardTitle className="text-foreground text-xl">
            {status === 'loading' && 'Processing Payment...'}
            {status === 'success' && 'Payment Successful!'}
            {status === 'already_processed' && 'Already Processed'}
            {status === 'failed' && 'Payment Failed'}
            {status === 'invalid' && 'Invalid Payment'}
          </CardTitle>

          <CardDescription className="text-muted-foreground break-all">
            Reference: {payoutReference}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {status === 'loading' && (
            <div className="text-center text-foreground space-y-2">
              <p>Confirming your payment with Flutterwave...</p>
              <p className="text-sm text-muted-foreground">
                Please wait while we release your tokens on the blockchain.
              </p>
              {retryCount > 0 && (
                <Alert className="panel">
                  <Clock className="h-4 w-4" />
                  <AlertDescription className="text-foreground text-sm">
                    Network is busy. Retrying automatically...
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {status === 'success' && result && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-green-800 text-sm">{result.message}</p>
              </div>

              {(result.tokenAmount || result.fiatAmount) && (
                <div className="panel p-4 space-y-2">
                  <h3 className="text-foreground font-medium mb-3">Transaction Details</h3>
                  {result.tokenAmount && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tokens Received:</span>
                      <span className="text-foreground font-medium">{result.tokenAmount}</span>
                    </div>
                  )}
                  {result.fiatAmount && result.currency && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Amount Paid:</span>
                      <span className="text-foreground font-medium">
                        {result.currency} {result.fiatAmount}
                      </span>
                    </div>
                  )}
                  {result.processingTime && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Processing Time:</span>
                      <span className="text-foreground font-medium">{result.processingTime}</span>
                    </div>
                  )}
                </div>
              )}

              {result.transactionSignature && (
                <Button onClick={handleViewTransaction} variant="outline" className="w-full">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View on Solana Explorer
                </Button>
              )}
            </div>
          )}

          {status === 'already_processed' && result && (
            <div className="space-y-4">
              <Alert className="panel">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-foreground text-sm">{result.message}</AlertDescription>
              </Alert>

              <div className="panel p-4">
                <h3 className="text-foreground font-medium mb-2">What this means:</h3>
                <ul className="text-sm text-foreground/80 space-y-1">
                  <li>• Your payment was already confirmed</li>
                  <li>• Tokens have been released to your wallet</li>
                  <li>• No further action is required</li>
                </ul>
              </div>
            </div>
          )}

          {(status === 'failed' || status === 'invalid') && result && (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800 text-sm">{result.message}</p>
              </div>

              <div className="panel p-4">
                <h3 className="text-foreground font-medium mb-2">What to do next:</h3>
                <ul className="text-sm text-foreground/80 space-y-1">
                  <li>
                    • Save your payment reference:{' '}
                    <span className="text-foreground font-mono text-xs break-all">{payoutReference}</span>
                  </li>
                  <li>• Contact support with this reference</li>
                  <li>• Check your payment method was charged</li>
                  <li>• Do not make another payment</li>
                </ul>
              </div>

              {retryCount < MAX_RETRIES && (
                <Button onClick={handleRetry} variant="outline" className="w-full">
                  Try Again
                </Button>
              )}

              <Button onClick={() => router.push('/express')} variant="default" className="w-full">
                Back to Trust Express
              </Button>
            </div>
          )}

          {(status === 'success' || status === 'already_processed') && (
            <div className="pt-4 border-t border-border">
              {receiptLookup === 'found' && (
                <Button onClick={handleViewReceipt} variant="default" className="w-full">
                  <Receipt className="w-4 h-4 mr-2" />
                  View Receipt
                </Button>
              )}

              {receiptLookup === 'polling' && (
                <Button variant="default" className="w-full" disabled>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Preparing Receipt...
                </Button>
              )}

              {(receiptLookup === 'idle' || receiptLookup === 'not_found') && (
                <Button
                  onClick={() => router.push('/receipts')}
                  variant="outline"
                  className="w-full"
                >
                  <Receipt className="w-4 h-4 mr-2" />
                  {receiptLookup === 'not_found' ? "Can't find it yet — view all receipts" : 'View Receipts'}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentSuccessPage;