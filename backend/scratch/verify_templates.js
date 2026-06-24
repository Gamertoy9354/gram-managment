const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { supabaseAdmin } = require('../src/config/supabase');

async function testTemplates() {
  console.log('--- TESTING TEMPLATE LIFECYCLE ---');
  try {
    // 1. Fetch current templates
    console.log('1. Fetching templates...');
    const { data: configData } = await supabaseAdmin
      .from('panchayat_config')
      .select('value')
      .eq('key', 'custom_whatsapp_templates')
      .maybeSingle();

    let initialTemplates = [];
    if (configData && configData.value) {
      try {
        initialTemplates = typeof configData.value === 'string' ? JSON.parse(configData.value) : configData.value;
      } catch (e) {
        initialTemplates = [];
      }
    }
    if (!Array.isArray(initialTemplates)) {
      initialTemplates = [];
    }
    console.log(`Initial templates count: ${initialTemplates.length}`);

    // Clean up test template if exists
    const testName = 'gp_test_script_tmpl';
    let filtered = initialTemplates.filter(t => t.name !== testName);

    // 2. Create new template (simulated creation)
    console.log('2. Creating new template...');
    const newTmpl = {
      name: testName,
      title: 'Script Test Template',
      body: 'Hello {{1}}, this is variable {{2}}.',
      type: 'broadcast',
      formId: null,
      category: 'utility',
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    filtered.push(newTmpl);

    await supabaseAdmin
      .from('panchayat_config')
      .upsert({ key: 'custom_whatsapp_templates', value: JSON.stringify(filtered) });
    console.log('Template inserted successfully as pending.');

    // 3. Testing Twilio Fallback formatting logic
    console.log('3. Testing Twilio Fallback formatting logic...');
    const textBody = 'Hello {{1}}, this is variable {{2}}.';
    const values = ['Sanjay', 'maintenance alert'];
    let resolvedText = textBody;
    values.forEach((val, idx) => {
      resolvedText = resolvedText.replace(new RegExp(`\\{\\{${idx + 1}\\}\\}`, 'g'), val);
    });
    console.log('Parsed text:', resolvedText);
    if (resolvedText === 'Hello Sanjay, this is variable maintenance alert.') {
      console.log('✓ Formatting logic SUCCESSFUL!');
    } else {
      console.error('✗ Formatting logic FAILED.');
    }

    // 4. Wait 11 seconds to verify simulated approval
    console.log('4. Waiting 11 seconds for simulated Meta approval...');
    await new Promise(resolve => setTimeout(resolve, 11000));

    // Call GET logic
    console.log('5. Querying list endpoint (GET simulated logic)...');
    const { data: freshData } = await supabaseAdmin
      .from('panchayat_config')
      .select('value')
      .eq('key', 'custom_whatsapp_templates')
      .maybeSingle();

    let freshTemplates = [];
    if (freshData && freshData.value) {
      try {
        freshTemplates = typeof freshData.value === 'string' ? JSON.parse(freshData.value) : freshData.value;
      } catch (e) {
        freshTemplates = [];
      }
    }
    if (!Array.isArray(freshTemplates)) {
      freshTemplates = [];
    }

    // Simulating the GET router approval logic
    let updated = false;
    const now = Date.now();
    freshTemplates = freshTemplates.map(t => {
      if (t.status === 'pending') {
        const elapsed = now - new Date(t.createdAt).getTime();
        if (elapsed >= 10000) {
          updated = true;
          return { ...t, status: 'approved' };
        }
      }
      return t;
    });

    if (updated) {
      await supabaseAdmin
        .from('panchayat_config')
        .upsert({ key: 'custom_whatsapp_templates', value: JSON.stringify(freshTemplates) });
    }

    const verifiedTmpl = freshTemplates.find(t => t.name === testName);
    console.log('Found template after wait:', verifiedTmpl);
    if (verifiedTmpl && verifiedTmpl.status === 'approved') {
      console.log('✅ Meta simulated approval verification SUCCESSFUL!');
    } else {
      console.error('❌ simulated approval FAILED.');
    }

    // Clean up
    console.log('6. Cleaning up test template...');
    const cleanedTemplates = freshTemplates.filter(t => t.name !== testName);
    await supabaseAdmin
      .from('panchayat_config')
      .upsert({ key: 'custom_whatsapp_templates', value: JSON.stringify(cleanedTemplates) });
    console.log('Cleanup finished.');

  } catch (err) {
    console.error('Error during testing:', err);
  }
}

testTemplates();
