import React from 'react';
import { usePaymentDecryption, useIsEncrypted } from '@/hooks/usePaymentDecryption';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, AlertCircle, Lock, Unlock } from 'lucide-react';
import { toast } from 'sonner';
import {Clipboard} from "lucide-react"

interface EncryptedPaymentDisplayProps {
  trustVaultPubkey?: string; 
  sellerPubkey?: string; 
  paymentInstructions: string;
  className?: string;
}

interface PaymentInstructionsData {
  // For CreateSellOrderDialog & SellTokensButton
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
  additionalInstructions?: string;
  
  // For CreateBuyDialog
  paymentType?: string;
}

const EncryptedPaymentDisplay: React.FC<EncryptedPaymentDisplayProps> = ({
  trustVaultPubkey,
  sellerPubkey,
  paymentInstructions,
  className = '',
}) => {
  const isEncrypted = useIsEncrypted(paymentInstructions);
  

  
  const { decryptedData, loading, error, retry } = usePaymentDecryption(
    isEncrypted ? (sellerPubkey ?? null) : null,  
    isEncrypted ? (trustVaultPubkey ?? null) : null, 
    isEncrypted ? paymentInstructions : null
  );

  // If not encrypted, parse and display directly
  if (!isEncrypted) {
    try {
      const data = JSON.parse(paymentInstructions) as PaymentInstructionsData;
      return <PaymentInstructionsView data={data} encrypted={false} className={className} />;
    } catch {
      return (
        <div className={`p-4 bg-red-50 dark:bg-red-950 rounded-md border border-red-200 dark:border-red-800 ${className}`}>
          <div className="flex items-center text-red-700 dark:text-red-300">
            <AlertCircle className="w-4 h-4 mr-2" />
            <span className="text-sm">Invalid payment instructions format</span>
          </div>
        </div>
      );
    }
  }

  // Handle encrypted data
  if (loading) {
    return (
      <div className={`p-4 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800 ${className}`}>
        <div className="flex items-center text-blue-700 dark:text-blue-300">
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          <span className="text-sm">Decrypting payment instructions...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 bg-red-50 dark:bg-red-950 rounded-md border border-red-200 dark:border-red-800 ${className}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center text-red-700 dark:text-red-300">
            <AlertCircle className="w-4 h-4 mr-2" />
            <span className="text-sm">{error}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={retry}
            className="text-red-700 dark:text-red-300 hover:text-red-800 dark:hover:text-red-200"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  if (decryptedData) {
    return (
      <PaymentInstructionsView 
        data={decryptedData as PaymentInstructionsData} 
        encrypted={true} 
        className={className} 
      />
    );
  }

  return (
    <div className={`p-4 bg-gray-50 dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-800 ${className}`}>
      <div className="flex items-center text-gray-700 dark:text-gray-300">
        <Lock className="w-4 h-4 mr-2" />
        <span className="text-sm">Payment instructions are encrypted</span>
      </div>
    </div>
  );
};

interface PaymentInstructionsViewProps {
  data: PaymentInstructionsData;
  encrypted: boolean;
  className?: string;
}

const PaymentInstructionsView: React.FC<PaymentInstructionsViewProps> = ({
  data,
  encrypted,
  className = '',
}) => {
  return (
    <div className="bg-gray-900/80 rounded-lg p-4 border border-gray-600">
      <div className="flex items-center mb-3">
        {encrypted ? (
          <Unlock className="w-4 h-4 mr-2 text-green-200 dark:text-green-300" />
        ) : (
          <div className="w-4 h-4 mr-2" />
        )}
        <h3 className="text-sm font-medium text-green-200 dark:text-green-300">
           {encrypted && '(Decrypted)'}
        </h3>
      </div>
      
      <div className="space-y-2 text-sm text-gray-800 dark:text-gray-200">
  {/* Bank details format (CreateSellOrderDialog & SellTokensButton) */}
  {data.bankName && (
    <>
      <div>
        <span className="font-medium">Bank Name:</span> {data.bankName}
      </div>
      <div>
        <span className="font-medium">Account Name:</span> {data.accountName}
      </div>
      <div className="flex items-center space-x-2">
        <span className="font-medium">Account Number:</span>
        <span>{data.accountNumber}</span>
        <button
          onClick={() => {
              if (data.accountNumber) {
                navigator.clipboard.writeText(data.accountNumber);
                toast.success("Account number copied!");
              }
            }}
          className="text-xs text-blue-500 hover:underline"
        >
          <Clipboard className="inline w-4 h-4 mr-1" />
         
        </button>
      </div>
      {data.additionalInstructions && (
        <div>
          <span className="font-medium">Additional Instructions:</span> {data.additionalInstructions}
        </div>
      )}
    </>
  )}

  {/* Payment type format (CreateBuyDialog) */}
  {data.paymentType && !data.bankName && (
    <>
      <div>
        <span className="font-medium">Payment Type:</span> {data.paymentType}
      </div>
      {data.additionalInstructions && (
        <div>
          <span className="font-medium">Additional Instructions:</span> {data.additionalInstructions}
        </div>
      )}
    </>
  )}
</div>
    </div>
  );
};

export default EncryptedPaymentDisplay;