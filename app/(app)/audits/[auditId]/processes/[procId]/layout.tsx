'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { usePageCode } from '@/context/PageCodeContext';

export default function ProcessLayout({ children }: { children: React.ReactNode }) {
  const { auditId, procId } = useParams<{ auditId: string; procId: string }>();
  const { setPageCode } = usePageCode();

  useEffect(() => {
    if (!auditId || !procId) return;
    fetch(`/api/audits/${auditId}/processes/${procId}`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => { if (data?.procId) setPageCode(data.procId); })
      .catch(() => {});
    return () => setPageCode(null);
  }, [auditId, procId, setPageCode]);

  return <>{children}</>;
}
