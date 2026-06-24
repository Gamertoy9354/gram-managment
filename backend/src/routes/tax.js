const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const xlsx    = require('xlsx');
const crypto  = require('crypto');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { authenticate } = require('./auth');
const { supabaseAdmin } = require('../config/supabase');
const { sendMessage, sendMedia } = require('../config/twilio');
const { generateEReceipt, saveReceiptForDelivery } = require('../services/receiptService');
const { logTransaction } = require('../services/authService');
const { getPanchayatConfig } = require('../config/panchayat');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const QRCode = require('qrcode');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

// Helper: Convert English/ASCII representation for PDF compatibility (since standard PDF fonts only support WinAnsi)
function sanitizeForPDF(text) {
  if (!text) return '';
  // Mapping or removing non-ASCII characters to prevent PDF generation errors
  return text.toString()
    .replace(/[\u0100-\uffff]/g, '') // Remove non-latin
    .trim();
}

// Helper: Build a beautiful PDF receipt
async function generatePDFReceipt(record, paymentId) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4 Size
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Background Border Card
  page.drawRectangle({
    x: 20,
    y: 20,
    width: 555,
    height: 802,
    borderWidth: 2,
    borderColor: rgb(0.1, 0.45, 0.25), // Forest Green
    color: rgb(0.98, 0.99, 0.98),
  });

  // Top Header Banner
  page.drawRectangle({
    x: 22,
    y: 720,
    width: 551,
    height: 100,
    color: rgb(0.1, 0.45, 0.25),
  });

  // Header Text
  page.drawText('GRAM PANCHAYAT DIGITAL TAX RECEIPT', {
    x: 50,
    y: 775,
    size: 20,
    font: boldFont,
    color: rgb(1, 1, 1),
  });

  page.drawText('OFFICIAL ONLINE PAYMENT SLIP', {
    x: 50,
    y: 745,
    size: 12,
    font: font,
    color: rgb(0.9, 0.9, 0.9),
  });

  // Receipt Details Title
  page.drawText('TRANSACTION DETAILS', {
    x: 50,
    y: 660,
    size: 16,
    font: boldFont,
    color: rgb(0.1, 0.45, 0.25),
  });

  page.drawLine({
    start: { x: 50, y: 650 },
    end: { x: 545, y: 650 },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });

  const detailsYStart = 600;
  const lineSpacing = 30;

  const data = [
    { label: 'Property ID (Milkat No):', value: record.property_id },
    { label: 'Owner Name:', value: sanitizeForPDF(record.owner_name) || 'Taxpayer' },
    { label: 'Mobile Number:', value: `+91 ${record.mobile_number}` },
    { label: 'Amount Paid:', value: `INR ${parseFloat(record.due_amount).toFixed(2)}` },
    { label: 'Payment Status:', value: 'PAID (ONLINE SUCCESS)' },
    { label: 'Razorpay Payment ID:', value: paymentId || 'N/A' },
    { label: 'Transaction Date:', value: new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) },
  ];

  data.forEach((item, index) => {
    const y = detailsYStart - (index * lineSpacing);
    page.drawText(item.label, {
      x: 50,
      y,
      size: 11,
      font: boldFont,
      color: rgb(0.2, 0.2, 0.2),
    });
    page.drawText(item.value, {
      x: 250,
      y,
      size: 11,
      font: font,
      color: rgb(0.3, 0.3, 0.3),
    });
  });

  // Signature Block
  page.drawText('Authorized Signatory', {
    x: 400,
    y: 200,
    size: 11,
    font: boldFont,
    color: rgb(0.2, 0.2, 0.2),
  });
  page.drawText('Gram Panchayat Admin', {
    x: 400,
    y: 185,
    size: 10,
    font: font,
    color: rgb(0.5, 0.5, 0.5),
  });

  page.drawLine({
    start: { x: 380, y: 215 },
    end: { x: 520, y: 215 },
    thickness: 1,
    color: rgb(0.6, 0.6, 0.6),
  });

  // Important Notice Banner at bottom
  page.drawRectangle({
    x: 35,
    y: 50,
    width: 525,
    height: 70,
    color: rgb(0.95, 0.95, 0.95),
    borderWidth: 1,
    borderColor: rgb(0.8, 0.8, 0.8),
  });

  page.drawText('IMPORTANT NOTE FOR CITIZEN', {
    x: 50,
    y: 100,
    size: 10,
    font: boldFont,
    color: rgb(0.8, 0.2, 0.2),
  });

  page.drawText('This is a computer-generated online payment slip. Please collect', {
    x: 50,
    y: 82,
    size: 9.5,
    font: font,
    color: rgb(0.3, 0.3, 0.3),
  });

  page.drawText('the real receipt from the Gram Panchayat office only.', {
    x: 50,
    y: 67,
    size: 9.5,
    font: boldFont,
    color: rgb(0.1, 0.45, 0.25),
  });

  return await pdfDoc.save();
}

