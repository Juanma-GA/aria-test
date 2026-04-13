'use client';

import { Toaster as Sonner } from 'sonner';

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: 'bg-white border border-border shadow-panel rounded-sm text-sm font-sans text-text',
          title: 'font-medium text-text',
          description: 'text-muted text-xs',
          actionButton: 'bg-blue-aria text-white text-xs px-2 py-1 rounded-sm',
          cancelButton: 'text-muted text-xs',
          success: 'border-l-4 border-l-green-sov',
          error: 'border-l-4 border-l-red-sov',
          warning: 'border-l-4 border-l-amber-sov',
          info: 'border-l-4 border-l-blue-aria',
        },
      }}
    />
  );
}
