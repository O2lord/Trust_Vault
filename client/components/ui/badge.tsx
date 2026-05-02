import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/**
 * Trust Vault Badge
 * default   → orange (primary brand accent)
 * secondary → dark/cream (neutral label)
 * outline   → bordered, no fill
 * success   → warm green (status: filled, complete)
 * warning   → amber (status: pending, reserved)
 * destructive → muted red (status: failed, cancelled)
 */
const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        // orange — highlight / type label
        default:
          "border-[#E8480A]/30 bg-[#E8480A]/10 text-[#E8480A] dark:border-[#E8480A]/40 dark:bg-[#E8480A]/15 dark:text-[#E8480A]",
        // neutral label
        secondary:
          "border-[#0F0D0A]/15 bg-[#0F0D0A]/6 text-[#0F0D0A]/75 dark:border-[#F5F0E8]/15 dark:bg-[#F5F0E8]/8 dark:text-[#F5F0E8]/70",
        // just a border
        outline:
          "border-[#0F0D0A]/25 bg-transparent text-[#0F0D0A]/75 dark:border-[#F5F0E8]/25 dark:text-[#F5F0E8]/70",
        // green — positive status
        success:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-400",
        // amber — pending / reserved
        warning:
          "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-400",
        // muted red — danger / cancelled
        destructive:
          "border-red-500/30 bg-red-500/10 text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }