const Tesseract = require('tesseract.js');
const { google } = require('googleapis');
const fs = require('fs');

/**
 * Perform OCR on an image. Tries Google Cloud Vision API first, then falls back to Tesseract.js.
 */
async function performOCR(imagePath) {
  const privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY;
  const clientEmail = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL;
  
  const hasValidCreds = privateKey && clientEmail && 
                        !privateKey.includes('YOUR_KEY') && 
                        !clientEmail.includes('your-service-account');

  if (hasValidCreds) {
    try {
      console.log('[OCR] Attempting Google Cloud Vision API...');
      const auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: clientEmail,
          private_key: privateKey.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
      const vision = google.vision({ version: 'v1', auth });
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');

      const res = await vision.images.annotate({
        requestBody: {
          requests: [
            {
              image: { content: base64Image },
              features: [{ type: 'TEXT_DETECTION' }],
            },
          ],
        },
      });

      const text = res.data.responses[0]?.fullTextAnnotation?.text || '';
      if (text) {
        console.log('[OCR] Google Cloud Vision API success!');
        return text;
      }
      console.warn('[OCR] Google Cloud Vision API returned empty text. Falling back...');
    } catch (err) {
      console.error('[OCR] Google Cloud Vision API failed:', err.message);
      console.log('[OCR] Falling back to local Tesseract OCR...');
    }
  } else {
    console.log('[OCR] GCP credentials missing or placeholder. Using local Tesseract...');
  }

  // Fallback to Tesseract.js
  const { data: { text } } = await Tesseract.recognize(imagePath, 'eng');
  return text;
}

/**
 * Standardize character confusion mapping for robust string matching (UPI IDs and Property IDs).
 */
function normalizeConfusion(str) {
  if (!str) return '';
  return str.toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/[il|]/g, '1')
    .replace(/[oq]/g, '0')
    .replace(/[s]/g, '5')
    .replace(/[z]/g, '2')
    .replace(/[g]/g, '9')
    .replace(/[b]/g, '8');
}

/**
 * Normalize OCR text to correct common numeric/digit character confusions.
 */
function normalizeOcrNumbers(text) {
  let cleaned = text || '';
  
  // Replace character confusions when they are adjacent to digits or stand alone in decimal parts
  // 1. Replace S/s with 5
  cleaned = cleaned.replace(/(\d)[Ss]\b/g, '$15');
  cleaned = cleaned.replace(/\b[Ss](\d)/g, '5$1');
  
  // 2. Replace O/o/Q/q with 0
  cleaned = cleaned.replace(/(\d)[OoQq]\b/g, '$10');
  cleaned = cleaned.replace(/\b[OoQq](\d)/g, '0$1');
  cleaned = cleaned.replace(/\.(\b[OoQq]{2}\b)/g, '.00');
  cleaned = cleaned.replace(/\.(\b[OoQq]\b)/g, '.0');
  
  // 3. Replace I/i/l/| with 1
  cleaned = cleaned.replace(/(\d)[Iil|]/g, '$11');
  cleaned = cleaned.replace(/[Iil|](\d)/g, '1$1');

  // 4. Strip commas from numbers
  cleaned = cleaned.replace(/,/g, '');

  return cleaned;
}

/**
 * Helper to build regex for matching transaction amounts.
 */
function getAmountRegex(amount) {
  const val = parseFloat(amount);
  const hasDecimals = val % 1 !== 0;
  if (hasDecimals) {
    const exactStr = val.toFixed(2);
    const shortStr = String(val);
    const escapedExact = exactStr.replace(/\./g, '\\.');
    const escapedShort = shortStr.replace(/\./g, '\\.');
    return new RegExp(`(?:^|\\s|[^0-9])(?:rs\\.?|rupees?|inr|₹)?\\s*(${escapedExact}|${escapedShort})(?:[^0-9]|\\s|$)`, 'i');
  } else {
    const intStr = String(Math.floor(val));
    return new RegExp(`(?:^|\\s|[^0-9])(?:rs\\.?|rupees?|inr|₹)?\\s*(${intStr}(?:\\.00)?)(?:[^0-9]|\\s|$)`, 'i');
  }
}

/**
 * Robust check if a property ID is present in the OCR text.
 */
function matchesPropertyId(ocrText, propertyId) {
  if (!propertyId) return false;
  
  const cleanPropId = propertyId.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!cleanPropId) return false;

  // 1. Primary check: Look for "TXID=<propertyId>" pattern in the OCR text
  const escaped = cleanPropId.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const txidRegex = new RegExp(`txid[^a-zA-Z0-9]*${escaped}`, 'i');
  if (txidRegex.test(ocrText)) {
    return true;
  }
  
  // 2. Fallback check: Check if cleanPropId matches as a distinct word in normalized OCR
  const normalizedOcr = ocrText.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const wordRegex = new RegExp(`(?:^|\\s)${cleanPropId}(?:$|\\s)`, 'i');
  if (wordRegex.test(normalizedOcr)) {
    return true;
  }
  
  // 3. Fallback: normalized confusion match
  const ocrConfusion = normalizeConfusion(ocrText);
  const propConfusion = normalizeConfusion(cleanPropId);
  if (propConfusion.length >= 4 || !/^\d+$/.test(propConfusion)) {
    return ocrConfusion.includes(propConfusion);
  }
  
  return false;
}

/**
 * Performs full verification of a screenshot OCR text.
 */
