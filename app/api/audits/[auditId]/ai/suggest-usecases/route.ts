import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Audit, Process } from '@/lib/models';
import { callMistral, parseLLMJson } from '@/lib/llm';
import { requireAuditAccess, isAccessGranted } from '@/lib/auditAccess';
import { getStateOfTheArt } from '@/lib/references';

const SYSTEM_PROMPT = `You are an expert AI consultant at ATEXIS, specializing in AI adoption assessment for ILS processes in regulated industrial sectors (defence, aerospace, naval, railway, etc.).

Your goal is to propose at least one AI use case per step of the Process Map (B3) being audited. To do that you need to read also B1 and B2.

## NAMING RULES FOR USE CASES
- Minimum 1 UC per B3 step, named as:
  UC-01: [Step Name from B3] — [Use Case Title]
  UC-02: [Step Name from B3] — [Use Case Title]
- Multi-step UCs start at UC-06:
  UC-06: [Step A] + [Step B] — [Use Case Title]
- If department === 'Technical Publications', first 5 MUST be:
  UC-01: Analysis and Source Data Preparation — [Title]
  UC-02: Authoring — [Title]
  UC-03: Illustration — [Title]
  UC-04: Validation — [Title]
  UC-05: Publication & Dispatching — [Title]

## TOOL NAMING RULES
- Legacy tools: use exact name from B2/B3 (e.g. "ST4", "XMetal")
- New AI tools (TechPubs only): only use names from state-of-the-art.md
  (e.g. Oxygen, PTC Arbortext, Xignal, etc.)
- ATEXIS tools: only use names from state-of-the-art.md
  (examples: KleamPy, Amadeus, Vexa, Opsira, Prism, FTM Agent,
  ATEXIS Content Generator, Luminai, Alfred, etc.)
- If tool not in state-of-the-art.md: use generic type only
  (e.g. "RAG Agent", "Local LLM", "Agentic AI Workflow",
  "MCP Server", etc.)

## AI STACK NAMING
Always use technology type, never commercial model names:
✅ RAG Semántico, RAG Léxico, Knowledge Graph, VLM + LLM,
   MCP Server, MCP Client, Agentic AI, Vector DB local, etc.
❌ Mistral, GPT, Claude, LangChain, Chroma, Qdrant, LangGraph,
   Llama, Stable Diffusion, etc.

## REQUIRED PRECONDITIONS
- Always evaluate Requires Client IT approval based on B2
- List blockers and conditions needed before POC
- If no ATEXIS tool is included, justify explicitly why discarded`;

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

    const isTechpubs = (process as any)?.department === 'Technical Publications';

    let stateOfTheArt = '';
    if (isTechpubs) {
      stateOfTheArt = await getStateOfTheArt();
    }

    const techpubsSection = isTechpubs ? `
## TECHPUBS KNOWLEDGE BASE
==========================
${stateOfTheArt}

---

` : '';

    // Build use case instruction based on process department
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

    const text = await callMistral([{ role: 'user', content: prompt }], {
      maxTokens: isTechpubs ? 10000 : 3000,
      temperature: 0.4,
      systemPrompt: SYSTEM_PROMPT,
    });

    let suggestions: any[] = [];
    try {
      // Strip markdown code fences
      const stripped = text
        .replace(/^[\s\S]*?```(?:json)?\s*/i, '')
        .replace(/\s*```[\s\S]*$/, '')
        .trim();

      // parseLLMJson now safely handles both arrays and objects
      const parsed = parseLLMJson<any>(stripped);

      // Ensure we have an array: if Mistral returns an object, extract the array
      if (Array.isArray(parsed)) {
        suggestions = parsed;
      } else if (parsed && typeof parsed === 'object') {
        // Try common property names for arrays
        if (Array.isArray(parsed.suggestions)) {
          suggestions = parsed.suggestions;
        } else if (Array.isArray(parsed.usecases)) {
          suggestions = parsed.usecases;
        } else if (Array.isArray(parsed.cases)) {
          suggestions = parsed.cases;
        } else if (Array.isArray(parsed.data)) {
          suggestions = parsed.data;
        }
      }
    } catch (err) {
      console.error("[SUGGEST-USECASES] Parse error:", err);
    }

    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error("[API]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
