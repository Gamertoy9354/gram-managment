/**
 * twilio.js — Production-ready WhatsApp messaging via Twilio
 *
 * Supports:
 *  - Text messages (sendMessage)
 *  - Media messages with PDF/QR attachments (sendMedia)
 *  - Template-style messages resolved locally (sendTemplateMessage)
 *  - Webhook signature validation
 */

require('dotenv').config();
const twilio = require('twilio');

const TWILIO_ACCOUNT_SID   = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN    = process.env.TWILIO_AUTH_TOKEN;

let rawFrom = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
if (rawFrom && !rawFrom.startsWith('whatsapp:')) {
  // Ensure plus sign is present
  const plusSign = rawFrom.startsWith('+') ? '' : '+';
  rawFrom = `whatsapp:${plusSign}${rawFrom}`;
}
const TWILIO_WHATSAPP_FROM = rawFrom;

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
  console.warn('[Twilio] ⚠️  TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN missing — messages will fail.');
} else {
  console.log('[Twilio] ✅ Twilio integration active. From:', TWILIO_WHATSAPP_FROM);
}

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// ─── Compatibility shim: client.messages(sid).fetch() ─────────────────────────
// broadcast.js polls message status using twilioClient.messages(sid).fetch()
const client = {
  messages: function (sid) {
    if (twilioClient) return twilioClient.messages(sid);
    return {
      fetch: async () => ({ status: 'delivered', errorMessage: null })
    };
  }
};

// ─── Phone-number normalisation ───────────────────────────────────────────────
function toWhatsAppNumber(raw) {
  // Already formatted?
  if (raw && raw.startsWith('whatsapp:')) return raw;

  const digits = (raw || '').replace(/[^0-9]/g, '');

  // 12-digit number starting with 91  →  +91xxxxxxxxxx
  if (digits.length === 12 && digits.startsWith('91')) {
    return `whatsapp:+${digits}`;
  }
  // 10-digit Indian mobile
  if (digits.length === 10) {
    return `whatsapp:+91${digits}`;
  }
  // Any other length — prepend +
  return `whatsapp:+${digits}`;
}

// ─── sendMessage ─────────────────────────────────────────────────────────────
/**
 * Send a plain-text WhatsApp message via Twilio.
 *
 * @param {string} to   - Recipient number (any format)
 * @param {string} body - Message text
 * @returns {{ sid: string, status: string }}
 */
async function sendMessage(to, body) {
  const formattedTo = toWhatsAppNumber(to);
  try {
    const msg = await twilioClient.messages.create({
      from: TWILIO_WHATSAPP_FROM,
      to:   formattedTo,
      body,
    });
    console.log(`[Twilio] ✅ Text sent → ${formattedTo} | SID: ${msg.sid}`);
    return { sid: msg.sid, status: msg.status === 'failed' ? 'failed' : 'sent' };
  } catch (err) {
    console.error(`[Twilio] ❌ sendMessage failed to ${formattedTo}:`, err.message);
    throw new Error(`Failed to send Twilio message: ${err.message}`);
  }
}

// ─── sendMedia ───────────────────────────────────────────────────────────────
/**
 * Send a WhatsApp message with a media attachment (PDF, image, QR).
 *
 * @param {string} to       - Recipient number
 * @param {string} body     - Caption / text
 * @param {string} mediaUrl - Publicly-accessible URL of the media file
 * @returns {{ sid: string, status: string }}
 */
async function sendMedia(to, body, mediaUrl) {
  const formattedTo = toWhatsAppNumber(to);

  const messageOpts = {
    from: TWILIO_WHATSAPP_FROM,
    to:   formattedTo,
    body,
  };

  if (mediaUrl) {
    messageOpts.mediaUrl = [mediaUrl];
  }

  try {
    const msg = await twilioClient.messages.create(messageOpts);
    console.log(`[Twilio] ✅ Media sent → ${formattedTo} | SID: ${msg.sid} | URL: ${mediaUrl}`);
    return { sid: msg.sid, status: msg.status === 'failed' ? 'failed' : 'sent' };
  } catch (err) {
    console.error(`[Twilio] ❌ sendMedia failed to ${formattedTo}:`, err.message);
    throw new Error(`Failed to send Twilio media message: ${err.message}`);
  }
}

// ─── resolveTemplateText ─────────────────────────────────────────────────────
/**
 * Look up a custom template from panchayat_config and substitute {{n}} vars.
 * Falls back to a legacy string map for core bot templates.
 */
