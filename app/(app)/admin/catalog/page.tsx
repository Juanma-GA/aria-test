'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Pencil,
  Trash2,
  Power,
  PowerOff,
  Cpu,
  Bot,
  Sparkles,
  RefreshCw,
  DownloadCloud,
  Search,
} from 'lucide-react';
import { apiUrl } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuthStore } from '@/lib/store/authStore';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import type { CatalogEntry, CatalogKind } from '@/lib/types';

type Tab = 'ai_model' | 'gpu';

const TAB_CONFIG: Record<Tab, { label: string; Icon: typeof Bot }> = {
  ai_model: { label: 'AI Models', Icon: Bot },
  gpu: { label: 'GPUs', Icon: Cpu },
};

const EMPTY_AI: Partial<CatalogEntry> = {
  kind: 'ai_model',
  name: '',
  vendor: '',
  isActive: true,
  contextWindow: 0,
  pricePerMInputTokens: 0,
  pricePerMOutputTokens: 0,
  deploymentMode: 'cloud_api',
  paramCountB: 0,
  notes: '',
};
const EMPTY_GPU: Partial<CatalogEntry> = {
  kind: 'gpu',
  name: '',
  isActive: true,
  tdpW: 0,
  vramGb: 0,
  priceEur: 0,
  concurrentUsersPerGpu: 0,
  notes: '',
};

const fmtDate = (d?: Date | string) =>
  d
    ? new Date(d).toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

