import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Industrialization, User } from '@/lib/models';
import { requireAuditAccess, isAccessGranted } from '@/lib/auditAccess';
import { computeAnnualCompute } from '@/lib/calculations';

const NESTED_FIELDS = [
  'plan',
  'cost',
  'roi',
  'production',
  'changeManagement',
] as const;
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

export async function GET(
  req: NextRequest,
  context: {
    params:
      | Promise<{ auditId: string; indId: string }>
      | { auditId: string; indId: string };
  },
) {
  try {
    await dbConnect();
    const params = await Promise.resolve(context.params);
    const { auditId, indId } = params;
    const access = await requireAuditAccess(req, auditId, 'view');
    if (!isAccessGranted(access)) return access;

    const ind = (await Industrialization.findOne({ auditId, _id: indId })
      // Include B1 profiles + B3 annualRepetitions so the ROI tab can derive
      // baseline annual hours, weighted hourly cost, and a rationale.
      .populate('processId', 'procId name b1 b3')
      // Include the UC's per-profile time saving, dev cost and POC link so the
      // ROI tab can pre-fill expected impact and the cost tab can pre-fill compute.
      .populate(
        'useCaseId',
        'cuId description timeSavedPerProfile targetActivities estimatedDevCostEur computeBreakdown aiTypes',
      )
      .populate(
        'pocId',
        'pocId name phase decision computeBreakdown evaluation design',
      )
      .lean()) as any;
    if (!ind) {
      return NextResponse.json(
        { error: 'Industrialization not found' },
        { status: 404 },
      );
    }

    // One-shot repair: legacy data may have a raw ObjectId in plan.ownerTechnical
    // (auto-copied from POC.design.responsibleUserId). Resolve it to the user's name.
    const owner = ind.plan?.ownerTechnical;
    if (
      typeof owner === 'string' &&
      OBJECT_ID_RE.test(owner) &&
      mongoose.isValidObjectId(owner)
    ) {
      const user = (await User.findById(owner)
        .select('name email')
        .lean()) as any;
      const resolved = user?.name || user?.email || '';
      ind.plan = { ...(ind.plan ?? {}), ownerTechnical: resolved };
      await Industrialization.updateOne(
        { _id: indId },
        { $set: { 'plan.ownerTechnical': resolved } },
      );
    }

    return NextResponse.json(ind);
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: {
    params:
      | Promise<{ auditId: string; indId: string }>
      | { auditId: string; indId: string };
  },
) {
  try {
    await dbConnect();
    const params = await Promise.resolve(context.params);
    const { auditId, indId } = params;
    const access = await requireAuditAccess(req, auditId, 'edit');
    if (!isAccessGranted(access)) return access;

    const body = await req.json();

    const ind = await Industrialization.findOne({ auditId, _id: indId });
    if (!ind) {
      return NextResponse.json(
        { error: 'Industrialization not found' },
        { status: 404 },
      );
    }

    if (body.status === 'go_for_run') {
      const assessment = (ind.cost as any)?.recurringAnnual?.maintenance
        ?.assessment;
      const incoming = body.cost?.recurringAnnual?.maintenance?.assessment;
      const completedAt = incoming?.completedAt ?? assessment?.completedAt;
      if (!completedAt) {
        return NextResponse.json(
          {
            error: 'Maintenance assessment must be completed before go_for_run',
          },
          { status: 422 },
        );
      }
    }

    // Maintenance drivers are stored as a Mixed sub-document and replaced
    // wholesale (deep-merge would leak deleted category blocks back in).
    // Captured before the merge loop so we can reapply after deepMerge.
    let pendingDriversReplacement: { value: unknown } | null = null;

    for (const field of NESTED_FIELDS) {
      if (body[field] !== undefined) {
        const existing = (ind[field] as any)?.toObject?.() ?? ind[field] ?? {};
        const incoming = body[field];
        if (field === 'cost' && incoming.recurringAnnual?.maintenance) {
          const existingMaint = existing.recurringAnnual?.maintenance ?? {};
          const incomingMaint = incoming.recurringAnnual.maintenance;
          if ('drivers' in incomingMaint) {
            pendingDriversReplacement = { value: incomingMaint.drivers };
            // Strip from incoming so deep-merge doesn't merge per-category.
            incoming.recurringAnnual.maintenance = { ...incomingMaint };
            delete incoming.recurringAnnual.maintenance.drivers;
          }
          incoming.recurringAnnual = {
            ...(existing.recurringAnnual ?? {}),
            ...incoming.recurringAnnual,
            maintenance: {
              ...existingMaint,
              ...incoming.recurringAnnual.maintenance,
              assessment: {
                ...(existingMaint.assessment ?? {}),
                ...(incomingMaint.assessment ?? {}),
              },
            },
          };
        }
        // When the client supplies a computeBreakdown, the matching computeEur
        // becomes the calculated annual cost (Σ cloud + on-prem amortisation
        // + electricity) — so the persisted euros always match the calculator.
        if (field === 'cost' && incoming.recurringAnnual?.computeBreakdown) {
          const merged = {
            ...(existing.recurringAnnual?.computeBreakdown ?? {}),
            ...incoming.recurringAnnual.computeBreakdown,
          };
          const calc = computeAnnualCompute(merged as any);
          incoming.recurringAnnual = {
            ...(existing.recurringAnnual ?? {}),
            ...incoming.recurringAnnual,
            computeBreakdown: merged,
            computeEur: calc.totalEur,
          };
        }
        // When the client supplies an oneTime.profileHours[X] array, the
        // matching …Eur scalar becomes a derived Σ(hours × rate) — recompute
        // server-side so the persisted euros always match the breakdown.
        if (field === 'cost' && incoming.oneTime?.profileHours) {
          const existingOneTime = existing.oneTime ?? {};
          const incomingOneTime = incoming.oneTime;
          const ph = incomingOneTime.profileHours;
          const eurFromLines = (lines: any[] | undefined) =>
            Array.isArray(lines) && lines.length > 0
              ? Math.round(
                  lines.reduce(
                    (s, l) =>
                      s +
                      (Number(l?.hours) || 0) *
                        (Number(l?.profileRateSnapshot) || 0),
                    0,
                  ),
                )
              : null;
          const recomputed: Record<string, number> = {};
          const FIELD_MAP: Record<string, string> = {
            development: 'developmentEur',
            integration: 'integrationEur',
            infraSetup: 'infraSetupEur',
            securityCompliance: 'securityComplianceEur',
            trainingChangeMgmt: 'trainingChangeMgmtEur',
          };
          for (const [k, eurKey] of Object.entries(FIELD_MAP)) {
            // Only recompute when the client explicitly sent an array for this key.
            if (k in ph) {
              const sum = eurFromLines(ph[k]);
              if (sum !== null) recomputed[eurKey] = sum;
            }
          }
          incoming.oneTime = {
            ...(existingOneTime ?? {}),
            ...incomingOneTime,
            ...recomputed,
            profileHours: { ...(existingOneTime.profileHours ?? {}), ...ph },
          };
        }
        (ind as any)[field] = deepMerge(existing, incoming);
        delete body[field];
      }
    }

    // Reapply drivers wholesale after deep-merge. Mixed subdocs require an
    // explicit markModified for Mongoose to persist the change.
    if (pendingDriversReplacement) {
      const cost = (ind as any).cost;
      if (cost) {
        cost.recurringAnnual = cost.recurringAnnual ?? {};
        cost.recurringAnnual.maintenance =
          cost.recurringAnnual.maintenance ?? {};
        cost.recurringAnnual.maintenance.drivers =
          pendingDriversReplacement.value;
        ind.markModified('cost.recurringAnnual.maintenance.drivers');
      }
    }

    // Stamp archivedAt whenever isArchived flips, so the audit log is implicit.
    if ('isArchived' in body) {
      (ind as any).archivedAt = body.isArchived ? new Date() : undefined;
    }

    Object.assign(ind, body);
    await ind.save();

    // Re-fetch with the same populate as GET so the client preserves the
    // useCase/process/POC links the ROI tab and origin trace depend on.
    const populated = await Industrialization.findById(ind._id)
      .populate('processId', 'procId name b1 b3')
      .populate(
        'useCaseId',
        'cuId description timeSavedPerProfile targetActivities estimatedDevCostEur computeBreakdown aiTypes',
      )
      .populate(
        'pocId',
        'pocId name phase decision computeBreakdown evaluation design',
      )
      .lean();

    return NextResponse.json(populated ?? ind.toObject());
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
  { params }: { params: Promise<{ auditId: string; indId: string }> },
) {
  try {
    await dbConnect();
    const { auditId, indId } = await params;
    const access = await requireAuditAccess(req, auditId, 'edit');
    if (!isAccessGranted(access)) return access;

    const ind = await Industrialization.findOne({ auditId, _id: indId });
    if (!ind) {
      return NextResponse.json(
        { error: 'Industrialization not found' },
        { status: 404 },
      );
    }

    await ind.deleteOne();
    return NextResponse.json({
      message: 'Industrialization deleted successfully',
    });
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

function deepMerge(target: any, source: any): any {
  if (target === null || target === undefined) return source;
  if (typeof target !== 'object' || Array.isArray(target)) return source;
  if (source === null || source === undefined) return target;
  if (typeof source !== 'object' || Array.isArray(source)) return source;
  const out: any = { ...target };
  for (const key of Object.keys(source)) {
    out[key] = deepMerge(target[key], source[key]);
  }
  return out;
}
