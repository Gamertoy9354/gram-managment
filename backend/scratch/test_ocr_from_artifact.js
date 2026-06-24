const Tesseract = require('tesseract.js');
const path = require('path');

async function main() {
  const imagePath = 'C:\\Users\\SANJAY RATHOD\\.gemini\\antigravity-ide\\brain\\6bf75889-47da-4342-b836-502c9c70ccfd\\media__1781538212266.png';
  console.log('Running local OCR on:', imagePath);
  
  const { data: { text } } = await Tesseract.recognize(imagePath, 'eng');
  console.log('\n--- EXTRACTED OCR TEXT ---');
  console.log(text);
  console.log('--------------------------\n');
}

main().catch(console.error);
