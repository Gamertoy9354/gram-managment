/**
 * Validate Indian mobile number (10 digits, starts with 6-9).
 * @param {string} input
 * @returns {{ valid: boolean, normalized: string|null, error: string|null }}
 */
function validateMobile(input) {
  const clean = input.replace(/[\s\-+]/g, '');
  // Strip country code if present
  const number = clean.startsWith('91') && clean.length === 12 ? clean.slice(2) : clean;
  if (!/^[6-9]\d{9}$/.test(number)) {
    return { valid: false, normalized: null, error: 'Invalid mobile number. Please enter a valid 10-digit Indian mobile number.' };
  }
  return { valid: true, normalized: number, error: null };
}

/**
 * Validate last 4 digits of Aadhaar (demo mode).
 * @param {string} input
 * @returns {{ valid: boolean, normalized: string|null, error: string|null }}
 */
function validateAadhaar(input) {
  const clean = input.replace(/[\s\-]/g, '');
  if (!/^\d{4}$/.test(clean)) {
    return { valid: false, normalized: null, error: 'Invalid input. Please enter only the *last 4 digits* of your Aadhaar number.' };
  }
  return { valid: true, normalized: clean, error: null };
}

/**
 * Validate full name input (non-empty, only letters/spaces/dots).
 * @param {string} input
 * @returns {{ valid: boolean, normalized: string|null, error: string|null }}
 */
function validateName(input) {
  const clean = input.trim();
  if (clean.length < 2) {
    return { valid: false, normalized: null, error: 'Name is too short. Please enter your full name.' };
  }
  if (!/^[a-zA-Z\u0900-\u097F\s.'-]+$/.test(clean)) {
    return { valid: false, normalized: null, error: 'Name contains invalid characters. Please use only letters.' };
  }
  return { valid: true, normalized: clean, error: null };
}

/**
 * Validate document selection input (1–9).
 * @param {string} input
 * @param {number} maxCount
 */
function validateDocumentChoice(input, maxCount) {
  const num = parseInt(input.trim(), 10);
  if (isNaN(num) || num < 1 || num > maxCount) {
    return { valid: false, choice: null, error: `Please enter a number between 1 and ${maxCount}.` };
  }
  return { valid: true, choice: num, error: null };
}

module.exports = { validateMobile, validateAadhaar, validateName, validateDocumentChoice };
