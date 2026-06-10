/**
 * Migration script: sync UC status with POC membership
 *
 * For each non-archived UseCase:
 * - If it appears in useCaseIds or legacy useCaseId of any non-archived POC → status 'in_poc'
 * - If it doesn't appear in any POC and status is 'in_poc' → status 'eligible'
 * - Don't touch UCs with status 'discarded'
 *
 * Safe to run multiple times (idempotent)
 *
 * Usage: npx ts-node scripts/fix-uc-poc-status-sync.ts
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aria-audit';

const UseCaseSchema = new mongoose.Schema({
  status: String,
  isArchived: Boolean,
});

const POCSchema = new mongoose.Schema({
  useCaseIds: [mongoose.Schema.Types.ObjectId],
  useCaseId: mongoose.Schema.Types.ObjectId,
  isArchived: Boolean,
});

const UseCase = mongoose.model('UseCase', UseCaseSchema);
const POC = mongoose.model('POC', POCSchema);

async function syncUCPOCStatus() {
  let connection: typeof mongoose | null = null;
  try {
    console.log('🔗 Connecting to MongoDB...');
    connection = await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    // Phase 1: Repair corrupted useCaseIds (convert strings to ObjectIds)
    console.log('🔧 Phase 1: Repairing corrupted useCaseIds arrays...\n');
    const pocsWithStringIds = await POC.collection
      .find({ useCaseIds: { $type: 'string' } }).toArray();

    for (const poc of pocsWithStringIds) {
      const fixedIds = (poc.useCaseIds || []).map((id: any) =>
        typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id
      );
      await POC.collection.updateOne(
        { _id: poc._id },
        { $set: { useCaseIds: fixedIds } }
      );
      console.log(`✅ Repaired POC ${poc._id}: converted ${fixedIds.length} string IDs to ObjectIds`);
    }
    console.log();

    console.log('🔍 Scanning for UseCase status sync...\n');

    // Get all non-archived UCs
    const useCases = await UseCase.find({ isArchived: { $ne: true } })
      .select('_id status');

    console.log(`Found ${useCases.length} non-archived UseCase(s)\n`);

    let updated = 0;
    let noChange = 0;

    for (const uc of useCases) {
      // Skip discarded UCs
      if (uc.status === 'discarded') {
        console.log(`⏭️  Skipping UC ${uc._id}: status is 'discarded'\n`);
        continue;
      }

      // Check if UC appears in any non-archived POC (match both ObjectIds and strings)
      const pocCount = await POC.countDocuments({
        $or: [
          { useCaseIds: { $in: [uc._id, String(uc._id)] } },
          { useCaseId: { $in: [uc._id, String(uc._id)] } }
        ],
        isArchived: { $ne: true }
      });

      const shouldBeInPOC = pocCount > 0;
      const isCurrentlyInPOC = uc.status === 'in_poc';

      let newStatus = uc.status;
      if (shouldBeInPOC && !isCurrentlyInPOC) {
        newStatus = 'in_poc';
        console.log(`📝 Updating: UC ${uc._id} → 'in_poc' (found in ${pocCount} POC(s))`);
      } else if (!shouldBeInPOC && isCurrentlyInPOC) {
        newStatus = 'eligible';
        console.log(`📝 Updating: UC ${uc._id} → 'eligible' (not in any POC)`);
      } else {
        noChange++;
      }

      if (newStatus !== uc.status) {
        await UseCase.updateOne({ _id: uc._id }, { $set: { status: newStatus } });
        updated++;
      }
    }

    console.log(`\n🎉 Sync complete:`);
    console.log(`   Updated: ${updated}`);
    console.log(`   No change: ${noChange}`);

    await connection?.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

syncUCPOCStatus();
