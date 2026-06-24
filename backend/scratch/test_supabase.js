const { supabaseAdmin } = require('../src/config/supabase');

async function test() {
  const { data, error } = await supabaseAdmin
    .from('admin_users')
    .select('*')
    .eq('username', 'admin')
    .limit(1)
    .single();
  
  if (error) {
    console.error('Supabase Error:', error.message);
  } else {
    console.log('User found:', data.username);
  }
}

test();
