'use client';

import { Plus, Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import type { Industrialization, IndustrializationRisk } from '@/lib/types';

interface Props {
  risks: IndustrializationRisk[];
  changeManagement: Industrialization['changeManagement'];
  onRisksChange: (risks: IndustrializationRisk[]) => void;
  onChangeManagementChange: (cm: Industrialization['changeManagement']) => void;
}

const SEVERITY_VARIANTS: Record<IndustrializationRisk['severity'], string> = {
  low: 'border-border text-muted',
  medium: 'border-amber-sov text-amber-700',
  high: 'border-red-sov text-red-sov',
};

const SEVERITY_ACTIVE: Record<IndustrializationRisk['severity'], string> = {
  low: 'bg-slate-200 text-text border-slate-300',
  medium: 'bg-amber-sov text-white border-amber-sov',
  high: 'bg-red-sov text-white border-red-sov',
};

export function RisksEditor({ risks, changeManagement, onRisksChange, onChangeManagementChange }: Props) {
  const addRisk = () => {
    const r: IndustrializationRisk = { id: uuidv4(), description: '', severity: 'medium', mitigation: '' };
    onRisksChange([...(risks ?? []), r]);
  };

  const updateRisk = (id: string, field: keyof IndustrializationRisk, value: any) => {
    onRisksChange((risks ?? []).map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const removeRisk = (id: string) => {
    onRisksChange((risks ?? []).filter(r => r.id !== id));
  };

  return (
    <div className="space-y-5">
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Risk register</h3>
          <button onClick={addRisk} className="btn-secondary text-xs flex items-center gap-1"><Plus size={12} /> Add risk</button>
        </div>
        {(risks ?? []).length === 0 ? (
          <p className="text-xs text-muted">No risks logged.</p>
        ) : (
          <div className="space-y-2">
            {(risks ?? []).map(r => (
              <div key={r.id} className="border border-border rounded p-3 space-y-2">
                <div className="grid md:grid-cols-12 gap-2 items-start">
                  <input
                    className="form-input md:col-span-7 text-xs"
                    placeholder="Risk description"
                    value={r.description}
                    onChange={e => updateRisk(r.id, 'description', e.target.value)}
                  />
                  <div className="md:col-span-4 flex gap-1">
                    {(['low', 'medium', 'high'] as const).map(s => {
                      const isActive = r.severity === s;
                      return (
                        <button
                          key={s}
                          onClick={() => updateRisk(r.id, 'severity', s)}
                          className={`flex-1 text-[11px] px-2 py-1 rounded border capitalize ${isActive ? SEVERITY_ACTIVE[s] : SEVERITY_VARIANTS[s] + ' hover:bg-smoke'}`}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={() => removeRisk(r.id)} className="md:col-span-1 text-muted hover:text-red-sov justify-self-end p-1"><Trash2 size={14} /></button>
                </div>
                <textarea
                  className="form-textarea text-xs"
                  placeholder="Mitigation plan"
                  rows={2}
                  value={r.mitigation}
                  onChange={e => updateRisk(r.id, 'mitigation', e.target.value)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-5 space-y-3">
        <h3 className="text-sm font-semibold">Change management</h3>
        <div>
          <label className="form-label">Training plan</label>
          <textarea
            className="form-textarea"
            rows={3}
            value={changeManagement?.trainingPlan ?? ''}
            onChange={e => onChangeManagementChange({ ...changeManagement, trainingPlan: e.target.value })}
            placeholder="End-user training, documentation, train-the-trainer…"
          />
        </div>
        <div>
          <label className="form-label">Communication plan</label>
          <textarea
            className="form-textarea"
            rows={3}
            value={changeManagement?.communicationPlan ?? ''}
            onChange={e => onChangeManagementChange({ ...changeManagement, communicationPlan: e.target.value })}
            placeholder="Stakeholder comms, kickoff, rollout announcements…"
          />
        </div>
      </div>
    </div>
  );
}
