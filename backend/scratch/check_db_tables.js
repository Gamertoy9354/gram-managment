const { supabaseAdmin } = require('../src/config/supabase');

async function main() {
  console.log('Fetching tables from Supabase...');
  // We can query the information_schema via a RPC or search for some common tables
  const tables = ['citizens', 'blank_forms', 'tax_records', 'panchayat_config', 'bot_sessions', 'audit_logs'];
  for (const table of tables) {
    const { data, error } = await supabaseAdmin.from(table).select('*').limit(1);
    if (error) {
      console.log(`❌ Table ${table} does not exist or error:`, error.message);
    } else {
      console.log(`✅ Table ${table} exists!`);
    }
  }
}

main().catch(console.error);
