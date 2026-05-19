import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Industrialization, POC, UseCase, Audit } from '@/lib/models';
import { callMistral, parseLLMJson } from '@/lib/llm';
import { requireAuditAccess, isAccessGranted } from '@/lib/auditAccess';
import { computeAnnualCompute } from '@/lib/calculations';

interface BootstrapResult {
  oneTime: {
    developmentEur: number;
    integrationEur: number;
    infraSetupEur: number;
    securityComplianceEur: number;
    trainingChangeMgmtEur: number;
    contingencyPct: number;
  };
  recurringAnnual: {
    computeEur: number;
    licensesEur: number;
    monitoringObservabilityEur: number;
  };
  rationale: string;
}

export async function POST(
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

    const ind = await Industrialization.findOne({ auditId, _id: indId });
    if (!ind)
      return NextResponse.json(
        { error: 'Industrialization not found' },
        { status: 404 },
      );

    const [poc, useCase, audit] = await Promise.all([
      POC.findById(ind.pocId).lean(),
      UseCase.findById(ind.useCaseId).lean(),
      Audit.findById(auditId).lean(),
    ]);

    // POC's annual recurring cost is computed from its calculator state
    // (computeBreakdown). Fall back to 0 when the POC never ran the calculator.
    const pocBreakdown = (poc as any)?.computeBreakdown ?? null;
    const pocAnnualCompute = computeAnnualCompute(pocBreakdown);
    const pocDeploymentMode = pocBreakdown?.mode || 'unknown';
    const pocDevCost =
      (poc as any)?.evaluation?.actualCostEur ??
      (poc as any)?.design?.estimatedDevCostEur ??
      0;

    const prompt = `You are an AI industrialization cost estimator. Given the POC data and context, propose a baseline cost structure for the production industrialization. The user will review and adjust.

CONTEXT:
- Sector: ${(audit as any)?.sector ?? 'unknown'} (regulated industries: defence, aerospace, naval, railway)
- Use case: ${(useCase as any)?.description ?? 'not specified'}
- POC dev cost (actual or estimated): ${pocDevCost} €
- POC compute deployment: ${pocDeploymentMode}
- POC annual recurring compute (calculator output): ${pocAnnualCompute.totalEur} € / year
- Industrialization scope: ${ind.plan?.scope || 'not specified'}
- Dependencies: ${ind.plan?.dependencies || 'none'}
- Sovereignty constraints: ${ind.plan?.sovereigntyConstraints || 'none'}

Heuristics to apply:
- Industrialization development is typically 1.5x–3x the POC dev cost (productionisation, error handling, hardening).
- Integration cost depends on number of systems to connect (estimate based on context; typical range 10k–80k €).
- Infra setup is one-time (servers, networking, DR). For cloud API only, this is small (5k–15k); for on-prem, much larger.
- Security & compliance: 0 if not regulated; 20k–80k if regulated sector (audit, homologation dossier, pen-test).
- Training & change management: 5k–25k depending on scope.
- Contingency: 10–15% non-regulated, 15–25% regulated.
- Recurring compute: take the POC annual compute figure above and project to production volume (often 2x–10x). If not enough info, mirror POC value.
- Licenses: estimate based on use case scope (commercial APIs / vendor support tiers); typical 0–30k.
- Monitoring & observability: 3k–12k/year typical.

Return ONLY a JSON object with this exact shape (all numbers in EUR, integers):
{
  "oneTime": {
    "developmentEur": 0,
    "integrationEur": 0,
    "infraSetupEur": 0,
    "securityComplianceEur": 0,
    "trainingChangeMgmtEur": 0,
    "contingencyPct": 15
  },
  "recurringAnnual": {
    "computeEur": 0,
    "licensesEur": 0,
    "monitoringObservabilityEur": 0
  },
  "rationale": "2-3 sentences explaining the main assumptions and any sector-driven adjustments."
}

The rationale string MUST be a single line — do not use literal newlines, tabs or carriage returns inside any string value. Use spaces instead.`;

    const text = await callMistral([{ role: 'user', content: prompt }], {
      maxTokens: 700,
      temperature: 0.3,
    });
    const result = parseLLMJson<BootstrapResult>(text);

    // Convert the existing cost subdoc to a plain object so we can rebuild it cleanly.
    const existing =
      (ind.cost as any)?.toObject?.() ?? ((ind.cost ?? {}) as any);
    const existingOneTime: Record<string, unknown> = existing.oneTime ?? {};
    const existingRecurring: Record<string, unknown> =
      existing.recurringAnnual ?? {};
    const aiOneTime: Record<string, unknown> = result.oneTime ?? {};
    const aiRecurring: Record<string, unknown> = result.recurringAnnual ?? {};

    // Preserve any existing user-entered values; only fill empty/zero fields with the AI suggestion.
    const isEmpty = (v: unknown) =>
      v === undefined || v === null || v === 0 || v === '';
    const fillIfEmpty = (
      target: Record<string, unknown>,
      source: Record<string, unknown>,
    ) => {
      const out = { ...target };
      for (const [k, v] of Object.entries(source)) {
        if (isEmpty(out[k])) out[k] = v;
      }
      return out;
    };

    const merged = {
      ...existing,
      oneTime: fillIfEmpty(existingOneTime, aiOneTime),
      recurringAnnual: {
        ...fillIfEmpty(existingRecurring, aiRecurring),
        maintenance: existingRecurring.maintenance ?? {},
      },
    };

    (ind as any).cost = merged;
    const ai = new Set([
      ...(ind.aiGeneratedFields ?? []),
      'cost.oneTime',
      'cost.recurringAnnual',
    ]);
    ind.aiGeneratedFields = [...ai];
    await ind.save();

    return NextResponse.json({
      industrialization: ind.toObject(),
      rationale: result.rationale,
    });
  } catch (err) {
    console.error('[API] bootstrap-cost', err);
    const message =
      err instanceof Error ? err.message : 'Bootstrap-cost failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
