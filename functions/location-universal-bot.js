// Location-Based Universal Bot
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const axios = require("axios");

// Secrets
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

// Location-Based Universal Bot
exports.locationUniversalBot = onRequest({ secrets: [OPENAI_API_KEY] }, async (req, res) => {
  try {
    const message = req.body.Body?.trim() || "Hi!";
    const customer = req.body.From || "Anonymous";
    const twilioNumber = req.body.To;
    
    logger.info(`Location Universal Bot - Customer: ${customer}, Message: ${message}`);
    
    const tz = (process.env.BUSINESS_TZ || req.query.tz || 'UTC').toString();
    const today = (req.query.date || req.body.date || new Date().toLocaleDateString('en-CA', { timeZone: tz })).toString();

    // Get AI response with location-based business discovery
    const aiReply = await askLocationUniversalAI(message, customer, today);

    // Handle special actions
    let actionReply = null;
    
    if (aiReply.includes("BOOKING:")) {
      actionReply = await handleServiceBooking(aiReply, customer, today);
    } else if (aiReply.includes("ORDER:")) {
      actionReply = await handleProductOrder(aiReply, customer);
    }

    // Use action reply if available
    if (actionReply) {
      aiReply = actionReply;
    }

    // Save conversation
    await admin.firestore().collection("conversations").add({
      customer,
      twilioNumber,
      message,
      reply: aiReply,
      date: today,
      timezone: tz,
      timestamp: Date.now(),
      platform: 'whatsapp',
      botType: 'location-universal'
    });

    const safeReply = escapeXml(aiReply);

    res.set('Content-Type', 'text/xml');
    res.status(200).send(`
      <Response>
          <Message>${safeReply}</Message>
      </Response>
    `);
  } catch (err) {
    logger.error("Error handling location universal message", err);
    res.status(500).send("Something went wrong");
  }
});

