const { STEPS, getSession, createSession, updateSession, deleteSession } = require('../services/sessionManager');
const { isBlocked, recordFailedAttempt, verifyMobile, verifyName, verifyAadhaar, logTransaction } = require('../services/authService');
const { listDocuments, downloadDocument } = require('../services/driveService');
const { protectPDF } = require('../services/pdfService');
const { sendMessage, sendMedia, sendTemplateMessage } = require('../config/twilio');
const { generateEReceipt, saveReceiptForDelivery } = require('../services/receiptService');
const { validateMobile, validateAadhaar, validateName, validateDocumentChoice } = require('../utils/validators');
const { normalizeAadhaar, encrypt, maskAadhaar } = require('../utils/encryption');
const { supabaseAdmin } = require('../config/supabase');
const { getPanchayatConfig } = require('../config/panchayat');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const https = require('https');
const QRCode = require('qrcode');
const { performOCR, matchesPropertyId, verifyPayment, verifyPaymentDetails } = require('../utils/ocr');

/**
 * Downloads a file from a URL, automatically following HTTP redirects.
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    
    function get(requestUrl) {
      const urlObj = new URL(requestUrl);
      const options = {};
      
      // Twilio requires basic auth for media downloads.
      // Do NOT forward the Authorization header to external domains (like AWS S3 redirects) to avoid 400 errors.
      if (urlObj.hostname.endsWith('twilio.com')) {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        if (accountSid && authToken) {
          options.headers = {
            'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64')
          };
        }
      }
      
      const httpModule = requestUrl.startsWith('https') ? https : require('http');
      httpModule.get(requestUrl, options, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          const redirectUrl = new URL(response.headers.location, requestUrl).href;
          get(redirectUrl);
          return;
        }
        
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download file: Status Code ${response.statusCode}`));
          return;
        }
        
        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          resolve(destPath);
        });
      }).on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    }
    
    get(url);
  });
}



// ─── Message Templates ─────────────────────────────────────────────────────────

const MSG = {
  welcome: (name = 'Sample Gram Panchayat') =>
    `🙏 *Welcome to ${name} Digital Service*\n\n` +
    `How can I assist you today? Please reply with the option number:\n\n` +
    `1️⃣ *Download Blank Application Forms* (No login required)\n` +
    `2️⃣ *Retrieve Personal Documents* (Identity verification required)\n` +
    `3️⃣ *Pay Property Tax* (UPI online payment)\n\n` +
    `Reply with *1*, *2* or *3* to choose.`,

  formList: (forms) => {
    const list = forms.map((f, i) => `${i + 1}️⃣ ${f.name}`).join('\n');
    return `📝 *Gram Panchayat Application Forms*\n\n` +
           `Available forms to download:\n${list}\n\n` +
           `Reply with the *number* of the form you need.`;
  },

  formDelivery: (formName, reqDocs) =>
    `📄 *Form:* ${formName}\n\n` +
    `📂 *Required Documents to submit:* \n${reqDocs}\n\n` +
    `Need anything else? Reply *Yes* or *No*`,

  askName: () =>
    `✅ Mobile number verified!\n\n` +
    `Please enter your *full name* as registered with the gram panchayat.`,

  askAadhaar: () =>
    `✅ Name verified!\n\n` +
    `Please enter the *last 4 digits* of your Aadhaar number.\n` +
    `_(For example, if your Aadhaar is XXXX-XXXX-3456, enter *3456*)_`,

  documentList: (docs) => {
    const list = docs.map(d => `${d.index}️⃣ ${d.label}`).join('\n');
    return `✅ *Identity verified successfully!*\n\n` +
           `Your available documents:\n${list}\n\n` +
           `Reply with the *number* of the document you need.`;
  },

  invalidMobile: () =>
    `❌ *Invalid mobile number.*\n\nPlease enter a valid 10-digit Indian mobile number.\nExample: *9876543210*`,

  mobileNotFound: (office = '+91-XXXXXXXXXX', hours = '10 AM - 5 PM') =>
    `❌ *Mobile number not found* in our records.\n\n` +
    `Please contact your gram panchayat office:\n📞 ${office}\n🕐 ${hours} (Mon–Sat)`,

  nameRetry: (remaining) =>
    `❌ *Name doesn't match* our records.\n\n` +
    `Please enter your name *exactly as registered*.\n` +
    `You have *${remaining} attempt(s)* remaining.`,

  aadhaarRetry: (remaining) =>
    `❌ *Aadhaar number doesn't match* our records.\n` +
    `You have *${remaining} attempt(s)* remaining.`,

  blocked: (until) => {
    const mins = Math.ceil((until - Date.now()) / 60000);
    return `⛔ *Access temporarily blocked* due to too many failed attempts.\n\n` +
           `Please try again in *${mins} minutes* or contact your gram panchayat office.`;
  },

  documentDelivery: (docName) =>
    `📄 Here is your *${docName}*\n\n` +
    `🔒 This PDF is password-protected for your security.\n\n` +
    `*Password:* Your date of birth in *DDMMYYYY* format\n` +
    `Example: If DOB is 15th March 1990 → *15031990*\n\n` +
    `Need another document? Reply *Yes* or *No*`,

  anotherDoc: () =>
    `Do you need another document?\n\nReply *Yes* or *No*`,

  goodbye: () =>
    `🙏 Thank you for using our service!\n\n` +
    `Have a great day! If you need any help, contact your gram panchayat office.`,

  sessionExpired: () =>
    `⏰ *Your session has expired* due to inactivity.\n\nPlease start again by sending *Hi*.`,

  genericError: () =>
    `⚠️ Service temporarily unavailable. Please try again in a few minutes.`,

  invalidChoice: (max) =>
    `❌ Invalid choice. Please reply with a number between *1* and *${max}*.`,

  invalidInput: () =>
    `❓ I didn't understand that. Please follow the instructions above.`,
};

// ─── Get panchayat config helper ──────────────────────────────────────────────

// Dynamic getPanchayatConfig is now imported from ../config/panchayat

// ─── Block reminder cooldown (in-memory) ──────────────────────────────────────
// Prevents sending a blocked message on EVERY incoming message from a blocked user.
// We only remind them once every 10 minutes.
const blockReminderSent = new Map(); // whatsappNumber -> timestamp
const BLOCK_REMINDER_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

function shouldSendBlockReminder(from) {
  const last = blockReminderSent.get(from);
  if (!last || Date.now() - last > BLOCK_REMINDER_COOLDOWN_MS) {
    blockReminderSent.set(from, Date.now());
    return true;
  }
  return false;
}

// ─── Format DOB as DDMMYYYY ───────────────────────────────────────────────────
function dobToPassword(dob) {
  const d = new Date(dob);
  const dd   = String(d.getUTCDate()).padStart(2, '0');
  const mm   = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}${mm}${yyyy}`;
}

// ─── Upload PDF to Supabase Storage and return public URL ────────────────────
async function savePDFForDelivery(pdfBuffer, docName) {
  const safeName = docName.replace(/[^a-zA-Z0-9_\-]/g, '_');
  const filename  = `delivery/${Date.now()}_${safeName}.pdf`;

  try {
    const { error } = await supabaseAdmin.storage
      .from('gp-delivery')
      .upload(filename, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (error) throw new Error(error.message);

    // Public URL for the gp-delivery bucket
    const { data: urlData } = supabaseAdmin.storage
      .from('gp-delivery')
      .getPublicUrl(filename);

    const mediaUrl = urlData?.publicUrl || null;
    console.log(`[PDF] Uploaded to Supabase Storage. URL: ${mediaUrl}`);

    // Schedule deletion after 10 minutes to keep storage clean
    setTimeout(async () => {
      await supabaseAdmin.storage.from('gp-delivery').remove([filename]);
    }, 10 * 60 * 1000);

    return { filename, mediaUrl };
  } catch (err) {
    console.error('[PDF] Supabase Storage upload failed:', err.message);
    // Fallback to local temp file with PUBLIC_URL
    const publicUrl = process.env.PUBLIC_URL;
    const os = require('os');
    const tmpDir = process.env.VERCEL ? os.tmpdir() : path.join(__dirname, '../../storage/temp-media');
    
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const localFile = path.join(tmpDir, `${Date.now()}_${safeName}.pdf`);
    fs.writeFileSync(localFile, pdfBuffer);
    const mediaUrl = publicUrl ? `${publicUrl.replace(/\/$/, '')}/media/${path.basename(localFile)}` : null;
    return { filename: localFile, mediaUrl };
  }
}

// ─── Main Conversation Handler ────────────────────────────────────────────────

/**
 * Handle an incoming WhatsApp message.
 * @param {string} from    - WhatsApp sender number e.g. "whatsapp:+919876543210"
 * @param {string} body    - Message text
 * @param {string} msgSid  - Twilio message SID
 * @param {string} [mediaUrl]  - Twilio/Interakt attachment URL
 * @param {string} [mediaType] - Media content type
 */
