// Fixed Location-Based Universal Bot
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const axios = require("axios");

// Secrets
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

// Fixed Location-Based Universal Bot
exports.fixedLocationBot = onRequest({ secrets: [OPENAI_API_KEY] }, async (req, res) => {
  try {
    const message = req.body.Body?.trim() || "Hi!";
    const customer = req.body.From || "Anonymous";
    const twilioNumber = req.body.To || "unknown";
    
    logger.info(`Fixed Location Bot - Customer: ${customer}, Message: ${message}`);
    
    const tz = (process.env.BUSINESS_TZ || req.query.tz || 'UTC').toString();
    const today = (req.query.date || req.body.date || new Date().toLocaleDateString('en-CA', { timeZone: tz })).toString();

    // First, try to handle location-based queries directly
    let response = await handleLocationQuery(message, customer);
    
    if (!response) {
      // If not a location query, use AI for other interactions
      response = await askLocationAI(message, customer, today);
    }

    // DEBUG: Log what the AI generated
    logger.info(`AI Response: "${response}"`);

    // Handle special actions
    let actionReply = null;
    
    if (response.includes("BOOKING:")) {
      actionReply = await handleServiceBooking(response, customer, today);
    } else if (response.includes("ORDER:")) {
      actionReply = await handleProductOrder(response, customer);
    }

    // Use action reply if available
    if (actionReply) {
      response = actionReply;
    }

    // Save conversation
    await admin.firestore().collection("conversations").add({
      customer,
      twilioNumber,
      message,
      reply: response,
      date: today,
      timezone: tz,
      timestamp: Date.now(),
      platform: 'whatsapp',
      botType: 'fixed-location'
    });

    const safeReply = escapeXml(response);

    res.set('Content-Type', 'text/xml');
    res.status(200).send(`
      <Response>
          <Message>${safeReply}</Message>
      </Response>
    `);
  } catch (err) {
    logger.error("Error handling fixed location message", err);
    res.status(500).send("Something went wrong");
  }
});

// Handle location-based queries directly
async function handleLocationQuery(message, customer) {
  try {
    // Check for location-based search patterns
    const locationPatterns = [
      /(?:give me|show me|find|search).*?(?:barber|hair|salon|restaurant|pharmacy|market|shop|business).*?in\s+(\w+)/i,
      /(?:barber|hair|salon|restaurant|pharmacy|market|shop).*?in\s+(\w+)/i,
      /in\s+(\w+).*?(?:barber|hair|salon|restaurant|pharmacy|market|shop)/i
    ];

    const businessNamePatterns = [
      /(?:find|search|show).*?(\w+\s+\w+)/i,
      /(?:what are|check).*?(\w+\s+\w+)/i
    ];

    // Check for location-based search
    for (const pattern of locationPatterns) {
      const match = message.match(pattern);
      if (match) {
        const location = match[1].toLowerCase();
        const businessType = extractBusinessType(message);
        
        logger.info(`Location search detected: ${location}, type: ${businessType}`);
        
        const businesses = await searchBusinessesByLocation(location, businessType);
        
        if (businesses.length === 0) {
          return `I couldn't find any ${businessType || 'businesses'} in ${location}. Please try a different location or business type.`;
        }
        
        // **FIX 1: Store the business list for later retrieval**
        await storeBusinessList(customer, businesses);
        
        let response = `I found ${businesses.length} ${businessType || 'businesses'} in ${location}:\n\n`;
        businesses.forEach((business, index) => {
          response += `${index + 1}. ${business.name || business.businessName || 'Unknown Business'}\n`;
          if (business.address) response += `   Address: ${business.address}\n`;
          if (business.phone) response += `   Phone: ${business.phone}\n`;
          response += `   Type: ${business.businessType || 'service'}\n\n`;
        });
        
        response += `Please choose a number (1-${businesses.length}) to select a business.`;
        return response;
      }
    }

    // Check for specific business name search
    for (const pattern of businessNamePatterns) {
      const match = message.match(pattern);
      if (match) {
        const businessName = match[1];
        
        logger.info(`Business name search detected: ${businessName}`);
        
        const businesses = await searchBusinessesByName(businessName);
        
        if (businesses.length === 0) {
          return `I couldn't find any business named "${businessName}". Please try a different name or check the spelling.`;
        }
        
        if (businesses.length === 1) {
          // Auto-select if only one match
          const business = businesses[0];
          await setSelectedBusiness(business.id, customer);
          return `Found "${business.name || business.businessName}"! I've selected this business for you. How can I help you with ${business.name || business.businessName}?`;
        }
        
        // **FIX 2: Store the business list for later retrieval**
        await storeBusinessList(customer, businesses);
        
        let response = `I found ${businesses.length} businesses matching "${businessName}":\n\n`;
        businesses.forEach((business, index) => {
          response += `${index + 1}. ${business.name || business.businessName || 'Unknown Business'}\n`;
          if (business.address) response += `   Address: ${business.address}\n`;
          if (business.location) response += `   Location: ${business.location}\n`;
          response += `   Type: ${business.businessType || 'service'}\n\n`;
        });
        
        response += `Please choose a number (1-${businesses.length}) to select a business.`;
        return response;
      }
    }

    // Check for business selection (number choice)
    const numberMatch = message.match(/^(\d+)$/);
    if (numberMatch) {
      const choice = parseInt(numberMatch[1]);
      return await handleBusinessSelection(choice, customer);
    }

    return null; // Not a location query
  } catch (error) {
    logger.error("Error in handleLocationQuery:", error);
    return null;
  }
}

