/**
 * Rollback script: remove useCaseIds array from POCs
 *
 * Removes the useCaseIds field that was added by migrate-poc-usecaseids.ts
 * Keeps useCaseId intact.
 *
 * Usage:
 *   DRY RUN: DRY_RUN=true npx ts-node scripts/rollback-poc-usecaseids.ts
 *   REAL RUN: npx ts-node scripts/rollback-poc-usecaseids.ts
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aria-audit';
const DRY_RUN = process.env.DRY_RUN === 'true';

const POCSchema = new mongoose.Schema({
  pocId: String,
  useCaseIds: [mongoose.Schema.Types.ObjectId],
});

const POC = mongoose.model('POC', POCSchema);

async function rollbackPOCUseCaseIds() {
  let connection: typeof mongoose | null = null;
  try {
    console.log('🔗 Connecting to MongoDB...');
    connection = await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    if (DRY_RUN) {
      console.log('🧪 DRY RUN MODE - no changes will be written\n');
    }

    console.log('🔍 Checking for useCaseIds field to rollback...\n');
    const totalToRollback = await POC.countDocuments({ useCaseIds: { $exists: true } });

    console.log(`📊 Found ${totalToRollback} POC(s) to rollback\n`);

    if (totalToRollback === 0) {
      console.log('✅ No POCs to rollback. All done.');
      return;
    }

    const pocsToRollback = await POC.find({ useCaseIds: { $exists: true } })
      .select('_id pocId');

    let rolledBack = 0;

    for (let i = 0; i < pocsToRollback.length; i++) {
      const poc = pocsToRollback[i];

      if (i % 100 === 0 && i > 0) {
        console.log(`   📈 Progress: ${i}/${totalToRollback} processed\n`);
      }

      if (!DRY_RUN) {
        await POC.updateOne({ _id: poc._id }, { $unset: { useCaseIds: 1 } });
      }

      rolledBack++;

      if (rolledBack % 100 === 0) {
        const action = DRY_RUN ? '(DRY)' : '(REMOVED)';
        console.log(`   ✅ ${action} POC ${poc.pocId} - useCaseIds removed`);
      }
    }

    console.log(`\n🎉 Rollback complete:`);
    console.log(`   Total rolled back: ${rolledBack}`);
    if (DRY_RUN) {
      console.log('   (DRY RUN - no changes written to database)');
    }
  } catch (err) {
    console.error('❌ Error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    if (connection) {
      await mongoose.disconnect();
      console.log('\n🔌 Disconnected from MongoDB');
    }
  }
}

rollbackPOCUseCaseIds();