async function handleMessage(from, body, msgSid, mediaUrl, mediaType) {
  const input = (body || '').trim();
  const config = await getPanchayatConfig();

  // ── Check if blocked ──────────────────────────────────────────────────────
  const blockStatus = await isBlocked(from);
  if (blockStatus.blocked) {
    // Only remind blocked users once per 10 minutes to avoid burning Twilio credits
    if (shouldSendBlockReminder(from)) {
      await sendMessage(from, MSG.blocked(blockStatus.blockedUntil));
    }
    return;
  }

  // ── Get or create session ─────────────────────────────────────────────────
  let session = await getSession(from);

  // Restart keywords — only restart if user explicitly greets AND has no active session,
  // OR if they explicitly say 'restart'. This prevents a fresh Welcome message being
  // sent every time Render restarts the server and loses the in-memory session.
  const isExplicitRestart = /^(restart)$/i.test(input);
  const isGreeting        = /^(hi|hello|start|नमस्ते|हैलो)$/i.test(input);

  if (isExplicitRestart || (isGreeting && !session)) {
    if (session) await deleteSession(from);
    session = await createSession(from);
    const welcomeMsg = config.welcome_message || MSG.welcome(config.panchayat_name);
    await sendMessage(from, welcomeMsg);
    return;
  }

  // If the user sends a media file (screenshot) and either has no session,
  // or is at a step other than TAX_PAYMENT_PROOF, or their session lost the tax record details (e.g. server restart),
  // we trigger the stateless OCR verification flow.
  const isStatelessOCR = mediaUrl && (!session || session.currentStep !== STEPS.TAX_PAYMENT_PROOF || !session._taxRecord);

  if (isStatelessOCR) {
    await sendMessage(from, '⏳ Receipt received! Downloading and verifying your payment details... This might take a few seconds.');
    try {
      const screenshotFilename = `received_stateless_${Date.now()}.png`;
      const tmpDir = process.env.VERCEL ? os.tmpdir() : path.join(__dirname, '../../storage/temp-media');
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
      const screenshotPath = path.join(tmpDir, screenshotFilename);

      await downloadFile(mediaUrl, screenshotPath);
      console.log(`[OCR Stateless] Downloaded receipt to ${screenshotPath}. Running OCR...`);

      // Run OCR (GCP or Tesseract fallback) to extract raw text
      const text = await performOCR(screenshotPath);
      console.log('[OCR Stateless] Extracted text:', text);

      // Normalize texts for comparison
      const cleanOcr = text.toLowerCase().replace(/[^a-z0-9]/g, '');

      // Look up matching pending tax record
      let matchedRecord = null;

      // 1. Try by sender's mobile number first
      const cleanedMobile = from.replace(/[^0-9]/g, '');
      const senderMobile = cleanedMobile.slice(-10); // last 10 digits
      
      const { data: recordsByMobile, error: dbErrMobile } = await supabaseAdmin
        .from('tax_records')
        .select('*')
        .eq('mobile_number', senderMobile)
        .eq('payment_status', 'pending');

      if (!dbErrMobile && recordsByMobile && recordsByMobile.length > 0) {
        for (const rec of recordsByMobile) {
          if (matchesPropertyId(text, rec.property_id)) {
            matchedRecord = rec;
            break;
          }
        }
      }

      // 2. If not found by mobile, fallback to query all pending records
      if (!matchedRecord) {
        const { data: allPending, error: dbErrAll } = await supabaseAdmin
          .from('tax_records')
          .select('*')
          .eq('payment_status', 'pending');

        if (!dbErrAll && allPending && allPending.length > 0) {
          for (const rec of allPending) {
            if (matchesPropertyId(text, rec.property_id)) {
              matchedRecord = rec;
              break;
            }
          }
        }
      }

      if (matchedRecord) {
        // Run full verification checks using Vision LLM (if key set), otherwise use local Tesseract logic
        const payeeUpi = config.payee_upi_id || process.env.PAYEE_UPI_ID || 'shismehta77@oksbi';
        let verification;

        const nvidiaKey = process.env.NVIDIA_API_KEY;
        const hasNvidia = nvidiaKey && !nvidiaKey.includes('YOUR_KEY') && nvidiaKey.trim() !== '';

        if (hasNvidia) {
          try {
            verification = await verifyPayment(screenshotPath, payeeUpi, matchedRecord.property_id, matchedRecord.due_amount);
          } catch (err) {
            console.error('[OCR Stateless Fallback] NVIDIA Vision failed:', err.message);
            verification = verifyPaymentDetails(text, payeeUpi, matchedRecord.property_id, matchedRecord.due_amount);
          }
        } else {
          verification = verifyPaymentDetails(text, payeeUpi, matchedRecord.property_id, matchedRecord.due_amount);
        }

        if (verification.success) {
          console.log('[OCR Stateless] Receipt verification SUCCESS for property:', matchedRecord.property_id);

          const paymentId = `ocr_verified_${Date.now()}`;

          // Update tax record status in DB
          await supabaseAdmin
            .from('tax_records')
            .update({
              payment_status: 'paid',
              razorpay_payment_id: paymentId,
              updated_at: new Date().toISOString()
            })
            .eq('id', matchedRecord.id);

          // Log transaction
          await logTransaction({
            citizenId: matchedRecord.citizen_id || null,
            whatsappNumber: from,
            documentRequested: `[Property Tax Payment (Stateless)] Property ID: ${matchedRecord.property_id}`,
            status: 'success',
            sessionId: session ? session.id : null,
          });

          // Ensure session exists and set to confirmation loop
          if (!session) {
            session = await createSession(from);
          }
          await updateSession(from, {
            currentStep: STEPS.FORM_CONFIRM,
            _taxRecord: matchedRecord
          });

          // Send confirmation message
          const successMsg = `🎉 *Property Tax Payment Successfully Received!*\n\n` +
                             `🏠 *Property ID:* ${matchedRecord.property_id}\n` +
                             `👤 *Name:* ${matchedRecord.owner_name}\n` +
                             `💰 *Amount Paid:* ₹${parseFloat(matchedRecord.due_amount).toFixed(2)}\n` +
                             `🔒 *Verification ID:* ${paymentId}\n\n` +
                             `✅ Your payment has been verified. Your official e-receipt is attached below.\n\n` +
                             `Need another assistance? Reply *Yes* or *No*`;

          await sendMessage(from, successMsg);

          // Generate and deliver PDF e-receipt
          try {
            const pdfBytes = await generateEReceipt(
              { ...matchedRecord, payment_link: matchedRecord.payment_link || '' },
              paymentId,
              config.panchayat_name || 'Gram Panchayat'
            );
            const { mediaUrl: receiptUrl } = await saveReceiptForDelivery(pdfBytes, `receipt_${matchedRecord.property_id}`);
            if (receiptUrl) {
              await sendMedia(
                from,
                `📄 *Official E-Receipt* — Property ID: ${matchedRecord.property_id}\n\nThis is your digital payment receipt. Please also collect the original from the Gram Panchayat office.`,
                receiptUrl
              );
              console.log(`[Receipt] E-receipt delivered to ${from} for property ${matchedRecord.property_id}`);
            }
          } catch (receiptErr) {
            console.error('[Receipt] E-receipt generation/delivery failed (stateless):', receiptErr.message);
            // Non-critical — payment already confirmed, just log the error
          }
        } else {
          console.log('[OCR Stateless] Verification failed for property:', matchedRecord.property_id, { payeeMatch, propIdMatch, amountMatch });

          // Inform user and initialize/update session to TAX_PAYMENT_PROOF so they can try again
          let failedReasons = [];
          if (!payeeMatch) failedReasons.push(`• Payee UPI ID (*${config.payee_upi_id || process.env.PAYEE_UPI_ID || 'shismehta77@oksbi'}*) was not found in the screenshot.`);
          if (!propIdMatch) failedReasons.push(`• Property ID (*${matchedRecord.property_id}*) was not found in the screenshot note.`);
          if (!amountMatch) failedReasons.push(`• Payment amount (*₹${parseFloat(matchedRecord.due_amount).toFixed(2)}*) was not found in the screenshot.`);

          const failMsg = `❌ *Verification Failed*\n\n` +
                          `We found a pending tax record for Property ID *${matchedRecord.property_id}*, but we could not automatically verify the receipt.\n\n` +
                          `*Reasons:*\n${failedReasons.join('\n')}\n\n` +
                          `Please make sure you have paid the correct amount, to the correct UPI ID, added the Property ID to the note, and that the screenshot is clear and readable.\n\n` +
                          `Please upload the screenshot again, or reply *Cancel* to return to the main menu.`;

          if (!session) {
            session = await createSession(from);
          }
          await updateSession(from, {
            currentStep: STEPS.TAX_PAYMENT_PROOF,
            _taxRecord: matchedRecord
          });

          await sendMessage(from, failMsg);
        }
      } else {
        // No matching pending record found for any property ID parsed
        console.log('[OCR Stateless] No matching pending tax record found in receipt text.');
        await sendMessage(from, `⚠️ We couldn't find a matching pending tax record for the details in your receipt.\n\nPlease check the Property ID on your receipt, ensure the screenshot is clear and readable, and try uploading it again.\n\nYou can reply with *Hi* to return to the main menu.`);
      }
    } catch (err) {
      console.error('[OCR Stateless] Execution failed:', err.message);
      await sendMessage(from, '❌ An error occurred during receipt verification. Please upload the screenshot again, or reply *Hi* to return to the main menu.');
    }
    return;
  }

  // If no session and not a greeting, prompt them to start instead of silently failing
  if (!session) {
    await sendMessage(from, MSG.sessionExpired());
    return;
  }

  // ── Route based on current step ───────────────────────────────────────────
  try {
    switch (session.currentStep) {

      // ── STEP 0: Main Menu Selection ────────────────────────────────────────
      case STEPS.MAIN_MENU: {
        if (input === '1') {
          // Fetch blank application forms from database
          const { data: forms, error } = await supabaseAdmin
            .from('blank_forms')
            .select('*')
            .order('created_at', { ascending: false });

          if (error || !forms || forms.length === 0) {
            await sendMessage(from, '📭 No blank application forms are currently configured. Please try again later or contact the gram panchayat office.');
            await deleteSession(from);
            return;
          }

          // Transition to FORM_SELECT
          await updateSession(from, { currentStep: STEPS.FORM_SELECT });
          await sendMessage(from, MSG.formList(forms));
        } else if (input === '2') {
          // Start Retrieve Documents Flow
          await updateSession(from, { currentStep: STEPS.MOBILE });
          await sendMessage(from, 'To retrieve your personal documents, please share your *10-digit registered mobile number*.');
        } else if (input === '3') {
          // Start Pay Property Tax Flow
          await updateSession(from, { currentStep: STEPS.TAX_MOBILE });
          await sendMessage(from, 'To pay your property tax online, please share your *10-digit registered mobile number*.');
        } else {
          // Invalid choice in main menu
          await sendMessage(from, '❌ Invalid choice. Please reply with *1* (Forms), *2* (Documents), or *3* (Property Tax).');
        }
        break;
      }

      // ── STEP 0.5: Form Selection ─────────────────────────────────────────
      case STEPS.FORM_SELECT: {
        const { data: forms, error } = await supabaseAdmin
          .from('blank_forms')
          .select('*')
          .order('created_at', { ascending: false });

        if (error || !forms || forms.length === 0) {
          await sendMessage(from, '❌ Forms are temporarily unavailable. Please try again.');
          await deleteSession(from);
          return;
        }

        const choice = parseInt(input, 10);
        if (isNaN(choice) || choice < 1 || choice > forms.length) {
          await sendMessage(from, `❌ Invalid choice. Please reply with a number between *1* and *${forms.length}*.`);
          return;
        }

        const selectedForm = forms[choice - 1];
        await sendMessage(from, `⏳ Preparing your *${selectedForm.name}*... Please wait.`);

        // Log transaction inside Supabase audit logs
        await logTransaction({
          citizenId: null,
          whatsappNumber: from,
          documentRequested: `[Form Download] ${selectedForm.name}`,
          status: 'success',
          sessionId: session.id,
        });

        // Retrieve custom templates list from panchayat_config and check if approved
        let customTemplate = null;
        try {
          const { data: configData } = await supabaseAdmin
            .from('panchayat_config')
            .select('value')
            .eq('key', 'custom_whatsapp_templates')
            .maybeSingle();
          
          let templates = [];
          if (configData && configData.value) {
            try {
              templates = typeof configData.value === 'string' ? JSON.parse(configData.value) : configData.value;
            } catch (e) {
              templates = [];
            }
          }
          if (!Array.isArray(templates)) {
            templates = [];
          }
          customTemplate = templates.find(t => t.formId === selectedForm.id && t.status === 'approved');
        } catch (tmplErr) {
          console.error('[Bot Form Delivery] Template lookup failed:', tmplErr.message);
        }

        if (customTemplate) {
          await sendTemplateMessage(
            from,
            customTemplate.name,
            [selectedForm.required_documents],
            selectedForm.pdf_url
          );
        } else {
          // Fallback to legacy gp_form_delivery template
          await sendMedia(
            from,
            MSG.formDelivery(selectedForm.name, selectedForm.required_documents),
            selectedForm.pdf_url
          );
        }

        // Transition to FORM_CONFIRM
        await updateSession(from, { currentStep: STEPS.FORM_CONFIRM });
        break;
      }

      // ── STEP 0.6: Form Confirmation yes/no ────────────────────────────────
      case STEPS.FORM_CONFIRM: {
        const lower = input.toLowerCase();
        if (['yes', 'y', 'हाँ', 'ha'].includes(lower)) {
          // Restart to main menu
          await updateSession(from, { currentStep: STEPS.MAIN_MENU });
          const welcomeMsg = config.welcome_message || MSG.welcome(config.panchayat_name);
          await sendMessage(from, welcomeMsg);
        } else if (['no', 'n', 'नहीं', 'nahi'].includes(lower)) {
          await sendMessage(from, MSG.goodbye());
          await deleteSession(from);
        } else {
          await sendMessage(from, '❓ Please reply with *Yes* or *No*.');
        }
        break;
      }

      // ── STEP 0.7: Tax Mobile Lookup ──────────────────────────────────────
      case STEPS.TAX_MOBILE: {
        const validation = validateMobile(input);
        if (!validation.valid) {
          await sendMessage(from, MSG.invalidMobile());
          return;
        }

        // Search for a pending tax record matching this mobile number
        const { data: record, error } = await supabaseAdmin
          .from('tax_records')
          .select('*')
          .eq('mobile_number', validation.normalized)
          .eq('payment_status', 'pending')
          .limit(1)
          .single();

        if (error || !record) {
          await sendMessage(from, '🎉 Great news! You have no outstanding property tax dues for this mobile number.');
          
          // Loop back to main menu
          await updateSession(from, { currentStep: STEPS.MAIN_MENU });
          const welcomeMsg = config.welcome_message || MSG.welcome(config.panchayat_name);
          await sendMessage(from, welcomeMsg);
          return;
        }

        // Pending tax due found!
        await updateSession(from, {
          currentStep: STEPS.TAX_CONFIRM,
          _taxRecord: record // Temporary store in session memory
        });

        const taxPrompt = `📊 *Property Tax Outstanding Dues Found!*\n\n` +
                          `🏠 *Property ID:* ${record.property_id}\n` +
                          `👤 *Owner Name:* ${record.owner_name}\n` +
                          `💰 *Amount Due:* ₹${parseFloat(record.due_amount).toFixed(2)}\n\n` +
                          `Would you like to generate a payment QR code and link to pay online right now? (Reply *Yes* or *No*)`;

        await sendMessage(from, taxPrompt);
        break;
      }

      // ── STEP 0.8: Tax Confirmation yes/no ─────────────────────────────────
      case STEPS.TAX_CONFIRM: {
        const lower = input.toLowerCase();
        if (['yes', 'y', 'हाँ', 'ha'].includes(lower)) {
          const record = session._taxRecord;
          if (!record) {
            await sendMessage(from, '❌ Session mismatch. Please start again.');
            await deleteSession(from);
            return;
          }

          await sendMessage(from, '⏳ Generating secure UPI QR Code and Link... Please wait.');

          try {
            const payeeUpi = config.payee_upi_id || process.env.PAYEE_UPI_ID || 'shismehta77@oksbi';
            const payeeName = config.payee_name || process.env.PAYEE_NAME || 'Sina AI';
            const orderId = `gp_${record.property_id}_${Date.now()}`;
            
            // Generate UPI payment URL
            const upiUrl = `upi://pay?pa=${payeeUpi}&pn=${encodeURIComponent(payeeName)}&am=${parseFloat(record.due_amount).toFixed(2)}&cu=INR&tn=TXID%3D${record.property_id}`;
            
            // Generate QR Code file locally in the temp-media directory
            const qrFilename = `qr_${record.property_id}_${Date.now()}.png`;
            const tmpDir = process.env.VERCEL ? os.tmpdir() : path.join(__dirname, '../../storage/temp-media');
            if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
            const qrFilePath = path.join(tmpDir, qrFilename);

            await QRCode.toFile(qrFilePath, upiUrl, { width: 500, margin: 2 });
            
            const publicUrl = process.env.PUBLIC_URL || 'http://localhost:3000';
            const mediaUrl = `${publicUrl.replace(/\/$/, '')}/media/${qrFilename}`;

            // Update in DB (store orderId in razorpay_payment_link_id for compatibility)
            await supabaseAdmin
              .from('tax_records')
              .update({
                razorpay_payment_link_id: orderId,
                payment_link: upiUrl
              })
              .eq('id', record.id);

            const upiMessage = `📲 *UPI Payment Link and QR Code Generated!* \n\n` +
                               `💸 *Amount Due:* ₹${parseFloat(record.due_amount).toFixed(2)}\n` +
                               `🏠 *Property ID:* ${record.property_id}\n\n` +
                               `1️⃣ Scan the attached QR code or click this link to pay via any UPI app:\n` +
                               `🔗 ${upiUrl}\n\n` +
                               `⚠️ *IMPORTANT INSTRUCTIONS:*\n` +
                               `- You *must* enter *TXID=${record.property_id}* in the transaction note/remark when paying.\n` +
                               `- Once paid, take a screenshot of the payment receipt that clearly shows:\n` +
                               `   • The Note/Remark containing *TXID=${record.property_id}*\n` +
                               `   • The UPI ID you paid to (*${payeeUpi}*)\n` +
                               `   • The transaction amount and date\n\n` +
                               `2️⃣ Please send the screenshot of the payment receipt back to this chat now to verify your payment.`;

            await sendMedia(from, upiMessage, mediaUrl);
            await updateSession(from, { currentStep: STEPS.TAX_PAYMENT_PROOF, _taxRecord: record });
          } catch (qrErr) {
            console.error('[UPI Bot] QR generation failed:', qrErr.message);
            await sendMessage(from, '❌ Failed to generate payment QR code. Please contact the gram panchayat office.');
            await deleteSession(from);
          }

        } else if (['no', 'n', 'नहीं', 'nahi'].includes(lower)) {
          // Loop back to main menu
          await updateSession(from, { currentStep: STEPS.MAIN_MENU });
          const welcomeMsg = config.welcome_message || MSG.welcome(config.panchayat_name);
          await sendMessage(from, welcomeMsg);
        } else {
          await sendMessage(from, '❓ Please reply with *Yes* or *No*.');
        }
        break;
      }

      // ── STEP 0.9: Tax Payment Proof verification ─────────────────────────
      case STEPS.TAX_PAYMENT_PROOF: {
        const record = session._taxRecord;
        if (!record) {
          await sendMessage(from, '❌ Session mismatch. Please start again.');
          await deleteSession(from);
          return;
        }

        // Check if user wants to cancel
        if (input.toLowerCase() === 'cancel' || input.toLowerCase() === 'रद्द' || input.toLowerCase() === 'exit') {
          await sendMessage(from, '❌ Payment verification cancelled.');
          await updateSession(from, { currentStep: STEPS.MAIN_MENU });
          const welcomeMsg = config.welcome_message || MSG.welcome(config.panchayat_name);
          await sendMessage(from, welcomeMsg);
          return;
        }

        if (!mediaUrl) {
          await sendMessage(from, '⚠️ Please send a screenshot of the payment receipt to verify your payment, or reply *Cancel* to return to the main menu.');
          return;
        }

        await sendMessage(from, '⏳ Receipt received! Downloading and verifying your payment details... This might take a few seconds.');

        try {
          // Save file locally to process
          const screenshotFilename = `received_${record.property_id}_${Date.now()}.png`;
          const tmpDir = process.env.VERCEL ? os.tmpdir() : path.join(__dirname, '../../storage/temp-media');
          if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
          const screenshotPath = path.join(tmpDir, screenshotFilename);

          await downloadFile(mediaUrl, screenshotPath);
          console.log(`[OCR] Downloaded receipt to ${screenshotPath}. Running OCR...`);

          const payeeUpi = config.payee_upi_id || process.env.PAYEE_UPI_ID || 'shismehta77@oksbi';
          const verification = await verifyPayment(screenshotPath, payeeUpi, record.property_id, record.due_amount);

          if (verification.success) {
            console.log('[OCR] Receipt verification SUCCESS!');

            const paymentId = `ocr_verified_${Date.now()}`;

            // Update tax record status in DB (dashboard updates instantly)
            await supabaseAdmin
              .from('tax_records')
              .update({
                payment_status: 'paid',
                razorpay_payment_id: paymentId,
                updated_at: new Date().toISOString()
              })
              .eq('id', record.id);

            // Log successful transaction
            await logTransaction({
              citizenId: record.citizen_id || null,
              whatsappNumber: from,
              documentRequested: `[Property Tax Payment] Property ID: ${record.property_id}`,
              status: 'success',
              sessionId: session.id,
            });

            // Send confirmation message
            const successMsg = `🎉 *Property Tax Payment Successfully Received!*\n\n` +
                               `🏠 *Property ID:* ${record.property_id}\n` +
                               `👤 *Name:* ${record.owner_name}\n` +
                               `💰 *Amount Paid:* ₹${parseFloat(record.due_amount).toFixed(2)}\n` +
                               `🔒 *Verification ID:* ${paymentId}\n\n` +
                               `✅ Your payment has been verified. Your official e-receipt is attached below.\n\n` +
                               `Need another assistance? Reply *Yes* or *No*`;

            await sendMessage(from, successMsg);
            await updateSession(from, { currentStep: STEPS.FORM_CONFIRM }); // Go to confirmation loop

            // Generate and deliver PDF e-receipt
            try {
              const pdfBytes = await generateEReceipt(
                { ...record, payment_link: record.payment_link || '' },
                paymentId,
                config.panchayat_name || 'Gram Panchayat'
              );
              const { mediaUrl: receiptUrl } = await saveReceiptForDelivery(pdfBytes, `receipt_${record.property_id}`);
              if (receiptUrl) {
                await sendMedia(
                  from,
                  `📄 *Official E-Receipt* — Property ID: ${record.property_id}\n\nThis is your digital payment receipt. Please also collect the original from the Gram Panchayat office.`,
                  receiptUrl
                );
                console.log(`[Receipt] E-receipt delivered to ${from} for property ${record.property_id}`);
              }
            } catch (receiptErr) {
              console.error('[Receipt] E-receipt generation/delivery failed (session):', receiptErr.message);
              // Non-critical — payment already confirmed, just log the error
            }
          } else {
            console.log('[OCR] Verification failed. Matches:', { payeeMatch, propIdMatch, amountMatch });
            
            // Build informative error message
            let failedReasons = [];
            if (!payeeMatch) failedReasons.push(`• Payee UPI ID (*${config.payee_upi_id || process.env.PAYEE_UPI_ID || 'shismehta77@oksbi'}*) was not found in the screenshot.`);
            if (!propIdMatch) failedReasons.push(`• Property ID (*${record.property_id}*) was not found in the screenshot note.`);
            if (!amountMatch) failedReasons.push(`• Payment amount (*₹${parseFloat(record.due_amount).toFixed(2)}*) was not found in the screenshot.`);

            const failMsg = `❌ *Verification Failed*\n\n` +
                            `We could not automatically verify the payment receipt screenshot. \n\n` +
                            `*Reasons:*\n${failedReasons.join('\n')}\n\n` +
                            `Please make sure you have paid the correct amount, to the correct UPI ID, added the Property ID to the note, and that the screenshot is clear and readable. \n\n` +
                            `Please upload the screenshot again, or reply *Cancel* to return to the main menu.`;

            await sendMessage(from, failMsg);
          }
        } catch (err) {
          console.error('[OCR] OCR execution failed:', err.message);
          await sendMessage(from, '❌ An error occurred during receipt verification. Please upload the screenshot again, or reply *Cancel* to return to the main menu.');
        }
        break;
      }

      // ── STEP 1: Mobile Number ───────────────────────────────────────────
      case STEPS.MOBILE: {
        const validation = validateMobile(input);
        if (!validation.valid) {
          await sendMessage(from, MSG.invalidMobile());
          return;
        }

        const { valid, citizen } = await verifyMobile(validation.normalized);
        if (!valid) {
          await sendMessage(from, MSG.mobileNotFound(config.office_phone, config.office_hours));
          await deleteSession(from);
          return;
        }

        // Store citizen data in session (not full Aadhaar)
        await updateSession(from, {
          currentStep: STEPS.NAME,
          mobileNumber: validation.normalized,
          citizenId: citizen.id,
          _citizenName: citizen.full_name,       // temp, not persisted to DB
          _citizenDob: citizen.date_of_birth,
          _aadhaarEncrypted: citizen.aadhaar_number_encrypted,
          _aadhaarLast4: citizen.aadhaar_last4,
          retryCount: 0,
        });

        await sendMessage(from, MSG.askName());
        break;
      }

      // ── STEP 2: Full Name ───────────────────────────────────────────────
      case STEPS.NAME: {
        const validation = validateName(input);
        if (!validation.valid) {
          await sendMessage(from, validation.error);
          return;
        }

        const { valid } = verifyName(validation.normalized, session._citizenName);
        if (!valid) {
          const newRetry = (session.retryCount || 0) + 1;
          const { blocked, remaining } = await recordFailedAttempt(from, 'name', newRetry - 1);

          if (blocked) {
            await sendMessage(from, MSG.blocked(new Date(Date.now() + parseInt(config.block_duration_minutes || '30') * 60000)));
            await deleteSession(from);
            return;
          }

          await updateSession(from, { retryCount: newRetry });
          await sendMessage(from, MSG.nameRetry(remaining));
          return;
        }

        await updateSession(from, { currentStep: STEPS.AADHAAR, retryCount: 0 });
        await sendMessage(from, MSG.askAadhaar());
        break;
      }

      // ── STEP 3: Aadhaar ─────────────────────────────────────────────────
      case STEPS.AADHAAR: {
        const validation = validateAadhaar(input);
        if (!validation.valid) {
          await sendMessage(from, validation.error);
          return;
        }

        // Compare the 4-digit input directly against stored aadhaar_last4
        const { valid } = {
          valid: validation.normalized === session._aadhaarLast4
        };

        if (!valid) {
          const newRetry = (session.retryCount || 0) + 1;
          const { blocked, remaining } = await recordFailedAttempt(from, 'aadhaar', newRetry - 1);

          if (blocked) {
            await sendMessage(from, MSG.blocked(new Date(Date.now() + parseInt(config.block_duration_minutes || '30') * 60000)));
            await deleteSession(from);
            return;
          }

          await updateSession(from, { retryCount: newRetry });
          await sendMessage(from, MSG.aadhaarRetry(remaining));
          return;
        }

        // ✅ All 3 steps verified — fetch documents
        const folderIdOrMobile = session.mobileNumber;
        let docs = [];
        try {
          docs = await listDocuments(folderIdOrMobile);
        } catch (err) {
          await sendMessage(from, MSG.genericError());
          return;
        }

        if (docs.length === 0) {
          await sendMessage(from, '📭 No documents found for your account. Please contact the gram panchayat office.');
          await deleteSession(from);
          return;
        }

        await updateSession(from, {
          currentStep: STEPS.DOCUMENT_SELECT,
          documentList: docs,
          retryCount: 0,
        });

        await sendMessage(from, MSG.documentList(docs));
        break;
      }

      // ── STEP 4: Document Selection ───────────────────────────────────────
      case STEPS.DOCUMENT_SELECT: {
        const docs = session.documentList || [];
        const validation = validateDocumentChoice(input, docs.length);

        if (!validation.valid) {
          await sendMessage(from, MSG.invalidChoice(docs.length));
          return;
        }

        const selectedDoc = docs[validation.choice - 1];
        await updateSession(from, { currentStep: STEPS.DELIVERY });

        // Send processing notice
        await sendMessage(from, `⏳ Preparing your *${selectedDoc.label}*... Please wait.`);

        try {
          // Download + protect PDF
          const pdfBuffer    = await downloadDocument(session.mobileNumber, selectedDoc.id);
          const dob          = session._citizenDob;
          const password     = dobToPassword(dob);
          const protectedPdf = await protectPDF(pdfBuffer, password, selectedDoc.label);

          // Save and get public URL (works with Ngrok)
          const { mediaUrl } = await savePDFForDelivery(protectedPdf, selectedDoc.label);

          // Log transaction
          await logTransaction({
            citizenId: session.citizenId,
            whatsappNumber: from,
            documentRequested: `[Doc Retrieval] ${selectedDoc.label}`,
            status: 'success',
            sessionId: session.id,
          });

          if (mediaUrl) {
            // ✅ Send the actual PDF via Twilio
            await sendMedia(
              from,
              `📄 Your *${selectedDoc.label}* is ready!\n\n` +
              `🔒 *PDF Password:* Your date of birth in DDMMYYYY format\n` +
              `_Example: 15th March 1990 → 15031990_\n\n` +
              `Need another document? Reply *Yes* or *No*`,
              mediaUrl
            );
          } else {
            // No public URL — send password instructions only
            await sendMessage(from,
              `✅ *${selectedDoc.label}* has been processed!\n\n` +
              `🔒 *PDF Password:* Your date of birth in DDMMYYYY format\n` +
              `_Example: 15th March 1990 → 15031990_\n\n` +
              `⚠️ To receive the actual PDF file, add PUBLIC_URL to your .env file\n` +
              `(set it to your Ngrok URL, e.g. https://xxxx.ngrok-free.dev)\n\n` +
              `Need another document? Reply *Yes* or *No*`
            );
          }

          await updateSession(from, { currentStep: STEPS.DOCUMENT_CONFIRM });
        } catch (err) {
          console.error('[Flow] Document delivery error:', err.message);
          await logTransaction({
            citizenId: session.citizenId,
            whatsappNumber: from,
            documentRequested: `[Doc Retrieval] ${selectedDoc.label}`,
            status: 'failed',
            failureReason: err.message,
            sessionId: session.id,
          });
          await sendMessage(from, `❌ Unable to process your document. Our team has been notified.\n\nNeed another document? Reply *Yes* or *No*`);
          await updateSession(from, { currentStep: STEPS.DOCUMENT_CONFIRM });
        }
        break;
      }

      // ── STEP 5: Document Confirmation yes/no ────────────────────────────────
      case STEPS.DOCUMENT_CONFIRM: {
        const lower = input.toLowerCase();
        if (['yes', 'y', 'हाँ', 'ha'].includes(lower)) {
          const docs = session.documentList || [];
          await updateSession(from, { currentStep: STEPS.DOCUMENT_SELECT });
          await sendMessage(from, MSG.documentList(docs));
        } else if (['no', 'n', 'नहीं', 'nahi'].includes(lower)) {
          await sendMessage(from, MSG.goodbye());
          await deleteSession(from);
        } else {
          await sendMessage(from, '❓ Please reply with *Yes* or *No*.');
        }
        break;
      }

      default: {
        await sendMessage(from, MSG.invalidInput());
        break;
      }
    }
  } catch (err) {
    console.error('[Flow] Unhandled error:', err.message, err.stack);
    await sendMessage(from, MSG.genericError()).catch(() => {});
  }
}

module.exports = { handleMessage };
