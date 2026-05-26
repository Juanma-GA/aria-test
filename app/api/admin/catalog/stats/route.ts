import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { CatalogStats } from '@/lib/models';

export async function GET(req: NextRequest) {
  const role = req.headers.get('x-user-role');
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await dbConnect();
    const sync = await CatalogStats.findOne({ type: 'sync' }).lean();
    const refresh = await CatalogStats.findOne({ type: 'refresh' }).lean();

    return NextResponse.json({ sync, refresh });
  } catch (err) {
    console.error('[API] catalog stats GET', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