function verifyPaymentDetails(ocrText, payeeUpi, propertyId, dueAmount) {
  const normOcrConfusion = normalizeConfusion(ocrText);
  const normPayeeConfusion = normalizeConfusion(payeeUpi);
  
  // Check 1: Payee UPI ID
  const payeeMatch = normOcrConfusion.includes(normPayeeConfusion);
  
  // Check 2: Property ID
  const propIdMatch = matchesPropertyId(ocrText, propertyId);
  
  // Check 3: Due Amount
  const cleanedNumbersOcr = normalizeOcrNumbers(ocrText);
  const amountRegex = getAmountRegex(dueAmount);
  const amountMatch = amountRegex.test(cleanedNumbersOcr);

  const reasons = [];
  if (!payeeMatch) reasons.push(`Payee UPI ID '${payeeUpi}' not found in receipt`);
  if (!propIdMatch) reasons.push(`Property ID '${propertyId}' not found in receipt`);
  if (!amountMatch) reasons.push(`Expected payment amount '₹${parseFloat(dueAmount).toFixed(2)}' not found in receipt`);

  return {
    success: payeeMatch && propIdMatch && amountMatch,
    reasons
  };
}

/**
 * Verify a payment receipt screenshot using NVIDIA Llama-3.2-90b-vision-instruct model.
 */
async function verifyPaymentWithLLM(imagePath, payeeUpi, propertyId, dueAmount) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new Error('NVIDIA_API_KEY is not defined');
  }

  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');

  const systemPrompt = `You are a strict automated payment verification assistant for a local Gram Panchayat administration office.
Your task is to inspect the uploaded UPI payment receipt screenshot and determine if it represents a successful, valid payment corresponding to these exact transaction parameters:
1. Payee UPI ID: ${payeeUpi} (Must match. Ignore casing and slight spaces, e.g., shismehta77@oksbi and shismehta77@0ksbi are equivalent if O/0 are misread, but other user IDs are invalid).
2. Property ID: ${propertyId} (Look for this number in the Transaction ID, UPI reference number, notes, or any message text).
3. Payment Amount: ${dueAmount} (Look for the exact payment amount of Rupees ${parseFloat(dueAmount).toFixed(2)} or ${Math.floor(dueAmount)}).
4. Status: Must show a successful state (e.g. "Completed", "Success", "Paid", "Done", green checkmarks).

Verify all four parameters. If any of these are missing, wrong, or show a pending/failed state, then the verification fails.
You must respond with a strict, parseable JSON object containing ONLY two fields:
{
  "isValid": true or false,
  "reason": "Explain briefly why the verification succeeded or why it failed (listing which fields did not match)."
}`;

  console.log('[NVIDIA Vision] Sending receipt to meta/llama-3.2-90b-vision-instruct NIM...');
  
  const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'meta/llama-3.2-90b-vision-instruct',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: systemPrompt,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      max_tokens: 256,
      temperature: 0.1,
    }),
  });

  if (response.status !== 200) {
    const errorText = await response.text();
    throw new Error(`NVIDIA API returned status ${response.status}: ${errorText}`);
  }

  const result = await response.json();
  if (!result.choices || !result.choices[0]) {
    throw new Error('Invalid response structure from NVIDIA API');
  }

  const content = result.choices[0].message.content.trim();
  console.log('[NVIDIA Vision] LLM raw response:', content);

  // Try to parse JSON from the response text
  let jsonResponse;
  try {
    // LLM might wrap JSON in markdown block \`\`\`json ... \`\`\`, so clean it
    const cleanContent = content.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    jsonResponse = JSON.parse(cleanContent);
  } catch (parseErr) {
    console.warn('[NVIDIA Vision] JSON parse failed, trying regex extraction...');
    // Fallback: search for first '{' and last '}'
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        jsonResponse = JSON.parse(jsonMatch[0]);
      } catch (innerErr) {
        throw new Error(`Failed to parse JSON content: ${content}`);
      }
    } else {
      throw new Error(`Response did not contain JSON structure: ${content}`);
    }
  }

  if (typeof jsonResponse.isValid !== 'boolean') {
    throw new Error('Response JSON missing isValid field');
  }

  return {
    success: jsonResponse.isValid,
    reasons: jsonResponse.isValid ? [] : [jsonResponse.reason || 'Verification failed']
  };
}

/**
 * Gate function: Verifies screenshot using NVIDIA Vision LLM first, falling back to local Tesseract OCR.
 */
async function verifyPayment(imagePath, payeeUpi, propertyId, dueAmount) {
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  const hasNvidia = nvidiaKey && !nvidiaKey.includes('YOUR_KEY') && nvidiaKey.trim() !== '';

  if (hasNvidia) {
    try {
      const res = await verifyPaymentWithLLM(imagePath, payeeUpi, propertyId, dueAmount);
      return res;
    } catch (err) {
      console.error('[OCR Fallback] NVIDIA Vision LLM failed, falling back to local Tesseract:', err.message);
    }
  } else {
    console.log('[OCR] NVIDIA_API_KEY not configured. Using local Tesseract...');
  }

  // Fallback to Tesseract OCR
  try {
    const text = await performOCR(imagePath);
    console.log('[OCR Fallback] Local Tesseract OCR Extracted Text:\n', text);
    const result = verifyPaymentDetails(text, payeeUpi, propertyId, dueAmount);
    return result;
  } catch (tesseractErr) {
    console.error('[OCR Fallback] Local Tesseract OCR failed completely:', tesseractErr.message);
    return {
      success: false,
      reasons: ['OCR engine failed to process the image']
    };
  }
}

module.exports = {
  performOCR,
  normalizeConfusion,
  normalizeOcrNumbers,
  matchesPropertyId,
  verifyPaymentDetails,
  verifyPayment
};
