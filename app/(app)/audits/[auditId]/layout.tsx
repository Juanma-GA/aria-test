'use client';

import { useEffect } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { Lock } from 'lucide-react';
import { useBreadcrumb } from '@/context/BreadcrumbContext';
import { AuditAccessProvider, useAuditAccess } from '@/context/AuditAccessContext';

const AUDIT_SUB_LABELS: Record<string, string> = {
  scoring: 'Scoring',
  pocs: 'POCs',
  usecases: 'Use Cases',
  roadmap: 'Roadmap',
  report: 'AI Report',
  export: 'Export',
};

function ReadOnlyBanner() {
  const { canEdit, effectiveRole, loading } = useAuditAccess();
  if (loading || canEdit) return null;
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-sov-light border border-amber-sov/30 text-amber-sov text-xs rounded-sm mb-3">
      <Lock size={12} />
      <span>
        Read-only mode {effectiveRole ? <span className="text-muted">— your role: {effectiveRole}</span> : null}
      </span>
    </div>
  );
}

export default function AuditLayout({ children }: { children: React.ReactNode }) {
  const { auditId } = useParams<{ auditId: string }>();
  const pathname = usePathname();
  const { setItems } = useBreadcrumb();

  useEffect(() => {
    if (!auditId) return;

    // Skip when a nested process layout owns the breadcrumb.
    if (pathname?.includes('/processes/')) return;

    let active = true;
    fetch(`/api/audits/${auditId}`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
      .then(audit => {
        if (!active) return;
        const auditLabel = audit?.name ?? 'Audit';
        const items = [
          { label: 'Dashboard', href: '/dashboard' },
          { label: auditLabel, href: `/audits/${auditId}` },
        ];
        const lastSeg = (pathname?.split('/').pop() ?? '').toLowerCase();
        const subLabel = AUDIT_SUB_LABELS[lastSeg];
        if (subLabel && lastSeg !== auditId) {
          items.push({ label: subLabel, href: pathname ?? '' });
        }
        setItems(items);
      });
    return () => {
      active = false;
      setItems([]);
    };
  }, [auditId, pathname, setItems]);

  return (
    <AuditAccessProvider auditId={auditId as string}>
      <ReadOnlyBanner />
      {children}
    </AuditAccessProvider>
  );
}
