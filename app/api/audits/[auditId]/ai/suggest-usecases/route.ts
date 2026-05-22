import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Audit, Process } from '@/lib/models';
import { callMistral, parseLLMJson } from '@/lib/llm';
import { requireAuditAccess, isAccessGranted } from '@/lib/auditAccess';
import { getStateOfTheArt } from '@/lib/references';

const SYSTEM_PROMPT = (techpubsKnowledgeBase: string, isTechpubs: boolean) => `You are an expert AI consultant at ATEXIS, specializing in AI adoption assessment for ILS processes in regulated industrial sectors (defence, aerospace, naval, railway, etc.).

Your goal is to propose concrete, actionable AI use cases tailored to the process being audited. Read B1 (process context), B2 (sovereignty constraints), and B3 (activities) carefully.

## NAMING RULES FOR USE CASES
- Each UC name format: "UC-01: [Activity Name] — [Use Case Title]"
- Multi-activity UCs: "UC-06: [Activity A] + [Activity B] — [Use Case Title]"
${isTechpubs ? `
⚠️ CRITICAL — This process is Technical Publications. You MUST use EXACTLY these titles for the first 5 use cases, no exceptions:
- UC-01: Analysis and Source Data Preparation — [Your Title Here]
- UC-02: Authoring — [Your Title Here]
- UC-03: Illustration — [Your Title Here]
- UC-04: Validation — [Your Title Here]
- UC-05: Publication & Dispatching — [Your Title Here]

DO NOT use B3 step names for UC-01 to UC-05.
These 5 phase names are MANDATORY and cannot be changed.
Additional UCs from UC-06 onwards may use B3 step names.
` : ''}

## TOOL & STACK NAMING RULES
- Technology types ONLY (not brand names): "RAG Semantic", "MCP Server", "Agentic AI", "Knowledge Graph", "VLM + LLM"
- NEVER use: Mistral, GPT, Claude, LangChain, Chroma, Qdrant, LangGraph, Stable Diffusion
${isTechpubs ? `- TechPubs-specific tools: reference state-of-the-art.md only (e.g., Oxygen XML, PTC Arbortext, Xignal, etc.)` : ''}

## SOVEREIGNTY & CLIENT IT
- Evaluate "requires Client IT approval" from B2 constraints
- List blockers and preconditions before POC starts
- Justify all sovereignty decisions clearly

${isTechpubs ? `## TECHPUBS KNOWLEDGE BASE
${techpubsKnowledgeBase}

---
` : ''}`;

export type AITypeValue = 'generative_llm' | 'extraction_nlp' | 'classification_ml' | 'rag' | 'rag_semantic' | 'rag_lexical' | 'knowledge_graph' | 'validation' | 'prediction' | 'prediction_ml' | 'intelligent_automation' | 'agentic_ai' | 'agentic_ai_workflow' | 'mcp_client' | 'mcp_server' | 'function_tool' | 'chatbot' | 'multimodal_vlm' | 'other';

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

    console.log('[SUGGEST-USECASES]', {
      process_department: (process as any)?.department,
      isTechpubs,
      systemPrompt_first_200: SYSTEM_PROMPT('', isTechpubs).slice(0, 200),
    });

    let stateOfTheArt = '';
    if (isTechpubs) {
      stateOfTheArt = await getStateOfTheArt();
    }

    const prompt = `
## B1 — PROCESS CONTEXT
Process: ${process.name || 'Unnamed'}
Description: ${b1.description || 'Not provided'}
Client Department: ${b1.clientDepartment || 'Not specified'}
Annual Repetitions: ${b3.annualRepetitions ?? 0}
Stakeholders: ${(b1.stakeholders ?? []).join(', ') || 'Not specified'}
Profiles Involved: ${profilesSummary}

## B2 — SOVEREIGNTY & INFRASTRUCTURE ASSESSMENT
${axesSummary}

## B3 — PROCESS MAP (ACTIVITIES & TASKS)
${activitiesSummary}

---

## INSTRUCTIONS

Return a JSON array of ${isTechpubs ? 'MINIMUM 5' : '3-5'} AI use case objects.

Each object must have EXACTLY these fields:
{
  "description": "UC-01: [Exact Step Name from B3] — [Title]. [Architecture]",
  "aiTypes": ["generative_llm" | "extraction_nlp" | "classification_ml" | "rag_semantic" | "rag_lexical" | "knowledge_graph" | "validation" | "prediction_ml" | "intelligent_automation" | "agentic_ai_workflow" | "mcp_client" | "mcp_server" | "function_tool" | "chatbot" | "multimodal_vlm" | "other"],
  "targetActivityNames": ["activity from B3"],
  "timeSavedPerProfile": [{ "role": "role from B1", "hoursPerExecution": number }],
  "estimatedDevCostEur": number,
  "devCostExplanation": "Why this cost estimate",
  "requiredPreconditions": {
    "requiresClientIT": boolean,
    "text": "What must be in place before POC"
  },
  "estimatedImplWeeks": number,
  "score": {
    "d1_efficiencyImpact": { "value": 1-5, "justification": "..." },
    "d2_qualityImpact": { "value": 1-5, "justification": "..." },
    "d3_techMaturity": { "value": 1-5, "justification": "..." },
    "d4_dataReadiness": { "value": 1-5, "justification": "..." },
    "d5_sovereigntyIndex": { "value": 1-5, "justification": "..." }
  },
  "notes": "Implementation recommendations, tool suggestions, blockers"
}

Return ONLY valid JSON array, no explanation.`;

    const text = await callMistral([{ role: 'user', content: prompt }], {
      maxTokens: isTechpubs ? 14000 : 3000,
      temperature: 0.4,
      systemPrompt: SYSTEM_PROMPT(stateOfTheArt, isTechpubs),
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