async function resolveTemplateText(templateName, bodyValues = []) {
  const LEGACY = {
    gp_welcome_menu:
      '🙏 *Welcome to {{1}} Digital Service*\n\nHow can I assist you today? Please reply with the option number:\n\n1️⃣ *Download Blank Application Forms* (No login required)\n2️⃣ *Retrieve Personal Documents* (Identity verification required)\n3️⃣ *Pay Property Tax* (UPI online payment)\n\nReply with *1*, *2* or *3* to choose.',
    gp_forms_menu:
      '📝 *Gram Panchayat Application Forms*\n\nAvailable forms to download:\n{{1}}\n\nReply with the *number* of the form you need.',
    gp_form_delivery:
      '📄 *Form:* {{1}}\n\n📂 *Required Documents to submit:* \n{{2}}\n\nNeed anything else? Reply *Yes* or *No*',
    gp_verify_name:
      '✅ Mobile number verified!\n\nPlease enter your *full name* as registered with the gram panchayat.',
    gp_verify_aadhaar:
      '✅ Name verified!\n\nPlease enter the *last 4 digits* of your Aadhaar number.\n_(For example, if your Aadhaar is XXXX-XXXX-3456, enter *3456*)_',
    gp_document_menu:
      '✅ *Identity verified successfully!*\n\nYour available documents:\n{{1}}\n\nReply with the *number* of the document you need.',
    gp_document_delivery:
      'Here is your *{{1}}* is ready! PDF Password is your Date of Birth in DDMMYYYY format.',
    p_tax_outstanding_alert:
      'Property Tax Alert: Outstanding tax of ₹{{3}} due for Property ID {{2}}. Citizen: {{1}}. Pay link: {{4}}',
    gp_tax_payment_receipt:
      'Property Tax Payment Confirmed! Property ID: {{1}}, Name: {{2}}, Amount: {{3}}, Payment ID: {{4}}',
    gp_cooldown_blocked:
      'Access temporarily blocked due to failed attempts. Please try again after {{1}} minutes.',
    gp_mobile_not_found:
      'Mobile number not found in our records. Please contact Gram Panchayat.',
    gp_session_expired:
      'Your session has expired. Please send Hi to continue.',
    gp_invalid_choice_prompt:
      'Invalid choice. Please reply with a number between 1 and {{1}}.',
    gp_goodbye:
      'Thank you for using our service. Have a great day!',
    gp_broadcast_circular:
      'Namaskar {{1}},\n\nThis is an official announcement from your Gram Panchayat. Please review the attachments or details below.\n\nDhanyawad!',
  };

  let textBody = '';
  try {
    const { supabaseAdmin } = require('./supabase');
    const { data } = await supabaseAdmin
      .from('panchayat_config')
      .select('value')
      .eq('key', 'custom_whatsapp_templates')
      .maybeSingle();

    let templates = [];
    if (data && data.value) {
      templates = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    }
    if (!Array.isArray(templates)) templates = [];

    const found = templates.find(t => t.name === templateName);
    textBody = found ? found.body : (LEGACY[templateName] || `[Template: ${templateName}] ${bodyValues.join(', ')}`);
  } catch {
    textBody = LEGACY[templateName] || `[Template: ${templateName}] ${bodyValues.join(', ')}`;
  }

  // Substitute {{1}}, {{2}}, etc.
  let resolved = textBody;
  bodyValues.forEach((val, i) => {
    resolved = resolved.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, 'g'), val);
  });
  return resolved;
}

// ─── sendTemplateMessage ─────────────────────────────────────────────────────
/**
 * Resolve a template locally and send via Twilio (text + optional media).
 *
 * @param {string}   to          - Recipient number
 * @param {string}   templateName - Template key
 * @param {string[]} bodyValues   - Template variable values
 * @param {string|null} mediaUrl  - Optional media URL
 */
async function sendTemplateMessage(to, templateName, bodyValues = [], mediaUrl = null) {
  const body = await resolveTemplateText(templateName, bodyValues);
  if (mediaUrl) {
    return sendMedia(to, body, mediaUrl);
  }
  return sendMessage(to, body);
}

// ─── validateSignature ───────────────────────────────────────────────────────
/**
 * Validates incoming Twilio webhook signature in production.
 */
function validateSignature(req) {
  if (process.env.NODE_ENV === 'production' && TWILIO_AUTH_TOKEN) {
    const sig    = req.headers['x-twilio-signature'];
    const url    = `${(process.env.PUBLIC_URL || '').replace(/\/$/, '')}${req.originalUrl}`;
    const params = req.body;
    return twilio.validateRequest(TWILIO_AUTH_TOKEN, sig, url, params);
  }
  return true; // skip validation in development
}

module.exports = { client, sendMessage, sendMedia, sendTemplateMessage, validateSignature };
