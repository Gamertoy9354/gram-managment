const express = require('express');
const router  = express.Router();
const { supabaseAdmin }    = require('../config/supabase');
const { authenticate, requireRole } = require('./auth');
const { encrypt, decrypt, maskAadhaar } = require('../utils/encryption');
const { createCitizenFolder, uploadDocument } = require('../services/driveService');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// All citizens routes require authentication
router.use(authenticate);

// ─── GET /api/citizens — paginated list ──────────────────────────────────────
router.get('/', async (req, res) => {
  const page  = parseInt(req.query.page  || '1', 10);
  const limit = parseInt(req.query.limit || '20', 10);
  const search = req.query.search || '';
  const from  = (page - 1) * limit;
  const to    = from + limit - 1;

  let query = supabaseAdmin
    .from('citizens')
    .select('id, mobile_number, full_name, aadhaar_last4, date_of_birth, village, address, is_active, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (search) {
    query = query.or(`full_name.ilike.%${search}%,mobile_number.ilike.%${search}%,village.ilike.%${search}%`);
  }

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ citizens: data, total: count, page, limit, totalPages: Math.ceil(count / limit) });
});

// ─── GET /api/citizens/:id ────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('citizens')
    .select('id, mobile_number, full_name, aadhaar_last4, date_of_birth, village, address, google_drive_folder_id, is_active, created_at, updated_at')
    .eq('id', req.params.id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Citizen not found' });
  res.json({ citizen: data });
});

// ─── POST /api/citizens ───────────────────────────────────────────────────────
router.post('/', requireRole('super_admin', 'operator'), async (req, res) => {
  const { mobile_number, full_name, aadhaar_number, date_of_birth, address, village } = req.body;

  if (!mobile_number || !full_name || !aadhaar_number || !date_of_birth) {
    return res.status(400).json({ error: 'Missing required fields: mobile_number, full_name, aadhaar_number, date_of_birth' });
  }

  const cleanAadhaar = aadhaar_number.replace(/[\s-]/g, '');
  if (!/^\d{12}$/.test(cleanAadhaar)) return res.status(400).json({ error: 'Invalid Aadhaar number' });
  if (!/^[6-9]\d{9}$/.test(mobile_number)) return res.status(400).json({ error: 'Invalid mobile number' });

  const encrypted = encrypt(cleanAadhaar);
  const last4     = cleanAadhaar.slice(-4);

  // Create Google Drive folder
  let folderId = null;
  try {
    folderId = await createCitizenFolder(mobile_number);
  } catch (e) {
    console.warn('[Citizens] Could not create Drive folder:', e.message);
  }

  const { data, error } = await supabaseAdmin.from('citizens').insert({
    mobile_number,
    full_name: full_name.trim(),
    aadhaar_number_encrypted: encrypted,
    aadhaar_last4: last4,
    date_of_birth,
    address: address || null,
    village: village || null,
    google_drive_folder_id: folderId,
  }).select('id, mobile_number, full_name, aadhaar_last4, date_of_birth, village').single();

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Mobile number or Aadhaar already registered' });
    return res.status(500).json({ error: error.message });
  }

  res.status(201).json({ citizen: data, message: 'Citizen registered successfully' });
});

// ─── PUT /api/citizens/:id ────────────────────────────────────────────────────
router.put('/:id', requireRole('super_admin', 'operator'), async (req, res) => {
  const { full_name, date_of_birth, address, village, is_active } = req.body;

  const updates = {};
  if (full_name)    updates.full_name    = full_name.trim();
  if (date_of_birth) updates.date_of_birth = date_of_birth;
  if (address !== undefined) updates.address = address;
  if (village !== undefined) updates.village = village;
  if (is_active !== undefined) updates.is_active = Boolean(is_active);

  const { data, error } = await supabaseAdmin
    .from('citizens')
    .update(updates)
    .eq('id', req.params.id)
    .select('id, full_name, mobile_number, is_active')
    .single();

  if (error || !data) return res.status(404).json({ error: 'Citizen not found or update failed' });
  res.json({ citizen: data, message: 'Updated successfully' });
});

// ─── DELETE /api/citizens/:id (soft delete) ───────────────────────────────────
router.delete('/:id', requireRole('super_admin'), async (req, res) => {
  const { error } = await supabaseAdmin
    .from('citizens')
    .update({ is_active: false })
    .eq('id', req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Citizen deactivated' });
});

// ─── POST /api/citizens/bulk-upload ─────────────────────────────────────────
router.post('/bulk-upload', requireRole('super_admin', 'operator'), upload.single('csv'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No CSV file uploaded' });

  const csv  = req.file.buffer.toString('utf8');
  const rows = csv.split('\n').filter(r => r.trim());
  const header = rows.shift().split(',').map(h => h.trim().toLowerCase());

  const results = { success: 0, failed: 0, errors: [] };

  for (const row of rows) {
    const vals = row.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const obj  = Object.fromEntries(header.map((h, i) => [h, vals[i]]));

    const cleanAadhaar = (obj.aadhaar_number || '').replace(/[\s-]/g, '');
    if (!/^\d{12}$/.test(cleanAadhaar) || !/^[6-9]\d{9}$/.test(obj.mobile_number)) {
      results.failed++;
      results.errors.push(`Row skipped: ${obj.full_name} — invalid mobile/Aadhaar`);
      continue;
    }

    const { error } = await supabaseAdmin.from('citizens').insert({
      mobile_number: obj.mobile_number,
      full_name: obj.full_name,
      aadhaar_number_encrypted: encrypt(cleanAadhaar),
      aadhaar_last4: cleanAadhaar.slice(-4),
      date_of_birth: obj.date_of_birth,
      address: obj.address || null,
      village: obj.village || null,
    });

    if (error) { results.failed++; results.errors.push(`${obj.full_name}: ${error.message}`); }
    else results.success++;
  }

  res.json({ message: 'Bulk upload complete', ...results });
});

module.exports = router;
