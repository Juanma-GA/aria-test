'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import type { POC, POCPhase, POCDecisionType } from '@/lib/types';

// Full POC shape enriched with audit + useCase resolved from the reference UC.
// processId may be populated (object) or a raw string depending on the query.
export type GlobalPOC = Omit<POC, 'processId'> & {
  processId?: { procId?: string; name?: string } | string;
  responsibleName?: string;
  audit: { _id: string; name: string; client: string } | null;
  useCase: { _id: string; cuId: string; description: string } | null;
};

interface PocListTableProps {
  pocs: GlobalPOC[];
  showAuditColumn?: boolean;
  onRowClick?: (poc: GlobalPOC) => void;
}

const PHASE_VARIANTS: Record<POCPhase, 'blue' | 'amber' | 'purple' | 'green' | 'slate' | 'teal'> = {
  design: 'blue',
  execution: 'amber',
  evaluation: 'purple',
  decision: 'teal',
  closed: 'green',
};

const PHASE_LABELS: Record<POCPhase, string> = {
  design: 'Design',
  execution: 'Execution',
  evaluation: 'Evaluation',
  decision: 'Decision',
  closed: 'Closed',
};

const DECISION_VARIANTS: Record<POCDecisionType, 'green' | 'amber' | 'red' | 'slate' | 'teal'> = {
  go: 'green',
  go_conditional: 'teal',
  no_go_redesign: 'red',
  no_go_discard: 'red',
  paused: 'slate',
  pending: 'slate',
};

const DECISION_LABELS: Record<POCDecisionType, string> = {
  go: 'GO',
  go_conditional: 'GO Conditional',
  no_go_redesign: 'No-Go – Redesign',
  no_go_discard: 'No-Go – Discard',
  paused: 'Paused',
  pending: 'Pending',
};

export function PocListTable({ pocs, showAuditColumn = true, onRowClick }: PocListTableProps) {
  const headers = [
    'ID',
    'POC Name',
    'Reference UC',
    ...(showAuditColumn ? ['Audit', 'Client'] : []),
    'Process',
    'Instances',
    'Phase',
    'Decision',
    'Milestones',
    'Deadline',
  ];

  return (
    <div className="bg-white border border-border rounded-sm overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-slate-50">
            {headers.map(h => (
              <th
                key={h}
                className="text-left py-3 px-4 text-xs font-semibold text-muted uppercase tracking-wide whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pocs.map(poc => {
            const milestones = poc.execution?.milestones ?? [];
            const done = milestones.filter(m => m.status === 'done').length;
            const deadline = poc.design?.deadlineDate
              ? new Date(poc.design.deadlineDate).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })
              : '—';
            const instanceCount = (poc.useCaseIds?.length ?? 0) - 1;
            const pd =
              typeof poc.processId === 'object' && poc.processId !== null
                ? (poc.processId as { procId?: string; name?: string })
                : null;
            const procLabel =
              pd?.procId && pd?.name ? `${pd.procId} · ${pd.name}` : (pd?.procId ?? '—');
            const isClickable = !!poc.audit?._id && !!onRowClick;

            // Show the actual decision badge regardless of phase; 'pending' if not set
            const decisionValue: POCDecisionType =
              poc.decision?.decision && poc.decision.decision !== 'pending'
                ? poc.decision.decision
                : 'pending';

            return (
              <tr
                key={poc._id}
                title={
                  !poc.audit
                    ? 'Reference UC not available — cannot navigate to detail'
                    : undefined
                }
                className={`border-b border-border/50 ${
                  isClickable ? 'hover:bg-slate-50 cursor-pointer' : 'cursor-default'
                } ${poc.isArchived || !poc.audit ? 'opacity-60' : ''}`}
                onClick={() => isClickable && onRowClick!(poc)}
              >
                <td className="py-3 px-4 font-mono text-xs text-blue-aria font-medium whitespace-nowrap">
                  {poc.pocId}
                </td>
                <td className="py-3 px-4 text-xs text-text whitespace-nowrap">
                  {poc.name || '—'}
                </td>
                <td className="py-3 px-4 max-w-xs">
                  {poc.useCase ? (
                    <>
                      <span className="font-mono text-xs text-blue-aria">
                        {poc.useCase.cuId}
                      </span>
                      <p
                        className="text-text text-xs line-clamp-1 mt-0.5"
                        title={poc.useCase.description}
                      >
                        {poc.useCase.description}
                      </p>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                {showAuditColumn && (
                  <>
                    <td
                      className="py-3 px-4 text-xs whitespace-nowrap"
                      onClick={e => e.stopPropagation()}
                    >
                      {poc.audit ? (
                        <Link
                          href={`/audits/${poc.audit._id}`}
                          className="text-blue-aria hover:underline"
                        >
                          {poc.audit.name}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-muted whitespace-nowrap">
                      {poc.audit?.client ?? '—'}
                    </td>
                  </>
                )}
                <td className="py-3 px-4 text-xs text-muted whitespace-nowrap">
                  {procLabel}
                </td>
                <td className="py-3 px-4 text-xs text-muted whitespace-nowrap">
                  {instanceCount > 0 ? `+${instanceCount}` : '—'}
                </td>
                <td className="py-3 px-4 whitespace-nowrap">
                  <Badge variant={PHASE_VARIANTS[poc.phase]}>{PHASE_LABELS[poc.phase]}</Badge>
                </td>
                <td className="py-3 px-4 whitespace-nowrap">
                  {decisionValue !== 'pending' ? (
                    <Badge variant={DECISION_VARIANTS[decisionValue]}>
                      {DECISION_LABELS[decisionValue]}
                    </Badge>
                  ) : (
                    <span className="text-muted text-xs">Pending</span>
                  )}
                </td>
                <td className="py-3 px-4 text-xs text-muted whitespace-nowrap">
                  {milestones.length > 0 ? (
                    <span className={done === milestones.length ? 'text-green-600 font-medium' : ''}>
                      {done}/{milestones.length} done
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="py-3 px-4 text-xs text-muted whitespace-nowrap">{deadline}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
