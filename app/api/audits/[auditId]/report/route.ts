import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Audit, Process, UseCase, POC, Industrialization } from '@/lib/models';
import { requireAuditAccess, isAccessGranted } from '@/lib/auditAccess';
import { fmt, fmtEur, computeAuditReportData } from '@/lib/auditReportData';
import { getStateOfTheArt, getUseCases } from '@/lib/references';

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
