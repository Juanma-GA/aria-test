import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { UseCase } from '@/lib/models';

export async function GET(req: NextRequest, { params }: { params: Promise<{ ucId: string }> }) {
  try {
    await dbConnect();

    const { ucId } = await params;

    const uc = await UseCase.findById(ucId)
      .populate('processId', 'procId name b1 b3')
      .lean();

    if (!uc) {
      return NextResponse.json({ error: 'Use case not found' }, { status: 404 });
    }

    return NextResponse.json(uc);
  } catch (err) {
    console.error('[UC endpoint]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
