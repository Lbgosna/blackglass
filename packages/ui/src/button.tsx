import { Button as BaseButton, type ButtonProps as BaseButtonProps } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./cn.js";

export const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    defaultVariants: {
      variant: "primary",
    },
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "border border-border bg-card text-card-foreground hover:bg-accent",
        quiet: "text-muted-foreground hover:bg-muted hover:text-foreground",
      },
    },
  },
);

export interface ButtonProps
  extends Omit<BaseButtonProps, "className">,
    VariantProps<typeof buttonVariants> {
  className?: string;
}

export function Button({ className, variant, ...props }: ButtonProps) {
  return <BaseButton className={cn(buttonVariants({ variant }), className)} {...props} />;
}
