import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import { POC } from '@/lib/models';
import { requirePocEditAccess, getVisibleUCIds } from '@/lib/pocHelpers';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ auditId: string; pocId: string; mockupId: string }> }
) {
  const { pocId, mockupId } = await params;

  try {
    await dbConnect();

    if (!mongoose.Types.ObjectId.isValid(mockupId)) {
      return NextResponse.json({ error: 'Invalid mockup ID' }, { status: 400 });
    }

    const poc = await POC.findById(pocId).lean() as any;
    if (!poc) {
      return NextResponse.json({ error: 'POC not found' }, { status: 404 });
    }

    const denied = await requirePocEditAccess(req, poc);
    if (denied) return denied;

    const mockups = poc.mockups || [];
    const initialLength = mockups.length;
    poc.mockups = mockups.filter((m: any) => m._id?.toString() !== mockupId);

    if (poc.mockups.length === initialLength) {
      return NextResponse.json({ error: 'Mockup not found' }, { status: 404 });
    }

    await poc.save();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ auditId: string; pocId: string; mockupId: string }> }
) {
  const { pocId, mockupId } = await params;

  try {
    await dbConnect();

    if (!mongoose.Types.ObjectId.isValid(mockupId)) {
      return NextResponse.json({ error: 'Invalid mockup ID' }, { status: 400 });
    }

    const visibleUCIds = await getVisibleUCIds(req);
    if (!visibleUCIds) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const poc = await POC.findOne({
      _id: pocId,
      $or: [
        { useCaseIds: { $in: visibleUCIds } },
        { useCaseId: { $in: visibleUCIds } },
      ],
    }).select('mockups');

    if (!poc) {
      return NextResponse.json({ error: 'POC not found' }, { status: 404 });
    }

    const mockup = (poc.mockups || []).find((m: any) => m._id?.toString() === mockupId);
    if (!mockup) {
      return NextResponse.json({ error: 'Mockup not found' }, { status: 404 });
    }

    return NextResponse.json(mockup);
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
