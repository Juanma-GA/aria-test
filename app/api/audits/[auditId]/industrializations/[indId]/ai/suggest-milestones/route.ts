import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import dbConnect from '@/lib/mongodb';
import { Industrialization, POC, UseCase, Audit } from '@/lib/models';
import { callMistral, parseLLMJson } from '@/lib/llm';
import { requireAuditAccess, isAccessGranted } from '@/lib/auditAccess';

interface SuggestedMilestone {
  name: string;
  /** Days from project start when the milestone is due (lead time, not pure effort). */
  daysFromStart: number;
  /** Net engineering effort in hours required to deliver the milestone. */
  effortHours: number;
  notes?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ auditId: string; indId: string }> }
) {
  try {
    await dbConnect();
    const { auditId, indId } = await params;
    const access = await requireAuditAccess(req, auditId, 'edit');
    if (!isAccessGranted(access)) return access;

    const ind = await Industrialization.findOne({ auditId, _id: indId });
    if (!ind) return NextResponse.json({ error: 'Industrialization not found' }, { status: 404 });

    const [poc, useCase, audit] = await Promise.all([
      POC.findById(ind.pocId).lean(),
      UseCase.findById(ind.useCaseId).lean(),
      Audit.findById(auditId).lean(),
    ]);

    const start = ind.plan?.startDate ? new Date(ind.plan.startDate) : new Date();
    const target = ind.plan?.targetGoLiveDate ? new Date(ind.plan.targetGoLiveDate) : null;
    const durationDays = target
      ? Math.max(7, Math.round((target.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))
      : 180;
    const durationMonths = Math.max(1, Math.round(durationDays / 30));

    const prompt = `You are an AI industrialization project planner. Suggest a list of milestones to take this AI use case from a validated POC to production go-live.

CONTEXT:
- Sector: ${(audit as any)?.sector ?? 'unknown'}
- Use case: ${(useCase as any)?.description ?? 'not specified'}
- POC objective (validated): ${(poc as any)?.design?.measurableObjective ?? 'not specified'}
- POC scope: ${(poc as any)?.design?.scopeDescription ?? 'not specified'}
- Industrialization scope: ${ind.plan?.scope ?? 'not specified'}
- Dependencies: ${ind.plan?.dependencies ?? 'none'}
- Sovereignty constraints: ${ind.plan?.sovereigntyConstraints ?? 'none'}
- Project duration window: ~${durationMonths} months (~${durationDays} days, including wait times)
- Industrialization status: ${ind.status}

Return between 5 and 8 milestones covering the typical industrialization path (kickoff, infra/security setup, integration, UAT, training/change mgmt, go-live, hypercare). Adapt to the regulated nature of the sector if applicable (defence/aerospace/naval/railway often need formal validation/homologation milestones).

For each milestone provide BOTH:
- effortHours: net engineering effort in hours required to deliver the milestone (e.g. 40h for kickoff, 120h for integration)
- daysFromStart: calendar days from project start when the milestone is due. The lead time MUST be greater than or equal to (effortHours / 8) but typically larger because of wait times: stakeholder validation, security audits, infra provisioning, vendor SLAs. For regulated sectors (defence/aerospace/naval/railway) inflate lead times significantly for validation/homologation milestones.

Return ONLY a JSON object with this exact shape:
{
  "milestones": [
    { "name": "Short milestone name (max 50 chars)", "daysFromStart": 14, "effortHours": 40, "notes": "Brief rationale (deliverable, dependency, expected wait time)" }
  ]
}

daysFromStart must be a number between 0 and ${durationDays}. Order chronologically. effortHours must be a positive integer. Notes MUST be single-line strings — do not use literal newlines, tabs or carriage returns inside any string value.`;

    const text = await callMistral([{ role: 'user', content: prompt }], { maxTokens: 1000, temperature: 0.4 });
    const parsed = parseLLMJson<{ milestones: SuggestedMilestone[] }>(text);

    const milestones = (parsed.milestones ?? []).map((m) => {
      const days = Math.max(0, Math.min(durationDays, Math.round(m.daysFromStart ?? 0)));
      const due = new Date(start);
      due.setDate(due.getDate() + days);
      return {
        id: uuidv4(),
        name: (m.name ?? '').slice(0, 80),
        dueDate: due,
        status: 'pending' as const,
        progressPct: 0,
        effortHours: Math.max(0, Math.round(m.effortHours ?? 0)),
        notes: m.notes ?? '',
      };
    });

    ind.milestones = milestones as any;
    const ai = new Set([...(ind.aiGeneratedFields ?? []), 'milestones']);
    ind.aiGeneratedFields = [...ai];
    await ind.save();

    return NextResponse.json({ industrialization: ind.toObject(), milestones });
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
