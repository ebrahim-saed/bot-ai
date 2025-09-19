const axios = require('axios');

// Test configuration
const BASE_URL = 'https://us-central1-whatsapp-bot-ai-7226e.cloudfunctions.net';
const FIXED_LOCATION_BOT_URL = `${BASE_URL}/fixedLocationBot`;
const TEST_PHONE = 'whatsapp:+1234567890';

// Helper function to send a message and get response
async function sendMessage(message, from = TEST_PHONE) {
  try {
    console.log(`\n📤 Sending: "${message}"`);
    console.log(`👤 From: ${from}`);
    
    const response = await axios.post(FIXED_LOCATION_BOT_URL, {
      Body: message,
      From: from,
      To: 'whatsapp:+14155238886'
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    // Extract message from TwiML response
    const twimlResponse = response.data;
    const messageMatch = twimlResponse.match(/<Message>(.*?)<\/Message>/s);
    const botReply = messageMatch ? messageMatch[1].trim() : twimlResponse;
    
    console.log(`📥 Response: "${botReply}"`);
    console.log(`✅ Status: ${response.status}`);
    
    return botReply;
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    if (error.response) {
      console.error(`Response Status: ${error.response.status}`);
      console.error(`Response Data: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    throw error;
  }
}

// Test the exact scenario that was failing
async function testBusinessSelectionFlow() {
  console.log('\n🧪 TESTING FIXED LOCATION BOT - BUSINESS SELECTION FLOW');
  console.log('=' .repeat(60));
  
  const testPhone = 'whatsapp:+1234567890';
  
  try {
    // Step 1: Search for barbers in Haifa
    console.log('\n📍 Step 1: Search for barbers in Haifa');
    const searchResponse = await sendMessage('Give me all the barbers in Haifa', testPhone);
    
    // Check if we got a business list
    if (searchResponse.includes('I found') && searchResponse.includes('Please choose a number')) {
      console.log('✅ Business search successful - got list with selection prompt');
    } else {
      console.log('❌ Business search failed - no list or selection prompt');
      return false;
    }
    
    // Wait a moment for the data to be stored
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Step 2: Select business #1
    console.log('\n🔢 Step 2: Select business #1');
    const selectionResponse = await sendMessage('1', testPhone);
    
    // Check if selection was successful
    if (selectionResponse.includes('selected') || selectionResponse.includes('ready to help')) {
      console.log('✅ Business selection successful - business stored');
    } else {
      console.log('❌ Business selection failed - no confirmation');
      console.log(`Actual response: ${selectionResponse}`);
      return false;
    }
    
    // Wait a moment for the selection to be processed
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Step 3: Ask about availability
    console.log('\n⏰ Step 3: Ask about availability');
    const availabilityResponse = await sendMessage('when are you free today?', testPhone);
    
    // Check if we got a meaningful response (not empty or error)
    if (availabilityResponse && availabilityResponse.length > 10) {
      console.log('✅ Availability query successful - got response');
      console.log(`Response length: ${availabilityResponse.length} characters`);
    } else {
      console.log('❌ Availability query failed - no response or very short response');
      console.log(`Actual response: "${availabilityResponse}"`);
      return false;
    }
    
    console.log('\n🎉 ALL TESTS PASSED! The business selection flow is working correctly.');
    return true;
    
  } catch (error) {
    console.error('\n❌ Test failed with error:', error.message);
    return false;
  }
}

// Test individual components
async function testIndividualComponents() {
  console.log('\n🔧 TESTING INDIVIDUAL COMPONENTS');
  console.log('=' .repeat(40));
  
  try {
    // Test 1: Basic location search
    console.log('\n1️⃣ Testing basic location search...');
    const locationResponse = await sendMessage('barbers in Haifa');
    if (locationResponse.includes('I found')) {
      console.log('✅ Location search works');
    } else {
      console.log('❌ Location search failed');
    }
    
    // Test 2: Business name search  
    console.log('\n2️⃣ Testing business name search...');
    const nameResponse = await sendMessage('find Downtown BarberShop');
    if (nameResponse.includes('Downtown') || nameResponse.includes('found')) {
      console.log('✅ Business name search works');
    } else {
      console.log('❌ Business name search failed');
    }
    
    // Test 3: General AI response
    console.log('\n3️⃣ Testing general AI response...');
    const generalResponse = await sendMessage('Hello, how can you help me?');
    if (generalResponse && generalResponse.length > 10) {
      console.log('✅ General AI response works');
    } else {
      console.log('❌ General AI response failed');
    }
    
  } catch (error) {
    console.error('❌ Component test failed:', error.message);
  }
}

// Main test function
async function runTests() {
  console.log('🚀 STARTING FIXED LOCATION BOT TESTS');
  console.log('=' .repeat(50));
  
  // First, make sure we have business data
  console.log('\n📊 Checking if business data exists...');
  try {
    const setupResponse = await axios.post(`${BASE_URL}/setupBusinessData`);
    console.log('✅ Business data setup completed');
  } catch (error) {
    console.log('⚠️ Business data setup may have failed, but continuing with tests...');
  }
  
  // Test the main flow
  const mainFlowSuccess = await testBusinessSelectionFlow();
  
  // Test individual components
  await testIndividualComponents();
  
  // Summary
  console.log('\n📋 TEST SUMMARY');
  console.log('=' .repeat(30));
  if (mainFlowSuccess) {
    console.log('✅ Main business selection flow: WORKING');
    console.log('🎯 The original issue has been FIXED!');
    console.log('\n💡 You can now:');
    console.log('   1. Search: "Give me all the barbers in Haifa"');
    console.log('   2. Select: "1"');
    console.log('   3. Ask: "when are you free today?"');
    console.log('   4. Get a proper response!');
  } else {
    console.log('❌ Main business selection flow: FAILED');
    console.log('🔧 Additional debugging may be needed');
  }
  
  console.log(`\n🔗 Function URL: ${FIXED_LOCATION_BOT_URL}`);
  console.log('📱 Make sure your Twilio webhook points to this URL!');
}

// Run the tests
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { sendMessage, testBusinessSelectionFlow };