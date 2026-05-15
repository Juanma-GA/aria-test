'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Plus,
  Pencil,
  X,
  Clock,
  TrendingUp,
  Archive,
  Trash2,
  Users,
  Crown,
  Edit3,
  Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { BlockProgressBar } from '@/components/layout/BlockProgressBar';
import { TeamEditModal } from '@/components/audit-team/TeamEditModal';
import { useAuditAccess } from '@/context/AuditAccessContext';
import type { AuditTeamRole } from '@/lib/models/Audit';
import { apiUrl } from '@/lib/utils';
import type {
  AuditStatus,
  SectorType,
  Priority,
  ProcessStatus,
  BlockCompletion,
} from '@/lib/types';

interface AuditData {
  _id: string;
  name: string;
  client: string;
  project?: string;
  sector: SectorType;
  status: AuditStatus;
  leadConsultant: { _id: string; name: string } | string;
  startDate: string;
  targetEndDate: string;
  processCount: number;
  useCaseCount: number;
  pocCount: number;
  industrializationCount: number;
  processes: ProcessSummary[];
}

interface ProcessMetrics {
  totalAnnualHours: number;
  totalHoursPerRun: number;
  annualReps: number;
  totalAnnualCostEur: number;
  eligibleUCCount: number;
  totalDevCostEur: number;
  totalTimeSavedHoursPerRun: number;
  projectedAnnualSavingEur: number;
  roiPercent: number | null;
}

interface ProcessSummary {
  _id: string;
  procId: string;
  name: string;
  department: string;
  responsible: string;
  priority: Priority;
  status: ProcessStatus;
  sovereigntyIndex: number | null;
  peopleCount?: number;
  completion?: BlockCompletion;
  metrics?: ProcessMetrics;
}

const SECTOR_VARIANTS: Record<
  SectorType,
  'red' | 'blue' | 'teal' | 'amber' | 'slate'
> = {
  defence: 'red',
  aerospace: 'blue',
  naval: 'teal',
  railway: 'amber',
  internal: 'slate',
  other: 'slate',
};

const SECTORS: { value: SectorType; label: string }[] = [
  { value: 'defence', label: 'Defence' },
  { value: 'aerospace', label: 'Aerospace' },
  { value: 'naval', label: 'Naval' },
  { value: 'railway', label: 'Railway' },
  { value: 'internal', label: 'Internal' },
  { value: 'other', label: 'Other' },
];

const STATUS_VARIANTS: Record<
  AuditStatus,
  'slate' | 'green' | 'amber' | 'blue'
> = {
  draft: 'slate',
  active: 'green',
  review: 'amber',
  completed: 'blue',
};

const PROCESS_STATUS_VARIANTS: Record<
  ProcessStatus,
  'slate' | 'blue' | 'green' | 'amber'
> = {
  pending: 'slate',
  in_audit: 'blue',
  completed: 'green',
  paused: 'amber',
};

const PRIORITY_VARIANTS: Record<Priority, 'red' | 'amber' | 'slate'> = {
  high: 'red',
  medium: 'amber',
  low: 'slate',
};

function getLeadName(
  lead: { _id: string; name: string } | string | undefined,
): string {
  if (!lead) return '—';
  if (typeof lead === 'string') return lead;
  return lead.name ?? '—';
}

function getSovereigntyVariant(
  idx: number | null,
): 'green' | 'amber' | 'red' | 'slate' {
  if (idx === null) return 'slate';
  if (idx >= 4.0) return 'green';
  if (idx >= 2.0) return 'amber';
  return 'red';
}

const EMPTY_COMPLETION: BlockCompletion = {
  b1: false,
  b2: false,
  b3: false,
  b5: false,
  b6: false,
  b7: false,
};

const AUDIT_STATUSES: AuditStatus[] = [
  'draft',
  'active',
  'review',
  'completed',
];

