import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { UseCase } from "@/lib/models";

/** Recalculate total score and category from dimension values */
function recalculateScore(dimensions: Record<string, { value: number }>) {
  const DIM_KEYS = [
    "d1_efficiencyImpact",
    "d2_qualityImpact",
    "d3_techMaturity",
    "d4_dataReadiness",
    "d5_sovereigntyIndex",
    "d6_governanceComplexity",
  ];
  let total = 0;
  for (const key of DIM_KEYS) {
    total += dimensions[key]?.value ?? 0;
  }
  const d6 = dimensions.d6_governanceComplexity?.value ?? 0;

  let category: string;
  if (total >= 22 && d6 >= 4) {
    category = "quick_win";
  } else if (total >= 14) {
    category = "mid_term";
  } else {
    category = "strategic";
  }

  return { total, category };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ auditId: string; cuId: string }> },
) {
  try {
    await dbConnect();
    const { auditId, cuId } = await params;

    const useCase = await UseCase.findOne({ auditId, _id: cuId }).lean();
    if (!useCase) {
      return NextResponse.json(
        { error: "Use case not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(useCase);
  } catch (err) {
    console.error("[API]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

const EDITABLE_FIELDS = [
  "description",
  "aiTypes",
  "targetActivities",
  "b2Compatible",
  "requiresClientIT",
  "timeSavedPerProfile",
  "estimatedDevCostEur",
  "devCostExplanation",
  "estimatedImplWeeks",
  "status",
  "blockedReason",
  "blockedAxis",
  "unblockCondition",
  "reviewDate",
  "notes",
  "computeCost",
  "sovereigntyAnalysis",
] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ auditId: string; cuId: string }> },
) {
  try {
    await dbConnect();
    const { auditId, cuId } = await params;
    const body = await req.json();

    const existing = (await UseCase.findOne({
      auditId,
      _id: cuId,
    }).lean()) as any;
    if (!existing) {
      return NextResponse.json(
        { error: "Use case not found" },
        { status: 404 },
      );
    }

    // Build $set from allowed fields only — avoids Mongoose errors on immutable fields (_id, etc.)
    const $set: Record<string, unknown> = {};
    for (const key of EDITABLE_FIELDS) {
      if (key in body) $set[key] = body[key];
    }

    // Handle score: merge dimensions then recalculate
    if (body.score !== undefined) {
      const existingDims = existing.score?.dimensions ?? {};
      const mergedDimensions = {
        ...existingDims,
        ...(body.score.dimensions ?? {}),
      };
      const { total, category } = recalculateScore(mergedDimensions);
      $set["score"] = {
        ...(existing.score ?? {}),
        ...body.score,
        dimensions: mergedDimensions,
        total,
        category,
      };
    }

    // Use native MongoDB driver to bypass Mongoose strict-mode stripping on $set
    const oid = new mongoose.Types.ObjectId(cuId);
    const result = await UseCase.collection.updateOne({ _id: oid }, { $set });

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: "Use case not found during update" },
        { status: 404 },
      );
    }

    const updated = await UseCase.findOne({ _id: cuId }).lean();
    return NextResponse.json(updated);
  } catch (err) {
    console.error("[API]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ auditId: string; cuId: string }> },
) {
  try {
    await dbConnect();
    const { auditId, cuId } = await params;

    const useCase = await UseCase.findOne({ auditId, _id: cuId });
    if (!useCase) {
      return NextResponse.json(
        { error: "Use case not found" },
        { status: 404 },
      );
    }

    await useCase.deleteOne();
    return NextResponse.json({ message: "Use case deleted successfully" });
  } catch (err) {
    console.error("[API]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
