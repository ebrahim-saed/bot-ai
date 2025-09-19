const axios = require('axios');

// Test configuration
const BASE_URL = 'https://us-central1-whatsapp-bot-ai-7226e.cloudfunctions.net';

async function simpleAvailabilityTest() {
  console.log('🧪 SIMPLE AVAILABILITY TEST');
  console.log('='.repeat(50));
  
  // Test with a message that should show availability
  try {
    const response = await axios.post(`${BASE_URL}/whatsappUniversalBot`, {
      Body: 'Show me available times for today',
      From: 'whatsapp:+1234567890',
      To: 'whatsapp:+14155238886'
    });
    
    console.log('✅ Response:', response.data);
    
    // Check if response contains time slots
    const responseText = response.data;
    if (responseText.includes('09:00') || responseText.includes('14:00') || responseText.includes('available')) {
      console.log('🎉 SUCCESS: Availability data is working!');
    } else {
      console.log('⚠️  WARNING: Availability data may not be working properly');
    }
    
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  
  // Test with a booking request
  console.log('\n📱 Testing booking request...');
  
  try {
    const response = await axios.post(`${BASE_URL}/whatsappUniversalBot`, {
      Body: 'I want to book a haircut at 10:00 AM',
      From: 'whatsapp:+1234567890',
      To: 'whatsapp:+14155238886'
    });
    
    console.log('✅ Response:', response.data);
    
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

simpleAvailabilityTest().catch(console.error);
