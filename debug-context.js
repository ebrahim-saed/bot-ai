const axios = require('axios');

// Test configuration
const BASE_URL = 'https://us-central1-whatsapp-bot-ai-7226e.cloudfunctions.net';

async function debugContext() {
  console.log('🔍 DEBUGGING CONTEXT DATA');
  console.log('='.repeat(50));
  
  // Test the universal bot with a simple message
  try {
    const response = await axios.post(`${BASE_URL}/whatsappUniversalBot`, {
      Body: 'Hello, what services do you offer?',
      From: 'whatsapp:+1234567890',
      To: 'whatsapp:+14155238886'
    });
    
    console.log('✅ Response:', response.data);
    
    // Check if the response contains any context information
    const responseText = response.data;
    if (responseText.includes('services') || responseText.includes('appointments') || responseText.includes('available')) {
      console.log('🎉 SUCCESS: Context data is being used!');
    } else {
      console.log('⚠️  WARNING: Context data may not be working properly');
    }
    
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

debugContext().catch(console.error);
