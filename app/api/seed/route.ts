// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import dbConnect from '@/lib/mongodb';
import { User, Audit, Process, UseCase, POC } from '@/lib/models';

// ── Helpers ───────────────────────────────────────────────────────────────────

function pid(n: number) {
  return `PROC-0${n}`;
}
function cuid(n: number) {
  return `CU-0${n}`;
}
function pocid(n: number) {
  return `POC-0${n}`;
}

function act(
  order: number,
  name: string,
  tools: string[],
  inputs: string[],
  outputs: string[],
  hours: number,
  isDecision = false,
  notes = '',
): object {
  return {
    id: uuidv4(),
    order,
    name,
    tools,
    inputs,
    outputs,
    inputFiles: [],
    outputFiles: [],
    responsibleProfile: '',
    profileHours: [],
    estimatedTimeHours: hours,
    annualRepetitions: 0,
    stepRepetitions: 1,
    isDecisionPoint: isDecision,
    linkedUseCaseIds: [],
    notes,
  };
}

function score(
  d1: number,
  d2: number,
  d3: number,
  d4: number,
  d5: number,
  d6: number,
  notes: string,
  scoredBy: string,
): object {
  const j = (v: number, t: string) => ({ value: v, justification: t });
  return {
    dimensions: {
      d1_efficiencyImpact: j(
        d1,
        ['<10% saving', '10–20%', '20–35%', '35–50%', '>50%'][d1 - 1],
      ),
      d2_qualityImpact: j(
        d2,
        [
          'Marginal',
          'Reduces isolated errors',
          'Reduces rework significantly',
          'Eliminates error categories',
          'Full consistency guaranteed',
        ][d2 - 1],
      ),
      d3_techMaturity: j(
        d3,
        [
          'Experimental',
          'Prototype',
          'Pilot deployments',
          'Mature / proven in industry',
          'Market standard',
        ][d3 - 1],
      ),
      d4_dataReadiness: j(
        d4,
        [
          "Data doesn't exist",
          'Exists but unstructured',
          'Available with effort',
          'Structured and accessible',
          'Structured, clean, voluminous',
        ][d4 - 1],
      ),
      d5_sovereigntyIndex: j(
        d5,
        ['Red axis', 'Mostly red', 'Amber axis', 'Mostly green', 'Green axis'][
          d5 - 1
        ],
      ),
      d6_governanceComplexity: j(
        d6,
        [
          '>4 external actors',
          '3–4 actors',
          '1–2 approvals needed',
          '1 internal actor',
          'Autonomous Atexis decision',
        ][d6 - 1],
      ),
    },
    scoringNotes: notes,
    scoredBy,
    scoredAt: new Date(),
  };
}

