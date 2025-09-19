const axios = require('axios');

// Test configuration
const BASE_URL = 'https://us-central1-whatsapp-bot-ai-7226e.cloudfunctions.net';

async function checkFirebaseData() {
  console.log('🔍 CHECKING FIREBASE DATA');
  console.log('='.repeat(50));
  
  // Check if working hours were set correctly
  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format
  console.log(`Checking working hours for date: ${today}`);
  
  // Try to get working hours
  try {
    const response = await axios.get(`${BASE_URL}/getWorkingHours?barberId=barber-shop-downtown&date=${today}`);
    console.log('✅ Working hours response:', response.data);
  } catch (error) {
    console.log('❌ Error getting working hours:', error.message);
  }
  
  // Test the universal bot with a simple message to see what context it gets
  console.log('\n📱 Testing context retrieval...');
  
  try {
    const response = await axios.post(`${BASE_URL}/whatsappUniversalBot`, {
      Body: 'Hello',
      From: 'whatsapp:+1234567890',
      To: 'whatsapp:+14155238886'
    });
    
    console.log('✅ Response:', response.data);
    
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

checkFirebaseData().catch(console.error);
