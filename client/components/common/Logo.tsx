import Link from "next/link";
import React from "react";
import Image from "next/image";

function Logo({ isMobile }: { isMobile?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2">
      {!isMobile && (
        <Image
          src="/logos/shield2.png"
          alt="Trust Vault Logo"
          width="32"
          height="32"
          className="rounded-full"
        />
      )}
      <span className="text-2xl font-bold leading-tight tracking-tighter text-[#0F0D0A]">
        Trust Vault
      </span>
    </Link>
  );
}

export default Logo;