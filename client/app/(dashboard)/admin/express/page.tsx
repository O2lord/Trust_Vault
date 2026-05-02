"use client";
import AdminDashboard from "@/components/TrustExpress/Admin/AdminDashboard";
import { useWallet } from "@solana/wallet-adapter-react";
import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

const AdminPage: React.FC = () => {
  const { publicKey } = useWallet();
  const [mounted, setMounted] = useState(false);
  const adminPubkey = "TVogEsLNMyh3sVSPSnzYsCQjLM9nPRzMA9XNpx34Fpy";

  // Prevent hydration mismatch by only rendering after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  // Show loading state during hydration
  if (!mounted) {
    return (
      <div className="container mx-auto py-10">
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Check admin access after mount
  if (!publicKey || publicKey.toBase58() !== adminPubkey) {
    return (
      <div className="container mx-auto py-10">
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold text-red-500">Access Denied</h1>
            <p className="text-muted-foreground">
              You don&apos;t have permission to access this page.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10">
      <div className="flex flex-col gap-8">
        <div className="text-center space-y-4 mb-8">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-red-400 via-orange-300 to-red-400 bg-clip-text text-transparent tracking-tight">
            Admin Dashboard
          </h1>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed">
            Manage platform settings, fees, and vault operations
          </p>
        </div>
        <AdminDashboard />
      </div>
    </div>
  );
};

export default AdminPage;