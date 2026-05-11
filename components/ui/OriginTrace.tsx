'use client';

import Link from 'next/link';
import { ChevronRight, Building2, Lightbulb, GitBranch, FlaskConical, Factory } from 'lucide-react';

export interface OriginNode {
  kind: 'audit' | 'usecase' | 'process' | 'poc' | 'industrialization';
  code: string;
  label?: string;
  href?: string;
}

const ICONS: Record<OriginNode['kind'], React.ComponentType<{ size?: number; className?: string }>> = {
  audit: Building2,
  usecase: Lightbulb,
  process: GitBranch,
  poc: FlaskConical,
  industrialization: Factory,
};

const CODE_COLORS: Record<OriginNode['kind'], string> = {
  audit: 'text-blue-aria',
  usecase: 'text-purple-aria',
  process: 'text-text',
  poc: 'text-teal-poc',
  industrialization: 'text-indu',
};

export function OriginTrace({ nodes }: { nodes: OriginNode[] }) {
  if (!nodes.length) return null;
  return (
    <nav
      aria-label="Origin trace"
      className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[11px] bg-smoke border border-border rounded-sm px-3 py-2"
    >
      {nodes.map((n, i) => {
        const Icon = ICONS[n.kind];
        const inner = (
          <span className="inline-flex items-center gap-1.5">
            <Icon size={12} className="text-muted" />
            <span className={`font-mono font-semibold ${CODE_COLORS[n.kind]}`}>{n.code}</span>
            {n.label && <span className="text-muted truncate max-w-[200px]" title={n.label}>· {n.label}</span>}
          </span>
        );
        return (
          <span key={`${n.kind}-${i}`} className="inline-flex items-center gap-1">
            {n.href ? (
              <Link href={n.href} className="hover:underline">{inner}</Link>
            ) : inner}
            {i < nodes.length - 1 && <ChevronRight size={12} className="text-muted" />}
          </span>
        );
      })}
    </nav>
  );
}
