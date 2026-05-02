// app/requests/page.tsx
"use client";
import React from "react";
import RequestsInbox from "@/components/TrustExpress/Payment/RequestsInbox";
import OutgoingRequests from "@/components/TrustExpress/Payment/OutgoingRequests";
import CreateRequestDialog from "@/components/TrustExpress/Payment/CreateRequestDialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Inbox, Send } from "lucide-react";
import AddBeneficiaryDialog from "@/components/TrustExpress/Payment/AddBeneficiaryDialog";

export default function RequestsPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Payment Requests</h1>
          <p className="text-gray-400">Manage your incoming and outgoing payment requests</p>
        </div>
        <AddBeneficiaryDialog 
          trigger={
            <Button className="bg-purple-600 hover:bg-purple-700">
              <Plus className="mr-2 h-4 w-4" />
              Add Beneficiary
            </Button>
          }
        />

        <CreateRequestDialog
          trigger={
            <Button className="bg-purple-600 hover:bg-purple-700">
              <Plus className="w-4 h-4 mr-2" />
              New Request
            </Button>
          }
        />
      </div>

      <Tabs defaultValue="incoming" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-gray-800 mb-6">
          <TabsTrigger 
            value="incoming" 
            className="data-[state=active]:bg-purple-600 data-[state=active]:text-white"
          >
            <Inbox className="w-4 h-4 mr-2" />
            Incoming
          </TabsTrigger>
          <TabsTrigger 
            value="outgoing"
            className="data-[state=active]:bg-purple-600 data-[state=active]:text-white"
          >
            <Send className="w-4 h-4 mr-2" />
            Outgoing
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="incoming" className="mt-0">
          <RequestsInbox />
        </TabsContent>
        
        <TabsContent value="outgoing" className="mt-0">
          <OutgoingRequests />
        </TabsContent>
      </Tabs>
    </div>
  );
}