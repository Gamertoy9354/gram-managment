const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const { authenticate } = require('./auth');
const { uploadDocument, listDocuments } = require('../services/driveService'); // Note: service name is driveService but it uses local fs now
const { supabaseAdmin } = require('../config/supabase');

// Multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

router.use(authenticate);

/**
 * POST /api/documents/upload
 * Upload a document for a specific citizen
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  const { citizenId } = req.body;
  const file = req.file;

  if (!citizenId || !file) {
    return res.status(400).json({ error: 'Citizen ID and file are required.' });
  }

  try {
    // Get citizen's mobile number (used as folder name)
    const { data: citizen } = await supabaseAdmin
      .from('citizens')
      .select('mobile_number, full_name')
      .or(`mobile_number.eq.${citizenId},id.eq.${citizenId}`)
      .single();

    const folder = citizen ? citizen.mobile_number : citizenId;
    const storagePath = `${folder}/${file.originalname}`;

    // Upload to Supabase Storage
    const { error } = await supabaseAdmin.storage
      .from('gp-documents')
      .upload(storagePath, file.buffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (error) throw new Error(error.message);

    res.json({
      message: 'File uploaded successfully',
      fileName: file.originalname,
      citizen: folder,
      storagePath,
    });
  } catch (err) {
    console.error('[Docs] Upload error:', err.message);
    res.status(500).json({ error: 'Failed to upload: ' + err.message });
  }
});

/**
 * GET /api/documents/list/:citizenId
 */
router.get('/list/:citizenId', async (req, res) => {
  const { citizenId } = req.params;
  try {
    const docs = await listDocuments(citizenId);
    res.json({ documents: docs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
