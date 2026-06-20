import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Audit, Process, UseCase, POC, Industrialization } from '@/lib/models';
import { requireAuditAccess, isAccessGranted } from '@/lib/auditAccess';
import { fmt, fmtEur, computeAuditReportData } from '@/lib/auditReportData';
import { getStateOfTheArt, getUseCases } from '@/lib/references';

function buildPrompt(
  audit: any,
  processes: any[],
  useCases: any[],
  pocs: any[],
  industrializations: any[],
): string {
  const {
    totalPeople,
    totalAnnualHours,
    totalAnnualCostEur,
    eligibleUCs,
    inPocUCs,
    discardedUCs,
    qwCount,
    mtCount,
    stCount,
    totalAnnualSaving,
    totalComputeCostEur,
    netAnnualSaving,
    totalDevCost,
    paybackMonths,
    ucRequiresClientIT,
    pocGo,
    pocClosed,
    pocActive,
    avgSovIndex,
    sovLevelLabel,
    sovereigntyTableRows,
    processSections,
    ucTableRows,
    computeTableRows,
    totalIndOneTime,
    totalIndRecurring,
    totalIndExpectedSaving,
    totalIndConfirmedSaving,
    indAtRun,
    indWip,
    indTableRows,
    indDetail,
    indStatusSummary,
    pocLines,
  } = computeAuditReportData(audit, processes, useCases, pocs, industrializations);

  // ── Prompt ──────────────────────────────────────────────────────────────────
  return `You are a senior digital transformation consultant specialised in industrial AI for the defence, aerospace, naval, and railway sectors.

Generate a comprehensive, professional AI Audit Report based on the structured data below.
CRITICAL RULES:
- Do NOT invent or extrapolate metrics. Use only the data provided.
- If a field is missing ("—"), say "Not available" in the report.
- Use a professional, direct, action-oriented tone in English.
- Output ONLY the report in Markdown. No preamble, no meta-commentary.
- Every section must be present, even if data is sparse (write "No data available" where needed).
- Scores are out of 25 (5 dimensions × max 5). Quick Win ≥18, Mid-term ≥11, Strategic <11.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AUDIT DATA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

AUDIT METADATA:
- Name: ${audit.name}
- Client: ${audit.client}
- Project: ${audit.project || '—'}
- Sector: ${audit.sector}
- Period: ${fmt(audit.startDate)} → ${fmt(audit.targetEndDate)}

GLOBAL METRICS:
- Audited processes: ${processes.length}
- Total people impacted: ${totalPeople}
- Total annual hours in scope: ${Math.round(totalAnnualHours)}h | Annual labour cost: ${fmtEur(totalAnnualCostEur)}
- Use cases: ${useCases.length} total | ${eligibleUCs.length} eligible | ${inPocUCs.length} in_poc | ${discardedUCs.length} discarded
- Quick Wins: ${qwCount} | Mid-term: ${mtCount} | Strategic: ${stCount}
- Projected gross annual saving: ${fmtEur(totalAnnualSaving)}
- Estimated annual compute cost: ${fmtEur(totalComputeCostEur)}
- Net annual saving: ${fmtEur(netAnnualSaving)}
- Total development investment: ${fmtEur(totalDevCost)}
- Overall payback: ${paybackMonths !== null ? `${paybackMonths} months` : 'N/A'}
- Use cases requiring client IT approval: ${ucRequiresClientIT}
- POCs: ${pocs.length} total | ${pocActive} active | ${pocClosed} closed | ${pocGo} with GO decision
- Industrializations: ${industrializations.length} total | ${indWip} work-in-progress | ${indAtRun} go-for-run
- Industrialization status mix: ${indStatusSummary}
- Industrialization investment (sum across all): one-time ${fmtEur(totalIndOneTime)} | recurring ${fmtEur(totalIndRecurring)}/yr
- Industrialization expected annual saving: ${fmtEur(totalIndExpectedSaving)} | confirmed annual saving: ${fmtEur(totalIndConfirmedSaving)}

GLOBAL SOVEREIGNTY:
Average index: ${avgSovIndex.toFixed(1)}/5 — Level: ${sovLevelLabel}

Axis summary (counts per status across all ${processes.length} process(es)):
| Axis | ✅ Green | 🟡 Amber | 🔴 Red |
|------|---------|---------|--------|
${sovereigntyTableRows}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROCESS DETAIL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${processSections}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
USE CASE RANKING (ALL, ordered by score DESC)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| ID | Description | AI Types | Score/30 | Category | Saving/yr | Dev Cost | Payback | Status |
|----|-------------|----------|----------|----------|-----------|----------|---------|--------|
${ucTableRows || '| — | No use cases | — | — | — | — | — | — | — |'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMPUTE COST (eligible UCs only)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| UC ID | Deployment | Annual Executions | Estimated Cost/yr |
|-------|-----------|-------------------|-------------------|
${computeTableRows || '| — | — | — | — |'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
POCS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${pocLines || 'No POCs recorded.'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INDUSTRIALIZATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Summary table:

| IND ID | Name | POC | UC | Process | Status | Owner | Target Go-Live | One-time | Recurring | Expected saving | Payback | Progress |
|--------|------|-----|----|---------|--------|-------|----------------|----------|-----------|-----------------|---------|----------|
${indTableRows || '| — | No industrializations | — | — | — | — | — | — | — | — | — | — | — |'}

Detail per industrialization:

${indDetail || 'No industrializations recorded.'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GENERATE THE REPORT WITH EXACTLY THESE 11 SECTIONS IN THIS ORDER:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# AI Audit Report — ${audit.name}
*Generated: ${fmt(new Date())} | Tool: ARIA v2 | Model: mistral-medium-latest*

---

## 0. Project Fact Sheet

Produce a clean two-column Markdown table with these rows (use the data above):
Client | Sector | Project | Audit period | Processes audited | People impacted | Total hours in scope | Annual labour cost | Eligible use cases | Total dev investment | Projected net saving/yr | Overall payback | POCs | Industrializations (total / WIP / Go-for-run) | Industrialization investment (one-time + recurring/yr) | Sovereignty level

---

## 1. Executive Summary

Write exactly 3 paragraphs:
- P1: Scope and context — what was audited, client, sector, number of processes and people.
- P2: Key findings — number and quality of use cases identified, sovereignty level, POC and industrialization progress (how many POCs reached GO and how many industrializations are in progress / live), and most significant saving/risk.
- P3: Top recommendation — the single most impactful action the client should take, with urgency.

---

## 2. Sovereignty Assessment

2a. Write a paragraph interpreting the global sovereignty level (${sovLevelLabel}, index ${avgSovIndex.toFixed(1)}/5) and what it means for AI deployment.

2b. Insert this exact table (already computed — reproduce it verbatim):
| Axis | ✅ Green | 🟡 Amber | 🔴 Red |
|------|---------|---------|--------|
${sovereigntyTableRows}

2c. List the 3 most critical sovereignty constraints found (with specific process/axis references from the data).

2d. State clearly: ${ucRequiresClientIT} use case(s) require Client IT approval due to sovereignty restrictions.

---

## 3. Process-by-Process Analysis

For EACH process in the data, write a subsection with this fixed structure:

### 3.X — {procId}: {process name}

**B1 — Context:** Responsible(s), department, profiles (roles × headcount × rate), annual repetitions.
**B3 — Process Map:** Number of activities, decision points, total hours/run, key tools, main bottleneck activity.
**B2 — Sovereignty:** Reproduce the 5-axis assessment with status icons. Highlight any amber/red axes and their specific findings.
**Use Cases:** For each UC in this process, one bullet: ID, AI types, score/30, category, gross saving/yr, payback.

---

## 4. Use Case Ranking

4a. Reproduce the full ranking table (already computed above — reproduce it verbatim, sorted by score DESC).

4b. Write subsections:
### Quick Wins (≥22/30 AND D6 ≥4)
For each Quick Win UC: 2-sentence justification of why it qualifies and what makes it immediately actionable.

### Mid-term (14–21/30)
For each Mid-term UC: 1-sentence description of the main prerequisite before implementation.

### Strategic (<14/30)
For each Strategic UC: 1-sentence justification for keeping it in the roadmap.

### Blocked
For each blocked UC: reason for blockage and specific condition required to unblock.

---

## 5. ROI & Compute Analysis

5a. Global financial summary table:
| Metric | Value |
|--------|-------|
| Gross annual saving | ${fmtEur(totalAnnualSaving)} |
| Annual compute cost | ${fmtEur(totalComputeCostEur)} |
| Net annual saving | ${fmtEur(netAnnualSaving)} |
| Total dev investment | ${fmtEur(totalDevCost)} |
| Overall payback | ${paybackMonths !== null ? `${paybackMonths} months` : 'N/A'} |

5b. Reproduce the compute cost table (already computed — reproduce verbatim).

5c. Write 2 paragraphs: (1) interpret the ROI figures — which processes/UCs drive the most value; (2) comment on the compute cost structure and whether cloud vs on-premise vs hybrid is appropriate given the sovereignty level.

---

## 6. POC Status

${
  pocs.length > 0
    ? `6a. Reproduce a summary table: | POC ID | UC | Phase | Decision | Milestones |
For each closed POC: summarise results vs criteria, key lessons learned, and whether the decision was GO/No-Go.
For each active POC: state current phase, next milestone, and any blockers.`
    : `No POCs have been recorded for this audit. Recommend the top 2-3 eligible use cases that should be launched as POCs immediately, with justification based on score, saving potential, and technical maturity (D3/D4 dimensions).`
}

---

## 7. Industrialization Portfolio

${
  industrializations.length > 0
    ? `7a. Reproduce the industrialization summary table verbatim (already computed above):

| IND ID | Name | POC | UC | Process | Status | Owner | Target Go-Live | One-time | Recurring | Expected saving | Payback | Progress |
|--------|------|-----|----|---------|--------|-------|----------------|----------|-----------|-----------------|---------|----------|
${indTableRows}

7b. Status overview — write 1 paragraph interpreting the status mix (${indStatusSummary}). Highlight industrializations at risk (Stand by, Cancelled, or with statusReason explaining a blocker).

7c. For each industrialization in **work_in_progress** or **go_for_run**, write a short subsection:
### {industrializationId} — {name}
- **Linkage:** POC → UC → Process
- **Plan:** owners, scope, target go-live (flag if past target with no actual go-live)
- **Milestones:** progress (done / total / missed) and the next critical milestone
- **Cost & ROI:** one-time + recurring/yr, expected saving/yr and payback. If confirmed ROI is available, contrast it with the expected ROI.
- **Risks & sovereignty constraints:** the most critical 1-2 items
- **Production status (only if go_for_run):** monitored KPIs, incidents, decommissioning plan

7d. Aggregated industrialization economics:
| Metric | Value |
|--------|-------|
| Total one-time investment | ${fmtEur(totalIndOneTime)} |
| Total recurring cost / yr | ${fmtEur(totalIndRecurring)} |
| Expected annual saving (sum) | ${fmtEur(totalIndExpectedSaving)} |
| Confirmed annual saving (sum) | ${fmtEur(totalIndConfirmedSaving)} |
| Industrializations at run | ${indAtRun} of ${industrializations.length} |

7e. Recommendation paragraph: which industrializations should be accelerated, paused, or re-scoped, and why — grounded only in the data above.`
    : `No industrializations have been recorded yet. Identify the 1-3 POCs with GO / GO Conditional decisions that should be promoted to industrialization next, and explain the prerequisites (owner assignment, scope definition, sovereignty constraints carried over from B2/POC) that must be addressed before launch.`
}

---

## 8. Risks & Constraints

Produce a normalised risk table with EXACTLY these columns and at least one row per risk category:

| Risk | Category | Severity | Affected UC(s) / Process(es) | Mitigation |
|------|----------|----------|------------------------------|------------|

Risk categories to cover (add rows only where data supports it):
1. Sovereignty / regulatory compliance
2. Technology maturity (low D3 scores)
3. Data readiness (low D4 scores)
4. Client IT dependency
5. Sector-specific regulation (defence, export control, etc.)
6. Change management / user adoption

Severity: High / Medium / Low based on the actual data.

Include any industrialization-specific risks recorded in the data (with severity).

---

## 9. Implementation Roadmap

Produce a timeline table with EXACTLY these 4 horizons:

| Horizon | Period | Actions |
|---------|--------|---------|

- Immediate (0–3 months): List specific Quick Win UCs to launch + any POCs to initiate + industrializations to push to go-for-run if their target go-live falls in this horizon
- Short-term (3–6 months): Mid-term UCs to prepare, POCs to start, industrializations whose target go-live falls here
- Medium-term (6–12 months): Mid-term UCs to implement, POC evaluations, industrialization roll-outs scheduled in this horizon
- Long-term (12+ months): Strategic UCs and any industrialization whose target go-live is beyond 12 months

Use actual UC IDs, POC IDs and Industrialization IDs from the data.

---

## 10. Recommendations

Produce a numbered list of exactly 5–8 prioritised recommendations. For each:
**#N. [Action in imperative form]**
- Owner: Atexis / Client / Joint
- Urgency: Immediate / 30 days / 90 days
- Rationale: 1 sentence grounded in the audit data.

Order by urgency descending. At least one recommendation must address industrialization governance (promotion of validated POCs, milestone discipline, or maintenance assessment) when industrialization data exists.

---

## 11. Conclusion

Write exactly 1 paragraph (4–6 sentences) assessing:
- Overall AI maturity level of the audited scope (including how far the portfolio has progressed from use-case identification through POCs to industrialization)
- Most significant opportunity identified
- Main barrier to overcome
- Overall verdict (positive/cautious/negative) with a closing forward-looking statement

---
END OF REPORT
`;
}

