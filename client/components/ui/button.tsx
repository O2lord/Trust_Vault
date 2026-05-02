import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        // Primary CTA — orange, one per section max
        default:
          "bg-[#E8480A] text-white border border-[#E8480A] hover:bg-[#0F0D0A] hover:border-[#0F0D0A]",
        // Secondary — dark, important but not loudest
        secondary:
          "bg-[#0F0D0A] text-[#F5F0E8] hover:bg-[#0F0D0A]/85",
        // Outline — supporting/paired actions
        outline:
          "border border-[#0F0D0A]/20 bg-transparent text-[#0F0D0A] hover:bg-[#0F0D0A]/6 hover:border-[#0F0D0A]/40",
        // Ghost — nav items, icon buttons, tertiary
        ghost:
          "bg-transparent text-[#0F0D0A]/60 hover:bg-[#0F0D0A]/6 hover:text-[#0F0D0A]",
        // Destructive
        destructive:
          "border border-red-500/40 bg-transparent text-red-600 hover:bg-red-500 hover:text-white",
        // Link
        link:
          "text-[#E8480A] underline-offset-4 hover:underline p-0 h-auto",
        // Legacy alias — maps to default
        gradient:
          "bg-[#E8480A] text-white border border-[#E8480A] hover:bg-[#0F0D0A] hover:border-[#0F0D0A]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }