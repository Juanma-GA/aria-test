import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Process, UseCase } from '@/lib/models';
import { requireAuditAccess, isAccessGranted } from '@/lib/auditAccess';

function getSovereigntyIndex(b2: any): number | null {
  if (!b2?.axes) return null;
  const vals = (Object.values(b2.axes) as any[])
    .map((a) =>
      a.status === 'green' ? 5 : a.status === 'amber' ? 3 : a.status === 'red' ? 1 : null
    )
    .filter((v) => v !== null) as number[];
  if (!vals.length) return null;
  return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
}

function getCompletion(process: any, ucCount: number) {
  const b1Done = !!(
    process.b1?.formalName?.trim() &&
    (process.b1?.stakeholders?.length ?? 0) > 0
  );
  const b2Done = !!(
    process.b2?.axes &&
    Object.values(process.b2.axes).every((a: any) => a?.findings?.trim())
  );
  const b3Done = (process.b3?.activities?.length ?? 0) >= 3;
  const b5Done = ucCount > 0;

  return { b1: b1Done, b2: b2Done, b3: b3Done, b5: b5Done, b6: false, b7: false };
}

export async function GET(
  req: NextRequest,
  { params }: { params: { auditId: string; procId: string } }
) {
  try {
    await dbConnect();
    const { auditId, procId } = params;
    const access = await requireAuditAccess(req, auditId, 'view');
    if (!isAccessGranted(access)) return access;

    const [process, ucCount] = await Promise.all([
      Process.findOne({ auditId, _id: procId }).lean(),
      UseCase.countDocuments({ processId: procId }),
    ]);

    if (!process) {
      return NextResponse.json({ error: 'Process not found' }, { status: 404 });
    }

    return NextResponse.json({
      ...process,
      sovereigntyIndex: getSovereigntyIndex(process.b2),
      completion: getCompletion(process, ucCount),
      useCaseCount: ucCount,
    });
  } catch (err) {
    console.error("[API]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { auditId: string; procId: string } }
) {
  try {
    await dbConnect();
    const { auditId, procId } = params;
    const access = await requireAuditAccess(req, auditId, 'edit');
    if (!isAccessGranted(access)) return access;

    const body = await req.json();

    const { b1, b2, b3, ...rest } = body;

    // Build a flat $set map so MongoDB writes data directly without Mongoose casting.
    // This avoids issues with the 'id' virtual field name in nested subdocuments.
    const setOps: Record<string, any> = { ...rest };

    if (b1 !== undefined) setOps['b1'] = b1;
    if (b3 !== undefined) setOps['b3'] = b3;

    // B2: merge axes individually so partial updates don't wipe other axes
    if (b2?.axes) {
      for (const [key, val] of Object.entries(b2.axes)) {
        setOps[`b2.axes.${key}`] = val;
      }
    }

    const updated = await Process.findOneAndUpdate(
      { auditId, _id: procId },
      { $set: setOps },
      { new: true, runValidators: false, strict: false, lean: true }
    ) as any;

    if (!updated) {
      return NextResponse.json({ error: 'Process not found' }, { status: 404 });
    }

    const ucCount = await UseCase.countDocuments({ processId: procId });

    return NextResponse.json({
      ...updated,
      sovereigntyIndex: getSovereigntyIndex(updated.b2),
      completion: getCompletion(updated, ucCount),
      useCaseCount: ucCount,
    });
  } catch (err) {
    console.error('PATCH process error:', err);
    console.error("[API]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { auditId: string; procId: string } }
) {
  try {
    await dbConnect();
    const { auditId, procId } = params;
    const access = await requireAuditAccess(req, auditId, 'edit');
    if (!isAccessGranted(access)) return access;

    const process = await Process.findOne({ auditId, _id: procId });
    if (!process) {
      return NextResponse.json({ error: 'Process not found' }, { status: 404 });
    }

    await UseCase.deleteMany({ processId: procId });
    await process.deleteOne();

    return NextResponse.json({ message: 'Process and related use cases deleted' });
  } catch (err) {
    console.error("[API]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
