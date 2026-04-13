'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Download, FileSpreadsheet, Lightbulb, FlaskConical, GitBranch, RefreshCw, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function ExportPage() {
  const { auditId } = useParams<{ auditId: string }>();
  const [migrating, setMigrating] = useState(false);
  const [migrated, setMigrated] = useState(false);

  const exports = [
    {
      icon: <Lightbulb size={20} className="text-blue-aria" />,
      title: 'Use Cases',
      description: 'All use cases with scores, savings estimates, and ROI data',
      href: `/api/audits/${auditId}/export/usecases`,
    },
    {
      icon: <FlaskConical size={20} className="text-blue-aria" />,
      title: 'POCs',
      description: 'All POCs with phase, decision, milestones, and evaluation results',
      href: `/api/audits/${auditId}/export/pocs`,
    },
    {
      icon: <GitBranch size={20} className="text-blue-aria" />,
      title: 'Process Map',
      description: 'All process activities with time estimates, tools, and profiles',
      href: `/api/audits/${auditId}/export/processes`,
    },
  ];

  const runMigration = async () => {
    setMigrating(true);
    try {
      const res = await fetch('/api/migrate', { method: 'POST' });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'Migration failed');
      const { updated } = data;
      setMigrated(true);
      toast.success('IDs migrated successfully', {
        description: `Audits: ${updated.audits} · Processes: ${updated.processes} · Use Cases: ${updated.useCases} · POCs: ${updated.pocs}`,
      });
    } catch (e: any) {
      toast.error('Migration failed', { description: e.message });
    } finally {
      setMigrating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-text flex items-center gap-2">
          <FileSpreadsheet size={22} className="text-blue-aria" />
          Export
        </h1>
        <p className="text-sm text-muted mt-0.5">Download audit data as CSV files (open directly in Excel)</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {exports.map((exp) => (
          <div key={exp.title} className="bg-white border border-border rounded-sm p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              {exp.icon}
              <h2 className="font-display font-semibold text-text">{exp.title}</h2>
            </div>
            <p className="text-sm text-muted flex-1">{exp.description}</p>
            <a
              href={exp.href}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-aria text-white text-sm font-medium rounded-sm hover:bg-blue-700 transition-colors"
            >
              <Download size={14} />
              Download CSV
            </a>
          </div>
        ))}
      </div>

      {/* ID Migration */}
      <div className="bg-white border border-border rounded-sm p-6">
        <h2 className="font-display font-semibold text-text mb-1">Compound ID Migration</h2>
        <p className="text-sm text-muted mb-4">
          Reassigns all existing records to use hierarchical compound codes:
          <span className="ml-1 font-mono text-xs text-blue-aria">AUD-001 → AUD-001-P01 → AUD-001-P01-C01 → POC-AUD-001-P01-C01-01</span>
        </p>
        <button
          onClick={runMigration}
          disabled={migrating || migrated}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white text-sm font-medium rounded-sm hover:bg-slate-900 disabled:opacity-50 transition-colors"
        >
          {migrated
            ? <><CheckCircle size={15} /> Migration complete</>
            : migrating
            ? <><RefreshCw size={15} className="animate-spin" /> Running…</>
            : <><RefreshCw size={15} /> Run Migration</>
          }
        </button>
      </div>
    </div>
  );
}
