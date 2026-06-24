/**
 * receiptService.js — Generates a detailed, branded PDF e-receipt
 * for Gram Panchayat property tax payments.
 *
 * Uses pdf-lib (already in package.json) with no external dependencies.
 * Returns a Uint8Array (PDF bytes) suitable for saving or uploading.
 */

const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');
const QRCode = require('qrcode');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');

// ─── Colour Palette ─────────────────────────────────────────────────────────
const COLORS = {
  headerBg:    rgb(0.071, 0.369, 0.341),  // #127060 — deep teal
  accentGreen: rgb(0.106, 0.451, 0.251),  // #1B7340 — forest green
  accentGold:  rgb(0.753, 0.573, 0.090),  // #C09217 — warm gold
  lightGreen:  rgb(0.886, 0.953, 0.918),  // #E2F3EA
  border:      rgb(0.106, 0.451, 0.251),  // same as accentGreen
  textDark:    rgb(0.110, 0.110, 0.110),  // near-black
  textGray:    rgb(0.380, 0.380, 0.380),
  textLight:   rgb(0.650, 0.650, 0.650),
  white:       rgb(1, 1, 1),
  paidGreen:   rgb(0.129, 0.690, 0.361),
  red:         rgb(0.784, 0.180, 0.180),
};

// ─── Helpers ────────────────────────────────────────────────────────────────
function sanitize(text) {
  if (!text) return '';
  return text.toString().replace(/[\u0100-\uffff]/g, '').trim();
}

function formatDate(isoOrDate) {
  try {
    const d = new Date(isoOrDate || Date.now());
    return d.toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit', month: 'long', year: 'numeric',
    });
  } catch {
    return new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
  }
}

