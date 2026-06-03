/**
 * Migration script: fix POCs with missing dev cost fields
 *
 * Problem: POCs created before estimatedImplWeeks, nDevs, devRateEur were
 * added to the schema don't have these fields. Newly created POCs copy them
 * from the linked UseCase during creation.
 *
 * Solution: For each POC with a useCaseId, fetch the linked UseCase and
 * copy the dev cost fields if they're missing from the POC.
 *
 * Safe to run multiple times (idempotent): only updates if fields are undefined/null
 *
 * Usage: npx ts-node scripts/fix-poc-dev-cost-fields.ts
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aria-audit';

// Minimal inline schemas - no Next.js dependencies
const POCSchema = new mongoose.Schema({
  design: {
    estimatedImplWeeks: Number,
    nDevs: Number,
    devRateEur: Number,
  },
  useCaseId: mongoose.Schema.Types.ObjectId,
});

const UseCaseSchema = new mongoose.Schema({
  estimatedImplWeeks: Number,
  nDevs: Number,
  devRateEur: Number,
});

const POC = mongoose.model('POC', POCSchema);
const UseCase = mongoose.model('UseCase', UseCaseSchema);

async function fixPOCDevCostFields() {
  let connection: typeof mongoose | null = null;
  try {
    console.log('🔗 Connecting to MongoDB...');
    connection = await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    console.log('🔍 Scanning for POCs with missing dev cost fields...\n');

    // Find all POCs with useCaseId
    const pocsToFix = await POC.find({ useCaseId: { $exists: true, $ne: null } })
      .select('_id design useCaseId');

    console.log(`Found ${pocsToFix.length} POC(s) with useCaseId\n`);

    let fixed = 0;
    for (const poc of pocsToFix) {
      const needsUpdate = !poc.design?.estimatedImplWeeks || !poc.design?.nDevs || !poc.design?.devRateEur;

      if (!needsUpdate) {
        continue;
      }

      // Fetch linked UseCase
      const useCase = await UseCase.findById(poc.useCaseId).select('estimatedImplWeeks nDevs devRateEur');

      if (!useCase) {
        console.log(`⚠️  SKIP: POC ${poc._id} - no linked UseCase found`);
        continue;
      }

      console.log(`📝 Fixing: POC ${poc._id}`);

      const $set: Record<string, any> = {};
      if (!poc.design?.estimatedImplWeeks && useCase.estimatedImplWeeks !== undefined) {
        $set['design.estimatedImplWeeks'] = useCase.estimatedImplWeeks ?? 0;
        console.log(`   Setting estimatedImplWeeks = ${$set['design.estimatedImplWeeks']}`);
      }
      if (!poc.design?.nDevs && useCase.nDevs !== undefined) {
        $set['design.nDevs'] = useCase.nDevs ?? 1;
        console.log(`   Setting nDevs = ${$set['design.nDevs']}`);
      }
      if (!poc.design?.devRateEur && useCase.devRateEur !== undefined) {
        $set['design.devRateEur'] = useCase.devRateEur ?? 450;
        console.log(`   Setting devRateEur = ${$set['design.devRateEur']}`);
      }

      if (Object.keys($set).length > 0) {
        await POC.updateOne({ _id: poc._id }, { $set });
        fixed++;
        console.log(`   ✅ Fixed\n`);
      }
    }

    console.log(`\n🎉 Migration complete: ${fixed} POC(s) fixed`);
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

fixPOCDevCostFields();