// Extract business type from message
function extractBusinessType(message) {
  const types = {
    'barber': 'barber',
    'hair': 'hair',
    'salon': 'salon',
    'restaurant': 'restaurant',
    'pharmacy': 'pharmacy',
    'market': 'market',
    'shop': 'shop'
  };
  
  for (const [key, value] of Object.entries(types)) {
    if (message.toLowerCase().includes(key)) {
      return value;
    }
  }
  
  return null;
}

// Search businesses by location
async function searchBusinessesByLocation(location, businessType) {
  try {
    let query = admin.firestore().collection('businesses')
      .where('location', '==', location);
    
    const snapshot = await query.get();
    const businesses = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      if (!businessType || 
          (data.name && data.name.toLowerCase().includes(businessType)) || 
          (data.businessName && data.businessName.toLowerCase().includes(businessType)) ||
          data.businessType === 'service') {
        businesses.push({
          id: doc.id,
          ...data
        });
      }
    });
    
    return businesses;
  } catch (error) {
    logger.error("Error searching businesses by location:", error);
    return [];
  }
}

// Search businesses by name
async function searchBusinessesByName(businessName) {
  try {
    const snapshot = await admin.firestore().collection('businesses').get();
    const businesses = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const name = data.name || data.businessName || '';
      
      if (name.toLowerCase().includes(businessName.toLowerCase())) {
        businesses.push({
          id: doc.id,
          ...data
        });
      }
    });
    
    return businesses;
  } catch (error) {
    logger.error("Error searching businesses by name:", error);
    return [];
  }
}

