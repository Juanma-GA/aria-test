import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { POC, UseCase, Audit } from '@/lib/models';

export async function GET() {
  await dbConnect();
  const audits = await Audit.find({}).select('_id name isArchived').lean();
  const auditById = new Map(audits.map((a: any) => [String(a._id), a.name]));

  const pocs = await POC.find({}).select('pocId name auditId phase isArchived useCaseIds useCaseId').lean();

  const allUcIds = new Set<string>();
  for (const p of pocs as any[]) {
    for (const id of (p.useCaseIds ?? [])) allUcIds.add(String(id));
    if (p.useCaseId) allUcIds.add(String(p.useCaseId));
  }
  const ucs = await UseCase.find({ _id: { $in: [...allUcIds] } })
    .select('_id cuId auditId isInstance parentUCId isArchived').lean();
  const ucById = new Map(ucs.map((u: any) => [String(u._id), u]));

  const out = (pocs as any[]).map((p) => ({
    pocId: p.pocId,
    name: p.name ?? null,
    phase: p.phase,
    pocArchived: p.isArchived ?? false,
    pocAuditId: String(p.auditId),
    pocAuditName: auditById.get(String(p.auditId)) ?? 'UNKNOWN',
    ucs: [
      ...(p.useCaseIds ?? []).map((id: any) => String(id)),
      ...(p.useCaseId ? [String(p.useCaseId)] : []),
    ].map((id: string, i: number) => {
      const u = ucById.get(id);
      return {
        idx: i,
        ucId: id,
        cuId: u?.cuId ?? 'NOT_FOUND',
        ucAuditId: u ? String(u.auditId) : 'NOT_FOUND',
        ucAuditName: u ? (auditById.get(String(u.auditId)) ?? 'UNKNOWN_AUDIT') : 'NOT_FOUND',
        isInstance: u?.isInstance ?? null,
        ucArchived: u?.isArchived ?? null,
      };
    }),
  }));

  return NextResponse.json({
    audits: audits.map((a: any) => ({ id: String(a._id), name: a.name, archived: a.isArchived ?? false })),
    totalPocs: pocs.length,
    pocs: out,
  }, { status: 200 });
}
