'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { TagInput } from '@/components/ui/TagInput';
import { Spinner } from '@/components/ui/Spinner';
import { apiUrl } from '@/lib/utils';
import { DEPARTMENT_TYPES } from '@/lib/validators';
import type { Priority } from '@/lib/types';
import type { DepartmentType } from '@/lib/models/Process';

interface FormData {
  processName: string;
  department: DepartmentType;
  responsible: string;
  applicableNorms: string[];
  priority: Priority;
}

const DEPARTMENTS: { value: DepartmentType; label: string }[] = [
  { value: 'Technical Publications', label: 'Technical Publications' },
  { value: 'Training Development', label: 'Training Development' },
  { value: 'Training Delivery', label: 'Training Delivery' },
  { value: 'ISS', label: 'In Service Support' },
  { value: 'LSA', label: 'LSA' },
  { value: 'Digital', label: 'Digital' },
  { value: 'Simulation', label: 'Simulation' },
  { value: 'General ILS', label: 'General ILS' },
  { value: 'Material Supply', label: 'Material Supply' },
  { value: 'Provisioning', label: 'Provisioning' },
  { value: 'Supply Chain', label: 'Supply Chain' },
  { value: 'D&D Engineering', label: 'D&D Engineering' },
  { value: 'Other', label: 'Other' },
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

export default function NewProcessPage() {
  const params = useParams();
  const router = useRouter();
  const auditId = params?.auditId as string;

  const [form, setForm] = useState<FormData>({
    processName: '',
    department: 'Other',
    responsible: '',
    applicableNorms: [],
    priority: 'medium',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>(
    {},
  );
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const validate = (): boolean => {
    const errs: Partial<Record<keyof FormData, string>> = {};
    if (!form.processName.trim()) errs.processName = 'Process name is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch(apiUrl(`/api/audits/${auditId}/processes`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.processName,
          department: form.department,
          responsible: form.responsible,
          applicableNorms: form.applicableNorms,
          priority: form.priority,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? `Error ${res.status}`);
      }
      const data = await res.json();
      const procId = data._id ?? data.process?._id;
      if (procId) {
        router.push(`/audits/${auditId}/processes/${procId}`);
      } else {
        router.push(`/audits/${auditId}`);
      }
    } catch (e: any) {
      setServerError(e.message ?? 'Failed to create process');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link
          href={`/audits/${auditId}`}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-blue-aria transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Audit
        </Link>
      </div>

      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-text">
          Add Process
        </h1>
        <p className="text-sm text-muted mt-0.5">
          Add a new process to this audit
        </p>
      </div>

      {/* Server error */}
      {serverError && (
        <div className="p-4 rounded-sm bg-red-sov-light border border-red-sov/20 text-red-sov text-sm">
          {serverError}
        </div>
      )}

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-border rounded-sm p-6 space-y-5"
      >
        {/* Process name */}
        <div>
          <label className="block text-sm font-medium text-text mb-1">
            Process Name <span className="text-red-sov">*</span>
          </label>
          <input
            type="text"
            value={form.processName}
            onChange={(e) => setForm({ ...form, processName: e.target.value })}
            placeholder="e.g. Technical Documentation Review"
            className="w-full border border-border rounded-sm px-3 py-2 text-sm bg-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue-aria focus:border-transparent"
          />
          <FieldError message={errors.processName} />
        </div>

        {/* Department + Responsible */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text mb-1">
              Department
            </label>
            <select
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value as DepartmentType })}
              className="w-full border border-border rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-aria focus:border-transparent"
            >
              {DEPARTMENTS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-1">
              Responsible
            </label>
            <input
              type="text"
              value={form.responsible}
              onChange={(e) =>
                setForm({ ...form, responsible: e.target.value })
              }
              placeholder="e.g. Jean Dupont"
              className="w-full border border-border rounded-sm px-3 py-2 text-sm bg-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue-aria focus:border-transparent"
            />
          </div>
        </div>

        {/* Applicable norms */}
        <div>
          <label className="block text-sm font-medium text-text mb-1">
            Applicable Norms
          </label>
          <TagInput
            value={form.applicableNorms}
            onChange={(tags) => setForm({ ...form, applicableNorms: tags })}
            placeholder="Add norm and press Enter…"
          />
          <p className="text-[11px] text-muted mt-1">
            Press Enter or comma to add a norm
          </p>
        </div>

        {/* Priority */}
        <div>
          <label className="block text-sm font-medium text-text mb-1">
            Priority
          </label>
          <select
            value={form.priority}
            onChange={(e) =>
              setForm({ ...form, priority: e.target.value as Priority })
            }
            className="w-full border border-border rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-aria focus:border-transparent"
          >
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {/* Actions */}
        <div className="flex justify-between pt-2">
          <Link
            href={`/audits/${auditId}`}
            className="px-4 py-2 text-sm font-medium text-muted border border-border rounded-sm hover:border-blue-aria hover:text-blue-aria transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-1.5 px-5 py-2 bg-blue-aria text-white text-sm font-medium rounded-sm hover:bg-blue-aria/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting && <Spinner size="sm" />}
            {submitting ? 'Adding…' : 'Add Process'}
          </button>
        </div>
      </form>
    </div>
  );
}