// **FIX 3: New function to store business list**
async function storeBusinessList(customer, businesses) {
  try {
    await admin.firestore().collection('customer_sessions').doc(customer).set({
      businessList: businesses,
      businessListTimestamp: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (error) {
    logger.error("Error storing business list:", error);
  }
}

// **FIX 4: New function to retrieve business list**
async function getBusinessList(customer) {
  try {
    const doc = await admin.firestore().collection('customer_sessions').doc(customer).get();
    if (doc.exists && doc.data().businessList) {
      return doc.data().businessList;
    }
    return [];
  } catch (error) {
    logger.error("Error getting business list:", error);
    return [];
  }
}

// **FIX 5: Fixed handleBusinessSelection function**
async function handleBusinessSelection(choice, customer) {
  try {
    // Get the stored business list
    const businesses = await getBusinessList(customer);
    
    if (businesses.length === 0) {
      return "I don't have a business list to select from. Please search for businesses first.";
    }
    
    if (choice < 1 || choice > businesses.length) {
      return `Please choose a number between 1 and ${businesses.length}.`;
    }
    
    // Get the selected business
    const selectedBusiness = businesses[choice - 1];
    
    // Store the selected business
    await setSelectedBusiness(selectedBusiness.id, customer);
    
    logger.info(`Business selected: ${selectedBusiness.name || selectedBusiness.businessName} (${selectedBusiness.id})`);
    
    return `Great! You've selected "${selectedBusiness.name || selectedBusiness.businessName}". I'm ready to help you with appointments and services. What would you like to do?`;
    
  } catch (error) {
    logger.error("Error handling business selection:", error);
    return "Sorry, I couldn't process your selection. Please try again.";
  }
}

// **FIX 6: Improved AI function for non-location queries**
async function askLocationAI(message, customer, date) {
  const apiKey = OPENAI_API_KEY.value();
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY secret");
  }
  
  const cleanApiKey = apiKey.trim().replace(/[^\x20-\x7E]/g, '');
  
  // Check if customer has a selected business
  const selectedBusiness = await getSelectedBusiness(customer);
  
  // **FIX 7: Enhanced system prompt with availability handling and booking**
  let systemPrompt = `
You are a helpful AI assistant for businesses. You can help with:

CURRENT CUSTOMER CONTEXT:
- Customer: ${customer}
- Date: ${date}
- Selected Business: ${selectedBusiness ? selectedBusiness.name : 'None'}

CAPABILITIES:
- Help with business-related questions
- Provide information about services and products
- Assist with appointments and orders
- Answer general questions

BOOKING FORMAT: When user wants to book, respond with:
BOOKING: SERVICE_ID:TIME
Example: BOOKING: haircut:14:00

CRITICAL BOOKING RULES:
- ANY time user mentions booking, scheduling, or wants an appointment at a specific time, you MUST respond with the BOOKING: format
- Examples that require BOOKING format:
  * "book me for 10:00" → BOOKING: haircut:10:00  
  * "I want to book at 2 PM" → BOOKING: haircut:14:00
  * "schedule me for 3:30" → BOOKING: haircut:15:30
  * "can you book me for 10:00 AM" → BOOKING: haircut:10:00
  * "i want to book a haircut appointment at 10:00 today" → BOOKING: haircut:10:00
- Convert all times to 24-hour format (10:00, 14:00, 15:30, etc.)
- Use "haircut" as default service if not specified
- Do NOT give general booking advice - always use the BOOKING: format for booking requests

SPECIAL HANDLING FOR AVAILABILITY QUERIES:
If the user asks about availability (e.g., "when are you free today?", "what times are available?", "show me available slots"):
- If a business is selected, provide helpful information about checking availability
- Suggest specific time ranges or ask for preferences
- Be conversational and helpful

BEHAVIOR:
- Be friendly and helpful
- Ask clarifying questions when needed
- Provide accurate information
- Always confirm actions
- For availability questions, be specific and helpful

Current Context:
- Customer: ${customer}
- Date: ${date}
- Selected Business: ${selectedBusiness ? `${selectedBusiness.name} (${selectedBusiness.id})` : 'None'}
  `.trim();

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: message
          }
        ]
      },
      {
        headers: {
          "Authorization": `Bearer ${cleanApiKey}`,
          "Content-Type": "application/json"
        },
        timeout: 10000
      }
    );

    return response.data.choices[0].message.content.trim();
  } catch (error) {
    logger.error("Location AI Error:", error.response?.data || error.message);
    
    // **FIX 8: Improved fallback response**
    if (selectedBusiness) {
      return `I'm here to help you with ${selectedBusiness.name}! I can help you check availability, make appointments, or answer questions. What would you like to do?`;
    } else {
      return "I'm here to help you find businesses and make appointments or orders. What would you like to do?";
    }
  }
}

// Helper functions
async function getSelectedBusiness(customerId) {
  try {
    const doc = await admin.firestore().collection('customer_sessions').doc(customerId).get();
    
    if (!doc.exists || !doc.data().selectedBusinessId) {
      return null;
    }
    
    const businessId = doc.data().selectedBusinessId;
    const businessDoc = await admin.firestore().collection('businesses').doc(businessId).get();
    
    if (!businessDoc.exists) {
      return null;
    }
    
    return {
      id: businessId,
      ...businessDoc.data()
    };
  } catch (error) {
    logger.error("Error getting selected business:", error);
    return null;
  }
}

