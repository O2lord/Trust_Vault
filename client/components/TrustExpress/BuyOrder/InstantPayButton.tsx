"use client";
import React, { useState, useCallback } from "react";
import { Zap, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import InstantPayDialog from "./InstantPayDialog";
import { toast } from "sonner";
import useTrustExpress from "@/hooks/express/useTrustExpress";

type Props = {
  className?: string;
};

const InstantPayButton: React.FC<Props> = ({ className }) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { getGlobalState } = useTrustExpress();
  const globalStateData = getGlobalState.data as { buyOrdersPaused?: boolean } | null | undefined;
  const isFetching = getGlobalState.isFetching;
  const buyOrdersPaused = globalStateData?.buyOrdersPaused ?? false;

  const handleButtonClick = useCallback(() => {
    if (buyOrdersPaused) {
      toast.error("Sells are Paused", {
        description: "Selling tokens are temporarily disabled by the platform administrator.",
        icon: <AlertCircle className="h-5 w-5" />,
        duration: 5000,
      });
      return;
    }
    setDialogOpen(true);
  }, [buyOrdersPaused]);

  return (
    <>
      {/* outline — tertiary supporting action */}
      <Button
        variant="outline"
        className={className}
        onClick={handleButtonClick}
        disabled={isFetching}
      >
        <Zap className="w-4 h-4 mr-2" />
        {isFetching ? "Checking..." : "Pay/Sell"}
      </Button>
      <InstantPayDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
};

export default InstantPayButton;