const axios = require('axios');

// Test configuration
const BASE_URL = 'https://us-central1-whatsapp-bot-ai-7226e.cloudfunctions.net';

async function debugContextRetrieval() {
  console.log('🔍 DEBUGGING CONTEXT RETRIEVAL');
  console.log('='.repeat(50));
  
  // Test with a message that should trigger context retrieval
  try {
    const response = await axios.post(`${BASE_URL}/whatsappUniversalBot`, {
      Body: 'What are your working hours?',
      From: 'whatsapp:+1234567890',
      To: 'whatsapp:+14155238886'
    });
    
    console.log('✅ Response:', response.data);
    
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  
  // Test with a different message
  console.log('\n📱 Testing with different message...');
  try {
    const response = await axios.post(`${BASE_URL}/whatsappUniversalBot`, {
      Body: 'I need to book an appointment',
      From: 'whatsapp:+1234567890',
      To: 'whatsapp:+14155238886'
    });
    
    console.log('✅ Response:', response.data);
    
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  
  // Test with a specific time
  console.log('\n📱 Testing with specific time...');
  try {
    const response = await axios.post(`${BASE_URL}/whatsappUniversalBot`, {
      Body: 'I want to book at 10:00 AM',
      From: 'whatsapp:+1234567890',
      To: 'whatsapp:+14155238886'
    });
    
    console.log('✅ Response:', response.data);
    
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

debugContextRetrieval().catch(console.error);
