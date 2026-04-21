import { z } from 'zod';

export const SECTORS = ['defence', 'aerospace', 'naval', 'railway', 'internal', 'other'] as const;
export const PRIORITIES = ['high', 'medium', 'low'] as const;
export const AUDIT_STATUSES = ['draft', 'active', 'review', 'completed'] as const;

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
      department: z.string().optional().default(''),
      responsible: z.string().optional().default(''),
      applicableNorms: z.array(z.string()).optional().default([]),
      priority: z.enum(PRIORITIES).optional().default('medium'),
    })
    .nullable()
    .optional(),
});

export const createProcessSchema = z.object({
  name: z.string().trim().min(1, 'Process name is required'),
  department: z.string().optional().default(''),
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
  aiTypes: z.array(z.string()).optional(),
  aiType: z.string().optional(),
  targetActivities: z.array(z.string()).optional(),
  targetActivity: z.string().optional(),
  b2Compatible: z.enum(['yes', 'no', 'partial']).optional().default('yes'),
  requiresClientIT: z.boolean().optional(),
  timeSavedPerProfile: z.array(z.any()).optional(),
  estimatedDevCostEur: z.number().nonnegative().optional(),
  devCostExplanation: z.string().optional(),
  estimatedImplWeeks: z.number().nonnegative().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
  score: z.any().optional(),
});

export type CreateAuditInput = z.infer<typeof createAuditSchema>;
export type CreateProcessInput = z.infer<typeof createProcessSchema>;
export type CreateUseCaseInput = z.infer<typeof createUseCaseSchema>;

export function validationErrorResponse(error: z.ZodError) {
  return {
    error: 'Validation failed',
    issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  };
}