// Location-based AI function
async function askLocationUniversalAI(message, customer, date) {
  const apiKey = OPENAI_API_KEY.value();
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY secret");
  }
  
  const cleanApiKey = apiKey.trim().replace(/[^\x20-\x7E]/g, '');
  
  // Check if customer has a selected business
  const selectedBusiness = await getSelectedBusiness(customer);
  
  // Check if message is asking for location-based search
  const isLocationSearch = /(barber|hair|salon|restaurant|pharmacy|market|shop).*in\s+(\w+)/i.test(message);
  const isBusinessSearch = /(find|search|show).*(\w+)/i.test(message);
  
  let systemPrompt = `
You are a location-based universal AI assistant that helps customers find and interact with businesses.

CURRENT CUSTOMER CONTEXT:
- Customer: ${customer}
- Date: ${date}
- Selected Business: ${selectedBusiness ? selectedBusiness.name : 'None'}

CORE CAPABILITIES:
1. LOCATION-BASED BUSINESS DISCOVERY: Find businesses in specific cities/locations
2. BUSINESS SELECTION: Help customers choose from available businesses
3. SERVICE BUSINESS INTERACTIONS: Book appointments, check availability
4. PRODUCT BUSINESS INTERACTIONS: Search products, place orders

BUSINESS DISCOVERY WORKFLOW:
1. When customer asks for businesses in a location (e.g., "barber shops in Haifa"):
   - Search the businesses collection for matching businesses
   - Present a numbered list of businesses
   - Ask customer to choose one by number

2. When customer mentions a specific business name (e.g., "Downtown BarberShop"):
   - Search for that business by name
   - If found, automatically select that business
   - If multiple matches, show options to choose from

3. When customer has selected a business:
   - All subsequent interactions are with that business
   - Use appropriate tools based on business type (service/product)

RESPONSE FORMATS:
- Business Discovery: Present numbered list, ask for selection
- Business Selection: Confirm selection and show business info
- Service Booking: Use "BOOKING: SERVICE_ID:TIME" format
- Product Orders: Use "ORDER: PRODUCT_ID:QUANTITY" format

EXAMPLES:
Customer: "Give me all barber shops in Haifa"
Response: "I found 3 barber shops in Haifa:
1. Downtown BarberShop - 123 Main St, Haifa
2. Haifa Hair Studio - 456 Oak Ave, Haifa  
3. Modern Cuts - 789 Pine St, Haifa
Please choose a number (1-3) to select a barber shop."

Customer: "What are the free times in Downtown BarberShop"
Response: "Let me find Downtown BarberShop and check their availability..."

Customer: "Book me a haircut at 2 PM"
Response: "BOOKING: haircut:14:00" (if business is selected)

BEHAVIOR:
- Be friendly and helpful
- Ask clarifying questions when needed
- Provide accurate information based on available data
- Always confirm selections and actions
- Handle both service and product businesses appropriately

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
        ],
        timeout: 10000
      },
      {
        headers: {
          "Authorization": `Bearer ${cleanApiKey}`,
          "Content-Type": "application/json"
        }
      }
    );

    let aiResponse = response.data.choices[0].message.content.trim();
    
    // Handle location-based searches
    if (isLocationSearch || isBusinessSearch) {
      const searchResult = await handleLocationSearch(message, customer);
      if (searchResult) {
        aiResponse = searchResult;
      }
    }

    return aiResponse;
  } catch (error) {
    logger.error("Location OpenAI API Error:", error.response?.data || error.message);
    
    // Fallback response
    return "I'm here to help you find businesses and make appointments or orders. What would you like to do?";
  }
}

// Handle location-based searches
async function handleLocationSearch(message, customer) {
  try {
    // Extract location and business type from message
    const locationMatch = message.match(/in\s+(\w+)/i);
    const businessTypeMatch = message.match(/(barber|hair|salon|restaurant|pharmacy|market|shop)/i);
    
    if (locationMatch) {
      const location = locationMatch[1].toLowerCase();
      const businessType = businessTypeMatch ? businessTypeMatch[1].toLowerCase() : null;
      
      // Search businesses in Firebase
      let query = admin.firestore().collection('businesses')
        .where('location', '==', location);
      
      if (businessType) {
        query = query.where('businessType', '==', 'service'); // Default to service for barber/hair
      }
      
      const snapshot = await query.get();
      const businesses = [];
      
      snapshot.forEach(doc => {
        const data = doc.data();
        if (!businessType || data.name.toLowerCase().includes(businessType) || data.businessName.toLowerCase().includes(businessType)) {
          businesses.push({
            id: doc.id,
            ...data
          });
        }
      });
      
      if (businesses.length === 0) {
        return `I couldn't find any ${businessType || 'businesses'} in ${location}. Please try a different location or business type.`;
      }
      
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
    
    // Handle specific business name search
    const businessNameMatch = message.match(/(find|search|show).*?(\w+\s+\w+)/i);
    if (businessNameMatch) {
      const businessName = businessNameMatch[2];
      
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
      
      if (businesses.length === 0) {
        return `I couldn't find any business named "${businessName}". Please try a different name or check the spelling.`;
      }
      
      if (businesses.length === 1) {
        // Auto-select if only one match
        const business = businesses[0];
        await setSelectedBusiness(business.id, customer);
        return `Found "${business.name || business.businessName}"! I've selected this business for you. How can I help you with ${business.name || business.businessName}?`;
      }
      
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
    
    return null;
  } catch (error) {
    logger.error("Error in location search:", error);
    return null;
  }
}

// Helper functions
async function getSelectedBusiness(customerId) {
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
}

async function setSelectedBusiness(businessId, customerId) {
  await admin.firestore().collection('customer_sessions').doc(customerId).set({
    selectedBusinessId: businessId,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

// Handle service booking
async function handleServiceBooking(aiReply, customer, date) {
  try {
    let bookingMatch = aiReply.match(/BOOKING:\s*(\w+):(\d{2}:\d{2})/);
    
    if (!bookingMatch) {
      bookingMatch = aiReply.match(/book.*?(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
      if (bookingMatch) {
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
    }
    
    return "❌ Sorry, I couldn't understand the booking request. Please try again.";
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
