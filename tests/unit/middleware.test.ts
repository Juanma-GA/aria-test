import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const middlewareSrc = readFileSync(resolve(__dirname, '../../middleware.ts'), 'utf-8');
const seedRouteSrc = readFileSync(resolve(__dirname, '../../app/api/seed/route.ts'), 'utf-8');

describe('middleware security posture (CRITICAL-1, CRITICAL-2)', () => {
  it('does NOT list /api/seed in PUBLIC_PATHS', () => {
    const match = middlewareSrc.match(/PUBLIC_PATHS\s*=\s*\[([^\]]*)\]/);
    expect(match, 'PUBLIC_PATHS declaration not found').not.toBeNull();
    expect(match![1]).not.toContain('/api/seed');
  });

  it('throws if JWT_SECRET is missing (no hardcoded fallback)', () => {
    expect(middlewareSrc).not.toContain('aria-secret-key-change-in-production-2025');
    expect(middlewareSrc).toMatch(/if\s*\(\s*!JWT_SECRET\s*\)[\s\S]*throw/);
  });
});

describe('seed route admin guard (CRITICAL-1)', () => {
  it('rejects non-admin callers before touching the database', () => {
    expect(seedRouteSrc).toMatch(/x-user-role[\s\S]*admin[\s\S]*403/);
  });

  it('does not leak raw error details', () => {
    expect(seedRouteSrc).not.toMatch(/details:\s*String\(err\)/);
  });
});

describe('API error sanitization (HIGH-1)', () => {
  it('has no residual String(err) pattern in app/api', () => {
    const { execSync } = require('node:child_process');
    let out = '';
    try {
      out = execSync('grep -rln "String(err)" app/api || true', {
        cwd: resolve(__dirname, '../..'),
        encoding: 'utf-8',
      });
    } catch {
      out = '';
    }
    expect(out.trim()).toBe('');
  });
});
