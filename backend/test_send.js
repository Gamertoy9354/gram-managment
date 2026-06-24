/**
 * Quick test — run after re-joining sandbox to confirm delivery works.
 * Usage: node test_send.js
 */
require('dotenv').config();
const twilio = require('twilio');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function test() {
  console.log('Sending test WhatsApp message...');
  try {
    const msg = await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to:   'whatsapp:+919537199300',
      body: '🏛️ *Gram Panchayat Bot Test*\n\nIf you receive this, your Twilio sandbox is working correctly! Send *Hi* to start.',
    });
    console.log('✅ Queued! SID:', msg.sid);
    
    // Wait 3s and check final status
    await new Promise(r => setTimeout(r, 3000));
    const final = await client.messages(msg.sid).fetch();
    console.log('Final status:', final.status);
    console.log('Error code:', final.errorCode || 'none');
    if (final.status === 'sent' || final.status === 'delivered') {
      console.log('🎉 SUCCESS — message delivered!');
    } else {
      console.log('❌ FAILED. Error code:', final.errorCode);
      if (final.errorCode === 63015) {
        console.log('Fix: Your number has not joined the sandbox. Send the join keyword to +14155238886 on WhatsApp first.');
      }
    }
  } catch (err) {
    console.error('API error:', err.message, err.code);
  }
}

test();