// ─── stripCodeFence — remove markdown code fence wrapper ───────────────────

function stripCodeFence(s: string): string {
  const t = (s ?? '').trim();
  // Quita un fence que envuelva TODO el contenido: ```lang\n ... \n```
  const m = t.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/);
  return m ? m[1].trim() : t;
}

// ─── buildBaseContext — deterministic audit data without industrializations ───

function buildBaseContext(
  audit: any,
  processes: any[],
  useCases: any[],
  pocs: any[],
): string {
  const {
    totalPeople,
    totalAnnualHours,
    totalAnnualCostEur,
    eligibleUCs,
    inPocUCs,
    discardedUCs,
    qwCount,
    mtCount,
    stCount,
    totalAnnualSaving,
    totalComputeCostEur,
    netAnnualSaving,
    totalDevCost,
    paybackMonths,
    ucRequiresClientIT,
    pocGo,
    pocClosed,
    pocActive,
    avgSovIndex,
    sovLevelLabel,
    sovereigntyTableRows,
    processSections,
    pocLines,
  } = computeAuditReportData(audit, processes, useCases, pocs, []);

  return `AUDIT METADATA:
- Name: ${audit.name}
- Client: ${audit.client}
- Project: ${audit.project || '—'}
- Sector: ${audit.sector}
- Period: ${fmt(audit.startDate)} → ${fmt(audit.targetEndDate)}

GLOBAL METRICS:
- Audited processes: ${processes.length}
- Total people impacted: ${totalPeople}
- Total annual hours in scope: ${Math.round(totalAnnualHours)}h | Annual labour cost: ${fmtEur(totalAnnualCostEur)}
- Use cases: ${useCases.length} total | ${eligibleUCs.length} eligible | ${inPocUCs.length} in_poc | ${discardedUCs.length} discarded
- Quick Wins: ${qwCount} | Mid-term: ${mtCount} | Strategic: ${stCount}
- Projected gross annual saving: ${fmtEur(totalAnnualSaving)}
- Estimated annual compute cost: ${fmtEur(totalComputeCostEur)}
- Net annual saving: ${fmtEur(netAnnualSaving)}
- Total development investment: ${fmtEur(totalDevCost)}
- Overall payback: ${paybackMonths !== null ? `${paybackMonths} months` : 'N/A'}
- Use cases requiring client IT approval: ${ucRequiresClientIT}
- POCs: ${pocs.length} total | ${pocActive} active | ${pocClosed} closed | ${pocGo} with GO decision

SCORING SCALE: Use case scores are out of 30 (6 dimensions × max 5: D1 efficiency, D2 quality, D3 tech maturity, D4 data readiness, D5 sovereignty, D6 governance complexity). Categories: Quick Win (total ≥22 AND D6≥4), Mid-term (≥14), Strategic (<14).

GLOBAL SOVEREIGNTY:
Average index: ${avgSovIndex.toFixed(1)}/5 — Level: ${sovLevelLabel}
Axis summary (counts per status across all ${processes.length} process(es)):
| Axis | ✅ Green | 🟡 Amber | 🔴 Red |
|------|---------|---------|--------|
${sovereigntyTableRows}

PROCESS DETAIL:
${processSections}

POC DETAIL:
${pocLines || '(no POCs recorded)'}`;
}

