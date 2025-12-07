const mongoose = require('mongoose');
require('dotenv').config();
const Media = require('../models/Media');

async function fixMediaFolders() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // 1. Show current distribution
    const before = await Media.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$folder', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    console.log('\n📊 BEFORE - Folder distribution:');
    before.forEach(f => console.log(`   ${f._id || '(null)'}: ${f.count} files`));

    // 2. Fix all variations to "Default"
    const updates = [
      // null/empty → Default
      await Media.updateMany(
        { $or: [{ folder: null }, { folder: '' }] },
        { $set: { folder: 'Default' } }
      ),
      
      // lowercase "default" → "Default"
      await Media.updateMany(
        { folder: 'default' },
        { $set: { folder: 'Default' } }
      ),
      
      // "uncategorized" → "Default"
      await Media.updateMany(
        { folder: 'uncategorized' },
        { $set: { folder: 'Default' } }
      ),
    ];

    const totalFixed = updates.reduce((sum, r) => sum + r.modifiedCount, 0);
    console.log(`\n✅ Fixed ${totalFixed} media items`);

    // 3. Show after distribution
    const after = await Media.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$folder', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    console.log('\n📊 AFTER - Folder distribution:');
    after.forEach(f => console.log(`   ${f._id}: ${f.count} files`));

    await mongoose.disconnect();
    console.log('\n✅ Migration complete');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

fixMediaFolders();