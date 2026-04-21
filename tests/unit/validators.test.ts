import { describe, it, expect } from 'vitest';
import { createAuditSchema, createProcessSchema, createUseCaseSchema } from '@/lib/validators';

describe('createAuditSchema (ARCH-5)', () => {
  it('rejects empty body', () => {
    const r = createAuditSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it('rejects blank name/client', () => {
    const r = createAuditSchema.safeParse({ name: '  ', client: '  ' });
    expect(r.success).toBe(false);
  });

  it('accepts minimal valid input and defaults sector/project', () => {
    const r = createAuditSchema.safeParse({ name: 'A', client: 'C' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.sector).toBe('other');
      expect(r.data.project).toBe('');
    }
  });

  it('accepts null firstProcess for UX-6', () => {
    const r = createAuditSchema.safeParse({ name: 'A', client: 'C', firstProcess: null });
    expect(r.success).toBe(true);
  });

  it('rejects firstProcess with blank name', () => {
    const r = createAuditSchema.safeParse({ name: 'A', client: 'C', firstProcess: { name: ' ' } });
    expect(r.success).toBe(false);
  });
});

describe('createProcessSchema', () => {
  it('requires name', () => {
    expect(createProcessSchema.safeParse({}).success).toBe(false);
  });
  it('defaults priority to medium', () => {
    const r = createProcessSchema.safeParse({ name: 'P1' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.priority).toBe('medium');
  });
});

describe('createUseCaseSchema', () => {
  it('requires processId and description', () => {
    expect(createUseCaseSchema.safeParse({}).success).toBe(false);
    expect(createUseCaseSchema.safeParse({ processId: 'x' }).success).toBe(false);
    expect(createUseCaseSchema.safeParse({ processId: 'x', description: 'y' }).success).toBe(true);
  });
});
