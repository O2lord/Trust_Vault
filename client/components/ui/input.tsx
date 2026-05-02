import * as React from "react"
import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Base
          "flex h-10 w-full rounded-md px-3 py-2 text-sm",
          // Light
          "bg-white border border-[#0F0D0A]/20 text-[#0F0D0A] placeholder:text-[#0F0D0A]/35",
          // Dark
          "dark:bg-[#0F0D0A]/40 dark:border-[#F5F0E8]/15 dark:text-[#F5F0E8] dark:placeholder:text-[#F5F0E8]/35",
          // Focus: orange ring
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8480A]/60 focus-visible:border-[#E8480A]",
          "ring-offset-background",
          // File input
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          // Disabled
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }