/**
 * Migration script: fix audits with missing projectType
 *
 * Problem: Audits created BEFORE the projectType field was added have
 * undefined projectType in MongoDB, so they don't get TechPubs reference
 * injection even though techpubs is our most common project type.
 *
 * Solution: Find all audits with missing/undefined projectType and set
 * projectType: 'techpubs' as the default.
 *
 * Safe to run multiple times (idempotent): only updates if projectType is missing
 *
 * Usage: npm run ts-node scripts/fix-project-types.ts
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aria-audit';

// Minimal inline schemas - no Next.js dependencies
const AuditSchema = new mongoose.Schema({
  name: String,
  auditCode: String,
  projectType: String,
  isArchived: Boolean,
});

const Audit = mongoose.model('Audit', AuditSchema);

async function fixProjectTypes() {
  let connection: typeof mongoose | null = null;
  try {
    console.log('🔗 Connecting to MongoDB...');
    connection = await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    console.log('🔍 Scanning for audits with missing projectType...\n');

    // Find all audits where projectType is missing or undefined
    const auditsToFix = await Audit.find({
      $or: [
        { projectType: { $exists: false } },
        { projectType: null },
        { projectType: { $eq: '' } },
      ],
    }).select('_id name auditCode projectType');

    console.log(`Found ${auditsToFix.length} audit(s) with missing projectType\n`);

    if (auditsToFix.length === 0) {
      console.log('✅ No audits to fix. All audits have projectType set.');
      return;
    }

    // Show what will be updated
    console.log('📋 Audits to update:');
    for (const audit of auditsToFix) {
      console.log(`   • ${audit.auditCode} - "${audit.name}" (current: ${audit.projectType || 'undefined'})`);
    }
    console.log('');

    // Process each audit
    let fixed = 0;
    for (const audit of auditsToFix) {
      console.log(`📝 Updating: ${audit.auditCode} - "${audit.name}"`);
      console.log(`   Setting projectType → 'techpubs'`);

      await Audit.updateOne(
        { _id: audit._id },
        {
          $set: {
            projectType: 'techpubs',
          },
        }
      );

      fixed++;
      console.log(`   ✅ Updated\n`);
    }

    console.log(`\n🎉 Migration complete: ${fixed}/${auditsToFix.length} audit(s) updated`);
    console.log(`\n💡 All audits now have projectType set, and will receive TechPubs`);
    console.log(`   reference context when generating AI suggestions.`);
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

fixProjectTypes();
