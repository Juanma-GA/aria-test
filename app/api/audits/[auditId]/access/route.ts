import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { requireAuditAccess, isAccessGranted } from '@/lib/auditAccess';

/**
 * Returns the caller's effective access on this audit so the frontend can render
 * controls correctly without guessing. Always succeeds with 'view' if the caller can see the audit.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ auditId: string }> | { auditId: string } },
) {
  await dbConnect();
  const params = await Promise.resolve(context.params);
  const access = await requireAuditAccess(req, params.auditId, 'view');
  if (!isAccessGranted(access)) return access;

  const role = access.effectiveRole;
  return NextResponse.json({
    effectiveRole: role,
    canView: true,
    canEdit: role === 'admin' || role === 'owner' || role === 'editor',
    canManageTeam: role === 'admin' || role === 'owner',
  });
}
