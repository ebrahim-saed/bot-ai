// Enhanced Universal AI Bot with Location-Based Business Discovery
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const axios = require("axios");

// Secrets
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

// Enhanced Universal AI Bot with Location-Based Business Discovery
exports.enhancedUniversalBot = onRequest({ secrets: [OPENAI_API_KEY] }, async (req, res) => {
  try {
    const message = req.body.Body?.trim() || "Hi!";
    const customer = req.body.From || "Anonymous";
    const twilioNumber = req.body.To; // The business's Twilio number
    
    logger.info(`Enhanced Universal Bot - Customer: ${customer}, Message: ${message}`);
    
    const tz = (process.env.BUSINESS_TZ || req.query.tz || 'UTC').toString();
    const today = (req.query.date || req.body.date || new Date().toLocaleDateString('en-CA', { timeZone: tz })).toString();

    // Get AI response with enhanced location-based business discovery
    const aiReply = await askEnhancedUniversalAI(message, customer, today);

    // Handle special actions (booking, ordering, etc.)
    let actionReply = null;
    
    if (aiReply.includes("BOOKING:")) {
      actionReply = await handleServiceBooking(aiReply, customer, today);
    } else if (aiReply.includes("ORDER:")) {
      actionReply = await handleProductOrder(aiReply, customer);
    } else if (aiReply.includes("SELECT_BUSINESS:")) {
      actionReply = await handleBusinessSelection(aiReply, customer);
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
      botType: 'enhanced-universal'
    });

    const safeReply = escapeXml(aiReply);

    res.set('Content-Type', 'text/xml');
    res.status(200).send(`
      <Response>
          <Message>${safeReply}</Message>
      </Response>
    `);
  } catch (err) {
    logger.error("Error handling enhanced universal message", err);
    res.status(500).send("Something went wrong");
  }
});

