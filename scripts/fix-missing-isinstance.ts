/**
 * Fix UCs missing isInstance field
 * Safe to run multiple times (idempotent)
 * Usage: npx ts-node scripts/fix-missing-isinstance.ts
 */
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aria-audit';

async function fix() {
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected\n');

  const UC = mongoose.connection.collection('usecases');

  const missing = await UC.countDocuments({ isInstance: { $exists: false } });
  console.log(`UCs missing isInstance: ${missing}`);

  if (missing === 0) {
    console.log('✅ Nothing to fix. All UCs have isInstance field.');
    await mongoose.disconnect();
    return;
  }

  const result = await UC.updateMany(
    { isInstance: { $exists: false } },
    { $set: { isInstance: false, parentUCId: null, additionalDevCostEur: 0 } }
  );

  console.log(`✅ Fixed: ${result.modifiedCount} UCs`);
  await mongoose.disconnect();
}

fix().catch(console.error);