export default function CatalogAdminPage() {
  const router = useRouter();
  const { user: me } = useAuthStore();

  const [tab, setTab] = useState<Tab>('ai_model');
  const [items, setItems] = useState<CatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [archiveResiduals, setArchiveResiduals] = useState(false);
  const [confirmSync, setConfirmSync] = useState(false);
  const [refreshSummary, setRefreshSummary] = useState<{
    updated: number;
    skipped: string[];
    rationale: string;
  } | null>(null);
  const [syncSummary, setSyncSummary] = useState<null | {
    aiModels: { created: number; updated: number; skipped: string[] };
    gpus: { created: number; updated: number; skipped: string[] };
    archived: { aiModels: string[]; gpus: string[] };
    exclusionRationale: string;
    globalRationale: string;
  }>(null);

  const [stats, setStats] = useState<{
    sync: {
      type: string;
      executedAt: string;
      webSearchOk: boolean;
      aiModelsCreated: number;
      aiModelsUpdated: number;
      gpusCreated: number;
      gpusUpdated: number;
    } | null;
    refresh: {
      type: string;
      executedAt: string;
      webSearchOk: boolean;
      aiModelsCreated: number;
      aiModelsUpdated: number;
      gpusCreated: number;
      gpusUpdated: number;
    } | null;
  }>({ sync: null, refresh: null });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogEntry | null>(null);
  const [form, setForm] = useState<Partial<CatalogEntry>>(EMPTY_AI);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<CatalogEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (me && me.role !== 'admin') router.replace('/dashboard');
  }, [me, router]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/admin/catalog'));
      if (!res.ok) throw new Error('Failed');
      setItems(await res.json());
    } catch {
      toast.error('Could not load catalog');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(apiUrl('/api/admin/catalog/stats'));
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setStats(data);
    } catch {
      // Silently fail for stats
    }
  };

  useEffect(() => {
    fetchItems();
    fetchStats();
  }, []);

  const visible = items.filter((i) => i.kind === tab);

  const openCreate = () => {
    setEditing(null);
    setForm(tab === 'ai_model' ? { ...EMPTY_AI } : { ...EMPTY_GPU });
    setModalOpen(true);
  };

  const openEdit = (item: CatalogEntry) => {
    setEditing(item);
    setForm({ ...item });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name?.trim()) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    try {
      const res = editing
        ? await fetch(apiUrl(`/api/admin/catalog/${editing._id}`), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form),
          })
        : await fetch(apiUrl('/api/admin/catalog'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form),
          });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Save failed');
        return;
      }
      toast.success(
        editing ? 'Catalog entry updated' : 'Catalog entry created',
      );
      setModalOpen(false);
      fetchItems();
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item: CatalogEntry) => {
    const res = await fetch(apiUrl(`/api/admin/catalog/${item._id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !item.isActive }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? 'Update failed');
      return;
    }
    toast.success(item.isActive ? 'Archived' : 'Re-activated');
    fetchItems();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(
        apiUrl(`/api/admin/catalog/${deleteTarget._id}`),
        { method: 'DELETE' },
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Delete failed');
        return;
      }
      toast.success('Deleted');
      setDeleteTarget(null);
      fetchItems();
    } finally {
      setDeleting(false);
    }
  };

  const handleRefreshAi = async () => {
    setRefreshing(true);
    setRefreshSummary(null);
    try {
      const res = await fetch(apiUrl('/api/admin/catalog/refresh-ai'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Refresh failed');
        return;
      }
      setRefreshSummary({
        updated: data.updatedCount ?? 0,
        skipped: data.skipped ?? [],
        rationale: data.globalRationale ?? '',
      });
      toast.success(`AI refresh: ${data.updatedCount ?? 0} entries updated`);
      fetchItems();
      fetchStats();
    } finally {
      setRefreshing(false);
    }
  };

  const handleSyncFromAi = async () => {
    setConfirmSync(false);
    setSyncing(true);
    setSyncSummary(null);
    try {
      const url = `/api/admin/catalog/sync-from-ai${archiveResiduals ? '?archiveResiduals=true' : ''}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Sync failed');
        return;
      }
      setSyncSummary(data);
      const created = (data.aiModels?.created ?? 0) + (data.gpus?.created ?? 0);
      const updated = (data.aiModels?.updated ?? 0) + (data.gpus?.updated ?? 0);
      const archived =
        (data.archived?.aiModels?.length ?? 0) +
        (data.archived?.gpus?.length ?? 0);
      toast.success(
        `Sync: ${created} created, ${updated} updated${archived ? `, ${archived} archived` : ''}`,
      );
      fetchItems();
      fetchStats();
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">
            Model & Hardware Catalog
          </h1>
          <p className="text-sm text-muted mt-0.5">
            LLMs and GPU specs / prices used by the industrialization compute
            calculator. Refresh with AI to fetch current public specs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setConfirmSync(true)}
            disabled={syncing || refreshing}
            className="text-xs text-white bg-blue-aria border border-blue-aria rounded px-3 py-2 hover:bg-blue-aria/90 transition-colors disabled:opacity-50 flex items-center gap-1"
            title="Ask the AI to load the canonical current market list (creates missing entries, refreshes existing ones)"
          >
            {syncing ? <Spinner size="sm" /> : <DownloadCloud size={13} />}
            Sync from AI (market data)
          </button>
          <button
            onClick={handleRefreshAi}
            disabled={syncing || refreshing}
            className="text-xs text-blue-aria border border-blue-aria rounded px-3 py-2 hover:bg-blue-50 transition-colors disabled:opacity-50 flex items-center gap-1"
            title="Refresh prices and specs of existing entries only (does not add new ones)"
          >
            {refreshing ? <Spinner size="sm" /> : <RefreshCw size={13} />}
            Refresh existing
          </button>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-aria text-white text-sm font-medium rounded-sm hover:bg-blue-aria/90 transition-colors"
          >
            <Plus size={15} /> New
          </button>
        </div>
      </div>

      {/* Status bar */}
      <div className="space-y-1 text-sm text-gray-600">
        {stats.sync && (
          <div>
            Last Sync: {new Date(stats.sync.executedAt).toLocaleString('de-DE')}{' '}
            · Web search: {stats.sync.webSearchOk ? '✅ OK' : '⚠️ unavailable'}{' '}
            ·{stats.sync.aiModelsCreated} AI created,{' '}
            {stats.sync.aiModelsUpdated} updated ·{stats.sync.gpusCreated} GPUs
            created, {stats.sync.gpusUpdated} updated
          </div>
        )}
        {!stats.sync && (
          <div className="text-gray-400">Last Sync: Never executed</div>
        )}

        {stats.refresh && (
          <div>
            Last Refresh:{' '}
            {new Date(stats.refresh.executedAt).toLocaleString('de-DE')} · Web
            search: {stats.refresh.webSearchOk ? '✅ OK' : '⚠️ unavailable'} ·
            {stats.refresh.aiModelsUpdated} AI updated,{' '}
            {stats.refresh.gpusUpdated} GPUs updated
          </div>
        )}
        {!stats.refresh && (
          <div className="text-gray-400">Last Refresh: Never executed</div>
        )}
      </div>

      {/* Sync result banner */}
      {syncSummary && (
        <div className="card bg-blue-pale/40 border-blue-aria/30 p-3 flex items-start gap-2">
          <Sparkles size={14} className="text-blue-aria mt-0.5 shrink-0" />
          <div className="flex-1 text-[12px] text-text leading-snug space-y-1">
            <p>
              <span className="font-semibold">Catalog synced from AI.</span> AI
              models —{' '}
              <span className="font-semibold">
                {syncSummary.aiModels.created}
              </span>{' '}
              created,{' '}
              <span className="font-semibold">
                {syncSummary.aiModels.updated}
              </span>{' '}
              updated.
              {' · '}GPUs —{' '}
              <span className="font-semibold">{syncSummary.gpus.created}</span>{' '}
              created,{' '}
              <span className="font-semibold">{syncSummary.gpus.updated}</span>{' '}
              updated.
              {syncSummary.archived.aiModels.length +
                syncSummary.archived.gpus.length >
                0 && (
                <>
                  {' '}
                  {' · '}Archived as residual:{' '}
                  <span className="font-semibold">
                    {syncSummary.archived.aiModels.length +
                      syncSummary.archived.gpus.length}
                  </span>
                </>
              )}
            </p>
            {syncSummary.exclusionRationale && (
              <p className="text-muted">
                <span className="font-semibold text-text">Exclusions:</span>{' '}
                {syncSummary.exclusionRationale}
              </p>
            )}
            {syncSummary.globalRationale && (
              <p className="text-muted">{syncSummary.globalRationale}</p>
            )}
            {syncSummary.archived.aiModels.length > 0 && (
              <p className="text-muted text-[11px]">
                Archived models: {syncSummary.archived.aiModels.join(', ')}
              </p>
            )}
            {syncSummary.archived.gpus.length > 0 && (
              <p className="text-muted text-[11px]">
                Archived GPUs: {syncSummary.archived.gpus.join(', ')}
              </p>
            )}
          </div>
          <button
            onClick={() => setSyncSummary(null)}
            className="text-muted hover:text-text text-[11px]"
          >
            dismiss
          </button>
        </div>
      )}

      {refreshSummary && (
        <div className="card bg-blue-pale/40 border-blue-aria/30 p-3 flex items-start gap-2">
          <Sparkles size={14} className="text-blue-aria mt-0.5 shrink-0" />
          <div className="flex-1 text-[12px] text-text leading-snug">
            <p>
              <span className="font-semibold">AI refresh complete.</span>{' '}
              {refreshSummary.updated} entr
              {refreshSummary.updated === 1 ? 'y' : 'ies'} updated
              {refreshSummary.skipped.length > 0 && (
                <>
                  {' '}
                  · {refreshSummary.skipped.length} skipped (name not in
                  catalog: {refreshSummary.skipped.slice(0, 3).join(', ')}
                  {refreshSummary.skipped.length > 3 ? '…' : ''})
                </>
              )}
              .
            </p>
            {refreshSummary.rationale && (
              <p className="mt-1 text-muted">{refreshSummary.rationale}</p>
            )}
          </div>
          <button
            onClick={() => setRefreshSummary(null)}
            className="text-muted hover:text-text text-[11px]"
          >
            dismiss
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(Object.keys(TAB_CONFIG) as Tab[]).map((t) => {
          const cfg = TAB_CONFIG[t];
          const Icon = cfg.Icon;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
                tab === t
                  ? 'border-blue-aria text-blue-aria'
                  : 'border-transparent text-muted hover:text-text'
              }`}
            >
              <Icon size={13} /> {cfg.label} (
              {items.filter((i) => i.kind === t).length})
            </button>
          );
        })}
      </div>

      <div className="card overflow-hidden p-0">
        {visible.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">
            No {TAB_CONFIG[tab].label.toLowerCase()} yet. Click <em>New</em> or{' '}
            <em>Refresh with AI</em> to seed entries.
          </p>
        ) : tab === 'ai_model' ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-smoke">
                <th className="text-left px-3 py-3 text-xs font-semibold text-muted uppercase tracking-wide">
                  Name
                </th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-muted uppercase tracking-wide">
                  Vendor
                </th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-muted uppercase tracking-wide">
                  Ctx
                </th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-muted uppercase tracking-wide">
                  €/M in
                </th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-muted uppercase tracking-wide">
                  €/M out
                </th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-muted uppercase tracking-wide">
                  Params
                </th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-muted uppercase tracking-wide">
                  Mode
                </th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-muted uppercase tracking-wide">
                  AI updated
                </th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map((m) => (
                <tr
                  key={m._id}
                  className={`hover:bg-smoke/50 ${m.isActive ? '' : 'opacity-60'}`}
                >
                  <td className="px-3 py-2 font-medium text-text">{m.name}</td>
                  <td className="px-3 py-2 text-muted">{m.vendor ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {m.contextWindow ? m.contextWindow.toLocaleString() : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {m.pricePerMInputTokens != null
                      ? `€${m.pricePerMInputTokens.toFixed(2)}`
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {m.pricePerMOutputTokens != null
                      ? `€${m.pricePerMOutputTokens.toFixed(2)}`
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {m.paramCountB ? `${m.paramCountB}B` : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {m.deploymentMode ?? '—'}
                  </td>
                  <td
                    className="px-3 py-2 text-xs text-muted"
                    title={m.aiRationale}
                  >
                    {fmtDate(m.aiUpdatedAt)}
                  </td>
                  <td className="px-3 py-2">
                    <RowActions
                      item={m}
                      onEdit={openEdit}
                      onToggle={toggleActive}
                      onDelete={setDeleteTarget}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-smoke">
                <th className="text-left px-3 py-3 text-xs font-semibold text-muted uppercase tracking-wide">
                  Name
                </th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-muted uppercase tracking-wide">
                  VRAM
                </th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-muted uppercase tracking-wide">
                  TDP
                </th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-muted uppercase tracking-wide">
                  Conc. users
                </th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-muted uppercase tracking-wide">
                  Price
                </th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-muted uppercase tracking-wide">
                  AI updated
                </th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map((g) => (
                <tr
                  key={g._id}
                  className={`hover:bg-smoke/50 ${g.isActive ? '' : 'opacity-60'}`}
                >
                  <td className="px-3 py-2 font-medium text-text">{g.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {g.vramGb ? `${g.vramGb} GB` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {g.tdpW ? `${g.tdpW} W` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {g.concurrentUsersPerGpu
                      ? g.concurrentUsersPerGpu.toString()
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {g.priceEur ? `€${g.priceEur.toLocaleString()}` : '—'}
                  </td>
                  <td
                    className="px-3 py-2 text-xs text-muted"
                    title={g.aiRationale}
                  >
                    {fmtDate(g.aiUpdatedAt)}
                  </td>
                  <td className="px-3 py-2">
                    <RowActions
                      item={g}
                      onEdit={openEdit}
                      onToggle={toggleActive}
                      onDelete={setDeleteTarget}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create / Edit modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={
          editing
            ? `Edit ${TAB_CONFIG[(form.kind ?? 'ai_model') as Tab].label.replace(/s$/, '')}`
            : `New ${TAB_CONFIG[(form.kind ?? 'ai_model') as Tab].label.replace(/s$/, '')}`
        }
        size="lg"
      >
        <CatalogForm form={form} onChange={setForm} />
        <div className="flex justify-end gap-3 pt-4 border-t border-border mt-4">
          <button
            onClick={() => setModalOpen(false)}
            className="btn-secondary"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="btn-primary flex items-center gap-2"
            disabled={saving}
          >
            {saving && <Spinner size="sm" />}
            {editing ? 'Save changes' : 'Create entry'}
          </button>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete catalog entry"
        message={`Delete "${deleteTarget?.name}"? Industrializations referencing this entry will keep the snapshotted price/specs but the dropdown will show "archived".`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isLoading={deleting}
      />

      {/* Sync confirm modal — separate from ConfirmModal so we can include the residual toggle */}
      <Modal
        isOpen={confirmSync}
        onClose={() => setConfirmSync(false)}
        title="Sync catalog from AI"
        size="md"
      >
        <div className="space-y-4 text-sm text-text">
          <p>
            The AI will return the canonical current market list of LLMs and
            inference GPUs (residual / deprecated entries deliberately
            excluded). Existing entries with a matching name are{' '}
            <em>updated</em>; missing entries are <em>created</em>. Snapshots
            already recorded in industrializations are not affected.
          </p>
          <label className="flex items-start gap-2 text-xs text-text border border-border rounded p-3 bg-smoke/40">
            <input
              type="checkbox"
              checked={archiveResiduals}
              onChange={(e) => setArchiveResiduals(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">
                Archive entries the AI did not return.
              </span>
              <br />
              <span className="text-muted">
                Active rows that aren't in the AI list will be marked archived
                (soft-hide from dropdowns). Industrializations referencing them
                keep their snapshotted price/specs. Manual rows you've added
                intentionally will also be archived if the AI didn't include
                them — leave unchecked unless you want a hard reset to the AI
                list.
              </span>
            </span>
          </label>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setConfirmSync(false)}
              className="btn-secondary"
              disabled={syncing}
            >
              Cancel
            </button>
            <button
              onClick={handleSyncFromAi}
              className="btn-primary flex items-center gap-2"
              disabled={syncing}
            >
              {syncing && <Spinner size="sm" />}
              <DownloadCloud size={13} /> Run sync
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function RowActions({
  item,
  onEdit,
  onToggle,
  onDelete,
}: {
  item: CatalogEntry;
  onEdit: (i: CatalogEntry) => void;
  onToggle: (i: CatalogEntry) => void;
  onDelete: (i: CatalogEntry) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      {item.isActive ? (
        <Badge variant="green">active</Badge>
      ) : (
        <Badge variant="slate">archived</Badge>
      )}
      <button
        onClick={() => onToggle(item)}
        className="p-1.5 rounded text-muted hover:text-blue-aria hover:bg-blue-aria/10"
        title={item.isActive ? 'Archive' : 'Re-activate'}
      >
        {item.isActive ? <PowerOff size={14} /> : <Power size={14} />}
      </button>
      <button
        onClick={() => onEdit(item)}
        className="p-1.5 rounded text-muted hover:text-blue-aria hover:bg-blue-aria/10"
        title="Edit"
      >
        <Pencil size={14} />
      </button>
      <button
        onClick={() => onDelete(item)}
        className="p-1.5 rounded text-muted hover:text-red-500 hover:bg-red-50"
        title="Delete"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function CatalogForm({
  form,
  onChange,
}: {
  form: Partial<CatalogEntry>;
  onChange: (f: Partial<CatalogEntry>) => void;
}) {
  const set = (patch: Partial<CatalogEntry>) => onChange({ ...form, ...patch });
  const isAi = (form.kind ?? 'ai_model') === 'ai_model';
  const [searchText, setSearchText] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const handleSearch = async () => {
    if (!searchText.trim()) return;

    setSearchLoading(true);
    setSearchResult(null);

    try {
      // Step 1: Search existing DB entries
      const res = await fetch(
        `/api/admin/catalog?kind=${form.kind ?? 'ai_model'}`,
      );
      const items: CatalogEntry[] = res.ok ? await res.json() : [];

      const found = items.find(
        (i) =>
          i.name.toLowerCase().includes(searchText.toLowerCase()) ||
          ('vendor' in i &&
            i.vendor?.toLowerCase().includes(searchText.toLowerCase())),
      );

      if (found) {
        // Auto-fill from DB entry
        onChange({
          ...form,
          name: found.name,
          vendor: found.vendor,
          contextWindow: found.contextWindow,
          pricePerMInputTokens: found.pricePerMInputTokens,
          pricePerMOutputTokens: found.pricePerMOutputTokens,
          deploymentMode: found.deploymentMode,
          paramCountB: found.paramCountB,
          tdpW: found.tdpW,
          vramGb: found.vramGb,
          priceEur: found.priceEur,
          concurrentUsersPerGpu: found.concurrentUsersPerGpu,
          notes: found.notes ?? '',
        });
        setSearchResult({
          success: true,
          message: `Found in catalog: ${found.name} — fields auto-filled. Review before saving.`,
        });
        return;
      }

      // Step 2: Search via AI if not in DB
      const aiRes = await fetch(apiUrl('/api/admin/catalog/search-ai'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchText,
          kind: form.kind ?? 'ai_model',
        }),
      });

      if (!aiRes.ok) {
        setSearchResult({
          success: false,
          message: 'AI search failed. Fill manually.',
        });
        return;
      }

      const aiData = await aiRes.json();

      if (!aiData.name) {
        setSearchResult({
          success: false,
          message: 'Not found in catalog or AI knowledge. Fill manually.',
        });
        return;
      }

      // Auto-fill from LLM result
      onChange({ ...form, ...aiData });

      const source = aiData.searchedWeb
        ? 'Found via AI (web search)'
        : 'Found via AI';

      setSearchResult({
        success: true,
        message: `${source}: ${aiData.name} — fields auto-filled. Review before saving.`,
      });
    } catch (err) {
      setSearchResult({
        success: false,
        message: 'Search error. Fill manually.',
      });
    } finally {
      setSearchLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search section */}
      <div>
        <label className="form-label">Search catalog or AI</label>
        <div className="flex gap-2">
          <input
            type="text"
            className="form-input flex-1"
            placeholder="Search model or GPU... (e.g. Claude Opus, H100)"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            disabled={searchLoading}
          />
          <button
            onClick={handleSearch}
            disabled={!searchText.trim() || searchLoading}
            className="px-4 py-2 bg-blue-aria text-white text-sm rounded hover:bg-blue-aria/90 disabled:opacity-50 flex items-center gap-1.5"
          >
            {searchLoading ? <Spinner size="sm" /> : <Search size={14} />}
            Search AI
          </button>
        </div>
        {searchResult && (
          <div
            className={`mt-2 text-xs p-2 rounded ${
              searchResult.success
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}
          >
            {searchResult.message}
          </div>
        )}
      </div>

      {!('_id' in form && form._id) && (
        <div>
          <label className="form-label">Type</label>
          <div className="flex gap-2">
            {(['ai_model', 'gpu'] as const).map((k) => (
              <button
                key={k}
                onClick={() => set({ kind: k })}
                className={`px-3 py-1.5 text-xs rounded border ${form.kind === k ? 'bg-blue-aria text-white border-blue-aria' : 'border-border text-muted hover:border-blue-aria'}`}
              >
                {TAB_CONFIG[k].label.replace(/s$/, '')}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="form-label">
            Name <span className="text-red-sov">*</span>
          </label>
          <input
            className="form-input"
            value={form.name ?? ''}
            onChange={(e) => set({ name: e.target.value })}
            placeholder={
              isAi ? 'e.g. mistral-large-latest' : 'e.g. NVIDIA H100 80GB'
            }
          />
        </div>

        {isAi ? (
          <>
            <div>
              <label className="form-label">Vendor</label>
              <input
                className="form-input"
                value={form.vendor ?? ''}
                onChange={(e) => set({ vendor: e.target.value })}
                placeholder="Mistral / OpenAI / Meta…"
              />
            </div>
            <div>
              <label className="form-label">Deployment</label>
              <select
                className="form-input"
                value={form.deploymentMode ?? 'cloud_api'}
                onChange={(e) => set({ deploymentMode: e.target.value as any })}
              >
                <option value="cloud_api">cloud_api</option>
                <option value="on_premise">on_premise</option>
                <option value="hybrid">hybrid</option>
              </select>
            </div>
            <div>
              <label className="form-label">Context window (tokens)</label>
              <input
                type="number"
                min={0}
                className="form-input tabular-nums"
                value={form.contextWindow ?? 0}
                onChange={(e) =>
                  set({ contextWindow: Number(e.target.value) || 0 })
                }
              />
            </div>
            <div>
              <label className="form-label">Active params (B)</label>
              <input
                type="number"
                min={0}
                step={0.1}
                className="form-input tabular-nums"
                value={form.paramCountB ?? 0}
                onChange={(e) =>
                  set({ paramCountB: Number(e.target.value) || 0 })
                }
              />
            </div>
            <div>
              <label className="form-label">€ / M input tokens</label>
              <input
                type="number"
                min={0}
                step={0.01}
                className="form-input tabular-nums"
                value={form.pricePerMInputTokens ?? 0}
                onChange={(e) =>
                  set({ pricePerMInputTokens: Number(e.target.value) || 0 })
                }
              />
            </div>
            <div>
              <label className="form-label">€ / M output tokens</label>
              <input
                type="number"
                min={0}
                step={0.01}
                className="form-input tabular-nums"
                value={form.pricePerMOutputTokens ?? 0}
                onChange={(e) =>
                  set({ pricePerMOutputTokens: Number(e.target.value) || 0 })
                }
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="form-label">VRAM (GB)</label>
              <input
                type="number"
                min={0}
                className="form-input tabular-nums"
                value={form.vramGb ?? 0}
                onChange={(e) => set({ vramGb: Number(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="form-label">TDP (W)</label>
              <input
                type="number"
                min={0}
                className="form-input tabular-nums"
                value={form.tdpW ?? 0}
                onChange={(e) => set({ tdpW: Number(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="form-label">Concurrent users / GPU</label>
              <input
                type="number"
                min={0}
                className="form-input tabular-nums"
                value={form.concurrentUsersPerGpu ?? 0}
                onChange={(e) =>
                  set({ concurrentUsersPerGpu: Number(e.target.value) || 0 })
                }
                placeholder="estimated capacity"
              />
            </div>
            <div>
              <label className="form-label">Unit price (€)</label>
              <input
                type="number"
                min={0}
                className="form-input tabular-nums"
                value={form.priceEur ?? 0}
                onChange={(e) => set({ priceEur: Number(e.target.value) || 0 })}
              />
            </div>
          </>
        )}

        <div className="col-span-2">
          <label className="form-label">Notes</label>
          <textarea
            className="form-textarea"
            rows={2}
            value={form.notes ?? ''}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </div>
        <label className="col-span-2 flex items-center gap-2 text-xs text-text">
          <input
            type="checkbox"
            checked={form.isActive ?? true}
            onChange={(e) => set({ isActive: e.target.checked })}
          />
          Active (visible in compute-calculator dropdowns)
        </label>
        {form.aiRationale && (
          <div className="col-span-2 text-[11px] text-blue-aria bg-blue-pale/40 border border-blue-aria/20 rounded p-2 flex items-start gap-1">
            <Sparkles size={11} className="mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold">
                Last AI refresh ({fmtDate(form.aiUpdatedAt)}):
              </span>{' '}
              {form.aiRationale}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