// ── POST /api/seed ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const role = req.headers.get('x-user-role');
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await dbConnect();

    // ── Cleanup previous seed data ───────────────────────────────────────────
    const existingUsers = await User.find({
      email: { $in: ['marie.dupont@atexis.com', 'carlos.vega@atexis.com'] },
    });
    const existingUserIds = existingUsers.map((u) => u._id);
    const existingAudits = await Audit.find({
      leadConsultant: { $in: existingUserIds },
    });
    const existingAuditIds = existingAudits.map((a) => a._id);
    const existingProcs = await Process.find({
      auditId: { $in: existingAuditIds },
    });
    const existingProcIds = existingProcs.map((p) => p._id);

    await UseCase.deleteMany({ processId: { $in: existingProcIds } });
    await POC.deleteMany({ auditId: { $in: existingAuditIds } });
    await Process.deleteMany({ _id: { $in: existingProcIds } });
    await Audit.deleteMany({ _id: { $in: existingAuditIds } });
    await User.deleteMany({ _id: { $in: existingUserIds } });

    // ── Users ────────────────────────────────────────────────────────────────
    const hash = await bcrypt.hash('atexis2025!', 10);
    const marie = await User.create({
      email: 'marie.dupont@atexis.com',
      passwordHash: hash,
      name: 'Marie Dupont',
      role: 'admin',
    });
    const carlos = await User.create({
      email: 'carlos.vega@atexis.com',
      passwordHash: hash,
      name: 'Carlos Vega',
      role: 'consultant',
    });

    // ════════════════════════════════════════════════════════════════════════
    // AUDIT 1 — Airbus Defence & Space · Aerospace · Active
    // ════════════════════════════════════════════════════════════════════════
    const audit1 = await Audit.create({
      name: 'AI Readiness Audit — Airbus D&S Documentation',
      client: 'Airbus Defence & Space',
      project: 'DO-178C Compliance Suite 2025',
      sector: 'aerospace',
      projectType: 'techpubs',
      classification: 'confidential',
      leadConsultant: marie._id,
      collaborators: [carlos._id],
      status: 'active',
      startDate: new Date('2025-01-15'),
      targetEndDate: new Date('2025-07-31'),
    });

    // ── Profile IDs (referenced in B1 + timeSavedPerProfile) ─────────────
    const p_stw = uuidv4(); // Senior Tech Writer
    const p_tw = uuidv4(); // Tech Writer
    const p_qa = uuidv4(); // QA Manager
    const p_eng = uuidv4(); // Systems Engineer
    const p_pm = uuidv4(); // Project Manager

    // ── A1 PROC-01 · Technical Documentation Generation ──────────────────
    const a1p1 = await Process.create({
      auditId: audit1._id,
      procId: pid(1),
      name: 'Technical Documentation Generation',
      department: 'Technical Documentation Centre',
      responsible: 'Jean-Pierre Martin',
      sector: 'aerospace',
      applicableNorms: ['S1000D Issue 5.0', 'ASD STE-100', 'DO-178C'],
      activeCertifications: ['EN 9100'],
      digitalMaturityLevel: 2,
      priority: 'high',
      status: 'in_audit',
      b1: {
        contractReference: 'ATX-2025-ADS-DOC-001',
        captureDate: new Date('2025-01-20'),
        numberOfPeople: 12,
        stakeholders: [
          {
            role: 'Process Owner',
            name: 'Jean-Pierre Martin',
            type: 'client',
            influenceLevel: 'very_high',
            aiAttitude: 'supporter',
            notes: 'Key decision maker, open to pilot projects',
          },
          {
            role: 'IT Lead',
            name: 'Sarah Chen',
            type: 'internal',
            influenceLevel: 'high',
            aiAttitude: 'champion',
            notes: 'Strong AI advocate, has GPU server budget',
          },
          {
            role: 'Quality Manager',
            name: 'Ralf Bauer',
            type: 'client',
            influenceLevel: 'high',
            aiAttitude: 'sceptic',
            notes: 'Requires DO-178C validation evidence for any AI tool',
          },
          {
            role: 'Tech Writer Lead',
            name: 'Isabelle Morel',
            type: 'internal',
            influenceLevel: 'medium',
            aiAttitude: 'neutral',
            notes: 'Concerned about job impact, needs reassurance',
          },
        ],
        profiles: [
          {
            id: p_stw,
            role: 'Senior Tech Writer',
            type: 'internal',
            count: 3,
            hourlyRateEur: 90,
          },
          {
            id: p_tw,
            role: 'Tech Writer',
            type: 'internal',
            count: 6,
            hourlyRateEur: 65,
          },
          {
            id: p_qa,
            role: 'QA Manager',
            type: 'internal',
            count: 1,
            hourlyRateEur: 95,
          },
          {
            id: p_pm,
            role: 'Project Manager',
            type: 'client',
            count: 2,
            hourlyRateEur: 110,
          },
        ],
        notes:
          'High-volume S1000D authoring: ~200 DMs/quarter. 35% rework rate. Main pain: STE compliance & content reuse.',
      },
      b2: {
        axes: {
          axis1_InfoClassification: {
            status: 'red',
            findings:
              'Documentation classified NATO RESTRICTED. Contains ITAR/EAR controlled technical data.',
            implications:
              'AI tools must be air-gapped or fully on-premise. No cloud LLM APIs permitted.',
            normativeFramework: 'ITAR/EAR, NATO STANAG 2600',
          },
          axis2_ProcessSovereignty: {
            status: 'green',
            findings:
              'Atexis fully controls the authoring and publication process. Client only approves final deliverables.',
            implications:
              'AI can be deployed freely in authoring workflow. Human-in-the-loop for final approval.',
          },
          axis3_ToolSovereignty: {
            status: 'amber',
            findings:
              'Arbortext Editor and S1000D CSDB are Atexis-managed. Third-party licenses restrict plugin modifications.',
            implications:
              'AI integration via API or standalone tool. Plugin development requires license review.',
          },
          axis4_DataSovereignty: {
            status: 'amber',
            findings:
              'Legacy DMs (5000+ modules) owned by Atexis. IPC and design specs owned by client.',
            implications:
              'Fine-tuning on Atexis data is feasible. Client data requires data processing agreement.',
          },
          axis5_Infrastructure: {
            status: 'amber',
            findings:
              'On-premise CSDB + VPN. GPU server available for on-premise AI from Q1 2025.',
            implications:
              'On-premise LLM deployment feasible. Cloud RAG possible for non-classified data only.',
            infrastructureMode: 'atexis_onpremise',
          },
        },
      },
      b3: {
        annualRepetitions: 48,
        activities: [
          {
            ...act(
              0,
              'Requirements Analysis & Planning',
              ['DOORS', 'Excel'],
              ['Design specs', 'Change notices', 'Previous DMs'],
              ['DM requirements list', 'Work package'],
              8,
              false,
              'Identify affected DMs and reuse candidates',
            ),
            profileHours: [
              { profileId: p_stw, role: 'Senior Tech Writer', hours: 6 },
              { profileId: p_pm, role: 'Project Manager', hours: 2 },
            ],
          },
          {
            ...act(
              1,
              'Data Module Authoring',
              ['Arbortext Editor', 'S1000D CSDB', 'STE checker'],
              ['Requirements list', 'Reference DMs', 'Illustrations'],
              ['Draft DMs (XML)'],
              40,
              false,
              'Most time-consuming step. STE compliance is manual.',
            ),
            profileHours: [
              { profileId: p_stw, role: 'Senior Tech Writer', hours: 8 },
              { profileId: p_tw, role: 'Tech Writer', hours: 32 },
            ],
          },
          {
            ...act(
              2,
              'Technical Review Cycle',
              ['Arbortext', 'SharePoint', 'PDF'],
              ['Draft DMs'],
              ['Review comments', 'Marked-up PDFs'],
              16,
              true,
              'Average 3 cycles. Each cycle ~16h total for the set',
            ),
            profileHours: [
              { profileId: p_stw, role: 'Senior Tech Writer', hours: 10 },
              { profileId: p_qa, role: 'QA Manager', hours: 6 },
            ],
          },
          {
            ...act(
              3,
              'Rework & Correction',
              ['Arbortext Editor'],
              ['Review comments'],
              ['Revised DMs'],
              20,
              false,
              '',
            ),
            profileHours: [{ profileId: p_tw, role: 'Tech Writer', hours: 20 }],
          },
          {
            ...act(
              4,
              'STE & Schema Validation',
              ['S1000D Validator', 'Schematron', 'STE checker'],
              ['Revised DMs'],
              ['Validation report', 'Error list'],
              10,
              true,
              'Manual STE check takes 2h/DM on average',
            ),
            profileHours: [
              { profileId: p_qa, role: 'QA Manager', hours: 6 },
              { profileId: p_stw, role: 'Senior Tech Writer', hours: 4 },
            ],
          },
          {
            ...act(
              5,
              'Publication & Delivery',
              ['CSDB Publisher', 'PDF generator', 'IETP builder'],
              ['Validated DMs'],
              ['Interactive PDF', 'IETP package'],
              4,
              false,
              '',
            ),
            profileHours: [{ profileId: p_tw, role: 'Tech Writer', hours: 4 }],
          },
        ],
        notes:
          'Full DM set cycle: ~98h. Main bottleneck is authoring + review rework. 35% rework rate inflates actual time to ~130h effective.',
      },
    });

    // Use Cases — A1P1
    const a1p1_uc1 = await UseCase.create({
      auditId: audit1._id,
      processId: a1p1._id,
      cuId: cuid(1),
      description:
        'NLP-based STE-100 style compliance checker integrated into Arbortext — flags non-compliant sentences in real time during authoring',
      aiTypes: ['validation', 'extraction_nlp'],
      targetActivities: [
        (a1p1.b3!.activities[1] as any).id,
        (a1p1.b3!.activities[4] as any).id,
      ],
      requiresClientIT: false,
      timeSavedPerProfile: [
        { profileId: p_stw, role: 'Senior Tech Writer', hoursPerExecution: 2 },
        { profileId: p_tw, role: 'Tech Writer', hoursPerExecution: 6 },
        { profileId: p_qa, role: 'QA Manager', hoursPerExecution: 2 },
      ],
      estimatedDevCostEur: 38000,
      devCostExplanation:
        'On-premise NLP model (spaCy + custom grammar rules), Arbortext plugin development, validation & DO-178C qualification evidence',
      estimatedImplWeeks: 12,
      status: 'eligible',
      notes:
        'High-confidence quick win. STE rules are fully formalised — model training is deterministic.',
      score: score(
        4,
        5,
        4,
        4,
        3,
        5,
        'Quick win. On-premise deployment resolves axis 1. Human remains in loop for approval.',
        marie._id.toString(),
      ),
    });

    const a1p1_uc2 = await UseCase.create({
      auditId: audit1._id,
      processId: a1p1._id,
      cuId: cuid(2),
      description:
        'RAG semantic search across CSDB to identify reusable DMs before authoring new ones — reduces from-scratch authoring by surfacing similar existing modules',
      aiTypes: ['rag'],
      targetActivities: [
        (a1p1.b3!.activities[0] as any).id,
        (a1p1.b3!.activities[1] as any).id,
      ],
      requiresClientIT: false,
      timeSavedPerProfile: [
        { profileId: p_stw, role: 'Senior Tech Writer', hoursPerExecution: 3 },
        { profileId: p_tw, role: 'Tech Writer', hoursPerExecution: 8 },
      ],
      estimatedDevCostEur: 85000,
      devCostExplanation:
        'Vector DB infrastructure (Weaviate on-premise), XML embedding pipeline, semantic search UI integrated into Arbortext',
      estimatedImplWeeks: 20,
      status: 'eligible',
      notes:
        'Content reuse rate currently 20%, target >35%. High ROI over time.',
      score: score(
        3,
        3,
        4,
        4,
        3,
        3,
        'Mid-term. Infrastructure investment needed but technology proven.',
        marie._id.toString(),
      ),
    });

    const a1p1_uc3 = await UseCase.create({
      auditId: audit1._id,
      processId: a1p1._id,
      cuId: cuid(3),
      description:
        'LLM-assisted first-draft generation for standard procedural DM types (maintenance procedures, fault isolation)',
      aiTypes: ['generative_llm'],
      targetActivities: [(a1p1.b3!.activities[1] as any).id],
      requiresClientIT: false,
      timeSavedPerProfile: [
        { profileId: p_tw, role: 'Tech Writer', hoursPerExecution: 15 },
      ],
      estimatedDevCostEur: 120000,
      devCostExplanation:
        'On-premise LLM (Mistral 7B), fine-tuning on 2000 validated DMs, prompt engineering, DO-178C qualification',
      estimatedImplWeeks: 32,
      status: 'blocked',
      blockedReason:
        'Axis 1 (Information Classification) is Red. ITAR/EAR data cannot be processed by any external LLM API.',
      blockedAxis: 'axis1_InfoClassification',
      unblockCondition:
        'Deploy and validate air-gapped on-premise LLM on GPU server. Obtain ITAR Technology Control Plan approval for model usage.',
      notes:
        'Highest potential saving if unblocked. Revisit after GPU infrastructure validation (Q3 2025).',
    });

    const a1p1_uc4 = await UseCase.create({
      auditId: audit1._id,
      processId: a1p1._id,
      cuId: cuid(4),
      description:
        'ML predictive quality scoring — flag DMs likely to fail review before they enter the review cycle, based on authoring patterns',
      aiTypes: ['prediction', 'classification_ml'],
      targetActivities: [(a1p1.b3!.activities[2] as any).id],
      requiresClientIT: false,
      timeSavedPerProfile: [
        { profileId: p_stw, role: 'Senior Tech Writer', hoursPerExecution: 3 },
        { profileId: p_qa, role: 'QA Manager', hoursPerExecution: 2 },
      ],
      estimatedDevCostEur: 65000,
      devCostExplanation:
        'Historical review outcome structuring (6 months data prep), ML model training, integration into review workflow',
      estimatedImplWeeks: 28,
      status: 'eligible',
      notes: 'Target: reduce average review cycles from 3 to 2.',
      score: score(
        2,
        3,
        2,
        2,
        3,
        2,
        'Strategic. Data preparation is the critical path — 6 months minimum before model training.',
        marie._id.toString(),
      ),
    });

    // ── A1 PROC-02 · Software Qualification Test Review ───────────────────
    const p2_eng = uuidv4();
    const p2_tst = uuidv4();

    const a1p2 = await Process.create({
      auditId: audit1._id,
      procId: pid(2),
      name: 'Software Qualification Test Review',
      department: 'Systems Engineering',
      responsible: 'Marc Dubois',
      sector: 'aerospace',
      applicableNorms: ['DO-178C', 'DO-331', 'ARP4754A'],
      activeCertifications: ['EN 9100'],
      digitalMaturityLevel: 3,
      priority: 'high',
      status: 'in_audit',
      b1: {
        contractReference: 'ATX-2025-ADS-ENG-002',
        captureDate: new Date('2025-01-28'),
        numberOfPeople: 8,
        stakeholders: [
          {
            role: 'DER / Certifying Engineer',
            name: 'Marc Dubois',
            type: 'internal',
            influenceLevel: 'very_high',
            aiAttitude: 'sceptic',
            notes:
              'Will require DO-178C Tool Qualification Evidence (TQL-5 or higher) for any AI tool',
          },
          {
            role: 'Test Lead',
            name: 'Anita Sharma',
            type: 'internal',
            influenceLevel: 'high',
            aiAttitude: 'supporter',
            notes: 'Eager to reduce manual test coverage analysis',
          },
        ],
        profiles: [
          {
            id: p2_eng,
            role: 'Systems Engineer',
            type: 'internal',
            count: 4,
            hourlyRateEur: 105,
          },
          {
            id: p2_tst,
            role: 'Test Engineer',
            type: 'internal',
            count: 4,
            hourlyRateEur: 85,
          },
        ],
        notes:
          'DO-178C DAL-B certification. Test review is the longest phase. Coverage analysis is 100% manual.',
      },
      b2: {
        axes: {
          axis1_InfoClassification: {
            status: 'red',
            findings:
              'Software source code and test vectors are export-controlled.',
            implications: 'No cloud processing. On-premise only.',
            normativeFramework: 'ITAR/EAR',
          },
          axis2_ProcessSovereignty: {
            status: 'green',
            findings: 'Atexis owns and controls the test review process.',
            implications:
              'AI deployment within Atexis control perimeter is unrestricted.',
          },
          axis3_ToolSovereignty: {
            status: 'green',
            findings:
              'Test tools (LDRA, VectorCAST) are Atexis-licensed. Integration APIs available.',
            implications:
              'AI plugin can integrate directly with LDRA/VectorCAST APIs.',
          },
          axis4_DataSovereignty: {
            status: 'amber',
            findings:
              'Test reports and coverage data owned by Atexis. Source code owned by client.',
            implications:
              'Coverage analysis AI can use Atexis test data. Source code analysis requires DPA.',
          },
          axis5_Infrastructure: {
            status: 'green',
            findings:
              'Atexis on-premise server farm. GPU available from Q1 2025.',
            implications: 'Full on-premise deployment possible.',
            infrastructureMode: 'atexis_onpremise',
          },
        },
      },
      b3: {
        annualRepetitions: 24,
        activities: [
          {
            ...act(
              0,
              'Test Plan Review',
              ['DOORS', 'Word'],
              ['Software requirements', 'Test plan draft'],
              ['Reviewed test plan', 'Open issues list'],
              12,
              false,
              '',
            ),
            profileHours: [
              { profileId: p2_eng, role: 'Systems Engineer', hours: 12 },
            ],
          },
          {
            ...act(
              1,
              'Test Coverage Analysis',
              ['LDRA Testbed', 'Excel', 'Python scripts'],
              ['Test cases', 'Source code', 'Coverage report'],
              ['Coverage gap analysis', 'Missing test cases list'],
              24,
              true,
              'Most manual step — mapping requirements to test cases is 100% manual',
            ),
            profileHours: [
              { profileId: p2_eng, role: 'Systems Engineer', hours: 8 },
              { profileId: p2_tst, role: 'Test Engineer', hours: 16 },
            ],
          },
          {
            ...act(
              2,
              'Test Execution & Results Review',
              ['VectorCAST', 'LDRA', 'Jenkins'],
              ['Test cases', 'Test environment'],
              ['Execution logs', 'Pass/fail results', 'Deviation reports'],
              16,
              true,
              '',
            ),
            profileHours: [
              { profileId: p2_tst, role: 'Test Engineer', hours: 16 },
            ],
          },
          {
            ...act(
              3,
              'Qualification Test Report Generation',
              ['Word', 'Excel', 'PowerPoint'],
              ['Execution results', 'Coverage analysis'],
              ['Qualification Test Report (QTR)'],
              20,
              false,
              'Report writing is boilerplate-heavy — 60% templated content',
            ),
            profileHours: [
              { profileId: p2_eng, role: 'Systems Engineer', hours: 12 },
              { profileId: p2_tst, role: 'Test Engineer', hours: 8 },
            ],
          },
        ],
        notes:
          'Full cycle: ~72h per software baseline review. Coverage analysis is the critical bottleneck.',
      },
    });

    const a1p2_uc5 = await UseCase.create({
      auditId: audit1._id,
      processId: a1p2._id,
      cuId: cuid(5),
      description:
        'AI-assisted test coverage analysis — automatically maps DO-178C requirements to test cases and identifies coverage gaps using NLP + traceability matrix',
      aiTypes: ['extraction_nlp', 'classification_ml'],
      targetActivities: [(a1p2.b3!.activities[1] as any).id],
      requiresClientIT: false,
      timeSavedPerProfile: [
        { profileId: p2_eng, role: 'Systems Engineer', hoursPerExecution: 6 },
        { profileId: p2_tst, role: 'Test Engineer', hoursPerExecution: 10 },
      ],
      estimatedDevCostEur: 42000,
      devCostExplanation:
        'NLP traceability model, DOORS + LDRA integration, DO-178C TQL-5 qualification evidence package',
      estimatedImplWeeks: 16,
      status: 'eligible',
      notes:
        'Direct integration with LDRA API available. Axis 3 fully green facilitates deployment.',
      score: score(
        4,
        4,
        3,
        4,
        4,
        4,
        'Strong mid-term. TQL-5 qualification is the main effort but infrastructure is ready.',
        marie._id.toString(),
      ),
    });

    const a1p2_uc6 = await UseCase.create({
      auditId: audit1._id,
      processId: a1p2._id,
      cuId: cuid(6),
      description:
        'LLM-assisted Qualification Test Report generation — auto-populate boilerplate sections from structured test execution data',
      aiTypes: ['generative_llm', 'intelligent_automation'],
      targetActivities: [(a1p2.b3!.activities[3] as any).id],
      requiresClientIT: false,
      timeSavedPerProfile: [
        { profileId: p2_eng, role: 'Systems Engineer', hoursPerExecution: 8 },
        { profileId: p2_tst, role: 'Test Engineer', hoursPerExecution: 5 },
      ],
      estimatedDevCostEur: 28000,
      devCostExplanation:
        'Template-based LLM with structured data input, Word output generation, reviewer validation UI',
      estimatedImplWeeks: 10,
      status: 'eligible',
      notes:
        '60% of QTR content is boilerplate. High-confidence automation target.',
      score: score(
        3,
        3,
        4,
        4,
        4,
        5,
        'Quick win. Report structure is standardised — low hallucination risk with structured input.',
        marie._id.toString(),
      ),
    });

    // ════════════════════════════════════════════════════════════════════════
    // AUDIT 2 — Naval Group · Naval · In Review
    // ════════════════════════════════════════════════════════════════════════
    const audit2 = await Audit.create({
      name: 'Smart Maintenance AI Assessment — Naval Group',
      client: 'Naval Group',
      project: 'Smart Maintenance Platform 2025',
      sector: 'naval',
      projectType: 'other',
      classification: 'reserved',
      leadConsultant: carlos._id,
      collaborators: [marie._id],
      status: 'review',
      startDate: new Date('2025-02-01'),
      targetEndDate: new Date('2025-08-31'),
    });

    const p_maint = uuidv4();
    const p_ops = uuidv4();
    const p_data = uuidv4();
    const p_analyst = uuidv4();

    // ── A2 PROC-01 · Predictive Maintenance Scheduling ───────────────────
    const a2p1 = await Process.create({
      auditId: audit2._id,
      procId: pid(1),
      name: 'Predictive Maintenance Scheduling',
      department: 'Fleet Maintenance',
      responsible: 'Antoine Leclerc',
      sector: 'naval',
      applicableNorms: ['MIL-STD-1388-2B', 'ILS standards'],
      activeCertifications: [],
      digitalMaturityLevel: 3,
      priority: 'high',
      status: 'in_audit',
      b1: {
        contractReference: 'ATX-2025-NG-MAINT-001',
        captureDate: new Date('2025-02-10'),
        numberOfPeople: 18,
        stakeholders: [
          {
            role: 'Fleet Maintenance Director',
            name: 'Antoine Leclerc',
            type: 'client',
            influenceLevel: 'very_high',
            aiAttitude: 'champion',
            notes: 'Executive sponsor of the Smart Maintenance programme',
          },
          {
            role: 'Data Engineering Lead',
            name: 'Priya Nair',
            type: 'internal',
            influenceLevel: 'high',
            aiAttitude: 'champion',
            notes: 'Strong data engineering capability, Python/ML experienced',
          },
          {
            role: 'Safety Officer',
            name: 'Bertrand Faure',
            type: 'client',
            influenceLevel: 'high',
            aiAttitude: 'sceptic',
            notes:
              'Naval safety regulations — AI cannot replace human sign-off',
          },
          {
            role: 'Maintenance Supervisor',
            name: 'Yann Kermarrec',
            type: 'client',
            influenceLevel: 'medium',
            aiAttitude: 'neutral',
            notes: '20+ years experience, prefers proven procedures',
          },
        ],
        profiles: [
          {
            id: p_maint,
            role: 'Maintenance Engineer',
            type: 'client',
            count: 8,
            hourlyRateEur: 80,
          },
          {
            id: p_ops,
            role: 'Operations Analyst',
            type: 'internal',
            count: 4,
            hourlyRateEur: 75,
          },
          {
            id: p_data,
            role: 'Data Engineer',
            type: 'internal',
            count: 3,
            hourlyRateEur: 95,
          },
          {
            id: p_analyst,
            role: 'Reliability Analyst',
            type: 'internal',
            count: 3,
            hourlyRateEur: 100,
          },
        ],
        notes:
          'Fleet of 12 surface vessels. ~450 maintenance events/year. Sensor data from 200+ IoT sensors per vessel. Manual scheduling causes 18% unplanned downtime.',
      },
      b2: {
        axes: {
          axis1_InfoClassification: {
            status: 'amber',
            findings:
              'Operational data classified DR (Diffusion Restreinte). Sensor data non-classified.',
            implications:
              'Sensor data can be processed in Atexis cloud. Mission/operational data on-premise only.',
            normativeFramework: 'IGI 1300, French DR classification',
          },
          axis2_ProcessSovereignty: {
            status: 'green',
            findings:
              'Atexis owns the maintenance scheduling process. Client approves maintenance orders.',
            implications:
              'AI scheduling recommendations fully within Atexis control. Client validates and approves.',
          },
          axis3_ToolSovereignty: {
            status: 'green',
            findings:
              'CMMS (Maximo) managed by Atexis. Sensor platform (OSIsoft PI) under Atexis licence.',
            implications:
              'Full API access to CMMS and sensor data. AI can integrate natively.',
          },
          axis4_DataSovereignty: {
            status: 'green',
            findings:
              '3 years of sensor telemetry and maintenance history owned by Atexis. 200+ sensors × 12 vessels.',
            implications:
              'Rich, labelled dataset ready for ML training. No data sharing restrictions.',
          },
          axis5_Infrastructure: {
            status: 'green',
            findings:
              'Atexis cloud (Azure France) with naval data residency guarantee. GPU instances available.',
            implications:
              'Full cloud ML pipeline feasible. Data residency in France satisfies DR requirements for sensor data.',
            infrastructureMode: 'atexis_cloud',
          },
        },
      },
      b3: {
        annualRepetitions: 52,
        activities: [
          {
            ...act(
              0,
              'Sensor Data Collection & Validation',
              ['OSIsoft PI', 'Python', 'SCADA'],
              ['Raw telemetry streams', 'Maintenance history'],
              ['Cleaned sensor dataset', 'Anomaly flags'],
              6,
              false,
              'Automated but requires manual validation of anomalous readings',
            ),
            profileHours: [
              { profileId: p_data, role: 'Data Engineer', hours: 4 },
              { profileId: p_ops, role: 'Operations Analyst', hours: 2 },
            ],
          },
          {
            ...act(
              1,
              'Failure Mode Analysis',
              ['Excel', 'Reliability Workbench', 'PowerBI'],
              ['Sensor data', 'Historical failures', 'FMEA documents'],
              ['Failure probability scores', 'Component risk ranking'],
              12,
              true,
              'Entirely manual. Engineer experience-dependent. High variability between analysts.',
            ),
            profileHours: [
              { profileId: p_analyst, role: 'Reliability Analyst', hours: 10 },
              { profileId: p_maint, role: 'Maintenance Engineer', hours: 2 },
            ],
          },
          {
            ...act(
              2,
              'Maintenance Schedule Generation',
              ['Maximo CMMS', 'Excel', 'Word'],
              [
                'Risk ranking',
                'Resource availability',
                'Vessel availability windows',
              ],
              ['Maintenance plan', 'Work orders'],
              8,
              false,
              'Largely manual. Optimisation is ad-hoc and experience-based.',
            ),
            profileHours: [
              { profileId: p_ops, role: 'Operations Analyst', hours: 6 },
              { profileId: p_maint, role: 'Maintenance Engineer', hours: 2 },
            ],
          },
          {
            ...act(
              3,
              'Work Order Execution & Tracking',
              ['Maximo CMMS', 'Mobile tablets'],
              ['Work orders', 'Parts availability'],
              ['Completed work orders', 'Parts consumed log'],
              16,
              false,
              '',
            ),
            profileHours: [
              { profileId: p_maint, role: 'Maintenance Engineer', hours: 16 },
            ],
          },
          {
            ...act(
              4,
              'Post-Maintenance Report & KPI Update',
              ['Word', 'PowerBI', 'Excel'],
              ['Completed work orders', 'Sensor validation post-maintenance'],
              ['Maintenance report', 'KPI dashboard update'],
              4,
              false,
              'KPI update is manual — should be automated',
            ),
            profileHours: [
              { profileId: p_ops, role: 'Operations Analyst', hours: 3 },
              { profileId: p_analyst, role: 'Reliability Analyst', hours: 1 },
            ],
          },
        ],
        notes:
          'Full weekly cycle: ~46h. Failure Mode Analysis is the critical bottleneck. Unplanned events add ~18h average emergency response.',
      },
    });

    const a2p1_uc1 = await UseCase.create({
      auditId: audit2._id,
      processId: a2p1._id,
      cuId: cuid(1),
      description:
        'ML anomaly detection on real-time sensor streams — detect early failure signatures (vibration, temperature, pressure) 2–4 weeks before failure using LSTM/Isolation Forest models',
      aiTypes: ['prediction', 'classification_ml'],
      targetActivities: [
        (a2p1.b3!.activities[0] as any).id,
        (a2p1.b3!.activities[1] as any).id,
      ],
      requiresClientIT: false,
      timeSavedPerProfile: [
        {
          profileId: p_analyst,
          role: 'Reliability Analyst',
          hoursPerExecution: 6,
        },
        { profileId: p_ops, role: 'Operations Analyst', hoursPerExecution: 2 },
        {
          profileId: p_maint,
          role: 'Maintenance Engineer',
          hoursPerExecution: 2,
        },
      ],
      estimatedDevCostEur: 95000,
      devCostExplanation:
        'LSTM + Isolation Forest model training on 3yr telemetry, Azure ML pipeline, OSIsoft PI integration, real-time dashboard',
      estimatedImplWeeks: 20,
      status: 'eligible',
      notes:
        'All 5 B2 axes green — ideal sovereignty profile. Rich labelled dataset available. Technology proven in similar naval contexts.',
      score: score(
        5,
        5,
        4,
        5,
        5,
        4,
        'Strong quick win candidate. Excellent data readiness + full sovereignty. 18% unplanned downtime reduction is the key KPI.',
        carlos._id.toString(),
      ),
    });

    const a2p1_uc2 = await UseCase.create({
      auditId: audit2._id,
      processId: a2p1._id,
      cuId: cuid(2),
      description:
        'AI-optimised maintenance scheduling — constraint-based optimisation (vessel availability, parts stock, crew) combined with ML failure predictions to generate optimal maintenance windows',
      aiTypes: ['intelligent_automation', 'prediction'],
      targetActivities: [(a2p1.b3!.activities[2] as any).id],
      requiresClientIT: false,
      timeSavedPerProfile: [
        { profileId: p_ops, role: 'Operations Analyst', hoursPerExecution: 5 },
        {
          profileId: p_maint,
          role: 'Maintenance Engineer',
          hoursPerExecution: 1,
        },
      ],
      estimatedDevCostEur: 75000,
      devCostExplanation:
        'Constraint optimisation engine (Google OR-Tools), Maximo CMMS integration, scheduling UI, crew & parts API connectors',
      estimatedImplWeeks: 24,
      status: 'eligible',
      notes:
        'Depends on CU-01 anomaly detection as upstream input. Implement after CU-01 POC validates predictions.',
      score: score(
        3,
        3,
        3,
        4,
        5,
        4,
        'Mid-term. Sequenced after CU-01. Optimisation technology proven but integration complexity is high.',
        carlos._id.toString(),
      ),
    });

    const a2p1_uc3 = await UseCase.create({
      auditId: audit2._id,
      processId: a2p1._id,
      cuId: cuid(3),
      description:
        'Automated KPI dashboard update and maintenance report generation from structured CMMS data',
      aiTypes: ['intelligent_automation', 'generative_llm'],
      targetActivities: [(a2p1.b3!.activities[4] as any).id],
      requiresClientIT: false,
      timeSavedPerProfile: [
        {
          profileId: p_ops,
          role: 'Operations Analyst',
          hoursPerExecution: 2.5,
        },
        {
          profileId: p_analyst,
          role: 'Reliability Analyst',
          hoursPerExecution: 0.5,
        },
      ],
      estimatedDevCostEur: 18000,
      devCostExplanation:
        'PowerBI auto-refresh connector, LLM narrative generation from structured KPI data, Word report template engine',
      estimatedImplWeeks: 6,
      status: 'eligible',
      notes: 'Low complexity, high frequency (52×/yr). Fast payback.',
      score: score(
        2,
        2,
        5,
        5,
        5,
        5,
        'Quick win. Low dev cost, technology standard, no sovereignty concerns, autonomous Atexis decision.',
        carlos._id.toString(),
      ),
    });

    // ── A2 PROC-02 · Incident Technical Report Generation ────────────────
    const p3_maint = uuidv4();
    const p3_writer = uuidv4();

    const a2p2 = await Process.create({
      auditId: audit2._id,
      procId: pid(2),
      name: 'Incident Technical Report Generation',
      department: 'Quality & Safety',
      responsible: 'Hélène Rousseau',
      sector: 'naval',
      applicableNorms: ['MIL-STD-882E', 'Naval safety regulations'],
      activeCertifications: [],
      digitalMaturityLevel: 2,
      priority: 'medium',
      status: 'in_audit',
      b1: {
        contractReference: 'ATX-2025-NG-QA-002',
        captureDate: new Date('2025-02-15'),
        numberOfPeople: 10,
        stakeholders: [
          {
            role: 'Quality Director',
            name: 'Hélène Rousseau',
            type: 'client',
            influenceLevel: 'very_high',
            aiAttitude: 'supporter',
            notes:
              'Under pressure to reduce report turnaround from 5 days to 2 days',
          },
          {
            role: 'Technical Writer',
            name: 'Paul Girard',
            type: 'internal',
            influenceLevel: 'medium',
            aiAttitude: 'champion',
            notes: 'Reports are highly templated — strong automation candidate',
          },
        ],
        profiles: [
          {
            id: p3_maint,
            role: 'Maintenance Engineer',
            type: 'client',
            count: 6,
            hourlyRateEur: 80,
          },
          {
            id: p3_writer,
            role: 'Technical Writer',
            type: 'internal',
            count: 4,
            hourlyRateEur: 65,
          },
        ],
        notes:
          '~120 incident reports/year. Average 18h per report. Report structure is 70% templated. Main issue: narrative writing from structured incident data.',
      },
      b2: {
        axes: {
          axis1_InfoClassification: {
            status: 'amber',
            findings:
              'Incident data is DR for operational incidents, non-classified for equipment failures.',
            implications:
              'Equipment incident reports can use cloud LLM. Operational incidents require on-premise.',
          },
          axis2_ProcessSovereignty: {
            status: 'green',
            findings: 'Atexis owns report generation process end-to-end.',
            implications:
              'AI can be deployed freely. Client reviews and signs final report.',
          },
          axis3_ToolSovereignty: {
            status: 'green',
            findings:
              'All authoring tools (Word, SharePoint) under Atexis control.',
            implications: 'No licensing barriers to AI integration.',
          },
          axis4_DataSovereignty: {
            status: 'green',
            findings:
              'Incident data structured in Atexis CMMS. Historical reports available.',
            implications:
              'LLM can be fine-tuned on historical reports. Good training corpus (500+ reports).',
          },
          axis5_Infrastructure: {
            status: 'green',
            findings: 'Atexis cloud (Azure France). Secure tenant for DR data.',
            implications:
              'Cloud LLM for non-classified. On-premise fallback for DR incidents.',
            infrastructureMode: 'atexis_cloud',
          },
        },
      },
      b3: {
        annualRepetitions: 120,
        activities: [
          {
            ...act(
              0,
              'Incident Data Collection',
              ['Maximo CMMS', 'SharePoint forms', 'Photos'],
              ['Incident declaration', 'Sensor logs', 'Witness statements'],
              ['Structured incident record'],
              3,
              false,
              '',
            ),
            profileHours: [
              { profileId: p3_maint, role: 'Maintenance Engineer', hours: 3 },
            ],
          },
          {
            ...act(
              1,
              'Root Cause Analysis',
              ['Fishbone diagrams', 'Fault tree', 'Excel'],
              ['Incident record', 'Maintenance history', 'Technical manuals'],
              ['Root cause statement', 'Contributing factors list'],
              8,
              true,
              'Most expertise-dependent step. Analysis quality varies significantly between engineers.',
            ),
            profileHours: [
              { profileId: p3_maint, role: 'Maintenance Engineer', hours: 6 },
              { profileId: p3_writer, role: 'Technical Writer', hours: 2 },
            ],
          },
          {
            ...act(
              2,
              'Report Drafting',
              ['Word', 'SharePoint'],
              ['Root cause', 'Incident data', 'Report template'],
              ['Draft incident report'],
              6,
              false,
              '70% boilerplate. Writer spends 4h on templated sections that could be automated.',
            ),
            profileHours: [
              { profileId: p3_writer, role: 'Technical Writer', hours: 6 },
            ],
          },
          {
            ...act(
              3,
              'Review & Approval',
              ['Word', 'Email', 'SharePoint'],
              ['Draft report'],
              ['Approved report', 'Corrective action plan'],
              2,
              true,
              '',
            ),
            profileHours: [
              { profileId: p3_maint, role: 'Maintenance Engineer', hours: 1 },
              { profileId: p3_writer, role: 'Technical Writer', hours: 1 },
            ],
          },
        ],
        notes:
          'Full cycle: ~19h. Report drafting is the automation target. Turnaround SLA: 5 days (client wants 2 days).',
      },
    });

    const a2p2_uc4 = await UseCase.create({
      auditId: audit2._id,
      processId: a2p2._id,
      cuId: cuid(4),
      description:
        'LLM-assisted incident report drafting — auto-generate templated sections (executive summary, chronology, recommendations) from structured CMMS incident data',
      aiTypes: ['generative_llm', 'intelligent_automation'],
      targetActivities: [(a2p2.b3!.activities[2] as any).id],
      requiresClientIT: false,
      timeSavedPerProfile: [
        {
          profileId: p3_writer,
          role: 'Technical Writer',
          hoursPerExecution: 4,
        },
      ],
      estimatedDevCostEur: 22000,
      devCostExplanation:
        'Azure OpenAI (GPT-4o) with structured data prompt engineering, Word template engine, SharePoint integration, review UI',
      estimatedImplWeeks: 8,
      status: 'eligible',
      notes:
        'Very high frequency (120×/yr). Technology mature. Client SLA pressure makes this urgent.',
      score: score(
        3,
        3,
        5,
        4,
        4,
        5,
        'Quick win. Market standard technology, structured input reduces hallucination risk. Autonomous Atexis decision.',
        carlos._id.toString(),
      ),
    });

    const a2p2_uc5 = await UseCase.create({
      auditId: audit2._id,
      processId: a2p2._id,
      cuId: cuid(5),
      description:
        'NLP-assisted root cause analysis — extract contributing factors from incident records and suggest fault tree branches using historical incident pattern matching',
      aiTypes: ['extraction_nlp', 'rag'],
      targetActivities: [(a2p2.b3!.activities[1] as any).id],
      requiresClientIT: false,
      timeSavedPerProfile: [
        {
          profileId: p3_maint,
          role: 'Maintenance Engineer',
          hoursPerExecution: 3,
        },
      ],
      estimatedDevCostEur: 55000,
      devCostExplanation:
        'RAG over 500+ historical reports, NLP entity extraction pipeline, fault tree suggestion UI, validation by senior engineers',
      estimatedImplWeeks: 18,
      status: 'eligible',
      notes:
        'High value for quality consistency across engineer experience levels.',
      score: score(
        2,
        4,
        3,
        4,
        4,
        4,
        'Mid-term. Good data availability. NLP extraction for technical domains requires domain fine-tuning.',
        carlos._id.toString(),
      ),
    });

    // ════════════════════════════════════════════════════════════════════════
    // POCs
    // ════════════════════════════════════════════════════════════════════════

    // POC-01 — A1P1 CU-01 · STE Checker · In Execution
    await POC.create({
      auditId: audit1._id,
      useCaseId: a1p1_uc1._id,
      processId: a1p1._id,
      pocId: pocid(1),
      phase: 'execution',
      design: {
        responsibleUserId: marie._id.toString(),
        measurableObjective:
          'Demonstrate NLP STE-100 checker reduces style review time by ≥35% with false positive rate <5% on a set of 50 representative DMs',
        scopeDescription:
          '50 DMs from active S1000D project. On-premise deployment on Atexis GPU server. Arbortext integration via plugin.',
        startDate: new Date('2026-02-01'),
        deadlineDate: new Date('2026-04-15'),
        requiredResources:
          'GPU server (RTX 4090), 2 senior tech writers (4h/week), QA manager (2h/week)',
        activeB2Restrictions:
          'Axis 1 (Red): No data leaves the on-premise environment. Axis 2 (Amber): Human review mandatory for all flagged sentences.',
        successCriteria: [
          {
            id: uuidv4(),
            criterion: 'Time reduction',
            description: 'Style review time per DM set',
            successThreshold:
              '≥35% reduction vs baseline (from ~10h to ≤6.5h per set)',
            actualResult: '5h 20min average (47% reduction)',
            passed: true,
          },
          {
            id: uuidv4(),
            criterion: 'False positive rate',
            description: 'Valid STE sentences incorrectly flagged',
            successThreshold: '<5%',
            actualResult: '3.1%',
            passed: true,
          },
          {
            id: uuidv4(),
            criterion: 'STE rule coverage',
            description: 'Percentage of STE-100 simplified rules implemented',
            successThreshold: '>80%',
            actualResult: null,
            passed: undefined,
          },
          {
            id: uuidv4(),
            criterion: 'User satisfaction',
            description: 'Writer satisfaction score on usability survey',
            successThreshold: '>7/10',
            actualResult: null,
            passed: undefined,
          },
        ],
      },
      execution: {
        milestones: [
          {
            id: uuidv4(),
            name: 'GPU environment configured & model baseline loaded',
            dueDate: new Date('2026-02-07'),
            status: 'done',
            notes:
              'Completed on schedule. spaCy + custom grammar rules deployed.',
          },
          {
            id: uuidv4(),
            name: 'STE rule encoding complete (80% coverage target)',
            dueDate: new Date('2026-02-21'),
            status: 'done',
            notes:
              'Delayed 3 days — passive voice rules required custom dependency parser. Resolved with spaCy 3.7.',
          },
          {
            id: uuidv4(),
            name: 'First 25 DMs tested and KPIs measured',
            dueDate: new Date('2026-03-07'),
            status: 'done',
            notes:
              'Time reduction: 47%. False positive: 3.1%. Both criteria met.',
          },
          {
            id: uuidv4(),
            name: 'Remaining 25 DMs + user satisfaction survey',
            dueDate: new Date('2026-03-28'),
            status: 'pending',
            notes: '',
          },
          {
            id: uuidv4(),
            name: 'Final evaluation report',
            dueDate: new Date('2026-04-15'),
            status: 'pending',
            notes: '',
          },
        ],
        incidents:
          'W2: STE passive voice rules required custom grammar parser beyond standard spaCy capabilities. Resolved with dependency parser customisation (+3 days).',
        planDeviations:
          'Rule encoding phase extended by 3 days. Absorbed within overall timeline.',
      },
      evaluation: {
        resultsVsCriteria: '',
        technicalLessons: '',
        organisationalLessons: '',
        actualCostEur: 0,
        estimatedProductionImpact: '',
        evaluatedBy: '',
        evaluatedAt: new Date(),
      },
      decision: {
        decision: 'pending',
        justification: '',
        nextSteps: '',
        decidedBy: '',
        decidedAt: new Date(),
      },
      createdAt: new Date('2026-01-20'),
      updatedAt: new Date(),
    });

    // POC-02 — A2P1 CU-01 · Anomaly Detection · Design phase
    await POC.create({
      auditId: audit2._id,
      useCaseId: a2p1_uc1._id,
      processId: a2p1._id,
      pocId: pocid(1),
      phase: 'design',
      design: {
        responsibleUserId: carlos._id.toString(),
        measurableObjective:
          'Validate LSTM anomaly detection on 2 vessel sensor streams with F1-score >0.85 and lead time >10 days before failure event',
        scopeDescription:
          '2 vessels (FS Mistral, FS Tramontane), vibration + temperature sensors on propulsion system (42 sensor channels). 6-month live data window.',
        startDate: new Date('2026-04-01'),
        deadlineDate: new Date('2026-07-31'),
        requiredResources:
          'Azure ML GPU instance (A100), Priya Nair (data engineer lead), OSIsoft PI historian access, 2 maintenance engineers for ground truth labelling',
        activeB2Restrictions:
          'Axis 1 (Amber): Sensor data only (no operational data). Data residency France. Azure French region mandatory.',
        successCriteria: [
          {
            id: uuidv4(),
            criterion: 'Detection F1-score',
            description: 'F1 on labelled failure events in validation set',
            successThreshold: '>0.85',
            actualResult: null,
            passed: undefined,
          },
          {
            id: uuidv4(),
            criterion: 'Lead time',
            description:
              'Average days before failure event that anomaly is flagged',
            successThreshold: '>10 days',
            actualResult: null,
            passed: undefined,
          },
          {
            id: uuidv4(),
            criterion: 'False alarm rate',
            description: 'False positive alerts per vessel per month',
            successThreshold: '<3 per vessel/month',
            actualResult: null,
            passed: undefined,
          },
          {
            id: uuidv4(),
            criterion: 'Engineer validation',
            description: 'Maintenance engineer confidence score in alerts',
            successThreshold: '>7/10',
            actualResult: null,
            passed: undefined,
          },
        ],
      },
      execution: { milestones: [], incidents: '', planDeviations: '' },
      evaluation: {
        resultsVsCriteria: '',
        technicalLessons: '',
        organisationalLessons: '',
        actualCostEur: 0,
        estimatedProductionImpact: '',
        evaluatedBy: '',
        evaluatedAt: new Date(),
      },
      decision: {
        decision: 'pending',
        justification: '',
        nextSteps: '',
        decidedBy: '',
        decidedAt: new Date(),
      },
      createdAt: new Date('2026-03-10'),
      updatedAt: new Date(),
    });

    // POC-03 — A2P2 CU-04 · Report Generation · Closed GO
    await POC.create({
      auditId: audit2._id,
      useCaseId: a2p2_uc4._id,
      processId: a2p2._id,
      pocId: pocid(2),
      phase: 'closed',
      design: {
        responsibleUserId: carlos._id.toString(),
        measurableObjective:
          'Validate LLM report drafting reduces writing time by ≥40% with quality score ≥4/5 from senior reviewers',
        scopeDescription:
          '30 equipment incident reports (non-classified). Azure OpenAI GPT-4o. Word output.',
        startDate: new Date('2025-11-01'),
        deadlineDate: new Date('2025-12-31'),
        requiredResources:
          'Azure OpenAI subscription, 2 technical writers (3h/week), 1 quality reviewer',
        activeB2Restrictions:
          'Equipment incidents only (non-DR). No operational data.',
        successCriteria: [
          {
            id: uuidv4(),
            criterion: 'Time reduction',
            description: 'Report drafting time',
            successThreshold: '≥40%',
            actualResult: '4.5h → 1.8h (60% reduction)',
            passed: true,
          },
          {
            id: uuidv4(),
            criterion: 'Quality score',
            description: 'Senior reviewer rating of generated sections',
            successThreshold: '≥4/5',
            actualResult: '4.3/5',
            passed: true,
          },
          {
            id: uuidv4(),
            criterion: 'Factual accuracy',
            description: 'Zero hallucinated technical facts',
            successThreshold: '0 hallucinations on structured input',
            actualResult: '0 hallucinations detected',
            passed: true,
          },
        ],
      },
      execution: {
        milestones: [
          {
            id: uuidv4(),
            name: 'Prompt engineering + Word template complete',
            dueDate: new Date('2025-11-15'),
            status: 'done',
            notes:
              'Structured JSON → narrative prompt works well for incident reports.',
          },
          {
            id: uuidv4(),
            name: '30 reports generated and reviewed',
            dueDate: new Date('2025-12-15'),
            status: 'done',
            notes: 'All 30 reports completed. Quality score 4.3/5.',
          },
          {
            id: uuidv4(),
            name: 'Final report & GO/NO-GO decision',
            dueDate: new Date('2025-12-31'),
            status: 'done',
            notes: 'GO decision unanimous.',
          },
        ],
        incidents: 'None.',
        planDeviations: 'Completed 2 weeks ahead of schedule.',
      },
      evaluation: {
        resultsVsCriteria:
          'All 3 success criteria met. Time reduction 60% vs 40% target. Quality 4.3/5. Zero hallucinations on structured input.',
        technicalLessons:
          'Structured JSON input is critical — free-text incident descriptions cause quality degradation. Template engine must enforce structured data upstream.',
        organisationalLessons:
          'Writers need 1-day training on prompt refinement. Senior engineer review remains mandatory for final approval (safety requirement).',
        actualCostEur: 19500,
        estimatedProductionImpact:
          '120 reports/yr × 2.7h saved × €65/h = €21,060/yr. Payback in 11 months.',
        evaluatedBy: carlos._id.toString(),
        evaluatedAt: new Date('2025-12-31'),
      },
      decision: {
        decision: 'go',
        justification:
          'All criteria met. Cost below estimate. Quality validated by senior reviewers. No hallucinations on structured input. Technology standard (GPT-4o).',
        nextSteps:
          'Production deployment Jan 2026. Rollout to all 10 technical writers. Monitor quality on DR incidents using on-premise LLM fallback.',
        decidedBy: carlos._id.toString(),
        decidedAt: new Date('2026-01-05'),
      },
      createdAt: new Date('2025-10-20'),
      updatedAt: new Date('2026-01-05'),
    });

    return NextResponse.json({
      success: true,
      message: 'Synthetic data seeded successfully',
      summary: {
        users: ['marie.dupont@atexis.com', 'carlos.vega@atexis.com'],
        password: 'atexis2025!',
        audits: [
          { name: audit1.name, processes: 2, useCases: 6 },
          { name: audit2.name, processes: 2, useCases: 5 },
        ],
        pocs: 3,
      },
    });
  } catch (err) {
    console.error('[API] Seed error:', err);
    return NextResponse.json({ error: 'Seed failed' }, { status: 500 });
  }
}
