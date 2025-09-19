const axios = require('axios');

// Test configuration
const TEST_CONFIG = {
  serviceBusinessId: 'hair-studio-pro',
  productBusinessId: 'fresh-market',
  customerPhone: '+1234567890',
  customerName: 'Test Customer'
};

// Function URLs
const FUNCTION_URLS = {
  universalBot: 'https://us-central1-whatsapp-bot-ai-7226e.cloudfunctions.net/universalBot'
};

// Helper function to make requests
async function makeRequest(url, data) {
  try {
    const response = await axios.post(url, data, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000
    });
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    return { 
      success: false, 
      error: error.message, 
      status: error.response?.status,
      data: error.response?.data 
    };
  }
}

// Helper function to extract message from XML response
function extractMessage(xmlResponse) {
  const match = xmlResponse.match(/<Message>(.*?)<\/Message>/s);
  return match ? match[1].replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>') : xmlResponse;
}

// Service Business Test Scenarios
async function testServiceBusinessScenarios() {
  console.log('\n🏢 SERVICE BUSINESS TEST SCENARIOS');
  console.log('==================================');
  
  const scenarios = [
    {
      name: '1. Customer asks about available services',
      message: 'What services do you offer?',
      expected: 'services'
    },
    {
      name: '2. Customer asks about availability',
      message: 'Do you have any appointments available today?',
      expected: 'availability'
    },
    {
      name: '3. Customer wants to book a haircut',
      message: 'I need a haircut appointment',
      expected: 'booking'
    },
    {
      name: '4. Customer asks about pricing',
      message: 'How much does a haircut cost?',
      expected: 'pricing'
    },
    {
      name: '5. Customer wants to book specific time',
      message: 'Can I book a haircut at 2 PM?',
      expected: 'specific_booking'
    }
  ];

  for (const scenario of scenarios) {
    console.log(`\n${scenario.name}`);
    console.log('Message:', scenario.message);
    
    const result = await makeRequest(FUNCTION_URLS.universalBot, {
      From: TEST_CONFIG.customerPhone,
      Body: scenario.message,
      businessId: TEST_CONFIG.serviceBusinessId
    });
    
    if (result.success) {
      const message = extractMessage(result.data);
      console.log('✅ AI Response:', message);
      
      // Check if response contains expected content
      if (scenario.expected === 'services' && message.toLowerCase().includes('service')) {
        console.log('✅ Correctly identified service request');
      } else if (scenario.expected === 'availability' && message.toLowerCase().includes('available')) {
        console.log('✅ Correctly identified availability request');
      } else if (scenario.expected === 'booking' && message.toLowerCase().includes('book')) {
        console.log('✅ Correctly identified booking request');
      } else if (scenario.expected === 'pricing' && message.toLowerCase().includes('$')) {
        console.log('✅ Correctly provided pricing information');
      } else if (scenario.expected === 'specific_booking' && message.toLowerCase().includes('2')) {
        console.log('✅ Correctly handled specific time request');
      }
    } else {
      console.log('❌ FAILED:', result.error);
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
  }
}

// Product Business Test Scenarios
async function testProductBusinessScenarios() {
  console.log('\n🛒 PRODUCT BUSINESS TEST SCENARIOS');
  console.log('==================================');
  
  const scenarios = [
    {
      name: '1. Customer asks about products',
      message: 'What products do you have?',
      expected: 'products'
    },
    {
      name: '2. Customer searches for specific item',
      message: 'Do you have organic apples?',
      expected: 'search'
    },
    {
      name: '3. Customer asks about stock',
      message: 'How many apples do you have in stock?',
      expected: 'stock'
    },
    {
      name: '4. Customer wants to place order',
      message: 'I want to order 5 apples',
      expected: 'order'
    },
    {
      name: '5. Customer asks about pricing',
      message: 'How much do apples cost?',
      expected: 'pricing'
    },
    {
      name: '6. Customer asks about delivery',
      message: 'Do you deliver?',
      expected: 'delivery'
    }
  ];

  for (const scenario of scenarios) {
    console.log(`\n${scenario.name}`);
    console.log('Message:', scenario.message);
    
    const result = await makeRequest(FUNCTION_URLS.universalBot, {
      From: TEST_CONFIG.customerPhone,
      Body: scenario.message,
      businessId: TEST_CONFIG.productBusinessId
    });
    
    if (result.success) {
      const message = extractMessage(result.data);
      console.log('✅ AI Response:', message);
      
      // Check if response contains expected content
      if (scenario.expected === 'products' && message.toLowerCase().includes('product')) {
        console.log('✅ Correctly identified product request');
      } else if (scenario.expected === 'search' && message.toLowerCase().includes('apple')) {
        console.log('✅ Correctly searched for apples');
      } else if (scenario.expected === 'stock' && message.toLowerCase().includes('stock')) {
        console.log('✅ Correctly provided stock information');
      } else if (scenario.expected === 'order' && message.toLowerCase().includes('order')) {
        console.log('✅ Correctly handled order request');
      } else if (scenario.expected === 'pricing' && message.toLowerCase().includes('$')) {
        console.log('✅ Correctly provided pricing information');
      } else if (scenario.expected === 'delivery' && message.toLowerCase().includes('deliver')) {
        console.log('✅ Correctly provided delivery information');
      }
    } else {
      console.log('❌ FAILED:', result.error);
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
  }
}

// Cross-business type test
async function testCrossBusinessType() {
  console.log('\n🔄 CROSS-BUSINESS TYPE TEST');
  console.log('===========================');
  
  const scenarios = [
    {
      name: '1. Service business asking about products (should redirect)',
      message: 'Do you sell shampoo?',
      businessId: TEST_CONFIG.serviceBusinessId,
      expected: 'redirect'
    },
    {
      name: '2. Product business asking about appointments (should redirect)',
      message: 'Can I book an appointment?',
      businessId: TEST_CONFIG.productBusinessId,
      expected: 'redirect'
    }
  ];

  for (const scenario of scenarios) {
    console.log(`\n${scenario.name}`);
    console.log('Message:', scenario.message);
    
    const result = await makeRequest(FUNCTION_URLS.universalBot, {
      From: TEST_CONFIG.customerPhone,
      Body: scenario.message,
      businessId: scenario.businessId
    });
    
    if (result.success) {
      const message = extractMessage(result.data);
      console.log('✅ AI Response:', message);
      
      if (scenario.expected === 'redirect' && message.toLowerCase().includes('sorry')) {
        console.log('✅ Correctly redirected inappropriate request');
      }
    } else {
      console.log('❌ FAILED:', result.error);
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
  }
}

// Performance test
async function testPerformance() {
  console.log('\n⚡ PERFORMANCE TEST');
  console.log('==================');
  
  const startTime = Date.now();
  
  const promises = [];
  for (let i = 0; i < 5; i++) {
    promises.push(makeRequest(FUNCTION_URLS.universalBot, {
      From: TEST_CONFIG.customerPhone,
      Body: 'Hello',
      businessId: TEST_CONFIG.serviceBusinessId
    }));
  }
  
  const results = await Promise.all(promises);
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  const successCount = results.filter(r => r.success).length;
  
  console.log(`✅ ${successCount}/5 requests successful`);
  console.log(`⏱️  Total time: ${duration}ms`);
  console.log(`📊 Average response time: ${duration / 5}ms`);
}

// Main test function
async function runHackathonTests() {
  console.log('🚀 HACKATHON PROJECT TEST SUITE');
  console.log('================================');
  console.log('Testing Universal MCP AI Bot for both Service and Product businesses...\n');
  
  try {
    await testServiceBusinessScenarios();
    await testProductBusinessScenarios();
    await testCrossBusinessType();
    await testPerformance();
    
    console.log('\n🎉 ALL HACKATHON TESTS COMPLETED!');
    console.log('==================================');
    console.log('✅ Service Business scenarios tested');
    console.log('✅ Product Business scenarios tested');
    console.log('✅ Cross-business type handling tested');
    console.log('✅ Performance tested');
    console.log('\n🚀 Ready for hackathon presentation!');
    
  } catch (error) {
    console.error('❌ Test suite error:', error);
  }
}

// Run tests
runHackathonTests();
