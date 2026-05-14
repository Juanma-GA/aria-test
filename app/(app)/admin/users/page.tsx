'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, ShieldCheck, User, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/lib/store/authStore';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { apiUrl } from '@/lib/utils';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

type UserRole = 'admin' | 'consultant' | 'viewer';

interface UserRecord {
  _id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

const ROLE_VARIANTS: Record<UserRole, 'red' | 'blue' | 'default'> = {
  admin: 'red',
  consultant: 'blue',
  viewer: 'default',
};

const ROLE_ICONS: Record<UserRole, React.ReactNode> = {
  admin: <ShieldCheck size={13} />,
  consultant: <User size={13} />,
  viewer: <Eye size={13} />,
};

const EMPTY_FORM = {
  name: '',
  email: '',
  password: '',
  userRole: 'consultant' as UserRole,
};

export default function UsersPage() {
  const router = useRouter();
  const { user: me } = useAuthStore();

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UserRecord | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<UserRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (me && me.role !== 'admin') {
      router.replace('/dashboard');
    }
  }, [me, router]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/users'));
      if (!res.ok) throw new Error('Failed to load users');
      setUsers(await res.json());
    } catch {
      toast.error('Could not load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (u: UserRecord) => {
    setEditing(u);
    setForm({ name: u.name, email: u.email, password: '', userRole: u.role });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      toast.error('Name and email are required');
      return;
    }
    if (!editing && !form.password) {
      toast.error('Password is required for new users');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const body: Record<string, string> = {
          name: form.name,
          email: form.email,
          userRole: form.userRole,
        };
        if (form.password) body.password = form.password;
        const res = await fetch(apiUrl(`/api/users/${editing._id}`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error ?? 'Error updating user');
          return;
        }
        toast.success('User updated');
      } else {
        const res = await fetch(apiUrl('/api/users'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error ?? 'Error creating user');
          return;
        }
        toast.success('User created');
      }
      setModalOpen(false);
      fetchUsers();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(apiUrl(`/api/users/${deleteTarget._id}`), {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Error deleting user');
        return;
      }
      toast.success('User deleted');
      setDeleteTarget(null);
      fetchUsers();
    } finally {
      setDeleting(false);
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
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">User Management</h1>
          <p className="text-sm text-muted mt-0.5">
            {users.length} user{users.length !== 1 ? 's' : ''} registered
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-aria text-white text-sm font-medium rounded-sm hover:bg-blue-aria/90 transition-colors"
        >
          <Plus size={15} />
          New User
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-smoke">
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">
                Name
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">
                Email
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">
                Role
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">
                Created
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => (
              <tr key={u._id} className="hover:bg-smoke/50 transition-colors">
                <td className="px-4 py-3 font-medium text-text">{u.name}</td>
                <td className="px-4 py-3 text-muted">{u.email}</td>
                <td className="px-4 py-3">
                  <Badge variant={ROLE_VARIANTS[u.role]}>
                    <span className="flex items-center gap-1">
                      {ROLE_ICONS[u.role]}
                      {u.role}
                    </span>
                  </Badge>
                </td>
                <td className="px-4 py-3 text-muted text-xs">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => openEdit(u)}
                      className="p-1.5 rounded text-muted hover:text-blue-aria hover:bg-blue-aria/10 transition-colors"
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(u)}
                      disabled={u._id === me?.id}
                      className="p-1.5 rounded text-muted hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title={
                        u._id === me?.id
                          ? "Can't delete your own account"
                          : 'Delete'
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create / Edit modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit User' : 'New User'}
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="form-label">Name</label>
            <input
              className="form-input"
              placeholder="Full name…"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="form-label">Email</label>
            <input
              type="email"
              className="form-input"
              placeholder="email@atexis.com"
              value={form.email}
              onChange={(e) =>
                setForm((f) => ({ ...f, email: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="form-label">
              Password{' '}
              {editing && (
                <span className="text-muted font-normal">
                  (leave blank to keep current)
                </span>
              )}
            </label>
            <input
              type="password"
              className="form-input"
              placeholder={editing ? 'New password…' : 'Password…'}
              value={form.password}
              onChange={(e) =>
                setForm((f) => ({ ...f, password: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="form-label">Role</label>
            <select
              className="form-input"
              value={form.userRole}
              onChange={(e) =>
                setForm((f) => ({ ...f, userRole: e.target.value as UserRole }))
              }
            >
              <option value="admin">Admin</option>
              <option value="consultant">Consultant</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
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
              {editing ? 'Save changes' : 'Create user'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete user"
        message={`Are you sure you want to delete ${deleteTarget?.name} (${deleteTarget?.email})? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isLoading={deleting}
      />
    </div>
  );
}