// Enhanced AI function with location-based business discovery
async function askEnhancedUniversalAI(message, customer, date) {
  const apiKey = OPENAI_API_KEY.value();
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY secret");
  }
  
  const cleanApiKey = apiKey.trim().replace(/[^\x20-\x7E]/g, '');
  
  // Check if customer has a selected business
  const selectedBusiness = await getSelectedBusiness(customer);
  
  let systemPrompt = `
You are an enhanced universal AI assistant that can help customers find and interact with businesses based on location and business type.

CORE CAPABILITIES:
1. LOCATION-BASED BUSINESS DISCOVERY: Find businesses in specific cities/locations
2. BUSINESS SELECTION: Help customers choose from available businesses
3. SERVICE BUSINESS INTERACTIONS: Book appointments, check availability, manage services
4. PRODUCT BUSINESS INTERACTIONS: Search products, place orders, check inventory

CURRENT CUSTOMER CONTEXT:
- Customer: ${customer}
- Date: ${date}
- Selected Business: ${selectedBusiness ? selectedBusiness.name : 'None'}

BUSINESS DISCOVERY WORKFLOW:
1. When customer asks for businesses in a location (e.g., "barber shops in Haifa"):
   - Use search_businesses_by_location tool
   - Present a numbered list of businesses
   - Ask customer to choose one by number

2. When customer mentions a specific business name (e.g., "Downtown BarberShop"):
   - Use search_businesses_by_name tool
   - If found, automatically select that business
   - If multiple matches, show options to choose from

3. When customer has selected a business:
   - All subsequent interactions are with that business
   - Use appropriate tools based on business type (service/product)

TOOL USAGE GUIDELINES:
- search_businesses_by_location: For location-based searches
- search_businesses_by_name: For specific business name searches
- set_selected_business: When customer chooses a business
- get_selected_business: To check current selection
- detect_business_type: To determine if business is service or product
- get_available_appointments: For service businesses
- book_appointment: For service businesses
- search_products: For product businesses
- place_product_order: For product businesses

RESPONSE FORMATS:
- Business Discovery: Present numbered list, ask for selection
- Business Selection: Confirm selection and show business info
- Service Booking: Use "BOOKING: SERVICE_ID:TIME" format
- Product Orders: Use "ORDER: PRODUCT_ID:QUANTITY" format
- Business Selection: Use "SELECT_BUSINESS: BUSINESS_ID" format

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
- Use the MCP tools to get real-time data

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
        tools: [
          {
            type: "function",
            function: {
              name: "search_businesses_by_location",
              description: "Search for businesses in a specific location/city",
              parameters: {
                type: "object",
                properties: {
                  location: { type: "string", description: "City or location name" },
                  businessType: { type: "string", description: "Type of business (optional)" }
                },
                required: ["location"]
              }
            }
          },
          {
            type: "function",
            function: {
              name: "search_businesses_by_name",
              description: "Search for a specific business by name",
              parameters: {
                type: "object",
                properties: {
                  businessName: { type: "string", description: "Business name or partial name" },
                  location: { type: "string", description: "Optional location to narrow search" }
                },
                required: ["businessName"]
              }
            }
          },
          {
            type: "function",
            function: {
              name: "set_selected_business",
              description: "Set the currently selected business for conversation context",
              parameters: {
                type: "object",
                properties: {
                  businessId: { type: "string", description: "Business ID to set as selected" },
                  customerId: { type: "string", description: "Customer ID or phone number" }
                },
                required: ["businessId", "customerId"]
              }
            }
          },
          {
            type: "function",
            function: {
              name: "get_selected_business",
              description: "Get the currently selected business for a customer",
              parameters: {
                type: "object",
                properties: {
                  customerId: { type: "string", description: "Customer ID or phone number" }
                },
                required: ["customerId"]
              }
            }
          },
          {
            type: "function",
            function: {
              name: "detect_business_type",
              description: "Detect if a business is service-based or product-based",
              parameters: {
                type: "object",
                properties: {
                  businessId: { type: "string", description: "Business ID" }
                },
                required: ["businessId"]
              }
            }
          },
          {
            type: "function",
            function: {
              name: "get_available_appointments",
              description: "Get available appointment slots for service businesses",
              parameters: {
                type: "object",
                properties: {
                  businessId: { type: "string", description: "Business ID" },
                  serviceId: { type: "string", description: "Service ID" },
                  date: { type: "string", description: "Date in YYYY-MM-DD format" }
                },
                required: ["businessId", "date"]
              }
            }
          },
          {
            type: "function",
            function: {
              name: "book_appointment",
              description: "Book an appointment for service businesses",
              parameters: {
                type: "object",
                properties: {
                  businessId: { type: "string", description: "Business ID" },
                  serviceId: { type: "string", description: "Service ID" },
                  customerName: { type: "string", description: "Customer name" },
                  customerPhone: { type: "string", description: "Customer phone" },
                  date: { type: "string", description: "Date in YYYY-MM-DD format" },
                  time: { type: "string", description: "Time in HH:mm format" }
                },
                required: ["businessId", "serviceId", "customerName", "customerPhone", "date", "time"]
              }
            }
          },
          {
            type: "function",
            function: {
              name: "search_products",
              description: "Search for products by name or category",
              parameters: {
                type: "object",
                properties: {
                  businessId: { type: "string", description: "Business ID" },
                  query: { type: "string", description: "Search query" },
                  category: { type: "string", description: "Product category (optional)" }
                },
                required: ["businessId", "query"]
              }
            }
          },
          {
            type: "function",
            function: {
              name: "place_product_order",
              description: "Place an order for products",
              parameters: {
                type: "object",
                properties: {
                  businessId: { type: "string", description: "Business ID" },
                  customerName: { type: "string", description: "Customer name" },
                  customerPhone: { type: "string", description: "Customer phone" },
                  products: { 
                    type: "array", 
                    description: "Array of products with quantities",
                    items: {
                      type: "object",
                      properties: {
                        productId: { type: "string" },
                        quantity: { type: "number" }
                      }
                    }
                  },
                  deliveryType: { type: "string", description: "pickup or delivery" }
                },
                required: ["businessId", "customerName", "customerPhone", "products"]
              }
            }
          }
        ],
        tool_choice: "auto"
      },
      {
        headers: {
          "Authorization": `Bearer ${cleanApiKey}`,
          "Content-Type": "application/json"
        },
        timeout: 15000
      }
    );

    // Handle tool calls if present
    const message = response.data.choices[0].message;
    if (message.tool_calls) {
      let finalResponse = message.content || "";
      
      for (const toolCall of message.tool_calls) {
        const toolResult = await executeToolCall(toolCall, customer, date);
        finalResponse += "\n\n" + toolResult;
      }
      
      return finalResponse;
    }

    return message.content.trim();
  } catch (error) {
    logger.error("Enhanced OpenAI API Error:", error.response?.data || error.message);
    
    // Fallback response
    return "I'm here to help you find businesses and make appointments or orders. What would you like to do?";
  }
}

// Execute tool calls
async function executeToolCall(toolCall, customer, date) {
  const { name, arguments: args } = toolCall.function;
  
  try {
    switch (name) {
      case 'search_businesses_by_location':
        return await searchBusinessesByLocation(args);
      case 'search_businesses_by_name':
        return await searchBusinessesByName(args);
      case 'set_selected_business':
        return await setSelectedBusiness(args);
      case 'get_selected_business':
        return await getSelectedBusiness(args);
      case 'detect_business_type':
        return await detectBusinessType(args);
      case 'get_available_appointments':
        return await getAvailableAppointments(args);
      case 'book_appointment':
        return await bookAppointment(args);
      case 'search_products':
        return await searchProducts(args);
      case 'place_product_order':
        return await placeProductOrder(args);
      default:
        return `Tool ${name} not implemented yet.`;
    }
  } catch (error) {
    logger.error(`Tool call error for ${name}:`, error);
    return `Sorry, I encountered an error with ${name}. Please try again.`;
  }
}

// Tool implementations (simplified versions)
async function searchBusinessesByLocation(args) {
  const { location, businessType } = args;
  
  // Search in businesses collection
  let query = admin.firestore().collection('businesses')
    .where('location', '==', location.toLowerCase());
  
  if (businessType) {
    query = query.where('businessType', '==', businessType.toLowerCase());
  }
  
  const snapshot = await query.get();
  const businesses = [];
  
  snapshot.forEach(doc => {
    businesses.push({
      id: doc.id,
      ...doc.data()
    });
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

async function searchBusinessesByName(args) {
  const { businessName, location } = args;
  
  let query = admin.firestore().collection('businesses');
  const snapshot = await query.get();
  const businesses = [];
  
  snapshot.forEach(doc => {
    const data = doc.data();
    const name = data.name || data.businessName || '';
    const businessLocation = data.location || '';
    
    if (name.toLowerCase().includes(businessName.toLowerCase())) {
      if (!location || businessLocation.toLowerCase().includes(location.toLowerCase())) {
        businesses.push({
          id: doc.id,
          ...data
        });
      }
    }
  });
  
  if (businesses.length === 0) {
    return `I couldn't find any business named "${businessName}"${location ? ` in ${location}` : ''}. Please try a different name or check the spelling.`;
  }
  
  if (businesses.length === 1) {
    // Auto-select if only one match
    const business = businesses[0];
    await setSelectedBusiness({ businessId: business.id, customerId: args.customerId });
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

async function setSelectedBusiness(args) {
  const { businessId, customerId } = args;
  
  await admin.firestore().collection('customer_sessions').doc(customerId).set({
    selectedBusinessId: businessId,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  
  const businessDoc = await admin.firestore().collection('businesses').doc(businessId).get();
  const business = businessDoc.data();
  
  return `Great! I've selected "${business.name || business.businessName}" for you. How can I help you with ${business.name || business.businessName}?`;
}

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

async function detectBusinessType(args) {
  const { businessId } = args;
  
  const doc = await admin.firestore().collection('businesses').doc(businessId).get();
  
  if (!doc.exists) {
    throw new Error(`Business with ID ${businessId} not found`);
  }
  
  const businessData = doc.data();
  return businessData.businessType || 'service';
}

async function getAvailableAppointments(args) {
  const { businessId, serviceId, date } = args;
  
  // Simplified availability check
  return `Here are the available time slots for ${date}:
- 09:00 - 09:30
- 10:00 - 10:30
- 14:00 - 14:30
- 15:00 - 15:30
- 16:00 - 16:30

Please let me know which time slot you'd prefer.`;
}

async function bookAppointment(args) {
  const { businessId, serviceId, customerName, customerPhone, date, time } = args;
  
  // Create appointment
  const appointmentRef = await admin.firestore().collection('appointments').add({
    businessId,
    serviceId,
    customerName,
    customerPhone,
    date,
    time,
    status: 'confirmed',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  
  return `✅ You're booked for ${serviceId} at ${time} on ${date}. Your appointment ID is ${appointmentRef.id}. See you then!`;
}

async function searchProducts(args) {
  const { businessId, query, category } = args;
  
  // Simplified product search
  return `I found these products matching "${query}":
- Product 1 - $10.00 (In Stock)
- Product 2 - $15.00 (In Stock)
- Product 3 - $20.00 (Low Stock)

Would you like to order any of these products?`;
}

async function placeProductOrder(args) {
  const { businessId, customerName, customerPhone, products, deliveryType } = args;
  
  // Create order
  const orderRef = await admin.firestore().collection('orders').add({
    businessId,
    customerName,
    customerPhone,
    products,
    deliveryType: deliveryType || 'pickup',
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  
  return `✅ Your order has been placed! Order ID: ${orderRef.id}. ${deliveryType === 'delivery' ? 'We will deliver to you.' : 'Please come to pick up your order.'}`;
}

// Handle business selection from numbered list
async function handleBusinessSelection(aiReply, customer) {
  try {
    const match = aiReply.match(/SELECT_BUSINESS:\s*(\w+)/);
    if (match) {
      const businessId = match[1];
      await setSelectedBusiness({ businessId, customerId: customer });
      return `Great! I've selected this business for you. How can I help you?`;
    }
  } catch (error) {
    logger.error("Error handling business selection", error);
    return "Sorry, I couldn't select that business. Please try again.";
  }
  return null;
}

// Handle service booking (existing function)
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

// Handle product order (existing function)
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
