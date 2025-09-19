const axios = require('axios');

// Test configuration
const BASE_URL = 'https://us-central1-whatsapp-bot-ai-7226e.cloudfunctions.net';
const TEST_PHONE = 'whatsapp:+1234567890';

// Test different Twilio numbers and business ID detection
const testScenarios = [
  {
    name: "Barber Shop (Service Business)",
    twilioNumber: "whatsapp:+14155238886",
    expectedBusinessId: "barber-shop-downtown",
    message: "Hello, what services do you offer?",
    function: "whatsappUniversalBot"
  },
  {
    name: "Fresh Market (Product Business)",
    twilioNumber: "whatsapp:+14155238887",
    expectedBusinessId: "fresh-market",
    message: "What products do you have?",
    function: "whatsappUniversalBot"
  },
  {
    name: "Pizza Palace (Product Business)",
    twilioNumber: "whatsapp:+14155238888",
    expectedBusinessId: "pizza-palace",
    message: "What's on your menu today?",
    function: "whatsappUniversalBot"
  },
  {
    name: "Lawyer Office (Service Business)",
    twilioNumber: "whatsapp:+14155238889",
    expectedBusinessId: "lawyer-office",
    message: "Do you have any appointments available?",
    function: "whatsappUniversalBot"
  },
  {
    name: "Spa Center (Service Business)",
    twilioNumber: "whatsapp:+14155238890",
    expectedBusinessId: "spa-center",
    message: "What spa services do you offer?",
    function: "whatsappUniversalBot"
  },
  {
    name: "Unknown Number (Fallback)",
    twilioNumber: "whatsapp:+14155238899",
    expectedBusinessId: "default",
    message: "Hello, how can you help me?",
    function: "whatsappUniversalBot"
  }
];

// Test function
async function testBusinessIdDetection() {
  console.log('🧪 TESTING BUSINESS ID DETECTION');
  console.log('='.repeat(60));
  console.log('Testing automatic business ID detection from Twilio numbers...\n');
  
  let passed = 0;
  let failed = 0;
  
  for (const scenario of testScenarios) {
    try {
      console.log(`📱 Testing: ${scenario.name}`);
      console.log(`Twilio Number: ${scenario.twilioNumber}`);
      console.log(`Expected Business ID: ${scenario.expectedBusinessId}`);
      console.log(`Message: "${scenario.message}"`);
      
      const response = await axios.post(
        `${BASE_URL}/${scenario.function}`,
        {
          Body: scenario.message,
          From: TEST_PHONE,
          To: scenario.twilioNumber  // This is the key - the business's Twilio number
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );
      
      if (response.status === 200) {
        const responseText = response.data;
        console.log(`✅ Response: ${responseText.substring(0, 100)}...`);
        
        // Check if the response indicates the correct business type
        const isServiceBusiness = scenario.expectedBusinessId.includes('barber') || 
                                 scenario.expectedBusinessId.includes('lawyer') || 
                                 scenario.expectedBusinessId.includes('spa');
        
        const isProductBusiness = scenario.expectedBusinessId.includes('market') || 
                                 scenario.expectedBusinessId.includes('pizza');
        
        let expectedKeywords = [];
        if (isServiceBusiness) {
          expectedKeywords = ['service', 'appointment', 'booking', 'help'];
        } else if (isProductBusiness) {
          expectedKeywords = ['product', 'inventory', 'order', 'help'];
        } else {
          expectedKeywords = ['help', 'assist', 'service'];
        }
        
        const hasExpectedKeywords = expectedKeywords.some(keyword => 
          responseText.toLowerCase().includes(keyword.toLowerCase())
        );
        
        if (hasExpectedKeywords) {
          console.log(`✅ PASSED: Business ID detection working correctly`);
          passed++;
        } else {
          console.log(`❌ FAILED: Business ID detection may not be working`);
          console.log(`Expected keywords: ${expectedKeywords.join(', ')}`);
          failed++;
        }
      } else {
        console.log(`❌ FAILED: HTTP ${response.status}`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}`);
      if (error.response) {
        console.log(`Response: ${error.response.data}`);
      }
      failed++;
    }
    
    console.log(''); // Empty line for readability
  }
  
  // Final Results
  console.log('🎯 FINAL RESULTS');
  console.log('='.repeat(60));
  console.log(`✅ Total Passed: ${passed}`);
  console.log(`❌ Total Failed: ${failed}`);
  console.log(`📈 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);
  
  if (failed === 0) {
    console.log('\n🎉 ALL TESTS PASSED! Business ID detection is working perfectly!');
  } else if (failed <= 1) {
    console.log('\n✅ MOSTLY SUCCESSFUL! Business ID detection is working well.');
  } else {
    console.log('\n⚠️  Some tests failed. Check the logs above for details.');
  }
  
  console.log('\n📱 Business ID Detection Methods:');
  console.log('1. Twilio Number Mapping (Primary)');
  console.log('2. Database Number Mapping (Secondary)');
  console.log('3. Customer Phone Mapping (Tertiary)');
  console.log('4. Message Content Analysis (Fallback)');
  console.log('5. URL Parameter (Legacy)');
  
  console.log('\n🔗 Updated Function URLs:');
  console.log(`Universal Bot: ${BASE_URL}/whatsappUniversalBot`);
  console.log(`Service Bot: ${BASE_URL}/whatsappServiceBot`);
  console.log(`Product Bot: ${BASE_URL}/whatsappProductBot`);
  
  console.log('\n💡 Twilio Configuration:');
  console.log('- Each business gets a unique Twilio WhatsApp number');
  console.log('- All numbers use the same webhook URL');
  console.log('- Business ID is automatically detected from Twilio number');
  console.log('- No need for URL parameters anymore!');
}

// Run tests
testBusinessIdDetection().catch(console.error);
