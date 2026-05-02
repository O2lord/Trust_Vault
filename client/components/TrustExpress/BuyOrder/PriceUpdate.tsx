import useTrustExpress from "@/hooks/express/useTrustExpress";
import { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import ConfirmationDialog from "../../ui/confirmation-dialog";

interface UpdatePriceFormProps {
  trustExpress: string;  
  currentPrice?: string | number; 
  currency?: string; 
  onSuccess?: () => void;  
}

export default function UpdatePriceForm({ 
  trustExpress, 
  currentPrice = "0", 
  currency = "USD", 
  onSuccess 
}: UpdatePriceFormProps) {
  const { updatePrice } = useTrustExpress();
  const [newPrice, setNewPrice] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);

  const validatePrice = () => {
    if (!newPrice || isNaN(parseFloat(newPrice)) || parseFloat(newPrice) <= 0) {
      setError('Please enter a valid price greater than zero');
      return false;
    }
    return true;
  };

  const handleOpenConfirmation = () => {
    setError('');
    if (validatePrice()) {
      setShowConfirmation(true);
    }
  };

  const handleConfirmUpdate = async () => {
    setIsUpdating(true);
    try {
      await updatePrice.mutateAsync({
        trustExpress: new PublicKey(trustExpress),
        newPricePerToken: parseFloat(newPrice)
      });
      
      setNewPrice('');
      setShowConfirmation(false);
      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update price';
      setError(errorMessage);
    } finally {
      setIsUpdating(false);
    }
  };

  const getConfirmationMessage = () => {
    return `You are about to update the token price from ${currentPrice} ${currency} to ${parseFloat(newPrice)} ${currency}.
    This change will only affect new reservations. Any existing reservations will maintain their original agreed price.
    Would you like to proceed with this price update?`;
  };

  return (
    <div className="bg-gray-900/80 rounded-lg p-4 border border-gray-600">
      <div className="space-y-4">
        <div>
          <label htmlFor="newPrice" className="block text-sm font-medium text-gray-200 mb-1">
            New Price Per Token
          </label>
          <input
            id="newPrice"
            type="number"
            step="0.01"
            min="0.01"
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
            placeholder="Enter new price"
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500"
            disabled={isUpdating}
          />
        </div>
        
        {error && (
          <div className="text-red-500 text-sm">
            {error}
          </div>
        )}
        
        <div className="pt-2">
          <button
            onClick={handleOpenConfirmation}
            disabled={isUpdating || !newPrice}
            className={`w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white 
              ${isUpdating || !newPrice 
                ? 'bg-[#0F0D0A]/40 cursor-not-allowed' 
                : 'bg-[#E8480A] hover:bg-[#0F0D0A] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#E8480A]'}`}
          >
            {isUpdating ? 'Updating...' : 'Update Price'}
          </button>
        </div>
      </div>

      <ConfirmationDialog
        isOpen={showConfirmation}
        onClose={() => setShowConfirmation(false)}
        onConfirm={handleConfirmUpdate}
        title="Confirm Price Update"
        description={getConfirmationMessage()}
        confirmText="Update Price"
        cancelText="Cancel"
        isProcessing={isUpdating}
      />
    </div>
  );
}