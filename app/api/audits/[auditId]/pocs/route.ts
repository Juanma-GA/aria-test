import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { POC, UseCase } from '@/lib/models';

export async function GET(
  req: NextRequest,
  { params }: { params: { auditId: string } }
) {
  try {
    await dbConnect();
    const { auditId } = params;

    const { searchParams } = new URL(req.url);
    const processId = searchParams.get('processId');
    const query: Record<string, any> = { auditId };
    if (processId) query.processId = processId;

    const pocs = await POC.find(query)
      .populate('processId', 'procId name')
      .populate('useCaseId', 'cuId description')
      .lean();
    return NextResponse.json(pocs);
  } catch (err) {
    console.error("[API]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { auditId: string } }
) {
  try {
    await dbConnect();
    const { auditId } = params;
    const body = await req.json();

    const { useCaseId, processId, cuId, ...rest } = body;

    if (!useCaseId || !processId || !cuId) {
      return NextResponse.json(
        { error: 'useCaseId, processId, and cuId are required' },
        { status: 400 }
      );
    }

    // Determine sequence number for this use case's POCs
    const existingCount = await POC.countDocuments({ auditId, useCaseId });
    const sequence = String(existingCount + 1).padStart(2, '0');
    const pocId = `POC-${cuId}-${sequence}`;

    const poc = await POC.create({
      auditId,
      useCaseId,
      processId,
      pocId,
      ...rest,
    });

    return NextResponse.json(poc, { status: 201 });
  } catch (err) {
    console.error("[API]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
