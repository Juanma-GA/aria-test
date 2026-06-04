/**
 * Migration script: fix UseCases with legacy status values
 *
 * Problem: After refactoring UseCase status from ['eligible', 'blocked', 'pending_review']
 * to ['eligible', 'in_poc', 'discarded'], any existing documents with the old status
 * values need to be migrated.
 *
 * Solution: For each UseCase with:
 * - status === 'blocked' → set to 'eligible'
 * - status === 'pending_review' → set to 'eligible'
 * - status undefined or null → set to 'eligible'
 *
 * Safe to run multiple times (idempotent): only updates if status needs fixing
 *
 * Usage: npx ts-node scripts/fix-uc-status-migration.ts
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aria-audit';

// Minimal inline schema - no Next.js dependencies
const UseCaseSchema = new mongoose.Schema({
  cuId: String,
  status: String,
  auditId: mongoose.Schema.Types.ObjectId,
});

const UseCase = mongoose.model('UseCase', UseCaseSchema);

async function fixUCStatusValues() {
  let connection: typeof mongoose | null = null;
  try {
    console.log('🔗 Connecting to MongoDB...');
    connection = await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    console.log('🔍 Scanning for UseCases with legacy status values...\n');

    // Find all UseCases with old status values or missing status
    const useCasesToFix = await UseCase.find({
      $or: [
        { status: 'blocked' },
        { status: 'pending_review' },
        { status: { $exists: false } },
        { status: null },
      ],
    }).select('_id cuId status auditId');

    console.log(`Found ${useCasesToFix.length} UseCase(s) needing status update\n`);

    let fixed = 0;
    for (const uc of useCasesToFix) {
      const oldStatus = uc.status || 'undefined';
      console.log(`📝 Fixing: UC ${uc.cuId} (ID: ${uc._id}, status: '${oldStatus}')`);

      const $set = { status: 'eligible' };

      await UseCase.updateOne({ _id: uc._id }, { $set });
      fixed++;
      console.log(`   ✅ Status set to 'eligible'\n`);
    }

    console.log(`\n🎉 Migration complete: ${fixed} UseCase(s) fixed`);
  } catch (err) {
    console.error('❌ Error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    if (connection) {
      await mongoose.disconnect();
      console.log('🔌 Disconnected from MongoDB');
    }
  }
}

fixUCStatusValues();
