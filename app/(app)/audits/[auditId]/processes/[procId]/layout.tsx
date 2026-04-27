"use client";

import { useEffect } from "react";
import { useParams, usePathname } from "next/navigation";
import { usePageCode } from "@/context/PageCodeContext";
import { apiUrl } from "@/lib/utils";
import { useBreadcrumb } from "@/context/BreadcrumbContext";

const BLOCK_SEGMENTS = ["b1", "b2", "b3", "b5"] as const;

export default function ProcessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { auditId, procId } = useParams<{ auditId: string; procId: string }>();
  const pathname = usePathname();
  const { setPageCode } = usePageCode();
  const { setItems } = useBreadcrumb();

  useEffect(() => {
    if (!auditId || !procId) return;
    let active = true;
    Promise.all([
      fetch(apiUrl(`/api/audits/${auditId}`), { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(apiUrl(`/api/audits/${auditId}/processes/${procId}`), {
        credentials: "include",
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([audit, proc]) => {
      if (!active) return;
      if (proc?.procId) setPageCode(proc.procId);
      const auditLabel = audit?.name ?? "Audit";
      const procLabel = proc?.procId
        ? `${proc.procId} — ${proc.name ?? ""}`.trim()
        : "Process";
      const lastSeg = (pathname?.split("/").pop() ?? "").toLowerCase();
      const blockLabel = (BLOCK_SEGMENTS as readonly string[]).includes(lastSeg)
        ? `B${lastSeg.slice(1).toUpperCase()}`
        : null;
      const items = [
        { label: "Dashboard", href: "/dashboard" },
        { label: auditLabel, href: `/audits/${auditId}` },
        { label: procLabel, href: `/audits/${auditId}/processes/${procId}` },
      ];
      if (blockLabel) items.push({ label: blockLabel, href: pathname ?? "" });
      setItems(items);
    });
    return () => {
      active = false;
      setPageCode(null);
      setItems([]);
    };
  }, [auditId, procId, pathname, setPageCode, setItems]);

  return <>{children}</>;
}
