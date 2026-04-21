/**
 * POST /api/migrate
 * One-time migration: assigns compound hierarchical IDs to all existing records.
 *   Audit  → AUD-001
 *   Process → AUD-001-P01
 *   UseCase → AUD-001-P01-C01
 *   POC     → POC-AUD-001-P01-C01-01
 */
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Audit, Process, UseCase, POC } from '@/lib/models';

export async function POST(_req: NextRequest) {
  try {
    await dbConnect();

    const results = {
      audits: 0,
      processes: 0,
      useCases: 0,
      pocs: 0,
      errors: [] as string[],
    };

    // ── 1. Assign auditCode to all audits that don't have one ─────────────────
    const audits = await Audit.find({}).sort({ createdAt: 1 }).lean() as any[];
    let auditSeq = 0;

    // Build a map of auditId → auditCode
    const auditCodeMap = new Map<string, string>();

    for (const audit of audits) {
      let code = audit.auditCode;
      if (!code) {
        auditSeq++;
        code = `AUD-${String(auditSeq).padStart(3, '0')}`;
        await Audit.findByIdAndUpdate(audit._id, { auditCode: code });
        results.audits++;
      } else {
        // Parse existing sequence to keep counter correct
        const m = code.match(/AUD-(\d+)/);
        if (m) auditSeq = Math.max(auditSeq, parseInt(m[1], 10));
      }
      auditCodeMap.set(String(audit._id), code);
    }

    // ── 2. Assign compound procId to all processes ────────────────────────────
    // Group processes per audit, ordered by creation date
    const allProcesses = await Process.find({}).sort({ auditId: 1, createdAt: 1 }).lean() as any[];

    // Per-audit sequence counter
    const procSeqByAudit = new Map<string, number>();
    // Build a map of processId → new procId
    const procIdMap = new Map<string, string>();

    for (const proc of allProcesses) {
      const aid = String(proc.auditId);
      const auditCode = auditCodeMap.get(aid) ?? 'AUD-000';
      const seq = (procSeqByAudit.get(aid) ?? 0) + 1;
      procSeqByAudit.set(aid, seq);
      const newProcId = `${auditCode}-P${String(seq).padStart(2, '0')}`;

      if (proc.procId !== newProcId) {
        await Process.findByIdAndUpdate(proc._id, { procId: newProcId });
        results.processes++;
      }
      procIdMap.set(String(proc._id), newProcId);
    }

    // ── 3. Assign compound cuId to all use cases ──────────────────────────────
    const allUseCases = await UseCase.find({}).sort({ processId: 1, createdAt: 1 }).lean() as any[];

    const ucSeqByProcess = new Map<string, number>();
    // Build a map of ucId (old) → new cuId for POC migration
    const ucIdMap = new Map<string, string>(); // _id → new cuId

    for (const uc of allUseCases) {
      const pid = String(uc.processId);
      const procId = procIdMap.get(pid) ?? 'PROC';
      const seq = (ucSeqByProcess.get(pid) ?? 0) + 1;
      ucSeqByProcess.set(pid, seq);
      const newCuId = `${procId}-C${String(seq).padStart(2, '0')}`;

      if (uc.cuId !== newCuId) {
        await UseCase.findByIdAndUpdate(uc._id, { cuId: newCuId });
        results.useCases++;
      }
      ucIdMap.set(String(uc._id), newCuId);
    }

    // ── 4. Assign compound pocId to all POCs ─────────────────────────────────
    const allPocs = await POC.find({}).sort({ useCaseId: 1, createdAt: 1 }).lean() as any[];

    const pocSeqByUC = new Map<string, number>();

    for (const poc of allPocs) {
      const ucObjectId = String(poc.useCaseId);
      const cuId = ucIdMap.get(ucObjectId) ?? poc.pocId; // fallback to existing
      const seq = (pocSeqByUC.get(ucObjectId) ?? 0) + 1;
      pocSeqByUC.set(ucObjectId, seq);
      const newPocId = `POC-${cuId}-${String(seq).padStart(2, '0')}`;

      if (poc.pocId !== newPocId) {
        await POC.findByIdAndUpdate(poc._id, { pocId: newPocId });
        results.pocs++;
      }
    }
    results.pocs = allPocs.filter((p) => !pocSeqByUC.has(String(p.useCaseId))).length || results.pocs;

    return NextResponse.json({
      ok: true,
      message: 'Migration complete',
      updated: results,
    });
  } catch (err) {
    console.error('[API]', err);
    return NextResponse.json({ ok: false, error: 'Migration failed' }, { status: 500 });
  }
}
