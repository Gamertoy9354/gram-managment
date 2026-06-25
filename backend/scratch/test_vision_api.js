const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function testVision() {
  const privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY;
  const clientEmail = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL;

  if (!privateKey || !clientEmail) {
    console.error('Missing Google Drive service account credentials in .env.');
    return;
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });

    const vision = google.vision({ version: 'v1', auth });

    // Let's create a dummy 1x1 pixel image base64 for testing API connectivity
    const dummyBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    console.log('Sending test request to Google Cloud Vision API...');
    const res = await vision.images.annotate({
      requestBody: {
        requests: [
          {
            image: {
              content: dummyBase64,
            },
            features: [
              {
                type: 'TEXT_DETECTION',
              },
            ],
          },
        ],
      },
    });

    console.log('API Response received successfully!');
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error('Google Cloud Vision API call failed:');
    console.error(err.message);
    if (err.message.includes('API_KEY_SERVICE_BLOCKED') || err.message.includes('not enabled')) {
      console.log('\n💡 Tip: You need to enable the "Cloud Vision API" in your Google Cloud Console for this project.');
    }
  }
}

testVision();
