"use client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
import React from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import Logo from "../Logo";
import { NavBar_Item } from "@/lib/constant";
import ConnectWalletButton from "@/components/ConnectWalletButton";
import NavBarItem from "./NavBarItem";

const MobileNavBar: React.FC = () => {
  const [isOpened, setIsOpened] = React.useState(false);
  const { publicKey } = useWallet();
  const adminAddress = "TVogEsLNMyh3sVSPSnzYsCQjLM9nPRzMA9XNpx34Fpy";
  const isAdmin = publicKey?.toBase58() === adminAddress;

  const navItems = isAdmin
    ? [...NavBar_Item, { label: "Admin", link: "/admin" }]
    : NavBar_Item;

  return (
    <div className="block border-separate border-b border-[#0F0D0A]/10 bg-background md:hidden">
      <nav className="container flex items-center justify-between px-8">
        <Sheet open={isOpened} onOpenChange={setIsOpened}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent className="w-[400px] sm:w-[540px]" side="left">
            <Logo />
            <div className="flex flex-col gap-1 pt-4">
              {navItems.map((item) => (
                <NavBarItem
                  key={item.label}
                  item={item}
                  onClick={() => setIsOpened(false)}
                />
              ))}
            </div>
          </SheetContent>
        </Sheet>
        <div className="flex items-center gap-2">
          <ConnectWalletButton />
        </div>
      </nav>
    </div>
  );
};

export default MobileNavBar;