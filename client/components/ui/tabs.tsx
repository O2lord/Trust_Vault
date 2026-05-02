"use client"
import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center justify-center rounded-lg p-1",
      className
    )}
    style={{ background: 'rgba(15,13,10,0.10)' }}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  const innerRef = React.useRef<HTMLButtonElement>(null);

  // Merge refs
  const mergedRef = (node: HTMLButtonElement) => {
    (innerRef as React.MutableRefObject<HTMLButtonElement | null>).current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node;
  };

  const updateStyle = React.useCallback(() => {
    const el = innerRef.current;
    if (!el) return;
    const isActive = el.dataset.state === 'active';
    el.style.color = isActive ? '#0F0D0A' : 'rgba(15,13,10,0.60)';
    el.style.background = isActive ? '#FFFFFF' : 'transparent';
    el.style.borderBottom = isActive ? '2px solid #E8480A' : 'none';
    el.style.boxShadow = isActive ? '0 1px 3px rgba(0,0,0,0.1)' : 'none';
  }, []);

  // Use MutationObserver to react to data-state changes
  React.useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    updateStyle();
    const observer = new MutationObserver(updateStyle);
    observer.observe(el, { attributes: true, attributeFilter: ['data-state'] });
    return () => observer.disconnect();
  }, [updateStyle]);

  return (
    <TabsPrimitive.Trigger
      ref={mergedRef}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium",
        "transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      style={{ color: 'rgba(15,13,10,0.60)' }}
      {...props}
    />
  );
})
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }