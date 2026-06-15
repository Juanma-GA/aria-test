/**
 * Rollback script: remove instance fields from UseCases
 *
 * Removes the fields that were added by migrate-uc-instance-fields.ts:
 * - isInstance
 * - parentUCId
 * - additionalDevCostEur
 *
 * Usage:
 *   DRY RUN: DRY_RUN=true npx ts-node scripts/rollback-uc-instance-fields.ts
 *   REAL RUN: npx ts-node scripts/rollback-uc-instance-fields.ts
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aria-audit';
const DRY_RUN = process.env.DRY_RUN === 'true';

const UseCaseSchema = new mongoose.Schema({
  cuId: String,
  isInstance: Boolean,
  parentUCId: mongoose.Schema.Types.ObjectId,
  additionalDevCostEur: Number,
});

const UseCase = mongoose.model('UseCase', UseCaseSchema);

async function rollbackUCInstanceFields() {
  let connection: typeof mongoose | null = null;
  try {
    console.log('🔗 Connecting to MongoDB...');
    connection = await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    if (DRY_RUN) {
      console.log('🧪 DRY RUN MODE - no changes will be written\n');
    }

    console.log('🔍 Checking for instance fields to rollback...\n');
    const totalToRollback = await UseCase.countDocuments({ isInstance: { $exists: true } });

    console.log(`📊 Found ${totalToRollback} UseCase(s) to rollback\n`);

    if (totalToRollback === 0) {
      console.log('✅ No UseCases to rollback. All done.');
      return;
    }

    const useCasesToRollback = await UseCase.find({ isInstance: { $exists: true } })
      .select('_id cuId');

    let rolledBack = 0;

    for (let i = 0; i < useCasesToRollback.length; i++) {
      const uc = useCasesToRollback[i];

      if (i % 100 === 0 && i > 0) {
        console.log(`   📈 Progress: ${i}/${totalToRollback} processed\n`);
      }

      if (!DRY_RUN) {
        await UseCase.updateOne(
          { _id: uc._id },
          {
            $unset: {
              isInstance: 1,
              parentUCId: 1,
              additionalDevCostEur: 1,
            },
          }
        );
      }

      rolledBack++;

      if (rolledBack % 100 === 0) {
        const action = DRY_RUN ? '(DRY)' : '(REMOVED)';
        console.log(`   ✅ ${action} UC ${uc.cuId} - instance fields removed`);
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

rollbackUCInstanceFields();
