const express = require('express');
const router  = express.Router();
const { validateSignature } = require('../config/twilio');
const { handleMessage }     = require('../controllers/conversationController');

// ─── Deduplication Store ───────────────────────────────────────────────────────
// Prevents the same MessageSid from being processed more than once.
// Twilio can occasionally deliver duplicate webhooks, and Status Callbacks
// (sent/delivered/read events) can be mistakenly routed here if the Twilio
// Sandbox "Status Callback URL" is set to this same endpoint.
const processedSids = new Set();
const SID_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

/**
 * POST /webhook/whatsapp
 * Handles ONLY incoming WhatsApp messages from users.
 */
router.post('/', async (req, res) => {
  let messageStatus = req.body.MessageStatus || req.body.SmsStatus;
  let from = req.body.From;
  let body = req.body.Body;
  let sid  = req.body.MessageSid;
  let mediaUrl = req.body.MediaUrl0;
  let mediaType = req.body.MediaContentType0;

  // ── Interakt Webhook Parsing Support ──
  // Extract details if the request is formatted using Interakt's event data schema
  if (!from && req.body && req.body.data && req.body.data.customer) {
    const customer = req.body.data.customer;
    const message = req.body.data.message;
    
    if (customer && message) {
      from = `whatsapp:${customer.country_code || '+91'}${customer.phone_number}`;
      sid = message.id;
      
      if (message.type === 'text' && message.text) {
        body = message.text.body;
      } else if (message.type === 'image' && message.image) {
        mediaUrl = message.image.url;
        mediaType = message.image.mime_type;
        body = '';
      } else if (message.type === 'document' && message.document) {
        mediaUrl = message.document.url;
        mediaType = message.document.mime_type;
        body = '';
      } else if (message.type === 'button_reply' && message.button_reply) {
        body = message.button_reply.title || message.button_reply.payload;
      } else if (message.type === 'interactive' && message.interactive) {
        if (message.interactive.button_reply) {
          body = message.interactive.button_reply.title;
        } else if (message.interactive.list_reply) {
          body = message.interactive.list_reply.title;
        }
      }
    }
  }

  // ── Guard 1: Ignore Twilio STATUS CALLBACKS ──────────────────────────────
  // Twilio POSTs status updates (sent, delivered, read, failed) to ANY webhook
  // URL configured in the console. If the "Status Callback URL" points here,
  // each outgoing bot message would trigger another full bot reply — multiplying
  // messages exponentially. Status callbacks have MessageStatus but NO From.
  if (messageStatus && !from) {
    console.log(`[Webhook] Ignored status callback: ${messageStatus} (SID: ${sid})`);
    return res.status(200).send('<Response></Response>');
  }

  // ── Guard 2: Ignore non-message POSTs (no sender or no text body / media) ─────────
  if (!from || (body === undefined && !mediaUrl)) {
    console.log('[Webhook] Ignored POST with no From/Body/Media — likely a status ping');
    return res.status(200).send('<Response></Response>');
  }
  if (body === undefined || body === null) {
    body = '';
  }

  // ── Guard 3: Deduplicate — skip if we already handled this SID ───────────
  if (sid && processedSids.has(sid)) {
    console.log(`[Webhook] Duplicate webhook skipped (SID: ${sid})`);
    return res.status(200).send('<Response></Response>');
  }
  if (sid) {
    processedSids.add(sid);
    setTimeout(() => processedSids.delete(sid), SID_EXPIRY_MS);
  }

  // ── Validate Twilio signature (skipped in development) ───────────────────
  if (!validateSignature(req)) {
    console.warn('[Webhook] Invalid Twilio signature — rejected');
    return res.status(403).send('Forbidden');
  }

  console.log(`[Webhook] Incoming from ${from}: "${body}" (SID: ${sid}, media: ${mediaUrl ? 'YES' : 'NO'})`);

  // Respond 200 immediately — Twilio/Interakt requires a fast response
  res.status(200).send('<Response></Response>');

  // Process the message asynchronously so it doesn't block the response
  handleMessage(from, body, sid, mediaUrl, mediaType).catch(err =>
    console.error('[Webhook] Handler error:', err.message)
  );
});

/**
 * GET /webhook/whatsapp/health
 */
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
