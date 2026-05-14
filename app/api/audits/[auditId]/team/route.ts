import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Audit } from '@/lib/models';
import User from '@/lib/models/User';
import type { AuditTeamRole } from '@/lib/models/Audit';
import { requireAuditAccess, isAccessGranted } from '@/lib/auditAccess';

const VALID_ROLES: AuditTeamRole[] = ['owner', 'editor', 'viewer'];

export async function GET(
  req: NextRequest,
  { params }: { params: { auditId: string } }
) {
  try {
    await dbConnect();
    const access = await requireAuditAccess(req, params.auditId, 'view');
    if (!isAccessGranted(access)) return access;

    const team = (access.audit.team ?? []) as any[];
    const userIds = team.map(m => m.userId);
    const users = await User.find({ _id: { $in: userIds } }).select('_id name email role').lean();
    const userMap = Object.fromEntries(users.map(u => [String(u._id), u]));

    const enriched = team.map(m => ({
      userId: String(m.userId),
      role: m.role,
      addedAt: m.addedAt,
      addedBy: m.addedBy ? String(m.addedBy) : null,
      user: userMap[String(m.userId)] ?? null,
    }));

    return NextResponse.json({ team: enriched });
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { auditId: string } }
) {
  try {
    await dbConnect();
    const access = await requireAuditAccess(req, params.auditId, 'manage');
    if (!isAccessGranted(access)) return access;

    const body = await req.json();
    const { userId, role } = body as { userId?: string; role?: AuditTeamRole };
    if (!userId || !role || !VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: 'userId and role (owner|editor|viewer) are required' }, { status: 400 });
    }

    const user = await User.findById(userId).lean();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const existing = (access.audit.team ?? []).find((m: any) => String(m.userId) === userId);
    if (existing) {
      return NextResponse.json({ error: 'User is already a team member' }, { status: 409 });
    }

    access.audit.team = [
      ...(access.audit.team ?? []),
      { userId, role, addedAt: new Date(), addedBy: access.user.id },
    ] as any;
    await access.audit.save();

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
