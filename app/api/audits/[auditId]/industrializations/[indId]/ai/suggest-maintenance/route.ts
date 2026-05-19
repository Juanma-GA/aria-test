import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Industrialization, POC, UseCase, Audit } from '@/lib/models';
import { callMistral, parseLLMJson } from '@/lib/llm';
import { requireAuditAccess, isAccessGranted } from '@/lib/auditAccess';

interface MaintenanceSuggestion {
  hasCorrectiveWarranty: boolean;
  hasFunctionalRoadmap: boolean;
  hasFineTuningOrDynamicRag: boolean;
  requiresDriftMonitoring: boolean;
  isRegulatedRevalidation: boolean;
  hasInternalSupport: boolean;
  hasVendorSla: boolean;
  /** Per-category drivers — only filled for categories marked applicable. */
  drivers?: {
    corrective?: { pctOfDevelopment: number };
    evolutive?: { featuresPerYear: number; hoursPerFeature: number; hourlyRateEur: number };
    modelRetraining?: { cyclesPerYear: number; hoursPerCycle: number; hourlyRateEur: number; cloudComputePerCycleEur: number };
    driftMonitoring?: { checksPerYear: number; hoursPerCheck: number; hourlyRateEur: number; toolingEurPerYear: number };
    revalidation?: { cyclesPerYear: number; hoursPerCycle: number; hourlyRateEur: number; externalAuditEurPerCycle: number };
    l1l2Support?: { ticketsPerMonth: number; hoursPerTicket: number; hourlyRateEur: number };
    vendorSla?: { monthlyFeeEur: number };
  };
  rationale: string;
}

