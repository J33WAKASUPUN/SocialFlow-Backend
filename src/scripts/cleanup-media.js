const mongoose = require('mongoose');
const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

const Media = require('../models/Media');
const Folder = require('../models/Folder');

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const bucketName = process.env.AWS_S3_BUCKET_NAME;

async function cleanupEverything() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // 1. Show current state
    const mediaCount = await Media.countDocuments();
    const folderCount = await Folder.countDocuments();
    
    console.log('\n📊 Current State:');
    console.log(`   Media files: ${mediaCount}`);
    console.log(`   Folders: ${folderCount}`);

    const mediaByFolder = await Media.aggregate([
      { $group: { _id: '$folder', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    console.log('\n📁 Media by folder:');
    mediaByFolder.forEach(f => {
      console.log(`   ${f._id || '(null)'}: ${f.count} files`);
    });

    // 2. Confirm deletion
    console.log('\n⚠️  WARNING: This will DELETE ALL media files from:');
    console.log('   - MongoDB Media collection');
    console.log('   - MongoDB Folder collection');
    console.log('   - AWS S3 bucket (media folder)');
    console.log('\nPress Ctrl+C to cancel, or wait 5 seconds to continue...\n');

    await new Promise(resolve => setTimeout(resolve, 5000));

    // 3. Delete all media from S3
    console.log('\n🗑️  Deleting files from S3...');
    
    try {
      // List all objects in the media folder
      const listCommand = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: 'media/', // Only media folder
      });

      const listedObjects = await s3Client.send(listCommand);

      if (listedObjects.Contents && listedObjects.Contents.length > 0) {
        const deleteParams = {
          Bucket: bucketName,
          Delete: {
            Objects: listedObjects.Contents.map(({ Key }) => ({ Key })),
          },
        };

        const deleteCommand = new DeleteObjectsCommand(deleteParams);
        await s3Client.send(deleteCommand);
        
        console.log(`✅ Deleted ${listedObjects.Contents.length} files from S3`);
      } else {
        console.log('✅ No files found in S3 media folder');
      }
    } catch (s3Error) {
      console.error('❌ S3 deletion failed:', s3Error.message);
      console.log('   You may need to delete S3 files manually');
    }

    // 4. Delete all media from MongoDB
    const deletedMedia = await Media.deleteMany({});
    console.log(`✅ Deleted ${deletedMedia.deletedCount} media records from MongoDB`);

    // 5. Delete all folders from MongoDB
    const deletedFolders = await Folder.deleteMany({});
    console.log(`✅ Deleted ${deletedFolders.deletedCount} folders from MongoDB`);

    // 6. Verify cleanup
    const remainingMedia = await Media.countDocuments();
    const remainingFolders = await Folder.countDocuments();

    console.log('\n✅ CLEANUP COMPLETE');
    console.log(`   Remaining media: ${remainingMedia}`);
    console.log(`   Remaining folders: ${remainingFolders}`);

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  }
}

cleanupEverything();