import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import type { AuditTeamRole } from '@/lib/models/Audit';
import { requireAuditAccess, isAccessGranted } from '@/lib/auditAccess';

const VALID_ROLES: AuditTeamRole[] = ['owner', 'editor', 'viewer'];

export async function PATCH(
  req: NextRequest,
  context: {
    params:
      | Promise<{ auditId: string; userId: string }>
      | { auditId: string; userId: string };
  },
) {
  try {
    await dbConnect();
    const params = await Promise.resolve(context.params);
    const access = await requireAuditAccess(req, params.auditId, 'manage');
    if (!isAccessGranted(access)) return access;

    const body = await req.json();
    const { role } = body as { role?: AuditTeamRole };
    if (!role || !VALID_ROLES.includes(role)) {
      return NextResponse.json(
        { error: 'role (owner|editor|viewer) is required' },
        { status: 400 },
      );
    }

    const team = access.audit.team ?? [];
    const idx = team.findIndex((m: any) => String(m.userId) === params.userId);
    if (idx === -1)
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });

    // Prevent demoting the last owner
    if (role !== 'owner' && team[idx].role === 'owner') {
      const ownerCount = team.filter((m: any) => m.role === 'owner').length;
      if (ownerCount <= 1) {
        return NextResponse.json(
          { error: 'Cannot demote the last owner' },
          { status: 422 },
        );
      }
    }

    (team[idx] as any).role = role;
    access.audit.team = team;
    access.audit.markModified('team');
    await access.audit.save();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: {
    params:
      | Promise<{ auditId: string; userId: string }>
      | { auditId: string; userId: string };
  },
) {
  try {
    await dbConnect();
    const params = await Promise.resolve(context.params);
    const access = await requireAuditAccess(req, params.auditId, 'manage');
    if (!isAccessGranted(access)) return access;

    const team = access.audit.team ?? [];
    const target = team.find((m: any) => String(m.userId) === params.userId);
    if (!target)
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });

    // Prevent removing the last owner
    if (target.role === 'owner') {
      const ownerCount = team.filter((m: any) => m.role === 'owner').length;
      if (ownerCount <= 1) {
        return NextResponse.json(
          { error: 'Cannot remove the last owner' },
          { status: 422 },
        );
      }
    }

    access.audit.team = team.filter(
      (m: any) => String(m.userId) !== params.userId,
    );
    await access.audit.save();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