// ─── POST /api/tax/import ─────────────────────────────────────────────────────
router.post('/import', authenticate, upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Please upload an Excel file.' });

  try {
    const workbook = xlsx.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet     = workbook.Sheets[sheetName];
    const rows      = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    // Fetch existing records' mobile numbers for duplicate checking
    const { data: existingRecords, error: fetchErr } = await supabaseAdmin
      .from('tax_records')
      .select('mobile_number');

    if (fetchErr) throw fetchErr;

    const existingMobiles = new Set((existingRecords || []).map(r => r.mobile_number ? r.mobile_number.toString().trim() : ''));
    const processedMobilesInSheet = new Set();
    let duplicateCount = 0;

    const importedRecords = [];
    
    // Self-healing parsing starting from row 4 (index 3) to skip metadata/titles
    for (let i = 4; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const propertyId = row[0]?.toString().trim();
      const ownerName  = row[1]?.toString().trim() || row[2]?.toString().trim();
      
      // Extract due tax
      let rawDue = row[3]?.toString().replace(/[^0-9.]/g, '') || '0';
      const dueAmount = parseFloat(rawDue) || 0.00;

      // Skip rows with no property ID or 0 due
      if (!propertyId || isNaN(dueAmount) || dueAmount <= 0) continue;

      // Scan all cells in this row for a valid 10-digit mobile number
      let mobileNumber = '';
      for (const cell of row) {
        if (cell) {
          const cleaned = cell.toString().replace(/[^0-9]/g, '');
          if (cleaned.length === 10 && /^[6-9]\d{9}$/.test(cleaned)) {
            mobileNumber = cleaned;
            break;
          }
        }
      }

      // If no valid mobile number is found, we can skip or set a default placeholder
      if (!mobileNumber) continue;

      // Check for duplicate by mobile number (either in DB or already processed in this sheet)
      if (existingMobiles.has(mobileNumber) || processedMobilesInSheet.has(mobileNumber)) {
        duplicateCount++;
        continue;
      }
      processedMobilesInSheet.add(mobileNumber);

      const parsedInt = parseInt(propertyId.toString().replace(/[^0-9]/g, ''), 10);
      importedRecords.push({
        property_id: propertyId,
        property_id_int: isNaN(parsedInt) ? null : parsedInt,
        owner_name: ownerName || 'Property Holder',
        due_amount: dueAmount,
        mobile_number: mobileNumber,
        payment_status: 'pending'
      });
    }

    if (importedRecords.length === 0) {
      return res.json({
        message: `Import complete! All ${duplicateCount} records in the Excel sheet were identified as duplicates and skipped.`,
        imported: 0,
        duplicates: duplicateCount
      });
    }

    // Upsert into Supabase (match by property_id)
    const { error } = await supabaseAdmin
      .from('tax_records')
      .upsert(importedRecords, { onConflict: 'property_id' });

    if (error) throw error;

    res.json({
      message: `Import complete! Successfully imported ${importedRecords.length} tax records and skipped ${duplicateCount} duplicate records.`,
      imported: importedRecords.length,
      duplicates: duplicateCount
    });
  } catch (err) {
    console.error('[Tax] Import error:', err.message);
    res.status(500).json({ error: 'Failed to import tax sheet: ' + err.message });
  }
});

