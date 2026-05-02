"use client";
import React from "react";
import{DollarSign} from "lucide-react"
import { Button } from "@/components/ui/button";
import CreateSellOrderDialog from "./CreateSellOrderDialog";
import {Props} from "@/types/trustVault";

const CreateSellOrderButton: React.FC<Props> = ({className}) => {
  return (
  <CreateSellOrderDialog 
  trigger={
    <Button 
        variant={undefined} 
        className="bg-orange-600 hover:bg-orange-700 text-black"
        >
       <div className="relative flex items-center space-x-2">
        <div className="relative">
          <div className="relative bg-gradient-to-r from-orange-400 to-amber-300 p-1.5 rounded-md group">
          <DollarSign className="w-4 h-4 " />
          </div>
        </div>
      <span>
      Create Sell Order
      </span>    
       </div>   
      </Button>
    } 
  />);
};

export default CreateSellOrderButton;