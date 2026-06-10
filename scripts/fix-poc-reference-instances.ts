/**
 * Migration script: enforce POC composition rule
 *
 * Rule: 1 reference UC (any normal UC) + N instances of that reference
 * - useCaseIds[0] = reference UC (must have isInstance=false)
 * - useCaseIds[1..n] = instances of reference (must have isInstance=true, parentUCId=reference._id)
 *
 * For each active POC:
 * - Reference = first UC in poc.useCaseIds order whose isInstance is false
 * - Remove non-instances and instances of different refs
 * - Revert removed UCs to 'eligible' if not in other active POCs
 *
 * Safe to run multiple times (idempotent)
 *
 * Usage: npx ts-node scripts/fix-poc-reference-instances.ts
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aria-audit';

const UseCaseSchema = new mongoose.Schema({
  cuId: String,
  status: String,
  isInstance: Boolean,
  parentUCId: mongoose.Schema.Types.ObjectId,
  isArchived: Boolean,
});

const POCSchema = new mongoose.Schema({
  useCaseIds: [mongoose.Schema.Types.ObjectId],
  useCaseId: mongoose.Schema.Types.ObjectId,
  isArchived: Boolean,
});

const UseCase = mongoose.model('UseCase', UseCaseSchema);
const POC = mongoose.model('POC', POCSchema);

async function enforceCompositionRule() {
  let connection: typeof mongoose | null = null;
  try {
    console.log('🔗 Connecting to MongoDB...');
    connection = await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    console.log('🔍 Scanning for POC composition violations...\n');

    const pocs = await POC.find({ isArchived: { $ne: true } })
      .select('_id useCaseIds useCaseId');

    console.log(`Found ${pocs.length} non-archived POC(s)\n`);

    let compliant = 0;
    let violations = 0;

    for (const poc of pocs) {
      const ids = (poc as any).useCaseIds as any[] ?? [];

      // Fallback to legacy useCaseId if useCaseIds empty
      const useCaseIds = ids.length > 0
        ? ids
        : ((poc as any).useCaseId ? [(poc as any).useCaseId] : []);

      if (useCaseIds.length === 0) {
        console.log(`⏭️  Skipping POC ${poc._id}: no use cases\n`);
        continue;
      }

      // Fetch all UCs with full metadata
      const ucs = await UseCase.find({ _id: { $in: useCaseIds } })
        .select('_id cuId isInstance parentUCId')
        .lean() as any[];

      const ucMap = new Map(ucs.map(u => [String(u._id), u]));

      // Find reference: first UC in poc.useCaseIds order whose isInstance is false
      let reference = null;
      for (const ucId of useCaseIds) {
        const uc = ucMap.get(String(ucId));
        if (uc && !uc.isInstance) {
          reference = uc;
          break;
        }
      }

      if (!reference) {
        console.log(`⚠️  POC ${poc._id}: no normal UC found (all are instances). Cannot enforce rule.\n`);
        violations++;
        continue;
      }

      const referenceId = reference._id;
      const valid: any[] = [];
      const removed: any[] = [];

      for (const ucId of useCaseIds) {
        const uc = ucMap.get(String(ucId));
        if (!uc) continue;

        if (String(uc._id) === String(referenceId)) {
          valid.push(uc._id);
        } else if (uc.isInstance && String(uc.parentUCId) === String(referenceId)) {
          valid.push(uc._id);
        } else {
          removed.push(uc);
        }
      }

      if (removed.length > 0) {
        console.log(`📝 POC ${poc._id}:`);
        console.log(`   Reference: ${reference.cuId}`);
        console.log(`   Keeping: ${valid.length} UC(s)`);
        console.log(`   Removing ${removed.length} invalid UC(s):`);

        for (const removedUC of removed) {
          console.log(`     - ${removedUC.cuId} (${removedUC.isInstance ? 'instance of different ref' : 'not an instance'})`);

          const otherPocsCount = await POC.countDocuments({
            $or: [
              { useCaseIds: { $in: [removedUC._id, String(removedUC._id)] } },
              { useCaseId: { $in: [removedUC._id, String(removedUC._id)] } }
            ],
            isArchived: { $ne: true },
            _id: { $ne: poc._id }
          });

          if (otherPocsCount === 0) {
            await UseCase.updateOne(
              { _id: removedUC._id },
              { $set: { status: 'eligible' } }
            );
            console.log(`       ✓ Reverted to 'eligible'`);
          } else {
            console.log(`       ✓ Kept 'in_poc' (in ${otherPocsCount} other POC(s))`);
          }
        }

        await POC.collection.updateOne(
          { _id: poc._id },
          { $set: { useCaseIds: valid } }
        );
        console.log();
        violations++;
      } else {
        compliant++;
      }
    }

    console.log(`\n🎉 Composition rule enforcement complete:`);
    console.log(`   Already compliant: ${compliant}`);
    console.log(`   Violations fixed: ${violations}`);

    await connection?.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

enforceCompositionRule();