// ─── GET /api/tax/records ─────────────────────────────────────────────────────
router.get('/records', authenticate, async (req, res) => {
  const page      = parseInt(req.query.page || '1', 10);
  const limit     = parseInt(req.query.limit || '10', 10);
  const search    = req.query.search || '';
  const status    = req.query.status || '';
  const sortBy    = req.query.sortBy || 'created_at';
  const sortOrder = req.query.sortOrder || 'desc';

  try {
    let query = supabaseAdmin
      .from('tax_records')
      .select('*', { count: 'exact' });

    if (search) {
      query = query.or(`property_id.ilike.%${search}%,owner_name.ilike.%${search}%,mobile_number.ilike.%${search}%`);
    }
    if (status) {
      query = query.eq('payment_status', status);
    }

    // Pagination
    const fromOffset = (page - 1) * limit;
    const toOffset   = fromOffset + limit - 1;

    const allowedSortBy = ['created_at', 'property_id', 'due_amount', 'owner_name'];
    let actualSortBy = allowedSortBy.includes(sortBy) ? sortBy : 'created_at';
    const ascending = sortOrder === 'asc';

    let orderQuery = query;
    if (actualSortBy === 'property_id') {
      orderQuery = query
        .order('property_id_int', { ascending, nullsFirst: false })
        .order('property_id', { ascending });
    } else {
      orderQuery = query.order(actualSortBy, { ascending });
    }

    const { data, count, error } = await orderQuery
      .range(fromOffset, toOffset);

    if (error) throw error;

    // Fetch lightweight columns for global system statistics calculations
    const { data: allDues, error: duesErr } = await supabaseAdmin
      .from('tax_records')
      .select('payment_status, due_amount');

    if (duesErr) {
      console.error('[Tax] Failed to fetch dues stats:', duesErr.message);
    }

    let totalPendingAmount = 0;
    let totalPaidAmount = 0;
    let totalPendingCount = 0;
    let totalPaidCount = 0;

    if (allDues) {
      for (const row of allDues) {
        const amt = parseFloat(row.due_amount || 0);
        if (row.payment_status === 'paid') {
          totalPaidAmount += amt;
          totalPaidCount++;
        } else {
          totalPendingAmount += amt;
          totalPendingCount++;
        }
      }
    }

    res.json({
      records: data || [],
      total: count || 0,
      page,
      pages: Math.ceil((count || 0) / limit),
      stats: {
        totalPendingAmount,
        totalPaidAmount,
        totalPendingCount,
        totalPaidCount
      }
    });
  } catch (err) {
    console.error('[Tax] Fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch tax records: ' + err.message });
  }
});

// ─── POST /api/tax/record (Manual Create) ──────────────────────────────────────
router.post('/record', authenticate, async (req, res) => {
  const { propertyId, ownerName, dueAmount, mobileNumber } = req.body;

  if (!propertyId || !ownerName || !dueAmount || !mobileNumber) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  try {
    const propIdStr = String(propertyId).trim();
    const ownerNameStr = String(ownerName).trim();
    const mobileStr = String(mobileNumber).replace(/[^0-9]/g, '');
    const parsedInt = parseInt(propIdStr.replace(/[^0-9]/g, ''), 10);
    const { data, error } = await supabaseAdmin
      .from('tax_records')
      .insert({
        property_id: propIdStr,
        property_id_int: isNaN(parsedInt) ? null : parsedInt,
        owner_name: ownerNameStr,
        due_amount: parseFloat(dueAmount),
        mobile_number: mobileStr,
        payment_status: 'pending'
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ record: data, message: 'Tax record created successfully.' });
  } catch (err) {
    console.error('[Tax] Manual create error:', err.message);
    res.status(500).json({ error: 'Failed to create tax record: ' + err.message });
  }
});

