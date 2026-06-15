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

// ── B5 USE CASES ───────────────────────────────────────────────────────────────
export type AIType = 'generative_llm' | 'extraction_nlp' | 'classification_ml' | 'rag_semantic' | 'rag_lexical' | 'knowledge_graph' | 'validation' | 'prediction_ml' | 'intelligent_automation' | 'agentic_ai_workflow' | 'mcp_client' | 'mcp_server' | 'function_tool' | 'chatbot' | 'multimodal_vlm' | 'other';
export type UseCaseStatus = 'eligible' | 'in_poc' | 'discarded';
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
  procId?: string;
  cuId: string;
  description: string;
  aiTypes: AIType[];
  targetActivities: string[];
  b2Compatible: B2CompatibilityType;
  requiresClientIT: boolean;
  timeSavedPerProfile: TimeSavedEntry[];
  estimatedDevCostEur: number;
  devCostExplanation: string;
  devRateEur?: number;
  nDevs?: number;
  requiredPreconditions?: {
    requiresClientIT?: boolean;
    text?: string;
  };
  estimatedImplWeeks: number;
  status: UseCaseStatus;
  reviewDate?: Date;
  notes: string;
  sovereigntyAnalysis?: string;
  computeBreakdown?: ComputeBreakdown & { computedAnnualEur?: number };
  isArchived?: boolean;
  archivedAt?: Date;
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
  parentUCId?: string;
  isInstance?: boolean;
  additionalDevCostEur?: number;
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
export type POCPhase = 'design' | 'execution' | 'evaluation' | 'decision' | 'closed';
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
  estimatedImplWeeks?: number;
  nDevs?: number;
  devRateEur?: number;
  successCriteria: POCCriterion[];
}

export interface POCMilestone {
  id: string;
  name: string;
  dueDate: Date;
  status: 'pending' | 'work_in_progress' | 'done' | 'missed';
  progressPct: number;
  effortHours: number;
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
  useCaseId?: string;
  useCaseIds: string[];
  processId: string;
  pocId: string;
  name?: string;
  phase: POCPhase;
  design: POC_Design;
  execution: POC_Execution;
  evaluation: POC_Evaluation;
  decision: POC_Decision;
  computeBreakdown?: ComputeBreakdown & { computedAnnualEur?: number };
  mockups?: Array<{
    _id?: string;
    name: string;
    filename: string;
    html: string;
    uploadedAt: Date;
  }>;
  isArchived?: boolean;
  archivedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ── ADMIN MODEL & HARDWARE CATALOG ─────────────────────────────────────────────
export type CatalogKind = 'ai_model' | 'gpu';
export type AIModelDeploymentMode = 'cloud_api' | 'on_premise' | 'hybrid';

export interface CatalogEntry {
  _id: string;
  kind: CatalogKind;
  name: string;
  isActive: boolean;
  notes?: string;
  // ai_model
  vendor?: string;
  contextWindow?: number;
  pricePerMInputTokens?: number;
  pricePerMOutputTokens?: number;
  deploymentMode?: AIModelDeploymentMode;
  paramCountB?: number;
  // gpu
  tdpW?: number;
  vramGb?: number;
  priceEur?: number;
  /** Concurrent-user serving capacity for this GPU when paired with a
   *  representative model (from vendor benchmarks or measured). Used by the
   *  compute calculator to default `maxConcurrentUsersSupported`. */
  concurrentUsersPerGpu?: number;
  // AI refresh provenance
  aiUpdatedAt?: Date;
  aiRationale?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Persistent state of the compute calculator on an industrialization.
 *  Empty mode means the calculator is dormant — `computeEur` becomes a free
 *  manual entry again until the user picks a mode. */
export interface ComputeBreakdown {
  mode?: AIModelDeploymentMode | '';
  // AI model snapshot
  modelId?: string;
  modelNameSnapshot?: string;
  modelPriceInSnapshot?: number;
  modelPriceOutSnapshot?: number;
  // GPU snapshot (on_premise / hybrid)
  gpuId?: string;
  gpuNameSnapshot?: string;
  gpuPriceSnapshot?: number;
  gpuTdpSnapshot?: number;
  /** Snapshot from the model catalog: how many concurrent users 1 GPU can
   *  serve when running this model at acceptable SLA. Used to size the HW
   *  capacity (`maxConcurrentUsersSupported = nGpus × this`). */
  concurrentUsersPerGpuSnapshot?: number;
  // Calculator inputs
  annualReps: number;
  annualRepsManuallyEdited?: boolean;
  inputTokensPerExec: number;
  outputTokensPerExec: number;
  nGpus: number;
  amortizationYears: number;
  electricityRateEur: number;
  /** Hybrid only: % of executions handled on-prem (0–100). */
  onPremPct: number;

