import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-sm text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-aria',
  {
    variants: {
      variant: {
        primary:   'bg-blue-aria text-white hover:bg-blue-700',
        secondary: 'border border-border text-text bg-white hover:bg-smoke',
        danger:    'bg-red-sov text-white hover:bg-red-800',
        ghost:     'text-muted hover:text-text hover:bg-smoke',
        link:      'text-blue-aria underline-offset-4 hover:underline p-0 h-auto',
      },
      size: {
        sm:   'px-3 py-1.5 text-xs',
        md:   'px-4 py-2',
        lg:   'px-5 py-2.5 text-base',
        icon: 'p-2',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