// ─── PUT /api/tax/record/:id (Manual Edit) ────────────────────────────────────
router.put('/record/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { propertyId, ownerName, dueAmount, mobileNumber, paymentStatus } = req.body;

  try {
    const propIdStr = propertyId !== undefined ? String(propertyId).trim() : undefined;
    const ownerNameStr = ownerName !== undefined ? String(ownerName).trim() : undefined;
    const mobileStr = mobileNumber !== undefined ? String(mobileNumber).replace(/[^0-9]/g, '') : undefined;
    const parsedInt = propIdStr ? parseInt(propIdStr.replace(/[^0-9]/g, ''), 10) : NaN;
    const { data, error } = await supabaseAdmin
      .from('tax_records')
      .update({
        property_id: propIdStr,
        property_id_int: isNaN(parsedInt) ? undefined : parsedInt,
        owner_name: ownerNameStr,
        due_amount: dueAmount ? parseFloat(dueAmount) : undefined,
        mobile_number: mobileStr,
        payment_status: paymentStatus || undefined,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ record: data, message: 'Tax record updated successfully.' });
  } catch (err) {
    console.error('[Tax] Manual edit error:', err.message);
    res.status(500).json({ error: 'Failed to update tax record: ' + err.message });
  }
});

// ─── POST /api/tax/record/:id/notify (Individual WhatsApp Notification) ────────
router.post('/record/:id/notify', authenticate, async (req, res) => {
  const { id } = req.params;
  const { template } = req.body;

  if (!template) {
    return res.status(400).json({ error: 'Message template content is required.' });
  }

  try {
    // 1. Fetch the tax record
    const { data: record, error: fetchErr } = await supabaseAdmin
      .from('tax_records')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !record) {
      return res.status(404).json({ error: 'Tax record not found.' });
    }

    const config = await getPanchayatConfig();

    // 2. Generate UPI URL dynamically (always updated with latest amount and env configs)
    let paymentLink;
    try {
      const payeeUpi = config.payee_upi_id || process.env.PAYEE_UPI_ID || 'shismehta77@oksbi';
      const payeeName = config.payee_name || process.env.PAYEE_NAME || 'Sina AI';
      const orderId = `gp_${record.property_id}_${Date.now()}`;
      
      paymentLink = `upi://pay?pa=${payeeUpi}&pn=${encodeURIComponent(payeeName)}&am=${parseFloat(record.due_amount).toFixed(2)}&cu=INR&tn=TXID%3D${record.property_id}`;

      // Update record in Supabase
      await supabaseAdmin
        .from('tax_records')
        .update({
          razorpay_payment_link_id: orderId,
          payment_link: paymentLink
        })
        .eq('id', record.id);
    } catch (upiErr) {
      console.error(`[UPI] Individual link generation failed for ${record.owner_name}:`, upiErr.message);
      return res.status(500).json({ error: 'Failed to generate UPI payment link: ' + upiErr.message });
    }



    // 3. Compile customized template message
    let msg = template
      .replace(/{owner_name}/gi, record.owner_name)
      .replace(/{property_id}/gi, record.property_id)
      .replace(/{due_amount}/gi, parseFloat(record.due_amount).toFixed(2))
      .replace(/{payment_link}/gi, paymentLink);

    const formattedTo = `whatsapp:+91${record.mobile_number}`;

    // 4. Generate local QR Code and send as WhatsApp media message
    try {
      const qrFilename = `qr_${record.property_id}_${Date.now()}.png`;
      const tmpDir = process.env.VERCEL ? os.tmpdir() : path.join(__dirname, '../../storage/temp-media');
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
      const qrFilePath = path.join(tmpDir, qrFilename);

      await QRCode.toFile(qrFilePath, paymentLink, { width: 500, margin: 2 });
      
      const publicUrl = process.env.PUBLIC_URL || 'http://localhost:3000';
      const mediaUrl = `${publicUrl.replace(/\/$/, '')}/media/${qrFilename}`;

      await sendMedia(formattedTo, msg, mediaUrl);

      // 5. Log successful transaction
      await logTransaction({
        citizenId: null,
        whatsappNumber: formattedTo,
        documentRequested: `[Tax Alert] Property ID: ${record.property_id}`,
        status: 'success',
        sessionId: null,
      });

      res.json({ message: `Successfully sent tax alert to ${record.owner_name} (+91 ${record.mobile_number})!` });

    } catch (twilioErr) {
      console.error(`[Twilio] Individual tax alert failed for ${record.mobile_number}:`, twilioErr.message);

      // Log failed transaction
      await logTransaction({
        citizenId: null,
        whatsappNumber: formattedTo,
        documentRequested: `[Tax Alert] Property ID: ${record.property_id}`,
        status: 'failed',
        failureReason: twilioErr.message,
        sessionId: null,
      });

      res.status(500).json({ error: 'Twilio delivery failed: ' + twilioErr.message });
    }
  } catch (err) {
    console.error('[Tax] Individual notify error:', err.message);
    res.status(500).json({ error: 'Failed to send individual notification: ' + err.message });
  }
});

