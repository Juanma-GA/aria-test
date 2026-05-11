import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Process } from '@/lib/models';
import { callMistral, parseLLMJson } from '@/lib/llm';
import { requireAuditAccess, isAccessGranted } from '@/lib/auditAccess';

export async function POST(
  req: NextRequest,
  { params }: { params: { auditId: string } }
) {
  try {
    await dbConnect();
    const { auditId } = params;
    const access = await requireAuditAccess(req, auditId, 'edit');
    if (!isAccessGranted(access)) return access;

    const body = await req.json();
    const { processId } = body;

    if (!processId) {
      return NextResponse.json({ error: 'processId is required' }, { status: 400 });
    }

    const process = await Process.findOne({ auditId, _id: processId });
    if (!process) {
      return NextResponse.json({ error: 'Process not found' }, { status: 404 });
    }

    const b1 = (process as any).b1 ?? {};
    const b2 = (process as any).b2 ?? {};
    const b3 = (process as any).b3 ?? {};

    const profilesSummary = (b1.profiles ?? [])
      .map((p: any) => `${p.count}× ${p.role} (€${p.hourlyRateEur}/h)`)
      .join(', ') || 'Not specified';

    const activitiesSummary = (b3.activities ?? [])
      .map((a: any, i: number) => `${i + 1}. ${a.name || `Activity ${i + 1}`} (${a.estimatedTimeHours ?? 0}h/run, ${a.isDecisionPoint ? 'decision point' : 'manual task'})`)
      .join('\n') || 'Not specified';

    const axesSummary = Object.entries(b2.axes ?? {})
      .map(([k, v]: [string, any]) => `${k}: ${v.compliance ?? 'N/A'} (${(v.normativeFrameworks ?? []).join(', ') || 'no frameworks'})`)
      .join(', ') || 'Not assessed';

    const prompt = `You are an AI consultant specializing in enterprise AI strategy. Analyze the following business process and suggest concrete AI use cases.

PROCESS: ${process.name || 'Unnamed'}
DESCRIPTION: ${b1.description || 'Not provided'}
CLIENT DEPARTMENT: ${b1.clientDepartment || 'Not specified'}
ANNUAL REPETITIONS: ${b3.annualRepetitions ?? 0}
STAKEHOLDERS: ${(b1.stakeholders ?? []).join(', ') || 'Not specified'}
PROFILES INVOLVED: ${profilesSummary}
ACTIVITIES:
${activitiesSummary}
SOVEREIGNTY CONSTRAINTS: ${axesSummary}

Return a JSON array of 3-5 AI use case objects. Each object must have exactly these fields:
{
  "description": "Clear 1-2 sentence description of the AI opportunity",
  "aiTypes": ["generative_llm" | "extraction_nlp" | "classification_ml" | "rag" | "validation" | "prediction" | "intelligent_automation" | "agentic_ai" | "other"],
  "targetActivityNames": ["name of activity this applies to"],
  "timeSavedPerProfile": [{ "role": "Role name", "hoursPerExecution": 0.5 }],
  "estimatedDevCostEur": 50000,
  "estimatedImplWeeks": 8,
  "score": {
    "d1_efficiencyImpact": { "value": 4, "justification": "..." },
    "d2_qualityImpact": { "value": 3, "justification": "..." },
    "d3_techMaturity": { "value": 4, "justification": "..." },
    "d4_dataReadiness": { "value": 3, "justification": "..." },
    "d5_sovereigntyIndex": { "value": 3, "justification": "..." }
  },
  "notes": "Additional implementation notes"
}

Return ONLY valid JSON array, no explanation.`;

    const text = await callMistral([{ role: 'user', content: prompt }], { maxTokens: 3000, temperature: 0.4 });
    const suggestions = parseLLMJson<any[]>(text);

    return NextResponse.json({ suggestions: Array.isArray(suggestions) ? suggestions : [] });
  } catch (err) {
    console.error("[API]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
