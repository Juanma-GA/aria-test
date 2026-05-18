import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Audit, Process } from '@/lib/models';
import { callMistral, parseLLMJson } from '@/lib/llm';
import { requireAuditAccess, isAccessGranted } from '@/lib/auditAccess';
import { getEstadoDelArte } from '@/lib/references';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ auditId: string }> }
) {
  try {
    await dbConnect();
    const { auditId } = await params;
    const access = await requireAuditAccess(req, auditId, 'edit');
    if (!isAccessGranted(access)) return access;

    const body = await req.json();
    const { processId } = body;

    if (!processId) {
      return NextResponse.json({ error: 'processId is required' }, { status: 400 });
    }

    const [audit, process] = await Promise.all([
      Audit.findById(auditId).lean(),
      Process.findOne({ auditId, _id: processId }).lean(),
    ]);

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

    const isTechpubs = ((audit as any)?.projectType || 'techpubs') === 'techpubs';

    let estadoDelArte = '';
    if (isTechpubs) {
      estadoDelArte = await getEstadoDelArte();
    }

    const techpubsSection = isTechpubs ? `
## TECHPUBS KNOWLEDGE BASE
==========================
${estadoDelArte}

---

` : '';

    // Build use case instruction based on projectType
    const ucInstruction = isTechpubs ? `Return a JSON array of MINIMUM 5 AI use case objects, one per TechPubs production phase. The first 5 MUST cover these phases in order:
- UC-01: Analysis and Source Data Preparation
- UC-02: Authoring
- UC-03: Illustration
- UC-04: Validation
- UC-05: Publication & Dispatching

Additional UCs covering multiple phases simultaneously start at UC-06.

Each object must have exactly these fields:
{
  "description": "[Phase Name] — [Specific Use Case Title]",
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
  "notes": "Additional implementation notes, tool recommendations from TechPubs knowledge base"
}

PHASE DESCRIPTIONS for description field:
- For UC-01: "Analysis and Source Data Preparation — [Title]"
- For UC-02: "Authoring — [Title]"
- For UC-03: "Illustration — [Title]"
- For UC-04: "Validation — [Title]"
- For UC-05: "Publication & Dispatching — [Title]"
- For UC-06+: "Multi-phase — [Title]"

Return ONLY valid JSON array, no explanation.` : `Return a JSON array of 3-5 AI use case objects. Each object must have exactly these fields:
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

    const prompt = `You are an AI consultant specializing in enterprise AI strategy. Analyze the following business process and suggest concrete AI use cases.
${techpubsSection}
PROCESS: ${process.name || 'Unnamed'}
DESCRIPTION: ${b1.description || 'Not provided'}
CLIENT DEPARTMENT: ${b1.clientDepartment || 'Not specified'}
ANNUAL REPETITIONS: ${b3.annualRepetitions ?? 0}
STAKEHOLDERS: ${(b1.stakeholders ?? []).join(', ') || 'Not specified'}
PROFILES INVOLVED: ${profilesSummary}
ACTIVITIES:
${activitiesSummary}
SOVEREIGNTY CONSTRAINTS: ${axesSummary}

${ucInstruction}`;

    const text = await callMistral([{ role: 'user', content: prompt }], { maxTokens: isTechpubs ? 4000 : 3000, temperature: 0.4 });

    console.log('[SUGGEST-USECASES-DIAG] isTechpubs:', isTechpubs);
    console.log('[SUGGEST-USECASES-DIAG] Mistral raw response length:', text.length);
    console.log('[SUGGEST-USECASES-DIAG] Mistral raw response (first 500 chars):', text.slice(0, 500));
    console.log('[SUGGEST-USECASES-DIAG] Mistral raw response (last 200 chars):', text.slice(-200));

    let suggestions: any[] = [];
    try {
      suggestions = parseLLMJson<any[]>(text);
      console.log('[SUGGEST-USECASES-DIAG] Successfully parsed JSON, count:', Array.isArray(suggestions) ? suggestions.length : 'not array');
      if (Array.isArray(suggestions) && suggestions.length > 0) {
        console.log('[SUGGEST-USECASES-DIAG] First suggestion:', JSON.stringify(suggestions[0], null, 2).slice(0, 300));
      }
    } catch (parseErr) {
      console.log('[SUGGEST-USECASES-DIAG] JSON parse error:', parseErr instanceof Error ? parseErr.message : String(parseErr));
      console.log('[SUGGEST-USECASES-DIAG] Could not parse response as JSON');
    }

    return NextResponse.json({ suggestions: Array.isArray(suggestions) ? suggestions : [] });
  } catch (err) {
    console.error("[API]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
