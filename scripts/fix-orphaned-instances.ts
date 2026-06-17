/**
 * Repair UC instances whose parentUCId no longer exists (parent was deleted
 * before the DELETE handler started blocking that case).
 *
 * Repair action: convert the orphaned instance back to a normal UC
 * (isInstance=false, parentUCId=null). Does NOT delete anything — the
 * instance may still have its own data/POCs.
 *
 * Safe to run multiple times (idempotent).
 *
 * Usage:
 * - Dry run (scan only, default): npx tsx scripts/fix-orphaned-instances.ts
 * - Apply repair:                  npx tsx scripts/fix-orphaned-instances.ts --apply
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aria-audit';

interface OrphanedInstance {
  _id: mongoose.Types.ObjectId;
  cuId: string;
  auditId: mongoose.Types.ObjectId;
  parentUCId: mongoose.Types.ObjectId;
  description: string;
}

async function findOrphanedInstances(
  collection: mongoose.Collection,
): Promise<OrphanedInstance[]> {
  const orphans = await collection
    .aggregate([
      { $match: { isInstance: true, parentUCId: { $ne: null } } },
      {
        $lookup: {
          from: 'usecases',
          localField: 'parentUCId',
          foreignField: '_id',
          as: 'parent',
        },
      },
      { $match: { parent: { $size: 0 } } },
      {
        $project: {
          _id: 1,
          cuId: 1,
          auditId: 1,
          parentUCId: 1,
          description: { $substrCP: ['$description', 0, 60] },
        },
      },
    ])
    .toArray();

  return orphans as unknown as OrphanedInstance[];
}

async function fixOrphanedInstances(apply: boolean) {
  let connection: typeof mongoose | null = null;
  try {
    const mongoHost = new URL(MONGODB_URI).hostname || 'localhost';
    console.log('🔗 Connecting to MongoDB...');
    connection = await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    if (apply) {
      console.log(`⚠️  APPLY MODE — writing changes to ${mongoHost}\n`);
    } else {
      console.log('🔍 DRY RUN — no changes will be written\n');
    }

    const collection = connection.connection.collection('usecases');
    const orphans = await findOrphanedInstances(collection);

    console.log(`📊 Found ${orphans.length} orphaned instance(s)\n`);

    if (orphans.length === 0) {
      console.log('✓ Nothing to fix.');
      return;
    }

    for (const uc of orphans) {
      console.log(`   ${uc.cuId} (audit: ${uc.auditId})`);
      console.log(`     parentUCId (missing): ${uc.parentUCId}`);
      console.log(`     description: ${uc.description}`);
    }

    if (!apply) {
      console.log(
        '\n💡 Run with --apply to convert these instances back to normal UCs:',
      );
      console.log('   npx tsx scripts/fix-orphaned-instances.ts --apply');
      return;
    }

    const result = await collection.updateMany(
      { _id: { $in: orphans.map((o) => o._id) } },
      { $set: { isInstance: false, parentUCId: null } },
    );

    console.log(`\n✅ Converted ${result.modifiedCount} instance(s) to normal UCs.`);
  } finally {
    if (connection) {
      await mongoose.disconnect();
      console.log('\n🔌 Disconnected from MongoDB');
    }
  }
}

const args = process.argv.slice(2);
const apply = args.includes('--apply');

fixOrphanedInstances(apply)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Script failed:', err);
    process.exit(1);
  });
