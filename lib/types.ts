// ── ARIA TYPE DEFINITIONS ────────────────────────────────────────────────────

// ── USER ──────────────────────────────────────────────────────────────────────
export interface User {
  _id: string;
  email: string;
  name: string;
  role: 'admin' | 'consultant' | 'viewer';
  createdAt: Date;
}

// ── AUDIT ──────────────────────────────────────────────────────────────────────
export type SectorType = 'defence' | 'aerospace' | 'naval' | 'railway' | 'internal' | 'other';
export type ClassificationType = 'internal' | 'confidential' | 'reserved' | 'secret';
export type AuditStatus = 'draft' | 'active' | 'review' | 'completed';

export interface Audit {
  _id: string;
  name: string;
  client: string;
  project?: string;
  sector: SectorType;
  leadConsultant: string;
  collaborators: string[];
  status: AuditStatus;
  classification: ClassificationType;
  startDate: Date;
  targetEndDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ── PROCESS ────────────────────────────────────────────────────────────────────
export type ProcessStatus = 'pending' | 'in_audit' | 'completed' | 'paused';
export type Priority = 'high' | 'medium' | 'low';
export type DigitalMaturity = 1 | 2 | 3 | 4 | 5;

export interface Process {
  _id: string;
  auditId: string;
  procId: string;
  name: string;
  department: string;
  responsible: string;
  sector: SectorType;
  applicableNorms: string[];
  activeCertifications: string[];
  digitalMaturityLevel: DigitalMaturity;
  priority: Priority;
  status: ProcessStatus;
  createdAt: Date;
}

// ── B1 CONTEXT ─────────────────────────────────────────────────────────────────
export type InfluenceLevel = 'very_high' | 'high' | 'medium' | 'low';
export type AIAttitude = 'champion' | 'supporter' | 'neutral' | 'sceptic' | 'blocker' | 'unknown';

export interface Stakeholder {
  role: string;
  name: string;
  type: 'internal' | 'client';
  influenceLevel: InfluenceLevel;
  aiAttitude: AIAttitude;
  notes: string;
}

export interface ProfileEntry {
  id: string;
  role: string;
  type: 'internal' | 'client';
  count: number;
  hourlyRateEur: number;
}

export interface B1_Context {
  processId: string;
  formalName: string;
  department: string;
  contractReference: string;
  captureDate: Date;
  numberOfPeople: number;
  stakeholders: Stakeholder[];
  profiles: ProfileEntry[];
  notes: string;
  clientDepartment?: string;
  clientResponsible?: string;
  technicalDirectorResponsible?: string;
}

// ── B2 SOVEREIGNTY ─────────────────────────────────────────────────────────────
export type SovereigntyStatus = 'green' | 'amber' | 'red';
export type SovereigntyLevel = 'full_autonomy' | 'managed' | 'conditioned' | 'restricted' | 'critical';
export type InfraMode = 'client_onsite' | 'client_onpremise' | 'client_cloud' | 'atexis_onpremise' | 'atexis_cloud' | 'hybrid';

export interface SovereigntyAxis {
  status: SovereigntyStatus;
  findings: string;
  implications: string;
  normativeFrameworks?: string[];
  infrastructureMode?: InfraMode;
}

export interface B2_Sovereignty {
  processId: string;
  axes: {
    axis1_InfoClassification: SovereigntyAxis;
    axis2_ProcessSovereignty: SovereigntyAxis;
    axis3_ToolSovereignty: SovereigntyAxis;
    axis4_DataSovereignty: SovereigntyAxis;
    axis5_Infrastructure: SovereigntyAxis;
  };
}

// ── B3 PROCESS MAP ─────────────────────────────────────────────────────────────
export interface ProfileHours {
  profileId: string;
  role: string;
  hours: number;
}

export interface FileAttachment {
  id: string;
  name: string;
  url?: string;
}

export interface ProcessTask {
  id: string;
  description: string;
}

export interface ProcessActivity {
  id: string;
  order: number;
  name: string;
  tools: string[];
  inputs: string[];
  outputs: string[];
  inputFiles: FileAttachment[];
  outputFiles: FileAttachment[];
  responsibleProfile: string;
  profileHours: ProfileHours[];
  estimatedTimeHours: number;
  annualRepetitions: number;
  stepRepetitions: number;
  isDecisionPoint: boolean;
  linkedUseCaseIds: string[];
  notes: string;
  tasks: ProcessTask[];
}

export interface B3_ProcessMap {
  processId: string;
  activities: ProcessActivity[];
  notes: string;
}

// ── B4 FRICTION (deprecated UI, kept for data) ─────────────────────────────────
export type FrictionType = 'time' | 'quality' | 'knowledge' | 'integration' | 'scale';
export type ImpactScore = 1 | 2 | 3 | 4 | 5;

export interface PainPoint {
  id: string;
  description: string;
  frictionType: FrictionType;
  processStage: string;
  currentMetric: string;
  estimatedImpact: ImpactScore;
  rootCause: string;
  notes: string;
}

export interface BaseMetrics {
  avgOutputTimeHours: number;
  reworkRatePercent: number;
  avgReviewCycles: number;
  hourlyRateEur: number;
  queueWasteHoursPerWeek: number;
  contentReusePercent: number;
  metricNotes: string;
}

export interface B4_Friction {
  processId: string;
  painPoints: PainPoint[];
  baseMetrics: BaseMetrics;
}

// ── B5 USE CASES ───────────────────────────────────────────────────────────────
export type AIType = 'generative_llm' | 'extraction_nlp' | 'classification_ml' | 'rag' | 'validation' | 'prediction' | 'intelligent_automation' | 'agentic_ai' | 'other';
export type UseCaseStatus = 'eligible' | 'blocked' | 'pending_review';
export type B2CompatibilityType = 'yes' | 'no' | 'partial';

export interface TimeSavedEntry {
  profileId: string;
  role: string;
  hoursPerExecution: number;
}

export interface UseCase {
  _id: string;
  auditId: string;
  processId: string;
  cuId: string;
  description: string;
  aiTypes: AIType[];
  targetActivities: string[];
  b2Compatible: B2CompatibilityType;
  requiresClientIT: boolean;
  timeSavedPerProfile: TimeSavedEntry[];
  estimatedDevCostEur: number;
  devCostExplanation: string;
  estimatedImplWeeks: number;
  status: UseCaseStatus;
  blockedReason?: string;
  blockedAxis?: string;
  unblockCondition?: string;
  reviewDate?: Date;
  notes: string;
  sovereigntyAnalysis?: string;
  computeCost?: any;
  createdAt: Date;
  // B6 score embedded in the use case document
  score?: {
    dimensions: {
      d1_efficiencyImpact: DimensionScore & { autoFilled?: boolean };
      d2_qualityImpact: DimensionScore & { autoFilled?: boolean };
      d3_techMaturity: DimensionScore & { autoFilled?: boolean };
      d4_dataReadiness: DimensionScore & { autoFilled?: boolean };
      d5_sovereigntyIndex: DimensionScore & { autoFilled?: boolean };
      d6_governanceComplexity: DimensionScore & { autoFilled?: boolean };
    };
    scoringNotes: string;
    scoredBy: string;
    scoredAt: Date;
  };
}

// ── B6 SCORING ─────────────────────────────────────────────────────────────────
export type ScoreValue = 1 | 2 | 3 | 4 | 5;
export type ScoreCategory = 'quick_win' | 'mid_term' | 'strategic';

export interface DimensionScore {
  value: ScoreValue;
  justification: string;
}

export interface B6_Score {
  useCaseId: string;
  dimensions: {
    d1_efficiencyImpact: DimensionScore;
    d2_qualityImpact: DimensionScore;
    d3_techMaturity: DimensionScore;
    d4_dataReadiness: DimensionScore;
    d5_sovereigntyIndex: DimensionScore;
    d6_governanceComplexity: DimensionScore;
  };
  scoringNotes: string;
  scoredBy: string;
  scoredAt: Date;
}

// ── B7 ROADMAP ─────────────────────────────────────────────────────────────────
export type NextStepStatus = 'pending' | 'in_progress' | 'done' | 'blocked';

export interface PocActualData {
  actualTimeSavingHours: number;
  actualCostEur: number;
  pocLessons: string;
}

export interface RoadmapInitiative {
  _id: string;
  useCaseId: string;
  processId: string;
  description: string;
  annualTimeSavingHours: number;
  errorReductionPercent: number;
  estimatedInvestmentEur: number;
  roiBreakevenMonths: number;
  successKpi: string;
  prerequisite: string;
  owner: string;
  targetDate: Date;
  pocActualData?: PocActualData;
}

export interface NextStep {
  _id: string;
  action: string;
  responsible: string;
  deadline: Date;
  status: NextStepStatus;
}

export interface B7_Roadmap {
  auditId: string;
  horizons: {
    h1_quickWins: RoadmapInitiative[];
    h2_midTerm: RoadmapInitiative[];
    h3_strategic: RoadmapInitiative[];
  };
  nextSteps: NextStep[];
}

// ── B8 POC ─────────────────────────────────────────────────────────────────────
export type POCPhase = 'design' | 'execution' | 'evaluation' | 'closed';
export type POCDecisionType = 'go' | 'go_conditional' | 'no_go_redesign' | 'no_go_discard' | 'paused' | 'pending';

export interface POCCriterion {
  id: string;
  criterion: string;
  description: string;
  successThreshold: string;
  actualResult?: string;
  passed?: boolean;
}

export interface POC_Design {
  responsibleUserId: string;
  measurableObjective: string;
  scopeDescription: string;
  startDate: Date;
  deadlineDate: Date;
  requiredResources: string;
  activeB2Restrictions: string;
  estimatedDevCostEur?: number;
  successCriteria: POCCriterion[];
}

export interface POCMilestone {
  id: string;
  name: string;
  dueDate: Date;
  status: 'pending' | 'done' | 'missed';
  notes: string;
}

export interface POC_Execution {
  milestones: POCMilestone[];
  incidents: string;
  planDeviations: string;
  pauseReason?: string;
  pausedAt?: Date;
}

export interface POC_Evaluation {
  resultsVsCriteria: string;
  technicalLessons: string;
  organisationalLessons: string;
  actualCostEur: number;
  estimatedProductionImpact: string;
  evaluatedBy: string;
  evaluatedAt: Date;
}

export interface POC_Decision {
  decision: POCDecisionType;
  justification: string;
  conditionalRequirement?: string;
  nextSteps: string;
  decidedBy: string;
  decidedAt: Date;
}

export interface POC {
  _id: string;
  auditId: string;
  useCaseId: string;
  processId: string;
  pocId: string;
  name?: string;
  phase: POCPhase;
  design: POC_Design;
  execution: POC_Execution;
  evaluation: POC_Evaluation;
  decision: POC_Decision;
  computeCost?: any;
  createdAt: Date;
  updatedAt: Date;
}

// ── DERIVED / COMPUTED ─────────────────────────────────────────────────────────
export interface SovereigntyIndexResult {
  index: number;
  hasCritical: boolean;
  level: SovereigntyLevel;
}

export interface ScoreResult {
  total: number;
  category: ScoreCategory;
}

export interface BlockCompletion {
  b1: boolean;
  b2: boolean;
  b3: boolean;
  b4: boolean;
  b5: boolean;
  b6: boolean;
  b7: boolean;
}

// ── ROI COMPUTATION ────────────────────────────────────────────────────────────
export interface ROIResult {
  annualSavingEur: number;
  roiPercent: number;
  breakEvenMonths: number;
}

// ── SCORING RUBRIC ──────────────────────────────────────────────────────────────
export const SCORING_RUBRIC = {
  d1: {
    label: 'Efficiency Impact',
    descriptions: { 1: '<10% saving', 2: '10–20%', 3: '20–35%', 4: '35–50%', 5: '>50%' },
  },
  d2: {
    label: 'Quality Impact',
    descriptions: {
      1: 'Marginal',
      2: 'Reduces isolated errors',
      3: 'Reduces rework significantly',
      4: 'Eliminates error categories',
      5: 'Full consistency guaranteed',
    },
  },
  d3: {
    label: 'Tech Maturity',
    descriptions: {
      1: 'Experimental (R&D)',
      2: 'Prototype (demos)',
      3: 'Pilot (limited deployments)',
      4: 'Mature (proven in industry)',
      5: 'Market standard',
    },
  },
  d4: {
    label: 'Data Readiness',
    descriptions: {
      1: "Data doesn't exist",
      2: 'Exists but unstructured',
      3: 'Available with effort',
      4: 'Structured and accessible',
      5: 'Structured, clean, voluminous',
    },
  },
  d5: {
    label: 'Sovereignty Index',
    descriptions: { 1: 'Critical', 2: 'Restricted', 3: 'Conditioned', 4: 'Managed', 5: 'Full autonomy (derived from B2)' },
  },
  d6: {
    label: 'Governance Complexity',
    descriptions: { 1: 'Blocked (legal/compliance)', 2: 'High complexity (multiple approvals)', 3: 'Moderate (standard process)', 4: 'Low complexity (clear ownership)', 5: 'No governance barriers' },
  },
} as const;

export const AI_TYPE_LABELS: Record<AIType, { label: string; description: string }> = {
  generative_llm: { label: 'Generative (LLM)', description: 'Content drafting, summarisation, transformation' },
  extraction_nlp: { label: 'Extraction (NLP)', description: 'Entity extraction, structured data from unstructured text' },
  classification_ml: { label: 'Classification (ML)', description: 'Automatic categorisation and tagging' },
  rag: { label: 'RAG', description: 'Semantic search + contextualised generation over a knowledge base' },
  validation: { label: 'Validation', description: 'Rule + AI-based compliance checking (schema, style, applicability)' },
  prediction: { label: 'Prediction (ML)', description: 'Anticipating behaviours or needs from historical data' },
  intelligent_automation: { label: 'Intelligent Automation', description: 'AI-driven workflow and process automation' },
  agentic_ai: { label: 'Agentic AI', description: 'Autonomous multi-step AI agents with planning and tool use' },
  other: { label: 'Other', description: 'Specify in notes' },
};
