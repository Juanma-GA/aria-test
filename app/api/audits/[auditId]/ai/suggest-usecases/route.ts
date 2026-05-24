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

## TIME SAVINGS & IMPACT ESTIMATION
For timeSavedPerProfile: Return hoursPerExecution ONLY for profiles listed in the Target Steps of B3.
- The app automatically derives the profile list from selected B3 activities.
- **Do not add or remove profiles** — only estimate hoursPerExecution for each.
- Base your estimate on the actual hours each profile currently spends on those steps (shown in B3 per-profile breakdown).
- Use the **exact role name** from B3 (e.g., "Senior Tech Writer", not "Tech Writer").
- hoursPerExecution must be **≤ current hours** that profile spends on that step (e.g., if spending 8h, save 1–8h, not 10h).
- For multi-step use cases: sum the current hours across all targeted steps, then estimate what AI saves.

## RECOMMENDED GRADERS FOR AI OUTPUT EVALUATION — MANDATORY FOR EVERY UC
**CRITICAL: EVERY use case must include 1-3 Grader recommendations based on its AI types and architecture.**

Available Graders:
- **Exact Match Grader**: exact text comparison, precise and deterministic
- **Regex Grader**: for format or pattern validation only
- **Semantic Similarity Grader**: via vectors and semantics
- **LLM-as-a-Judge**: global response quality where another LLM acts as evaluator
- **Groundedness Grader**: for RAG, compares response vs retrieved context, detects hallucinations
- **Citation Grader**: verifies sources and citations
- **Hallucination Grader**: finds invented/unsupported claims, fundamental for RAG

**For each UC**: Analyze the proposed AI types and implementation. Select 1-3 Graders that directly validate the output quality. Include detailed justification for each Grader choice.

**Place Grader recommendations in requiredPreconditions.text under '## Recommended Graders' section at the end of the preconditions text.**

Examples:
- RAG use case → Groundedness Grader + Hallucination Grader (detect retrieved context violations)
- LLM generation → LLM-as-a-Judge (quality/coherence) + Regex Grader (format validation)
- Classification → Exact Match Grader (accuracy on ground truth) + Semantic Similarity (nuanced cases)

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
      .join('\n') || 'Not specified';

    const axesSummary = Object.entries(b2.axes ?? {})
      .map(([k, v]: [string, any]) => `${k}: ${v.compliance ?? 'N/A'} (${(v.normativeFrameworks ?? []).join(', ') || 'no frameworks'})`)
      .join(', ') || 'Not assessed';

    const isTechpubs = (process as any)?.department === 'Technical Publications';

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

## COST ESTIMATION GUIDELINES

**Scenario 1: ATEXIS Tools (minimal custom dev)**
- Use Oxygen XML, BRDP Manager, or existing ATEXIS-maintained tools
- Development cost: €20k–€40k (20–30% dev hours)
- Rationale: Framework is production-ready; only integration and validation needed

**Scenario 2: Standard Tools + Custom Integration**
- Leverage Python, FastAPI, or open-source libraries
- Development cost: €40k–€80k (40–60% dev hours)
- Rationale: Third-party tools handle core AI; custom integration (APIs, ETL, logging) adds complexity

**Scenario 3: Custom Development**
- Build from scratch or highly specialized architecture (e.g., fine-tuned LLM, bespoke data pipeline)
- Development cost: €80k–€200k+ (60–100% dev hours)
- Rationale: Full bespoke development with comprehensive testing, documentation, compliance integration

**Modifiers:**
- AI-assisted development (Copilot, Claude): +50% productivity boost → reduce estimated hours by 33%
- Regulated sector compliance overhead (B2 red flags): +20–30% additional cost for governance, audit, traceability
- Reference dev rate: €450/day (Spain 2025, inclusive of overhead)

**Coherence Check:** For each UC, cost and timeline must align:
- €20k UC → 4–6 weeks (minimal dev, mostly integration)
- €50k UC → 8–12 weeks (standard tools + custom integration)
- €150k UC → 16–24 weeks (custom dev with compliance)

If cost is high but weeks is low (or vice versa), adjust estimates to reflect realistic effort.

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
    "text": "What must be in place before POC\n\n**Recommended Graders**\n- [Grader Type 1]: justification\n- [Grader Type 2]: justification"
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

    console.log('[SUGGEST-USECASES] Full user prompt:\n', prompt);

    const text = await callMistral([{ role: 'user', content: prompt }], {
      maxTokens: isTechpubs ? 14000 : 3000,
      temperature: 0.4,
      systemPrompt: SYSTEM_PROMPT(stateOfTheArt, isTechpubs),
    });

    console.log('[SUGGEST-USECASES] Raw LLM response:\n', text);

    let suggestions: any[] = [];
    try {
      // Strip markdown code fences
      const stripped = text
        .replace(/^[\s\S]*?```(?:json)?\s*/i, '')
        .replace(/\s*```[\s\S]*$/, '')
        .trim();

      // parseLLMJson now safely handles both arrays and objects
      const parsed = parseLLMJson<any>(stripped);

      console.log('[SUGGEST-USECASES] Parsed JSON:\n', JSON.stringify(parsed, null, 2));

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
