"use client";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NavBarItemType } from "@/types/NavBarItem.type";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

type Props = {
  item: NavBarItemType;
  onClick?: () => void;
  isMobile?: boolean;
};

const NavBarItem: React.FC<Props> = ({ item, onClick, isMobile = false }) => {
  const pathname = usePathname();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const isActive = item.link
    ? pathname === item.link
    : item.children?.some((child) => pathname === child.link) || false;
  const hasActiveChild =
    item.children?.some((child) => pathname === child.link) || false;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isDropdownOpen]);

  const handleMouseEnter = () => {
    if (!isMobile && item.hasDropdown) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setIsDropdownOpen(true);
    }
  };

  const handleMouseLeave = () => {
    if (!isMobile && item.hasDropdown) {
      timeoutRef.current = setTimeout(() => setIsDropdownOpen(false), 200);
    }
  };

  const handleClick = () => {
    if (item.hasDropdown) {
      if (isMobile) setIsDropdownOpen(!isDropdownOpen);
    } else if (onClick) {
      onClick();
    }
  };

  const handleChildClick = () => {
    setIsDropdownOpen(false);
    if (onClick) onClick();
  };

  // Mobile dropdown (accordion)
  if (isMobile && item.hasDropdown) {
    return (
      <div className="w-full">
        <button
          className={cn(
            buttonVariants({ variant: "ghost" }),
            "w-full justify-between text-lg text-[#0F0D0A]/60 hover:text-[#0F0D0A]",
            (hasActiveChild || isActive) && "text-[#0F0D0A]"
          )}
          onClick={handleClick}
        >
          <span>{item.label}</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform duration-200",
              isDropdownOpen && "rotate-180"
            )}
          />
        </button>
        {isDropdownOpen && (
          <div className="ml-4 mt-1 space-y-1">
            {item.children?.map((child) => (
              <Link
                key={child.label}
                href={child.link!}
                className={cn(
                  buttonVariants({ variant: "ghost" }),
                  "w-full justify-start text-base text-[#0F0D0A]/60 hover:text-[#0F0D0A]",
                  pathname === child.link && "text-[#0F0D0A] bg-[#EDE8DF]"
                )}
                onClick={handleChildClick}
              >
                {child.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Desktop dropdown
  if (!isMobile && item.hasDropdown) {
    return (
      <div
        className="relative flex items-center"
        ref={dropdownRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <button
          className={cn(
            buttonVariants({ variant: "ghost" }),
            "flex items-center gap-1 text-lg text-[#0F0D0A]/60 hover:text-[#0F0D0A]",
            (hasActiveChild || isActive) && "text-[#0F0D0A]"
          )}
          onClick={handleClick}
        >
          {item.label}
          <ChevronDown className="h-4 w-4" />
        </button>

        {/* Active indicator — orange, not lime */}
        {(hasActiveChild || isActive) && (
          <div className="absolute -bottom-[2px] left-1/2 h-[2px] w-[80%] -translate-x-1/2 rounded-xl bg-[#E8480A]" />
        )}

        {isDropdownOpen && (
          <div className="absolute top-full left-0 z-50 mt-1 min-w-[200px] rounded-md border border-[#0F0D0A]/10 bg-white p-1 shadow-lg">
            {item.children?.map((child) => (
              <Link
                key={child.label}
                href={child.link!}
                className={cn(
                  "block w-full rounded-sm px-3 py-2 text-sm text-[#0F0D0A]/60 hover:bg-[#F5F0E8] hover:text-[#0F0D0A]",
                  pathname === child.link && "bg-[#F5F0E8] text-[#0F0D0A]"
                )}
                onClick={handleChildClick}
              >
                {child.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Regular link
  return (
    <div className="relative flex items-center w-full">
      <Link
        href={item.link!}
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "w-full justify-start text-lg text-[#0F0D0A]/60 hover:text-[#0F0D0A]",
          isActive && "text-[#0F0D0A]"
        )}
        onClick={onClick}
      >
        {item.label}
      </Link>
      {/* Active indicator — orange, not lime */}
      {isActive && !isMobile && (
        <div className="absolute -bottom-[2px] left-1/2 hidden h-[2px] w-[80%] -translate-x-1/2 rounded-xl bg-[#E8480A] md:block" />
      )}
    </div>
  );
};

export default NavBarItem;