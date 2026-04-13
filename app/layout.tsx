import type { Metadata } from 'next';
import './globals.css';
import { AppProviders } from '@/components/layout/AppProviders';
import { Toaster } from '@/components/ui/sonner';

export const metadata: Metadata = {
  title: 'ARIA – AI Readiness & Impact Audit',
  description: 'AI Readiness & Impact Audit platform for enterprise AI governance.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
        <Toaster />
      </body>
    </html>
  );
}
