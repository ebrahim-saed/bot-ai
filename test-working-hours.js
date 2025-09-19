const axios = require('axios');

// Test configuration
const BASE_URL = 'https://us-central1-whatsapp-bot-ai-7226e.cloudfunctions.net';

async function testWorkingHours() {
  console.log('🧪 TESTING WORKING HOURS');
  console.log('='.repeat(50));
  
  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format
  console.log(`Testing with date: ${today}`);
  
  // First, set working hours
  console.log('1. Setting working hours...');
  try {
    const setResponse = await axios.post(`${BASE_URL}/setWorkingHours`, {
      barberId: 'barber-shop-downtown',
      date: today,
      timeSlots: [
        { start: '09:00', end: '12:00' },
        { start: '14:00', end: '18:00' }
      ]
    });
    
    console.log('✅ Working hours set:', setResponse.data);
  } catch (error) {
    console.log('❌ Error setting working hours:', error.message);
  }
  
  // Test availability question
  console.log('\n2. Testing availability question...');
  try {
    const response = await axios.post(`${BASE_URL}/whatsappUniversalBot`, {
      Body: 'When are you free today?',
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
  
  // Test with a specific time
  console.log('\n3. Testing specific time booking...');
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

testWorkingHours().catch(console.error);
