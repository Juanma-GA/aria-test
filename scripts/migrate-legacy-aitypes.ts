import mongoose from 'mongoose';
import { UseCase } from '@/lib/models';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const LEGACY_TYPE_MAP: Record<string, string> = {
  rag: 'rag_semantic',
  prediction: 'prediction_ml',
  agentic_ai: 'agentic_ai_workflow',
};

interface MigrationResult {
  totalUCs: number;
  useCasesWithLegacy: number;
  totalTransformed: number;
  byType: Record<string, number>;
  details: Array<{
    cuId: string;
    auditId: string;
    original: string[];
    updated: string[];
    changes: string[];
  }>;
}

async function migrateAiTypes(dryRun = true): Promise<MigrationResult> {
  await mongoose.connect(process.env.MONGODB_URI || '');

  const result: MigrationResult = {
    totalUCs: 0,
    useCasesWithLegacy: 0,
    totalTransformed: 0,
    byType: {},
    details: [],
  };

  try {
    // Find all use cases
    const allUCs = await UseCase.find({}).lean();
    result.totalUCs = allUCs.length;

    console.log(`\n📊 Scanning ${allUCs.length} use cases for legacy aiTypes...`);

    for (const uc of allUCs) {
      const aiTypes = (uc.aiTypes || []) as string[];
      const legacyTypes = aiTypes.filter((t) => t in LEGACY_TYPE_MAP);

      if (legacyTypes.length === 0) continue;

      result.useCasesWithLegacy++;

      // Build updated array, avoiding duplicates
      const updated = new Set(aiTypes);
      const changes: string[] = [];

      for (const legacy of legacyTypes) {
        const newType = LEGACY_TYPE_MAP[legacy];

        // Remove legacy type
        updated.delete(legacy);

        // Add new type (Set prevents duplicates)
        updated.add(newType);

        changes.push(`${legacy} → ${newType}`);
        result.byType[legacy] = (result.byType[legacy] || 0) + 1;
        result.totalTransformed++;
      }

      const updatedArray = Array.from(updated);

      result.details.push({
        cuId: uc.cuId,
        auditId: String(uc.auditId),
        original: aiTypes,
        updated: updatedArray,
        changes,
      });

      // Apply if not dry run
      if (!dryRun) {
        await UseCase.updateOne({ _id: uc._id }, { aiTypes: updatedArray });
      }
    }

    // Print summary
    console.log(`\n✅ Migration ${dryRun ? '(DRY RUN)' : '(APPLIED)'} Summary:`);
    console.log(`   Total use cases: ${result.totalUCs}`);
    console.log(`   Use cases with legacy types: ${result.useCasesWithLegacy}`);
    console.log(`   Total transformations: ${result.totalTransformed}`);
    console.log(`\n📈 Breakdown by legacy type:`);

    for (const [legacy, count] of Object.entries(result.byType)) {
      const newType = LEGACY_TYPE_MAP[legacy];
      console.log(`   ${legacy} → ${newType}: ${count}`);
    }

    if (result.details.length > 0) {
      console.log(`\n📋 Affected use cases:`);
      for (const detail of result.details) {
        console.log(`\n   ${detail.cuId} (audit: ${detail.auditId})`);
        console.log(`     Original: [${detail.original.join(', ')}]`);
        console.log(`     Updated:  [${detail.updated.join(', ')}]`);
        console.log(`     Changes:  ${detail.changes.join(', ')}`);
      }
    } else {
      console.log(`\n✓ No use cases require migration.`);
    }

    if (dryRun && result.useCasesWithLegacy > 0) {
      console.log(
        `\n💡 Run with --apply flag to execute migration: npm run migrate:aitypes -- --apply`,
      );
    }
  } finally {
    await mongoose.disconnect();
  }

  return result;
}

// Main execution
const args = process.argv.slice(2);
const shouldApply = args.includes('--apply');

migrateAiTypes(!shouldApply)
  .then((result) => {
    const exitCode = result.useCasesWithLegacy > 0 && shouldApply ? 0 : 0;
    process.exit(exitCode);
  })
  .catch((err) => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  });
