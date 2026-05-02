"use client";
import AdminDashboard from "@/components/TrustVault/Admin/AdminDashboard";
import { useWallet } from "@solana/wallet-adapter-react";
import React from "react";



const AdminPage: React.FC = ({}) => {
  const { publicKey } = useWallet();
  const adminPubkey = "TVogEsLNMyh3sVSPSnzYsCQjLM9nPRzMA9XNpx34Fpy";

  if (!publicKey || publicKey.toBase58() !== adminPubkey) {
    return null; 
  }

  return (
    <div className="container mx-auto py-10">
      <div className="flex flex-col gap-8">
        <div className="text-center space-y-4 mb-8">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-red-400 via-orange-300 to-red-400 bg-clip-text text-transparent tracking-tight">
            Admin Dashboard
          </h1>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed">
            Manage and resolve disputed transactions across the platform
          </p>
        </div>
        <AdminDashboard />
      </div>
    </div>
  );
};

export default AdminPage;
