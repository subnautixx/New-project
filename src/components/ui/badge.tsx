import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset transition-colors",
  {
    variants: {
      variant: {
        default: "bg-secondary text-secondary-foreground ring-border",
        outline: "bg-transparent text-muted-foreground ring-border",
        success: "bg-emerald-500/12 text-emerald-300 ring-emerald-500/25",
        warning: "bg-amber-500/12 text-amber-300 ring-amber-500/25",
        danger: "bg-red-500/12 text-red-300 ring-red-500/25",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