// ─── DELETE /api/tax/records/all (Bulk Delete All Records) ───────────────────
router.delete('/records/all', authenticate, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('tax_records')
      .delete()
      .gt('created_at', '1970-01-01Z'); // Standard filter to clear all rows

    if (error) throw error;

    res.json({ message: 'All property tax records have been successfully deleted.' });
  } catch (err) {
    console.error('[Tax] Bulk delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete all tax records: ' + err.message });
  }
});

// ─── DELETE /api/tax/record/:id (Delete Individual Record) ───────────────────
router.delete('/record/:id', authenticate, async (req, res) => {
  const { id } = req.params;

  try {
    const { error } = await supabaseAdmin
      .from('tax_records')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'Tax record deleted successfully.' });
  } catch (err) {
    console.error('[Tax] Individual delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete tax record: ' + err.message });
  }
});


// ─── POST /api/tax/circulate (Bulk Send) ──────────────────────────────────────
router.post('/circulate', authenticate, async (req, res) => {
  const { template } = req.body;
  if (!template) return res.status(400).json({ error: 'Message template content is required.' });

  try {
    const config = await getPanchayatConfig();

    // Fetch all pending tax records
    const { data: records, error } = await supabaseAdmin
      .from('tax_records')
      .select('*')
      .eq('payment_status', 'pending');

    if (error) throw error;

    if (!records || records.length === 0) {
      return res.status(404).json({ error: 'No pending tax records found to circulate.' });
    }

    const report = { total: records.length, success: 0, failed: 0 };

    for (const record of records) {
      // Always generate the latest UPI payment URL dynamically for each record based on current amount and env configs
      let paymentLink;
      try {
        const payeeUpi = config.payee_upi_id || process.env.PAYEE_UPI_ID || 'shismehta77@oksbi';
        const payeeName = config.payee_name || process.env.PAYEE_NAME || 'Sina AI';
        const orderId = `gp_${record.property_id}_${Date.now()}`;
        
        paymentLink = `upi://pay?pa=${payeeUpi}&pn=${encodeURIComponent(payeeName)}&am=${parseFloat(record.due_amount).toFixed(2)}&cu=INR&tn=TXID%3D${record.property_id}`;

        // Update record in Supabase
        await supabaseAdmin
          .from('tax_records')
          .update({
            razorpay_payment_link_id: orderId,
            payment_link: paymentLink
          })
          .eq('id', record.id);
      } catch (upiErr) {
        console.error(`[UPI] Bulk link generation failed for ${record.owner_name}:`, upiErr.message);
        report.failed++;
        continue;
      }



      // Compile customized template message
      let msg = template
        .replace(/{owner_name}/gi, record.owner_name)
        .replace(/{property_id}/gi, record.property_id)
        .replace(/{due_amount}/gi, parseFloat(record.due_amount).toFixed(2))
        .replace(/{payment_link}/gi, paymentLink);

      const formattedTo = `whatsapp:+91${record.mobile_number}`;

      try {
        const qrFilename = `qr_${record.property_id}_${Date.now()}.png`;
        const tmpDir = process.env.VERCEL ? os.tmpdir() : path.join(__dirname, '../../storage/temp-media');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
        const qrFilePath = path.join(tmpDir, qrFilename);

        await QRCode.toFile(qrFilePath, paymentLink, { width: 500, margin: 2 });
        
        const publicUrl = process.env.PUBLIC_URL || 'http://localhost:3000';
        const mediaUrl = `${publicUrl.replace(/\/$/, '')}/media/${qrFilename}`;

        await sendMedia(formattedTo, msg, mediaUrl);

        await logTransaction({
          citizenId: null,
          whatsappNumber: formattedTo,
          documentRequested: `[Tax Circular] Property ID: ${record.property_id}`,
          status: 'success',
          sessionId: null,
        });

        report.success++;

      } catch (twilioErr) {
        console.error(`[Twilio] Bulk tax alert failed for ${record.mobile_number}:`, twilioErr.message);

        await logTransaction({
          citizenId: null,
          whatsappNumber: formattedTo,
          documentRequested: `[Tax Circular] Property ID: ${record.property_id}`,
          status: 'failed',
          failureReason: twilioErr.message,
          sessionId: null,
        });

        report.failed++;
      }
    }

    res.json({
      message: `Tax circulation complete! Success: ${report.success}, Failed: ${report.failed}`,
      report
    });
  } catch (err) {
    console.error('[Tax] Circulation error:', err.message);
    res.status(500).json({ error: 'Failed to circulate tax alerts: ' + err.message });
  }
});

