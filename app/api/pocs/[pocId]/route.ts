import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { POC, Industrialization } from '@/lib/models';
import {
  OBJECT_ID_RE,
  applyPocPopulate,
  buildPocSet,
  validatePocComposition,
  syncUCStatusTransitions,
  revertUCsOnPocDelete,
  requirePocEditAccess,
  getVisibleUCIds,
} from '@/lib/pocHelpers';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ pocId: string }> | { pocId: string } }
) {
  try {
    await dbConnect();
    const { pocId } = await Promise.resolve(context.params);

    if (!OBJECT_ID_RE.test(pocId)) {
      return NextResponse.json({ error: 'Invalid POC id' }, { status: 400 });
    }

    const visibleUCIds = await getVisibleUCIds(req);
    if (!visibleUCIds) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Find POC only if it contains at least one UC visible to the caller
    const poc = await applyPocPopulate(
      POC.findOne({
        _id: pocId,
        $or: [
          { useCaseIds: { $in: visibleUCIds } },
          { useCaseId: { $in: visibleUCIds } },
        ],
      })
    ).lean();

    if (!poc) return NextResponse.json({ error: 'POC not found' }, { status: 404 });
    return NextResponse.json(poc);
  } catch (err) {
    console.error('[API /pocs/[pocId] GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ pocId: string }> | { pocId: string } }
) {
  try {
    await dbConnect();
    const { pocId } = await Promise.resolve(context.params);

    if (!OBJECT_ID_RE.test(pocId)) {
      return NextResponse.json({ error: 'Invalid POC id' }, { status: 400 });
    }

    const poc = await POC.findById(pocId).lean() as any;
    if (!poc) return NextResponse.json({ error: 'POC not found' }, { status: 404 });

    const denied = await requirePocEditAccess(req, poc);
    if (denied) return denied;

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

    const updated = await POC.findById(pocId).lean();
    return NextResponse.json(updated);
  } catch (err) {
    console.error('[API /pocs/[pocId] PATCH]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ pocId: string }> | { pocId: string } }
) {
  try {
    await dbConnect();
    const { pocId } = await Promise.resolve(context.params);

    if (!OBJECT_ID_RE.test(pocId)) {
      return NextResponse.json({ error: 'Invalid POC id' }, { status: 400 });
    }

    const poc = await POC.findById(pocId);
    if (!poc) return NextResponse.json({ error: 'POC not found' }, { status: 404 });

    const denied = await requirePocEditAccess(req, poc.toObject());
    if (denied) return denied;

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
    console.error('[API /pocs/[pocId] DELETE]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
