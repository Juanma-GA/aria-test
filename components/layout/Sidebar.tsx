'use client';
import Link from 'next/link';
import { usePathname, useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { apiUrl } from '@/lib/utils';
import { downloadPocReport, downloadIndividualPocReport } from '@/lib/pocReport';
import { toast } from 'sonner';
import {
  LayoutDashboard,
  GitBranch,
  Lightbulb,
  Map,
  FlaskConical,
  Factory,
  FileText,
  Settings,
  LogOut,
  ChevronDown,
  ChevronRight,
  Users,
  BadgeEuro,
  Cpu,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuthStore } from '@/lib/store/authStore';

interface NavItem {
  href?: string;
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void | Promise<void>;
  disabled?: boolean;
}

interface ProcessStub {
  _id: string;
  procId: string;
  name: string;
}

interface UCStub {
  _id: string;
  cuId: string;
  description: string;
}

const BLOCKS = [
  { key: 'b1', label: 'B1 Context' },
  { key: 'b2', label: 'B2 Sovereignty' },
  { key: 'b3', label: 'B3 Process Map' },
  { key: 'b5', label: 'B5 Use Cases' },
];

function DownloadNavItem({
  label,
  icon,
  onRun,
  compact,
}: {
  label: string;
  icon?: React.ReactNode;
  onRun: () => Promise<void>;
  compact?: boolean;
}) {
  const [running, setRunning] = useState(false);
  const handle = async () => {
    if (running) return;
    setRunning(true);
    try {
      await onRun();
    } finally {
      setRunning(false);
    }
  };
  return (
    <button
      onClick={handle}
      disabled={running}
      className={clsx(
        'sidebar-item sidebar-item-inactive w-full text-left disabled:opacity-70',
        compact && '!text-xs py-1',
      )}
    >
      {running ? <Spinner size="sm" /> : (icon ?? null)}
      <span>{running ? 'Downloading…' : label}</span>
    </button>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const currentUser = useAuthStore((s) => s.user);

  const auditId = params?.auditId as string | undefined;
  const procId = params?.procId as string | undefined;

  const [processes, setProcesses] = useState<ProcessStub[]>([]);
  const [expandedProc, setExpandedProc] = useState<string | null>(
    procId ?? null,
  );
  const [ucsByProc, setUcsByProc] = useState<Record<string, UCStub[]>>({});
  const [expandedUCs, setExpandedUCs] = useState<string | null>(null);
  const [auditName, setAuditName] = useState('');
  const [reportsExpanded, setReportsExpanded] = useState(false);
  const [individualExpanded, setIndividualExpanded] = useState(false);
  const [pocsList, setPocsList] = useState<{ _id: string; name: string }[]>([]);

  useEffect(() => {
    if (!auditId) {
      setProcesses([]);
      return;
    }
    fetch(apiUrl(`/api/audits/${auditId}/processes`), {
      credentials: 'include',
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: any[]) =>
        setProcesses(
          data.map((p) => ({ _id: p._id, procId: p.procId, name: p.name })),
        ),
      )
      .catch(() => {});
  }, [auditId]);

  useEffect(() => {
    if (!auditId) {
      setAuditName('');
      return;
    }
    fetch(apiUrl(`/api/audits/${auditId}`), { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: any) => {
        if (data?.name) setAuditName(data.name);
      })
      .catch(() => {});
  }, [auditId]);

  // Auto-expand the active process and its UC list when on b5
  useEffect(() => {
    if (procId) {
      setExpandedProc(procId);
      if (pathname?.includes('/b5')) setExpandedUCs(procId);
    }
  }, [procId, pathname]);

  useEffect(() => {
    if (pathname?.includes('/report')) setReportsExpanded(true);
  }, [pathname]);

  // Fetch use cases when a process is expanded (re-fetch on b5 navigation to pick up new UCs)
  useEffect(() => {
    if (!auditId || !expandedProc) return;
    fetch(apiUrl(`/api/audits/${auditId}/usecases?processId=${expandedProc}`))
      .then((r) => (r.ok ? r.json() : []))
      .then((data: any[]) =>
        setUcsByProc((prev) => ({
          ...prev,
          [expandedProc]: data.map((u) => ({
            _id: u._id,
            cuId: u.cuId,
            description: u.description,
          })),
        })),
      )
      .catch(() => {});
  }, [auditId, expandedProc, pathname]);

  // Fetch POCs when Individual POC Report is expanded (lazy)
  useEffect(() => {
    if (!auditId || !individualExpanded) return;
    fetch(apiUrl(`/api/pocs?auditId=${auditId}`), { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: any[]) =>
        setPocsList(
          data.map((p) => ({
            _id: String(p._id),
            name: p.name || p.pocId || 'Untitled',
          })),
        ),
      )
      .catch(() => {});
  }, [auditId, individualExpanded]);

  const mainNav: NavItem[] = [
    {
      href: '/dashboard',
      label: 'Audits',
      icon: <LayoutDashboard size={16} />,
    },
    { href: '/usecases', label: 'Use Cases', icon: <Lightbulb size={16} /> },
    { href: '/pocs', label: 'POCs', icon: <FlaskConical size={16} /> },
    {
      href: '/industrializations',
      label: 'Industrializations',
      icon: <Factory size={16} />,
    },
    { href: '/roadmap', label: 'Roadmap', icon: <Map size={16} /> },
  ];

  const auditNavTop: NavItem[] = auditId
    ? [
        {
          href: `/audits/${auditId}/usecases`,
          label: 'Use Cases',
          icon: <Lightbulb size={16} />,
        },
        {
          href: `/audits/${auditId}/pocs`,
          label: 'POCs',
          icon: <FlaskConical size={16} />,
        },
        {
          href: `/audits/${auditId}/industrializations`,
          label: 'Industrializations',
          icon: <Factory size={16} />,
        },
        {
          href: `/audits/${auditId}/roadmap`,
          label: 'Roadmap',
          icon: <Map size={16} />,
        },
      ]
    : [];

  const handleLogout = async () => {
    try {
      await fetch(apiUrl('/api/auth/logout'), { method: 'POST' });
    } catch {
      // ignore errors
    }
    clearAuth();
    router.push('/auth/login');
  };

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(href + '/');

  const reportsActive = pathname?.includes('/report') ?? false;

  const NavLink = ({ item }: { item: NavItem }) => {
    if (item.disabled) {
      return (
        <div className="sidebar-item opacity-50 cursor-not-allowed text-slate-600">
          {item.icon}
          <span>
            {item.label} <span className="text-[10px]">(soon)</span>
          </span>
        </div>
      );
    }
    if (item.onClick) {
      return (
        <button
          onClick={item.onClick}
          className="sidebar-item sidebar-item-inactive w-full text-left"
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      );
    }
    return (
      <Link
        href={item.href!}
        className={clsx(
          'sidebar-item',
          isActive(item.href!) ? 'sidebar-item-active' : 'sidebar-item-inactive',
        )}
      >
        {item.icon}
        <span>{item.label}</span>
      </Link>
    );
  };

  return (
    <aside
      className="flex flex-col shrink-0 h-screen overflow-y-auto"
      style={{ width: 240, backgroundColor: '#0B1929' }}
    >
      {/* Logo */}
      <div className="px-5 pt-6 pb-5 border-b border-white/10">
        <Link href="/dashboard" className="block">
          <span className="font-display text-2xl font-bold text-blue-light tracking-tight leading-none">
            ARIA
          </span>
          <span className="block text-xs text-slate-400 mt-0.5 font-sans">
            by Atexis
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4">
        {/* Workspace section */}
        <div className="pb-1 mb-3">
          <span className="px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            Workspace
          </span>
        </div>

        <div className="space-y-0.5 mb-3 pb-3 border-b border-white/10">
          {mainNav.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </div>

        {/* Current Audit Section */}
        {auditId && (
          <>
            <div className="pb-1 mb-3">
              <span className="px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                Current Audit
              </span>
            </div>

            <div className="px-3 pt-2 pb-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 flex items-center gap-1.5">
                <GitBranch size={10} /> Processes
              </span>
            </div>

            {processes.map((proc) => {
              const isExpanded = expandedProc === proc._id;
              const procBase = `/audits/${auditId}/processes/${proc._id}`;
              const isThisProc = pathname?.startsWith(procBase);

              return (
                <div key={proc._id}>
                  <div
                    className={clsx(
                      'flex items-center rounded-sm transition-colors',
                      isThisProc
                        ? 'text-blue-light bg-white/10'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5',
                    )}
                  >
                    <Link
                      href={procBase}
                      className="flex-1 px-3 py-1.5 text-xs truncate"
                    >
                      {proc.procId} – {proc.name}
                    </Link>
                    <button
                      onClick={() =>
                        setExpandedProc(isExpanded ? null : proc._id)
                      }
                      className="px-2 py-1.5 shrink-0"
                      aria-label={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      {isExpanded ? (
                        <ChevronDown size={11} />
                      ) : (
                        <ChevronRight size={11} />
                      )}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="ml-5 pl-2 border-l border-white/10 space-y-0.5 mt-0.5 mb-1">
                      {BLOCKS.map((block) => {
                        const href = `${procBase}/${block.key}`;
                        const active =
                          pathname === href || pathname?.startsWith(href);

                        if (block.key === 'b5') {
                          const ucs = ucsByProc[proc._id] ?? [];
                          const ucExpanded = expandedUCs === proc._id;
                          return (
                            <div key="b5">
                              <div
                                className={clsx(
                                  'flex items-center rounded-sm transition-colors',
                                  active
                                    ? 'text-blue-light bg-white/10'
                                    : 'text-slate-500 hover:text-slate-200 hover:bg-white/5',
                                )}
                              >
                                <Link
                                  href={href}
                                  className="flex-1 px-2 py-1 text-xs"
                                >
                                  {block.label}
                                </Link>
                                {ucs.length > 0 && (
                                  <button
                                    onClick={() =>
                                      setExpandedUCs(
                                        ucExpanded ? null : proc._id,
                                      )
                                    }
                                    className="px-1.5 py-1 shrink-0"
                                    aria-label={
                                      ucExpanded
                                        ? 'Collapse use cases'
                                        : 'Expand use cases'
                                    }
                                  >
                                    {ucExpanded ? (
                                      <ChevronDown size={10} />
                                    ) : (
                                      <ChevronRight size={10} />
                                    )}
                                  </button>
                                )}
                              </div>
                              {ucExpanded && ucs.length > 0 && (
                                <div className="ml-3 pl-2 border-l border-white/10 space-y-0.5 mt-0.5">
                                  {ucs.map((uc) => {
                                    const ucHref = `${procBase}/b5?edit=${uc._id}`;
                                    const ucActive =
                                      pathname?.includes('/b5') &&
                                      pathname?.includes(uc._id);
                                    return (
                                      <Link
                                        key={uc._id}
                                        href={ucHref}
                                        className={clsx(
                                          'flex items-center gap-1.5 px-2 py-1 rounded-sm transition-colors text-[11px]',
                                          ucActive
                                            ? 'text-blue-light bg-white/10 font-medium'
                                            : 'text-slate-500 hover:text-slate-200 hover:bg-white/5',
                                        )}
                                        title={uc.description}
                                      >
                                        <span className="font-mono shrink-0">
                                          {uc.cuId}
                                        </span>
                                        <span className="truncate text-slate-600">
                                          {uc.description}
                                        </span>
                                      </Link>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        }

                        return (
                          <Link
                            key={block.key}
                            href={href}
                            className={clsx(
                              'block px-2 py-1 text-xs rounded-sm transition-colors',
                              active
                                ? 'text-blue-light bg-white/10 font-medium'
                                : 'text-slate-500 hover:text-slate-200 hover:bg-white/5',
                            )}
                          >
                            {block.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {auditNavTop.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}

            {/* Reports — desplegable inline, mismo patrón que Processes */}
            <div>
              <div
                onClick={() => setReportsExpanded(!reportsExpanded)}
                className={clsx(
                  'sidebar-item cursor-pointer',
                  reportsActive ? 'sidebar-item-active' : 'sidebar-item-inactive',
                )}
              >
                <FileText size={16} />
                <span className="flex-1">Reports</span>
                {reportsExpanded ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
              </div>
              {reportsExpanded && (
                <div className="ml-5 pl-2 border-l border-white/10 space-y-0.5 mt-0.5 mb-1">
                  <NavLink
                    item={{
                      href: `/audits/${auditId}/report`,
                      label: 'AI Audit Report',
                    }}
                  />
                  <NavLink
                    item={{
                      label: 'Audit Report',
                      disabled: true,
                    }}
                  />
                  <DownloadNavItem
                    label="POC Report"
                    onRun={async () => {
                      try {
                        await downloadPocReport(auditId, auditName);
                        toast.success('Report downloaded');
                      } catch (err) {
                        console.error('Failed to generate report:', err);
                        toast.error('Failed to generate report');
                        throw err;
                      }
                    }}
                  />
                  {/* Individual POC Report — desplegable inline con lista de POCs */}
                  <div>
                    <div
                      onClick={() => setIndividualExpanded(!individualExpanded)}
                      className={clsx(
                        'sidebar-item w-full',
                        individualExpanded
                          ? 'sidebar-item-active'
                          : 'sidebar-item-inactive',
                      )}
                    >
                      <span className="flex-1">Individual POC Report</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setIndividualExpanded(!individualExpanded);
                        }}
                        className="px-1.5 py-1 shrink-0"
                        aria-label={individualExpanded ? 'Collapse' : 'Expand'}
                      >
                        {individualExpanded ? (
                          <ChevronDown size={11} />
                        ) : (
                          <ChevronRight size={11} />
                        )}
                      </button>
                    </div>
                    {individualExpanded && (
                      <div className="ml-5 pl-2 border-l border-white/10 space-y-0.5 mt-0.5 mb-1">
                        {pocsList.length === 0 ? (
                          <div className="px-2 py-1 text-xs text-slate-600">
                            No POCs
                          </div>
                        ) : (
                          pocsList.map((poc) => (
                            <DownloadNavItem
                              key={poc._id}
                              label={poc.name}
                              compact={true}
                              onRun={async () => {
                                try {
                                  await downloadIndividualPocReport(
                                    auditId,
                                    poc._id,
                                    poc.name,
                                    auditName,
                                  );
                                  toast.success('Report downloaded');
                                } catch (err) {
                                  console.error(
                                    'Failed to generate report:',
                                    err,
                                  );
                                  toast.error('Failed to generate report');
                                  throw err;
                                }
                              }}
                            />
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </nav>

      {/* System section */}
      <div className="px-3 pb-5 border-t border-white/10 pt-3">
        <div className="pb-1 mb-3">
          <span className="px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            System
          </span>
        </div>

        <div className="space-y-0.5">
          {currentUser?.role === 'admin' && (
            <>
              <Link
                href="/admin/users"
                className={clsx(
                  'sidebar-item',
                  isActive('/admin/users')
                    ? 'sidebar-item-active'
                    : 'sidebar-item-inactive',
                )}
              >
                <Users size={16} />
                <span>Users</span>
              </Link>
              <Link
                href="/admin/profiles"
                className={clsx(
                  'sidebar-item',
                  isActive('/admin/profiles')
                    ? 'sidebar-item-active'
                    : 'sidebar-item-inactive',
                )}
              >
                <BadgeEuro size={16} />
                <span>Profiles</span>
              </Link>
              <Link
                href="/admin/catalog"
                className={clsx(
                  'sidebar-item',
                  isActive('/admin/catalog')
                    ? 'sidebar-item-active'
                    : 'sidebar-item-inactive',
                )}
              >
                <Cpu size={16} />
                <span>Catalog</span>
              </Link>
            </>
          )}
          <Link
            href="/settings"
            className={clsx(
              'sidebar-item',
              isActive('/settings')
                ? 'sidebar-item-active'
                : 'sidebar-item-inactive',
            )}
          >
            <Settings size={16} />
            <span>Settings</span>
          </Link>
          <button
            onClick={handleLogout}
            className="sidebar-item sidebar-item-inactive w-full text-left"
          >
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
