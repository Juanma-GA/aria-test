import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Roadmap } from '@/lib/models';
import { requireAuditAccess, isAccessGranted } from '@/lib/auditAccess';

export async function GET(
  req: NextRequest,
  { params }: { params: { auditId: string } }
) {
  try {
    await dbConnect();
    const { auditId } = params;
    const access = await requireAuditAccess(req, auditId, 'view');
    if (!isAccessGranted(access)) return access;

    const roadmap = await Roadmap.findOne({ auditId }).lean();

    if (!roadmap) {
      // Return empty structure if no roadmap exists yet
      return NextResponse.json({
        auditId,
        horizons: {
          h1_quickWins: [],
          h2_midTerm: [],
          h3_strategic: [],
        },
        nextSteps: [],
      });
    }

    return NextResponse.json(roadmap);
  } catch (err) {
    console.error("[API]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { auditId: string } }
) {
  try {
    await dbConnect();
    const { auditId } = params;
    const access = await requireAuditAccess(req, auditId, 'edit');
    if (!isAccessGranted(access)) return access;

    const body = await req.json();

    const roadmap = await Roadmap.findOneAndUpdate(
      { auditId },
      { auditId, ...body },
      { new: true, upsert: true, runValidators: true }
    );

    return NextResponse.json(roadmap);
  } catch (err) {
    console.error("[API]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
