'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Factory, Search } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import type { Industrialization, IndustrializationStatus } from '@/lib/types';
import { INDUSTRIALIZATION_STATUS_LABELS } from '@/lib/types';

const STATUS_VARIANTS: Record<IndustrializationStatus, 'slate' | 'blue' | 'amber' | 'green' | 'purple' | 'red'> = {
  pending_customer_validation: 'amber',
  planned: 'slate',
  work_in_progress: 'blue',
  go_for_run: 'green',
  stand_by: 'purple',
  cancelled: 'red',
};

interface GlobalIndustrialization extends Industrialization {
  audit: { _id: string; name: string; client?: string } | null;
  useCase: { _id: string; cuId: string; description?: string } | null;
  poc: { _id: string; pocId: string; name?: string; phase?: string; decision?: { decision?: string } } | null;
  processId?: { procId?: string; name?: string } | string;
}

const STATUS_FILTERS: Array<'all' | IndustrializationStatus> = [
  'all', 'pending_customer_validation', 'planned', 'work_in_progress', 'go_for_run', 'stand_by', 'cancelled',
];

export default function GlobalIndustrializationsPage() {
  const [items, setItems] = useState<GlobalIndustrialization[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | IndustrializationStatus>('all');
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setLoading(true);
    fetch(`/api/industrializations${showArchived ? '?archived=true' : ''}`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => { setItems(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [showArchived]);

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" className="text-blue-aria" /></div>;

  const filtered = items.filter(i => {
    if (filter !== 'all' && i.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        i.industrializationId.toLowerCase().includes(q) ||
        (i.name?.toLowerCase().includes(q) ?? false) ||
        (i.audit?.name.toLowerCase().includes(q) ?? false) ||
        (i.useCase?.cuId.toLowerCase().includes(q) ?? false) ||
        (i.poc?.pocId.toLowerCase().includes(q) ?? false)
      );
    }
    return true;
  });

  const counts = STATUS_FILTERS.reduce<Record<string, number>>((acc, k) => {
    acc[k] = k === 'all' ? items.length : items.filter(i => i.status === k).length;
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Factory size={20} className="text-indu" />
        <h1 className="font-display text-2xl font-bold text-text">Global Industrializations</h1>
        <span className="text-sm text-muted">— {items.length}</span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 bg-white border border-border rounded-sm p-1">
          {STATUS_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${filter === f ? 'bg-blue-aria text-white' : 'text-muted hover:text-text'}`}
            >
              {f === 'all' ? `All (${counts[f]})` : `${INDUSTRIALIZATION_STATUS_LABELS[f as IndustrializationStatus]} (${counts[f]})`}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by IND-ID, audit, POC…"
            className="form-input w-full pl-8 text-xs h-8"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="accent-blue-aria" />
          Show archived
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="card p-12 text-center text-muted text-sm">No industrializations match the current filters.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-smoke border-b border-border">
              <tr>
                {['IND-ID', 'Name', 'Audit', 'POC', 'Use Case', 'Status', 'Target', ''].map(h => (
                  <th key={h} className="text-left py-2 px-3 text-xs font-medium text-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(i => {
                const target = i.plan?.targetGoLiveDate ? new Date(i.plan.targetGoLiveDate).toLocaleDateString() : '—';
                return (
                  <tr
                    key={i._id}
                    className={`border-b border-border/50 hover:bg-smoke/30 cursor-pointer ${i.isArchived ? 'opacity-60 bg-smoke/40' : ''}`}
                    onClick={() => i.audit && router.push(`/audits/${i.audit._id}/industrializations/${i._id}`)}
                  >
                    <td className="py-3 px-3 font-mono text-xs font-medium text-indu">{i.industrializationId}</td>
                    <td className="py-3 px-3 text-xs text-text font-medium">{i.name || <span className="text-muted">—</span>}</td>
                    <td className="py-3 px-3 text-xs">
                      <div className="font-medium">{i.audit?.name ?? '—'}</div>
                      {i.audit?.client && <div className="text-muted text-[10px]">{i.audit.client}</div>}
                    </td>
                    <td className="py-3 px-3 font-mono text-xs text-teal-poc">{i.poc?.pocId ?? '—'}</td>
                    <td className="py-3 px-3 text-xs text-muted">{i.useCase?.cuId ?? '—'}</td>
                    <td className="py-3 px-3"><Badge variant={STATUS_VARIANTS[i.status]}>{INDUSTRIALIZATION_STATUS_LABELS[i.status]}</Badge></td>
                    <td className="py-3 px-3 text-xs text-muted">{target}</td>
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
