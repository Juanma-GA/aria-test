import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Audit, Process, UseCase, POC, Industrialization } from '@/lib/models';
import { requireAuditAccess, isAccessGranted } from '@/lib/auditAccess';
import { computeAuditReportData, buildDeterministicReportMarkdown } from '@/lib/auditReportData';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ auditId: string }> | { auditId: string } },
) {
  try {
    await dbConnect();
    const params = await Promise.resolve(context.params);
    const access = await requireAuditAccess(req, params.auditId, 'view');
    if (!isAccessGranted(access)) return access;

    const [audit, processes, useCases, pocs, industrializations] =
      await Promise.all([
        Audit.findById(params.auditId).lean(),
        Process.find({ auditId: params.auditId }).lean(),
        UseCase.find({ auditId: params.auditId }).lean(),
        POC.find({ auditId: params.auditId })
          .populate('useCaseId', 'cuId description aiTypes')
          .populate('processId', 'procId name')
          .lean(),
        Industrialization.find({ auditId: params.auditId })
          .populate('useCaseId', 'cuId description')
          .populate('processId', 'procId name')
          .populate('pocId', 'pocId name')
          .lean(),
      ]);

    if (!audit)
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });

    const data = computeAuditReportData(
      audit,
      processes as any[],
      useCases as any[],
      pocs as any[],
      industrializations as any[],
    );
    const markdown = buildDeterministicReportMarkdown(audit, data);

    return NextResponse.json({
      markdown,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
