const axios = require('axios');

// Test configuration
const BASE_URL = 'https://us-central1-whatsapp-bot-ai-7226e.cloudfunctions.net';
const TEST_PHONE = 'whatsapp:+1234567890';

// Test scenarios for different business types
const testScenarios = {
  serviceBusiness: [
    {
      name: "Service Inquiry",
      message: "What services do you offer?",
      expectedKeywords: ["service", "appointment", "booking"]
    },
    {
      name: "Availability Check",
      message: "Do you have any appointments available today?",
      expectedKeywords: ["available", "time", "slot"]
    },
    {
      name: "Booking Request",
      message: "I need a haircut appointment",
      expectedKeywords: ["book", "appointment", "time"]
    },
    {
      name: "Specific Time Booking",
      message: "Can I book a haircut at 2 PM?",
      expectedKeywords: ["booked", "appointment", "ID"]
    }
  ],
  productBusiness: [
    {
      name: "Product Inquiry",
      message: "What products do you have?",
      expectedKeywords: ["product", "inventory", "available", "sorry", "empty"]
    },
    {
      name: "Product Search",
      message: "Do you have organic apples?",
      expectedKeywords: ["apple", "organic", "stock", "sorry", "empty", "product"]
    },
    {
      name: "Order Request",
      message: "I want to order 5 apples",
      expectedKeywords: ["order", "apples", "total", "sorry", "provide", "information"]
    },
    {
      name: "Pricing Inquiry",
      message: "How much do apples cost?",
      expectedKeywords: ["price", "cost", "apple", "sorry", "inventory", "product"]
    }
  ],
  universalBusiness: [
    {
      name: "General Inquiry",
      message: "Hello, how can you help me?",
      expectedKeywords: ["help", "assist", "service"]
    },
    {
      name: "Mixed Request",
      message: "I need both a service and want to buy something",
      expectedKeywords: ["service", "product", "help"]
    }
  ]
};

// Test function
async function testWhatsAppFunction(functionName, businessId, scenarios) {
  console.log(`\n🧪 Testing ${functionName} with businessId: ${businessId}`);
  console.log('='.repeat(60));
  
  let passed = 0;
  let failed = 0;
  
  for (const scenario of scenarios) {
    try {
      console.log(`\n📱 Testing: ${scenario.name}`);
      console.log(`Message: "${scenario.message}"`);
      
      const response = await axios.post(
        `${BASE_URL}/${functionName}?businessId=${businessId}`,
        {
          Body: scenario.message,
          From: TEST_PHONE
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );
      
      if (response.status === 200) {
        const responseText = response.data;
        console.log(`✅ Response: ${responseText.substring(0, 100)}...`);
        
        // Check if response contains expected keywords
        const hasExpectedKeywords = scenario.expectedKeywords.some(keyword => 
          responseText.toLowerCase().includes(keyword.toLowerCase())
        );
        
        if (hasExpectedKeywords) {
          console.log(`✅ PASSED: Response contains expected keywords`);
          passed++;
        } else {
          console.log(`❌ FAILED: Response doesn't contain expected keywords`);
          console.log(`Expected: ${scenario.expectedKeywords.join(', ')}`);
          console.log(`Response: ${responseText.substring(0, 200)}...`);
          failed++;
        }
      } else {
        console.log(`❌ FAILED: HTTP ${response.status}`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}`);
      failed++;
    }
  }
  
  console.log(`\n📊 Results for ${functionName}:`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);
  
  return { passed, failed };
}

// Main test function
async function runWhatsAppTests() {
  console.log('🚀 WHATSAPP BOT TEST SUITE');
  console.log('='.repeat(60));
  console.log('Testing all WhatsApp functions with different business types...\n');
  
  let totalPassed = 0;
  let totalFailed = 0;
  
  // Test Service Business Bot
  const serviceResults = await testWhatsAppFunction(
    'whatsappServiceBot',
    'test-barber',
    testScenarios.serviceBusiness
  );
  totalPassed += serviceResults.passed;
  totalFailed += serviceResults.failed;
  
  // Test Product Business Bot
  const productResults = await testWhatsAppFunction(
    'whatsappProductBot',
    'test-market',
    testScenarios.productBusiness
  );
  totalPassed += productResults.passed;
  totalFailed += productResults.failed;
  
  // Test Universal Bot
  const universalResults = await testWhatsAppFunction(
    'whatsappUniversalBot',
    'test-business',
    testScenarios.universalBusiness
  );
  totalPassed += universalResults.passed;
  totalFailed += universalResults.failed;
  
  // Final Results
  console.log('\n🎯 FINAL RESULTS');
  console.log('='.repeat(60));
  console.log(`✅ Total Passed: ${totalPassed}`);
  console.log(`❌ Total Failed: ${totalFailed}`);
  console.log(`📈 Overall Success Rate: ${Math.round((totalPassed / (totalPassed + totalFailed)) * 100)}%`);
  
  if (totalFailed === 0) {
    console.log('\n🎉 ALL TESTS PASSED! WhatsApp bots are working perfectly!');
  } else {
    console.log('\n⚠️  Some tests failed. Check the logs above for details.');
  }
  
  console.log('\n📱 WhatsApp Bot Functions Available:');
  console.log('1. whatsappServiceBot - For service businesses (barber, lawyer, etc.)');
  console.log('2. whatsappProductBot - For product businesses (supermarket, restaurant, etc.)');
  console.log('3. whatsappUniversalBot - Auto-detects business type (recommended)');
  
  console.log('\n🔗 Function URLs:');
  console.log(`Service Bot: ${BASE_URL}/whatsappServiceBot?businessId=YOUR_BUSINESS_ID`);
  console.log(`Product Bot: ${BASE_URL}/whatsappProductBot?businessId=YOUR_BUSINESS_ID`);
  console.log(`Universal Bot: ${BASE_URL}/whatsappUniversalBot?businessId=YOUR_BUSINESS_ID`);
}

// Run tests
runWhatsAppTests().catch(console.error);
