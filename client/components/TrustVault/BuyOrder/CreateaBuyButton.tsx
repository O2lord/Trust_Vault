"use client";
import React from "react";
import { ShoppingCart } from "lucide-react";
import { Button } from "../../ui/button";
import CreateBuyOrderDialog from "./CreateBuyDialog";

type Props = {
  className?: string;
};

const CreateBuyOrderButton: React.FC<Props> = ({className}) => {
  return (
      <CreateBuyOrderDialog 
      trigger={
      <Button
      variant={undefined} 
        className="bg-green-600 hover:bg-green-700 text-black"
      >
        <div className="relative flex items-center space-x-2">
        <div className="relative">
           <div className="relative bg-gradient-to-r from-green-400 to-emerald-300 p-1.5 rounded-md">
              <ShoppingCart className="w-4 h-4 " />
            </div>
        </div>
        <span>
        Create Buy Order
        </span>
        </div>
      </Button>
      } 
    />
  );
};

export default CreateBuyOrderButton;
