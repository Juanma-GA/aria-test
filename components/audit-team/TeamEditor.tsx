'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2, Search, Crown, Edit3, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import type { AuditTeamRole } from '@/lib/models/Audit';

export interface UserDir {
  _id: string;
  name: string;
  email: string;
  role?: string;
}

export interface TeamMemberRow {
  userId: string;
  role: AuditTeamRole;
  user: UserDir | null;
}

interface Props {
  members: TeamMemberRow[];
  candidates: UserDir[];
  canManage: boolean;
  /** When false, role selectors and remove actions are hidden (audit viewers). */
  readOnly?: boolean;
  /** Called when an existing member's role changes. */
  onUpdateRole?: (userId: string, role: AuditTeamRole) => void | Promise<void>;
  /** Called when a member is removed. */
  onRemove?: (userId: string) => void | Promise<void>;
  /** Called when a new member is added. */
  onAdd?: (userId: string, role: AuditTeamRole) => void | Promise<void>;
  /** Optional: ids of members that cannot be removed/demoted (e.g. current user, last owner). */
  protectedIds?: Set<string>;
}

const ROLE_VARIANTS: Record<AuditTeamRole, 'green' | 'blue' | 'slate'> = {
  owner: 'green',
  editor: 'blue',
  viewer: 'slate',
};

const ROLE_LABELS: Record<AuditTeamRole, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
};

const ROLE_ICONS: Record<AuditTeamRole, React.ComponentType<{ size?: number | string; className?: string }>> = {
  owner: Crown,
  editor: Edit3,
  viewer: Eye,
};

export function TeamEditor({
  members,
  candidates,
  canManage,
  readOnly,
  onUpdateRole,
  onRemove,
  onAdd,
  protectedIds,
}: Props) {
  const [search, setSearch] = useState('');
  const [pendingRole, setPendingRole] = useState<AuditTeamRole>('editor');

  const memberIds = useMemo(() => new Set(members.map(m => m.userId)), [members]);
  const available = candidates.filter(u => !memberIds.has(u._id));
  const filtered = available.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      {/* Members list */}
      {members.length === 0 ? (
        <p className="text-xs text-muted">No members yet.</p>
      ) : (
        <div className="border border-border rounded-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-smoke border-b border-border">
              <tr>
                {['Member', 'Email', 'Role', ''].map(h => (
                  <th key={h} className="text-left py-2 px-3 text-xs font-medium text-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map(m => {
                const RoleIcon = ROLE_ICONS[m.role];
                const isProtected = protectedIds?.has(m.userId) ?? false;
                return (
                  <tr key={m.userId} className="border-b border-border/50 last:border-b-0">
                    <td className="py-2.5 px-3 text-xs">
                      <div className="font-medium text-text">{m.user?.name ?? '— Unknown user —'}</div>
                      {m.user?.role && <div className="text-[10px] text-muted">global: {m.user.role}</div>}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-muted">{m.user?.email ?? '—'}</td>
                    <td className="py-2.5 px-3">
                      {!readOnly && canManage && onUpdateRole ? (
                        <select
                          value={m.role}
                          onChange={e => onUpdateRole(m.userId, e.target.value as AuditTeamRole)}
                          className="form-input text-xs h-7 w-28"
                        >
                          <option value="owner">Owner</option>
                          <option value="editor">Editor</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      ) : (
                        <Badge variant={ROLE_VARIANTS[m.role]}>
                          <RoleIcon size={10} className="mr-1" />
                          {ROLE_LABELS[m.role]}
                        </Badge>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {!readOnly && canManage && onRemove && !isProtected && (
                        <button
                          onClick={() => onRemove(m.userId)}
                          className="text-muted hover:text-red-sov"
                          title="Remove from team"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add member */}
      {!readOnly && canManage && onAdd && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-semibold flex items-center gap-1.5"><Plus size={12} /> Add member</h4>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="form-input w-full pl-8 text-xs h-8"
              />
            </div>
            <select
              value={pendingRole}
              onChange={e => setPendingRole(e.target.value as AuditTeamRole)}
              className="form-input text-xs h-8 w-28"
            >
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
              <option value="owner">Owner</option>
            </select>
          </div>
          {filtered.length === 0 ? (
            <p className="text-xs text-muted">{search ? 'No matching users.' : 'All users are already in the team.'}</p>
          ) : (
            <div className="space-y-1 max-h-56 overflow-y-auto border border-border rounded-sm">
              {filtered.slice(0, 50).map(u => (
                <div key={u._id} className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-smoke text-xs">
                  <div>
                    <div className="font-medium">{u.name}</div>
                    <div className="text-muted text-[10px]">{u.email}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { onAdd(u._id, pendingRole); setSearch(''); }}
                    className="btn-primary text-[11px] py-1 px-2 flex items-center gap-1"
                  >
                    <Plus size={11} /> Add as {ROLE_LABELS[pendingRole]}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
