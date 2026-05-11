import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Profile } from '@/lib/models';

/**
 * GET /api/admin/profiles
 * - Any authenticated user can read the catalog (it's a dropdown source).
 * - Filter `?activeOnly=true` to skip archived entries.
 */
export async function GET(req: NextRequest) {
  const role = req.headers.get('x-user-role');
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get('activeOnly') === 'true';
    const query: Record<string, unknown> = {};
    if (activeOnly) query.isActive = true;
    const profiles = await Profile.find(query).sort({ isActive: -1, name: 1 }).lean();
    return NextResponse.json(profiles);
  } catch (err) {
    console.error('[API] profiles GET', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/admin/profiles  — admin only
 * Body: { name, role, hourlyRateEur, isActive?, notes? }
 */
export async function POST(req: NextRequest) {
  const role = req.headers.get('x-user-role');
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    await dbConnect();
    const body = await req.json();
    const { name, role: profileRole, hourlyRateEur, isActive, notes } = body;

    if (!name?.trim() || !profileRole?.trim()) {
      return NextResponse.json({ error: 'name and role are required' }, { status: 400 });
    }
    const rate = Number(hourlyRateEur);
    if (!Number.isFinite(rate) || rate < 0) {
      return NextResponse.json({ error: 'hourlyRateEur must be a non-negative number' }, { status: 400 });
    }

    const existing = await Profile.findOne({ name: name.trim() });
    if (existing) {
      return NextResponse.json({ error: 'A profile with that name already exists' }, { status: 409 });
    }

    const created = await Profile.create({
      name: name.trim(),
      role: profileRole.trim(),
      hourlyRateEur: rate,
      isActive: isActive !== false,
      notes: notes?.trim() ?? '',
    });
    return NextResponse.json(created.toObject(), { status: 201 });
  } catch (err) {
    console.error('[API] profiles POST', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