// ─── BLOCK_INSTRUCTIONS — section-specific prompts for LLM ──────────────────

const BLOCK_INSTRUCTIONS: Record<string, string> = {
  executiveSummary: `Write EXACTLY 3 paragraphs:
- P1: Scope and context — what was audited, client, sector, number of processes and people.
- P2: Key findings — number and quality of use cases identified, sovereignty level, POC progress, and the most significant saving or risk.
- P3: Top recommendation — the single most impactful action the client should take, with urgency.`,

  sovInterpretation: `Write EXACTLY 2 paragraphs:
- Interpret the global sovereignty level and what it implies for deploying AI.
- State clearly whether Client IT approval is required (and for how many use cases).`,

  roiInterpretation: `Write EXACTLY 2 paragraphs about which processes / use cases (and therefore which POCs) generate the most value, grounded in the ROI figures.`,

  risks: `Produce a Markdown table with EXACTLY these columns:
| Risk | Category | Severity | Affected Process(es) | Affected POC | Mitigation |
Cover these categories where the data supports it: sovereignty/regulatory, technology maturity (low D3), data readiness (low D4), Client IT dependency, sector-specific regulation (defence, export control), change management / user adoption.
Severity must be High / Medium / Low based on the actual data. Reference real process names and POC IDs from the data. Do NOT include industrialization risks.`,

  conclusion: `Write EXACTLY 1 paragraph (4–6 sentences) covering: overall AI maturity of the audited scope, the most significant opportunity, the main barrier to overcome, and an overall verdict (positive / cautious / negative) with a forward-looking closing statement.`,
};

