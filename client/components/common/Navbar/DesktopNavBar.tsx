"use client";
import React from "react";
import { NavBar_Item } from "@/lib/constant";
import NavBarItem from "./NavBarItem";
import ConnectWalletButton from "@/components/ConnectWalletButton";
import { useWallet } from "@solana/wallet-adapter-react";
import Logo from "../Logo";
import NotificationBell from "@/components/TrustExpress/Payment/NotificationBell";

const DesktopNavBar: React.FC = () => {
  const { publicKey } = useWallet();
  const adminAddress = "TVogEsLNMyh3sVSPSnzYsCQjLM9nPRzMA9XNpx34Fpy";
  const isAdmin = publicKey?.toBase58() === adminAddress;

  const navItems = isAdmin
    ? [...NavBar_Item, { label: "Admin", link: "/admin" }]
    : NavBar_Item;

  return (
    <div className="hidden border-separate border-b border-[#0F0D0A]/10 bg-background md:block">
      <nav className="container flex items-center justify-between px-8">
        <div className="flex h-[80px] min-h-[60px] items-center gap-x-4">
          <Logo />
          <div className="flex h-full">
            {navItems.map((item) => (
              <NavBarItem key={item.label} item={item} />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <ConnectWalletButton />
        </div>
      </nav>
    </div>
  );
};

export default DesktopNavBar;