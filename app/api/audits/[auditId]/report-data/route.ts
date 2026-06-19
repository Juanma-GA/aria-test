import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Audit, Process, UseCase, POC, Industrialization } from '@/lib/models';
import { requireAuditAccess, isAccessGranted } from '@/lib/auditAccess';
import { computeAuditReportData } from '@/lib/auditReportData';
import { generateAuditReportHtml } from '@/lib/auditReport';
import { enrichPocs } from '@/lib/pocEnrichment';
import { computePocRoi } from '@/lib/pocRoi';

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
          .populate('processId', 'procId name b1.profiles b3.annualRepetitions b3.activities.id b3.activities.name b3.activities.profileHours b3.activities.stepRepetitions')
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

    const enrichedPocs = await enrichPocs(pocs as any[]);
    const pocRois = enrichedPocs.map((poc: any) => {
      const assignedUCs = [poc.useCase, ...(poc.instances ?? [])].filter(Boolean);
      const proc = typeof poc.processId === 'object' ? poc.processId : null;
      return proc && assignedUCs.length > 0 ? computePocRoi(assignedUCs, proc) : null;
    });

    const { html, filename } = generateAuditReportHtml(
      audit, data, processes as any[], useCases as any[], enrichedPocs, pocRois,
    );

    return NextResponse.json({ html, filename });
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