  // ── Operating window (on_premise / hybrid only) ────────────────────────────
  /** Hours per working day the HW is available (e.g. 10 for a 7–17 window). */
  workingHoursPerDay?: number;
  /** Working days per week (e.g. 5 = L–V). */
  workingDaysPerWeek?: number;
  /** Working weeks per year (e.g. 48 = 52 minus holidays). */
  workingWeeksPerYear?: number;

  // ── Concurrency capacity (on_premise / hybrid only) ────────────────────────
  /** Total concurrent users this HW config supports at peak. Default
   *  derivation: `nGpus × concurrentUsersPerGpuSnapshot`. User-editable. */
  maxConcurrentUsersSupported?: number;

  // ── Case occupancy of the HW (on_premise / hybrid only) ────────────────────
  /** Concurrency expected at this case's peak hour. */
  peakConcurrentUsers?: number;
  /** % of the operating window during which the case operates near its peak
   *  (0–100). Multiplies the concurrency share to yield occupancy. */
  peakUsageFractionOfWindow?: number;
  /** When TRUE, treat the HW as already paid for and only impute the case's
   *  share of the running electricity (no CAPEX amortisation). */
  hwPreexisting?: boolean;
}

// ── ADMIN PROFILE CATALOG ──────────────────────────────────────────────────────
export interface ProfileCatalogEntry {
  _id: string;
  name: string;
  role: string;
  hourlyRateEur: number;
  isActive: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Per-cost-line breakdown: which profiles, how many hours each. Stored on
 *  Industrialization.cost.oneTime[field].profileHours (extension to scalar Eur).
 */
export interface ProfileHoursEntry {
  profileId: string;
  hours: number;
}

// ── INDUSTRIALIZATION ──────────────────────────────────────────────────────────
export type IndustrializationStatus =
  | 'pending_customer_validation'
  | 'planned'
  | 'work_in_progress'
  | 'go_for_run'
  | 'stand_by'
  | 'cancelled';

export type TriState = boolean | null;

export interface IndustrializationMilestone {
  id: string;
  name: string;
  dueDate?: Date;
  status: 'pending' | 'work_in_progress' | 'done' | 'missed';
  progressPct: number;
  effortHours: number;
  notes: string;
}

export interface IndustrializationRisk {
  id: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  mitigation: string;
}

export interface MaintenanceAssessment {
  hasCorrectiveWarranty: TriState;
  hasFunctionalRoadmap: TriState;
  hasFineTuningOrDynamicRag: TriState;
  requiresDriftMonitoring: TriState;
  isRegulatedRevalidation: TriState;
  hasInternalSupport: TriState;
  hasVendorSla: TriState;
  completedAt?: Date;
  completedBy?: string;
}

/** Per-category drivers that derive the annual maintenance EUR.
 *  When a driver block is present, it OVERRIDES the matching scalar
 *  (`correctiveEur`, `evolutiveEur`, …) on `maintenance`. When absent,
 *  the scalar acts as a free-form manual entry. */
export interface MaintenanceDrivers {
  /** Corrective = pctOfDevelopment % × one-time development EUR. */
  corrective?: { pctOfDevelopment: number };
  /** Evolutive = featuresPerYear × hoursPerFeature × hourlyRateEur. */
  evolutive?: {
    featuresPerYear: number;
    hoursPerFeature: number;
    hourlyRateEur: number;
  };
  /** Model retraining = cyclesPerYear × (hoursPerCycle × hourlyRateEur + cloudComputePerCycleEur). */
  modelRetraining?: {
    cyclesPerYear: number;
    hoursPerCycle: number;
    hourlyRateEur: number;
    cloudComputePerCycleEur: number;
  };
  /** Drift monitoring = checksPerYear × hoursPerCheck × hourlyRateEur + toolingEurPerYear. */
  driftMonitoring?: {
    checksPerYear: number;
    hoursPerCheck: number;
    hourlyRateEur: number;
    toolingEurPerYear: number;
  };
  /** Re-validation = cyclesPerYear × (hoursPerCycle × hourlyRateEur + externalAuditEurPerCycle). */
  revalidation?: {
    cyclesPerYear: number;
    hoursPerCycle: number;
    hourlyRateEur: number;
    externalAuditEurPerCycle: number;
  };
  /** L1/L2 support = ticketsPerMonth × 12 × hoursPerTicket × hourlyRateEur. */
  l1l2Support?: {
    ticketsPerMonth: number;
    hoursPerTicket: number;
    hourlyRateEur: number;
  };
  /** Vendor SLA = monthlyFeeEur × 12. */
  vendorSla?: { monthlyFeeEur: number };
}

/** Stored per profile-hour line. Snapshots freeze rate/name at entry time. */
export interface ProfileHoursLine {
  profileId?: string;
  profileNameSnapshot?: string;
  profileRateSnapshot?: number;
  hours: number;
}

export type OneTimeFieldKey =
  | 'development' | 'integration' | 'infraSetup' | 'securityCompliance' | 'trainingChangeMgmt';

export interface IndustrializationCost {
  currency: string;
  horizonYears: number;
  oneTime: {
    developmentEur: number;
    integrationEur: number;
    infraSetupEur: number;
    securityComplianceEur: number;
    trainingChangeMgmtEur: number;
    contingencyPct: number;
    profileHours?: Partial<Record<OneTimeFieldKey, ProfileHoursLine[]>>;
  };
  recurringAnnual: {
    computeEur: number;
    licensesEur: number;
    monitoringObservabilityEur: number;
    computeBreakdown?: ComputeBreakdown;
    maintenance: {
      assessment: MaintenanceAssessment;
      /** Optional structured drivers — when present for a category, they
       *  drive the EUR figure and override the scalar field below. */
      drivers?: MaintenanceDrivers;
      correctiveEur?: number;
      evolutiveEur?: number;
      modelRetrainingEur?: number;
      driftMonitoringEur?: number;
      revalidationEur?: number;
      l1l2SupportEur?: number;
      vendorSlaEur?: number;
    };
  };
  actual: {
    oneTimeEur: number;
    recurringAnnualEur: number;
    notes: string;
  };
}

export interface IndustrializationROI {
  baseline: {
    annualHoursManual: number;
    avgHourlyCostEur: number;
    annualErrorRate: number;
    qualityCostEur: number;
  };
  expected: {
    timeSavingPct: number;
    errorReductionPct: number;
    annualSavingEur: number;
    paybackMonths: number;
  };
  confirmed: {
    measuredFrom?: Date;
    measuredTo?: Date;
    annualHoursSaved: number;
    annualSavingEur: number;
    errorReductionPctMeasured: number;
    qualityCostAvoidedEur: number;
    netAnnualBenefitEur: number;
    paybackMonthsActual: number;
    notes: string;
  };
}

export interface Industrialization {
  _id: string;
  auditId: string;
  useCaseId: string;
  processId: string;
  pocId: string;
  industrializationId: string;
  name?: string;
  status: IndustrializationStatus;
  statusReason?: string;
  milestones: IndustrializationMilestone[];
  plan: {
    ownerBusiness: string;
    ownerTechnical: string;
    startDate?: Date;
    targetGoLiveDate?: Date;
    actualGoLiveDate?: Date;
    scope: string;
    dependencies: string;
    sovereigntyConstraints: string;
  };
  cost: IndustrializationCost;
  roi: IndustrializationROI;
  production: {
    monitoredKpis: string;
    incidentsLog: string;
    decommissioningPlan: string;
  };
  risks: IndustrializationRisk[];
  changeManagement: {
    trainingPlan: string;
    communicationPlan: string;
  };
  aiGeneratedFields?: string[];
  isArchived?: boolean;
  archivedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const INDUSTRIALIZATION_STATUS_LABELS: Record<IndustrializationStatus, string> = {
  pending_customer_validation: 'Pending customer validation',
  planned: 'Planned',
  work_in_progress: 'Work in progress',
  go_for_run: 'Go for run',
  stand_by: 'Stand by',
  cancelled: 'Cancelled',
};

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
  rag_semantic: { label: 'RAG Semantic', description: 'Semantic search with vector embeddings for contextualised generation' },
  rag_lexical: { label: 'RAG Lexical', description: 'Keyword-based search and contextualised generation' },
  knowledge_graph: { label: 'Knowledge Graph', description: 'Structured entity relationships and semantic reasoning' },
  validation: { label: 'Validation', description: 'Rule + AI-based compliance checking (schema, style, applicability)' },
  prediction_ml: { label: 'Prediction (ML)', description: 'Machine learning models for forecasting and trend analysis' },
  intelligent_automation: { label: 'Intelligent Automation', description: 'AI-driven workflow and process automation' },
  agentic_ai_workflow: { label: 'Agentic AI Workflow', description: 'Multi-step autonomous agents with complex reasoning and tool orchestration' },
  mcp_client: { label: 'MCP Client', description: 'Model Context Protocol client for system integration' },
  mcp_server: { label: 'MCP Server', description: 'Model Context Protocol server for tool exposure' },
  function_tool: { label: 'Function Tool', description: 'Structured API-based function calling and integration' },
  chatbot: { label: 'Chatbot', description: 'Conversational interface with dialogue management' },
  multimodal_vlm: { label: 'Multimodal VLM', description: 'Vision + Language models for image, video, and document understanding' },
  other: { label: 'Other', description: 'Specify in notes' },
};
