'use client';
import { clsx } from 'clsx';

type Variant = 'default' | 'green' | 'amber' | 'red' | 'blue' | 'purple' | 'teal' | 'slate' | 'indu';

interface BadgeProps {
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
}

const VARIANTS: Record<Variant, string> = {
  default: 'bg-slate-100 text-slate-700',
  green: 'bg-green-sov-light text-green-sov border border-green-sov/20',
  amber: 'bg-amber-sov-light text-amber-sov border border-amber-sov/20',
  red: 'bg-red-sov-light text-red-sov border border-red-sov/20',
  blue: 'bg-blue-pale text-blue-aria border border-blue-aria/20',
  purple: 'bg-purple-aria-light text-purple-aria border border-purple-aria/20',
  teal: 'bg-teal-poc-light text-teal-poc border border-teal-poc/20',
  slate: 'bg-slate-100 text-slate-600 border border-slate-200',
  indu: 'bg-indu-light text-indu border border-indu/20',
};

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
        VARIANTS[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
