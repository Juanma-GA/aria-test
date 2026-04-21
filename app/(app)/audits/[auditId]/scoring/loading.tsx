import { Spinner } from '@/components/ui/Spinner';

export default function ScoringLoading() {
  return (
    <div className="flex items-center justify-center h-64">
      <Spinner size="lg" />
    </div>
  );
}
