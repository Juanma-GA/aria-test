import { NextRequest, NextResponse } from 'next/server';
import { Audit } from '@/lib/models';
import type { AuditTeamRole, IAudit } from '@/lib/models/Audit';
import type { Role } from '@/lib/auth';

export type AccessLevel = 'view' | 'edit' | 'manage';

export interface AccessGrant {
  user: { id: string; role: Role };
  audit: IAudit;
  /** Effective audit-level role: 'admin' for global admin, 'viewer' for global viewer (read-only),
   * or the user's per-audit team role. Used to enforce edit/manage gates. */
  effectiveRole: 'admin' | AuditTeamRole;
}

export type AccessResult = AccessGrant | NextResponse;

export function isAccessGranted(r: AccessResult): r is AccessGrant {
  return !(r instanceof NextResponse);
}

function getCaller(req: NextRequest): { id: string; role: Role } | null {
  const id = req.headers.get('x-user-id');
  const role = req.headers.get('x-user-role') as Role | null;
  if (!id || !role) return null;
  return { id, role };
}

function teamRoleOf(audit: IAudit, userId: string): AuditTeamRole | null {
  const member = (audit.team ?? []).find((m: any) => String(m.userId) === userId);
  return member?.role ?? null;
}

/**
 * Resolves whether the caller can perform `level` on the given audit.
 *
 * Visibility rules:
 *   admin           → all audits, all levels
 *   global viewer   → all audits, view-only
 *   consultant      → only audits where they are in team[]; level depends on their team role
 *
 * Per-audit roles:
 *   owner   → view + edit + manage(team)
 *   editor  → view + edit
 *   viewer  → view only
 */
export async function requireAuditAccess(
  req: NextRequest,
  auditId: string,
  level: AccessLevel,
): Promise<AccessResult> {
  // TEMPORARY DEBUG LOGGING
  const headerUserId = req.headers.get('x-user-id');
  const headerUserRole = req.headers.get('x-user-role');
  const caller = getCaller(req);
  console.log('[AUDIT-ACCESS-DEBUG]', {
    auditId,
    level,
    'x-user-id header': headerUserId,
    'x-user-role header': headerUserRole,
    caller,
  });

  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const audit = await Audit.findById(auditId);
  if (!audit) return NextResponse.json({ error: 'Audit not found' }, { status: 404 });

  // Global admin: full access
  if (caller.role === 'admin') {
    console.log('[AUDIT-ACCESS-DEBUG] Admin access granted');
    return { user: caller, audit, effectiveRole: 'admin' };
  }

  // Global viewer: read-only on every audit
  if (caller.role === 'viewer') {
    if (level === 'view') return { user: caller, audit, effectiveRole: 'viewer' };
    return NextResponse.json({ error: 'Forbidden — viewer is read-only' }, { status: 403 });
  }

  // Consultant (or any other role): must be in team[]
  const teamRole = teamRoleOf(audit, caller.id);
  if (!teamRole) {
    return NextResponse.json({ error: 'Forbidden — not a team member of this audit' }, { status: 403 });
  }

  if (level === 'view') return { user: caller, audit, effectiveRole: teamRole };
  if (level === 'edit') {
    if (teamRole === 'owner' || teamRole === 'editor') return { user: caller, audit, effectiveRole: teamRole };
    return NextResponse.json({ error: 'Forbidden — read-only role' }, { status: 403 });
  }
  if (level === 'manage') {
    if (teamRole === 'owner') return { user: caller, audit, effectiveRole: teamRole };
    return NextResponse.json({ error: 'Forbidden — owner role required' }, { status: 403 });
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

/**
 * Builds a Mongo query fragment that limits Audit lookups to those the caller can see.
 * For admin/global-viewer, returns {} (no filter). For consultants, returns a filter on team membership.
 */
export function visibilityFilter(req: NextRequest): Record<string, any> | null {
  const caller = getCaller(req);
  if (!caller) return null;
  if (caller.role === 'admin' || caller.role === 'viewer') return {};
  return { 'team.userId': caller.id };
}

/** True if the caller is global admin or global viewer. */
export function isGlobalReader(req: NextRequest): boolean {
  const role = req.headers.get('x-user-role');
  return role === 'admin' || role === 'viewer';
}

export function getCallerOrThrow(req: NextRequest) {
  const caller = getCaller(req);
  if (!caller) throw new Error('Unauthorized — missing user headers');
  return caller;
}