function formatTime(isoOrDate) {
  try {
    const d = new Date(isoOrDate || Date.now());
    return d.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/**
 * Generates a QR code PNG buffer for the given content.
 * Returns null if QR code generation fails.
 */
async function generateQRBuffer(content) {
  if (!content) return null;
  try {
    return await QRCode.toBuffer(content, {
      type: 'png',
      width: 160,
      margin: 1,
      color: { dark: '#12544A', light: '#FFFFFF' },
    });
  } catch (err) {
    console.error('[Receipt] QR generation failed:', err.message);
    return null;
  }
}

// ─── Main Generator ─────────────────────────────────────────────────────────
/**
 * Generate a PDF e-receipt for a paid tax record.
 *
 * @param {object} record - Tax record from Supabase:
 *   { property_id, owner_name, mobile_number, due_amount, payment_link, … }
 * @param {string} paymentId - Verification / payment ID
 * @param {string} panchayatName - Name of the Gram Panchayat
 * @returns {Uint8Array} PDF bytes
 */
async function generateEReceipt(record, paymentId, panchayatName = 'Gram Panchayat') {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`Tax Receipt — ${record.property_id}`);
  pdfDoc.setAuthor(panchayatName);
  pdfDoc.setSubject('Property Tax Payment Receipt');
  pdfDoc.setCreationDate(new Date());

  // A4: 595 × 842 pt
  const page = pdfDoc.addPage([595, 842]);
  const { width, height } = page.getSize();

  const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontObl  = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  // ── Outer border ──────────────────────────────────────────────────────────
  page.drawRectangle({
    x: 15, y: 15, width: width - 30, height: height - 30,
    borderWidth: 2.5, borderColor: COLORS.border,
    color: rgb(0.988, 0.996, 0.992),
  });

  // ── Header band ───────────────────────────────────────────────────────────
  const headerH = 110;
  page.drawRectangle({
    x: 17, y: height - 17 - headerH,
    width: width - 34, height: headerH,
    color: COLORS.headerBg,
  });

  // Gold accent strip
  page.drawRectangle({
    x: 17, y: height - 17 - headerH,
    width: width - 34, height: 5,
    color: COLORS.accentGold,
  });

  // Header text
  page.drawText('GRAM PANCHAYAT', {
    x: 30, y: height - 57,
    size: 22, font: fontBold, color: COLORS.white,
  });
  page.drawText(sanitize(panchayatName).toUpperCase(), {
    x: 30, y: height - 80,
    size: 13, font: fontReg, color: rgb(0.8, 0.95, 0.88),
  });
  page.drawText('DIGITAL SERVICES', {
    x: 30, y: height - 96,
    size: 10, font: fontObl, color: COLORS.accentGold,
  });

  // "TAX RECEIPT" badge on right
  page.drawRectangle({
    x: width - 170, y: height - 104,
    width: 140, height: 76,
    color: rgb(0, 0, 0, 0.18),
    borderWidth: 1, borderColor: COLORS.accentGold,
  });
  page.drawText('OFFICIAL', {
    x: width - 150, y: height - 45,
    size: 9, font: fontReg, color: COLORS.accentGold,
  });
  page.drawText('TAX RECEIPT', {
    x: width - 162, y: height - 64,
    size: 16, font: fontBold, color: COLORS.white,
  });
  page.drawText('PAID ✓', {
    x: width - 147, y: height - 82,
    size: 12, font: fontBold, color: COLORS.paidGreen,
  });

  // ── Subheader ribbon ──────────────────────────────────────────────────────
  page.drawRectangle({
    x: 17, y: height - 17 - headerH - 30,
    width: width - 34, height: 30,
    color: COLORS.lightGreen,
  });
  const nowDate = formatDate(new Date());
  const nowTime = formatTime(new Date());
  page.drawText(`Receipt generated: ${nowDate} at ${nowTime} IST`, {
    x: 30, y: height - 17 - headerH - 19,
    size: 9, font: fontReg, color: COLORS.accentGreen,
  });
  page.drawText(`Payment ID: ${paymentId}`, {
    x: width - 260, y: height - 17 - headerH - 19,
    size: 9, font: fontBold, color: COLORS.textDark,
  });

  // ── Section: Transaction Details ──────────────────────────────────────────
  const sectionTop = height - 17 - headerH - 65;

  page.drawText('TRANSACTION DETAILS', {
    x: 30, y: sectionTop,
    size: 11, font: fontBold, color: COLORS.accentGreen,
  });
  page.drawLine({
    start: { x: 30, y: sectionTop - 6 },
    end:   { x: width - 30, y: sectionTop - 6 },
    thickness: 1.2, color: COLORS.accentGreen,
  });

  const rows = [
    { label: 'Property ID (Milkat No)', value: record.property_id || 'N/A' },
    { label: 'Owner / Taxpayer Name',   value: sanitize(record.owner_name) || 'N/A' },
    { label: 'Registered Mobile',       value: `+91 ${record.mobile_number || 'N/A'}` },
    { label: 'Amount Paid',             value: `₹ ${parseFloat(record.due_amount || 0).toFixed(2)}` },
    { label: 'Payment Method',          value: 'UPI (Online)' },
    { label: 'Payment Status',          value: '✅  PAID — VERIFIED' },
    { label: 'Verification ID',         value: paymentId },
    { label: 'Payment Date',            value: formatDate(new Date()) },
    { label: 'Payment Time (IST)',      value: formatTime(new Date()) },
  ];

  const rowStartY = sectionTop - 25;
  const rowH      = 26;

  rows.forEach((row, i) => {
    const y  = rowStartY - i * rowH;
    const bg = i % 2 === 0 ? rgb(0.975, 0.990, 0.982) : COLORS.white;

    page.drawRectangle({ x: 28, y: y - 6, width: width - 56, height: rowH, color: bg });

    page.drawText(row.label + ':', {
      x: 35, y: y + 5,
      size: 10, font: fontBold, color: COLORS.textDark,
    });

    // Special coloring for status row
    const valueColor = row.label === 'Payment Status' ? COLORS.paidGreen : COLORS.textGray;

    page.drawText(sanitize(row.value), {
      x: 255, y: y + 5,
      size: 10, font: fontReg, color: valueColor,
    });
  });

  // ── Divider ───────────────────────────────────────────────────────────────
  const dividerY = rowStartY - rows.length * rowH - 20;
  page.drawLine({
    start: { x: 30, y: dividerY }, end: { x: width - 30, y: dividerY },
    thickness: 0.8, color: COLORS.textLight,
  });

  // ── QR Code (payment link or property_id QR) ───────────────────────────────
  const qrContent = record.payment_link || `TXID=${record.property_id}`;
  const qrBuffer  = await generateQRBuffer(qrContent);

  if (qrBuffer) {
    const qrImage = await pdfDoc.embedPng(qrBuffer);
    const qrDim   = 110;
    const qrX     = width - 30 - qrDim;
    const qrY     = dividerY - qrDim - 40;

    page.drawImage(qrImage, { x: qrX, y: qrY, width: qrDim, height: qrDim });
    page.drawRectangle({
      x: qrX - 3, y: qrY - 3, width: qrDim + 6, height: qrDim + 6,
      borderWidth: 1.5, borderColor: COLORS.accentGreen,
      color: rgb(1, 1, 1, 0),
    });
    page.drawText('Scan to verify', {
      x: qrX + 12, y: qrY - 14,
      size: 8, font: fontObl, color: COLORS.textLight,
    });
  }

  // ── Section: Important Notice ──────────────────────────────────────────────
  const noticeX = 30;
  const noticeY = dividerY - 30;

  page.drawText('IMPORTANT NOTICE FOR CITIZEN', {
    x: noticeX, y: noticeY,
    size: 9.5, font: fontBold, color: COLORS.red,
  });

  const noticeLines = [
    '• This is a computer-generated digital acknowledgement only.',
    '• Please visit your Gram Panchayat office to collect the original receipt.',
    '• Keep this document safe for your personal records.',
    '• For disputes or queries, contact your local Gram Panchayat office.',
  ];
  noticeLines.forEach((line, i) => {
    page.drawText(line, {
      x: noticeX, y: noticeY - 15 - i * 14,
      size: 9, font: fontReg, color: COLORS.textGray,
    });
  });

  // ── Signature Block ────────────────────────────────────────────────────────
  const sigY = 95;

  page.drawLine({
    start: { x: 50, y: sigY + 25 }, end: { x: 180, y: sigY + 25 },
    thickness: 1, color: COLORS.textLight,
  });
  page.drawText('Citizen Signature', {
    x: 80, y: sigY + 10,
    size: 9, font: fontReg, color: COLORS.textLight,
  });

  page.drawLine({
    start: { x: width - 200, y: sigY + 25 }, end: { x: width - 50, y: sigY + 25 },
    thickness: 1, color: COLORS.textLight,
  });
  page.drawText('Authorized Signatory', {
    x: width - 190, y: sigY + 10,
    size: 9, font: fontBold, color: COLORS.textDark,
  });
  page.drawText(sanitize(panchayatName), {
    x: width - 185, y: sigY - 2,
    size: 8, font: fontReg, color: COLORS.textLight,
  });

  // ── Footer ─────────────────────────────────────────────────────────────────
  page.drawRectangle({
    x: 17, y: 17, width: width - 34, height: 42,
    color: COLORS.headerBg,
  });
  page.drawText('Powered by Flowlytix.in — Digital Gram Panchayat Management Platform', {
    x: 30, y: 37,
    size: 8, font: fontObl, color: rgb(0.7, 0.92, 0.82),
  });
  page.drawText(`© ${new Date().getFullYear()} ${sanitize(panchayatName)}. All rights reserved.`, {
    x: 30, y: 23,
    size: 7.5, font: fontReg, color: COLORS.textLight,
  });

  return await pdfDoc.save();
}

// ─── Save & Upload helper ──────────────────────────────────────────────────
/**
 * Saves a PDF buffer to Supabase Storage (gp-delivery bucket)
 * and returns the public URL, falling back to local temp directory.
 *
 * @param {Uint8Array} pdfBytes
 * @param {string} label - Filename label
 * @returns {{ mediaUrl: string|null, filename: string }}
 */
async function saveReceiptForDelivery(pdfBytes, label) {
  const { supabaseAdmin } = require('./supabase');
  const safeName = (label || 'receipt').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename  = `receipts/${Date.now()}_${safeName}.pdf`;

  try {
    const { error } = await supabaseAdmin.storage
      .from('gp-delivery')
      .upload(filename, pdfBytes, { contentType: 'application/pdf', upsert: true });

    if (error) throw new Error(error.message);

    const { data: urlData } = supabaseAdmin.storage
      .from('gp-delivery')
      .getPublicUrl(filename);

    const mediaUrl = urlData?.publicUrl || null;
    console.log(`[Receipt] Uploaded to Supabase: ${mediaUrl}`);

    // Delete after 30 minutes
    setTimeout(async () => {
      await supabaseAdmin.storage.from('gp-delivery').remove([filename]);
    }, 30 * 60 * 1000);

    return { mediaUrl, filename };
  } catch (err) {
    console.error('[Receipt] Supabase upload failed, falling back to local:', err.message);

    // Local temp-file fallback
    const tmpDir = process.env.VERCEL
      ? require('os').tmpdir()
      : require('path').join(__dirname, '../../storage/temp-media');

    if (!require('fs').existsSync(tmpDir)) require('fs').mkdirSync(tmpDir, { recursive: true });

    const localFile = require('path').join(tmpDir, `${Date.now()}_${safeName}.pdf`);
    require('fs').writeFileSync(localFile, pdfBytes);

    const publicUrl = process.env.PUBLIC_URL;
    const mediaUrl  = publicUrl
      ? `${publicUrl.replace(/\/$/, '')}/media/${require('path').basename(localFile)}`
      : null;

    return { mediaUrl, filename: localFile };
  }
}

module.exports = { generateEReceipt, saveReceiptForDelivery };
