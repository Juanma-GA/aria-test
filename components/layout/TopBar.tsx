'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { SaveIndicator, SaveStatus } from '@/components/ui/SaveIndicator';
import { usePageCode } from '@/context/PageCodeContext';
import { useBreadcrumb } from '@/context/BreadcrumbContext';

type ClassificationVariant = 'green' | 'amber' | 'red' | 'blue' | 'purple' | 'teal' | 'slate' | 'default';

interface TopBarProps {
  auditName?: string;
  classification?: string;
  classificationVariant?: ClassificationVariant;
  saveStatus?: SaveStatus;
}

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  audits: 'Audits',
  processes: 'Processes',
  'use-cases': 'Use Cases',
  scoring: 'Scoring',
  roadmap: 'Roadmap',
  pocs: 'POCs',
  export: 'Export',
  settings: 'Settings',
  implementations: 'Implementations',
  b1: 'B1 Context',
  b2: 'B2 Sovereignty',
  b3: 'B3 Process Map',
  b5: 'B4 AI Opportunities',
  usecases: 'Use Cases',
  new: 'New',
};

function buildBreadcrumb(pathname: string): string[] {
  const parts = pathname.split('/').filter(Boolean);
  const crumbs: string[] = [];

  for (const part of parts) {
    // Skip UUIDs / mongo ids (24 hex chars or uuid pattern)
    if (/^[a-f0-9]{24}$/.test(part) || /^[0-9a-f-]{36}$/.test(part)) continue;
    const label = SEGMENT_LABELS[part];
    if (label) crumbs.push(label);
  }

  return crumbs;
}

export function TopBar({
  auditName,
  classification,
  classificationVariant = 'green',
  saveStatus,
}: TopBarProps) {
  const pathname = usePathname() ?? '/';
  const { items: bcItems } = useBreadcrumb();
  const urlCrumbs = buildBreadcrumb(pathname);
  const { pageCode } = usePageCode();

  return (
    <header
      className="flex items-center justify-between px-6 shrink-0 bg-white border-b border-border"
      style={{ height: 48 }}
    >
      {/* Left: breadcrumb + entity code */}
      <div className="flex items-center gap-2 min-w-0">
        {/* Breadcrumb — context-driven when set, fallback to URL */}
        <nav className="flex items-center gap-1 text-sm text-muted" aria-label="Breadcrumb">
          {bcItems.length > 0
            ? bcItems.map((item, i) => (
                <span key={item.href} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight size={13} className="text-border shrink-0" />}
                  {i === bcItems.length - 1 ? (
                    <span className="text-text font-medium truncate">{item.label}</span>
                  ) : (
                    <Link href={item.href} className="truncate hover:text-blue-aria transition-colors">
                      {item.label}
                    </Link>
                  )}
                </span>
              ))
            : urlCrumbs.map((crumb, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight size={13} className="text-border shrink-0" />}
                  <span className={i === urlCrumbs.length - 1 ? 'text-text font-medium truncate' : 'truncate'}>
                    {crumb}
                  </span>
                </span>
              ))
          }
        </nav>

        {/* Entity code (PROC-01, CU-01, etc.) */}
        {pageCode && (
          <span className="ml-2 font-mono text-xs text-blue-aria bg-blue-pale px-2 py-0.5 rounded">
            {pageCode}
          </span>
        )}

        {/* Audit name + classification */}
        {auditName && (
          <div className="flex items-center gap-2 ml-3 pl-3 border-l border-border min-w-0">
            <span className="text-sm font-medium text-text truncate max-w-[200px]">
              {auditName}
            </span>
            {classification && (
              <Badge variant={classificationVariant}>{classification}</Badge>
            )}
          </div>
        )}
      </div>

      {/* Right: save indicator */}
      {saveStatus && (
        <div className="shrink-0 ml-4">
          <SaveIndicator status={saveStatus} />
        </div>
      )}
    </header>
  );
}
