import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { PageCodeProvider } from '@/context/PageCodeContext';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageCodeProvider>
      <div className="flex h-screen bg-smoke overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-y-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </PageCodeProvider>
  );
}
