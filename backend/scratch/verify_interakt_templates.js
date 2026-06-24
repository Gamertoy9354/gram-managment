const fs = require('fs');
const path = require('path');
const twilioConfig = require('../src/config/twilio');

// Mock function to override mapMessageToTemplate inside twilio.js (or we can test it directly since it is imported/used)
// In twilio.js we replaced it. Let's see if we can run tests to verify its mappings.
const { sendMessage, sendMedia } = twilioConfig;

const mockNumber = 'whatsapp:+919876543210';

async function testTemplateMappings() {
  console.log('=== VERIFY INTERAKT TEMPLATE MAPPINGS ===\n');

  // We will intercept callInteraktAPI for testing purposes by putting a mock key or checking what twilioConfig exports or handles
  // Wait, let's temporarily inspect the mapMessageToTemplate implementation by testing its inputs and outputs.
  // We can load mapMessageToTemplate directly from the file to test it!
  const fileContent = fs.readFileSync(path.join(__dirname, '../src/config/twilio.js'), 'utf8');
  
  // Extract mapMessageToTemplate function and parsePhoneNumber from twilio.js to evaluate it directly
  const evalEnv = {};
  const extractFn = (name) => {
    const startIdx = fileContent.indexOf(`function ${name}`);
    if (startIdx === -1) throw new Error(`Could not find function ${name}`);
    
    // Find matching brace range or just evaluate everything
    let braceCount = 0;
    let inBrace = false;
    let endIdx = startIdx;
    for (let i = startIdx; i < fileContent.length; i++) {
      if (fileContent[i] === '{') {
        braceCount++;
        inBrace = true;
      } else if (fileContent[i] === '}') {
        braceCount--;
      }
      if (inBrace && braceCount === 0) {
        endIdx = i + 1;
        break;
      }
    }
    return fileContent.substring(startIdx, endIdx);
  };

  const parsePhoneNumberStr = extractFn('parsePhoneNumber');
  const mapMessageToTemplateStr = extractFn('mapMessageToTemplate');

  // Eval helpers into a local context
  const testContext = {};
  new Function('context', `${parsePhoneNumberStr}\n context.parsePhoneNumber = parsePhoneNumber;`)(testContext);
  new Function('parsePhoneNumber', 'context', `${mapMessageToTemplateStr}\n context.mapMessageToTemplate = mapMessageToTemplate;`)(testContext.parsePhoneNumber, testContext);

  const { mapMessageToTemplate } = testContext;

  const testCases = [
    {
      name: '1. Welcome Menu',
      body: '🙏 *Welcome to Sweet Village Digital Service*\n\nHow can I assist you today? Please reply with the option number:\n\n1️⃣ *Download Blank Application Forms*\n2️⃣ *Retrieve Personal Documents*\n3️⃣ *Pay Property Tax*',
      mediaUrl: null,
      expectedTemplate: 'gp_welcome_menu',
      expectedBodyValues: ['Sweet Village']
    },
    {
      name: '2. Forms List Menu',
      body: '📝 *Gram Panchayat Application Forms*\n\nAvailable forms to download:\n1️⃣ Ration Card Form\n2️⃣ Income Certificate Form\n\nReply with the *number* of the form you need.',
      mediaUrl: null,
      expectedTemplate: 'gp_forms_menu',
      expectedBodyValues: ['1️⃣ Ration Card Form\n2️⃣ Income Certificate Form']
    },
    {
      name: '3. Form Delivery',
      body: '📄 *Form:* Ration Card Form\n\n📂 *Required Documents to submit:* \nAadhaar Card\nIncome Proof\n\nNeed anything else? Reply *Yes* or *No*',
      mediaUrl: 'https://supabase.co/file.pdf',
      expectedTemplate: 'gp_form_delivery',
      expectedBodyValues: ['Ration Card Form', 'Aadhaar Card\nIncome Proof'],
      expectedHeaderValues: ['https://supabase.co/file.pdf']
    },
    {
      name: '4. Ask Name Prompt',
      body: '✅ Mobile number verified!\n\nPlease enter your *full name* as registered with the gram panchayat.',
      mediaUrl: null,
      expectedTemplate: 'gp_verify_name',
      expectedBodyValues: []
    },
    {
      name: '5. Ask Aadhaar Prompt',
      body: '✅ Name verified!\n\nPlease enter the *last 4 digits* of your Aadhaar number.',
      mediaUrl: null,
      expectedTemplate: 'gp_verify_aadhaar',
      expectedBodyValues: []
    },
    {
      name: '6. Document List Menu',
      body: '✅ *Identity verified successfully!*\n\nYour available documents:\n1️⃣ Birth Certificate\n2️⃣ Aadhaar Copy\n\nReply with the *number* of the document you need.',
      mediaUrl: null,
      expectedTemplate: 'gp_document_menu',
      expectedBodyValues: ['1️⃣ Birth Certificate\n2️⃣ Aadhaar Copy']
    },
    {
      name: '7. Document Delivery',
      body: '📄 Here is your *Birth Certificate*\n\n🔒 This PDF is password-protected...\nNeed another document? Reply *Yes* or *No*',
      mediaUrl: 'https://supabase.co/doc.pdf',
      expectedTemplate: 'gp_document_delivery',
      expectedBodyValues: ['Birth Certificate'],
      expectedHeaderValues: ['https://supabase.co/doc.pdf']
    },
    {
      name: '8. Outstanding Property Tax Dues Notification',
      body: 'Dear Dinesh Patel,\nProperty tax is outstanding for Property ID: *MILKAT-102*.\n\n💰 *Outstanding Due Amount:* ₹1,250.00\n\nPlease complete your payment online:\n🔗 https://rzp.io/i/mock_tax_abc',
      mediaUrl: null,
      expectedTemplate: 'p_tax_outstanding_alert',
      expectedBodyValues: ['Dinesh Patel', 'MILKAT-102', '1,250.00', 'https://rzp.io/i/mock_tax_abc'],
      expectedHeaderValues: ['https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=https%3A%2F%2Frzp.io%2Fi%2Fmock_tax_abc']
    },
    {
      name: '9. Tax Receipt Confirmation Delivery',
      body: '🎉 *Property Tax Payment Confirmed!*\n\n🏠 *Property ID:* MILKAT-102\n👤 *Name:* Dinesh Patel\n💰 *Amount Paid:* ₹1,250.00\n🔒 *Payment ID:* pay_12345\n\nAttached is your receipt.',
      mediaUrl: 'https://supabase.co/receipt.pdf',
      expectedTemplate: 'gp_tax_payment_receipt',
      expectedBodyValues: ['MILKAT-102', 'Dinesh Patel', '1,250.00', 'pay_12345'],
      expectedHeaderValues: ['https://supabase.co/receipt.pdf']
    },
    {
      name: '10. Cooldown Access Blocked',
      body: '⛔ *Access temporarily blocked* due to too many failed attempts.\n\nPlease try again in *29 minutes* or contact...',
      mediaUrl: null,
      expectedTemplate: 'gp_cooldown_blocked',
      expectedBodyValues: ['29']
    },
    {
      name: '11. Mobile Number Not Registered Error',
      body: '❌ *Mobile number not found* in our records.\n\nPlease contact your gram panchayat office:\n📞 +91-9876543210\n🕐 10 AM - 5 PM (Mon–Sat)',
      mediaUrl: null,
      expectedTemplate: 'gp_mobile_not_found',
      expectedBodyValues: ['+91-9876543210', '10 AM - 5 PM']
    },
    {
      name: '12. Custom Circular Broadcast Message',
      body: 'Namaskar Dinesh Patel,\nThis is an official announcement from your Gram Panchayat. Please review the details below.\n\nDhanyawad!',
      mediaUrl: 'https://supabase.co/announcement.jpg',
      expectedTemplate: 'gp_broadcast_circular',
      expectedBodyValues: ['Dinesh Patel'],
      expectedHeaderValues: ['https://supabase.co/announcement.jpg']
    },
    {
      name: '13. Fallback - Generic Text Notification',
      body: 'Some arbitrary text that does not match any predefined parsing logic.',
      mediaUrl: null,
      expectedTemplate: 'gp_generic_notification',
      expectedBodyValues: ['Some arbitrary text that does not match any predefined parsing logic.']
    }
  ];

  let successCount = 0;
  for (const tc of testCases) {
    try {
      const result = mapMessageToTemplate(mockNumber, tc.body, tc.mediaUrl);
      
      const tNameMatch = result.template.name === tc.expectedTemplate;
      const bValsMatch = JSON.stringify(result.template.bodyValues) === JSON.stringify(tc.expectedBodyValues);
      
      let hValsMatch = true;
      if (tc.expectedHeaderValues) {
        hValsMatch = JSON.stringify(result.template.headerValues) === JSON.stringify(tc.expectedHeaderValues);
      }

      if (tNameMatch && bValsMatch && hValsMatch) {
        console.log(`✓ Passed: ${tc.name}`);
        successCount++;
      } else {
        console.error(`❌ Failed: ${tc.name}`);
        console.error('  Expected Template:', tc.expectedTemplate, 'Got:', result.template.name);
        console.error('  Expected Body:', tc.expectedBodyValues, 'Got:', result.template.bodyValues);
        if (tc.expectedHeaderValues) {
          console.error('  Expected Header:', tc.expectedHeaderValues, 'Got:', result.template.headerValues);
        }
      }
    } catch (err) {
      console.error(`❌ Exception in test case: ${tc.name}`, err.message);
    }
  }

  console.log(`\nResults: ${successCount} / ${testCases.length} tests passed successfully.`);
  if (successCount === testCases.length) {
    console.log('\n🌟 ALL TEMPLATE PARSING INTEGRATION TESTS PASSED PERFECTLY!');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

testTemplateMappings().catch(err => {
  console.error(err);
  process.exit(1);
});
