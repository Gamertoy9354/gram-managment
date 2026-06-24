const crypto = require('crypto');
require('dotenv').config();

const ALGORITHM = 'aes-256-cbc';
const KEY_RAW   = process.env.ENCRYPTION_KEY || 'gp-encryption-key-32chars-padded!';

// Derive a consistent 32-byte key from any length string
const KEY = crypto.createHash('sha256').update(KEY_RAW).digest();

/**
 * Encrypt a plaintext string.
 * @param {string} text - Plain text to encrypt
 * @returns {string}    - "iv:encryptedHex"
 */
function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt an encrypted string.
 * @param {string} encryptedText - "iv:encryptedHex"
 * @returns {string}             - Original plain text
 */
function decrypt(encryptedText) {
  const [ivHex, encrypted] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encrypted, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Mask Aadhaar — only show last 4 digits.
 * @param {string} aadhaar - 12-digit Aadhaar
 * @returns {string}       - "XXXX XXXX 9012"
 */
function maskAadhaar(aadhaar) {
  const clean = aadhaar.replace(/[\s-]/g, '');
  return `XXXX XXXX ${clean.slice(-4)}`;
}

/**
 * Clean and normalize an Aadhaar input (remove spaces/hyphens).
 * @param {string} input
 * @returns {string} 12-digit string or throws
 */
function normalizeAadhaar(input) {
  const clean = input.replace(/[\s-]/g, '');
  if (!/^\d{12}$/.test(clean)) throw new Error('Invalid Aadhaar format');
  return clean;
}

module.exports = { encrypt, decrypt, maskAadhaar, normalizeAadhaar };
