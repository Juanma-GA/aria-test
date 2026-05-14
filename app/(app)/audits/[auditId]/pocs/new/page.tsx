'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { apiUrl } from '@/lib/utils';
import type { UseCase } from '@/lib/types';

export default function NewPOCPage() {
  const { auditId } = useParams<{ auditId: string }>();
  const router = useRouter();
  const [useCases, setUseCases] = useState<UseCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedUC, setSelectedUC] = useState('');

  useEffect(() => {
    fetch(apiUrl(`/api/audits/${auditId}/usecases`), { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        setUseCases(
          Array.isArray(data)
            ? data.filter((u: UseCase) => u.status === 'eligible')
            : [],
        );
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [auditId]);

  const handleCreate = async () => {
    if (!selectedUC) {
      setError('Select a use case.');
      return;
    }
    const uc = useCases.find((u) => u._id === selectedUC);
    if (!uc) return;
    setSaving(true);
    try {
      const res = await fetch(apiUrl(`/api/audits/${auditId}/pocs`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          useCaseId: uc._id,
          processId: uc.processId,
          cuId: uc.cuId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      // Trigger AI fill-design after creation (non-blocking)
      fetch(apiUrl(`/api/audits/${auditId}/pocs/${data._id}/ai/fill-design`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => {});
      router.push(`/audits/${auditId}/pocs/${data._id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.back()}
          className="text-muted hover:text-text"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-xl font-display font-bold">New POC</h1>
      </div>
      <div className="card p-6 space-y-4">
        <div>
          <label className="form-label">Select Use Case (eligible only)</label>
          {useCases.length === 0 ? (
            <p className="text-sm text-muted">
              No eligible use cases. Score use cases in B6 first.
            </p>
          ) : (
            <select
              className="form-input"
              value={selectedUC}
              onChange={(e) => setSelectedUC(e.target.value)}
            >
              <option value="">Choose use case…</option>
              {useCases.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.cuId} — {u.description.slice(0, 60)}
                </option>
              ))}
            </select>
          )}
        </div>
        {error && (
          <div className="text-xs text-red-sov bg-red-sov-light rounded p-2">
            {error}
          </div>
        )}
        <div className="flex gap-3">
          <button
            onClick={handleCreate}
            disabled={saving || !selectedUC}
            className="btn-primary flex-1"
          >
            {saving ? 'Creating…' : 'Create POC'}
          </button>
          <button onClick={() => router.back()} className="btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
