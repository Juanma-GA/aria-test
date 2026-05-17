/**
 * Migration script: fix audits with empty team[] arrays
 *
 * Problem: Before the ObjectId fix, audits created without team[] members
 * would have empty team arrays, making them inaccessible to their creators.
 *
 * Solution: Find all audits with empty team[] and add leadConsultant as 'owner'
 *
 * Safe to run multiple times (idempotent): only updates if team[] is empty
 *
 * Usage: npm run ts-node scripts/fix-empty-teams.ts
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aria-audit';

// Minimal inline schemas - no Next.js dependencies
const AuditSchema = new mongoose.Schema({
  name: String,
  auditCode: String,
  leadConsultant: mongoose.Schema.Types.ObjectId,
  team: [{
    userId: mongoose.Schema.Types.ObjectId,
    role: String,
    addedAt: Date,
    addedBy: mongoose.Schema.Types.ObjectId,
  }],
  isArchived: Boolean,
});

const Audit = mongoose.model('Audit', AuditSchema);

async function fixEmptyTeams() {
  let connection: typeof mongoose | null = null;
  try {
    console.log('🔗 Connecting to MongoDB...');
    connection = await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    console.log('🔍 Scanning for audits with empty team[] arrays...\n');

    // Find all audits where team is empty or missing
    const auditsToFix = await Audit.find({
      $or: [
        { team: { $exists: false } },
        { team: { $eq: [] } },
      ],
    }).select('_id name auditCode leadConsultant team');

    console.log(`Found ${auditsToFix.length} audit(s) with empty team[]\n`);

    if (auditsToFix.length === 0) {
      console.log('✅ No audits to fix. All audits have team members.');
      return;
    }

    // Process each audit
    let fixed = 0;
    for (const audit of auditsToFix) {
      if (!audit.leadConsultant) {
        console.log(`⚠️  SKIP: Audit ${audit.auditCode} (${audit._id}) has no leadConsultant`);
        continue;
      }

      // Ensure leadConsultant is ObjectId
      const leadId = audit.leadConsultant instanceof mongoose.Types.ObjectId
        ? audit.leadConsultant
        : new mongoose.Types.ObjectId(String(audit.leadConsultant));

      console.log(`📝 Fixing: ${audit.auditCode} - "${audit.name}"`);
      console.log(`   Adding leadConsultant (${leadId}) as 'owner' in team[]`);

      // Update the audit with leadConsultant in team[]
      await Audit.updateOne(
        { _id: audit._id },
        {
          $set: {
            team: [
              {
                userId: leadId,
                role: 'owner',
                addedAt: new Date(),
                addedBy: undefined,
              },
            ],
          },
        }
      );

      fixed++;
      console.log(`   ✅ Fixed\n`);
    }

    console.log(`\n🎉 Migration complete: ${fixed}/${auditsToFix.length} audit(s) fixed`);
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

fixEmptyTeams();

