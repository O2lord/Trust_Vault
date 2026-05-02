"use client";
import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ShoppingCart, AlertCircle } from "lucide-react";
import InstantBuyDialog from "./InstantBuyDialog";
import { toast } from "sonner";
import useTrustExpress from "@/hooks/express/useTrustExpress";

type Props = {
  paymentLinkData?: {
    trustExpressAddress: string;
    transactionSignature: string;
    tokenAmount: string;
    currency: string;
  } | null;
  autoOpen?: boolean;
  onAutoOpenComplete?: () => void;
};

const InstantBuyButton: React.FC<Props> = ({
  paymentLinkData = null,
  autoOpen = false,
  onAutoOpenComplete
}) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { getGlobalState } = useTrustExpress();
  const globalStateData = getGlobalState.data as { sellOrdersPaused?: boolean } | null | undefined;
  const isFetching = getGlobalState.isFetching;
  const sellOrdersPaused = globalStateData?.sellOrdersPaused ?? false;

  const handleButtonClick = useCallback(() => {
    if (sellOrdersPaused) {
      toast.error("Buys are Paused", {
        description: "Buying tokens are temporarily disabled by the platform administrator.",
        icon: <AlertCircle className="h-5 w-5" />,
        duration: 5000,
      });
      return;
    }
    setDialogOpen(true);
  }, [sellOrdersPaused]);

  return (
    <>
      {/* outline — sits alongside other actions, not the lone primary */}
      <Button
        variant="outline"
        onClick={handleButtonClick}
        disabled={isFetching}
      >
        <ShoppingCart className="mr-2 h-4 w-4" />
        {isFetching ? "Checking..." : "Buy"}
      </Button>
      <InstantBuyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        paymentLinkData={paymentLinkData}
        autoOpen={autoOpen}
        onAutoOpenComplete={onAutoOpenComplete}
      />
    </>
  );
};

export default InstantBuyButton;