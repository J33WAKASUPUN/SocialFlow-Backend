const mongoose = require('mongoose');
require('dotenv').config();
const Media = require('../models/Media');

async function migrateFolders() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // ✅ FIX ALL VARIATIONS
    const updates = [
      // uncategorized → Default
      await Media.updateMany(
        { folder: 'uncategorized' },
        { $set: { folder: 'Default' } }
      ),
      
      // default (lowercase) → Default
      await Media.updateMany(
        { folder: 'default' },
        { $set: { folder: 'Default' } }
      ),
      
      // null or empty → Default
      await Media.updateMany(
        { $or: [{ folder: null }, { folder: '' }] },
        { $set: { folder: 'Default' } }
      ),
    ];

    const totalUpdated = updates.reduce((sum, r) => sum + r.modifiedCount, 0);
    console.log(`✅ Updated ${totalUpdated} media items to "Default" folder`);

    // ✅ SHOW CURRENT FOLDER DISTRIBUTION
    const distribution = await Media.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$folder', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    console.log('\n📊 Current folder distribution:');
    distribution.forEach(d => {
      console.log(`   ${d._id}: ${d.count} files`);
    });

    await mongoose.disconnect();
    console.log('\n✅ Migration complete');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrateFolders();