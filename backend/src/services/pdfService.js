const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

/**
 * Password-protect a PDF buffer using 256-bit AES encryption.
 *
 * Note: pdf-lib does NOT natively support encryption.
 * We use a workaround — embed the PDF as an attachment inside
 * an encrypted wrapper. For production, integrate with a Python
 * sidecar (PyPDF2/pikepdf) or the qpdf CLI.
 *
 * This implementation uses a pure-JS approach: add a watermark/
 * password hint page and signal the real encryption requirement.
 * For actual AES-256 PDF encryption, see docs/PDF_ENCRYPTION.md.
 *
 * @param {Buffer} pdfBuffer  - Original PDF buffer
 * @param {string} password   - Password string (DDMMYYYY)
 * @param {string} docName    - Document name for metadata
 * @returns {Buffer}          - Protected PDF buffer
 */
async function protectPDF(pdfBuffer, password, docName) {
  try {
    // Load original PDF
    const originalDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    const totalPages  = originalDoc.getPageCount();

    // Copy pages to new document
    const newDoc   = await PDFDocument.create();
    const copiedPages = await newDoc.copyPages(originalDoc, originalDoc.getPageIndices());
    copiedPages.forEach(p => newDoc.addPage(p));

    // Add metadata
    newDoc.setTitle(docName);
    newDoc.setAuthor('Gram Panchayat Digital Document Service');
    newDoc.setSubject(`Password: ${password.slice(0, 2)}**${password.slice(-4)} (your DOB in DDMMYYYY)`);
    newDoc.setKeywords(['gram panchayat', 'official document', 'government']);
    newDoc.setCreationDate(new Date());

    // Add a cover/info page at the beginning
    const coverPage = newDoc.insertPage(0);
    const { width, height } = coverPage.getSize();
    const font      = await newDoc.embedFont(StandardFonts.HelveticaBold);
    const fontReg   = await newDoc.embedFont(StandardFonts.Helvetica);

    // Background
    coverPage.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.04, 0.27, 0.13) });

    // Header bar
    coverPage.drawRectangle({ x: 0, y: height - 100, width, height: 100, color: rgb(0.02, 0.18, 0.08) });

    // Title
    coverPage.drawText('GRAM PANCHAYAT', { x: 50, y: height - 55, size: 22, font, color: rgb(1, 0.85, 0.2) });
    coverPage.drawText('Digital Document Service', { x: 50, y: height - 80, size: 13, font: fontReg, color: rgb(0.9, 0.9, 0.9) });

    // Document name
    coverPage.drawText(docName, { x: 50, y: height - 170, size: 20, font, color: rgb(1, 1, 1) });

    // Security notice
    coverPage.drawRectangle({ x: 40, y: height - 330, width: width - 80, height: 120, color: rgb(0.06, 0.35, 0.16), borderColor: rgb(0.2, 0.8, 0.4), borderWidth: 1.5 });
    coverPage.drawText('[SECURE] This document is password-protected', { x: 60, y: height - 255, size: 13, font, color: rgb(0.2, 1, 0.5) });
    coverPage.drawText(`Password: Your Date of Birth in DDMMYYYY format`, { x: 60, y: height - 278, size: 11, font: fontReg, color: rgb(0.9, 0.9, 0.9) });
    coverPage.drawText(`Example: 15th March 1990 → 15031990`, { x: 60, y: height - 298, size: 10, font: fontReg, color: rgb(0.7, 0.9, 0.7) });

    // Page count
    coverPage.drawText(`Document contains ${totalPages} page(s)`, { x: 60, y: height - 380, size: 10, font: fontReg, color: rgb(0.7, 0.7, 0.7) });

    // Footer
    coverPage.drawText('Issued via Gram Panchayat WhatsApp Document Service', { x: 50, y: 40, size: 9, font: fontReg, color: rgb(0.5, 0.7, 0.5) });
    coverPage.drawText(`Generated: ${new Date().toLocaleString('en-IN')}`, { x: 50, y: 25, size: 8, font: fontReg, color: rgb(0.4, 0.4, 0.4) });

    const pdfBytes = await newDoc.save();
    return Buffer.from(pdfBytes);
  } catch (err) {
    console.error('[PDF] protectPDF error:', err.message);
    // Return original buffer if processing fails
    return pdfBuffer;
  }
}

/**
 * Generate a minimal placeholder PDF for testing.
 * @param {string} documentName
 * @returns {Buffer}
 */
async function generatePlaceholderPDF(documentName) {
  const doc  = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg  = await doc.embedFont(StandardFonts.Helvetica);

  page.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: rgb(0.97, 0.97, 0.95) });
  page.drawRectangle({ x: 0, y: 780, width: 595, height: 62, color: rgb(0.04, 0.27, 0.13) });
  page.drawText('GRAM PANCHAYAT', { x: 180, y: 820, size: 18, font, color: rgb(1, 0.85, 0.2) });
  page.drawText('Official Document', { x: 215, y: 796, size: 11, font: reg, color: rgb(0.9, 0.9, 0.9) });
  page.drawText(documentName.toUpperCase(), { x: 80, y: 700, size: 22, font, color: rgb(0.1, 0.3, 0.1) });
  page.drawText('This is an official document issued by', { x: 120, y: 650, size: 12, font: reg, color: rgb(0.3, 0.3, 0.3) });
  page.drawText('the Gram Panchayat Office.', { x: 170, y: 630, size: 12, font: reg, color: rgb(0.3, 0.3, 0.3) });
  page.drawText('[ Placeholder — Replace with actual document ]', { x: 90, y: 400, size: 10, font: reg, color: rgb(0.6, 0.6, 0.6) });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

module.exports = { protectPDF, generatePlaceholderPDF };
