'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { TeamEditor, type TeamMemberRow, type UserDir } from './TeamEditor';
import type { AuditTeamRole } from '@/lib/models/Audit';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  auditId: string;
  /** Called after any mutation so the parent can refresh its team summary. */
  onChanged?: () => void;
}

interface TeamPayload {
  userId: string;
  role: AuditTeamRole;
  user: UserDir | null;
}

export function TeamEditModal({ isOpen, onClose, auditId, onChanged }: Props) {
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [users, setUsers] = useState<UserDir[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    const [teamRes, usersRes, accessRes] = await Promise.all([
      fetch(`/api/audits/${auditId}/team`, { credentials: 'include' }).then(r => r.json()),
      fetch('/api/users', { credentials: 'include' }).then(r => r.json()),
      fetch(`/api/audits/${auditId}/access`, { credentials: 'include' }).then(r => r.json()),
    ]);
    const team: TeamPayload[] = Array.isArray(teamRes?.team) ? teamRes.team : [];
    setMembers(team.map(m => ({ userId: m.userId, role: m.role, user: m.user })));
    setUsers(Array.isArray(usersRes) ? usersRes : []);
    setCanManage(!!accessRes?.canManageTeam);
    setLoading(false);
  };

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError('');
    refresh().catch(() => setLoading(false));
  }, [isOpen, auditId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAdd = async (userId: string, role: AuditTeamRole) => {
    setError('');
    try {
      const res = await fetch(`/api/audits/${auditId}/team`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      await refresh();
      onChanged?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  };

  const handleUpdateRole = async (userId: string, role: AuditTeamRole) => {
    setError('');
    try {
      const res = await fetch(`/api/audits/${auditId}/team/${userId}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      await refresh();
      onChanged?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  };

  const handleRemove = async (userId: string) => {
    setError('');
    try {
      const res = await fetch(`/api/audits/${auditId}/team/${userId}`, {
        method: 'DELETE', credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      await refresh();
      onChanged?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Manage audit team" size="xl">
      {loading ? (
        <div className="flex items-center justify-center py-10"><Spinner size="md" /></div>
      ) : (
        <div className="space-y-3">
          {!canManage && (
            <div className="text-xs text-muted bg-smoke border border-border rounded-sm px-3 py-2">
              You can see the team but only audit owners can add or change members.
            </div>
          )}
          {error && <div className="text-xs text-red-sov bg-red-sov-light rounded p-2">{error}</div>}
          <TeamEditor
            members={members}
            candidates={users}
            canManage={canManage}
            onAdd={handleAdd}
            onUpdateRole={handleUpdateRole}
            onRemove={handleRemove}
          />
        </div>
      )}
    </Modal>
  );
}
