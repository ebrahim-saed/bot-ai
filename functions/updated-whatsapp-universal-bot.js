// Updated WhatsApp Universal Bot with Location-Based Business Discovery
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const axios = require("axios");

// Secrets
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const TWILIO_ACCOUNT_SID = defineSecret("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = defineSecret("TWILIO_AUTH_TOKEN");
const TWILIO_WHATSAPP_FROM = defineSecret("TWILIO_WHATSAPP_FROM");

// Updated WhatsApp Universal Bot with Location-Based Business Discovery
exports.updatedWhatsappUniversalBot = onRequest({ 
  secrets: [OPENAI_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM] 
}, async (req, res) => {
  try {
    const message = req.body.Body?.trim() || "Hi!";
    const customer = req.body.From || "Anonymous";
    const twilioNumber = req.body.To;
    
    logger.info(`Updated Universal Bot - Customer: ${customer}, Message: ${message}`);
    
    const tz = (process.env.BUSINESS_TZ || req.query.tz || 'UTC').toString();
    const today = (req.query.date || req.body.date || new Date().toLocaleDateString('en-CA', { timeZone: tz })).toString();

    // First, try to handle location-based queries
    let response = await handleLocationQuery(message, customer);
    
    if (!response) {
      // If not a location query, try to detect business ID and handle normally
      const businessId = await detectBusinessIdFromTwilio(req);
      
      if (businessId) {
        // Handle with specific business context
        const businessType = await detectBusinessType(businessId);
        let contextInfo = '';
        
        if (businessType === 'service') {
          contextInfo = await getServiceContext(businessId, today);
        } else if (businessType === 'product') {
          contextInfo = await getProductContext(businessId);
        }
        
        response = await askUniversalAI(message, businessType, contextInfo, businessId, today);
        
        // Handle special actions
        if (businessType === 'service' && response.includes("BOOKING:")) {
          response = await handleServiceBooking(response, businessId, customer, today);
        } else if (businessType === 'product' && response.includes("ORDER:")) {
          response = await handleProductOrder(response, businessId, customer);
        }
      } else {
        // No business ID detected, provide general help
        response = "Hi! I can help you find businesses by location or assist with specific business services. Try asking me 'Give me all barber shops in Haifa' or tell me which business you'd like to interact with.";
      }
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
      botType: 'updated-universal'
    });

    const safeReply = escapeXml(response);

    res.set('Content-Type', 'text/xml');
    res.status(200).send(`
      <Response>
          <Message>${safeReply}</Message>
      </Response>
    `);
  } catch (err) {
    logger.error("Error handling updated universal message", err);
    res.status(500).send("Something went wrong");
  }
});

// Handle location-based queries (copied from fixed-location-bot.js)
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
          data.name.toLowerCase().includes(businessType) || 
          data.businessName.toLowerCase().includes(businessType) ||
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

// Handle business selection
async function handleBusinessSelection(choice, customer) {
  try {
    // Get the last conversation to find the business list
    const conversations = await admin.firestore()
      .collection('conversations')
      .where('customer', '==', customer)
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();
    
    if (conversations.empty) {
      return "I don't have a business list to select from. Please search for businesses first.";
    }
    
    const lastConversation = conversations.docs[0].data();
    const reply = lastConversation.reply;
    
    // Extract business count from the reply
    const countMatch = reply.match(/I found (\d+)/);
    if (!countMatch) {
      return "I don't have a business list to select from. Please search for businesses first.";
    }
    
    const businessCount = parseInt(countMatch[1]);
    
    if (choice < 1 || choice > businessCount) {
      return `Please choose a number between 1 and ${businessCount}.`;
    }
    
    // For now, return a simple selection message
    return `Great! You've selected option ${choice}. I'm setting up your business selection. How can I help you?`;
    
  } catch (error) {
    logger.error("Error handling business selection:", error);
    return "Sorry, I couldn't process your selection. Please try again.";
  }
}

// Set selected business
async function setSelectedBusiness(businessId, customerId) {
  await admin.firestore().collection('customer_sessions').doc(customerId).set({
    selectedBusinessId: businessId,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

// Import existing functions (these would need to be copied from the main index.js)
// For now, I'll add placeholder functions

async function detectBusinessIdFromTwilio(req) {
  // This would be copied from the existing implementation
  return null; // Placeholder
}

async function detectBusinessType(businessId) {
  // This would be copied from the existing implementation
  return 'service'; // Placeholder
}

async function getServiceContext(businessId, today) {
  // This would be copied from the existing implementation
  return {}; // Placeholder
}

async function getProductContext(businessId) {
  // This would be copied from the existing implementation
  return {}; // Placeholder
}

async function askUniversalAI(message, businessType, contextInfo, businessId, today) {
  // This would be copied from the existing implementation
  return "I'm here to help you with your business needs."; // Placeholder
}

async function handleServiceBooking(aiReply, businessId, customer, today) {
  // This would be copied from the existing implementation
  return aiReply; // Placeholder
}

async function handleProductOrder(aiReply, businessId, customer) {
  // This would be copied from the existing implementation
  return aiReply; // Placeholder
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
