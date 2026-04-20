'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Plus, Trash2, CheckCircle2, ArrowLeft, Save } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { TagInput } from '@/components/ui/TagInput';
import { useBeforeUnload } from '@/hooks/useBeforeUnload';
import type { Stakeholder, InfluenceLevel, AIAttitude, ProfileEntry } from '@/lib/types';

const AI_ATTITUDE_COLORS: Record<AIAttitude, 'green' | 'teal' | 'slate' | 'amber' | 'red'> = {
  champion: 'green', supporter: 'teal', neutral: 'slate',
  sceptic: 'amber', blocker: 'red', unknown: 'slate',
};

function emptyStakeholder(): Stakeholder {
  return { role: '', name: '', type: 'internal', influenceLevel: 'medium', aiAttitude: 'unknown', notes: '' };
}

function emptyProfile(): ProfileEntry {
  return { id: crypto.randomUUID(), role: '', type: 'internal', count: 1, hourlyRateEur: 0 };
}

export default function B1Page() {
  const { auditId, procId } = useParams<{ auditId: string; procId: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(true);
  const [saveError, setSaveError] = useState('');
  const [processName, setProcessName] = useState('');

  // Audit read-only info
  const [auditClient, setAuditClient] = useState('');
  const [auditProject, setAuditProject] = useState('');

  // Process-level fields
  const [norms, setNorms] = useState<string[]>([]);
  const [certs, setCerts] = useState<string[]>([]);
  const [maturity, setMaturity] = useState(1);

  // B1 fields
  const [b1, setB1] = useState({
    formalName: '',
    department: '',
    contractReference: '',
    captureDate: '',
    numberOfPeople: 0,
    notes: '',
    clientDepartment: '',
    clientResponsible: '',
    technicalDirectorResponsible: '',
  });
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [profiles, setProfiles] = useState<ProfileEntry[]>([]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/audits/${auditId}/processes/${procId}`, { credentials: 'include' }).then(r => r.json()),
      fetch(`/api/audits/${auditId}`, { credentials: 'include' }).then(r => r.json()),
    ]).then(([procData, auditData]) => {
      setProcessName(procData.name || '');
      setNorms(procData.applicableNorms || []);
      setCerts(procData.activeCertifications || []);
      setMaturity(procData.digitalMaturityLevel || 1);
      if (procData.b1) {
        const { stakeholders: sh = [], profiles: pr = [], ...rest } = procData.b1;
        setB1({
          formalName: rest.formalName || '',
          department: rest.department || '',
          contractReference: rest.contractReference || '',
          captureDate: rest.captureDate ? rest.captureDate.slice(0, 10) : '',
          numberOfPeople: rest.numberOfPeople || 0,
          notes: rest.notes || '',
          clientDepartment: rest.clientDepartment || '',
          clientResponsible: rest.clientResponsible || '',
          technicalDirectorResponsible: rest.technicalDirectorResponsible || '',
        });
        setStakeholders(sh);
        setProfiles(pr);
      }
      setAuditClient(auditData.client || '');
      setAuditProject(auditData.project || '');
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [auditId, procId]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch(`/api/audits/${auditId}/processes/${procId}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          b1: { ...b1, stakeholders, profiles },
          applicableNorms: norms,
          activeCertifications: certs,
          digitalMaturityLevel: maturity,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveError(data.error || `Save failed (${res.status})`);
        return;
      }
      setSaved(true);
    } catch (e) {
      setSaveError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const markUnsaved = () => setSaved(false);

  useBeforeUnload(!saved);

  const updateB1 = (field: string, value: string | number) => {
    setB1(prev => ({ ...prev, [field]: value }));
    markUnsaved();
  };

  const updateStakeholder = (i: number, field: string, value: string) => {
    setStakeholders(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s));
    markUnsaved();
  };

  const addStakeholder = () => {
    setStakeholders(prev => [...prev, emptyStakeholder()]);
    markUnsaved();
  };

  const removeStakeholder = (i: number) => {
    setStakeholders(prev => prev.filter((_, idx) => idx !== i));
    markUnsaved();
  };

  const updateProfile = (i: number, field: string, value: string | number) => {
    setProfiles(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p));
    markUnsaved();
  };

  const addProfile = () => {
    setProfiles(prev => [...prev, emptyProfile()]);
    markUnsaved();
  };

  const removeProfile = (i: number) => {
    setProfiles(prev => prev.filter((_, idx) => idx !== i));
    markUnsaved();
  };

  const isComplete = processName.trim() !== '' && stakeholders.length > 0;

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-muted hover:text-text"><ArrowLeft size={18} /></button>
          <Badge variant="slate">B1</Badge>
          <h1 className="text-xl font-display font-bold text-text">Context</h1>
          <span className="text-muted text-sm">— {processName}</span>
          {isComplete && <Badge variant="green"><CheckCircle2 size={12} className="mr-1" />Complete</Badge>}
        </div>
        <button
          onClick={handleSave}
          disabled={saving || saved}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-aria text-white text-sm font-medium rounded-sm hover:bg-blue-aria/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? <Spinner size="sm" /> : <Save size={14} />}
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
        </button>
      </div>

      {saveError && (
        <div className="mb-4 p-3 rounded bg-red-sov-light border border-red-sov/30 text-red-sov text-sm">
          {saveError}
        </div>
      )}

      {/* Two-column form */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Left: Process Identification */}
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-sm text-text">Process Identification</h2>

          {/* Read-only audit info */}
          <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded border border-border">
            <div>
              <p className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-0.5">Client</p>
              <p className="text-sm text-text font-medium">{auditClient || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-0.5">Project</p>
              <p className="text-sm text-text font-medium">{auditProject || '—'}</p>
            </div>
          </div>

          <div>
            <label className="form-label">Contract Reference</label>
            <input
              className="form-input"
              value={b1.contractReference}
              onChange={e => updateB1('contractReference', e.target.value)}
            />
          </div>

          <div>
            <label className="form-label">People Involved</label>
            <input
              type="number"
              className="form-input bg-slate-50 text-muted cursor-not-allowed"
              value={profiles.reduce((s, p) => s + (p.count ?? 1), 0)}
              readOnly
              title="Computed automatically from profiles"
            />
            <p className="text-[11px] text-muted mt-1">Auto-calculated from profiles below</p>
          </div>

          <div>
            <label className="form-label">Capture Date</label>
            <input
              type="date"
              className="form-input"
              value={b1.captureDate}
              onChange={e => updateB1('captureDate', e.target.value)}
            />
          </div>

          <div>
            <label className="form-label">Client Department</label>
            <input
              className="form-input"
              value={b1.clientDepartment}
              onChange={e => updateB1('clientDepartment', e.target.value)}
              placeholder="e.g. Engineering Operations"
            />
          </div>

          <div>
            <label className="form-label">Client Responsible</label>
            <input
              className="form-input"
              value={b1.clientResponsible}
              onChange={e => updateB1('clientResponsible', e.target.value)}
              placeholder="Name of the client contact"
            />
          </div>

          <div>
            <label className="form-label">Technical Director Responsible</label>
            <input
              className="form-input"
              value={b1.technicalDirectorResponsible}
              onChange={e => updateB1('technicalDirectorResponsible', e.target.value)}
              placeholder="Atexis Technical Director"
            />
          </div>
        </div>

        {/* Right: Standards */}
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-sm text-text">Sector & Standards</h2>
          <div>
            <label className="form-label">Applicable Norms</label>
            <TagInput value={norms} onChange={v => { setNorms(v); markUnsaved(); }} placeholder="Type norm + Enter" />
          </div>
          <div>
            <label className="form-label">Active Certifications</label>
            <TagInput value={certs} onChange={v => { setCerts(v); markUnsaved(); }} placeholder="Type cert + Enter" />
          </div>
          <div>
            <label className="form-label">Notes</label>
            <textarea
              rows={4}
              className="form-textarea"
              value={b1.notes}
              onChange={e => updateB1('notes', e.target.value)}
              placeholder="Additional context..."
            />
          </div>
        </div>
      </div>

      {/* Profiles table */}
      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-sm text-text">Profiles</h2>
            <p className="text-xs text-muted mt-0.5">People profiles involved — used for time and cost calculations in B3 and use cases</p>
          </div>
          <button onClick={addProfile} className="btn-primary flex items-center gap-1 text-xs">
            <Plus size={14} /> Add Profile
          </button>
        </div>
        {profiles.length === 0 ? (
          <div className="text-center py-6 text-muted text-sm">No profiles yet. Add profiles to enable cost and ROI calculations.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Role', 'Type', 'Quantity', 'Hourly Rate (€)', ''].map(h => (
                    <th key={h} className="text-left py-2 px-2 text-xs font-medium text-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {profiles.map((p, i) => (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-smoke/50">
                    <td className="py-2 px-2">
                      <input
                        className="form-input text-xs"
                        value={p.role}
                        onChange={e => updateProfile(i, 'role', e.target.value)}
                        placeholder="e.g. Design Engineer"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <select
                        className="form-input text-xs"
                        value={p.type}
                        onChange={e => updateProfile(i, 'type', e.target.value)}
                      >
                        <option value="internal">Internal</option>
                        <option value="client">Client</option>
                      </select>
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="number"
                        min={1}
                        className="form-input text-xs w-20"
                        value={p.count ?? 1}
                        onChange={e => updateProfile(i, 'count', parseInt(e.target.value) || 1)}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="number"
                        min={0}
                        className="form-input text-xs w-28"
                        value={p.hourlyRateEur}
                        onChange={e => updateProfile(i, 'hourlyRateEur', parseFloat(e.target.value) || 0)}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <button onClick={() => removeProfile(i)} className="text-muted hover:text-red-sov"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Stakeholders */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-sm text-text">Stakeholders</h2>
          <button onClick={addStakeholder} className="btn-primary flex items-center gap-1 text-xs">
            <Plus size={14} /> Add Stakeholder
          </button>
        </div>
        {stakeholders.length === 0 ? (
          <div className="text-center py-8 text-muted text-sm">No stakeholders yet. Add at least one to complete B1.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Role', 'Name', 'Type', 'Influence', 'AI Attitude', 'Notes', ''].map(h => (
                    <th key={h} className="text-left py-2 px-2 text-xs font-medium text-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stakeholders.map((s, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-smoke/50">
                    <td className="py-2 px-2">
                      <input className="form-input text-xs" value={s.role} onChange={e => updateStakeholder(i, 'role', e.target.value)} />
                    </td>
                    <td className="py-2 px-2">
                      <input className="form-input text-xs" value={s.name} onChange={e => updateStakeholder(i, 'name', e.target.value)} />
                    </td>
                    <td className="py-2 px-2">
                      <select className="form-input text-xs" value={s.type ?? 'internal'} onChange={e => updateStakeholder(i, 'type', e.target.value)}>
                        <option value="internal">Internal</option>
                        <option value="client">Client</option>
                      </select>
                    </td>
                    <td className="py-2 px-2">
                      <select className="form-input text-xs" value={s.influenceLevel} onChange={e => updateStakeholder(i, 'influenceLevel', e.target.value)}>
                        {(['very_high', 'high', 'medium', 'low'] as InfluenceLevel[]).map(v => (
                          <option key={v} value={v}>{v.replace('_', ' ')}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-2">
                      <select className="form-input text-xs" value={s.aiAttitude} onChange={e => updateStakeholder(i, 'aiAttitude', e.target.value)}>
                        {(['champion', 'supporter', 'neutral', 'sceptic', 'blocker', 'unknown'] as AIAttitude[]).map(v => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-2">
                      <input className="form-input text-xs" value={s.notes} onChange={e => updateStakeholder(i, 'notes', e.target.value)} />
                    </td>
                    <td className="py-2 px-2">
                      <button onClick={() => removeStakeholder(i)} className="text-muted hover:text-red-sov"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {stakeholders.some(s => s.aiAttitude !== 'unknown') && (
          <div className="mt-3 flex flex-wrap gap-2">
            {stakeholders.filter(s => s.aiAttitude !== 'unknown').map((s, i) => (
              <span key={i} className="flex items-center gap-1 text-xs">
                <span className="text-muted">{s.name || 'Stakeholder'}:</span>
                <Badge variant={AI_ATTITUDE_COLORS[s.aiAttitude]}>{s.aiAttitude}</Badge>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Sticky save bar */}
      {!saved && (
        <div className="fixed bottom-6 right-6 z-50">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-aria text-white font-medium rounded-sm shadow-lg hover:bg-blue-aria/90 disabled:opacity-60 transition-colors"
          >
            {saving ? <Spinner size="sm" /> : <Save size={15} />}
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}
    </div>
  );
}
