'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui/Spinner';
import { apiUrl } from '@/lib/utils';
import { PocListTable, type GlobalPOC } from '@/components/pocs/PocListTable';
import type { POCPhase } from '@/lib/types';

const PHASE_LABELS: Record<POCPhase, string> = {
  design: 'Design',
  execution: 'Execution',
  evaluation: 'Evaluation',
  decision: 'Decision',
  closed: 'Closed',
};

export default function GlobalPOCsPage() {
  const [pocs, setPocs] = useState<GlobalPOC[]>([]);
  const [loading, setLoading] = useState(true);
  const [phaseFilter, setPhaseFilter] = useState<'all' | POCPhase>('all');
  const [auditFilter, setAuditFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const router = useRouter();

  useEffect(() => {
    fetch(apiUrl('/api/pocs'), { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        setPocs(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Distinct audits derived from results for the dropdown
  const auditOptions = Array.from(
    new Map(
      pocs
        .filter(p => p.audit?._id)
        .map(p => [p.audit!._id, p.audit!] as [string, NonNullable<GlobalPOC['audit']>])
    ).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  const filtered = pocs.filter(p => {
    if (phaseFilter !== 'all' && p.phase !== phaseFilter) return false;
    if (auditFilter !== 'all' && p.audit?._id !== auditFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        p.pocId.toLowerCase().includes(q) ||
        (p.audit?.name ?? '').toLowerCase().includes(q) ||
        (p.useCase?.cuId ?? '').toLowerCase().includes(q) ||
        (p.useCase?.description ?? '').toLowerCase().includes(q) ||
        (p.name ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const phaseCounts = (
    ['all', 'design', 'execution', 'evaluation', 'decision', 'closed'] as const
  ).map(f => ({
    key: f,
    count: f === 'all' ? pocs.length : pocs.filter(p => p.phase === f).length,
  }));

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
        <p className="text-sm text-muted mt-0.5">
          All proof-of-concept experiments across all audits
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Phase tabs */}
        <div className="flex gap-1 bg-white border border-border rounded-sm p-1">
          {phaseCounts.map(({ key, count }) => (
            <button
              key={key}
              onClick={() => setPhaseFilter(key)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors capitalize ${
                phaseFilter === key ? 'bg-blue-aria text-white' : 'text-muted hover:text-text'
              }`}
            >
              {key === 'all' ? 'All' : PHASE_LABELS[key]} ({count})
            </button>
          ))}
        </div>
        {/* Audit dropdown */}
        <select
          value={auditFilter}
          onChange={e => setAuditFilter(e.target.value)}
          className="border border-border rounded-sm px-3 py-1.5 text-sm bg-white text-text focus:outline-none focus:ring-2 focus:ring-blue-aria"
        >
          <option value="all">All audits</option>
          {auditOptions.map(a => (
            <option key={a._id} value={a._id}>
              {a.name}
            </option>
          ))}
        </select>
        {/* Text search */}
        <input
          type="text"
          placeholder="Search POCs…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-border rounded-sm px-3 py-1.5 text-sm bg-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue-aria w-64"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-border rounded-sm p-12 text-center text-muted text-sm">
          No POCs found.
        </div>
      ) : (
        <PocListTable
          pocs={filtered}
          showAuditColumn={true}
          onRowClick={poc => {
            if (!poc.audit?._id) return;
            router.push(`/audits/${poc.audit._id}/pocs/${poc._id}`);
          }}
        />
      )}
    </div>
  );
}
