import type { B2_Sovereignty, SovereigntyIndexResult, SovereigntyLevel, B6_Score, ScoreResult } from './types';

export function calculateSovereigntyIndex(axes: B2_Sovereignty['axes']): SovereigntyIndexResult {
  const values: number[] = Object.values(axes).reduce<number[]>((acc, axis) => {
    if (axis.status === 'green') acc.push(5);
    else if (axis.status === 'amber') acc.push(3);
    else if (axis.status === 'red') acc.push(1);
    return acc;
  }, []);

  if (values.length === 0) return { index: 0, hasCritical: false, level: 'conditioned' };

  const index = values.reduce((sum, v) => sum + v, 0) / values.length;
  const hasCritical = Object.values(axes).some((axis) => axis.status === 'red');

  let level: SovereigntyLevel;
  if (index >= 4.5) level = 'full_autonomy';
  else if (index >= 3.5) level = 'managed';
  else if (index >= 2.5) level = 'conditioned';
  else if (index >= 1.5) level = 'restricted';
  else level = 'critical';

  return { index: Math.round(index * 10) / 10, hasCritical, level };
}

export function calculateScore(dimensions: B6_Score['dimensions']): ScoreResult {
  const values = Object.values(dimensions).map((d) => d.value);
  const total = values.reduce((sum, v) => sum + v, 0);
  const d6 = dimensions.d6_governanceComplexity?.value ?? 0;

  let category: ScoreResult['category'];
  if (total >= 22 && d6 >= 4) {
    category = 'quick_win';
  } else if (total >= 14) {
    category = 'mid_term';
  } else {
    category = 'strategic';
  }

  return { total, category };
}

export function sovereigntyIndexToD5Score(index: number): 1 | 2 | 3 | 4 | 5 {
  if (index >= 4.5) return 5;
  if (index >= 3.5) return 4;
  if (index >= 2.5) return 3;
  if (index >= 1.5) return 2;
  return 1;
}

export function generateProcId(count: number): string {
  return `PROC-${String(count + 1).padStart(2, '0')}`;
}

export function generateCuId(count: number): string {
  return `CU-${String(count + 1).padStart(2, '0')}`;
}

export function generatePocId(cuId: string, count: number): string {
  return `POC-${cuId}-${String(count + 1).padStart(2, '0')}`;
}
