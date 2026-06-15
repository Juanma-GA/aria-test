import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import { POC } from '@/lib/models';
import { requirePocEditAccess, getVisibleUCIds } from '@/lib/pocHelpers';

const MAX_HTML_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_MOCKUPS = 10;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ auditId: string; pocId: string }> }
) {
  const { pocId } = await params;

  try {
    await dbConnect();
    const body = await req.json();
    const { name, html } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Mockup name is required' }, { status: 400 });
    }
    if (!html || typeof html !== 'string') {
      return NextResponse.json({ error: 'Mockup HTML is required' }, { status: 400 });
    }
    if (html.length > MAX_HTML_SIZE) {
      return NextResponse.json(
        { error: `Mockup HTML exceeds 2MB limit (${(html.length / 1024 / 1024).toFixed(2)}MB)` },
        { status: 400 }
      );
    }

    const poc = await POC.findById(pocId).lean() as any;
    if (!poc) {
      return NextResponse.json({ error: 'POC not found' }, { status: 404 });
    }

    const denied = await requirePocEditAccess(req, poc);
    if (denied) return denied;

    const mockups = poc.mockups || [];
    if (mockups.length >= MAX_MOCKUPS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_MOCKUPS} mockups per POC` },
        { status: 400 }
      );
    }

    // Extract filename from name or generate one
    const filename = `${name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}.html`;

    mockups.push({
      _id: new mongoose.Types.ObjectId(),
      name: name.trim(),
      filename,
      html,
      uploadedAt: new Date(),
    });

    await POC.findByIdAndUpdate(pocId, { mockups }, { new: true });

    return NextResponse.json({ success: true, mockupId: mockups[mockups.length - 1]._id }, { status: 201 });
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ auditId: string; pocId: string }> }
) {
  const { pocId } = await params;

  try {
    await dbConnect();
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
    const mockups = poc.mockups || [];
    return NextResponse.json({
      mockups: mockups.map(m => ({
        _id: m._id,
        name: m.name,
        filename: m.filename,
        uploadedAt: m.uploadedAt,
      })),
    });
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
