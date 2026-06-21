import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import { POC, UseCase, Audit } from '@/lib/models';
import { computeAnnualCompute } from '@/lib/calculations';
import { visibilityFilter, requireAuditAccess, isAccessGranted } from '@/lib/auditAccess';

/** Matches a 24-char hex MongoDB ObjectId */
export const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

const NESTED_FIELDS = ['design', 'execution', 'evaluation', 'decision'] as const;

/**
 * Build $set from PATCH body:
 * - deep-merge nested fields (design, execution, evaluation, decision)
 * - cast useCaseIds/useCaseId strings to ObjectIds
 * - recompute computeBreakdown.computedAnnualEur server-side
 * - stamp archivedAt when isArchived flips
 */
export function buildPocSet(body: any, existingPoc: any): Record<string, any> {
  const $set: Record<string, any> = {};

  for (const field of NESTED_FIELDS) {
    if (body[field] !== undefined) {
      const existing = existingPoc[field] ?? {};
      $set[field] = { ...existing, ...body[field] };
      delete body[field];
    }
  }

  if (body.useCaseIds && Array.isArray(body.useCaseIds)) {
    body.useCaseIds = body.useCaseIds.map((id: any) =>
      typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id
    );
  }
  if (body.useCaseId && typeof body.useCaseId === 'string') {
    body.useCaseId = new mongoose.Types.ObjectId(body.useCaseId);
  }

  for (const [key, value] of Object.entries(body)) {
    if (key !== '_id') $set[key] = value;
  }

  if ($set.computeBreakdown) {
    const calc = computeAnnualCompute($set.computeBreakdown);
    $set.computeBreakdown = { ...$set.computeBreakdown, computedAnnualEur: calc.totalEur };
  }

  if (typeof $set.isArchived === 'boolean') {
    $set.archivedAt = $set.isArchived ? new Date() : undefined;
  }

  return $set;
}

/**
 * Validate POC composition rule: useCaseIds[0] must not be an instance;
 * all others must be instances of useCaseIds[0].
 * Returns a 400 NextResponse if invalid, null if valid.
 */
export async function validatePocComposition(
  useCaseIds: mongoose.Types.ObjectId[]
): Promise<NextResponse | null> {
  if (!useCaseIds.length) return null;

  const referenceUC = await UseCase.findById(useCaseIds[0])
    .select('cuId isInstance parentUCId')
    .lean() as any;

  if (referenceUC?.isInstance) {
    return NextResponse.json(
      { error: `Cannot use instance UC ${referenceUC?.cuId} as POC reference. Reference UC must be a normal UC.` },
      { status: 400 }
    );
  }

  if (useCaseIds.length > 1) {
    const otherUCs = await UseCase.find({ _id: { $in: useCaseIds.slice(1) } })
      .select('cuId isInstance parentUCId')
      .lean() as any[];

    for (const other of otherUCs) {
      if (!other.isInstance || String(other.parentUCId) !== String(useCaseIds[0])) {
        return NextResponse.json(
          { error: `UC ${other.cuId} is not an instance of reference UC ${referenceUC?.cuId}. All non-reference UCs must be instances of the reference.` },
          { status: 400 }
        );
      }
    }
  }

  return null;
}

/**
 * Handle UC status transitions when useCaseIds changes on a POC.
 * Added IDs → 'in_poc'. Removed IDs → 'eligible' only if no other active POC references them.
 */
export async function syncUCStatusTransitions(
  oldIds: string[],
  newIds: string[],
  excludePocId: mongoose.Types.ObjectId
): Promise<void> {
  const oldSet = new Set(oldIds);
  const newSet = new Set(newIds);

  const addedUCs = newIds.filter(id => !oldSet.has(id));
  const removedUCs = oldIds.filter(id => !newSet.has(id));

  if (addedUCs.length > 0) {
    await UseCase.updateMany(
      { _id: { $in: addedUCs.map(id => new mongoose.Types.ObjectId(id)) } },
      { $set: { status: 'in_poc' } }
    );
  }

  for (const ucId of removedUCs) {
    const ucObjectId = new mongoose.Types.ObjectId(ucId);
    const remainingPocs = await POC.countDocuments({
      $or: [
        { useCaseIds: { $in: [ucObjectId, ucId] } },
        { useCaseId: { $in: [ucObjectId, ucId] } }
      ],
      isArchived: { $ne: true },
      _id: { $ne: excludePocId }
    });
    if (remainingPocs === 0) {
      await UseCase.findByIdAndUpdate(ucObjectId, { $set: { status: 'eligible' } });
    }
  }
}

/**
 * Revert all UCs in a deleted POC to 'eligible' if no other active POCs reference them.
 * Iterates all useCaseIds (the old DELETE only reverted legacy useCaseId).
 */
