'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';

export default function PendingReceiptPage() {
  const searchParams = useSearchParams();
  const trustExpress = searchParams.get('trustExpress');
  const taker = searchParams.get('taker');
  
  const [status, setStatus] = useState<'loading' | 'found' | 'timeout'>('loading');
  const [receiptId, setReceiptId] = useState<string | null>(null);
  
  useEffect(() => {
    if (!trustExpress) return;
    
    let attempts = 0;
    const maxAttempts = 30; // 60 seconds total
    
    const checkReceipt = async () => {
      try {
        const url = taker 
          ? `/api/receipts/by-transaction?trustExpressAddress=${trustExpress}&takerAddress=${taker}`
          : `/api/receipts/by-transaction?trustExpressAddress=${trustExpress}`;
          
        const response = await fetch(url);
        
        if (response.ok) {
          const receipt = await response.json();
          setReceiptId(receipt.id);
          setStatus('found');
          // Redirect to actual receipt
          window.location.href = `/receipts/${receipt.id}`;
          return true;
        }
        return false;
      } catch (error) {
        console.error('Error checking receipt:', error);
        return false;
      }
    };
    
    const pollInterval = setInterval(async () => {
      attempts++;
      
      const found = await checkReceipt();
      
      if (found || attempts >= maxAttempts) {
        clearInterval(pollInterval);
        if (!found) setStatus('timeout');
      }
    }, 2000);
    
    // Check immediately
    checkReceipt();
    
    return () => clearInterval(pollInterval);
  }, [trustExpress, taker]);
  
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-xl p-8 max-w-md w-full border border-gray-700">
        {status === 'loading' && (
          <div className="text-center space-y-4">
            <Loader2 className="w-16 h-16 text-blue-400 animate-spin mx-auto" />
            <h2 className="text-xl font-bold text-white">Processing Payment</h2>
            <p className="text-gray-300 text-sm">
              Your payment is being confirmed and your receipt is being generated.
              This usually takes 5-15 seconds.
            </p>
          </div>
        )}
        
        {status === 'found' && receiptId && (
          <div className="text-center space-y-4">
            <CheckCircle className="w-16 h-16 text-green-400 mx-auto" />
            <h2 className="text-xl font-bold text-white">Receipt Ready!</h2>
            <p className="text-gray-300 text-sm">Redirecting to your receipt...</p>
          </div>
        )}
        
        {status === 'timeout' && (
          <div className="text-center space-y-4">
            <AlertCircle className="w-16 h-16 text-orange-400 mx-auto" />
            <h2 className="text-xl font-bold text-white">Still Processing</h2>
            <p className="text-gray-300 text-sm">
              Your payment is taking longer than expected. Your receipt will be available soon.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
            >
              Check Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}