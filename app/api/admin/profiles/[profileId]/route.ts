import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Profile } from '@/lib/models';

const EDITABLE = ['name', 'role', 'hourlyRateEur', 'isActive', 'notes'] as const;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ profileId: string }> }
) {
  const role = req.headers.get('x-user-role');
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { profileId } = await params;
  if (!mongoose.isValidObjectId(profileId)) {
    return NextResponse.json({ error: 'Invalid profile id' }, { status: 400 });
  }
  try {
    await dbConnect();
    const profile = await Profile.findById(profileId).lean();
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    return NextResponse.json(profile);
  } catch (err) {
    console.error('[API] profile GET', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ profileId: string }> }
) {
  const role = req.headers.get('x-user-role');
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { profileId } = await params;
  if (!mongoose.isValidObjectId(profileId)) {
    return NextResponse.json({ error: 'Invalid profile id' }, { status: 400 });
  }

  try {
    await dbConnect();
    const body = await req.json();

    const update: Record<string, unknown> = {};
    for (const key of EDITABLE) {
      if (key in body) update[key] = body[key];
    }

    if ('hourlyRateEur' in update) {
      const r = Number(update.hourlyRateEur);
      if (!Number.isFinite(r) || r < 0) {
        return NextResponse.json({ error: 'hourlyRateEur must be a non-negative number' }, { status: 400 });
      }
      update.hourlyRateEur = r;
    }
    if ('name' in update && typeof update.name === 'string') update.name = update.name.trim();
    if ('role' in update && typeof update.role === 'string') update.role = update.role.trim();

    // Guard against name collisions on rename.
    if (typeof update.name === 'string' && update.name) {
      const clash = await Profile.findOne({ name: update.name, _id: { $ne: profileId } });
      if (clash) return NextResponse.json({ error: 'A profile with that name already exists' }, { status: 409 });
    }

    const updated = await Profile.findByIdAndUpdate(profileId, update, { new: true }).lean();
    if (!updated) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    console.error('[API] profile PATCH', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ profileId: string }> }
) {
  const role = req.headers.get('x-user-role');
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { profileId } = await params;
  if (!mongoose.isValidObjectId(profileId)) {
    return NextResponse.json({ error: 'Invalid profile id' }, { status: 400 });
  }

  try {
    await dbConnect();
    const profile = await Profile.findById(profileId);
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    await profile.deleteOne();
    return NextResponse.json({ message: 'Profile deleted' });
  } catch (err) {
    console.error('[API] profile DELETE', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
