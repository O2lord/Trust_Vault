import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, 
  DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/text-area";
import { Label } from "@/components/ui/label";
import { PublicKey } from '@solana/web3.js';
import useTrustVaultProgram from '@/hooks/useTrustVaultProgram';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { ReservationStatus} from "@/types/trustVault"

interface DisputePaymentButtonProps {
  trustVault: PublicKey;
  reservationIndex: number;
  reservationStatus?: ReservationStatus;
  isMaker?: boolean;
  isTaker?: boolean;
  disabled?: boolean;
  onDisputed?: () => void;
  className?: string;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | 'gradient';
}

export function DisputePaymentButton({
  trustVault,
  reservationIndex,
  reservationStatus,
  isMaker = false,
  isTaker = false,
  disabled = false,
  onDisputed,
  className = '',
  variant = 'outline'
}: DisputePaymentButtonProps) {
  const [open, setOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const { disputePayment } = useTrustVaultProgram();
  const { publicKey } = useWallet();
  
  // Only show the button if the user is involved in the transaction (maker or taker)
  // and if the reservation status is PAYMENT_SENT
  const canDisputePayment = (isMaker || isTaker) && 
    reservationStatus === ReservationStatus.PAYMENT_SENT && 
    publicKey !== null;
  
  if (!canDisputePayment) {
    return null;
  }
  
  const handleDisputeSubmit = async () => {
    if (!disputeReason.trim()) {
      return;
    }
    
    try {
      await disputePayment.mutateAsync({
        trustVault,
        reservationIndex,
        disputeReason: disputeReason.trim()
      });
      
      setOpen(false);
      setDisputeReason('');
      
      if (onDisputed) {
        onDisputed();
      }
    } catch (error) {
      console.error("Failed to dispute payment:", error);
    }
  };
  
  return (
    <>
      <Button 
        variant={variant}
        className={`bg-red-500 text-white-700 hover:bg-red-700 ${className}`}
        onClick={() => setOpen(true)}
        disabled={disabled || disputePayment.isPending}
      >
        {disputePayment.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <AlertTriangle className="mr-2 h-4 w-4" />
            Dispute
          </>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[475px]">
          <DialogHeader>
            <DialogTitle>Dispute Payment</DialogTitle>
            <DialogDescription>
              If there is an issue with this transaction, you can submit a dispute. 
              Please provide detailed information about the problem.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <div className="mb-4">
              <div className="mb-4 rounded-md bg-amber-50 p-3 text-amber-800">
                <div className="flex items-center">
                  <AlertTriangle className="mr-2 h-5 w-5" />
                  <span className="font-medium">Important</span>
                </div>
                <p className="mt-1 text-sm">
                  Only submit a dispute if there is a legitimate issue with this transaction. 
                  Disputes will be reviewed by an administrator who will make a final decision.
                </p>
              </div>
              
              <Label htmlFor="dispute-reason" className="mb-2 block font-medium">
                Reason for Dispute
              </Label>
              <Textarea
                id="dispute-reason"
                placeholder="Please explain the issue in detail (500 characters max)..."
                value={disputeReason}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDisputeReason(e.target.value)}
                className="min-h-[120px]"
                maxLength={500}
              />
              <div className="mt-1 text-right text-xs text-gray-500">
                {disputeReason.length}/500
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button 
              variant="destructive"
              onClick={handleDisputeSubmit}
              disabled={disputePayment.isPending || disputeReason.trim().length < 10}
            >
              {disputePayment.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Dispute"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}