async function setSelectedBusiness(businessId, customerId) {
  try {
    await admin.firestore().collection('customer_sessions').doc(customerId).set({
      selectedBusinessId: businessId,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (error) {
    logger.error("Error setting selected business:", error);
  }
}

// Handle service booking
async function handleServiceBooking(aiReply, customer, date) {
  try {
    logger.info(`handleServiceBooking called with: "${aiReply}"`);
    
    let bookingMatch = aiReply.match(/BOOKING:\s*(\w+):(\d{2}:\d{2})/);
    logger.info(`BOOKING regex match: ${bookingMatch}`);
    
    if (!bookingMatch) {
      // Improved regex patterns to handle various booking formats
      const patterns = [
        // Pattern 1: "book a haircut appointment at 10:00 today"
        /book.*?appointment.*?at\s*(\d{1,2}):(\d{2})\s*(am|pm)?/i,
        // Pattern 2: "book me for 10:00"
        /book.*?for\s*(\d{1,2}):(\d{2})\s*(am|pm)?/i,
        // Pattern 3: "book at 10:00"
        /book.*?at\s*(\d{1,2}):(\d{2})\s*(am|pm)?/i,
        // Pattern 4: "book 10:00" (original pattern)
        /book.*?(\d{1,2}):(\d{2})\s*(am|pm)?/i,
        // Pattern 5: "book 10" (without minutes)
        /book.*?(\d{1,2})\s*(am|pm)?/i
      ];
      
      for (const pattern of patterns) {
        bookingMatch = aiReply.match(pattern);
        if (bookingMatch) {
          logger.info(`Pattern matched: ${pattern}`);
          break;
        }
      }
    }
    
    if (bookingMatch) {
      logger.info(`Booking match found: ${bookingMatch}`);
      
      if (bookingMatch[0].includes('BOOKING:')) {
        // Handle BOOKING: format
        const [, serviceId, time] = bookingMatch;
        logger.info(`BOOKING format - service: ${serviceId}, time: ${time}`);
        
        // Get selected business
        const selectedBusiness = await getSelectedBusiness(customer);
        if (!selectedBusiness) {
          return "Please select a business first before booking an appointment.";
        }
        
        const appointmentRef = await admin.firestore().collection('appointments').add({
          businessId: selectedBusiness.id,
          serviceId,
          serviceName: serviceId,
          businessName: selectedBusiness.name || selectedBusiness.businessName,
          customerName: customer,
          customerPhone: customer,
          date,
          time,
          status: 'confirmed',
          reminderSent: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return `✅ You're booked for ${serviceId} at ${time} on ${date}. Your appointment ID is ${appointmentRef.id}. See you then!`;
      } else {
        // Handle other booking formats
        let [, hour, minute, period] = bookingMatch;
        hour = parseInt(hour);
        minute = minute ? parseInt(minute) : 0;
        
        if (period && period.toLowerCase() === 'pm' && hour !== 12) {
          hour += 12;
        } else if (period && period.toLowerCase() === 'am' && hour === 12) {
          hour = 0;
        }
        
        const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        const serviceId = 'haircut';
        
        // Get selected business
        const selectedBusiness = await getSelectedBusiness(customer);
        if (!selectedBusiness) {
          return "Please select a business first before booking an appointment.";
        }
        
        const appointmentRef = await admin.firestore().collection('appointments').add({
          businessId: selectedBusiness.id,
          serviceId,
          serviceName: serviceId,
          businessName: selectedBusiness.name || selectedBusiness.businessName,
          customerName: customer,
          customerPhone: customer,
          date,
          time,
          status: 'confirmed',
          reminderSent: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return `✅ You're booked for ${serviceId} at ${time} on ${date}. Your appointment ID is ${appointmentRef.id}. See you then!`;
      }
    } else {
      logger.info(`No booking match found for: "${aiReply}"`);
      return "❌ Sorry, I couldn't understand the booking request. Please try again.";
    }
  } catch (error) {
    logger.error("Error handling service booking", error);
    return "❌ Sorry, something went wrong booking your appointment. Please try again.";
  }
}

// Handle product order
async function handleProductOrder(aiReply, customer) {
  try {
    const orderMatch = aiReply.match(/ORDER:\s*(\w+):(\d+)/);
    if (orderMatch) {
      const [, productId, quantity] = orderMatch;
      
      // Get selected business
      const selectedBusiness = await getSelectedBusiness(customer);
      if (!selectedBusiness) {
        return "Please select a business first before placing an order.";
      }
      
      const orderRef = await admin.firestore().collection('orders').add({
        businessId: selectedBusiness.id,
        customerName: customer,
        customerPhone: customer,
        products: [{ productId, quantity: parseInt(quantity) }],
        deliveryType: 'pickup',
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return `✅ Your order has been placed! Order ID: ${orderRef.id}. Please come to pick up your order.`;
    }
    
    return "❌ Sorry, I couldn't understand the order request. Please try again.";
  } catch (error) {
    logger.error("Error handling product order", error);
    return "❌ Sorry, something went wrong with your order. Please try again.";
  }
}

// Utility function to escape XML
function escapeXml(unsafe) {
  return unsafe.replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}
