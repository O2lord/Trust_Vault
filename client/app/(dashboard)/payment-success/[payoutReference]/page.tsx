'use client';

import React, { useEffect, useState, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, XCircle, Loader2, ArrowLeft, ExternalLink, AlertCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

  // Extract Flutterwave parameters from URL
  const flutterwaveStatus = searchParams.get('status');
  const txRef = searchParams.get('tx_ref');
  const transactionId = searchParams.get('transaction_id');

  // Extract OPay parameters from URL
  const opayStatus  = searchParams.get('status');   // SUCCESS | FAIL | CLOSE
  const orderNo     = searchParams.get('orderNo');

  // Detect which processor redirected here
  // OPay sends: ?status=SUCCESS&orderNo=xxx  (no tx_ref / transaction_id)
  // Flutterwave sends: ?status=completed&tx_ref=xxx&transaction_id=xxx
  const isOpay = !!orderNo || (opayStatus === 'SUCCESS' && !txRef);

 // Replace the entire confirmPayment() function with this:
const confirmPayment = async () => {
  if (isOpay) {
    // ── OPay path ──────────────────────────────────────────────────────────
    // OPay already called our webhook which updated payment_links to 'completed'.
    // Validators are polling verify-payment and will cast their votes.
    // We just need to show the right state based on the status param.
    if (opayStatus === 'SUCCESS') {
      setStatus('success');
      setResult({
        success: true,
        message: 'Payment received via OPay! Validators are confirming your transaction. Tokens will be released to your wallet automatically within 30 seconds.',
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
        message: 'If your payment was completed, validators are confirming it now. Tokens will be released to your wallet automatically within 30 seconds.',
      });
    }
    return;
  }

  // ── Flutterwave path (existing logic) ──────────────────────────────────
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
    message: 'Payment received! Validators are confirming your transaction. Tokens will be released to your wallet automatically within 30 seconds.',
  });
};

  useEffect(() => {
    confirmPayment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBackToApp = () => {
    router.push('/express');
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
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-gray-800 border-gray-700">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {status === 'loading' && (
              <div className="relative">
                <Loader2 className="w-16 h-16 text-blue-400 animate-spin" />
                {retryCount > 0 && (
                  <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-xs text-gray-400 whitespace-nowrap">
                    Retry {retryCount}/{MAX_RETRIES}
                  </div>
                )}
              </div>
            )}
            {(status === 'success' || status === 'already_processed') && (
              <CheckCircle className="w-16 h-16 text-green-400" />
            )}
            {status === 'failed' && (
              <XCircle className="w-16 h-16 text-red-400" />
            )}
            {status === 'invalid' && (
              <AlertCircle className="w-16 h-16 text-yellow-400" />
            )}
          </div>
          
          <CardTitle className="text-white text-xl">
            {status === 'loading' && 'Processing Payment...'}
            {status === 'success' && 'Payment Successful!'}
            {status === 'already_processed' && 'Already Processed'}
            {status === 'failed' && 'Payment Failed'}
            {status === 'invalid' && 'Invalid Payment'}
          </CardTitle>
          
          <CardDescription className="text-gray-400 break-all">
            Reference: {payoutReference}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {status === 'loading' && (
            <div className="text-center text-gray-300 space-y-2">
              <p>Confirming your payment with Flutterwave...</p>
              <p className="text-sm text-gray-400">
                Please wait while we release your tokens on the blockchain.
              </p>
              {retryCount > 0 && (
                <Alert className="bg-blue-900/20 border-blue-800">
                  <Clock className="h-4 w-4" />
                  <AlertDescription className="text-blue-200 text-sm">
                    Network is busy. Retrying automatically...
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {status === 'success' && result && (
            <div className="space-y-4">
              <div className="bg-green-900/20 border border-green-800 rounded-lg p-4">
                <p className="text-green-200 text-sm">{result.message}</p>
              </div>

              {(result.tokenAmount || result.fiatAmount) && (
                <div className="bg-gray-700 rounded-lg p-4 space-y-2">
                  <h3 className="text-white font-medium mb-3">Transaction Details</h3>
                  {result.tokenAmount && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Tokens Received:</span>
                      <span className="text-white font-medium">{result.tokenAmount}</span>
                    </div>
                  )}
                  {result.fiatAmount && result.currency && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Amount Paid:</span>
                      <span className="text-white font-medium">
                        {result.currency} {result.fiatAmount}
                      </span>
                    </div>
                  )}
                  {result.processingTime && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Processing Time:</span>
                      <span className="text-white font-medium">{result.processingTime}</span>
                    </div>
                  )}
                </div>
              )}

              {result.transactionSignature && (
                <Button
                  onClick={handleViewTransaction}
                  variant="outline"
                  className="w-full"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View on Solana Explorer
                </Button>
              )}
            </div>
          )}

          {status === 'already_processed' && result && (
            <div className="space-y-4">
              <Alert className="bg-blue-900/20 border-blue-800">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-blue-200 text-sm">
                  {result.message}
                </AlertDescription>
              </Alert>

              <div className="bg-gray-700 rounded-lg p-4">
                <h3 className="text-white font-medium mb-2">What this means:</h3>
                <ul className="text-sm text-gray-300 space-y-1">
                  <li>• Your payment was already confirmed</li>
                  <li>• Tokens have been released to your wallet</li>
                  <li>• No further action is required</li>
                </ul>
              </div>
            </div>
          )}

          {(status === 'failed' || status === 'invalid') && result && (
            <div className="space-y-4">
              <div className="bg-red-900/20 border border-red-800 rounded-lg p-4">
                <p className="text-red-200 text-sm">{result.message}</p>
              </div>

              <div className="bg-gray-700 rounded-lg p-4">
                <h3 className="text-white font-medium mb-2">What to do next:</h3>
                <ul className="text-sm text-gray-300 space-y-1">
                  <li>• Save your payment reference: <span className="text-white font-mono text-xs break-all">{payoutReference}</span></li>
                  <li>• Contact support with this reference</li>
                  <li>• Check your payment method was charged</li>
                  <li>• Do not make another payment</li>
                </ul>
              </div>

              {retryCount < MAX_RETRIES && (
                <Button
                  onClick={handleRetry}
                  variant="outline"
                  className="w-full"
                >
                  Try Again
                </Button>
              )}
            </div>
          )}

          <div className="pt-4 border-t border-gray-700">
            <Button
              onClick={handleBackToApp}
              variant="default"
              className="w-full"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Trust Express
            </Button>
          </div>

          {process.env.NODE_ENV === 'development' && (
            <div className="bg-gray-700 rounded-lg p-3 text-xs space-y-2">
              <h4 className="text-white font-medium">Debug Info:</h4>
              <div className="text-gray-300 space-y-1">
                <div>Processor: <Badge variant="outline" className="ml-2">{isOpay ? 'OPay' : 'Flutterwave'}</Badge></div>
                <div>Status: <Badge variant="outline" className="ml-2">{opayStatus ?? flutterwaveStatus}</Badge></div>
                {orderNo && <div>OPay OrderNo: <span className="text-white font-mono">{orderNo}</span></div>}
                {txRef && <div>TX Ref: <span className="text-white font-mono">{txRef}</span></div>}
                {transactionId && <div>Transaction ID: <span className="text-white font-mono">{transactionId}</span></div>}
                <div>Retry Count: {retryCount}/{MAX_RETRIES}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentSuccessPage;