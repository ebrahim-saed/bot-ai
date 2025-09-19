const axios = require('axios');

// Test configuration
const BASE_URL = 'https://us-central1-whatsapp-bot-ai-7226e.cloudfunctions.net';

async function testContextDebug() {
  console.log('🔍 DEBUGGING CONTEXT DATA');
  console.log('='.repeat(50));
  
  // Test with a message that should trigger availability
  try {
    const response = await axios.post(`${BASE_URL}/whatsappUniversalBot`, {
      Body: 'What are your working hours today?',
      From: 'whatsapp:+1234567890',
      To: 'whatsapp:+14155238886'
    });
    
    console.log('✅ Response:', response.data);
    
    // Check if the response contains working hours information
    const responseText = response.data;
    if (responseText.includes('09:00') || responseText.includes('14:00') || responseText.includes('working hours')) {
      console.log('🎉 SUCCESS: Working hours data is being used!');
    } else {
      console.log('⚠️  WARNING: Working hours data may not be working properly');
    }
    
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  
  // Test with a different message
  console.log('\n📱 Testing with different message...');
  
  try {
    const response = await axios.post(`${BASE_URL}/whatsappUniversalBot`, {
      Body: 'I need a haircut',
      From: 'whatsapp:+1234567890',
      To: 'whatsapp:+14155238886'
    });
    
    console.log('✅ Response:', response.data);
    
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

testContextDebug().catch(console.error);
