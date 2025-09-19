const axios = require('axios');

// Test configuration
const BASE_URL = 'https://us-central1-whatsapp-bot-ai-7226e.cloudfunctions.net';
const TEST_PHONE = 'whatsapp:+1234567890';
const SERVICE_NUMBER = 'whatsapp:+14155238886';

async function testAvailabilityFix() {
  console.log('🧪 TESTING AVAILABILITY FIX');
  console.log('='.repeat(50));
  
  // First, set working hours for today
  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format
  console.log(`Setting working hours for date: ${today}`);
  
  try {
    const setHoursResponse = await axios.post(`${BASE_URL}/setWorkingHours`, {
      barberId: 'barber-shop-downtown',
      date: today,
      timeSlots: [
        { start: '09:00', end: '12:00' },
        { start: '14:00', end: '18:00' }
      ]
    });
    
    console.log('✅ Working hours set:', setHoursResponse.data);
  } catch (error) {
    console.log('❌ Error setting working hours:', error.message);
  }
  
  // Test availability question
  console.log('\n📱 Testing availability question...');
  
  try {
    const response = await axios.post(`${BASE_URL}/whatsappUniversalBot`, {
      Body: 'When are you free today?',
      From: TEST_PHONE,
      To: SERVICE_NUMBER
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
    console.log('❌ Error testing availability:', error.message);
  }
  
  // Test with specific business keywords
  console.log('\n📱 Testing with specific business keywords...');
  
  try {
    const response = await axios.post(`${BASE_URL}/whatsappUniversalBot`, {
      Body: 'I need a haircut appointment',
      From: TEST_PHONE,
      To: SERVICE_NUMBER
    });
    
    console.log('✅ Response:', response.data);
    
  } catch (error) {
    console.log('❌ Error testing haircut appointment:', error.message);
  }
}

testAvailabilityFix().catch(console.error);
