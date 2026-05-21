/**
 * Migration script: fix processes with invalid or missing department enum values
 *
 * Problem: After the refactor, department became an enum with 13 valid values.
 * Any existing processes with empty, null, or invalid department strings need fixing.
 *
 * Solution: Find all processes with invalid department values and set to 'Other'
 *
 * Safe to run multiple times (idempotent): only updates if department is invalid
 *
 * Usage: npm run ts-node scripts/fix-process-departments.ts
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aria-audit';

const VALID_DEPARTMENTS = [
  'Technical Publications',
  'Training Development',
  'Training Delivery',
  'ISS',
  'LSA',
  'Digital',
  'Simulation',
  'General ILS',
  'Material Supply',
  'Provisioning',
  'Supply Chain',
  'D&D Engineering',
  'Other',
];

// Minimal inline schema - no Next.js dependencies
const ProcessSchema = new mongoose.Schema({
  auditId: mongoose.Schema.Types.ObjectId,
  procId: String,
  name: String,
  department: String,
});

const Process = mongoose.model('Process', ProcessSchema);

async function fixProcessDepartments() {
  let connection: typeof mongoose | null = null;
  try {
    console.log('🔗 Connecting to MongoDB...');
    connection = await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    console.log('🔍 Scanning for processes with invalid department values...\n');

    // Find all processes where department is missing, empty, or not in the valid list
    const processesToFix = await Process.find({
      $or: [
        { department: { $exists: false } },
        { department: '' },
        { department: null },
        { department: { $nin: VALID_DEPARTMENTS } },
      ],
    }).select('_id procId name department');

    console.log(`Found ${processesToFix.length} process(es) with invalid department\n`);

    if (processesToFix.length === 0) {
      console.log('✅ No processes to fix. All processes have valid departments.');
      return;
    }

    // Process each one
    let fixed = 0;
    for (const proc of processesToFix) {
      const oldDept = proc.department || '(missing)';
      console.log(`📝 Fixing: ${proc.procId} - "${proc.name}"`);
      console.log(`   Old department: "${oldDept}"`);
      console.log(`   New department: "Other"`);

      await Process.updateOne(
        { _id: proc._id },
        { $set: { department: 'Other' } }
      );

      fixed++;
      console.log(`   ✅ Fixed\n`);
    }

    console.log(`\n🎉 Migration complete: ${fixed}/${processesToFix.length} process(es) fixed`);
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

fixProcessDepartments();
