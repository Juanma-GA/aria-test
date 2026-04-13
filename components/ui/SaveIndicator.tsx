'use client';
import { Check, Loader2, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';

export type SaveStatus = 'saved' | 'saving' | 'unsaved';

interface SaveIndicatorProps {
  status: SaveStatus;
  className?: string;
}

const CONFIG: Record<SaveStatus, { icon: React.ReactNode; label: string; color: string }> = {
  saved: {
    icon: <Check size={12} />,
    label: 'Saved',
    color: 'text-green-sov',
  },
  saving: {
    icon: <Loader2 size={12} className="animate-spin" />,
    label: 'Saving…',
    color: 'text-muted',
  },
  unsaved: {
    icon: <AlertCircle size={12} />,
    label: 'Unsaved changes',
    color: 'text-amber-sov',
  },
};

export function SaveIndicator({ status, className }: SaveIndicatorProps) {
  const { icon, label, color } = CONFIG[status];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 text-xs font-medium transition-colors',
        color,
        className
      )}
    >
      {icon}
      {label}
    </span>
  );
}
