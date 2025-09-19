const axios = require('axios');

// Test configuration
const TEST_CONFIG = {
  serviceBusinessId: 'hair-studio-pro',
  productBusinessId: 'fresh-market',
  customerPhone: '+1234567890',
  customerName: 'Test Customer',
  testDate: '2025-09-19' // Use tomorrow's date to avoid conflicts
};

// Function URLs
const FUNCTION_URLS = {
  universalBot: 'https://us-central1-whatsapp-bot-ai-7226e.cloudfunctions.net/universalBot',
  fakeChat: 'https://us-central1-whatsapp-bot-ai-7226e.cloudfunctions.net/fakeChat',
  setWorkingHours: 'https://us-central1-whatsapp-bot-ai-7226e.cloudfunctions.net/setWorkingHours',
  createBooking: 'https://us-central1-whatsapp-bot-ai-7226e.cloudfunctions.net/createBooking'
};

// Test results tracking
let testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  details: []
};

// Helper function to make requests
async function makeRequest(url, data, timeout = 15000) {
  try {
    const response = await axios.post(url, data, {
      headers: { 'Content-Type': 'application/json' },
      timeout
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

// Test runner
function runTest(testName, testFunction) {
  testResults.total++;
  console.log(`\n🧪 TEST ${testResults.total}: ${testName}`);
  console.log('='.repeat(50));
  
  return testFunction().then(result => {
    if (result.success) {
      testResults.passed++;
      console.log(`✅ PASSED: ${testName}`);
      if (result.details) {
        console.log(`   Details: ${result.details}`);
      }
    } else {
      testResults.failed++;
      console.log(`❌ FAILED: ${testName}`);
      console.log(`   Error: ${result.error}`);
    }
    
    testResults.details.push({
      name: testName,
      success: result.success,
      error: result.error,
      details: result.details
    });
    
    return result;
  }).catch(error => {
    testResults.failed++;
    console.log(`❌ FAILED: ${testName} - Exception: ${error.message}`);
    testResults.details.push({
      name: testName,
      success: false,
      error: error.message
    });
    return { success: false, error: error.message };
  });
}

// Wait function for rate limiting
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// CORE FUNCTIONALITY TESTS
// ============================================================================

// Test 1: Universal Bot Basic Functionality
async function testUniversalBotBasic() {
  const result = await makeRequest(FUNCTION_URLS.universalBot, {
    From: TEST_CONFIG.customerPhone,
    Body: "Hello",
    businessId: TEST_CONFIG.serviceBusinessId
  });
  
  if (result.success) {
    const message = extractMessage(result.data);
    return { 
      success: message.length > 0, 
      details: `Response: ${message.substring(0, 100)}...` 
    };
  }
  return { success: false, error: result.error };
}

// Test 2: Service Business Type Detection
async function testServiceBusinessDetection() {
  const result = await makeRequest(FUNCTION_URLS.universalBot, {
    From: TEST_CONFIG.customerPhone,
    Body: "What type of business are you?",
    businessId: TEST_CONFIG.serviceBusinessId
  });
  
  if (result.success) {
    const message = extractMessage(result.data);
    const isServiceBusiness = message.toLowerCase().includes('service') || 
                            message.toLowerCase().includes('appointment') ||
                            message.toLowerCase().includes('booking');
    return { 
      success: isServiceBusiness, 
      details: `Detected service business: ${isServiceBusiness}` 
    };
  }
  return { success: false, error: result.error };
}

// Test 3: Product Business Type Detection
async function testProductBusinessDetection() {
  const result = await makeRequest(FUNCTION_URLS.universalBot, {
    From: TEST_CONFIG.customerPhone,
    Body: "What type of business are you?",
    businessId: TEST_CONFIG.productBusinessId
  });
  
  if (result.success) {
    const message = extractMessage(result.data);
    const isProductBusiness = message.toLowerCase().includes('product') || 
                            message.toLowerCase().includes('service-based') ||
                            message.toLowerCase().includes('appointment');
    return { 
      success: isProductBusiness, 
      details: `Detected product business: ${isProductBusiness}` 
    };
  }
  return { success: false, error: result.error };
}

// Test 4: Service Business Availability Check
async function testServiceAvailabilityCheck() {
  const result = await makeRequest(FUNCTION_URLS.universalBot, {
    From: TEST_CONFIG.customerPhone,
    Body: "What times are you available today?",
    businessId: TEST_CONFIG.serviceBusinessId
  });
  
  if (result.success) {
    const message = extractMessage(result.data);
    const hasTimeSlots = message.includes('09:00') || 
                        message.includes('10:00') ||
                        message.includes('available');
    return { 
      success: hasTimeSlots, 
      details: `Availability response: ${message.substring(0, 100)}...` 
    };
  }
  return { success: false, error: result.error };
}

// Test 5: Cross-Business Type Handling
async function testCrossBusinessHandling() {
  const result = await makeRequest(FUNCTION_URLS.universalBot, {
    From: TEST_CONFIG.customerPhone,
    Body: "I want to buy shampoo",
    businessId: TEST_CONFIG.serviceBusinessId
  });
  
  if (result.success) {
    const message = extractMessage(result.data);
    const redirectsAppropriately = message.toLowerCase().includes('service') || 
                                 message.toLowerCase().includes('appointment') ||
                                 message.toLowerCase().includes('product sales');
    return { 
      success: redirectsAppropriately, 
      details: `Cross-business response: ${message.substring(0, 100)}...` 
    };
  }
  return { success: false, error: result.error };
}

// Test 6: Error Handling
async function testErrorHandling() {
  const result = await makeRequest(FUNCTION_URLS.universalBot, {
    From: TEST_CONFIG.customerPhone,
    Body: "This is a very long message that might cause issues with the AI processing and could potentially trigger error handling mechanisms in the system to ensure robust performance under various conditions and edge cases that might occur during normal operation",
    businessId: TEST_CONFIG.serviceBusinessId
  });
  
  if (result.success) {
    const message = extractMessage(result.data);
    const handlesLongMessage = message.length > 0 && !message.includes('error');
    return { 
      success: handlesLongMessage, 
      details: `Long message handled: ${message.substring(0, 50)}...` 
    };
  }
  return { success: false, error: result.error };
}

// Test 7: Invalid Business ID Handling
async function testInvalidBusinessId() {
  const result = await makeRequest(FUNCTION_URLS.universalBot, {
    From: TEST_CONFIG.customerPhone,
    Body: "Hello",
    businessId: "invalid-business-id-12345"
  });
  
  if (result.success) {
    const message = extractMessage(result.data);
    const handlesInvalidId = message.length > 0;
    return { 
      success: handlesInvalidId, 
      details: `Invalid business ID handled: ${message.substring(0, 50)}...` 
    };
  }
  return { success: false, error: result.error };
}

// Test 8: Empty Message Handling
async function testEmptyMessageHandling() {
  const result = await makeRequest(FUNCTION_URLS.universalBot, {
    From: TEST_CONFIG.customerPhone,
    Body: "",
    businessId: TEST_CONFIG.serviceBusinessId
  });
  
  if (result.success) {
    const message = extractMessage(result.data);
    const handlesEmptyMessage = message.length > 0;
    return { 
      success: handlesEmptyMessage, 
      details: `Empty message handled: ${message.substring(0, 50)}...` 
    };
  }
  return { success: false, error: result.error };
}

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

// Test 9: Set Working Hours Function
async function testSetWorkingHours() {
  const result = await makeRequest(FUNCTION_URLS.setWorkingHours, {
    barberId: "test-barber",
    date: TEST_CONFIG.testDate,
    timeSlots: [
      { start: "09:00", end: "12:00" },
      { start: "14:00", end: "18:00" }
    ]
  });
  
  if (result.success) {
    const hasSuccess = result.data.success === true;
    return { 
      success: hasSuccess, 
      details: `Working hours set: ${JSON.stringify(result.data)}` 
    };
  }
  return { success: false, error: result.error };
}

// Test 10: Create Booking Function
async function testCreateBooking() {
  const result = await makeRequest(FUNCTION_URLS.createBooking, {
    barberId: "test-barber",
    customerName: TEST_CONFIG.customerName,
    phone: TEST_CONFIG.customerPhone,
    date: TEST_CONFIG.testDate,
    start: "10:00",
    end: "10:30"
  });
  
  if (result.success) {
    const hasSuccess = result.data.success === true;
    return { 
      success: hasSuccess, 
      details: `Booking created: ${JSON.stringify(result.data)}` 
    };
  }
  return { success: false, error: result.error };
}

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================

// Test 11: Response Time Test
async function testResponseTime() {
  const startTime = Date.now();
  
  const result = await makeRequest(FUNCTION_URLS.universalBot, {
    From: TEST_CONFIG.customerPhone,
    Body: "Hello",
    businessId: TEST_CONFIG.serviceBusinessId
  });
  
  const endTime = Date.now();
  const responseTime = endTime - startTime;
  
  if (result.success) {
    const isFastEnough = responseTime < 5000; // 5 seconds max
    return { 
      success: isFastEnough, 
      details: `Response time: ${responseTime}ms` 
    };
  }
  return { success: false, error: result.error };
}

// Test 12: Concurrent Requests Test
async function testConcurrentRequests() {
  const promises = [];
  for (let i = 0; i < 3; i++) {
    promises.push(makeRequest(FUNCTION_URLS.universalBot, {
      From: TEST_CONFIG.customerPhone,
      Body: `Test message ${i}`,
      businessId: TEST_CONFIG.serviceBusinessId
    }));
  }
  
  const results = await Promise.all(promises);
  const successCount = results.filter(r => r.success).length;
  
  return { 
    success: successCount >= 2, // At least 2 out of 3 should succeed
    details: `${successCount}/3 concurrent requests successful` 
  };
}

// ============================================================================
// END-TO-END TESTS
// ============================================================================

// Test 13: End-to-End Service Business Flow
async function testEndToEndServiceFlow() {
  try {
    // Step 1: Set working hours
    const hoursResult = await makeRequest(FUNCTION_URLS.setWorkingHours, {
      barberId: "test-barber",
      date: TEST_CONFIG.testDate,
      timeSlots: [{ start: "09:00", end: "18:00" }]
    });
    
    if (!hoursResult.success) {
      return { success: false, error: "Failed to set working hours" };
    }
    
    await wait(1000);
    
    // Step 2: Check availability
    const availabilityResult = await makeRequest(FUNCTION_URLS.universalBot, {
      From: TEST_CONFIG.customerPhone,
      Body: "What times are you available?",
      businessId: TEST_CONFIG.serviceBusinessId
    });
    
    if (!availabilityResult.success) {
      return { success: false, error: "Failed to check availability" };
    }
    
    await wait(1000);
    
    // Step 3: Book appointment
    const bookingResult = await makeRequest(FUNCTION_URLS.universalBot, {
      From: TEST_CONFIG.customerPhone,
      Body: "Book me a haircut for 11:00",
      businessId: TEST_CONFIG.serviceBusinessId
    });
    
    if (bookingResult.success) {
      const message = extractMessage(bookingResult.data);
      const hasBooking = message.includes('booked') || message.includes('appointment') || message.includes('ID');
      return { 
        success: hasBooking, 
        details: `End-to-end service flow completed: ${message.substring(0, 100)}...` 
      };
    }
    
    return { success: false, error: "Failed to complete end-to-end flow" };
  } catch (error) {
    return { success: false, error: `Exception: ${error.message}` };
  }
}

// Test 14: Business Type Switching Test
async function testBusinessTypeSwitching() {
  // Test service business
  const serviceResult = await makeRequest(FUNCTION_URLS.universalBot, {
    From: TEST_CONFIG.customerPhone,
    Body: "Book an appointment",
    businessId: TEST_CONFIG.serviceBusinessId
  });
  
  await wait(1000);
  
  // Test product business
  const productResult = await makeRequest(FUNCTION_URLS.universalBot, {
    From: TEST_CONFIG.customerPhone,
    Body: "Buy products",
    businessId: TEST_CONFIG.productBusinessId
  });
  
  if (serviceResult.success && productResult.success) {
    const serviceMessage = extractMessage(serviceResult.data);
    const productMessage = extractMessage(productResult.data);
    
    const serviceHandlesAppointment = serviceMessage.toLowerCase().includes('appointment') || 
                                     serviceMessage.toLowerCase().includes('book');
    const productHandlesProducts = productMessage.toLowerCase().includes('service-based') || 
                                  productMessage.toLowerCase().includes('product');
    
    return { 
      success: serviceHandlesAppointment && productHandlesProducts, 
      details: `Business type switching works correctly` 
    };
  }
  
  return { success: false, error: "Failed to switch business types" };
}

// ============================================================================
// EDGE CASE TESTS
// ============================================================================

// Test 15: Special Characters Handling
async function testSpecialCharacters() {
  const result = await makeRequest(FUNCTION_URLS.universalBot, {
    From: TEST_CONFIG.customerPhone,
    Body: "Hello! @#$%^&*()_+{}|:<>?[]\\;'\",./",
    businessId: TEST_CONFIG.serviceBusinessId
  });
  
  if (result.success) {
    const message = extractMessage(result.data);
    const handlesSpecialChars = message.length > 0 && !message.includes('error');
    return { 
      success: handlesSpecialChars, 
      details: `Special characters handled: ${message.substring(0, 50)}...` 
    };
  }
  return { success: false, error: result.error };
}

// Test 16: Unicode Characters Handling
async function testUnicodeCharacters() {
  const result = await makeRequest(FUNCTION_URLS.universalBot, {
    From: TEST_CONFIG.customerPhone,
    Body: "Hello! 🌟 Café résumé naïve",
    businessId: TEST_CONFIG.serviceBusinessId
  });
  
  if (result.success) {
    const message = extractMessage(result.data);
    const handlesUnicode = message.length > 0;
    return { 
      success: handlesUnicode, 
      details: `Unicode characters handled: ${message.substring(0, 50)}...` 
    };
  }
  return { success: false, error: result.error };
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

async function runAllTests() {
  console.log('🚀 FINAL COMPREHENSIVE TEST SUITE');
  console.log('==================================');
  console.log('Testing every aspect of the Universal MCP AI Bot...\n');
  
  const tests = [
    // Core Functionality Tests
    { name: 'Universal Bot Basic Functionality', fn: testUniversalBotBasic },
    { name: 'Service Business Type Detection', fn: testServiceBusinessDetection },
    { name: 'Product Business Type Detection', fn: testProductBusinessDetection },
    { name: 'Service Business Availability Check', fn: testServiceAvailabilityCheck },
    { name: 'Cross-Business Type Handling', fn: testCrossBusinessHandling },
    { name: 'Error Handling', fn: testErrorHandling },
    { name: 'Invalid Business ID Handling', fn: testInvalidBusinessId },
    { name: 'Empty Message Handling', fn: testEmptyMessageHandling },
    
    // Integration Tests
    { name: 'Set Working Hours Function', fn: testSetWorkingHours },
    { name: 'Create Booking Function', fn: testCreateBooking },
    
    // Performance Tests
    { name: 'Response Time Test', fn: testResponseTime },
    { name: 'Concurrent Requests Test', fn: testConcurrentRequests },
    
    // End-to-End Tests
    { name: 'End-to-End Service Business Flow', fn: testEndToEndServiceFlow },
    { name: 'Business Type Switching Test', fn: testBusinessTypeSwitching },
    
    // Edge Case Tests
    { name: 'Special Characters Handling', fn: testSpecialCharacters },
    { name: 'Unicode Characters Handling', fn: testUnicodeCharacters }
  ];
  
  // Run all tests
  for (const test of tests) {
    await runTest(test.name, test.fn);
    await wait(1000); // Rate limiting
  }
  
  // Print final results
  console.log('\n📊 FINAL TEST RESULTS');
  console.log('=====================');
  console.log(`Total Tests: ${testResults.total}`);
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`📈 Success Rate: ${Math.round((testResults.passed / testResults.total) * 100)}%`);
  
  if (testResults.failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    testResults.details
      .filter(test => !test.success)
      .forEach(test => {
        console.log(`   - ${test.name}: ${test.error}`);
      });
  }
  
  console.log('\n🎯 TEST SUMMARY');
  console.log('================');
  if (testResults.failed === 0) {
    console.log('🎉 ALL TESTS PASSED! The Universal MCP AI Bot is working perfectly!');
  } else if (testResults.passed > testResults.failed) {
    console.log('✅ MOSTLY SUCCESSFUL! The bot is working well with minor issues.');
  } else {
    console.log('⚠️  SOME ISSUES DETECTED! Please review the failed tests.');
  }
  
  return testResults;
}

// Run the comprehensive test suite
runAllTests().catch(console.error);
