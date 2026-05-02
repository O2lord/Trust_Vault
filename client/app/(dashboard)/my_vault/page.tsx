"use client";
import React, { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import SellOrderGrid, { SellOrderGridRef } from "@/components/TrustVault/SellOrder/SellOrderGrid";
import BuyGrid, { BuyGridRef } from "@/components/TrustVault/BuyOrder/BuyOrderGrid";
import MakerCardContainer, { PendingReservationsRef } from "@/components/TrustVault/SellOrder/MakerCardContainer";
import TakerCardContainer, { PendingConfirmationRef } from "@/components/TrustVault/SellOrder/TakerCardContainer";
import TakerCardContainerBO, { SellerReleaseRef } from "@/components/TrustVault/BuyOrder/TakerCardContainer";
import MakerCardContainerBO, {BuyerPaymentRef} from "@/components/TrustVault/BuyOrder/MakerCardContainer";
import CreateBuyButton from "@/components/TrustVault/BuyOrder/CreateaBuyButton";
import MakeNewTrustVaultButton from "@/components/TrustVault/SellOrder/CreateSellOrderButton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsContent, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCcw, Shield, User, ShoppingCart } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";




const MyTrustVaultPage: React.FC = () => {
const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 100);
    
    return () => clearTimeout(timer);
  }, []);


  
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("my-vaults");
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Refs to component methods
  const sellOrderGrid = useRef<SellOrderGridRef>(null);
  const buyGridRef = useRef<BuyGridRef>(null);
  const makerRefSO = useRef<PendingReservationsRef>(null);
  const takerRefSO = useRef<PendingConfirmationRef>(null);
  const makerRefBO = useRef<BuyerPaymentRef>(null);
  const takerRefBO = useRef<SellerReleaseRef>(null);

  // Handle URL query parameters for tab selection
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['my-vaults', 'pending-reservations', 'pending-confirmations', 'buyer-payments', 'seller-releases'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  // Update URL when tab changes
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    router.push(`/my_vault?tab=${value}`, { scroll: false });
  };

  // Animated refresh handler
  const handleRefresh = async () => {
    if (isRefreshing) return;
    
    setIsRefreshing(true);
    
    // Add a subtle delay for better UX
    await new Promise(resolve => setTimeout(resolve, 300));
    
    try {
      // Use the appropriate ref's refresh method based on active tab
      if (activeTab === "my-vaults" && sellOrderGrid.current) {
        sellOrderGrid.current.refresh();
      } else if (activeTab === "pending-reservations" && makerRefSO.current) {
        makerRefSO.current.refresh();
      } else if (activeTab === "pending-confirmations" && takerRefSO.current) {
        takerRefSO.current.refresh();
      } else if (activeTab === "buyer-payments" && makerRefBO.current) {
        makerRefBO.current.refresh();
      } else if (activeTab === "seller-releases" && takerRefBO.current) {
        takerRefBO.current.refresh();
      }
      
      // Add success animation delay
      await new Promise(resolve => setTimeout(resolve, 500));
      toast.success("Data refreshed successfully");
    } catch (error) {
      console.error("Error refreshing data:", error);
      toast.error("Failed to refresh data");
    } finally {
      setIsRefreshing(false);
    }
  };

   const getTabIcon = (tab: string) => {
    switch (tab) {
      case "my-vaults":
        return <Shield className="w-4 h-4 mr-2" />;
      case "pending-reservations":
        return <User className="w-4 h-4 mr-2" />;
      case "pending-confirmations":
        return <ShoppingCart className="w-4 h-4 mr-2" />;
      default:
        return null;
    }
  };

  return (
  <div className="container mx-auto py-10 space-y-6">
    <div className={`transition-all duration-1000 ${isVisible ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform translate-y-10'}`}>
      <Tabs 
        defaultValue="my-vaults" 
        value={activeTab} 
        onValueChange={handleTabChange}
        className="w-full"
      >
        <TabsList className="grid grid-cols-3 lg:w-[700px] mx-auto bg-gradient-to-r from-gray-800/50 to-gray-800/50 border border-gray-600 p-1">
          <TabsTrigger 
            value="my-vaults"
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-purple-600 data-[state=active]:text-white transition-all duration-300"
            >
              {getTabIcon("my-vaults")}
            My Vaults
            </TabsTrigger>
          <TabsTrigger value="pending-reservations"
          className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-600 data-[state=active]:to-orange-600 data-[state=active]:text-white transition-all duration-300"

          >
            {getTabIcon("pending-reservations")}
            Seller View
            <Badge variant="outline" className="ml-2 bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300 border-amber-300">
              Seller
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="pending-confirmations"
           className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-600 data-[state=active]:to-emerald-600 data-[state=active]:text-white transition-all duration-300"
          >
            {getTabIcon("pending-confirmations")}
            Buyer View
            <Badge variant="outline" className="ml-2 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300 border-blue-300">
              Buyer
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="my-vaults" className="mt-6">
          <Card className={cn(
            "transition-all duration-500 transform",
            isRefreshing && activeTab === "my-vaults" ? "opacity-70 scale-[0.98]" : "opacity-100 scale-100"
          )}>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>My Active TrustVaults</CardTitle>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className={cn(
                      "transition-all duration-300 transform hover:scale-105",
                      isRefreshing && "scale-95 opacity-80"
                    )}
                  >
                    <RefreshCcw className={cn(
                      "mr-2 h-4 w-4 transition-all duration-700",
                      isRefreshing ? 'animate-spin text-blue-500' : 'hover:rotate-180'
                    )} />
                    <span className="transition-all duration-300">
                      {isRefreshing ? 'Refreshing...' : 'Refresh'}
                    </span>
                  </Button>
                  <CreateBuyButton/>
                  <MakeNewTrustVaultButton />
                </div>
              </div>
              <CardDescription>
                View and manage all vaults you have created
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SellOrderGrid ref={sellOrderGrid} filterByCurrentUser={true} />
              <BuyGrid ref={buyGridRef} filterByCurrentUser={true} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending-reservations" className="mt-6">
          <Card className={cn(
            "transition-all duration-500 transform",
            isRefreshing && activeTab === "pending-reservations" ? "opacity-70 scale-[0.98]" : "opacity-100 scale-100"
          )}>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Pending Reservations (Seller View)</CardTitle>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className={cn(
                    "transition-all duration-300 transform hover:scale-105",
                    isRefreshing && "scale-95 opacity-80"
                  )}
                >
                  <RefreshCcw className={cn(
                    "mr-2 h-4 w-4 transition-all duration-700",
                    isRefreshing ? 'animate-spin text-blue-500' : 'hover:rotate-180'
                  )} />
                  <span className="transition-all duration-300">
                    {isRefreshing ? 'Refreshing...' : 'Refresh'}
                  </span>
                </Button>
              </div>
              <CardDescription>
                Review and confirm payments for your vault reservations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MakerCardContainer ref={makerRefSO} />
              <TakerCardContainerBO ref={takerRefBO} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending-confirmations" className="mt-6">
          <Card className={cn(
            "transition-all duration-500 transform",
            isRefreshing && activeTab === "pending-confirmations" ? "opacity-70 scale-[0.98]" : "opacity-100 scale-100"
          )}>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Pending Confirmations (Buyer View)</CardTitle>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className={cn(
                    "transition-all duration-300 transform hover:scale-105",
                    isRefreshing && "scale-95 opacity-80"
                  )}
                >
                  <RefreshCcw className={cn(
                    "mr-2 h-4 w-4 transition-all duration-700",
                    isRefreshing ? 'animate-spin text-blue-500' : 'hover:rotate-180'
                  )} />
                  <span className="transition-all duration-300">
                    {isRefreshing ? 'Refreshing...' : 'Refresh'}
                  </span>
                </Button>
              </div>
              <CardDescription>
                Track your reservations and payment status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TakerCardContainer ref={takerRefSO} />
              <MakerCardContainerBO ref={makerRefBO} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  </div>
);
};

export default MyTrustVaultPage;