import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { 
  RadioGroup,
  RadioGroupItem
} from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/text-area";
import { PublicKey } from '@solana/web3.js';
import { DisputeResolution } from '@/types/trustVault';
import useTrustVaultProgram from '@/hooks/useTrustVaultProgram';
import { Loader2 } from 'lucide-react';

interface ResolveDisputeButtonProps {
  trustVault: PublicKey;
  reservationIndex: number;
  isAdmin: boolean;
  trustVaultType?: number; // 0 = sell-order, 1 = buy-order
  onResolved?: () => void;
  className?: string;
  disabled?: boolean;
}

export function ResolveDisputeButton({
  trustVault,
  reservationIndex,
  isAdmin,
  trustVaultType = 0, // Default to sell-order for backward compatibility
  onResolved,
  className = '',
  disabled = false
}: ResolveDisputeButtonProps) {
  const [open, setOpen] = useState(false);
  const [resolution, setResolution] = useState<DisputeResolution>(DisputeResolution.FAVOR_MAKER);
  const [comment, setComment] = useState('');
  const { resolveDisputes } = useTrustVaultProgram();
  
  // Don't show the button if the user is not an admin
  if (!isAdmin) {
    return null;
  }

  // Define resolution options based on trust vault type
  const getResolutionOptions = () => {
    if (trustVaultType === 1) {
      // Buy-order trust vault
      return {
        favorMaker: {
          label: "Favor Buyer (Release tokens to buyer)",
          description: "The buyer will receive the tokens they purchased"
        },
        favorTaker: {
          label: "Favor Seller (Return tokens to seller)",
          description: "The tokens will be returned to the seller"
        }
      };
    } else {
      // Sell-order trust vault (default)
      return {
        favorMaker: {
          label: "Favor Seller (Keep funds in vault)",
          description: "The seller keeps the payment and tokens remain available for future sales"
        },
        favorTaker: {
          label: "Favor Buyer (Release tokens to buyer)",
          description: "The buyer will receive the tokens they paid for"
        }
      };
    }
  };
  
  const handleResolve = async () => {
    try {
      await resolveDisputes.mutateAsync({
        trustVault,
        reservationIndex,
        resolution,
        comment
      });
      
      setOpen(false);
      if (onResolved) {
        onResolved();
      }
    } catch (error) {
      console.error("Failed to resolve dispute:", error);
    }
  };

  const resolutionOptions = getResolutionOptions();
  const trustVaultTypeLabel = trustVaultType === 1 ? "Buy-Order" : "Sell-Order";
  
  return (
    <>
      <Button 
        variant="outline" 
        className={`bg-yellow-50 text-yellow-700 hover:bg-yellow-100 ${className}`}
        onClick={() => setOpen(true)}
        disabled={disabled || resolveDisputes.isPending}
      >
        {resolveDisputes.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Resolving...
          </>
        ) : (
          "Resolve Dispute"
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Resolve Dispute - {trustVaultTypeLabel} Trust Vault</DialogTitle>
            <DialogDescription>
              As an admin, you can resolve this {trustVaultTypeLabel.toLowerCase()} trust vault dispute in favor of either party.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <div className="mb-4">
              <h4 className="mb-3 font-medium">Resolution Decision</h4>
              <RadioGroup 
                value={resolution.toString()} 
                onValueChange={(value: string) => setResolution(Number(value) as DisputeResolution)}
                className="space-y-3"
              >
                <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-muted/50">
                  <RadioGroupItem 
                    value={DisputeResolution.FAVOR_MAKER.toString()} 
                    id="favor-maker" 
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <Label htmlFor="favor-maker" className="font-medium cursor-pointer">
                      {resolutionOptions.favorMaker.label}
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {resolutionOptions.favorMaker.description}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-muted/50">
                  <RadioGroupItem 
                    value={DisputeResolution.FAVOR_TAKER.toString()} 
                    id="favor-taker" 
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <Label htmlFor="favor-taker" className="font-medium cursor-pointer">
                      {resolutionOptions.favorTaker.label}
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {resolutionOptions.favorTaker.description}
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>
            
            <div className="mb-4">
              <Label htmlFor="comment" className="mb-2 block font-medium">
                Resolution Comment <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="comment"
                placeholder="Explain the reason for your decision..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="min-h-[100px]"
              />
              <p className="text-sm text-muted-foreground mt-1">
                This comment will be recorded with the resolution for transparency.
              </p>
            </div>

            {/* trust vault type indicator */}
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border">
              <p className="text-sm text-blue-800 dark:text-blue-300">
                <strong>trust vault Type:</strong> {trustVaultTypeLabel}
                <br />
                <span className="text-xs">
                  {trustVaultType === 1 
                    ? "In buy-order trust vault, the buyer has already paid and is waiting for tokens."
                    : "In sell-order trust vault, the seller has deposited tokens and is waiting for payment."
                  }
                </span>
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleResolve}
              disabled={resolveDisputes.isPending || !comment.trim()}
            >
              {resolveDisputes.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Resolving...
                </>
              ) : (
                "Confirm Resolution"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}