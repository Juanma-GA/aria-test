import { z } from 'zod';

export const SECTORS = ['defence', 'aerospace', 'naval', 'railway', 'internal', 'other'] as const;
export const DEPARTMENT_TYPES = ['Technical Publications', 'Training Development', 'Training Delivery', 'ISS', 'LSA', 'Digital', 'Simulation', 'General ILS', 'Material Supply', 'Provisioning', 'Supply Chain', 'D&D Engineering', 'Other'] as const;
export const PRIORITIES = ['high', 'medium', 'low'] as const;
export const AUDIT_STATUSES = ['draft', 'active', 'review', 'completed'] as const;
export const AI_TYPES = ['generative_llm', 'extraction_nlp', 'classification_ml', 'rag', 'rag_semantic', 'rag_lexical', 'knowledge_graph', 'validation', 'prediction', 'prediction_ml', 'intelligent_automation', 'agentic_ai', 'agentic_ai_workflow', 'mcp_client', 'mcp_server', 'function_tool', 'chatbot', 'multimodal_vlm', 'other'] as const;

export const createAuditSchema = z.object({
  name: z.string().trim().min(1, 'Audit name is required'),
  client: z.string().trim().min(1, 'Client is required'),
  project: z.string().trim().optional().default(''),
  sector: z.enum(SECTORS).default('other'),
  classification: z.string().optional(),
  startDate: z.string().optional(),
  targetEndDate: z.string().optional(),
  firstProcess: z
    .object({
      name: z.string().trim().min(1),
      department: z.enum(DEPARTMENT_TYPES).optional().default('Other'),
      responsible: z.string().optional().default(''),
      applicableNorms: z.array(z.string()).optional().default([]),
      priority: z.enum(PRIORITIES).optional().default('medium'),
    })
    .nullable()
    .optional(),
  team: z
    .array(z.object({
      userId: z.string().min(1),
      role: z.enum(['owner', 'editor', 'viewer']),
    }))
    .optional()
    .default([]),
});

export const createProcessSchema = z.object({
  name: z.string().trim().min(1, 'Process name is required'),
  department: z.enum(DEPARTMENT_TYPES).optional().default('Other'),
  responsible: z.string().optional().default(''),
  sector: z.string().optional().default(''),
  applicableNorms: z.array(z.string()).optional().default([]),
  activeCertifications: z.array(z.string()).optional().default([]),
  priority: z.enum(PRIORITIES).optional().default('medium'),
  status: z.enum(['pending', 'in_audit', 'completed', 'paused']).optional().default('pending'),
});

export const createUseCaseSchema = z.object({
  processId: z.string().min(1, 'processId is required'),
  description: z.string().trim().min(1, 'description is required'),
  aiTypes: z.array(z.enum(AI_TYPES)).optional(),
  aiType: z.string().optional(),
  targetActivities: z.array(z.string()).optional(),
  targetActivity: z.string().optional(),
  b2Compatible: z.enum(['yes', 'no', 'partial']).optional().default('yes'),
  requiresClientIT: z.boolean().optional(),
  timeSavedPerProfile: z.array(z.any()).optional(),
  estimatedDevCostEur: z.number().nonnegative().optional(),
  devCostExplanation: z.string().optional(),
  requiredPreconditions: z.object({
    requiresClientIT: z.boolean().optional(),
    text: z.string().optional(),
  }).optional(),
  estimatedImplWeeks: z.number().nonnegative().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
  score: z.any().optional(),
});

export const INDUSTRIALIZATION_STATUSES = [
  'pending_customer_validation',
  'planned',
  'work_in_progress',
  'go_for_run',
  'stand_by',
  'cancelled',
] as const;

export const createIndustrializationSchema = z.object({
  pocId: z.string().min(1, 'pocId is required'),
  name: z.string().optional(),
  status: z.enum(INDUSTRIALIZATION_STATUSES).optional().default('planned'),
  statusReason: z.string().optional(),
  plan: z
    .object({
      ownerBusiness: z.string().optional(),
      ownerTechnical: z.string().optional(),
      startDate: z.string().optional(),
      targetGoLiveDate: z.string().optional(),
      scope: z.string().optional(),
      dependencies: z.string().optional(),
      sovereigntyConstraints: z.string().optional(),
    })
    .optional(),
});

export type CreateAuditInput = z.infer<typeof createAuditSchema>;
export type CreateProcessInput = z.infer<typeof createProcessSchema>;
export type CreateUseCaseInput = z.infer<typeof createUseCaseSchema>;
export type CreateIndustrializationInput = z.infer<typeof createIndustrializationSchema>;

export function validationErrorResponse(error: z.ZodError) {
  return {
    error: 'Validation failed',
    issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  };
}
