import { Button as BaseButton, type ButtonProps as BaseButtonProps } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./cn.js";

export const buttonVariants = cva(
  "inline-flex min-h-11 md:min-h-8 items-center justify-center gap-2 rounded-md px-4 md:px-3 text-[13px] font-semibold outline-none transition-[color,background-color,filter] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    defaultVariants: {
      variant: "primary",
    },
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:brightness-[1.06]",
        secondary: "border border-border bg-transparent text-foreground hover:bg-accent",
        quiet: "text-muted-foreground hover:bg-accent hover:text-foreground",
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
