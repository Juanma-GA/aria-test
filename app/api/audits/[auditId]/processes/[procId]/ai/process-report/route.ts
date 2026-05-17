import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Audit, Process, UseCase } from '@/lib/models';
import { callMistral } from '@/lib/llm';
import { requireAuditAccess, isAccessGranted } from '@/lib/auditAccess';

const AXIS_NAMES: Record<string, string> = {
  axis1_InfoClassification: 'Information Classification',
  axis2_ProcessSovereignty: 'Process Sovereignty',
  axis3_ToolSovereignty: 'Tool Sovereignty',
  axis4_DataSovereignty: 'Data Sovereignty',
  axis5_Infrastructure: 'Infrastructure',
};

const STATUS_EMOJI: Record<string, string> = {
  green: '🟢',
  amber: '🟡',
  red: '🔴',
};

function sovereigntyIndex(b2: any): number | null {
  if (!b2?.axes) return null;
  const vals = (Object.values(b2.axes) as any[])
    .map((a) => a.status === 'green' ? 5 : a.status === 'amber' ? 3 : a.status === 'red' ? 1 : null)
    .filter((v) => v !== null) as number[];
  if (!vals.length) return null;
  return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
}

function sovereigntyLevel(idx: number | null): string {
  if (idx === null) return 'Not assessed';
  if (idx >= 4.5) return 'Full Autonomy';
  if (idx >= 3.5) return 'Managed';
  if (idx >= 2.5) return 'Conditioned';
  if (idx >= 1.5) return 'Restricted';
  return 'Critical';
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ auditId: string; procId: string }> }
) {
  try {
    await dbConnect();
    const { auditId, procId } = await params;
    const access = await requireAuditAccess(req, auditId, 'edit');
    if (!isAccessGranted(access)) return access;

    const [audit, process, useCases] = await Promise.all([
      Audit.findById(auditId).populate('leadConsultant', 'name email').lean(),
      Process.findOne({ auditId, _id: procId }).lean() as any,
      UseCase.find({ processId: procId }).lean(),
    ]);

    if (!audit || !process) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const b1 = (process as any).b1 ?? {};
    const b2 = (process as any).b2 ?? {};
    const b3 = (process as any).b3 ?? {};
    const activities: any[] = b3.activities ?? [];
    const profiles: any[] = b1.profiles ?? [];
    const stakeholders: any[] = b1.stakeholders ?? [];
    const sovIdx = sovereigntyIndex(b2);
    const sovLevel = sovereigntyLevel(sovIdx);

    // ── Build context strings ─────────────────────────────────────────────────

    const auditContext = `
AUDIT CONTEXT
=============
- Audit Name: ${(audit as any).name}
- Client: ${(audit as any).client}
- Sector: ${(audit as any).sector}
- Classification: ${(audit as any).classification}
- Status: ${(audit as any).status}
- Lead Consultant: ${(audit as any).leadConsultant?.name ?? 'N/A'}
- Start Date: ${(audit as any).startDate ? new Date((audit as any).startDate).toLocaleDateString('en-GB') : 'N/A'}
- Target End Date: ${(audit as any).targetEndDate ? new Date((audit as any).targetEndDate).toLocaleDateString('en-GB') : 'N/A'}
`.trim();

    const b1Context = `
PROCESS CONTEXT (B1)
====================
- Process Name: ${process.name}
- Formal Name: ${b1.formalName ?? process.name}
- Department: ${b1.department ?? process.department ?? 'N/A'}
- Contract Reference: ${b1.contractReference ?? 'N/A'}
- Number of People: ${b1.numberOfPeople ?? profiles.reduce((s: number, p: any) => s + (p.count ?? 1), 0)}
- Client Department: ${b1.clientDepartment ?? 'N/A'}
- Client Responsible: ${b1.clientResponsible ?? 'N/A'}

Profiles:
${profiles.length ? profiles.map((p: any) => `  - ${p.role} (${p.type}): ${p.count ?? 1} person(s) @ €${p.hourlyRateEur}/h`).join('\n') : '  None defined'}

Stakeholders:
${stakeholders.length ? stakeholders.map((s: any) => `  - ${s.name} (${s.role}): influence=${s.influenceLevel}, AI attitude=${s.aiAttitude}`).join('\n') : '  None defined'}

B1 Notes: ${b1.notes ?? 'None'}
`.trim();

    const b2Context = `
SOVEREIGNTY ASSESSMENT (B2)
============================
Sovereignty Index: ${sovIdx !== null ? sovIdx.toFixed(1) + '/5' : 'Not assessed'} — Level: ${sovLevel}

Axes:
${b2.axes ? Object.entries(b2.axes).map(([key, axis]: [string, any]) => `
  ${STATUS_EMOJI[axis.status] ?? '⚪'} ${AXIS_NAMES[key] ?? key}: ${axis.status?.toUpperCase() ?? 'N/A'}
    Findings: ${axis.findings ?? 'N/A'}
    Implications: ${axis.implications ?? 'N/A'}
    Normative Frameworks: ${axis.normativeFrameworks?.join(', ') || 'None'}
    Infrastructure Mode: ${axis.infrastructureMode ?? 'N/A'}
`).join('') : '  Not assessed'}
`.trim();

    const b3Context = `
PROCESS MAP (B3) — ${activities.length} steps | ${b3.annualRepetitions ?? 1} runs/year
=========================================================
${activities.map((a: any, i: number) => `
Step ${i + 1}${a.isDecisionPoint ? ' [DECISION POINT]' : ''}: ${a.name || '(unnamed)'}
  Tools/Systems: ${a.tools?.join(', ') || 'None'}
  Inputs: ${a.inputs?.join(', ') || 'None'}
  Outputs: ${a.outputs?.join(', ') || 'None'}
  Responsible Profile: ${a.responsibleProfile || 'N/A'}
  Estimated Time: ${a.estimatedTimeHours ?? 0}h (step repetitions: ${a.stepRepetitions ?? 1})
  Profile Hours:
${(a.profileHours ?? []).length ? (a.profileHours ?? []).map((ph: any) => `    - ${ph.role}: ${ph.hours}h`).join('\n') : '    None'}
  Tasks:
${(a.tasks ?? []).length ? (a.tasks ?? []).map((t: any, ti: number) => `    ${ti + 1}. ${t.description}`).join('\n') : '    None'}
  Notes: ${a.notes || 'None'}
`).join('')}
Total Time per Run: ${activities.reduce((s: number, a: any) => s + (Number(a.estimatedTimeHours) || 0), 0)}h
B3 Notes: ${b3.notes ?? 'None'}
`.trim();

    const existingUCContext = useCases.length > 0 ? `
EXISTING USE CASES (for reference)
====================================
${useCases.map((uc: any) => `- ${uc.cuId}: ${uc.description} [${uc.status}]`).join('\n')}
` : '';

    // ── Build prompt ──────────────────────────────────────────────────────────

    const prompt = `You are an expert AI consultant at Atexis, specializing in AI adoption assessment for regulated industrial sectors (defence, aerospace, naval, railway). Generate a comprehensive, professional process analysis report in Markdown. Write in the same language as the process data provided (use English if mixed).

${auditContext}

${b1Context}

${b2Context}

${b3Context}

${existingUCContext}

---

Generate the following 4-section report:

## Section 1 — Context Summary
Provide a rich narrative summary of:
- The audit and client context (sector, classification, strategic relevance)
- The process being analysed (purpose, scope, department, stakeholders)
- The team involved (profiles, their roles, hourly costs)
- Key organisational and contractual context

## Section 2 — Sovereignty Assessment
Provide a structured analysis of:
- The overall sovereignty level (${sovLevel}, index ${sovIdx !== null ? sovIdx.toFixed(1) : 'N/A'}/5) and what it means for AI deployment
- Each axis individually: status, key findings, implications for AI, applicable normative frameworks
- A summary of blocking constraints and conditions that must be met before deploying AI
- Recommended infrastructure deployment model(s) given the sovereignty profile

## Section 3 — Process Map Analysis
For EACH step in the process map, provide a structured analysis including:
- Step purpose and role in the overall process flow
- Tools and data in use (inputs/outputs)
- Time and resource consumption (hours, profiles, costs)
- Repetitive or manual tasks that represent automation candidates
- Pain points or inefficiencies visible from the data
- Specific tasks listed within the step (if any)
If a step is a decision point, flag it clearly and analyse decision logic.
Include an overall process efficiency summary at the end.

## Section 4 — AI Use Case Proposals
Propose 3 to 5 concrete AI use cases for this process. For EACH use case, provide ALL of the following fields in structured format:

**[UC-N] Title**
- Description: (clear description of what the AI does)
- Target Steps: (which B3 steps this applies to)
- AI Types: (from: generative_llm, extraction_nlp, classification_ml, rag, validation, prediction, intelligent_automation, agentic_ai)
- B2 Compatibility: (yes / no / partial — justify based on sovereignty axes)
- Requires Client IT: (yes/no — justify)
- Estimated Time Saved per Execution:
  - (Profile role): X hours/execution
- Estimated Dev Cost (€): (realistic range with explanation)
- Estimated Implementation (weeks): (realistic)
- Scoring:
  - D1 Efficiency Impact (1-5): value — justification (rubric: 1=<10% saving, 2=10-20%, 3=20-35%, 4=35-50%, 5=>50%)
  - D2 Quality Impact (1-5): value — justification
  - D3 Tech Maturity (1-5): value — justification (rubric: 1=experimental, 2=prototype, 3=pilot, 4=mature, 5=market standard)
  - D4 Data Readiness (1-5): value — justification (rubric: 1=data doesn't exist, 2=unstructured, 3=available with effort, 4=structured, 5=structured+clean+voluminous)
  - D5 Sovereignty (auto from B2 index ${sovIdx !== null ? sovIdx.toFixed(1) : 'N/A'}/5): ${sovIdx !== null ? Math.max(1, Math.min(5, Math.round(sovIdx))) : 'N/A'}
  - Total Score: (sum D1-D5) — Category: (Quick Win ≥18 / Mid-term 11-17 / Strategic <11)
- Status: (eligible / blocked / pending_review)
- If blocked: reason and unblock condition
- Implementation notes and risks

Be specific, technically precise, and grounded in the actual process data provided. Avoid generic statements.`;

    const markdown = await callMistral(
      [{ role: 'user', content: prompt }],
      { maxTokens: 8000, temperature: 0.2 }
    );

    return NextResponse.json({ markdown });
  } catch (err) {
    console.error('Process report error:', err);
    console.error("[API]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
