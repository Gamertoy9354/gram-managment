const { supabaseAdmin } = require('./supabase');

const CONFIG_DEFAULTS = {
  panchayat_name: 'Sample Gram Panchayat',
  office_phone: '+91-XXXXXXXXXX',
  office_hours: '10 AM - 5 PM (Monday to Saturday)',
  max_retry_attempts: '3',
  block_duration_minutes: '30',
  session_timeout_minutes: '15',
  payee_upi_id: process.env.PAYEE_UPI_ID || 'shismehta77@oksbi',
  payee_name: process.env.PAYEE_NAME || 'Sina AI',
  fallback_template_name: 'gp_generic_notification'
};

let configCache = null;

async function getPanchayatConfig() {
  if (configCache) return configCache;
  try {
    const { data, error } = await supabaseAdmin.from('panchayat_config').select('key, value');
    if (error) throw error;
    
    const dbMap = {};
    if (data) {
      data.forEach(r => {
        dbMap[r.key] = r.value;
      });
    }

    // Merge defaults with DB values
    const merged = {};
    Object.entries(CONFIG_DEFAULTS).forEach(([key, defaultValue]) => {
      merged[key] = dbMap[key] !== undefined ? dbMap[key] : defaultValue;
    });

    // Also include any other key not in CONFIG_DEFAULTS (like custom_whatsapp_templates)
    if (data) {
      data.forEach(r => {
        if (!(r.key in merged)) {
          merged[r.key] = r.value;
        }
      });
    }

    configCache = merged;

    // Refresh cache every 5 min
    setTimeout(() => { configCache = null; }, 5 * 60 * 1000);
  } catch (err) {
    console.error('[Config] Error loading panchayat config:', err.message);
  }
  return configCache || CONFIG_DEFAULTS;
}

function clearConfigCache() {
  console.log('[Config] Clearing panchayat config cache.');
  configCache = null;
}

module.exports = { getPanchayatConfig, clearConfigCache };
