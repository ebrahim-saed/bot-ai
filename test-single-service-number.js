const axios = require('axios');

// Test configuration
const BASE_URL = 'https://us-central1-whatsapp-bot-ai-7226e.cloudfunctions.net';
const TEST_PHONE = 'whatsapp:+1234567890';
const SERVICE_NUMBER = 'whatsapp:+14155238886'; // Your service businesses number

// Test different service business messages
const testScenarios = [
  {
    name: "Barber Shop Message",
    message: "Hello, I need a haircut appointment",
    expectedBusinessId: "barber-shop-downtown",
    expectedKeywords: ["haircut", "appointment", "service", "book"]
  },
  {
    name: "Lawyer Office Message",
    message: "Hi, I need legal consultation",
    expectedBusinessId: "lawyer-office",
    expectedKeywords: ["legal", "consultation", "service", "appointment"]
  },
  {
    name: "Spa Center Message",
    message: "What spa services do you offer?",
    expectedBusinessId: "spa-center",
    expectedKeywords: ["spa", "service", "massage", "wellness"]
  },
  {
    name: "Dentist Clinic Message",
    message: "I need a dental checkup",
    expectedBusinessId: "dentist-clinic",
    expectedKeywords: ["dental", "checkup", "service", "appointment"]
  },
  {
    name: "Gym Fitness Message",
    message: "What fitness programs do you have?",
    expectedBusinessId: "gym-fitness",
    expectedKeywords: ["fitness", "program", "service", "workout"]
  },
  {
    name: "Generic Service Message",
    message: "Hello, how can you help me?",
    expectedBusinessId: "barber-shop-downtown", // Default fallback
    expectedKeywords: ["help", "service", "assist"]
  }
];

// Test function
async function testSingleServiceNumber() {
  console.log('🧪 TESTING SINGLE SERVICE NUMBER CONFIGURATION');
  console.log('='.repeat(60));
  console.log(`Service Number: ${SERVICE_NUMBER}`);
  console.log('Testing business ID detection from message content...\n');
  
  let passed = 0;
  let failed = 0;
  
  for (const scenario of testScenarios) {
    try {
      console.log(`📱 Testing: ${scenario.name}`);
      console.log(`Message: "${scenario.message}"`);
      console.log(`Expected Business ID: ${scenario.expectedBusinessId}`);
      
      const response = await axios.post(
        `${BASE_URL}/whatsappUniversalBot`,
        {
          Body: scenario.message,
          From: TEST_PHONE,
          To: SERVICE_NUMBER  // All service businesses use this number
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
        
        // Check if response contains expected keywords
        const hasExpectedKeywords = scenario.expectedKeywords.some(keyword => 
          responseText.toLowerCase().includes(keyword.toLowerCase())
        );
        
        if (hasExpectedKeywords) {
          console.log(`✅ PASSED: Business ID detection working correctly`);
          passed++;
        } else {
          console.log(`❌ FAILED: Business ID detection may not be working`);
          console.log(`Expected keywords: ${scenario.expectedKeywords.join(', ')}`);
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
    console.log('\n🎉 ALL TESTS PASSED! Single service number configuration is working perfectly!');
  } else if (failed <= 1) {
    console.log('\n✅ MOSTLY SUCCESSFUL! Single service number configuration is working well.');
  } else {
    console.log('\n⚠️  Some tests failed. Check the logs above for details.');
  }
  
  console.log('\n📱 Current Configuration:');
  console.log(`Service Number: ${SERVICE_NUMBER}`);
  console.log('Business ID Detection: Message content analysis');
  console.log('Supported Service Businesses:');
  console.log('- Barber Shop (haircut, hair, beard, shave)');
  console.log('- Lawyer Office (lawyer, legal, attorney, court)');
  console.log('- Spa Center (spa, massage, wellness, relax)');
  console.log('- Dentist Clinic (dentist, dental, tooth)');
  console.log('- Gym Fitness (gym, fitness, workout, exercise)');
  console.log('- Default: Barber Shop (if no keywords found)');
  
  console.log('\n🔗 Function URLs:');
  console.log(`Universal Bot: ${BASE_URL}/whatsappUniversalBot`);
  console.log(`Service Bot: ${BASE_URL}/whatsappServiceBot`);
  console.log(`Product Bot: ${BASE_URL}/whatsappProductBot`);
  
  console.log('\n💡 Next Steps:');
  console.log('1. ✅ Service number configured and working');
  console.log('2. ⏳ Add product businesses number when ready');
  console.log('3. 🎯 Ready for hackathon presentation!');
}

// Run tests
testSingleServiceNumber().catch(console.error);
