/**
 * Migration script: add useCaseIds array to POCs
 *
 * Problem: POC schema is transitioning from single useCaseId to array useCaseIds[]
 * for future multi-usecase support. During transition, we populate useCaseIds with
 * the current useCaseId value for backward compatibility.
 *
 * Solution: For each POC with useCaseId, set useCaseIds = [useCaseId]
 * Keep useCaseId field intact for safety.
 *
 * Safe to run multiple times (idempotent): checks if useCaseIds already exists
 *
 * Usage:
 *   DRY RUN: DRY_RUN=true npx ts-node scripts/migrate-poc-usecaseids.ts
 *   REAL RUN: npx ts-node scripts/migrate-poc-usecaseids.ts
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aria-audit';
const DRY_RUN = process.env.DRY_RUN === 'true';

// Minimal inline schema - no Next.js dependencies
const POCSchema = new mongoose.Schema({
  auditId: mongoose.Schema.Types.ObjectId,
  useCaseId: mongoose.Schema.Types.ObjectId,
  useCaseIds: [mongoose.Schema.Types.ObjectId],
  pocId: String,
});

const POC = mongoose.model('POC', POCSchema);

async function migratePOCUseCaseIds() {
  let connection: typeof mongoose | null = null;
  try {
    console.log('🔗 Connecting to MongoDB...');
    connection = await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    if (DRY_RUN) {
      console.log('🧪 DRY RUN MODE - no changes will be written\n');
    }

    // Safety check: if useCaseIds already exists on any POC, warn and exit
    console.log('🔍 Checking for existing useCaseIds field...\n');
    const alreadyMigrated = await POC.countDocuments({ useCaseIds: { $exists: true } });

    if (alreadyMigrated > 0) {
      console.log(`⚠️  WARNING: ${alreadyMigrated} POC(s) already have useCaseIds field`);
      console.log('   This migration may have already been run.');
      console.log('   Exiting to prevent duplicate work.\n');
      return;
    }

    // Count total POCs to migrate
    const totalToMigrate = await POC.countDocuments({ useCaseId: { $exists: true, $ne: null } });
    console.log(`📊 Found ${totalToMigrate} POC(s) to migrate\n`);

    if (totalToMigrate === 0) {
      console.log('✅ No POCs to migrate. All done.');
      return;
    }

    // Fetch all POCs with useCaseId
    const pocsToMigrate = await POC.find({ useCaseId: { $exists: true, $ne: null } })
      .select('_id pocId useCaseId');

    let migrated = 0;
    let skipped = 0;

    for (let i = 0; i < pocsToMigrate.length; i++) {
      const poc = pocsToMigrate[i];

      if (i % 100 === 0 && i > 0) {
        console.log(`   📈 Progress: ${i}/${totalToMigrate} processed\n`);
      }

      if (!poc.useCaseId) {
        skipped++;
        continue;
      }

      const useCaseId = poc.useCaseId instanceof mongoose.Types.ObjectId
        ? poc.useCaseId
        : new mongoose.Types.ObjectId(String(poc.useCaseId));

      if (!DRY_RUN) {
        await POC.updateOne(
          { _id: poc._id },
          { $set: { useCaseIds: [useCaseId] } }
        );
      }

      migrated++;

      if ((migrated + skipped) % 100 === 0) {
        const action = DRY_RUN ? '(DRY)' : '(WRITTEN)';
        console.log(`   ✅ ${action} POC ${poc.pocId} - useCaseIds set`);
      }
    }

    console.log(`\n🎉 Migration complete:`);
    console.log(`   Total migrated: ${migrated}`);
    console.log(`   Total skipped: ${skipped}`);
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

migratePOCUseCaseIds();
