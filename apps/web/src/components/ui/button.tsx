import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer select-none",
  {
    variants: {
      variant: {
        primary: "bg-brand text-white shadow-[0_8px_24px_-10px_var(--pink)] hover:brightness-110",
        secondary: "bg-raised text-text hover:bg-line",
        outline: "border border-line bg-transparent text-text hover:bg-raised",
        ghost: "bg-transparent text-text hover:bg-raised",
        danger: "bg-danger/10 text-danger hover:bg-danger/20",
        link: "text-lilac underline-offset-4 hover:underline px-0",
      },
      size: {
        sm: "h-8 rounded-lg px-3 text-sm",
        md: "h-10 rounded-xl px-4 text-sm",
        lg: "h-12 rounded-xl px-5 text-base",
        icon: "size-10 rounded-xl",
        "icon-sm": "size-8 rounded-lg",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = "Button";