// ─── buildBlockPrompt — generate LLM prompt for single block ──────────────────

function buildBlockPrompt(
  blockKey: string,
  baseContext: string,
  techpubsContext: string,
): string {
  return `You are a senior digital transformation consultant specialised in industrial AI for the defence, aerospace, naval, and railway sectors.

${techpubsContext}You are writing ONE section of an AI Audit Report. Output ONLY the content of this section in Markdown — NO section title, NO preamble, NO meta-commentary.

RULES:
- Do NOT invent or extrapolate metrics. Use ONLY the data provided below.
- If a field is missing ("—"), write "Not available".
- Professional, direct, action-oriented tone in English.

SECTION INSTRUCTION:
${BLOCK_INSTRUCTIONS[blockKey]}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AUDIT DATA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${baseContext}`;
}

// ─── GET — fetch existing report ─────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ auditId: string }> | { auditId: string } },
) {
  try {
    await dbConnect();
    const params = await Promise.resolve(context.params);
    const access = await requireAuditAccess(req, params.auditId, 'view');
    if (!isAccessGranted(access)) return access;

    const audit = (await Audit.findById(params.auditId)
      .select('report')
      .lean()) as any;
    if (!audit)
      return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const sections = audit.report?.sections;
    const hasSections = !!(sections && (sections.executiveSummary || sections.sovInterpretation || sections.roiInterpretation || sections.risks || sections.conclusion));
    if (!hasSections) return NextResponse.json({ exists: false });

    return NextResponse.json({
      exists: true,
      report: {
        generatedAt: audit.report?.generatedAt ?? null,
        model: audit.report?.model ?? '',
        sections: {
          executiveSummary: sections?.executiveSummary ?? '',
          sovInterpretation: sections?.sovInterpretation ?? '',
          roiInterpretation: sections?.roiInterpretation ?? '',
          risks: sections?.risks ?? '',
          conclusion: sections?.conclusion ?? '',
        },
      },
    });
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ─── POST — generate report ───────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ auditId: string }> | { auditId: string } },
) {
  const params = await Promise.resolve(context.params);
  const { auditId } = params;

  try {
    await dbConnect();
    const access = await requireAuditAccess(req, auditId, 'edit');
    if (!isAccessGranted(access)) return access;

    const [audit, processes, useCases, pocs, industrializations] =
      await Promise.all([
        Audit.findById(auditId).lean(),
        Process.find({ auditId }).lean(),
        UseCase.find({ auditId }).lean(),
        POC.find({ auditId })
          .populate('useCaseId', 'cuId description aiTypes')
          .populate('processId', 'procId name')
          .lean(),
        Industrialization.find({ auditId })
          .populate('useCaseId', 'cuId description')
          .populate('processId', 'procId name')
          .populate('pocId', 'pocId name')
          .lean(),
      ]);

    if (!audit)
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });

    const isTechpubs = (processes as any[]).some((p) => p?.department === 'Technical Publications');

    if (!process.env.MISTRAL_API_KEY) {
      return NextResponse.json(
        { error: 'MISTRAL_API_KEY no configurada en .env.local' },
        { status: 500 },
      );
    }

    // TechPubs reference context (shared across all blocks)
    let techpubsContext = '';
    if (isTechpubs) {
      const [stateOfTheArt, ucRefs] = await Promise.all([
        getStateOfTheArt(),
        getUseCases(),
      ]);
      techpubsContext = `## TECHPUBS KNOWLEDGE BASE
==========================

### State of the Art Technology
${stateOfTheArt}

### TechPubs Use Cases
${ucRefs}

---

`;
    }

    const baseContext = buildBaseContext(
      audit,
      processes as any[],
      useCases as any[],
      pocs as any[],
    );

    // Call Mistral for a single block; returns markdown or '' on failure
    async function callBlock(blockKey: string): Promise<string> {
      const content = buildBlockPrompt(blockKey, baseContext, techpubsContext);
      try {
        const res = await fetch(
          'https://api.2a91ec1812a1.dc.mistral.ai/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
            },
            body: JSON.stringify({
              model: 'mistral-medium-latest',
              messages: [{ role: 'user', content }],
              max_tokens: 4000,
              temperature: 0.3,
            }),
          },
        );
        if (!res.ok) {
          console.error(`Mistral block ${blockKey} error:`, await res.text());
          return '';
        }
        const data = await res.json();
        return stripCodeFence((data.choices?.[0]?.message?.content ?? '') as string);
      } catch (e) {
        console.error(`Mistral block ${blockKey} exception:`, e);
        return '';
      }
    }

    const blockKeys = [
      'executiveSummary',
      'sovInterpretation',
      'roiInterpretation',
      'risks',
      'conclusion',
    ];

    const results = await Promise.all(blockKeys.map((k) => callBlock(k)));
    const sections = {
      executiveSummary: results[0],
      sovInterpretation: results[1],
      roiInterpretation: results[2],
      risks: results[3],
      conclusion: results[4],
    };

    await Audit.findByIdAndUpdate(auditId, {
      'report.generatedAt': new Date(),
      'report.model': 'mistral-medium-latest',
      'report.sections': sections,
    });

    return NextResponse.json({ sections, model: 'mistral-medium-latest' });
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ─── PATCH — save single edited section ──────────────────────────────────────

const VALID_SECTIONS = ['executiveSummary', 'sovInterpretation', 'roiInterpretation', 'risks', 'conclusion'];

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ auditId: string }> | { auditId: string } },
) {
  try {
    await dbConnect();
    const params = await Promise.resolve(context.params);
    const access = await requireAuditAccess(req, params.auditId, 'edit');
    if (!isAccessGranted(access)) return access;

    const body = await req.json().catch(() => null);
    const section = body?.section;
    const content = body?.content;
    if (!section || !VALID_SECTIONS.includes(section) || typeof content !== 'string') {
      return NextResponse.json({ error: 'Invalid section or content' }, { status: 400 });
    }

    await Audit.findByIdAndUpdate(params.auditId, {
      [`report.sections.${section}`]: stripCodeFence(content),
    });

    return NextResponse.json({ ok: true, section });
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
