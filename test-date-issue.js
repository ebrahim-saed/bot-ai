const axios = require('axios');

// Test configuration
const BASE_URL = 'https://us-central1-whatsapp-bot-ai-7226e.cloudfunctions.net';

async function testDateIssue() {
  console.log('🧪 TESTING DATE ISSUE');
  console.log('='.repeat(50));
  
  // Check what date the system is using
  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format
  console.log(`Local date: ${today}`);
  
  // Test with a message that should show the date being used
  try {
    const response = await axios.post(`${BASE_URL}/whatsappUniversalBot`, {
      Body: 'What date is today?',
      From: 'whatsapp:+1234567890',
      To: 'whatsapp:+14155238886'
    });
    
    console.log('✅ Response:', response.data);
    
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  
  // Set working hours for multiple dates to cover the issue
  const dates = ['2025-09-18', '2025-09-19', '2025-09-20'];
  
  for (const date of dates) {
    console.log(`\nSetting working hours for ${date}...`);
    try {
      const setResponse = await axios.post(`${BASE_URL}/setWorkingHours`, {
        barberId: 'barber-shop-downtown',
        date: date,
        timeSlots: [
          { start: '09:00', end: '12:00' },
          { start: '14:00', end: '18:00' }
        ]
      });
      
      console.log(`✅ Working hours set for ${date}:`, setResponse.data);
    } catch (error) {
      console.log(`❌ Error setting working hours for ${date}:`, error.message);
    }
  }
  
  // Test availability question again
  console.log('\n📱 Testing availability question...');
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
}

testDateIssue().catch(console.error);
