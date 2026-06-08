/**
 * Migration script: Update UseCase status to 'in_poc' when a POC exists
 *
 * Problem: When POCs were created for UseCases, the UC status should transition
 * from 'eligible' to 'in_poc'. This script ensures all existing POCs have their
 * linked UseCases updated to 'in_poc' status.
 *
 * Solution: For each non-archived POC:
 * - Find its linked UseCase via useCaseId
 * - If UseCase.status === 'eligible', update to 'in_poc'
 * - Skip if status is already 'in_poc' or 'discarded' (idempotent)
 *
 * Safe to run multiple times (idempotent): only updates if status is 'eligible'
 *
 * Usage: npx ts-node scripts/fix-uc-in-poc-status.ts
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aria-audit';

// Minimal inline schemas - no Next.js dependencies
const POCSchema = new mongoose.Schema({
  pocId: String,
  useCaseId: mongoose.Schema.Types.ObjectId,
  isArchived: Boolean,
});

const UseCaseSchema = new mongoose.Schema({
  cuId: String,
  status: String,
  auditId: mongoose.Schema.Types.ObjectId,
});

const POC = mongoose.model('POC', POCSchema);
const UseCase = mongoose.model('UseCase', UseCaseSchema);

async function fixUCInPocStatus() {
  let connection: typeof mongoose | null = null;
  try {
    console.log('🔗 Connecting to MongoDB...');
    connection = await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    console.log('🔍 Scanning for non-archived POCs...\n');

    // Find all non-archived POCs
    const pocs = await POC.find({
      $or: [
        { isArchived: { $exists: false } },
        { isArchived: false },
      ],
    }).select('_id pocId useCaseId');

    console.log(`Found ${pocs.length} non-archived POC(s)\n`);

    let updated = 0;
    for (const poc of pocs) {
      if (!poc.useCaseId) {
        console.log(`⏭️  Skipping POC ${poc.pocId}: no useCaseId linked\n`);
        continue;
      }

      // Find the linked UseCase
      const uc = await UseCase.findById(poc.useCaseId).select('_id cuId status auditId');

      if (!uc) {
        console.log(`⚠️  POC ${poc.pocId}: linked UseCase not found (ID: ${poc.useCaseId})\n`);
        continue;
      }

      // Only update if status is 'eligible' (idempotent)
      if (uc.status === 'eligible') {
        console.log(`📝 Updating: UC ${uc.cuId} (ID: ${uc._id}, status: '${uc.status}' → 'in_poc')`);
        console.log(`   POC: ${poc.pocId}`);

        const $set = { status: 'in_poc' };
        await UseCase.updateOne({ _id: uc._id }, { $set });
        updated++;
        console.log(`   ✅ Status set to 'in_poc'\n`);
      } else {
        console.log(`⏭️  Skipping UC ${uc.cuId}: status is '${uc.status}' (not 'eligible')\n`);
      }
    }

    console.log(`\n🎉 Migration complete: ${updated} UseCase(s) updated to 'in_poc'`);
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

fixUCInPocStatus();
