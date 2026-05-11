'use client';
import Link from 'next/link';
import { usePathname, useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  GitBranch,
  Lightbulb,
  Map,
  FlaskConical,
  Factory,
  Download,
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
  href: string;
  label: string;
  icon: React.ReactNode;
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

export function Sidebar() {
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const currentUser = useAuthStore((s) => s.user);

  const auditId = params?.auditId as string | undefined;
  const procId = params?.procId as string | undefined;

  const [processes, setProcesses] = useState<ProcessStub[]>([]);
  const [expandedProc, setExpandedProc] = useState<string | null>(procId ?? null);
  const [ucsByProc, setUcsByProc] = useState<Record<string, UCStub[]>>({});
  const [expandedUCs, setExpandedUCs] = useState<string | null>(null);

  useEffect(() => {
    if (!auditId) { setProcesses([]); return; }
    fetch(`/api/audits/${auditId}/processes`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: any[]) => setProcesses(data.map((p) => ({ _id: p._id, procId: p.procId, name: p.name }))))
      .catch(() => {});
  }, [auditId]);

  // Auto-expand the active process and its UC list when on b5
  useEffect(() => {
    if (procId) {
      setExpandedProc(procId);
      if (pathname?.includes('/b5')) setExpandedUCs(procId);
    }
  }, [procId, pathname]);

  // Fetch use cases when a process is expanded (re-fetch on b5 navigation to pick up new UCs)
  useEffect(() => {
    if (!auditId || !expandedProc) return;
    fetch(`/api/audits/${auditId}/usecases?processId=${expandedProc}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: any[]) => setUcsByProc(prev => ({
        ...prev,
        [expandedProc]: data.map((u) => ({ _id: u._id, cuId: u.cuId, description: u.description })),
      })))
      .catch(() => {});
  }, [auditId, expandedProc, pathname]);

  const mainNav: NavItem[] = [
    { href: '/dashboard', label: 'Audits', icon: <LayoutDashboard size={16} /> },
    { href: '/usecases', label: 'Use Cases', icon: <Lightbulb size={16} /> },
    { href: '/pocs', label: 'POCs', icon: <FlaskConical size={16} /> },
    { href: '/industrializations', label: 'Industrializations', icon: <Factory size={16} /> },
    { href: '/roadmap', label: 'Roadmap', icon: <Map size={16} /> },
  ];

  const auditNav: NavItem[] = auditId
    ? [
        { href: `/audits/${auditId}/usecases`, label: 'Use Cases', icon: <Lightbulb size={16} /> },
        { href: `/audits/${auditId}/pocs`, label: 'POCs', icon: <FlaskConical size={16} /> },
        { href: `/audits/${auditId}/industrializations`, label: 'Industrializations', icon: <Factory size={16} /> },
        { href: `/audits/${auditId}/roadmap`, label: 'Roadmap', icon: <Map size={16} /> },
        { href: `/audits/${auditId}/report`, label: 'AI Report', icon: <FileText size={16} /> },
        { href: `/audits/${auditId}/export`, label: 'Export', icon: <Download size={16} /> },
      ]
    : [];

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore errors
    }
    clearAuth();
    router.push('/auth/login');
  };

  const isActive = (href: string) => pathname === href || pathname?.startsWith(href + '/');

  const NavLink = ({ item }: { item: NavItem }) => (
    <Link
      href={item.href}
      className={clsx(
        'sidebar-item',
        isActive(item.href) ? 'sidebar-item-active' : 'sidebar-item-inactive'
      )}
    >
      {item.icon}
      <span>{item.label}</span>
    </Link>
  );

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
          <span className="block text-xs text-slate-400 mt-0.5 font-sans">by Atexis</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {/* Global nav */}
        {mainNav.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}

        {/* Current Audit Section */}
        {auditId && (
          <>
            <div className="pt-4 pb-1">
              <span className="px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                Current Audit
              </span>
            </div>

            {/* Audit dashboard + expandable processes */}
            <Link
              href={`/audits/${auditId}`}
              className={clsx(
                'sidebar-item',
                pathname === `/audits/${auditId}` ? 'sidebar-item-active' : 'sidebar-item-inactive'
              )}
            >
              <LayoutDashboard size={16} />
              <span className="flex-1">Dashboard</span>
            </Link>

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
                  <div className={clsx(
                    'flex items-center rounded-sm transition-colors',
                    isThisProc ? 'text-blue-light bg-white/10' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  )}>
                    <Link
                      href={procBase}
                      className="flex-1 px-3 py-1.5 text-xs truncate"
                    >
                      {proc.procId} – {proc.name}
                    </Link>
                    <button
                      onClick={() => setExpandedProc(isExpanded ? null : proc._id)}
                      className="px-2 py-1.5 shrink-0"
                      aria-label={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="ml-5 pl-2 border-l border-white/10 space-y-0.5 mt-0.5 mb-1">
                      {BLOCKS.map((block) => {
                        const href = `${procBase}/${block.key}`;
                        const active = pathname === href || pathname?.startsWith(href);

                        if (block.key === 'b5') {
                          const ucs = ucsByProc[proc._id] ?? [];
                          const ucExpanded = expandedUCs === proc._id;
                          return (
                            <div key="b5">
                              <div className={clsx(
                                'flex items-center rounded-sm transition-colors',
                                active ? 'text-blue-light bg-white/10' : 'text-slate-500 hover:text-slate-200 hover:bg-white/5'
                              )}>
                                <Link
                                  href={href}
                                  className="flex-1 px-2 py-1 text-xs"
                                >
                                  {block.label}
                                </Link>
                                {ucs.length > 0 && (
                                  <button
                                    onClick={() => setExpandedUCs(ucExpanded ? null : proc._id)}
                                    className="px-1.5 py-1 shrink-0"
                                    aria-label={ucExpanded ? 'Collapse use cases' : 'Expand use cases'}
                                  >
                                    {ucExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                                  </button>
                                )}
                              </div>
                              {ucExpanded && ucs.length > 0 && (
                                <div className="ml-3 pl-2 border-l border-white/10 space-y-0.5 mt-0.5">
                                  {ucs.map((uc) => {
                                    const ucHref = `${procBase}/b5?edit=${uc._id}`;
                                    const ucActive = pathname?.includes('/b5') && pathname?.includes(uc._id);
                                    return (
                                      <Link
                                        key={uc._id}
                                        href={ucHref}
                                        className={clsx(
                                          'flex items-center gap-1.5 px-2 py-1 rounded-sm transition-colors text-[11px]',
                                          ucActive
                                            ? 'text-blue-light bg-white/10 font-medium'
                                            : 'text-slate-500 hover:text-slate-200 hover:bg-white/5'
                                        )}
                                        title={uc.description}
                                      >
                                        <span className="font-mono shrink-0">{uc.cuId}</span>
                                        <span className="truncate text-slate-600">{uc.description}</span>
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
                                : 'text-slate-500 hover:text-slate-200 hover:bg-white/5'
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

            {auditNav.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </>
        )}
      </nav>

      {/* Bottom actions */}
      <div className="px-3 pb-5 border-t border-white/10 pt-3 space-y-0.5">
        {currentUser?.role === 'admin' && (
          <>
            <Link
              href="/admin/users"
              className={clsx(
                'sidebar-item',
                isActive('/admin/users') ? 'sidebar-item-active' : 'sidebar-item-inactive'
              )}
            >
              <Users size={16} />
              <span>Users</span>
            </Link>
            <Link
              href="/admin/profiles"
              className={clsx(
                'sidebar-item',
                isActive('/admin/profiles') ? 'sidebar-item-active' : 'sidebar-item-inactive'
              )}
            >
              <BadgeEuro size={16} />
              <span>Profiles</span>
            </Link>
            <Link
              href="/admin/catalog"
              className={clsx(
                'sidebar-item',
                isActive('/admin/catalog') ? 'sidebar-item-active' : 'sidebar-item-inactive'
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
            isActive('/settings') ? 'sidebar-item-active' : 'sidebar-item-inactive'
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
    </aside>
  );
}