const REGULATED_SECTORS = new Set(['defence', 'aerospace', 'naval', 'railway']);

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

    const sector = (audit as any)?.sector ?? 'unknown';
    const isRegulated = REGULATED_SECTORS.has(sector);
    const aiTypes = ((useCase as any)?.aiTypes ?? []).join(', ');
    const deployment = (poc as any)?.computeBreakdown?.mode || 'unknown';

    const developmentEur = (ind as any).cost?.oneTime?.developmentEur ?? 0;

    const prompt = `You are an AI MLOps and maintenance expert. Suggest answers to a maintenance applicability questionnaire for this industrialization, plus the calculation drivers (NOT a flat euro figure) for each applicable category. The user will review every driver before saving.

CONTEXT:
- Sector: ${sector} (regulated: ${isRegulated})
- Use case: ${(useCase as any)?.description ?? 'not specified'}
- AI types: ${aiTypes || 'not specified'}
- Deployment model: ${deployment}
- POC objective: ${(poc as any)?.design?.measurableObjective ?? 'not specified'}
- Sovereignty constraints: ${ind.plan?.sovereigntyConstraints ?? 'none'}
- Dependencies: ${ind.plan?.dependencies ?? 'none'}
- Planned development one-time cost: ${developmentEur} EUR (used by the corrective driver).

QUESTIONS — return true if applicable, false if clearly not:
1. hasCorrectiveWarranty: Standard practice for any production system; usually TRUE.
2. hasFunctionalRoadmap: Evidence of planned new features post go-live? If unclear, FALSE.
3. hasFineTuningOrDynamicRag: Does the AI use fine-tuning or RAG with a changing corpus?
4. requiresDriftMonitoring: TRUE for ongoing predictions on production data (classification, anomaly, prediction). FALSE for one-shot generation tools.
5. isRegulatedRevalidation: TRUE only if regulated AND output affects safety/certified processes.
6. hasInternalSupport: TRUE in any sizeable enterprise deployment.
7. hasVendorSla: TRUE if commercial APIs or commercial cloud; FALSE for fully internal on-prem open-source.

DRIVER GUIDANCE — for every category answered TRUE, fill its drivers using realistic, defensible numbers. Adjust up for regulated sectors. OMIT the driver block for categories answered FALSE.

- corrective.pctOfDevelopment: typical 8–15. Regulated → up to 18. Annual cost is computed as pct × ${developmentEur} EUR.
- evolutive: featuresPerYear (1–10), hoursPerFeature (20–80), hourlyRateEur (60–95).
- modelRetraining: cyclesPerYear (1–12 — quarterly is typical), hoursPerCycle (16–60 incl. data prep + validation), hourlyRateEur (70–95), cloudComputePerCycleEur (100–3000 depending on model size).
- driftMonitoring: checksPerYear (4–52), hoursPerCheck (1–8), hourlyRateEur (60–85), toolingEurPerYear (500–10000 for monitoring stack).
- revalidation (regulated only): cyclesPerYear (typically 1–2), hoursPerCycle (40–160), hourlyRateEur (90–120 senior), externalAuditEurPerCycle (5000–60000).
- l1l2Support: ticketsPerMonth (5–60), hoursPerTicket (0.5–3), hourlyRateEur (50–80).
- vendorSla: monthlyFeeEur (300–4000 — hyperscaler enterprise SLA, premium API tier).

Return ONLY a JSON object with this exact shape (omit driver blocks for categories answered FALSE):
{
  "hasCorrectiveWarranty": true,
  "hasFunctionalRoadmap": false,
  "hasFineTuningOrDynamicRag": false,
  "requiresDriftMonitoring": false,
  "isRegulatedRevalidation": false,
  "hasInternalSupport": true,
  "hasVendorSla": true,
  "drivers": {
    "corrective": { "pctOfDevelopment": 10 },
    "l1l2Support": { "ticketsPerMonth": 20, "hoursPerTicket": 1.5, "hourlyRateEur": 75 },
    "vendorSla": { "monthlyFeeEur": 800 }
  },
  "rationale": "2-3 sentences explaining the key signals you used and how the drivers were calibrated. Be honest about uncertainty."
}

The rationale string MUST be a single line — do not use literal newlines, tabs or carriage returns inside any string value. Use spaces instead.`;

    const text = await callMistral([{ role: 'user', content: prompt }], { maxTokens: 800, temperature: 0.2 });
    const result = parseLLMJson<MaintenanceSuggestion>(text);

    // Keep driver blocks only for categories the AI marked applicable. The
    // client never persists a driver for a NO answer (the assessment gate
    // already excludes those from the maintenance total).
    const num = (n: unknown) => Math.max(0, Number(n) || 0);
    const d = result.drivers ?? {};
    const drivers: Record<string, unknown> = {};
    if (result.hasCorrectiveWarranty && d.corrective)
      drivers.corrective = { pctOfDevelopment: num(d.corrective.pctOfDevelopment) };
    if (result.hasFunctionalRoadmap && d.evolutive)
      drivers.evolutive = {
        featuresPerYear: num(d.evolutive.featuresPerYear),
        hoursPerFeature: num(d.evolutive.hoursPerFeature),
        hourlyRateEur:   num(d.evolutive.hourlyRateEur),
      };
    if (result.hasFineTuningOrDynamicRag && d.modelRetraining)
      drivers.modelRetraining = {
        cyclesPerYear:           num(d.modelRetraining.cyclesPerYear),
        hoursPerCycle:           num(d.modelRetraining.hoursPerCycle),
        hourlyRateEur:           num(d.modelRetraining.hourlyRateEur),
        cloudComputePerCycleEur: num(d.modelRetraining.cloudComputePerCycleEur),
      };
    if (result.requiresDriftMonitoring && d.driftMonitoring)
      drivers.driftMonitoring = {
        checksPerYear:     num(d.driftMonitoring.checksPerYear),
        hoursPerCheck:     num(d.driftMonitoring.hoursPerCheck),
        hourlyRateEur:     num(d.driftMonitoring.hourlyRateEur),
        toolingEurPerYear: num(d.driftMonitoring.toolingEurPerYear),
      };
    if (result.isRegulatedRevalidation && d.revalidation)
      drivers.revalidation = {
        cyclesPerYear:            num(d.revalidation.cyclesPerYear),
        hoursPerCycle:            num(d.revalidation.hoursPerCycle),
        hourlyRateEur:            num(d.revalidation.hourlyRateEur),
        externalAuditEurPerCycle: num(d.revalidation.externalAuditEurPerCycle),
      };
    if (result.hasInternalSupport && d.l1l2Support)
      drivers.l1l2Support = {
        ticketsPerMonth: num(d.l1l2Support.ticketsPerMonth),
        hoursPerTicket:  num(d.l1l2Support.hoursPerTicket),
        hourlyRateEur:   num(d.l1l2Support.hourlyRateEur),
      };
    if (result.hasVendorSla && d.vendorSla)
      drivers.vendorSla = { monthlyFeeEur: num(d.vendorSla.monthlyFeeEur) };

    return NextResponse.json({
      assessment: {
        hasCorrectiveWarranty: result.hasCorrectiveWarranty,
        hasFunctionalRoadmap: result.hasFunctionalRoadmap,
        hasFineTuningOrDynamicRag: result.hasFineTuningOrDynamicRag,
        requiresDriftMonitoring: result.requiresDriftMonitoring,
        isRegulatedRevalidation: result.isRegulatedRevalidation,
        hasInternalSupport: result.hasInternalSupport,
        hasVendorSla: result.hasVendorSla,
      },
      drivers,
      rationale: result.rationale,
    });
  } catch (err) {
    console.error('[API] suggest-maintenance', err);
    const message = err instanceof Error ? err.message : 'Suggest-maintenance failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
