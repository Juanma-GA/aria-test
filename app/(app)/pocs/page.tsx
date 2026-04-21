'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { apiUrl } from '@/lib/utils';
import type { POCPhase, POCDecisionType } from '@/lib/types';

interface GlobalPOC {
  _id: string;
  pocId: string;
  phase: POCPhase;
  decision: {
    decision: POCDecisionType;
    justification: string;
    decidedBy: string;
  };
  execution: {
    milestones: { status: 'pending' | 'done' | 'missed' }[];
  };
  design: {
    startDate: string;
    deadlineDate: string;
    measurableObjective: string;
  };
  createdAt: string;
  audit: { _id: string; name: string; client: string } | null;
  useCase: { _id: string; cuId: string; description: string } | null;
}

const PHASE_VARIANTS: Record<POCPhase, 'blue' | 'amber' | 'purple' | 'slate'> = {
  design: 'blue',
  execution: 'amber',
  evaluation: 'purple',
  closed: 'slate',
};

const PHASE_LABELS: Record<POCPhase, string> = {
  design: 'Design',
  execution: 'Execution',
  evaluation: 'Evaluation',
  closed: 'Closed',
};

const DECISION_VARIANTS: Record<POCDecisionType, 'green' | 'amber' | 'red' | 'slate'> = {
  go: 'green',
  go_conditional: 'amber',
  no_go_redesign: 'red',
  no_go_discard: 'red',
  paused: 'slate',
  pending: 'slate',
};

const DECISION_LABELS: Record<POCDecisionType, string> = {
  go: 'Go',
  go_conditional: 'Go (conditional)',
  no_go_redesign: 'No Go – Redesign',
  no_go_discard: 'No Go – Discard',
  paused: 'Paused',
  pending: 'Pending',
};

export default function GlobalPOCsPage() {
  const [pocs, setPocs] = useState<GlobalPOC[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | POCPhase>('all');
  const [search, setSearch] = useState('');
  const router = useRouter();

  useEffect(() => {
    fetch(apiUrl('/api/pocs'), { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => { setPocs(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = pocs.filter((p) => {
    if (filter !== 'all' && p.phase !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        p.pocId.toLowerCase().includes(q) ||
        p.audit?.name.toLowerCase().includes(q) ||
        p.useCase?.cuId.toLowerCase().includes(q) ||
        p.useCase?.description.toLowerCase().includes(q) ||
        p.design?.measurableObjective?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const counts = {
    all: pocs.length,
    design: pocs.filter((p) => p.phase === 'design').length,
    execution: pocs.filter((p) => p.phase === 'execution').length,
    evaluation: pocs.filter((p) => p.phase === 'evaluation').length,
    closed: pocs.filter((p) => p.phase === 'closed').length,
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" className="text-blue-aria" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-text">POCs</h1>
        <p className="text-sm text-muted mt-0.5">All proof-of-concept experiments across all audits</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-white border border-border rounded-sm p-1">
          {(['all', 'design', 'execution', 'evaluation', 'closed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors capitalize ${
                filter === f ? 'bg-blue-aria text-white' : 'text-muted hover:text-text'
              }`}
            >
              {f === 'all' ? 'All' : PHASE_LABELS[f]} ({counts[f]})
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search POCs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-border rounded-sm px-3 py-1.5 text-sm bg-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue-aria w-64"
        />
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-border rounded-sm p-12 text-center text-muted text-sm">
          No POCs found.
        </div>
      ) : (
        <div className="bg-white border border-border rounded-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-slate-50">
                {['ID', 'Use Case', 'Audit', 'Client', 'Phase', 'Milestones', 'Decision', 'Deadline'].map((h) => (
                  <th key={h} className="text-left py-3 px-4 text-xs font-semibold text-muted uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((poc) => {
                const milestones = poc.execution?.milestones ?? [];
                const done = milestones.filter((m) => m.status === 'done').length;
                const deadline = poc.design?.deadlineDate
                  ? new Date(poc.design.deadlineDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                  : '—';
                return (
                  <tr
                    key={poc._id}
                    className="border-b border-border/50 hover:bg-slate-50 cursor-pointer"
                    onClick={() => poc.audit && router.push(`/audits/${poc.audit._id}/pocs/${poc._id}`)}
                  >
                    <td className="py-3 px-4 font-mono text-xs text-blue-aria font-medium whitespace-nowrap">
                      {poc.pocId}
                    </td>
                    <td className="py-3 px-4 max-w-xs">
                      {poc.useCase ? (
                        <>
                          <span className="font-mono text-xs text-blue-aria">{poc.useCase.cuId}</span>
                          <p className="text-text text-xs line-clamp-1 mt-0.5">{poc.useCase.description}</p>
                        </>
                      ) : '—'}
                    </td>
                    <td className="py-3 px-4 text-xs whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {poc.audit ? (
                        <Link
                          href={`/audits/${poc.audit._id}`}
                          className="text-blue-aria hover:underline"
                        >
                          {poc.audit.name}
                        </Link>
                      ) : '—'}
                    </td>
                    <td className="py-3 px-4 text-xs text-muted whitespace-nowrap">
                      {poc.audit?.client ?? '—'}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <Badge variant={PHASE_VARIANTS[poc.phase]}>
                        {PHASE_LABELS[poc.phase]}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-xs text-muted whitespace-nowrap">
                      {milestones.length > 0 ? (
                        <span className={done === milestones.length ? 'text-green-600 font-medium' : ''}>
                          {done}/{milestones.length} done
                        </span>
                      ) : (
                        <span>—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {poc.decision?.decision && poc.decision.decision !== 'pending' ? (
                        <Badge variant={DECISION_VARIANTS[poc.decision.decision]}>
                          {DECISION_LABELS[poc.decision.decision]}
                        </Badge>
                      ) : (
                        <span className="text-muted text-xs">Pending</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-muted whitespace-nowrap">
                      {deadline}
                    </td>
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
