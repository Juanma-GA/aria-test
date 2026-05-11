'use client';

import { createContext, useContext, useEffect, useState } from 'react';

type EffectiveRole = 'admin' | 'owner' | 'editor' | 'viewer';

interface AuditAccess {
  effectiveRole: EffectiveRole | null;
  canEdit: boolean;
  canManageTeam: boolean;
  loading: boolean;
}

const DEFAULT_ACCESS: AuditAccess = {
  effectiveRole: null,
  canEdit: false,
  canManageTeam: false,
  loading: true,
};

const Context = createContext<AuditAccess>(DEFAULT_ACCESS);

export function AuditAccessProvider({ auditId, children }: { auditId: string; children: React.ReactNode }) {
  const [access, setAccess] = useState<AuditAccess>(DEFAULT_ACCESS);

  useEffect(() => {
    if (!auditId) return;
    let active = true;
    fetch(`/api/audits/${auditId}/access`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!active) return;
        if (!data) {
          setAccess({ effectiveRole: null, canEdit: false, canManageTeam: false, loading: false });
          return;
        }
        setAccess({
          effectiveRole: data.effectiveRole ?? null,
          canEdit: !!data.canEdit,
          canManageTeam: !!data.canManageTeam,
          loading: false,
        });
      })
      .catch(() => {
        if (!active) return;
        setAccess({ effectiveRole: null, canEdit: false, canManageTeam: false, loading: false });
      });
    return () => { active = false; };
  }, [auditId]);

  return <Context.Provider value={access}>{children}</Context.Provider>;
}

export function useAuditAccess(): AuditAccess {
  return useContext(Context);
}
