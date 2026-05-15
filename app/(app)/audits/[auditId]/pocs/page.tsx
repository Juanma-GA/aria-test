'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Plus, ArrowLeft, Download } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import type { POC } from '@/lib/types';
import { apiUrl } from '@/lib/utils';

const PHASE_COLORS = {
  design: 'slate',
  execution: 'blue',
  evaluation: 'amber',
  closed: 'green',
} as const;
const DECISION_COLORS = {
  go: 'green',
  go_conditional: 'teal',
  no_go_redesign: 'amber',
  no_go_discard: 'red',
  paused: 'purple',
  pending: 'slate',
} as const;
const DECISION_LABELS = {
  go: 'GO',
  go_conditional: 'GO Conditional',
  no_go_redesign: 'No-Go – Redesign',
  no_go_discard: 'No-Go – Discard',
  paused: 'Paused',
  pending: 'Pending',
};

type EnrichedPOC = POC & {
  cuId?: string;
  processData?: { procId: string; name: string };
  /** Server-resolved user name for design.responsibleUserId (when it stored an ObjectId). */
  responsibleName?: string;
};

export default function POCsPage() {
  const { auditId } = useParams<{ auditId: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [pocs, setPocs] = useState<EnrichedPOC[]>([]);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(
      apiUrl(
        `/api/audits/${auditId}/pocs${showArchived ? '?archived=true' : ''}`,
      ),
      { credentials: 'include' },
    )
      .then((r) => r.json())
      .then((data) => {
        setPocs(Array.isArray(data) ? data : []);
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
          <Badge variant="teal">B8</Badge>
          <h1 className="text-xl font-display font-bold text-text">
            POC Tracker
          </h1>
          <span className="text-muted text-sm">— {pocs.length} POCs</span>
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
          <a
            href={`/api/audits/${auditId}/export/pocs`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted border border-border rounded-sm hover:border-blue-aria hover:text-blue-aria transition-colors"
          >
            <Download size={13} />
            Export CSV
          </a>
          <button
            onClick={() => router.push(`/audits/${auditId}/pocs/new`)}
            className="btn-primary flex items-center gap-1"
          >
            <Plus size={14} /> New POC
          </button>
        </div>
      </div>

      {pocs.length === 0 ? (
        <div className="card p-12 text-center text-muted text-sm">
          No POCs yet. Create a POC from an eligible use case.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-smoke border-b border-border">
              <tr>
                {[
                  'POC-ID',
                  'Name',
                  'Use Case',
                  'Process',
                  'Responsible',
                  'Start',
                  'Deadline',
                  'Phase',
                  'Decision',
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
              {pocs.map((poc) => {
                const pd = poc.processData ?? (poc as any).processId;
                const procLabel =
                  pd?.procId && pd?.name
                    ? `${pd.procId} · ${pd.name}`
                    : (pd?.procId ?? '—');
                return (
                  <tr
                    key={poc._id}
                    className={`border-b border-border/50 hover:bg-smoke/30 cursor-pointer ${(poc as any).isArchived ? 'opacity-60 bg-smoke/40' : ''}`}
                    onClick={() =>
                      router.push(`/audits/${auditId}/pocs/${poc._id}`)
                    }
                  >
                    <td className="py-3 px-3 font-mono text-xs text-teal-poc font-medium">
                      {poc.pocId}
                    </td>
                    <td className="py-3 px-3 text-xs text-text font-medium">
                      {poc.name || <span className="text-muted">—</span>}
                    </td>
                    <td className="py-3 px-3 text-muted text-xs">
                      {poc.cuId ||
                        (poc as any).useCaseId?.cuId ||
                        poc.useCaseId?.toString().slice(-6)}
                    </td>
                    <td className="py-3 px-3 text-xs text-muted">
                      {procLabel}
                    </td>
                    <td className="py-3 px-3 text-xs">
                      {poc.responsibleName ||
                        (poc.design?.responsibleUserId &&
                        !/^[a-f0-9]{24}$/i.test(poc.design.responsibleUserId)
                          ? poc.design.responsibleUserId
                          : null) ||
                        '—'}
                    </td>
                    <td className="py-3 px-3 text-xs text-muted">
                      {poc.design?.startDate
                        ? new Date(poc.design.startDate).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="py-3 px-3 text-xs text-muted">
                      {poc.design?.deadlineDate
                        ? new Date(poc.design.deadlineDate).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="py-3 px-3">
                      <Badge variant={PHASE_COLORS[poc.phase]}>
                        {poc.phase}
                      </Badge>
                    </td>
                    <td className="py-3 px-3">
                      <Badge
                        variant={
                          DECISION_COLORS[poc.decision?.decision || 'pending']
                        }
                      >
                        {DECISION_LABELS[poc.decision?.decision || 'pending']}
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
