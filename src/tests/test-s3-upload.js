require('dotenv').config();
const s3Service = require('./src/services/s3Service');
const path = require('path');
const fs = require('fs');

/**
 * Test S3 Upload Script
 * Tests if AWS S3 upload is working correctly
 */

async function testS3Upload() {
  console.log('🧪 Starting S3 Upload Test...\n');

  // Step 1: Check environment variables
  console.log('📋 Step 1: Checking AWS credentials...');
  console.log('✅ AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID?.substring(0, 10) + '...');
  console.log('✅ AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY?.substring(0, 10) + '...');
  console.log('✅ AWS_REGION:', process.env.AWS_REGION);
  console.log('✅ AWS_S3_BUCKET_NAME:', process.env.AWS_S3_BUCKET_NAME);
  console.log('');

  // Step 2: Test S3 connection
  console.log('📋 Step 2: Testing S3 connection...');
  const isConnected = await s3Service.testConnection();
  
  if (!isConnected) {
    console.error('❌ S3 connection test failed!');
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Check AWS credentials in .env file');
    console.log('2. Verify S3 bucket exists in AWS Console');
    console.log('3. Check IAM user has S3 permissions');
    process.exit(1);
  }
  
  console.log('✅ S3 connection successful!\n');

  // Step 3: Create a test image file
  console.log('📋 Step 3: Creating test image...');
  
  const testImagePath = path.join(__dirname, 'uploads', 'media', 'test-image.jpg');
  const uploadsDir = path.join(__dirname, 'uploads', 'media');
  
  // Ensure directory exists
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Create a simple test file (1x1 pixel red JPEG)
  const testImageBuffer = Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/8A/9k=',
    'base64'
  );

  fs.writeFileSync(testImagePath, testImageBuffer);
  console.log('✅ Test image created:', testImagePath);
  console.log('📏 File size:', (testImageBuffer.length / 1024).toFixed(2) + ' KB\n');

  // Step 4: Upload to S3
  console.log('📋 Step 4: Uploading image to S3...');
  
  try {
    const uploadResult = await s3Service.uploadImage(testImagePath, {
      provider: 'test',
      brandName: 'Test Brand',
      testUpload: true,
    });

    console.log('✅ Upload successful!\n');
    console.log('📊 Upload Details:');
    console.log('   S3 URL:', uploadResult.url);
    console.log('   S3 Key:', uploadResult.key);
    console.log('   Bucket:', uploadResult.bucket);
    console.log('   File Name:', uploadResult.fileName);
    console.log('   Original Name:', uploadResult.originalName);
    console.log('   Size:', (uploadResult.size / 1024).toFixed(2) + ' KB');
    console.log('   Content Type:', uploadResult.contentType);
    console.log('');

    // Step 5: Verify file is accessible
    console.log('📋 Step 5: Verifying uploaded file...');
    const axios = require('axios');
    
    try {
      const response = await axios.head(uploadResult.url, { timeout: 5000 });
      
      console.log('✅ File is publicly accessible!');
      console.log('   HTTP Status:', response.status);
      console.log('   Content Type:', response.headers['content-type']);
      console.log('   Content Length:', response.headers['content-length'], 'bytes');
    } catch (verifyError) {
      console.warn('⚠️ File uploaded but verification failed:', verifyError.message);
      console.log('   This might be a CORS or permissions issue.');
      console.log('   Check S3 bucket policy and CORS settings.');
    }

    console.log('\n🎉 S3 UPLOAD TEST COMPLETED SUCCESSFULLY!\n');
    
    console.log('📋 Next Steps:');
    console.log('1. Open this URL in your browser:');
    console.log('   ' + uploadResult.url);
    console.log('2. You should see a 1x1 red pixel image');
    console.log('3. If you see the image, S3 is working correctly!');
    console.log('4. The local test file has been deleted automatically\n');

    return uploadResult;

  } catch (uploadError) {
    console.error('❌ Upload failed:', uploadError.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Check IAM user permissions (needs s3:PutObject)');
    console.log('2. Verify bucket name is correct');
    console.log('3. Check bucket region matches AWS_REGION in .env');
    console.log('4. Review error details above');
    
    // Clean up test file if upload failed
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
      console.log('\n🗑️ Cleaned up test file');
    }
    
    throw uploadError;
  }
}

// Run the test
testS3Upload()
  .then((result) => {
    console.log('✅ Test passed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });