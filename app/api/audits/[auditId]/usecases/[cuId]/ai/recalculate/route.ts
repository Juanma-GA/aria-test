import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { UseCase, Process } from '@/lib/models';
import { callMistral, parseLLMJson } from '@/lib/llm';
import { requireAuditAccess, isAccessGranted } from '@/lib/auditAccess';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ auditId: string; cuId: string }> }
) {
  try {
    await dbConnect();
    const { auditId, cuId } = await params;
    const access = await requireAuditAccess(req, auditId, 'edit');
    if (!isAccessGranted(access)) return access;

    const body = await req.json();
    const { description, aiTypes, targetActivities, requiredPreconditions } = body;

    // Fetch UseCase and Process
    const useCase = await UseCase.findOne({ auditId, _id: cuId }).lean();
    if (!useCase) {
      return NextResponse.json({ error: 'Use case not found' }, { status: 404 });
    }

    const process = await Process.findById(useCase.processId).lean();
    if (!process) {
      return NextResponse.json({ error: 'Process not found' }, { status: 404 });
    }

    const b1 = (process as any).b1 ?? {};
    const b2 = (process as any).b2 ?? {};
    const b3 = (process as any).b3 ?? {};

    // Build profiles summary
    const profilesSummary = (b1.profiles ?? [])
      .map((p: any) => `${p.count}× ${p.role} (€${p.hourlyRateEur}/h)`)
      .join(', ') || 'Not specified';

    // Build B3 activities summary - FILTERED to only target steps
    const targetActivityIds = targetActivities ?? [];

    // Derive profile list from filtered B3 target activities
    const profileList = (b3.activities ?? [])
      .filter((a: any) => targetActivityIds.includes(a.id))
      .flatMap((a: any) => a.profileHours ?? [])
      .reduce((acc: any[], ph: any) => {
        const existing = acc.find(e => e.profileId === ph.profileId);
        if (!existing) acc.push({ profileId: ph.profileId, role: ph.role });
        return acc;
      }, []);

    const profileListStr = profileList
      .map(p => `- ${p.role} (profileId: ${p.profileId})`)
      .join('\n');

    const activitiesSummary = (b3.activities ?? [])
      .filter((a: any) => targetActivityIds.includes(a.id))
      .map((a: any, i: number) => {
        const profileBreakdown = (a.profileHours ?? [])
          .map((ph: any) => {
            const prof = b1.profiles?.find((p: any) => p.id === ph.profileId);
            return `    - ${ph.role} (${prof?.count ?? '?'}× · €${prof?.hourlyRateEur ?? '?'}/h): ${ph.hours}h`;
          })
          .join('\n');

        const stepInfo = a.stepRepetitions && a.stepRepetitions > 1
          ? `, step reps: ${a.stepRepetitions}`
          : '';

        return profileBreakdown
          ? `${i + 1}. ${a.name || `Activity ${i + 1}`} (${a.estimatedTimeHours ?? 0}h/run${stepInfo}, ${a.isDecisionPoint ? 'decision point' : 'manual task'})\n${profileBreakdown}`
          : `${i + 1}. ${a.name || `Activity ${i + 1}`} (${a.estimatedTimeHours ?? 0}h/run${stepInfo}, ${a.isDecisionPoint ? 'decision point' : 'manual task'})`;
      })
      .join('\n') || 'No matching activities found';

    // Build axes summary
    const axesSummary = Object.entries(b2.axes ?? {})
      .map(([k, v]: [string, any]) => `${k}: ${v.compliance ?? 'N/A'} (${(v.normativeFrameworks ?? []).join(', ') || 'no frameworks'})`)
      .join(', ') || 'Not assessed';

    // Resolve target activity names from IDs
    const targetActivityNames = targetActivityIds
      .map((id: string) => {
        const activity = (b3.activities ?? []).find((a: any) => a.id === id);
        return activity?.name || id;
      })
      .join(', ');

    // Build LLM prompt
    const prompt = `Recalculate implementation economics for this AI use case.

For timeSavedPerProfile: Return hoursPerExecution ONLY for the profiles listed below in TARGET PROFILES. Do not add or remove profiles. Only estimate hoursPerExecution for each based on the actual hours they spend on the Target Steps (shown in B3).
hoursPerExecution must be ≤ current hours that profile spends on that step.
If the same profile appears in multiple target steps, return ONE entry with the sum of hours saved across all steps.

For estimatedDevCostEur: estimate total development cost in EUR based on:
- AI stack complexity (description and aiTypes)
- Regulated sector compliance overhead (B2 sovereignty)
- Integration effort with existing tools

For estimatedImplWeeks: total weeks from kickoff to production including integration, testing and validation.

For devCostExplanation: 2-3 sentences justifying the cost, mentioning main cost drivers and compliance overhead if regulated sector.

## USE CASE (Phase 1)
Description: ${description}
AI Types: ${(aiTypes ?? []).join(', ')}
Target Steps: ${targetActivityNames}
Required Preconditions: ${requiredPreconditions?.text || 'None'}

## B1 — PROCESS CONTEXT
Department: ${(process as any).department || 'Not specified'}
Annual Runs: ${b3.annualRepetitions ?? 'Unknown'}
Profiles: ${profilesSummary}

## B2 — SOVEREIGNTY
${axesSummary}

## TARGET PROFILES FOR TIME SAVINGS
${profileListStr}

## B3 — PROCESS MAP
${activitiesSummary}

Return ONLY a flat JSON object with EXACTLY these 4 top-level keys, no wrapper object, no nesting:
{
  "timeSavedPerProfile": [{ "role": "exact role name from B3", "hoursPerExecution": 0.0 }],
  "estimatedDevCostEur": 0,
  "estimatedImplWeeks": 0,
  "devCostExplanation": "explanation"
}
Do NOT wrap in any outer key like 'implementationEconomics' or 'result'.`;

    // Call Mistral
    const text = await callMistral([{ role: 'user', content: prompt }], {
      maxTokens: 2000,
      temperature: 0.2,
      systemPrompt: 'You are an expert AI consultant at ATEXIS, specializing in AI adoption assessment for ILS processes in regulated industrial sectors (defence, aerospace, naval, railway, etc.). Your task is to estimate implementation economics for an AI use case based on its architecture and the process context provided. Return ONLY valid JSON, no explanation outside the JSON.',
    });

    // Parse JSON response
    let result: any;
    try {
      const stripped = text
        .replace(/^[\s\S]*?```(?:json)?\s*/i, '')
        .replace(/\s*```[\s\S]*$/, '')
        .trim();

      result = parseLLMJson<any>(stripped);
    } catch (parseErr) {
      console.error('[RECALCULATE] Parse error:', parseErr);
      return NextResponse.json({
        error: 'LLM response parsing failed',
        rawResponse: text,
      }, { status: 500 });
    }

    return NextResponse.json({
      timeSavedPerProfile: result.timeSavedPerProfile ?? [],
      estimatedDevCostEur: result.estimatedDevCostEur ?? 0,
      estimatedImplWeeks: result.estimatedImplWeeks ?? 0,
      devCostExplanation: result.devCostExplanation ?? '',
    });
  } catch (err) {
    console.error('[RECALCULATE]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
