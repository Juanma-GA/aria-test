import { NextRequest, NextResponse } from 'next/server';
import { callMistral, parseLLMJson } from '@/lib/llm';

/**
 * Suggest realistic input/output token volumes for a use case.
 *
 * Token *pricing* now lives on the AI model catalog (snapshotted into
 * `computeBreakdown.modelPriceInSnapshot` / `modelPriceOutSnapshot` when the
 * user picks a model), so we no longer ask the model to invent prices —
 * only to size token usage based on the use case description.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { computeBreakdown, useCaseDescription, aiTypes } = body;
    const cb = computeBreakdown ?? {};

    const prompt = `You are an AI infrastructure expert. Estimate realistic token volumes per execution for the following AI use case.

USE CASE: ${useCaseDescription || 'Not specified'}
AI TYPES: ${(aiTypes ?? []).join(', ') || 'Not specified'}
CURRENT INPUTS:
- Annual executions: ${cb.annualReps ?? 0}
- Input tokens / exec (current): ${cb.inputTokensPerExec ?? 1000}
- Output tokens / exec (current): ${cb.outputTokensPerExec ?? 500}

Return a JSON object:
{
  "inputTokensPerExec": 1200,
  "outputTokensPerExec": 600,
  "rationale": "Brief justification of the volumes (2-3 sentences). Mention how the use case complexity drove the choice."
}

Return ONLY valid JSON. The rationale string MUST be a single line — no literal newlines.`;

    const text = await callMistral([{ role: 'user', content: prompt }], { maxTokens: 400, temperature: 0.2 });
    const estimates = parseLLMJson<any>(text);
    return NextResponse.json({ estimates });
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
