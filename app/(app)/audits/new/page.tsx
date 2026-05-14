'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Check } from 'lucide-react';
import { TagInput } from '@/components/ui/TagInput';
import { Spinner } from '@/components/ui/Spinner';
import { TeamEditor, type UserDir, type TeamMemberRow } from '@/components/audit-team/TeamEditor';
import type { SectorType, Priority } from '@/lib/types';
import type { AuditTeamRole } from '@/lib/models/Audit';

interface Step1Data {
  name: string;
  client: string;
  project: string;
  sector: SectorType;
  startDate: string;
  targetEndDate: string;
}

interface Step2Data {
  processName: string;
  department: string;
  responsible: string;
  applicableNorms: string[];
  priority: Priority;
}

const SECTORS: { value: SectorType; label: string }[] = [
  { value: 'defence', label: 'Defence' },
  { value: 'aerospace', label: 'Aerospace' },
  { value: 'naval', label: 'Naval' },
  { value: 'railway', label: 'Railway' },
  { value: 'internal', label: 'Internal' },
  { value: 'other', label: 'Other' },
];

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-sov">{message}</p>;
}

export default function NewAuditPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [users, setUsers] = useState<UserDir[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMemberRow[]>([]);

  useEffect(() => {
    fetch('/api/users', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(d => setUsers(Array.isArray(d) ? d : []))
      .catch(() => setUsers([]));
  }, []);

  const [step1, setStep1] = useState<Step1Data>({
    name: '',
    client: '',
    project: '',
    sector: 'aerospace',
    startDate: '',
    targetEndDate: '',
  });

  const [step2, setStep2] = useState<Step2Data>({
    processName: '',
    department: '',
    responsible: '',
    applicableNorms: [],
    priority: 'medium',
  });

  const [step1Errors, setStep1Errors] = useState<Partial<Record<keyof Step1Data, string>>>({});
  const [step2Errors, setStep2Errors] = useState<Partial<Record<keyof Step2Data, string>>>({});

  const validateStep1 = (): boolean => {
    const errors: Partial<Record<keyof Step1Data, string>> = {};
    if (!step1.name.trim()) errors.name = 'Audit name is required';
    if (!step1.client.trim()) errors.client = 'Client is required';
    if (!step1.project.trim()) errors.project = 'Project is required';
    setStep1Errors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateStep2 = (): boolean => {
    setStep2Errors({});
    return true;
  };

  const handleStep1Next = () => {
    if (validateStep1()) setStep(2);
  };

  const addTeamMember = (userId: string, role: AuditTeamRole) => {
    const u = users.find(x => x._id === userId);
    setTeamMembers(prev => [...prev, { userId, role, user: u ?? null }]);
  };
  const updateTeamRole = (userId: string, role: AuditTeamRole) => {
    setTeamMembers(prev => prev.map(m => m.userId === userId ? { ...m, role } : m));
  };
  const removeTeamMember = (userId: string) => {
    setTeamMembers(prev => prev.filter(m => m.userId !== userId));
  };

  const handleSubmit = async () => {
    if (!validateStep2()) return;
    setSubmitting(true);
    setServerError(null);
    try {
      const hasProcess = !!step2.processName.trim();
      const res = await fetch('/api/audits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: step1.name,
          client: step1.client,
          project: step1.project,
          sector: step1.sector,
          startDate: step1.startDate || new Date().toISOString(),
          targetEndDate: step1.targetEndDate || new Date().toISOString(),
          firstProcess: hasProcess ? {
            name: step2.processName,
            department: step2.department,
            responsible: step2.responsible,
            applicableNorms: step2.applicableNorms,
            priority: step2.priority,
          } : null,
          team: teamMembers.map(m => ({ userId: m.userId, role: m.role })),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? `Error ${res.status}`);
      }
      const data = await res.json();
      router.push(`/audits/${data.audit._id}`);
    } catch (e: any) {
      setServerError(e.message ?? 'Failed to create audit');
    } finally {
      setSubmitting(false);
    }
  };

  const steps = [
    { num: 1, label: 'Audit Identity' },
    { num: 2, label: 'First Process' },
    { num: 3, label: 'Team' },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Page header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-text">New Audit</h1>
        <p className="text-sm text-muted mt-0.5">Create a new AI readiness audit</p>
      </div>

      {/* Stepper */}
      <div className="bg-white border border-border rounded-sm p-4">
        <div className="flex items-center gap-0">
          {steps.map((s, i) => (
            <div key={s.num} className="flex items-center gap-0 flex-1">
              <div className="flex items-center gap-2 shrink-0">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    step > s.num
                      ? 'bg-green-sov text-white'
                      : step === s.num
                      ? 'bg-blue-aria text-white'
                      : 'bg-slate-100 text-muted'
                  }`}
                >
                  {step > s.num ? <Check size={13} /> : s.num}
                </div>
                <span
                  className={`text-sm font-medium ${
                    step === s.num ? 'text-text' : 'text-muted'
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className="flex-1 h-px bg-border mx-3" />
              )}
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="mt-4 w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-aria transition-all duration-300"
            style={{ width: `${(step / steps.length) * 100}%` }}
          />
        </div>
        <p className="text-[11px] text-muted mt-1 text-right">
          Step {step} of {steps.length}
        </p>
      </div>

      {/* Server error */}
      {serverError && (
        <div className="p-4 rounded-sm bg-red-sov-light border border-red-sov/20 text-red-sov text-sm">
          {serverError}
        </div>
      )}

      {/* Step 1 */}
      {step === 1 && (
        <div className="bg-white border border-border rounded-sm p-6 space-y-5">
          <h2 className="font-display font-semibold text-lg text-text">Audit Identity</h2>

          <div className="grid grid-cols-1 gap-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-text mb-1">
                Audit Name <span className="text-red-sov">*</span>
              </label>
              <input
                type="text"
                value={step1.name}
                onChange={(e) => setStep1({ ...step1, name: e.target.value })}
                placeholder="e.g. AI Readiness Audit – Airbus 2025"
                className="w-full border border-border rounded-sm px-3 py-2 text-sm bg-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue-aria focus:border-transparent"
              />
              <FieldError message={step1Errors.name} />
            </div>

            {/* Client */}
            <div>
              <label className="block text-sm font-medium text-text mb-1">
                Client <span className="text-red-sov">*</span>
              </label>
              <input
                type="text"
                value={step1.client}
                onChange={(e) => setStep1({ ...step1, client: e.target.value })}
                placeholder="Client organisation name"
                className="w-full border border-border rounded-sm px-3 py-2 text-sm bg-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue-aria focus:border-transparent"
              />
              <FieldError message={step1Errors.client} />
            </div>

            {/* Project */}
            <div>
              <label className="block text-sm font-medium text-text mb-1">
                Project <span className="text-red-sov">*</span>
              </label>
              <input
                type="text"
                value={step1.project}
                onChange={(e) => setStep1({ ...step1, project: e.target.value })}
                placeholder="e.g. NGAD Programme Phase 2"
                className="w-full border border-border rounded-sm px-3 py-2 text-sm bg-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue-aria focus:border-transparent"
              />
              <FieldError message={step1Errors.project} />
            </div>

            {/* Sector */}
            <div>
              <label className="block text-sm font-medium text-text mb-1">Sector</label>
              <select
                value={step1.sector}
                onChange={(e) => setStep1({ ...step1, sector: e.target.value as SectorType })}
                className="w-full border border-border rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-aria focus:border-transparent"
              >
                {SECTORS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text mb-1">Start Date</label>
                <input
                  type="date"
                  value={step1.startDate}
                  onChange={(e) => setStep1({ ...step1, startDate: e.target.value })}
                  className="w-full border border-border rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-aria focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text mb-1">Target End Date</label>
                <input
                  type="date"
                  value={step1.targetEndDate}
                  onChange={(e) => setStep1({ ...step1, targetEndDate: e.target.value })}
                  className="w-full border border-border rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-aria focus:border-transparent"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={handleStep1Next}
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-blue-aria text-white text-sm font-medium rounded-sm hover:bg-blue-aria/90 transition-colors"
            >
              Next
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="bg-white border border-border rounded-sm p-6 space-y-5">
          <h2 className="font-display font-semibold text-lg text-text">First Process <span className="text-muted font-normal text-sm">(optional)</span></h2>
          <p className="text-sm text-muted">
            Optionally define the first process now, or skip and add processes later.
          </p>

          <div className="grid grid-cols-1 gap-4">
            {/* Process name */}
            <div>
              <label className="block text-sm font-medium text-text mb-1">
                Process Name
              </label>
              <input
                type="text"
                value={step2.processName}
                onChange={(e) => setStep2({ ...step2, processName: e.target.value })}
                placeholder="e.g. Technical Documentation Review"
                className="w-full border border-border rounded-sm px-3 py-2 text-sm bg-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue-aria focus:border-transparent"
              />
              <FieldError message={step2Errors.processName} />
            </div>

            {/* Department + Responsible */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text mb-1">Department</label>
                <input
                  type="text"
                  value={step2.department}
                  onChange={(e) => setStep2({ ...step2, department: e.target.value })}
                  placeholder="e.g. Engineering"
                  className="w-full border border-border rounded-sm px-3 py-2 text-sm bg-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue-aria focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text mb-1">Responsible</label>
                <input
                  type="text"
                  value={step2.responsible}
                  onChange={(e) => setStep2({ ...step2, responsible: e.target.value })}
                  placeholder="e.g. Jean Dupont"
                  className="w-full border border-border rounded-sm px-3 py-2 text-sm bg-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue-aria focus:border-transparent"
                />
              </div>
            </div>

            {/* Applicable norms */}
            <div>
              <label className="block text-sm font-medium text-text mb-1">Applicable Norms</label>
              <TagInput
                value={step2.applicableNorms}
                onChange={(tags) => setStep2({ ...step2, applicableNorms: tags })}
                placeholder="Add norm and press Enter…"
              />
              <p className="text-[11px] text-muted mt-1">Press Enter or comma to add a norm</p>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-text mb-1">Priority</label>
              <select
                value={step2.priority}
                onChange={(e) => setStep2({ ...step2, priority: e.target.value as Priority })}
                className="w-full border border-border rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-aria focus:border-transparent"
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-between pt-2">
            <button
              onClick={() => setStep(1)}
              className="px-4 py-2 text-sm font-medium text-muted border border-border rounded-sm hover:border-blue-aria hover:text-blue-aria transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-blue-aria text-white text-sm font-medium rounded-sm hover:bg-blue-aria/90 transition-colors"
            >
              Next
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Team */}
      {step === 3 && (
        <div className="bg-white border border-border rounded-sm p-6 space-y-5">
          <div>
            <h2 className="font-display font-semibold text-lg text-text">Team <span className="text-muted font-normal text-sm">(optional)</span></h2>
            <p className="text-sm text-muted mt-1">
              You'll be the audit owner. Add other people who should access this audit. You can change the team later.
            </p>
          </div>

          <TeamEditor
            members={teamMembers}
            candidates={users}
            canManage={true}
            onAdd={addTeamMember}
            onUpdateRole={updateTeamRole}
            onRemove={removeTeamMember}
          />

          <div className="flex justify-between pt-2">
            <button
              onClick={() => setStep(2)}
              className="px-4 py-2 text-sm font-medium text-muted border border-border rounded-sm hover:border-blue-aria hover:text-blue-aria transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-blue-aria text-white text-sm font-medium rounded-sm hover:bg-blue-aria/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting && <Spinner size="sm" />}
              {submitting ? 'Creating…' : 'Create Audit'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
