const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { verifyPayment } = require('../src/utils/ocr');

// We will create a dummy PNG file to test the fallback flow
const dummyPngPath = path.join(__dirname, 'dummy_receipt.png');
const dummyBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function testPipeline() {
  console.log('--- Initializing OCR & Vision LLM Pipeline Test ---');

  // Write dummy PNG if it doesn't exist
  fs.writeFileSync(dummyPngPath, Buffer.from(dummyBase64, 'base64'));

  const payeeUpi = 'shismehta77@oksbi';
  const propertyId = '6635';
  const dueAmount = '6635.00';

  console.log('\nRunning unified verifyPayment gateway...');
  console.log('NVIDIA_API_KEY configured:', process.env.NVIDIA_API_KEY ? 'Yes (revealed: ' + process.env.NVIDIA_API_KEY.slice(0, 8) + '...)' : 'No');

  try {
    const result = await verifyPayment(dummyPngPath, payeeUpi, propertyId, dueAmount);
    console.log('\nPipeline result received:');
    console.log(result);
  } catch (err) {
    console.error('Pipeline run encountered an unexpected error:');
    console.error(err);
  } finally {
    // Clean up dummy PNG
    if (fs.existsSync(dummyPngPath)) {
      fs.unlinkSync(dummyPngPath);
    }
  }
}

testPipeline();
