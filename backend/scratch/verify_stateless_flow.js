const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { supabaseAdmin } = require('../src/config/supabase');
const twilioConfig = require('../src/config/twilio');

// Save original Twilio methods
const originalSendMessage = twilioConfig.sendMessage;
const originalSendMedia = twilioConfig.sendMedia;

let botReplies = [];

// Mock Twilio send methods to capture replies
twilioConfig.sendMessage = async (to, body) => {
  botReplies.push({ type: 'text', to, body });
  console.log(`🤖 [Bot Reply to ${to}]:\n${body}\n------------------------------`);
  return { sid: 'MOCK_SMS_SID', status: 'mock' };
};

twilioConfig.sendMedia = async (to, body, mediaUrl) => {
  botReplies.push({ type: 'media', to, body, mediaUrl });
  console.log(`🤖 [Bot Media Reply to ${to}] (URL: ${mediaUrl}):\n${body}\n------------------------------`);
  return { sid: 'MOCK_MEDIA_SID', status: 'mock' };
};

const conversationController = require('../src/controllers/conversationController');
const { deleteSession } = require('../src/services/sessionManager');
const fs = require('fs');

async function main() {
  const testMobile = '9924878518';
  const testFrom = `whatsapp:+91${testMobile}`;
  const testPropertyId = '6658';
  
  // Override environment variable for Payee UPI ID temporarily to match the dummy text in the screenshot
  process.env.PAYEE_UPI_ID = 'shis@oksbi';
  process.env.PAYEE_NAME = 'Sina AI';

  console.log('1. Preparing database: Clean up existing sessions/records for test number...');
  await deleteSession(testFrom);
  await supabaseAdmin.from('tax_records').delete().eq('property_id', testPropertyId);
  console.log('✓ Cleanup done!');

  console.log('\n2a. Creating a false-positive pending tax record for Property ID "5" (amount 15.00)...');
  await supabaseAdmin.from('tax_records').delete().eq('property_id', '5');
  const { error: dbErr5 } = await supabaseAdmin
    .from('tax_records')
    .insert({
      property_id: '5',
      owner_name: 'False Positive Owner',
      mobile_number: testMobile,
      due_amount: 15.00,
      payment_status: 'pending'
    });
  if (dbErr5) {
    console.error('❌ Failed to insert pending tax record 5:', dbErr5.message);
    process.exit(1);
  }
  console.log('✓ Pending tax record 5 created!');

  // Mock downloadFile so it simply copies our local screenshot artifact rather than requesting from Twilio
  const originalDownloadFile = conversationController.__proto__.downloadFile;
  
  console.log('\n3. Starting local mock HTTP server to serve the screenshot...');
  const http = require('http');
  const mockServer = http.createServer((req, res) => {
    // Serve the image artifact
    const imgPath = 'C:\\Users\\SANJAY RATHOD\\.gemini\\antigravity-ide\\brain\\6bf75889-47da-4342-b836-502c9c70ccfd\\media__1781538212266.png';
    res.writeHead(200, { 'Content-Type': 'image/png' });
    fs.createReadStream(imgPath).pipe(res);
  });
  
  await new Promise(resolve => mockServer.listen(0, '127.0.0.1', resolve));
  const port = mockServer.address().port;
  const mockMediaUrl = `http://127.0.0.1:${port}/screenshot.png`;
  console.log(`✓ Mock HTTP server listening on ${mockMediaUrl}`);

  console.log('\n4a. Verifying false-positive prevention (sending receipt that contains "5" inside phone number)...');
  botReplies = [];
  await conversationController.handleMessage(testFrom, 'Paid using Google Pay! ✅', 'sid_test_123', mockMediaUrl, 'image/png');

  const falsePositiveReply = botReplies.find(r => r.body && r.body.includes('Property ID 5'));
  if (falsePositiveReply) {
    console.error('❌ FAILURE: The bot incorrectly matched Property ID "5" because of the phone number!');
    mockServer.close();
    await supabaseAdmin.from('tax_records').delete().eq('property_id', '5');
    process.exit(1);
  }
  console.log('✓ SUCCESS: The bot correctly ignored Property ID "5" because it was not a standalone word.');

  // Clean up record 5
  await supabaseAdmin.from('tax_records').delete().eq('property_id', '5');

  console.log('\n4b. Creating a correct pending tax record in Supabase (Property ID "6658")...');
  const { error: dbErr } = await supabaseAdmin
    .from('tax_records')
    .insert({
      property_id: testPropertyId,
      owner_name: 'Shis Tushar Maheta',
      mobile_number: testMobile,
      due_amount: 1.00, // Matches the am=1.00 in the screenshot text
      payment_status: 'pending'
    });

  if (dbErr) {
    console.error('❌ Failed to insert pending tax record:', dbErr.message);
    mockServer.close();
    process.exit(1);
  }
  console.log('✓ Correct pending tax record created successfully!');

  console.log('\n4c. Simulating first-time incoming screenshot message for correct record...');
  botReplies = [];
  await conversationController.handleMessage(testFrom, 'Paid using Google Pay! ✅', 'sid_test_124', mockMediaUrl, 'image/png');

  console.log('\n5. Verifying DB status has updated to PAID...');
  const { data: record, error: getErr } = await supabaseAdmin
    .from('tax_records')
    .select('*')
    .eq('property_id', testPropertyId)
    .single();

  if (getErr || !record) {
    console.error('❌ Failed to retrieve tax record after OCR flow:', getErr ? getErr.message : 'Not found');
    mockServer.close();
    process.exit(1);
  }

  console.log(`Payment Status: ${record.payment_status}`);
  console.log(`Payment ID: ${record.razorpay_payment_id}`);

  // Shut down server
  mockServer.close();

  if (record.payment_status === 'paid') {
    console.log('\n🌟 STATELESS OCR PIPELINE VERIFICATION SUCCESSFUL!');
    
    // Clean up
    await supabaseAdmin.from('tax_records').delete().eq('property_id', testPropertyId);
    await deleteSession(testFrom);
    process.exit(0);
  } else {
    console.error('\n❌ DB record not updated to paid.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error in test:', err);
  process.exit(1);
});
