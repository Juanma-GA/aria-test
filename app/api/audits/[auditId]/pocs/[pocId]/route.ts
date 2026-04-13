import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { POC, UseCase } from '@/lib/models';

export async function GET(
  req: NextRequest,
  { params }: { params: { auditId: string; pocId: string } }
) {
  try {
    await dbConnect();
    const { auditId, pocId } = params;

    const poc = await POC.findOne({ auditId, _id: pocId }).lean();
    if (!poc) {
      return NextResponse.json({ error: 'POC not found' }, { status: 404 });
    }

    return NextResponse.json(poc);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { auditId: string; pocId: string } }
) {
  try {
    await dbConnect();
    const { auditId, pocId } = params;
    const body = await req.json();

    const poc = await POC.findOne({ auditId, _id: pocId });
    if (!poc) {
      return NextResponse.json({ error: 'POC not found' }, { status: 404 });
    }

    // Deep merge nested objects (design, execution, evaluation, decision)
    const nestedFields = ['design', 'execution', 'evaluation', 'decision'] as const;
    for (const field of nestedFields) {
      if (body[field] !== undefined) {
        const existing = (poc[field] as any)?.toObject?.() ?? poc[field] ?? {};
        (poc as any)[field] = { ...existing, ...body[field] };
        delete body[field];
      }
    }

    // Apply remaining scalar fields
    Object.assign(poc, body);

    await poc.save();

    // If decision is set to 'no_go_discard', block the linked use case
    const decision = (poc.decision as any)?.decision;
    if (decision === 'no_go_discard' && poc.useCaseId) {
      await UseCase.findByIdAndUpdate(poc.useCaseId, {
        status: 'blocked',
        blockedReason: 'POC decision: no_go_discard',
      });
    }

    return NextResponse.json(poc.toObject());
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { auditId: string; pocId: string } }
) {
  try {
    await dbConnect();
    const { auditId, pocId } = params;

    const poc = await POC.findOne({ auditId, _id: pocId });
    if (!poc) {
      return NextResponse.json({ error: 'POC not found' }, { status: 404 });
    }

    await poc.deleteOne();
    return NextResponse.json({ message: 'POC deleted successfully' });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
