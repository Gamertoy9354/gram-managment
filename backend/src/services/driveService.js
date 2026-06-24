const { supabaseAdmin } = require('../config/supabase');

/**
 * List all PDF documents in a citizen's storage folder.
 * @param {string} citizenIdentifier - Folder name (usually mobile number)
 * @returns {Array} - [{ id, name, label, index }]
 */
async function listDocuments(citizenIdentifier) {
  try {
    const { data: files, error } = await supabaseAdmin.storage
      .from('gp-documents')
      .list(citizenIdentifier);

    if (error) {
      console.error('[Storage] Error listing documents:', error.message);
      return [];
    }

    if (!files || files.length === 0) {
      return [];
    }

    // Filter for PDFs and format
    return files
      .filter(f => f.name.toLowerCase().endsWith('.pdf'))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((f, i) => ({
        id: f.name, // File name acts as ID in this folder
        name: f.name,
        label: f.name.replace(/_/g, ' ').replace('.pdf', ''),
        index: i + 1,
      }));
  } catch (err) {
    console.error('[Storage] listDocuments error:', err.message);
    throw new Error('Unable to retrieve documents.');
  }
}

/**
 * Download a PDF file as a Buffer from Supabase Storage.
 * @param {string} citizenIdentifier - Folder name
 * @param {string} fileName - File name (ID)
 * @returns {Buffer}
 */
async function downloadDocument(citizenIdentifier, fileName) {
  const filePath = `${citizenIdentifier}/${fileName}`;

  try {
    const { data, error } = await supabaseAdmin.storage
      .from('gp-documents')
      .download(filePath);

    if (error) throw error;
    
    // Convert Blob to Buffer
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.error(`[Storage] downloadDocument error (${filePath}):`, err.message);
    
    // Fallback: return a dummy PDF
    const { PDFDocument, StandardFonts } = require('pdf-lib');
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    page.drawText('GRAM PANCHAYAT CLOUD STORAGE', { x: 50, y: 800, size: 20, font });
    page.drawText('Citizen: ' + citizenIdentifier, { x: 50, y: 770, size: 12, font });
    page.drawText('Document: ' + fileName, { x: 50, y: 750, size: 12, font });
    page.drawText('File not found in storage. This is a generated placeholder.', { x: 50, y: 720, size: 10, font });
    
    const bytes = await pdfDoc.save();
    return Buffer.from(bytes);
  }
}

/**
 * Save a PDF to a citizen's folder in Supabase Storage.
 * @param {string} citizenIdentifier
 * @param {string} fileName
 * @param {Buffer} fileBuffer
 */
async function uploadDocument(citizenIdentifier, fileName, fileBuffer) {
  const filePath = `${citizenIdentifier}/${fileName}`;
  
  const { data, error } = await supabaseAdmin.storage
    .from('gp-documents')
    .upload(filePath, fileBuffer, {
      contentType: 'application/pdf',
      upsert: true
    });

  if (error) {
    console.error('[Storage] upload error:', error.message);
    throw error;
  }
  
  return { id: fileName, name: fileName, path: filePath };
}

/**
 * Supabase Storage creates folders virtually upon file upload.
 * We just return the identifier.
 */
async function createCitizenFolder(citizenIdentifier) {
  return citizenIdentifier;
}

module.exports = { 
  listDocuments, 
  downloadDocument, // Note: modified downloadDocument to accept citizenId as well
  uploadDocument, 
  createCitizenFolder 
};
