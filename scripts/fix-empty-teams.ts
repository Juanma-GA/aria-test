/**
 * Migration script: fix audits with empty team[] arrays
 *
 * Problem: Before this fix, audits created without the leadConsultant in team[]
 * would have empty team arrays, making them inaccessible to the creator.
 *
 * Solution: Find all audits with empty team[] and add leadConsultant as 'owner'
 *
 * Safe to run multiple times (idempotent): only updates if team[] is empty
 */

import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import { Audit } from '@/lib/models';

async function fixEmptyTeams() {
  try {
    await dbConnect();
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
      await mongoose.connection.close();
      return;
    }

    // Process each audit
    let fixed = 0;
    for (const audit of auditsToFix) {
      if (!audit.leadConsultant) {
        console.log(`⚠️  SKIP: Audit ${audit.auditCode} (${audit._id}) has no leadConsultant`);
        continue;
      }

      // Convert leadConsultant to ObjectId if needed
      const leadId = audit.leadConsultant instanceof mongoose.Types.ObjectId
        ? audit.leadConsultant
        : new mongoose.Types.ObjectId(String(audit.leadConsultant));

      console.log(`📝 Fixing: ${audit.auditCode} - "${audit.name}"`);
      console.log(`   Adding leadConsultant (${leadId}) as 'owner' in team[]`);

      audit.team = [
        {
          userId: leadId,
          role: 'owner',
          addedAt: new Date(),
          addedBy: undefined,
        },
      ] as any;

      await audit.save();
      fixed++;
      console.log(`   ✅ Fixed\n`);
    }

    console.log(`\n🎉 Migration complete: ${fixed}/${auditsToFix.length} audit(s) fixed`);
    await mongoose.connection.close();
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  fixEmptyTeams();
}

export { fixEmptyTeams };
