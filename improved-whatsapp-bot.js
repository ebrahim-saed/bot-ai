// Improved WhatsApp Bot with Business ID Detection
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

// Secrets
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const TWILIO_ACCOUNT_SID = defineSecret("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = defineSecret("TWILIO_AUTH_TOKEN");
const TWILIO_WHATSAPP_FROM = defineSecret("TWILIO_WHATSAPP_FROM");

// Twilio Number to Business ID Mapping
const TWILIO_NUMBER_TO_BUSINESS = {
  'whatsapp:+14155238886': 'barber-shop-downtown',
  'whatsapp:+14155238887': 'fresh-market',
  'whatsapp:+14155238888': 'pizza-palace',
  'whatsapp:+14155238889': 'lawyer-office',
  'whatsapp:+14155238890': 'spa-center'
};

// Business ID Detection Function
async function detectBusinessId(req) {
  try {
    const twilioNumber = req.body.To; // The number the message was sent to
    const customerPhone = req.body.From; // The customer's number
    const message = req.body.Body?.trim() || "";
    
    // Method 1: Twilio Number Mapping (Primary)
    if (twilioNumber && TWILIO_NUMBER_TO_BUSINESS[twilioNumber]) {
      logger.info(`Business ID detected from Twilio number: ${TWILIO_NUMBER_TO_BUSINESS[twilioNumber]}`);
      return TWILIO_NUMBER_TO_BUSINESS[twilioNumber];
    }
    
    // Method 2: Database Number Mapping (Secondary)
    const dbBusinessId = await getBusinessIdFromTwilioNumber(twilioNumber);
    if (dbBusinessId !== 'default') {
      logger.info(`Business ID detected from database: ${dbBusinessId}`);
      return dbBusinessId;
    }
    
    // Method 3: Customer Phone Mapping (Tertiary)
    const customerBusinessId = await getBusinessIdFromCustomer(customerPhone);
    if (customerBusinessId !== 'default') {
      logger.info(`Business ID detected from customer: ${customerBusinessId}`);
      return customerBusinessId;
    }
    
    // Method 4: Message Content Analysis (Fallback)
    const messageBusinessId = extractBusinessIdFromMessage(message);
    if (messageBusinessId !== 'default') {
      logger.info(`Business ID detected from message: ${messageBusinessId}`);
      return messageBusinessId;
    }
    
    // Method 5: URL Parameter (Legacy)
    const urlBusinessId = req.query.businessId || req.body.businessId;
    if (urlBusinessId) {
      logger.info(`Business ID detected from URL parameter: ${urlBusinessId}`);
      return urlBusinessId.toString();
    }
    
    // Default fallback
    logger.warn(`No business ID detected, using default`);
    return 'default';
    
  } catch (error) {
    logger.error("Error detecting business ID", error);
    return 'default';
  }
}

// Get business ID from Twilio number in database
async function getBusinessIdFromTwilioNumber(twilioNumber) {
  try {
    const numberDoc = await admin.firestore()
      .collection('twilio_numbers')
      .doc(twilioNumber)
      .get();
    
    if (numberDoc.exists) {
      return numberDoc.data().businessId;
    }
    
    return 'default';
  } catch (error) {
    logger.error("Error getting business ID from Twilio number", error);
    return 'default';
  }
}

// Get business ID from customer phone number
async function getBusinessIdFromCustomer(customerPhone) {
  try {
    const customerDoc = await admin.firestore()
      .collection('customer_business_mapping')
      .doc(customerPhone)
      .get();
    
    if (customerDoc.exists) {
      return customerDoc.data().businessId;
    }
    
    return 'default';
  } catch (error) {
    logger.error("Error getting business ID from customer", error);
    return 'default';
  }
}

// Extract business ID from message content
function extractBusinessIdFromMessage(message) {
  const businessKeywords = {
    'barber': 'barber-shop-downtown',
    'haircut': 'barber-shop-downtown',
    'hair': 'barber-shop-downtown',
    'market': 'fresh-market',
    'grocery': 'fresh-market',
    'food': 'fresh-market',
    'pizza': 'pizza-palace',
    'restaurant': 'pizza-palace',
    'eat': 'pizza-palace',
    'lawyer': 'lawyer-office',
    'legal': 'lawyer-office',
    'spa': 'spa-center',
    'massage': 'spa-center',
    'wellness': 'spa-center'
  };
  
  const lowerMessage = message.toLowerCase();
  for (const [keyword, businessId] of Object.entries(businessKeywords)) {
    if (lowerMessage.includes(keyword)) {
      return businessId;
    }
  }
  
  return 'default';
}

// Improved Universal WhatsApp Bot
exports.whatsappUniversalBot = onRequest({ 
  secrets: [OPENAI_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM] 
}, async (req, res) => {
  try {
    const message = req.body.Body?.trim() || "Hi!";
    const customer = req.body.From || "Anonymous";
    const twilioNumber = req.body.To; // The business's Twilio number
    
    // Detect business ID using multiple methods
    const businessId = await detectBusinessId(req);
    
    logger.info(`Processing message for business: ${businessId}, customer: ${customer}, twilio: ${twilioNumber}`);
    
    const tz = (process.env.BUSINESS_TZ || req.query.tz || 'UTC').toString();
    const today = (req.query.date || req.body.date || new Date().toLocaleDateString('en-CA', { timeZone: tz })).toString();

    // Detect business type
    const businessType = await detectBusinessType(businessId);

    // Get context based on business type
    let contextInfo = '';
    if (businessType === 'service') {
      contextInfo = await getServiceContext(businessId, today);
    } else if (businessType === 'product') {
      contextInfo = await getProductContext(businessId);
    }

    // Get AI response
    let aiReply = await askUniversalAI(message, businessType, contextInfo, businessId, today);

    // Handle special actions (booking, ordering, etc.)
    let actionReply = null;

    if (businessType === 'service' && aiReply.includes("BOOKING:")) {
      actionReply = await handleServiceBooking(aiReply, businessId, customer, today);
    } else if (businessType === 'product' && aiReply.includes("ORDER:")) {
      actionReply = await handleProductOrder(aiReply, businessId, customer);
    }

    // Use action reply if available
    if (actionReply) {
      aiReply = actionReply;
    }

    // Save conversation with business ID detection info
    await admin.firestore().collection("conversations").add({
      businessId,
      businessType,
      customer,
      twilioNumber,
      message,
      reply: aiReply,
      date: today,
      timezone: tz,
      timestamp: Date.now(),
      platform: 'whatsapp',
      businessIdDetectionMethod: 'auto-detected'
    });

    const safeReply = escapeXml(aiReply);

    res.set('Content-Type', 'text/xml');
    res.status(200).send(`
      <Response>
          <Message>${safeReply}</Message>
      </Response>
    `);
  } catch (err) {
    logger.error("Error handling WhatsApp universal message", err);
    res.status(500).send("Something went wrong");
  }
});

// Helper function to escape XML
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

// You would need to implement these functions from your existing code:
// - detectBusinessType(businessId)
// - getServiceContext(businessId, date)
// - getProductContext(businessId)
// - askUniversalAI(message, businessType, contextInfo, businessId, today)
// - handleServiceBooking(aiReply, businessId, customer, today)
// - handleProductOrder(aiReply, businessId, customer)