export async function revertUCsOnPocDelete(poc: any): Promise<void> {
  const ids: any[] = (poc.useCaseIds ?? []).length > 0
    ? poc.useCaseIds
    : poc.useCaseId ? [poc.useCaseId] : [];

  for (const ucId of ids) {
    const remainingPocs = await POC.countDocuments({
      $or: [
        { useCaseIds: { $in: [ucId, String(ucId)] } },
        { useCaseId: { $in: [ucId, String(ucId)] } }
      ],
      isArchived: { $ne: true },
      _id: { $ne: poc._id }
    });
    if (remainingPocs === 0) {
      await UseCase.findByIdAndUpdate(ucId, { $set: { status: 'eligible' } });
    }
  }
}

/**
 * Apply the standard populate chain for a single POC detail view.
 */
export function applyPocPopulate(query: any): any {
  return query
    .populate({
      path: 'useCaseIds',
      select: 'cuId description targetActivities timeSavedPerProfile computeBreakdown estimatedDevCostEur processId isInstance additionalDevCostEur',
      populate: { path: 'processId', select: 'procId name b1.profiles b3.annualRepetitions' },
    })
    .populate('useCaseId', 'cuId description')
    .populate('processId', 'procId name b1.profiles b3.annualRepetitions');
}

/**
 * Returns all UseCase._ids visible to the caller (UCs in audits the user can access).
 *
 * TODO: if this array grows too large at scale, replace with an aggregate $lookup
 * that joins POC→UseCase→Audit in a single pipeline instead of fetching all UC IDs.
 */
export async function getVisibleUCIds(
  req: NextRequest
): Promise<mongoose.Types.ObjectId[] | null> {
  const filter = visibilityFilter(req);
  if (!filter) return null;
  const audits = await Audit.find(filter).select('_id').lean();
  const auditIds = audits.map((a: any) => a._id);
  const ucs = await UseCase.find({ auditId: { $in: auditIds } }).select('_id').lean();
  return ucs.map((u: any) => u._id as mongoose.Types.ObjectId);
}

/**
 * Check edit permission for a POC by deriving the reference audit from the UC.
 * Reference = useCaseIds[0]; fallback = legacy useCaseId.
 * Returns a NextResponse error if denied, null if granted.
 */
export async function requirePocEditAccess(
  req: NextRequest,
  poc: any
): Promise<NextResponse | null> {
  // Resolve reference UC id (may be populated object or raw ObjectId/string)
  const rawRefId =
    (poc.useCaseIds ?? []).length > 0
      ? (poc.useCaseIds[0]?._id ?? poc.useCaseIds[0])
      : poc.useCaseId
        ? (poc.useCaseId?._id ?? poc.useCaseId)
        : null;

  if (!rawRefId) {
    return NextResponse.json(
      { error: 'Forbidden — POC has no reference UC, cannot determine edit permission.' },
      { status: 403 }
    );
  }

  const refUC = await UseCase.findById(rawRefId).select('auditId').lean() as any;
  if (!refUC) {
    return NextResponse.json(
      { error: 'Forbidden — reference UC not found, cannot determine edit permission.' },
      { status: 403 }
    );
  }

  const access = await requireAuditAccess(req, String(refUC.auditId), 'edit');
  if (!isAccessGranted(access)) return access as NextResponse;
  return null;
}

/**
 * Count POCs per audit using the SAME membership rule as GET /api/pocs?auditId=X:
 * a POC belongs to an audit if any of its useCaseIds (or legacy useCaseId) is a UC
 * whose auditId === that audit. Instances are cross-audit, so a POC can count in
 * several audits (once per audit). Archived UCs are included in membership (matching
 * the Tracker, which does not filter UCs by isArchived when building effectiveUCIds).
 *
 * @param pocs   POC docs with fields: phase, useCaseIds[], useCaseId? (non-archived POCs)
 * @param auditIds the audits to compute counts for
 * @returns Map<auditIdString, { design, execution, evaluation, closed }>
 */
export async function countPocsByAuditPhase(
  pocs: any[],
  auditIds: mongoose.Types.ObjectId[],
): Promise<Map<string, { design: number; execution: number; evaluation: number; closed: number }>> {
  // ucId -> auditId for ALL UCs in the target audits (archived included, like the Tracker)
  const ucs = await UseCase.find({ auditId: { $in: auditIds } }).select('_id auditId').lean();
  const ucAuditMap = new Map<string, string>();
  for (const uc of ucs as any[]) {
    ucAuditMap.set(String(uc._id), String(uc.auditId));
  }

  const result = new Map<string, { design: number; execution: number; evaluation: number; closed: number }>();
  for (const poc of pocs) {
    const ucIds: string[] = [
      ...((poc.useCaseIds ?? []).map((id: any) => String(id?._id ?? id))),
      ...(poc.useCaseId ? [String(poc.useCaseId?._id ?? poc.useCaseId)] : []),
    ];
    const auditsForPoc = new Set<string>();
    for (const ucId of ucIds) {
      const aid = ucAuditMap.get(ucId);
      if (aid) auditsForPoc.add(aid);
    }
    const phase = poc.phase as string;
    for (const aid of auditsForPoc) {
      if (!result.has(aid)) result.set(aid, { design: 0, execution: 0, evaluation: 0, closed: 0 });
      const entry = result.get(aid)!;
      if (phase in entry) (entry as any)[phase]++;
    }
  }
  return result;
}
