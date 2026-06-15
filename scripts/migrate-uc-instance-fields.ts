/**
 * Migration script: add instance-related fields to UseCases
 *
 * Problem: UseCase schema is being extended to support instance UCs (variants
 * of a parent UC). New fields are: isInstance, parentUCId, additionalDevCostEur
 *
 * Solution: For all existing UseCases, set:
 * - isInstance = false (all existing UCs are originals, not instances)
 * - parentUCId = null (no parent)
 * - additionalDevCostEur = 0 (no additional cost)
 *
 * Safe to run multiple times (idempotent): checks if isInstance already exists
 *
 * Usage:
 *   DRY RUN: DRY_RUN=true npx ts-node scripts/migrate-uc-instance-fields.ts
 *   REAL RUN: npx ts-node scripts/migrate-uc-instance-fields.ts
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aria-audit';
const DRY_RUN = process.env.DRY_RUN === 'true';

// Minimal inline schema - no Next.js dependencies
const UseCaseSchema = new mongoose.Schema({
  auditId: mongoose.Schema.Types.ObjectId,
  cuId: String,
  isInstance: Boolean,
  parentUCId: mongoose.Schema.Types.ObjectId,
  additionalDevCostEur: Number,
});

const UseCase = mongoose.model('UseCase', UseCaseSchema);

async function migrateUCInstanceFields() {
  let connection: typeof mongoose | null = null;
  try {
    console.log('🔗 Connecting to MongoDB...');
    connection = await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    if (DRY_RUN) {
      console.log('🧪 DRY RUN MODE - no changes will be written\n');
    }

    // Safety check: if isInstance already exists on any UC, warn and exit
    console.log('🔍 Checking for existing isInstance field...\n');
    const alreadyMigrated = await UseCase.countDocuments({ isInstance: { $exists: true } });

    if (alreadyMigrated > 0) {
      console.log(`⚠️  WARNING: ${alreadyMigrated} UseCase(s) already have isInstance field`);
      console.log('   This migration may have already been run.');
      console.log('   Exiting to prevent duplicate work.\n');
      return;
    }

    // Count total UseCases to migrate
    const totalToMigrate = await UseCase.countDocuments({});
    console.log(`📊 Found ${totalToMigrate} UseCase(s) to migrate\n`);

    if (totalToMigrate === 0) {
      console.log('✅ No UseCases to migrate. All done.');
      return;
    }

    // Fetch all UseCases
    const useCasesToMigrate = await UseCase.find({})
      .select('_id cuId isInstance parentUCId additionalDevCostEur');

    let migrated = 0;

    for (let i = 0; i < useCasesToMigrate.length; i++) {
      const uc = useCasesToMigrate[i];

      if (i % 100 === 0 && i > 0) {
        console.log(`   📈 Progress: ${i}/${totalToMigrate} processed\n`);
      }

      const $set = {
        isInstance: false,
        parentUCId: null,
        additionalDevCostEur: 0,
      };

      if (!DRY_RUN) {
        await UseCase.updateOne({ _id: uc._id }, { $set });
      }

      migrated++;

      if (migrated % 100 === 0) {
        const action = DRY_RUN ? '(DRY)' : '(WRITTEN)';
        console.log(`   ✅ ${action} UC ${uc.cuId} - instance fields initialized`);
      }
    }

    console.log(`\n🎉 Migration complete:`);
    console.log(`   Total migrated: ${migrated}`);
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

migrateUCInstanceFields();
