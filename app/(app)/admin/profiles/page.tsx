'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, BadgeEuro, Power, PowerOff } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/lib/store/authStore';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import type { ProfileCatalogEntry } from '@/lib/types';

const EMPTY_FORM = { name: '', role: '', hourlyRateEur: 0, isActive: true, notes: '' };

export default function ProfilesAdminPage() {
  const router = useRouter();
  const { user: me } = useAuthStore();

  const [profiles, setProfiles] = useState<ProfileCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProfileCatalogEntry | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ProfileCatalogEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (me && me.role !== 'admin') router.replace('/dashboard');
  }, [me, router]);

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/profiles');
      if (!res.ok) throw new Error('Failed to load profiles');
      setProfiles(await res.json());
    } catch {
      toast.error('Could not load profiles');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { fetchProfiles(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (p: ProfileCatalogEntry) => {
    setEditing(p);
    setForm({
      name: p.name,
      role: p.role,
      hourlyRateEur: p.hourlyRateEur,
      isActive: p.isActive,
      notes: p.notes ?? '',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.role.trim()) {
      toast.error('Name and role are required');
      return;
    }
    if (!Number.isFinite(form.hourlyRateEur) || form.hourlyRateEur < 0) {
      toast.error('Hourly rate must be a non-negative number');
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        role: form.role.trim(),
        hourlyRateEur: form.hourlyRateEur,
        isActive: form.isActive,
        notes: form.notes,
      };
      const res = editing
        ? await fetch(`/api/admin/profiles/${editing._id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : await fetch('/api/admin/profiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? 'Save failed'); return; }
      toast.success(editing ? 'Profile updated' : 'Profile created');
      setModalOpen(false);
      fetchProfiles();
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p: ProfileCatalogEntry) => {
    const res = await fetch(`/api/admin/profiles/${p._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !p.isActive }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error ?? 'Update failed'); return; }
    toast.success(p.isActive ? 'Profile archived' : 'Profile re-activated');
    fetchProfiles();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/profiles/${deleteTarget._id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? 'Delete failed'); return; }
      toast.success('Profile deleted');
      setDeleteTarget(null);
      fetchProfiles();
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;
  }

  const activeCount = profiles.filter(p => p.isActive).length;
  const archivedCount = profiles.length - activeCount;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text flex items-center gap-2">
            <BadgeEuro size={20} className="text-blue-aria" /> Profile Catalog
          </h1>
          <p className="text-sm text-muted mt-0.5">
            Organisation-wide rate cards used for industrialization cost breakdowns.{' '}
            {activeCount} active{archivedCount > 0 ? ` · ${archivedCount} archived` : ''}.
          </p>
        </div>
        <button onClick={openCreate} className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-aria text-white text-sm font-medium rounded-sm hover:bg-blue-aria/90 transition-colors">
          <Plus size={15} /> New Profile
        </button>
      </div>

      <div className="card overflow-hidden p-0">
        {profiles.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">
            No profiles yet. Create the first one to start breaking down costs in profile-hours.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-smoke">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Role</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Rate</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {profiles.map((p) => (
                <tr key={p._id} className={`hover:bg-smoke/50 transition-colors ${p.isActive ? '' : 'opacity-60'}`}>
                  <td className="px-4 py-3 font-medium text-text">{p.name}</td>
                  <td className="px-4 py-3 text-muted">{p.role}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">€{p.hourlyRateEur.toFixed(2)}<span className="text-muted text-xs">/h</span></td>
                  <td className="px-4 py-3">
                    {p.isActive
                      ? <Badge variant="green">Active</Badge>
                      : <Badge variant="slate">Archived</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => toggleActive(p)}
                        className="p-1.5 rounded text-muted hover:text-blue-aria hover:bg-blue-aria/10 transition-colors"
                        title={p.isActive ? 'Archive' : 'Re-activate'}
                      >
                        {p.isActive ? <PowerOff size={14} /> : <Power size={14} />}
                      </button>
                      <button
                        onClick={() => openEdit(p)}
                        className="p-1.5 rounded text-muted hover:text-blue-aria hover:bg-blue-aria/10 transition-colors"
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(p)}
                        className="p-1.5 rounded text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit profile' : 'New profile'}
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="form-label">Name <span className="text-red-sov">*</span></label>
            <input
              className="form-input"
              placeholder="e.g. Senior ML Engineer"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="form-label">Role <span className="text-red-sov">*</span></label>
            <input
              className="form-input"
              placeholder="e.g. Engineering, Project Management, QA"
              value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
            />
          </div>
          <div>
            <label className="form-label">Hourly rate (€)</label>
            <input
              type="number"
              min={0}
              step={0.5}
              className="form-input"
              value={form.hourlyRateEur}
              onChange={e => setForm(f => ({ ...f, hourlyRateEur: Number(e.target.value) || 0 }))}
            />
            <p className="text-[11px] text-muted mt-1">Loaded cost — salary + overheads — used in industrialization cost breakdowns.</p>
          </div>
          <div>
            <label className="form-label">Notes</label>
            <textarea
              className="form-textarea"
              rows={2}
              placeholder="Optional"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-text">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
            />
            Active (visible in cost-editor dropdowns)
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="btn-secondary" disabled={saving}>
              Cancel
            </button>
            <button onClick={handleSave} className="btn-primary flex items-center gap-2" disabled={saving}>
              {saving && <Spinner size="sm" />}
              {editing ? 'Save changes' : 'Create profile'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete profile"
        message={`Delete ${deleteTarget?.name} (${deleteTarget?.role})? Existing industrializations that reference this profile will keep the recorded hours but the line will show "Profile archived".`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isLoading={deleting}
      />
    </div>
  );
}
