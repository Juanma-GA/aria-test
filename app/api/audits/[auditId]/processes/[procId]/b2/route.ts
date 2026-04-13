import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Process } from '@/lib/models';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { auditId: string; procId: string } }
) {
  try {
    await dbConnect();
    const { auditId, procId } = params;
    const body = await req.json();

    const process = await Process.findOne({ auditId, _id: procId });
    if (!process) {
      return NextResponse.json({ error: 'Process not found' }, { status: 404 });
    }

    // Merge incoming axes into existing b2
    const existingAxes = (process.b2 as any)?.axes ?? {};
    const incomingAxes = body.axes ?? {};

    const mergedAxes: Record<string, any> = { ...existingAxes };
    for (const [key, value] of Object.entries(incomingAxes)) {
      mergedAxes[key] = { ...(existingAxes[key] ?? {}), ...(value as object) };
    }

    process.b2 = { axes: mergedAxes } as any;
    await process.save();

    return NextResponse.json({ process: process.toObject() });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
