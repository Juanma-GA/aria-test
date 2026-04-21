import { NextRequest, NextResponse } from 'next/server';
import { callMistral, parseLLMJson } from '@/lib/llm';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { computeCost, useCaseDescription, aiTypes } = body;

    const cc = computeCost ?? {};

    const prompt = `You are an AI infrastructure expert. Review the following compute cost parameters for an AI use case and suggest updated, realistic estimates based on current market pricing (2024-2025).

USE CASE: ${useCaseDescription || 'Not specified'}
AI TYPES: ${(aiTypes ?? []).join(', ') || 'Not specified'}
CURRENT PARAMETERS:
- Deployment model: ${cc.deploymentModel ?? 'cloud_api'}
- Annual executions: ${cc.annualReps ?? 0}
- Avg response time: ${cc.avgResponseTimeSec ?? 2}s
- Concurrent users: ${cc.concurrentUsers ?? 1}
- Input tokens/exec: ${cc.inputTokensPerExec ?? 1000}
- Output tokens/exec: ${cc.outputTokensPerExec ?? 500}
- Current price per M input tokens: €${cc.pricePerMInputTokens ?? 2}
- Current price per M output tokens: €${cc.pricePerMOutputTokens ?? 6}

Return a JSON object with updated estimates:
{
  "pricePerMInputTokens": 2.5,
  "pricePerMOutputTokens": 7.5,
  "inputTokensPerExec": 1200,
  "outputTokensPerExec": 600,
  "avgResponseTimeSec": 3,
  "rationale": "Brief explanation of the estimates and market context (2-3 sentences)"
}

Base your estimates on real 2024-2025 pricing for models appropriate to the use case AI types. Return ONLY valid JSON.`;

    const text = await callMistral([{ role: 'user', content: prompt }], { maxTokens: 600, temperature: 0.2 });
    const estimates = parseLLMJson<any>(text);

    return NextResponse.json({ estimates });
  } catch (err) {
    console.error("[API]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
