const { supabaseAdmin } = require('../src/config/supabase');

async function run() {
  try {
    console.log('--- Config ---');
    const { data: config, error: err1 } = await supabaseAdmin.from('panchayat_config').select('*');
    if (err1) throw err1;
    console.log(config);

    console.log('--- Blank Forms ---');
    const { data: forms, error: err2 } = await supabaseAdmin.from('blank_forms').select('*').limit(3);
    if (err2) throw err2;
    console.log(forms);
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
