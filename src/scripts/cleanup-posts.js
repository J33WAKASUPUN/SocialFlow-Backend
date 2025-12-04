const mongoose = require('mongoose');
require('dotenv').config();

const Post = require('../models/Post');
const PublishedPost = require('../models/PublishedPost');

async function cleanupAllPosts() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // 1. Show current state
    const postCount = await Post.countDocuments();
    const publishedPostCount = await PublishedPost.countDocuments();
    
    console.log('\n📊 Current State:');
    console.log(`   Posts: ${postCount}`);
    console.log(`   Published Posts: ${publishedPostCount}`);

    // 2. Group posts by status
    const postsByStatus = await Post.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    console.log('\n📁 Posts by status:');
    postsByStatus.forEach(s => {
      console.log(`   ${s._id}: ${s.count} posts`);
    });

    // 3. Confirm deletion
    console.log('\n⚠️  WARNING: This will DELETE ALL posts from:');
    console.log('   - Posts collection (drafts, scheduled, published)');
    console.log('   - PublishedPosts collection (published records)');
    console.log('\nPress Ctrl+C to cancel, or wait 5 seconds to continue...\n');

    await new Promise(resolve => setTimeout(resolve, 5000));

    // 4. Delete all posts
    console.log('🗑️  Deleting posts...');
    
    const postDeleteResult = await Post.deleteMany({});
    console.log(`✅ Deleted ${postDeleteResult.deletedCount} posts`);

    const publishedDeleteResult = await PublishedPost.deleteMany({});
    console.log(`✅ Deleted ${publishedDeleteResult.deletedCount} published posts`);

    // 5. Verify deletion
    const remainingPosts = await Post.countDocuments();
    const remainingPublished = await PublishedPost.countDocuments();

    console.log('\n📊 After Cleanup:');
    console.log(`   Remaining Posts: ${remainingPosts}`);
    console.log(`   Remaining Published Posts: ${remainingPublished}`);

    await mongoose.disconnect();
    console.log('\n✅ Cleanup complete!');
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  }
}

cleanupAllPosts();