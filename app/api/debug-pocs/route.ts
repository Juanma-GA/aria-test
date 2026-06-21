import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { POC, UseCase, Audit } from '@/lib/models';
import { countPocsByAuditPhase } from '@/lib/pocHelpers';

export async function GET() {
  await dbConnect();
  const audits = await Audit.find({ isArchived: { $ne: true } }).select('_id name').lean();
  const auditIds = audits.map((a: any) => a._id);
  const auditName = new Map(audits.map((a: any) => [String(a._id), a.name]));

  const allPocs = await POC.find({ isArchived: { $ne: true } })
    .select('auditId phase useCaseIds useCaseId isArchived').lean();

  // Run the actual helper
  const result = await countPocsByAuditPhase(allPocs as any[], auditIds);
  const helperCounts: any = {};
  for (const [aid, phases] of result.entries()) {
    const total = Object.values(phases).reduce((s: number, n: any) => s + n, 0);
    helperCounts[auditName.get(aid) ?? aid] = { total, phases };
  }

  // Show what UCs the helper's map actually contains
  const ucs = await UseCase.find({ auditId: { $in: auditIds } }).select('_id auditId').lean();
  const mapSize = ucs.length;

  // Per-POC trace: which audits each non-archived POC resolves to
  const trace = (allPocs as any[]).map((p) => {
    const ucIds = [
      ...((p.useCaseIds ?? []).map((id: any) => String(id?._id ?? id))),
      ...(p.useCaseId ? [String(p.useCaseId?._id ?? p.useCaseId)] : []),
    ];
    const ucMap = new Map(ucs.map((u: any) => [String(u._id), String(u.auditId)]));
    const resolved = ucIds.map(id => ({ ucId: id, audit: ucMap.get(id) ? auditName.get(ucMap.get(id)!) : 'NOT_IN_MAP' }));
    return { pocId: p.pocId, phase: p.phase, resolved };
  });

  return NextResponse.json({
    auditIds_count: auditIds.length,
    ucMapSize: mapSize,
    helperCounts,
    trace,
  }, { status: 200 });
}
