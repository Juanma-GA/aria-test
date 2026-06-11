import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { POC, Industrialization } from '@/lib/models';
import { requireAuditAccess, isAccessGranted } from '@/lib/auditAccess';
import {
  applyPocPopulate,
  buildPocSet,
  validatePocComposition,
  syncUCStatusTransitions,
  revertUCsOnPocDelete,
} from '@/lib/pocHelpers';

export async function GET(
  req: NextRequest,
  context: {
    params: Promise<{ auditId: string; pocId: string }> | { auditId: string; pocId: string };
  }
) {
  try {
    await dbConnect();
    const { auditId, pocId } = await Promise.resolve(context.params);
    const access = await requireAuditAccess(req, auditId, 'view');
    if (!isAccessGranted(access)) return access;

    const poc = await applyPocPopulate(
      POC.findOne({ auditId, _id: pocId })
    ).lean();

    if (!poc) return NextResponse.json({ error: 'POC not found' }, { status: 404 });
    return NextResponse.json(poc);
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  context: {
    params: Promise<{ auditId: string; pocId: string }> | { auditId: string; pocId: string };
  }
) {
  try {
    await dbConnect();
    const { auditId, pocId } = await Promise.resolve(context.params);
    const access = await requireAuditAccess(req, auditId, 'edit');
    if (!isAccessGranted(access)) return access;

    const poc = await POC.findOne({ auditId, _id: pocId }).lean() as any;
    if (!poc) return NextResponse.json({ error: 'POC not found' }, { status: 404 });

    const body = await req.json();
    const $set = buildPocSet(body, poc);

    // Validate composition rule BEFORE persisting
    if ($set.useCaseIds !== undefined && Array.isArray($set.useCaseIds) && $set.useCaseIds.length > 0) {
      const err = await validatePocComposition($set.useCaseIds);
      if (err) return err;
    }

    await POC.collection.updateOne({ _id: poc._id }, { $set });

    // UC status transitions if useCaseIds changed
    if ($set.useCaseIds !== undefined) {
      await syncUCStatusTransitions(
        (poc.useCaseIds ?? []).map((id: any) => String(id)),
        ($set.useCaseIds ?? []).map((id: any) => String(id)),
        poc._id
      );
    }

    const updated = await POC.findOne({ auditId, _id: pocId }).lean();
    return NextResponse.json(updated);
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: {
    params: Promise<{ auditId: string; pocId: string }> | { auditId: string; pocId: string };
  }
) {
  try {
    await dbConnect();
    const { auditId, pocId } = await Promise.resolve(context.params);
    const access = await requireAuditAccess(req, auditId, 'edit');
    if (!isAccessGranted(access)) return access;

    const poc = await POC.findOne({ auditId, _id: pocId });
    if (!poc) return NextResponse.json({ error: 'POC not found' }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const cascade = searchParams.get('cascade') === 'true';

    const indCount = await Industrialization.countDocuments({ pocId });
    if (indCount > 0 && !cascade) {
      return NextResponse.json(
        {
          error: 'POC has a dependent industrialization',
          dependents: { industrializations: indCount },
          hint: 'Archive the POC, or pass ?cascade=true to delete the linked industrialization too.',
        },
        { status: 409 }
      );
    }

    if (cascade) await Industrialization.deleteMany({ pocId });

    await poc.deleteOne();
    await revertUCsOnPocDelete(poc.toObject());

    return NextResponse.json({
      message: 'POC deleted successfully',
      cascaded: cascade ? { industrializations: indCount } : undefined,
    });
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
