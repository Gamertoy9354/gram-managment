const { supabaseAdmin } = require('../src/config/supabase');

async function run() {
  const { data } = await supabaseAdmin
    .from('panchayat_config')
    .select('value')
    .eq('key', 'custom_whatsapp_templates')
    .maybeSingle();
  console.log(data);
}
run();
