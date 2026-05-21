import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import { Process } from '@/lib/models';

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

async function fixProcessDepartments() {
  try {
    await dbConnect();
    console.log('Connected to MongoDB');

    const processes = await Process.find({}).lean();
    console.log(`Found ${processes.length} processes`);

    let fixed = 0;
    let invalid = 0;

    for (const proc of processes) {
      const dept = (proc as any).department;

      if (!dept || !VALID_DEPARTMENTS.includes(dept)) {
        invalid++;
        await Process.updateOne(
          { _id: proc._id },
          { $set: { department: 'Other' } }
        );
        console.log(`Fixed process ${(proc as any).procId}: department set to 'Other' (was: '${dept}')`);
        fixed++;
      }
    }

    console.log(`\nMigration complete:`);
    console.log(`  Total processes: ${processes.length}`);
    console.log(`  Fixed: ${fixed}`);
    console.log(`  Invalid departments found and fixed: ${invalid}`);

    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

fixProcessDepartments();