export default function AuditPage() {
  const params = useParams();
  const router = useRouter();
  const auditId = params?.auditId as string;

  const [audit, setAudit] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    client: '',
    project: '',
    sector: 'aerospace' as SectorType,
    startDate: '',
    targetEndDate: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Team
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [teamSummary, setTeamSummary] = useState<
    Array<{
      userId: string;
      role: AuditTeamRole;
      user: { name: string; email: string } | null;
    }>
  >([]);
  const access = useAuditAccess();

  const loadTeam = async () => {
    try {
      const r = await fetch(apiUrl(`/api/audits/${auditId}/team`), {
        credentials: 'include',
      });
      if (!r.ok) return;
      const data = await r.json();
      setTeamSummary(Array.isArray(data?.team) ? data.team : []);
    } catch {
      /* silent */
    }
  };

  useEffect(() => {
    if (auditId) loadTeam();
  }, [auditId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(apiUrl(`/api/audits/${auditId}`));
        if (!res.ok) throw new Error(`Error ${res.status}`);
        const data = await res.json();
        setAudit(data);
        setEditForm({
          name: data.name || '',
          client: data.client || '',
          project: data.project || '',
          sector: data.sector || 'aerospace',
          startDate: data.startDate ? data.startDate.slice(0, 10) : '',
          targetEndDate: data.targetEndDate
            ? data.targetEndDate.slice(0, 10)
            : '',
        });
      } catch (e: any) {
        setError(e.message ?? 'Failed to load audit');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [auditId]);

  const handleStatusChange = async (newStatus: AuditStatus) => {
    if (!audit || newStatus === audit.status) return;
    setSavingStatus(true);
    try {
      const res = await fetch(apiUrl(`/api/audits/${auditId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed');
      const updated = await res.json();
      setAudit((prev) => (prev ? { ...prev, status: updated.status } : prev));
    } catch {
      /* ignore */
    } finally {
      setSavingStatus(false);
    }
  };

  const handleEditSave = async () => {
    if (!editForm.name.trim() || !editForm.client.trim()) return;
    setSavingEdit(true);
    try {
      const res = await fetch(apiUrl(`/api/audits/${auditId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        const updated = await res.json();
        setAudit((prev) => (prev ? { ...prev, ...updated } : prev));
        setEditOpen(false);
      }
    } finally {
      setSavingEdit(false);
    }
  };

  const handleArchive = async () => {
    setArchiving(true);
    try {
      const res = await fetch(apiUrl(`/api/audits/${auditId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived: true }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Audit archived');
      setArchiveModalOpen(false);
      router.push('/dashboard');
    } catch {
      toast.error('Failed to archive audit');
    } finally {
      setArchiving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(apiUrl(`/api/audits/${auditId}`), {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Audit deleted');
      setDeleteModalOpen(false);
      router.push('/dashboard');
    } catch {
      toast.error('Failed to delete audit');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" className="text-blue-aria" />
      </div>
    );
  }

  if (error || !audit) {
    return (
      <div className="p-4 rounded-sm bg-red-sov-light border border-red-sov/20 text-red-sov text-sm">
        {error ?? 'Audit not found'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Audit header card */}
      <div className="bg-white border border-border rounded-sm p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-3">
            <h1 className="font-display text-2xl font-bold text-text leading-tight">
              {audit.name}
            </h1>
            <p className="text-sm text-muted">
              {audit.client}
              {audit.project ? ` · ${audit.project}` : ''}
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={SECTOR_VARIANTS[audit.sector]}>
                {audit.sector.charAt(0).toUpperCase() + audit.sector.slice(1)}
              </Badge>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted font-medium">Status:</span>
              {savingStatus ? (
                <Spinner size="sm" className="text-blue-aria" />
              ) : (
                <select
                  value={audit.status}
                  onChange={(e) =>
                    handleStatusChange(e.target.value as AuditStatus)
                  }
                  className="text-xs border border-border rounded-sm px-2 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-aria"
                >
                  {AUDIT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
              )}
              <Badge variant={STATUS_VARIANTS[audit.status]}>
                {audit.status.charAt(0).toUpperCase() + audit.status.slice(1)}
              </Badge>
            </div>

            <div className="flex flex-wrap gap-4 text-xs text-muted">
              <span>
                Lead:{' '}
                <span className="text-text font-medium">
                  {getLeadName(audit.leadConsultant)}
                </span>
              </span>
              {audit.startDate && (
                <span>
                  Start:{' '}
                  <span className="text-text font-medium">
                    {new Date(audit.startDate).toLocaleDateString()}
                  </span>
                </span>
              )}
              {audit.targetEndDate && (
                <span>
                  Target:{' '}
                  <span className="text-text font-medium">
                    {new Date(audit.targetEndDate).toLocaleDateString()}
                  </span>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditOpen(true)}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted border border-border rounded-sm hover:border-blue-aria hover:text-blue-aria transition-colors"
            >
              <Pencil size={13} />
              Edit
            </button>
            <button
              onClick={() => setArchiveModalOpen(true)}
              disabled={archiving}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted border border-border rounded-sm hover:border-amber-500 hover:text-amber-600 transition-colors disabled:opacity-50"
            >
              <Archive size={13} />
              {archiving ? '…' : 'Archive'}
            </button>
            <button
              onClick={() => setDeleteModalOpen(true)}
              disabled={deleting}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-sm hover:border-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              <Trash2 size={13} />
              {deleting ? '…' : 'Delete'}
            </button>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          {
            label: 'Processes',
            value: audit.processCount ?? audit.processes?.length ?? 0,
          },
          { label: 'Use Cases', value: audit.useCaseCount ?? 0 },
          { label: 'POCs', value: audit.pocCount ?? 0 },
          {
            label: 'Industrializations',
            value: audit.industrializationCount ?? 0,
          },
          {
            label: 'People Impacted',
            value:
              audit.processes?.reduce((s, p) => s + (p.peopleCount ?? 0), 0) ??
              0,
          },
        ].map((s, i) => (
          <div
            key={i}
            className="bg-white border border-border rounded-sm p-4 flex flex-col gap-1"
          >
            <span className="text-xs text-muted font-medium uppercase tracking-wide">
              {s.label}
            </span>
            <span className="font-display text-2xl font-bold text-text">
              {s.value}
            </span>
          </div>
        ))}
      </div>

      {/* Team card */}
      <div className="bg-white border border-border rounded-sm p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-blue-aria" />
            <h2 className="font-display font-semibold text-base text-text">
              Team
            </h2>
            <span className="text-xs text-muted">
              — {teamSummary.length} member{teamSummary.length === 1 ? '' : 's'}
            </span>
          </div>
          <button
            onClick={() => setTeamModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted border border-border rounded-sm hover:border-blue-aria hover:text-blue-aria transition-colors"
          >
            {access.canManageTeam ? <Pencil size={12} /> : <Eye size={12} />}
            {access.canManageTeam ? 'Manage team' : 'View team'}
          </button>
        </div>
        {teamSummary.length === 0 ? (
          <p className="text-xs text-muted">No team members loaded yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {teamSummary.map((m) => {
              const RoleIcon =
                m.role === 'owner' ? Crown : m.role === 'editor' ? Edit3 : Eye;
              const variant: 'green' | 'blue' | 'slate' =
                m.role === 'owner'
                  ? 'green'
                  : m.role === 'editor'
                    ? 'blue'
                    : 'slate';
              return (
                <span
                  key={m.userId}
                  className="inline-flex items-center gap-1.5 px-2 py-1 border border-border rounded-sm text-xs bg-smoke/40"
                >
                  <RoleIcon
                    size={11}
                    className={
                      m.role === 'owner'
                        ? 'text-green-sov'
                        : m.role === 'editor'
                          ? 'text-blue-aria'
                          : 'text-muted'
                    }
                  />
                  <span className="font-medium">{m.user?.name ?? '—'}</span>
                  <Badge variant={variant} className="text-[9px] py-0">
                    {m.role}
                  </Badge>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Add process button only */}
      <div>
        <Link
          href={`/audits/${auditId}/processes/new`}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-aria text-white text-sm font-medium rounded-sm hover:bg-blue-aria/90 transition-colors"
        >
          <Plus size={15} />
          Add Process
        </Link>
      </div>

      {/* Team modal */}
      <TeamEditModal
        isOpen={teamModalOpen}
        onClose={() => setTeamModalOpen(false)}
        auditId={auditId}
        onChanged={loadTeam}
      />

      {/* Process grid */}
      <div>
        <h2 className="font-display font-semibold text-base text-text mb-3">
          Processes
        </h2>

        {!audit.processes || audit.processes.length === 0 ? (
          <div className="bg-white border border-border rounded-sm p-10 text-center">
            <p className="text-muted text-sm">No processes yet.</p>
            <Link
              href={`/audits/${auditId}/processes/new`}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-aria text-white text-sm font-medium rounded-sm hover:bg-blue-aria/90 transition-colors"
            >
              <Plus size={15} />
              Add First Process
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {audit.processes.map((proc) => (
              <div
                key={proc._id}
                className="bg-white border border-border rounded-sm p-5 flex flex-col gap-3 hover:shadow-md transition-shadow"
              >
                {/* Proc ID + priority */}
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="amber">{proc.procId}</Badge>
                  <Badge variant={PRIORITY_VARIANTS[proc.priority]}>
                    {proc.priority.charAt(0).toUpperCase() +
                      proc.priority.slice(1)}
                  </Badge>
                </div>

                {/* Name */}
                <h3 className="font-display font-semibold text-sm text-text leading-snug">
                  {proc.name}
                </h3>

                {/* Department + Responsible + People */}
                <div className="space-y-0.5">
                  {proc.department && (
                    <p className="text-xs text-muted">
                      Dept: <span className="text-text">{proc.department}</span>
                    </p>
                  )}
                  {proc.responsible && (
                    <p className="text-xs text-muted">
                      Resp:{' '}
                      <span className="text-text">{proc.responsible}</span>
                    </p>
                  )}
                  {(proc.peopleCount ?? 0) > 0 && (
                    <p className="text-xs font-semibold text-blue-aria">
                      👥 {proc.peopleCount} people impacted
                    </p>
                  )}
                </div>

                {/* Status */}
                <Badge variant={PROCESS_STATUS_VARIANTS[proc.status]}>
                  {proc.status
                    .replace('_', ' ')
                    .replace(/\b\w/g, (c) => c.toUpperCase())}
                </Badge>

                {/* Sovereignty index */}
                {proc.sovereigntyIndex !== null && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted">Sovereignty:</span>
                    <Badge
                      variant={getSovereigntyVariant(proc.sovereigntyIndex)}
                    >
                      {proc.sovereigntyIndex.toFixed(1)}
                    </Badge>
                  </div>
                )}

                {/* Savings highlight */}
                {proc.metrics &&
                  (proc.metrics.totalTimeSavedHoursPerRun > 0 ||
                    proc.metrics.projectedAnnualSavingEur > 0) && (
                    <div className="bg-green-sov-light rounded px-2 py-1.5 space-y-1">
                      <div className="flex items-center gap-3 text-xs">
                        {proc.metrics.totalTimeSavedHoursPerRun > 0 && (
                          <span className="flex items-center gap-1 text-green-700 font-medium">
                            <Clock size={11} />
                            {proc.metrics.totalTimeSavedHoursPerRun}h/run saved
                          </span>
                        )}
                        {proc.metrics.projectedAnnualSavingEur > 0 && (
                          <span className="flex items-center gap-1 text-green-700">
                            <TrendingUp size={11} />€
                            {proc.metrics.projectedAnnualSavingEur.toLocaleString()}
                            /yr
                          </span>
                        )}
                      </div>
                      {proc.metrics.totalHoursPerRun > 0 && (
                        <div className="flex items-center gap-3 text-xs text-green-700/80">
                          <span>
                            {proc.metrics.totalHoursPerRun}h/run total
                            {proc.metrics.totalTimeSavedHoursPerRun > 0 && (
                              <span className="ml-1.5 font-semibold text-green-700">
                                (
                                {Math.round(
                                  (proc.metrics.totalTimeSavedHoursPerRun /
                                    proc.metrics.totalHoursPerRun) *
                                    100,
                                )}
                                % time saved)
                              </span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                {/* ROI metrics */}
                {proc.metrics && (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs border-t border-border pt-2 mt-1">
                    {proc.metrics.totalAnnualHours > 0 && (
                      <>
                        <span className="text-muted">Annual time:</span>
                        <span className="text-text font-medium">
                          {proc.metrics.totalAnnualHours}h
                        </span>
                      </>
                    )}
                    {proc.metrics.eligibleUCCount > 0 && (
                      <>
                        <span className="text-muted">Eligible UCs:</span>
                        <span className="text-text font-medium">
                          {proc.metrics.eligibleUCCount}
                        </span>
                      </>
                    )}
                    {proc.metrics.roiPercent !== null && (
                      <>
                        <span className="text-muted">ROI:</span>
                        <span
                          className={`font-bold ${proc.metrics.roiPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}
                        >
                          {proc.metrics.roiPercent > 0 ? '+' : ''}
                          {proc.metrics.roiPercent}%
                        </span>
                      </>
                    )}
                  </div>
                )}

                {/* Footer */}
                <div className="mt-auto pt-2 border-t border-border flex justify-end">
                  <Link
                    href={`/audits/${auditId}/processes/${proc._id}`}
                    className="text-xs font-medium text-blue-aria hover:underline"
                  >
                    Open →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Archive confirm */}
      <ConfirmModal
        isOpen={archiveModalOpen}
        onClose={() => setArchiveModalOpen(false)}
        onConfirm={handleArchive}
        title="Archive audit"
        message="Archive this audit? It will be hidden from the main dashboard but can be restored later."
        confirmLabel={archiving ? 'Archiving…' : 'Archive'}
        isLoading={archiving}
      />

      {/* Delete confirm */}
      <ConfirmModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="Delete audit"
        message={`Permanently delete "${audit.name}"? This cannot be undone.`}
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        isLoading={deleting}
      />

      {/* Edit Audit Modal */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-sm shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-semibold text-lg text-text">
                Edit Audit
              </h2>
              <button
                onClick={() => setEditOpen(false)}
                className="text-muted hover:text-text"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="form-label">
                  Audit Name <span className="text-red-sov">*</span>
                </label>
                <input
                  className="form-input"
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, name: e.target.value }))
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">
                    Client <span className="text-red-sov">*</span>
                  </label>
                  <input
                    className="form-input"
                    value={editForm.client}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, client: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="form-label">Project</label>
                  <input
                    className="form-input"
                    value={editForm.project}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, project: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div>
                <label className="form-label">Sector</label>
                <select
                  className="form-input"
                  value={editForm.sector}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      sector: e.target.value as SectorType,
                    }))
                  }
                >
                  {SECTORS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Start Date</label>
                  <input
                    type="date"
                    className="form-input"
                    value={editForm.startDate}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, startDate: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="form-label">Target End Date</label>
                  <input
                    type="date"
                    className="form-input"
                    value={editForm.targetEndDate}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        targetEndDate: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditOpen(false)}
                className="px-4 py-2 text-sm text-muted border border-border rounded-sm hover:border-blue-aria hover:text-blue-aria transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                disabled={
                  savingEdit || !editForm.name.trim() || !editForm.client.trim()
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-aria text-white text-sm font-medium rounded-sm hover:bg-blue-aria/90 disabled:opacity-50 transition-colors"
              >
                {savingEdit && <Spinner size="sm" />}
                {savingEdit ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
