import { describe, it, expect } from 'vitest';
import {
  calculateSovereigntyIndex,
  calculateScore,
  sovereigntyIndexToD5Score,
  generateProcId,
  generateCuId,
  generatePocId,
} from '@/lib/calculations';
import type { B2_Sovereignty, B6_Score } from '@/lib/types';

function makeAxes(statuses: Array<'green' | 'amber' | 'red'>): B2_Sovereignty['axes'] {
  const keys = [
    'axis1_InfoClassification',
    'axis2_ProcessSovereignty',
    'axis3_ToolSovereignty',
    'axis4_DataSovereignty',
    'axis5_Infrastructure',
  ] as const;
  const axes: any = {};
  keys.forEach((k, i) => {
    axes[k] = { status: statuses[i] ?? 'amber', findings: '' };
  });
  return axes;
}

function makeDimensions(values: number[]): B6_Score['dimensions'] {
  const keys = [
    'd1_efficiency',
    'd2_quality',
    'd3_techMaturity',
    'd4_dataReadiness',
    'd5_sovereigntyIndex',
    'd6_governanceComplexity',
  ];
  const dims: any = {};
  keys.forEach((k, i) => {
    dims[k] = { value: values[i] };
  });
  return dims;
}

describe('calculateSovereigntyIndex', () => {
  it('returns full_autonomy when all axes are green', () => {
    const r = calculateSovereigntyIndex(makeAxes(['green', 'green', 'green', 'green', 'green']));
    expect(r.level).toBe('full_autonomy');
    expect(r.index).toBe(5);
    expect(r.hasCritical).toBe(false);
  });

  it('returns critical when all axes are red', () => {
    const r = calculateSovereigntyIndex(makeAxes(['red', 'red', 'red', 'red', 'red']));
    expect(r.level).toBe('critical');
    expect(r.index).toBe(1);
    expect(r.hasCritical).toBe(true);
  });

  it('flags hasCritical if any axis is red', () => {
    const r = calculateSovereigntyIndex(makeAxes(['green', 'green', 'green', 'green', 'red']));
    expect(r.hasCritical).toBe(true);
  });

  it('handles mixed amber correctly', () => {
    const r = calculateSovereigntyIndex(makeAxes(['amber', 'amber', 'amber', 'amber', 'amber']));
    expect(r.level).toBe('conditioned');
    expect(r.index).toBe(3);
  });
});

describe('calculateScore', () => {
  it('classifies as quick_win when total >= 22 AND d6 >= 4', () => {
    const r = calculateScore(makeDimensions([4, 4, 4, 4, 4, 4])); // total=24, d6=4
    expect(r.category).toBe('quick_win');
    expect(r.total).toBe(24);
  });

  it('does NOT classify as quick_win if total >= 22 but d6 < 4', () => {
    const r = calculateScore(makeDimensions([5, 5, 5, 5, 5, 3])); // total=28, d6=3
    expect(r.category).toBe('mid_term');
  });

  it('classifies as mid_term when 14 <= total < 22', () => {
    const r = calculateScore(makeDimensions([3, 3, 3, 3, 3, 3])); // total=18
    expect(r.category).toBe('mid_term');
    expect(r.total).toBe(18);
  });

  it('classifies as strategic when total < 14', () => {
    const r = calculateScore(makeDimensions([2, 2, 2, 2, 2, 2])); // total=12
    expect(r.category).toBe('strategic');
  });

  it('handles boundary at total=14', () => {
    const r = calculateScore(makeDimensions([3, 3, 3, 3, 1, 1])); // total=14
    expect(r.category).toBe('mid_term');
  });

  it('handles boundary at total=22 with d6=4', () => {
    const r = calculateScore(makeDimensions([3, 3, 4, 4, 4, 4])); // total=22, d6=4
    expect(r.category).toBe('quick_win');
  });
});

describe('sovereigntyIndexToD5Score', () => {
  it('maps index bands correctly', () => {
    expect(sovereigntyIndexToD5Score(5)).toBe(5);
    expect(sovereigntyIndexToD5Score(4.5)).toBe(5);
    expect(sovereigntyIndexToD5Score(4.0)).toBe(4);
    expect(sovereigntyIndexToD5Score(3.5)).toBe(4);
    expect(sovereigntyIndexToD5Score(3.0)).toBe(3);
    expect(sovereigntyIndexToD5Score(2.0)).toBe(2);
    expect(sovereigntyIndexToD5Score(1.0)).toBe(1);
  });
});

describe('id generators', () => {
  it('generates zero-padded procId', () => {
    expect(generateProcId(0)).toBe('PROC-01');
    expect(generateProcId(9)).toBe('PROC-10');
  });

  it('generates zero-padded cuId', () => {
    expect(generateCuId(0)).toBe('CU-01');
  });

  it('generates nested pocId', () => {
    expect(generatePocId('CU-03', 0)).toBe('POC-CU-03-01');
  });
});