// Helper for Mock Webhook triggering (useful during manual/local testing)
router.post('/webhook-mock-trigger', authenticate, async (req, res) => {
  const { propertyId } = req.body;
  if (!propertyId) return res.status(400).json({ error: 'Property ID required.' });

  try {
    const { data: record, error } = await supabaseAdmin
      .from('tax_records')
      .select('*')
      .eq('property_id', propertyId)
      .eq('payment_status', 'pending')
      .single();

    if (error || !record) return res.status(404).json({ error: 'Pending tax record not found.' });

    const config = await getPanchayatConfig();
    const paymentId = `mock_dashboard_confirmed_${Date.now()}`;

    // Update tax record status in DB (dashboard updates instantly)
    await supabaseAdmin
      .from('tax_records')
      .update({
        payment_status: 'paid',
        razorpay_payment_id: paymentId,
        updated_at: new Date().toISOString()
      })
      .eq('id', record.id);

    // Deliver confirmation to citizen via WhatsApp
    const formattedTo = `whatsapp:+91${record.mobile_number}`;
    const caption = `🎉 *Property Tax Payment Successfully Received!*\n\n` +
                    `🏠 *Property ID:* ${record.property_id}\n` +
                    `👤 *Name:* ${record.owner_name}\n` +
                    `💰 *Amount Paid:* ₹${parseFloat(record.due_amount).toFixed(2)}\n` +
                    `🔒 *Verification ID:* ${paymentId}\n\n` +
                    `Your payment has been successfully received and verified. Please collect your real receipt from the Gram Panchayat office in person.`;

    try {
      await sendMessage(formattedTo, caption);
      console.log(`[Mock Trigger] Confirmation sent successfully to ${record.mobile_number}`);

      await logTransaction({
        citizenId: record.citizen_id || null,
        whatsappNumber: formattedTo,
        documentRequested: `[Receipt Delivery (Mock)] Property ID: ${record.property_id}`,
        status: 'success',
        sessionId: null,
      });

      // Generate and deliver PDF e-receipt
      try {
        const pdfBytes = await generateEReceipt(
          { ...record, payment_link: record.payment_link || '' },
          paymentId,
          config.panchayat_name || 'Gram Panchayat'
        );
        const { mediaUrl: receiptUrl } = await saveReceiptForDelivery(pdfBytes, `receipt_${record.property_id}`);
        if (receiptUrl) {
          await sendMedia(
            formattedTo,
            `📄 *Official E-Receipt* — Property ID: ${record.property_id}\n\nThis is your official digital payment receipt. Please also collect the original from the Gram Panchayat office.`,
            receiptUrl
          );
          console.log(`[Receipt] E-receipt delivered to ${record.mobile_number} for property ${record.property_id}`);
        }
      } catch (receiptErr) {
        console.error('[Receipt] E-receipt delivery failed (mock trigger):', receiptErr.message);
        // Non-critical
      }

    } catch (twilioErr) {
      console.warn(`[Mock Trigger] Warning: payment confirmed but WhatsApp confirmation failed: ${twilioErr.message}`);
    }

    res.json({ message: 'Mock payment confirmed and processed successfully!', paymentId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
