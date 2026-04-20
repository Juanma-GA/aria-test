'use client';
import Link from 'next/link';
import { clsx } from 'clsx';

interface BlockCompletion {
  b1: boolean;
  b2: boolean;
  b3: boolean;
  b5: boolean;
  b6: boolean;
  b7: boolean;
}

interface BlockProgressBarProps {
  completion: BlockCompletion;
  className?: string;
  showLabels?: boolean;
  /** When provided, each block becomes a clickable link */
  auditId?: string;
  procId?: string;
}

interface BlockConfig {
  key: keyof BlockCompletion;
  label: string;
  displayLabel: string;
  activeClass: string;
  href: string;
}

function buildBlocks(auditId?: string, procId?: string): BlockConfig[] {
  const base = auditId && procId ? `/audits/${auditId}/processes/${procId}` : '';
  return [
    { key: 'b1', label: 'B1', displayLabel: 'B1', activeClass: 'bg-slate-500', href: `${base}/b1` },
    { key: 'b2', label: 'B2', displayLabel: 'B2', activeClass: 'bg-red-sov', href: `${base}/b2` },
    { key: 'b3', label: 'B3', displayLabel: 'B3', activeClass: 'bg-purple-aria', href: `${base}/b3` },
    { key: 'b5', label: 'B4', displayLabel: 'B4', activeClass: 'bg-blue-aria', href: `${base}/b5` },
  ];
}

export function BlockProgressBar({
  completion,
  className,
  showLabels = true,
  auditId,
  procId,
}: BlockProgressBarProps) {
  const BLOCKS = buildBlocks(auditId, procId);
  const completed = BLOCKS.filter(b => completion[b.key]).length;
  const total = BLOCKS.length;
  const canLink = !!(auditId && procId);

  return (
    <div className={clsx('w-full', className)}>
      <div className="flex gap-0.5">
        {BLOCKS.map(({ key, displayLabel, activeClass, href }) => {
          const bar = (
            <div
              className={clsx(
                'w-full rounded-sm transition-colors',
                showLabels ? 'h-2' : 'h-3',
                completion[key] ? activeClass : 'bg-slate-200'
              )}
              title={`${displayLabel}: ${completion[key] ? 'Complete' : 'Incomplete'}`}
            />
          );
          return (
            <div key={key} className="flex-1 flex flex-col items-center gap-0.5">
              {canLink ? (
                <Link href={href} className="w-full block hover:opacity-80 transition-opacity">
                  {bar}
                </Link>
              ) : bar}
              {showLabels && (
                <span className="text-[9px] font-mono text-muted leading-none">{displayLabel}</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1 text-[10px] text-muted text-right">
        {completed}/{total} blocks
      </div>
    </div>
  );
}
