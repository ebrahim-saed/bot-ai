// Simple MCP-Based Location Bot
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const axios = require("axios");

// Secrets
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

// Simple MCP-Based Location Bot
exports.simpleMCPBot = onRequest({ secrets: [OPENAI_API_KEY] }, async (req, res) => {
  try {
    const message = req.body.Body?.trim() || "Hi!";
    const customer = req.body.From || "Anonymous";
    const twilioNumber = req.body.To;
    
    logger.info(`Simple MCP Bot - Customer: ${customer}, Message: ${message}`);
    
    const tz = (process.env.BUSINESS_TZ || req.query.tz || 'UTC').toString();
    const today = (req.query.date || req.body.date || new Date().toLocaleDateString('en-CA', { timeZone: tz })).toString();

    // Get AI response using MCP-style tool calling
    const aiReply = await askMCPAI(message, customer, today);

    // Handle special actions
    let actionReply = null;
    
    if (aiReply.includes("BOOKING:")) {
      actionReply = await handleServiceBooking(aiReply, customer, today);
    } else if (aiReply.includes("ORDER:")) {
      actionReply = await handleProductOrder(aiReply, customer);
    }

    // Use action reply if available
    const finalReply = actionReply || aiReply;

    // Save conversation
    await admin.firestore().collection("conversations").add({
      customer,
      twilioNumber,
      message,
      reply: finalReply,
      date: today,
      timezone: tz,
      timestamp: Date.now(),
      platform: 'whatsapp',
      botType: 'simple-mcp'
    });

    const safeReply = escapeXml(finalReply);

    res.set('Content-Type', 'text/xml');
    res.status(200).send(`
      <Response>
          <Message>${safeReply}</Message>
      </Response>
    `);
  } catch (err) {
    logger.error("Error handling simple MCP message", err);
    res.status(500).send("Something went wrong");
  }
});

// MCP-style AI function with tool calling
async function askMCPAI(message, customer, date) {
  const apiKey = OPENAI_API_KEY.value();
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY secret");
  }
  
  const cleanApiKey = apiKey.trim().replace(/[^\x20-\x7E]/g, '');
  
  // Check if customer has a selected business
  const selectedBusiness = await getSelectedBusiness(customer);
  
  let systemPrompt = `
You are an MCP-powered universal AI assistant that helps customers find and interact with businesses using advanced tools.

CURRENT CUSTOMER CONTEXT:
- Customer: ${customer}
- Date: ${date}
- Selected Business: ${selectedBusiness ? selectedBusiness.name : 'None'}

AVAILABLE TOOLS:
1. search_businesses_by_location(location, businessType) - Find businesses in a specific city/location
2. search_businesses_by_name(businessName, location) - Find a specific business by name
3. set_selected_business(businessId, customerId) - Set the currently selected business
4. get_selected_business(customerId) - Get the currently selected business
5. detect_business_type(businessId) - Detect if a business is service-based or product-based
6. get_available_appointments(businessId, serviceId, date) - Get available appointment slots
7. book_appointment(businessId, serviceId, customerName, customerPhone, date, time) - Book an appointment
8. search_products(businessId, query, category) - Search for products
9. place_product_order(businessId, customerName, customerPhone, products, deliveryType) - Place an order

WORKFLOW:
1. When customer asks for businesses in a location (e.g., "barber shops in Haifa"):
   - Use search_businesses_by_location tool
   - Present results in a friendly format
   - Ask customer to choose one

2. When customer mentions a specific business name (e.g., "Downtown BarberShop"):
   - Use search_businesses_by_name tool
   - If found, use set_selected_business to select it
   - Confirm selection and show business info

3. When customer has selected a business:
   - All subsequent interactions are with that business
   - Use appropriate tools based on business type (service/product)

4. For appointments: Use get_available_appointments and book_appointment
5. For products: Use search_products and place_product_order

BEHAVIOR:
- Be friendly and helpful
- Use the tools to get real-time data
- Ask clarifying questions when needed
- Provide accurate information based on tool results
- Always confirm selections and actions

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
    logger.error("MCP OpenAI API Error:", error.response?.data || error.message);
    
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

// Tool implementations
async function searchBusinessesByLocation(args) {
  const { location, businessType } = args;
  
  try {
    let query = admin.firestore().collection('businesses')
      .where('location', '==', location.toLowerCase());
    
    const snapshot = await query.get();
    const businesses = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      if (!businessType || 
          data.name.toLowerCase().includes(businessType.toLowerCase()) || 
          data.businessName.toLowerCase().includes(businessType.toLowerCase()) ||
          data.businessType === 'service') {
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
  } catch (error) {
    logger.error("Error searching businesses by location:", error);
    return "Sorry, I couldn't search for businesses. Please try again.";
  }
}

async function searchBusinessesByName(args) {
  const { businessName, location } = args;
  
  try {
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
  } catch (error) {
    logger.error("Error searching businesses by name:", error);
    return "Sorry, I couldn't search for businesses. Please try again.";
  }
}

async function setSelectedBusiness(args) {
  const { businessId, customerId } = args;
  
  try {
    await admin.firestore().collection('customer_sessions').doc(customerId).set({
      selectedBusinessId: businessId,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    const businessDoc = await admin.firestore().collection('businesses').doc(businessId).get();
    const business = businessDoc.data();
    
    return `Great! I've selected "${business.name || business.businessName}" for you. How can I help you with ${business.name || business.businessName}?`;
  } catch (error) {
    logger.error("Error setting selected business:", error);
    return "Sorry, I couldn't select that business. Please try again.";
  }
}

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

async function detectBusinessType(args) {
  const { businessId } = args;
  
  try {
    const doc = await admin.firestore().collection('businesses').doc(businessId).get();
    
    if (!doc.exists) {
      return `Business with ID ${businessId} not found`;
    }
    
    const businessData = doc.data();
    return `This is a ${businessData.businessType || 'service'} business: ${businessData.name || businessData.businessName || 'Unknown'}`;
  } catch (error) {
    logger.error("Error detecting business type:", error);
    return "Sorry, I couldn't detect the business type. Please try again.";
  }
}

async function getAvailableAppointments(args) {
  const { businessId, serviceId, date } = args;
  
  try {
    // Simplified availability check
    return `Here are the available time slots for ${date}:
- 09:00 - 09:30
- 10:00 - 10:30
- 14:00 - 14:30
- 15:00 - 15:30
- 16:00 - 16:30

Please let me know which time slot you'd prefer.`;
  } catch (error) {
    logger.error("Error getting available appointments:", error);
    return "Sorry, I couldn't get the available appointments. Please try again.";
  }
}

async function bookAppointment(args) {
  const { businessId, serviceId, customerName, customerPhone, date, time } = args;
  
  try {
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
  } catch (error) {
    logger.error("Error booking appointment:", error);
    return "Sorry, I couldn't book your appointment. Please try again.";
  }
}

async function searchProducts(args) {
  const { businessId, query, category } = args;
  
  try {
    // Simplified product search
    return `I found these products matching "${query}":
- Product 1 - $10.00 (In Stock)
- Product 2 - $15.00 (In Stock)
- Product 3 - $20.00 (Low Stock)

Would you like to order any of these products?`;
  } catch (error) {
    logger.error("Error searching products:", error);
    return "Sorry, I couldn't search for products. Please try again.";
  }
}

async function placeProductOrder(args) {
  const { businessId, customerName, customerPhone, products, deliveryType } = args;
  
  try {
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
  } catch (error) {
    logger.error("Error placing product order:", error);
    return "Sorry, I couldn't place your order. Please try again.";
  }
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
