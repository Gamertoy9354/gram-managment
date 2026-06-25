const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function testNvidiaVision() {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    console.error('NVIDIA_API_KEY is not defined in .env.');
    return;
  }

  // Use a dummy 1x1 base64 pixel for testing the structure/API connection
  const dummyBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const systemPrompt = `You are a strict payment verification system for Gram Panchayat tax collection.
Your job is to verify if the uploaded image is a valid UPI payment screenshot matching these details:
- Expected Payee UPI ID: shismehta77@oksbi
- Expected Property ID: 6635
- Expected Due Amount: 6635.00

Analyze the receipt image carefully. Check:
1. Payee UPI ID matches 'shismehta77@oksbi' (or similar, accounting for spacing/fonts).
2. Property ID '6635' is present in the transaction ID, UPI note, or message text.
3. The payment amount matches exactly '6635.00' (or '6635').
4. The transaction status is 'Success', 'Completed', 'Done', or similar.

You must respond ONLY with a raw JSON object containing:
{
  "isValid": true/false,
  "reason": "Detailed reason why it matches or fails verification."
}`;

  console.log('Sending request to NVIDIA API (meta/llama-3.2-90b-vision-instruct)...');

  try {
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
                  url: `data:image/png;base64,${dummyBase64}`,
                },
              },
            ],
          },
        ],
        max_tokens: 256,
        temperature: 0.1,
      }),
    });

    const data = await response.json();
    console.log('Response Status:', response.status);
    console.log('NVIDIA Output:', JSON.stringify(data, null, 2));
    
    if (data.choices && data.choices[0]) {
      const content = data.choices[0].message.content;
      console.log('\n--- Content Extract ---');
      console.log(content);
    }
  } catch (err) {
    console.error('NVIDIA Vision LLM API call failed:', err.message);
  }
}

testNvidiaVision();
