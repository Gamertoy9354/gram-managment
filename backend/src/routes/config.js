const express = require('express');
const router  = express.Router();
const { authenticate } = require('./auth');
const { supabaseAdmin } = require('../config/supabase');
const { clearConfigCache } = require('../config/panchayat');

// Authenticated admin router
router.use(authenticate);

const CONFIG_DEFAULTS = {
  panchayat_name: { value: 'Sample Gram Panchayat', description: 'Name displayed in bot messages' },
  office_phone: { value: '+91-XXXXXXXXXX', description: 'Office contact number' },
  office_hours: { value: '10 AM - 5 PM (Monday to Saturday)', description: 'Office working hours' },
  max_retry_attempts: { value: '3', description: 'Max failed attempts before block' },
  block_duration_minutes: { value: '30', description: 'Block duration in minutes' },
  session_timeout_minutes: { value: '15', description: 'Session inactivity timeout' },
  payee_upi_id: { value: process.env.PAYEE_UPI_ID || 'shismehta77@oksbi', description: 'UPI ID for property tax payments' },
  payee_name: { value: process.env.PAYEE_NAME || 'Sina AI', description: 'Merchant Name for UPI payments' },
  fallback_template_name: { value: 'gp_generic_notification', description: 'Fallback WhatsApp Template Code Name' }
};

/**
 * GET /api/config
 * Fetches all config keys, merges with defaults.
 */
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('panchayat_config')
      .select('key, value');

    if (error) throw error;

    const dbMap = {};
    if (data) {
      data.forEach(r => {
        dbMap[r.key] = r.value;
      });
    }

    const configs = Object.entries(CONFIG_DEFAULTS).map(([key, def]) => ({
      key,
      value: dbMap[key] !== undefined ? dbMap[key] : def.value,
      description: def.description
    }));

    res.json({ configs });
  } catch (err) {
    console.error('[Config] Fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch settings: ' + err.message });
  }
});

/**
 * PUT /api/config
 * Updates configuration in the database.
 */
router.put('/', async (req, res) => {
  const { configs } = req.body;
  if (!configs || typeof configs !== 'object') {
    return res.status(400).json({ error: 'Invalid config payload' });
  }

  try {
    const upserts = Object.entries(configs).map(([key, value]) => ({
      key,
      value: String(value)
    }));

    const { error } = await supabaseAdmin
      .from('panchayat_config')
      .upsert(upserts, { onConflict: 'key' });

    if (error) throw error;

    clearConfigCache();

    res.json({ message: 'Settings updated successfully' });
  } catch (err) {
    console.error('[Config] Update error:', err.message);
    res.status(500).json({ error: 'Failed to update settings: ' + err.message });
  }
});

module.exports = router;
