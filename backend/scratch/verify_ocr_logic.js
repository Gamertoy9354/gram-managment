const { normalizeConfusion, normalizeOcrNumbers, verifyPaymentDetails } = require('../src/utils/ocr');

// Mock OCR outputs resembling Tesseract results on typical UPI screenshots
const sampleOcrGPay = `
G Pay
Payment to Sina AI
shismehta77@0ksbi
UPI ID: shismehta77@0ksbi
Amount: 663S.OO Rupees
TXID: GP-6635
Status: Success
Date: 2026-06-25
`;

const sampleOcrPhonePe = `
PhonePe
Transferred to
Sina AI (sh1smehta77@oksbi)
Debited: Rs. 6,635.00
Transaction ID: T260625120000006635
State: Completed
`;

function test() {
  const payeeUpi = 'shismehta77@oksbi';
  const propertyId = '6635';
  const dueAmount = '6635.00';

  console.log('--- Testing Google Pay Mock (with 0 instead of o, S instead of 5, O instead of 0) ---');
  const res1 = verifyPaymentDetails(sampleOcrGPay, payeeUpi, propertyId, dueAmount);
  console.log('Result:', res1);

  console.log('--- Testing PhonePe Mock (with 1 instead of i, comma in amount) ---');
  const res2 = verifyPaymentDetails(sampleOcrPhonePe, payeeUpi, propertyId, dueAmount);
  console.log('Result:', res2);
}

test();
