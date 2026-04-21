import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { POC, UseCase, Process } from "@/lib/models";
import { callMistral, parseLLMJson } from "@/lib/llm";
import { calculateSovereigntyIndex } from "@/lib/calculations";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ auditId: string; pocId: string }> },
) {
  try {
    await dbConnect();
    const { auditId, pocId } = await params;

    const poc = await POC.findOne({ auditId, _id: pocId });
    if (!poc) {
      return NextResponse.json({ error: "POC not found" }, { status: 404 });
    }

    const uc = poc.useCaseId ? await UseCase.findById(poc.useCaseId) : null;

    const process = poc.processId
      ? await Process.findById(poc.processId)
      : null;

    const b2 = (process as any)?.b2 ?? {};
    const axes = b2.axes ?? {};
    const sovereigntyResult =
      Object.keys(axes).length > 0 ? calculateSovereigntyIndex(axes) : null;

    const LEVEL_LABELS: Record<string, string> = {
      full_autonomy: "Full Autonomy",
      managed: "Managed",
      conditioned: "Conditioned",
      restricted: "Restricted",
      critical: "Critical",
    };

    const b2Summary = sovereigntyResult
      ? `Sovereignty level: ${LEVEL_LABELS[sovereigntyResult.level] ?? sovereigntyResult.level} (index ${sovereigntyResult.index.toFixed(2)}/5)${sovereigntyResult.hasCritical ? " — CRITICAL constraints present" : ""}. Active axes: ${Object.entries(
          axes,
        )
          .map(([k, v]: [string, any]) => `${k}:${v.compliance ?? "N/A"}`)
          .join(", ")}`
      : "No sovereignty assessment available";

    const prompt = `You are an AI project manager. Fill in the design fields for a Proof of Concept (POC) for the following AI use case.

USE CASE: ${(uc as any)?.description || "Not specified"}
AI TYPES: ${((uc as any)?.aiTypes ?? []).join(", ") || "Not specified"}
PROCESS: ${(process as any)?.name || "Not specified"}
SOVEREIGNTY: ${b2Summary}

Return a JSON object with exactly these two fields:
{
  "measurableObjective": "2-3 specific, quantifiable objectives to validate during the POC. Include target metrics (e.g. 'Achieve >85% extraction accuracy on 100 test invoices within 4 weeks'). 2-3 sentences.",
  "activeB2Restrictions": "Summary of active sovereignty and compliance restrictions that apply to this POC. What data handling rules, approval processes, or technical constraints must be respected? 2-3 sentences."
}

Return ONLY valid JSON.`;

    const text = await callMistral([{ role: "user", content: prompt }], {
      maxTokens: 600,
      temperature: 0.3,
    });
    const fields = parseLLMJson<{
      measurableObjective: string;
      activeB2Restrictions: string;
    }>(text);

    // Patch the POC with the AI-generated fields
    (poc as any).measurableObjective = fields.measurableObjective;
    (poc as any).activeB2Restrictions = fields.activeB2Restrictions;
    (poc as any).aiGeneratedFields = [
      "measurableObjective",
      "activeB2Restrictions",
    ];
    await poc.save();

    return NextResponse.json({ poc: poc.toObject(), fields });
  } catch (err) {
    console.error("[API]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
