import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import dbConnect from '@/lib/mongodb';
import User from '@/lib/models/User';

// PATCH /api/users/[userId] — update user (admin only)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const role = req.headers.get('x-user-role');
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await dbConnect();
    const body = await req.json();
    const { name, email, userRole, password } = body;

    const update: Record<string, unknown> = {};
    if (name) update.name = name;
    if (email) update.email = email.toLowerCase();
    if (userRole) update.role = userRole;
    if (password) {
      if (password.length < 6) {
        return NextResponse.json(
          { error: 'Password must be at least 6 characters' },
          { status: 400 },
        );
      }
      update.passwordHash = await bcrypt.hash(password, 10);
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 },
      );
    }

    // Check email uniqueness if changing email
    if (email) {
      const { userId } = await params;
      const existing = await User.findOne({
        email: email.toLowerCase(),
        _id: { $ne: userId },
      });
      if (existing) {
        return NextResponse.json(
          { error: 'Email already in use' },
          { status: 409 },
        );
      }
    }

    const { userId } = await params;
    const user = await User.findByIdAndUpdate(userId, update, { new: true })
      .select('-passwordHash')
      .lean();
    if (!user)
      return NextResponse.json({ error: 'User not found' }, { status: 404 });

    return NextResponse.json(user);
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// DELETE /api/users/[userId] — delete user (admin only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const role = req.headers.get('x-user-role');
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const requestingUserId = req.headers.get('x-user-id');
  const { userId } = await params;
  if (requestingUserId === userId) {
    return NextResponse.json(
      { error: 'You cannot delete your own account' },
      { status: 400 },
    );
  }

  try {
    await dbConnect();
    const user = await User.findByIdAndDelete(userId);
    if (!user)
      return NextResponse.json({ error: 'User not found' }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
