import { Spinner } from '@/components/ui/Spinner';

export default function DashboardLoading() {
  return (
    <div className="flex items-center justify-center py-20">
      <Spinner size="lg" className="text-blue-aria" />
    </div>
  );
}
