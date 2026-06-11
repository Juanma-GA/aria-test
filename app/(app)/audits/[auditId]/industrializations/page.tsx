'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Plus, ArrowLeft, Factory } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import type { Industrialization, IndustrializationStatus } from '@/lib/types';
import { apiUrl } from '@/lib/utils';
import { INDUSTRIALIZATION_STATUS_LABELS } from '@/lib/types';

const STATUS_VARIANTS: Record<
  IndustrializationStatus,
  'slate' | 'blue' | 'amber' | 'green' | 'purple' | 'red'
> = {
  pending_customer_validation: 'amber',
  planned: 'slate',
  work_in_progress: 'blue',
  go_for_run: 'green',
  stand_by: 'purple',
  cancelled: 'red',
};

type EnrichedIndustrialization = Omit<
  Industrialization,
  'processId' | 'useCaseId' | 'pocId'
> & {
  processId?: { procId?: string; name?: string } | string;
  useCaseId?: { cuId?: string; description?: string } | string;
  pocId?: { pocId?: string; name?: string } | string;
};

export default function IndustrializationsPage() {
  const { auditId } = useParams<{ auditId: string }>();
  const router = useRouter();
  const [items, setItems] = useState<EnrichedIndustrialization[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(
      apiUrl(
        `/api/audits/${auditId}/industrializations${showArchived ? '?archived=true' : ''}`,
      ),
      { credentials: 'include' },
    )
      .then((r) => r.json())
      .then((data) => {
        setItems(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [auditId, showArchived]);

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="text-muted hover:text-text"
          >
            <ArrowLeft size={18} />
          </button>
          <Factory size={20} className="text-indu" />
          <h1 className="text-xl font-display font-bold text-text">
            Industrializations
          </h1>
          <span className="text-muted text-sm">— {items.length}</span>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="accent-blue-aria"
            />
            Show archived
          </label>
          <button
            onClick={() =>
              router.push(`/audits/${auditId}/industrializations/new`)
            }
            className="btn-primary flex items-center gap-1"
          >
            <Plus size={14} /> New Industrialization
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card p-12 text-center text-muted text-sm">
          No industrializations yet. Create one from a validated POC (decision:
          GO or GO Conditional).
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-smoke border-b border-border">
              <tr>
                {[
                  'IND-ID',
                  'Name',
                  'POC',
                  'Use Case',
                  'Process',
                  'Owner',
                  'Target Go-Live',
                  'Status',
                  '',
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left py-2 px-3 text-xs font-medium text-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((ind) => {
                const proc =
                  typeof ind.processId === 'object' ? ind.processId : null;
                const uc =
                  typeof ind.useCaseId === 'object' ? ind.useCaseId : null;
                const poc = typeof ind.pocId === 'object' ? ind.pocId : null;
                const procLabel = proc?.procId
                  ? `${proc.procId}${proc.name ? ' · ' + proc.name : ''}`
                  : '—';
                const target = ind.plan?.targetGoLiveDate
                  ? new Date(ind.plan.targetGoLiveDate).toLocaleDateString()
                  : '—';
                return (
                  <tr
                    key={ind._id}
                    className={`border-b border-border/50 hover:bg-smoke/30 cursor-pointer ${ind.isArchived ? 'opacity-60 bg-smoke/40' : ''}`}
                    onClick={() =>
                      router.push(
                        `/audits/${auditId}/industrializations/${ind._id}`,
                      )
                    }
                  >
                    <td className="py-3 px-3 font-mono text-xs font-medium text-indu">
                      {ind.industrializationId}
                    </td>
                    <td className="py-3 px-3 text-xs text-text font-medium">
                      {ind.name || <span className="text-muted">—</span>}
                    </td>
                    <td className="py-3 px-3 font-mono text-xs text-teal-poc">
                      {poc?.pocId ?? '—'}
                    </td>
                    <td className="py-3 px-3 text-muted text-xs">
                      {uc?.cuId ?? '—'}
                    </td>
                    <td className="py-3 px-3 text-xs text-muted">
                      {procLabel}
                    </td>
                    <td className="py-3 px-3 text-xs">
                      {ind.plan?.ownerBusiness ||
                        ind.plan?.ownerTechnical ||
                        '—'}
                    </td>
                    <td className="py-3 px-3 text-xs text-muted">{target}</td>
                    <td className="py-3 px-3">
                      <Badge variant={STATUS_VARIANTS[ind.status]}>
                        {INDUSTRIALIZATION_STATUS_LABELS[ind.status]}
                      </Badge>
                    </td>
                    <td className="py-3 px-3 text-blue-aria text-xs">Open →</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
