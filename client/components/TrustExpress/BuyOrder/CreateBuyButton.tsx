"use client";
import React, { useState, useCallback } from "react";
import { ShoppingCart, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import CreateExpressBuyDialog from "./CreateExpressBuyDialog";
import { toast } from "sonner";
import useTrustExpress from "@/hooks/express/useTrustExpress";

type Props = {
  className?: string;
};

const CreateExpressBuyButton: React.FC<Props> = ({}) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { getGlobalState } = useTrustExpress();
  
  // getGlobalState is a useQuery hook, so we access its data property
  const globalStateData = getGlobalState.data as { buyOrdersPaused?: boolean } | null | undefined;
  const isFetching = getGlobalState.isFetching;
  const buyOrdersPaused = globalStateData?.buyOrdersPaused ?? false;

  const handleButtonClick = useCallback(() => {
    // Check if buy orders are paused
    if (buyOrdersPaused) {
      toast.error("Buy Orders Paused", {
        description: "Buy orders are temporarily disabled by the platform administrator. Please try again later.",
        icon: <AlertCircle className="h-5 w-5" />,
        duration: 5000,
      });
      return;
    }

    // If not paused, open the dialog
    setDialogOpen(true);
  }, [buyOrdersPaused]);

  return (
    <>
      <Button
        className="bg-[#E8480A] hover:bg-[#0F0D0A] text-white transition-colors duration-200"
        onClick={handleButtonClick}
        disabled={isFetching}
      >
        <div className="relative flex items-center space-x-2">
          <div className="relative">
            <div className="relative bg-white/20 p-1.5 rounded-md">
              <ShoppingCart className="w-4 h-4" />
            </div>
          </div>
          <span>
            {isFetching ? "Checking..." : "Create Express Buy Order"}
          </span>
        </div>
      </Button>
      
      <CreateExpressBuyDialog 
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  );
};

export default CreateExpressBuyButton;