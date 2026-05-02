"use client";
import React, { useState, useCallback } from "react";
import { TrendingUp, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import CreateExpressSellDialog from "./CreateExpressSellDialog";
import { toast } from "sonner";
import useTrustExpress from "@/hooks/express/useTrustExpress";

type Props = {
  className?: string;
};

const CreateExpressSellButton: React.FC<Props> = ({}) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { getGlobalState } = useTrustExpress();
  const globalStateData = getGlobalState.data as { sellOrdersPaused?: boolean } | null | undefined;
  const isFetching = getGlobalState.isFetching;
  const sellOrdersPaused = globalStateData?.sellOrdersPaused ?? false;

  const handleButtonClick = useCallback(() => {
    if (sellOrdersPaused) {
      toast.error("Sell Orders Paused", {
        description: "Sell orders are temporarily disabled by the platform administrator.",
        icon: <AlertCircle className="h-5 w-5" />,
        duration: 5000,
      });
      return;
    }
    setDialogOpen(true);
  }, [sellOrdersPaused]);

  return (
    <>
      {/* secondary — dark, important but not THE primary CTA */}
      <Button
        variant="secondary"
        onClick={handleButtonClick}
        disabled={isFetching}
      >
        <TrendingUp className="w-4 h-4 mr-2" />
        {isFetching ? "Checking..." : "Create Express Sell Order"}
      </Button>
      <CreateExpressSellDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
};

export default CreateExpressSellButton;