// Update whatsappUniversalBot to include location-based business discovery
const fs = require('fs');

// Read the current index.js
let content = fs.readFileSync('functions/index.js', 'utf8');

// Add location handling functions at the end of the file
const locationFunctions = `

// Location-based business discovery functions for whatsappUniversalBot
async function handleLocationQuery(message, customer) {
  try {
    // Check for location-based search patterns
    const locationPatterns = [
      /(?:give me|show me|find|search).*?(?:barber|hair|salon|restaurant|pharmacy|market|shop|business).*?in\\s+(\\w+)/i,
      /(?:barber|hair|salon|restaurant|pharmacy|market|shop).*?in\\s+(\\w+)/i,
      /in\\s+(\\w+).*?(?:barber|hair|salon|restaurant|pharmacy|market|shop)/i
    ];

    const businessNamePatterns = [
      /(?:find|search|show).*?(\\w+\\s+\\w+)/i,
      /(?:what are|check).*?(\\w+\\s+\\w+)/i
    ];

    // Check for location-based search
    for (const pattern of locationPatterns) {
      const match = message.match(pattern);
      if (match) {
        const location = match[1].toLowerCase();
        const businessType = extractBusinessType(message);
        
        logger.info(\`Location search detected: \${location}, type: \${businessType}\`);
        
        const businesses = await searchBusinessesByLocation(location, businessType);
        
        if (businesses.length === 0) {
          return \`I couldn't find any \${businessType || 'businesses'} in \${location}. Please try a different location or business type.\`;
        }
        
        let response = \`I found \${businesses.length} \${businessType || 'businesses'} in \${location}:\\n\\n\`;
        businesses.forEach((business, index) => {
          response += \`\${index + 1}. \${business.name || business.businessName || 'Unknown Business'}\\n\`;
          if (business.address) response += \`   Address: \${business.address}\\n\`;
          if (business.phone) response += \`   Phone: \${business.phone}\\n\`;
          response += \`   Type: \${business.businessType || 'service'}\\n\\n\`;
        });
        
        response += \`Please choose a number (1-\${businesses.length}) to select a business.\`;
        return response;
      }
    }

    // Check for specific business name search
    for (const pattern of businessNamePatterns) {
      const match = message.match(pattern);
      if (match) {
        const businessName = match[1];
        
        logger.info(\`Business name search detected: \${businessName}\`);
        
        const businesses = await searchBusinessesByName(businessName);
        
        if (businesses.length === 0) {
          return \`I couldn't find any business named "\${businessName}". Please try a different name or check the spelling.\`;
        }
        
        if (businesses.length === 1) {
          // Auto-select if only one match
          const business = businesses[0];
          await setSelectedBusiness(business.id, customer);
          return \`Found "\${business.name || business.businessName}"! I've selected this business for you. How can I help you with \${business.name || business.businessName}?\`;
        }
        
        let response = \`I found \${businesses.length} businesses matching "\${businessName}":\\n\\n\`;
        businesses.forEach((business, index) => {
          response += \`\${index + 1}. \${business.name || business.businessName || 'Unknown Business'}\\n\`;
          if (business.address) response += \`   Address: \${business.address}\\n\`;
          if (business.location) response += \`   Location: \${business.location}\\n\`;
          response += \`   Type: \${business.businessType || 'service'}\\n\\n\`;
        });
        
        response += \`Please choose a number (1-\${businesses.length}) to select a business.\`;
        return response;
      }
    }

    return null; // Not a location query
  } catch (error) {
    logger.error("Error in handleLocationQuery:", error);
    return null;
  }
}

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

async function setSelectedBusiness(businessId, customerId) {
  await admin.firestore().collection('customer_sessions').doc(customerId).set({
    selectedBusinessId: businessId,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}
`;

// Add the functions to the end of the file
content += locationFunctions;

// Now update the whatsappUniversalBot function to use location handling
const oldFunctionStart = 'exports.whatsappUniversalBot = onRequest({ secrets: [OPENAI_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM] }, async (req, res) => {';
const newFunctionStart = `exports.whatsappUniversalBot = onRequest({ secrets: [OPENAI_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM] }, async (req, res) => {
  try {
    const message = req.body.Body?.trim() || "Hi!";
    const customer = req.body.From || "Anonymous";
    const twilioNumber = req.body.To;
    
    logger.info(\`Universal Bot - Customer: \${customer}, Message: \${message}\`);
    const tz = (process.env.BUSINESS_TZ || req.query.tz || 'UTC').toString();
    const today = (req.query.date || req.body.date || new Date().toLocaleDateString('en-CA', { timeZone: tz })).toString();

    // First, try to handle location-based queries
    let locationResponse = await handleLocationQuery(message, customer);
    
    if (locationResponse) {
      // Save conversation with location search info
      await admin.firestore().collection("conversations").add({
        customer,
        twilioNumber,
        message,
        reply: locationResponse,
        date: today,
        timezone: tz,
        timestamp: Date.now(),
        platform: 'whatsapp',
        botType: 'universal-location'
      });

      const safeReply = escapeXml(locationResponse);
      res.set('Content-Type', 'text/xml');
      res.status(200).send(\`
        <Response>
            <Message>\${safeReply}</Message>
        </Response>
      \`);
      return;
    }
    
    // If not a location query, continue with existing logic`;

// Replace the function
content = content.replace(oldFunctionStart, newFunctionStart);

// Write the updated content
fs.writeFileSync('functions/index.js', content);

console.log('✅ Successfully updated whatsappUniversalBot with location-based business discovery!');
