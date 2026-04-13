import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Process } from '@/lib/models';
import { callMistral } from '@/lib/llm';
import { calculateSovereigntyIndex } from '@/lib/calculations';

export async function POST(
  req: NextRequest,
  { params }: { params: { auditId: string; procId: string } }
) {
  try {
    await dbConnect();
    const { auditId, procId } = params;
    const body = await req.json();
    const { useCaseDescription, aiTypes } = body;

    const process = await Process.findOne({ auditId, _id: procId });
    if (!process) {
      return NextResponse.json({ error: 'Process not found' }, { status: 404 });
    }

    const b2 = (process as any).b2 ?? {};
    const axes = b2.axes ?? {};

    const result = calculateSovereigntyIndex(axes);
    const { index, level, hasCritical } = result;

    const LEVEL_LABELS: Record<string, string> = {
      full_autonomy: 'Full Autonomy',
      managed: 'Managed',
      conditioned: 'Conditioned',
      restricted: 'Restricted',
      critical: 'Critical',
    };

    const axesDetail = Object.entries(axes)
      .map(([k, v]: [string, any]) => {
        const frameworks = (v.normativeFrameworks ?? []).join(', ') || 'none';
        return `- ${k}: compliance=${v.compliance ?? 'N/A'}, frameworks=[${frameworks}], notes="${v.notes ?? ''}"`;
      })
      .join('\n') || 'No axes assessed';

    const prompt = `You are an AI governance expert. Write a concise sovereignty analysis paragraph (3-5 sentences) for the following AI use case in the context of its process's sovereignty assessment.

USE CASE: ${useCaseDescription || 'Not specified'}
AI TYPES: ${(aiTypes ?? []).join(', ') || 'Not specified'}

PROCESS SOVEREIGNTY ASSESSMENT:
Overall Index: ${index.toFixed(2)}/5 — Level: ${LEVEL_LABELS[level] ?? level}${hasCritical ? ' (CRITICAL constraints detected)' : ''}

Axes:
${axesDetail}

Write a professional analysis explaining:
1. What sovereignty constraints apply to this use case
2. What conditions must be met for deployment
3. Any specific risks or recommendations

Write in English, 3-5 sentences, professional tone. No headers or bullet points.`;

    const analysis = await callMistral([{ role: 'user', content: prompt }], { maxTokens: 500, temperature: 0.3 });

    return NextResponse.json({ analysis: analysis.trim() });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
