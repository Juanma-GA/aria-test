'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';

interface POCOption {
  _id: string;
  pocId: string;
  name?: string;
  decision?: { decision?: string };
  useCaseId?: { cuId?: string; description?: string } | string;
}

export default function NewIndustrializationPage() {
  const { auditId } = useParams<{ auditId: string }>();
  const router = useRouter();
  const [pocs, setPocs] = useState<POCOption[]>([]);
  const [usedPocIds, setUsedPocIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedPoc, setSelectedPoc] = useState('');

  useEffect(() => {
    Promise.all([
      fetch(`/api/audits/${auditId}/pocs`, { credentials: 'include' }).then(r => r.json()),
      fetch(`/api/audits/${auditId}/industrializations`, { credentials: 'include' }).then(r => r.json()),
    ])
      .then(([pocsData, indData]) => {
        const allPocs: POCOption[] = Array.isArray(pocsData) ? pocsData : [];
        const eligible = allPocs.filter(p => {
          const d = p.decision?.decision;
          return d === 'go' || d === 'go_conditional';
        });
        setPocs(eligible);
        const used = new Set<string>();
        if (Array.isArray(indData)) {
          for (const i of indData) {
            const pid = typeof i.pocId === 'object' ? i.pocId?._id : i.pocId;
            if (pid) used.add(String(pid));
          }
        }
        setUsedPocIds(used);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [auditId]);

  const available = pocs.filter(p => !usedPocIds.has(String(p._id)));

  const handleCreate = async () => {
    if (!selectedPoc) { setError('Select a validated POC.'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/audits/${auditId}/industrializations/from-poc/${selectedPoc}`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create industrialization');
      router.push(`/audits/${auditId}/industrializations/${data._id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-muted hover:text-text"><ArrowLeft size={18} /></button>
        <h1 className="text-xl font-display font-bold">New Industrialization</h1>
      </div>
      <div className="card p-6 space-y-4">
        <div>
          <label className="form-label">Source POC (validated only)</label>
          <p className="text-[11px] text-muted mb-1.5">Only POCs with decision GO or GO Conditional and not yet industrialized are listed.</p>
          {available.length === 0 ? (
            <p className="text-sm text-muted">
              No eligible POCs. Validate a POC (GO / GO Conditional) before creating an industrialization.
            </p>
          ) : (
            <select className="form-input" value={selectedPoc} onChange={e => setSelectedPoc(e.target.value)}>
              <option value="">Choose POC…</option>
              {available.map(p => {
                const uc = typeof p.useCaseId === 'object' ? p.useCaseId : null;
                const desc = uc?.description ? ` — ${uc.description.slice(0, 50)}` : '';
                const cuId = uc?.cuId ? ` (${uc.cuId})` : '';
                return <option key={p._id} value={p._id}>{p.pocId}{cuId}{desc}</option>;
              })}
            </select>
          )}
        </div>
        {error && <div className="text-xs text-red-sov bg-red-sov-light rounded p-2">{error}</div>}
        <div className="flex gap-3">
          <button onClick={handleCreate} disabled={saving || !selectedPoc} className="btn-primary flex-1">
            {saving ? 'Creating…' : 'Create Industrialization'}
          </button>
          <button onClick={() => router.back()} className="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  );
}
