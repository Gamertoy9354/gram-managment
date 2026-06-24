const { supabaseAdmin } = require('../src/config/supabase');

async function run() {
  try {
    const { data: config, error: err1 } = await supabaseAdmin.from('panchayat_config').select('*');
    if (err1) throw err1;
    console.log('Total keys:', config.length);
    config.forEach(c => {
      console.log(`Key: ${c.key}, Value preview: ${String(c.value).slice(0, 80)}`);
    });
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
