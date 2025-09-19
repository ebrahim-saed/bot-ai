// Balanced Barber Bot - Smart OpenAI usage with direct logic
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

// Balanced Barber Bot - Smart OpenAI usage
exports.balancedBarberBot = onRequest({ 
  secrets: [OPENAI_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM] 
}, async (req, res) => {
  try {
    const message = req.body.Body?.trim() || "Hi!";
    const customer = req.body.From || "Anonymous";
    const twilioNumber = req.body.To;
    
    logger.info(`Balanced Barber Bot - Customer: ${customer}, Message: ${message}`);
    
    const tz = (process.env.BUSINESS_TZ || req.query.tz || 'UTC').toString();
    const today = (req.query.date || req.body.date || new Date().toLocaleDateString('en-CA', { timeZone: tz })).toString();

    // Step 1: Check if customer has a selected barber
    let selectedBarber = await getSelectedBarber(customer);
    
    // Step 2: If no selected barber, try to identify barber from message
    if (!selectedBarber) {
      selectedBarber = await identifyBarberFromMessage(message);
    }
    
    // Step 3: Handle discovery flow (NO OpenAI needed)
    if (!selectedBarber) {
      const discoveryResponse = await handleBarberDiscovery(message, customer);
      if (discoveryResponse) {
        await saveConversation(customer, twilioNumber, message, discoveryResponse, today, tz, 'discovery');
        const safeReply = escapeXml(discoveryResponse);
        res.set('Content-Type', 'text/xml');
        res.status(200).send(`
          <Response>
              <Message>${safeReply}</Message>
          </Response>
        `);
        return;
      }
    }
    
    // Step 4: Handle barber selection (NO OpenAI needed)
    if (!selectedBarber) {
      const selectionResponse = await handleBarberSelection(message, customer);
      if (selectionResponse) {
        await saveConversation(customer, twilioNumber, message, selectionResponse, today, tz, 'selection');
        const safeReply = escapeXml(selectionResponse);
        res.set('Content-Type', 'text/xml');
        res.status(200).send(`
          <Response>
              <Message>${safeReply}</Message>
          </Response>
        `);
        return;
      }
    }
    
    // Step 5: Handle barber-specific operations with smart logic
    if (selectedBarber) {
      const barberResponse = await handleBarberOperationsSmart(message, selectedBarber, customer, today);
      await saveConversation(customer, twilioNumber, message, barberResponse, today, tz, 'barber-operations', selectedBarber.id);
      const safeReply = escapeXml(barberResponse);
      res.set('Content-Type', 'text/xml');
      res.status(200).send(`
        <Response>
            <Message>${safeReply}</Message>
        </Response>
      `);
      return;
    }
    
    // Step 6: Fallback (NO OpenAI needed)
    const fallbackResponse = "Hi! I'm your barber assistant. You can ask me to:\n• Show barbers in a city: 'Show me all barbers in Haifa'\n• Ask about a specific barber: 'What are the free times at Downtown BarberShop?'\n• Book an appointment: 'Book me a haircut at 2 PM'\n\nHow can I help you today?";
    await saveConversation(customer, twilioNumber, message, fallbackResponse, today, tz, 'fallback');
    const safeReply = escapeXml(fallbackResponse);
    res.set('Content-Type', 'text/xml');
    res.status(200).send(`
      <Response>
          <Message>${safeReply}</Message>
      </Response>
    `);
    
  } catch (err) {
    logger.error("Error in Balanced Barber Bot", err);
    res.status(500).send("Something went wrong");
  }
});

// Get selected barber for customer
async function getSelectedBarber(customerId) {
  try {
    const sessionDoc = await admin.firestore()
      .collection('customer_sessions')
      .doc(customerId)
      .get();
    
    if (sessionDoc.exists) {
      const sessionData = sessionDoc.data();
      if (sessionData.selectedBarberId) {
        const barberDoc = await admin.firestore()
          .collection('businesses')
          .doc(sessionData.selectedBarberId)
          .get();
        
        if (barberDoc.exists) {
          return {
            id: sessionData.selectedBarberId,
            ...barberDoc.data()
          };
        }
      }
    }
    
    return null;
  } catch (error) {
    logger.error("Error getting selected barber:", error);
    return null;
  }
}

// Identify barber from message content
async function identifyBarberFromMessage(message) {
  try {
    const barbersSnapshot = await admin.firestore()
      .collection('businesses')
      .where('businessType', '==', 'service')
      .get();
    
    const barbers = [];
    barbersSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.name && (
        data.name.toLowerCase().includes('barber') ||
        data.name.toLowerCase().includes('hair') ||
        data.name.toLowerCase().includes('salon') ||
        data.businessName && (
          data.businessName.toLowerCase().includes('barber') ||
          data.businessName.toLowerCase().includes('hair') ||
          data.businessName.toLowerCase().includes('salon')
        )
      )) {
        barbers.push({
          id: doc.id,
          ...data
        });
      }
    });
    
    const lowerMessage = message.toLowerCase();
    for (const barber of barbers) {
      const barberName = (barber.name || barber.businessName || '').toLowerCase();
      if (barberName && lowerMessage.includes(barberName)) {
        logger.info(`Barber identified from message: ${barberName}`);
        return barber;
      }
    }
    
    return null;
  } catch (error) {
    logger.error("Error identifying barber from message:", error);
    return null;
  }
}

// Handle barber discovery flow (NO OpenAI)
async function handleBarberDiscovery(message, customer) {
  try {
    const locationPatterns = [
      /(?:give me|show me|find|search).*?(?:barber|hair|salon).*?in\s+(\w+)/i,
      /(?:barber|hair|salon).*?in\s+(\w+)/i,
      /in\s+(\w+).*?(?:barber|hair|salon)/i
    ];

    for (const pattern of locationPatterns) {
      const match = message.match(pattern);
      if (match) {
        const location = match[1].toLowerCase();
        
        logger.info(`Barber discovery search detected: ${location}`);
        
        const barbers = await searchBarbersByLocation(location);
        
        if (barbers.length === 0) {
          return `I couldn't find any barber shops in ${location}. Please try a different location.`;
        }
        
        let response = `I found ${barbers.length} barber shops in ${location}:\n\n`;
        barbers.forEach((barber, index) => {
          response += `${index + 1}. ${barber.name || barber.businessName || 'Unknown Barber'}\n`;
          if (barber.address) response += `   Address: ${barber.address}\n`;
          if (barber.phone) response += `   Phone: ${barber.phone}\n\n`;
        });
        
        response += `Please choose a number (1-${barbers.length}) to select a barber shop.`;
        
        await admin.firestore().collection('customer_sessions').doc(customer).set({
          pendingBarberSelection: barbers,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        return response;
      }
    }

    return null;
  } catch (error) {
    logger.error("Error in handleBarberDiscovery:", error);
    return null;
  }
}

// Handle barber selection (NO OpenAI)
async function handleBarberSelection(message, customer) {
  try {
    const numberMatch = message.match(/^(\d+)$/);
    if (!numberMatch) {
      return null;
    }
    
    const choice = parseInt(numberMatch[1]);
    
    const sessionDoc = await admin.firestore()
      .collection('customer_sessions')
      .doc(customer)
      .get();
    
    if (!sessionDoc.exists || !sessionDoc.data().pendingBarberSelection) {
      return "I don't have a barber list to select from. Please search for barbers first.";
    }
    
    const barbers = sessionDoc.data().pendingBarberSelection;
    
    if (choice < 1 || choice > barbers.length) {
      return `Please choose a number between 1 and ${barbers.length}.`;
    }
    
    const selectedBarber = barbers[choice - 1];
    
    await admin.firestore().collection('customer_sessions').doc(customer).set({
      selectedBarberId: selectedBarber.id,
      selectedBarberName: selectedBarber.name || selectedBarber.businessName,
      pendingBarberSelection: admin.firestore.FieldValue.delete(),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    return `Great! I've selected "${selectedBarber.name || selectedBarber.businessName}" for you. How can I help you with this barber shop? You can ask about:\n• Available times\n• Book an appointment\n• Working hours\n• Services offered`;
    
  } catch (error) {
    logger.error("Error handling barber selection:", error);
    return "Sorry, I couldn't process your selection. Please try again.";
  }
}

// Smart barber operations - Direct logic first, OpenAI only when needed
async function handleBarberOperationsSmart(message, barber, customer, today) {
  try {
    const context = await getBarberContext(barber.id, today);
    const lowerMessage = message.toLowerCase();
    
    // DIRECT LOGIC - NO OpenAI needed for these common queries
    
    // Working hours query
    if (lowerMessage.includes('working hours') || lowerMessage.includes('hours')) {
      if (context.workingHours && context.workingHours.timeSlots) {
        let response = `Working hours for ${barber.name || barber.businessName}:\n\n`;
        context.workingHours.timeSlots.forEach(slot => {
          response += `• ${slot.start} - ${slot.end}\n`;
        });
        return response;
      } else {
        return `Working hours for ${barber.name || barber.businessName} are not set for today. Please contact the barber shop directly for their hours.`;
      }
    }
    
    // Available times query
    if (lowerMessage.includes('available times') || lowerMessage.includes('free times') || lowerMessage.includes('when are you free')) {
      if (context.availableSlots && context.availableSlots.length > 0) {
        let response = `Available times for ${barber.name || barber.businessName} today:\n\n`;
        const timeGroups = {};
        context.availableSlots.forEach(time => {
          const hour = time.split(':')[0];
          if (!timeGroups[hour]) timeGroups[hour] = [];
          timeGroups[hour].push(time);
        });
        
        Object.keys(timeGroups).sort().forEach(hour => {
          response += `${hour}:00 - ${timeGroups[hour].join(', ')}\n`;
        });
        
        response += `\nPlease let me know which time you'd like to book!`;
        return response;
      } else {
        return `Sorry, there are no available time slots for ${barber.name || barber.businessName} today. Please try another day or contact the barber shop directly.`;
      }
    }
    
    // Specific time availability check
    const timeMatch = lowerMessage.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/);
    if (timeMatch && (lowerMessage.includes('book') || lowerMessage.includes('available') || lowerMessage.includes('free'))) {
      let [, hour, minute, period] = timeMatch;
      hour = parseInt(hour);
      minute = minute ? parseInt(minute) : 0;
      
      // Convert to 24-hour format
      if (period && period.toLowerCase() === 'pm' && hour !== 12) {
        hour += 12;
      } else if (period && period.toLowerCase() === 'am' && hour === 12) {
        hour = 0;
      }
      
      const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      
      if (context.availableSlots && context.availableSlots.includes(timeStr)) {
        return `Yes! ${timeStr} is available at ${barber.name || barber.businessName}. Would you like me to book this appointment for you? Just say "yes" to confirm.`;
      } else {
        return `Sorry, ${timeStr} is not available at ${barber.name || barber.businessName}. Here are the available times:\n\n${context.availableSlots ? context.availableSlots.join(', ') : 'No times available'}`;
      }
    }
    
    // Services query
    if (lowerMessage.includes('services') || lowerMessage.includes('what do you offer')) {
      if (context.services && context.services.length > 0) {
        let response = `Services offered at ${barber.name || barber.businessName}:\n\n`;
        context.services.forEach(service => {
          response += `• ${service.name || service.id}\n`;
          if (service.price) response += `  Price: $${service.price}\n`;
          if (service.duration) response += `  Duration: ${service.duration} minutes\n`;
          response += `\n`;
        });
        return response;
      } else {
        return `Services for ${barber.name || barber.businessName} are not currently listed. Please contact the barber shop directly for available services.`;
      }
    }
    
    // Simple booking requests
    if (lowerMessage.includes('book') && (lowerMessage.includes('haircut') || lowerMessage.includes('appointment'))) {
      return `I can help you book an appointment at ${barber.name || barber.businessName}. Please specify:\n• What service you need (haircut, beard trim, etc.)\n• What time you prefer\n\nFor example: "Book me a haircut at 2 PM"`;
    }
    
    // COMPLEX QUERIES - Use OpenAI for these
    if (isComplexQuery(message)) {
      logger.info(`Using OpenAI for complex query: ${message}`);
      return await askBarberAI(message, barber, context, today);
    }
    
    // Default response for selected barber
    return `I'm here to help you with ${barber.name || barber.businessName}. You can ask about:\n• Available times\n• Working hours\n• Services offered\n• Book an appointment\n\nWhat would you like to know?`;
    
  } catch (error) {
    logger.error("Error handling barber operations:", error);
    return "Sorry, I'm having trouble processing your request. Please try again.";
  }
}

// Determine if query needs OpenAI
function isComplexQuery(message) {
  const lowerMessage = message.toLowerCase();
  
  // Complex queries that need AI understanding
  const complexPatterns = [
    /can you help me with/i,
    /i need advice/i,
    /what would you recommend/i,
    /how long does/i,
    /what's the difference between/i,
    /tell me about/i,
    /explain/i,
    /why/i,
    /how much does it cost/i,
    /what's included/i
  ];
  
  // Check if message contains complex patterns
  for (const pattern of complexPatterns) {
    if (pattern.test(message)) {
      return true;
    }
  }
  
  // Check message length and complexity
  if (message.length > 50 && (lowerMessage.includes('?') || lowerMessage.includes('please'))) {
    return true;
  }
  
  return false;
}

// Search barbers by location
async function searchBarbersByLocation(location) {
  try {
    const snapshot = await admin.firestore()
      .collection('businesses')
      .where('location', '==', location)
      .where('businessType', '==', 'service')
      .get();
    
    const barbers = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.name && (
        data.name.toLowerCase().includes('barber') ||
        data.name.toLowerCase().includes('hair') ||
        data.name.toLowerCase().includes('salon') ||
        data.businessName && (
          data.businessName.toLowerCase().includes('barber') ||
          data.businessName.toLowerCase().includes('hair') ||
          data.businessName.toLowerCase().includes('salon')
        )
      )) {
        barbers.push({
          id: doc.id,
          ...data
        });
      }
    });
    
    return barbers;
  } catch (error) {
    logger.error("Error searching barbers by location:", error);
    return [];
  }
}

// Get barber context
async function getBarberContext(barberId, date) {
  try {
    const servicesSnapshot = await admin.firestore()
      .collection('services')
      .where('businessId', '==', barberId)
      .get();

    const services = [];
    servicesSnapshot.forEach(doc => {
      services.push({ id: doc.id, ...doc.data() });
    });

    const workingHoursDoc = await admin.firestore()
      .collection('working_hours')
      .doc(`${barberId}_${date}`)
      .get();

    let workingHours = null;
    if (workingHoursDoc.exists) {
      workingHours = workingHoursDoc.data();
    }

    const appointmentsSnapshot = await admin.firestore()
      .collection('appointments')
      .where('businessId', '==', barberId)
      .where('date', '==', date)
      .where('status', '==', 'confirmed')
      .get();

    const appointments = [];
    appointmentsSnapshot.forEach(doc => {
      appointments.push(doc.data());
    });

    const availableSlots = calculateAvailableSlots(appointments, workingHours);

    return {
      services,
      appointments,
      workingHours,
      availableSlots
    };
  } catch (error) {
    logger.error("Error getting barber context:", error);
    return { services: [], appointments: [], workingHours: null, availableSlots: [] };
  }
}

// AI function for complex queries only
async function askBarberAI(message, barber, context, date) {
  const apiKey = OPENAI_API_KEY.value();
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY secret");
  }
  
  const cleanApiKey = apiKey.trim().replace(/[^\x20-\x7E]/g, '');
  
  const systemPrompt = `
You are a barber shop assistant for "${barber.name || barber.businessName}".

BARBER SHOP DETAILS:
- Name: ${barber.name || barber.businessName}
- Address: ${barber.address || 'Not specified'}
- Phone: ${barber.phone || 'Not specified'}

CURRENT AVAILABILITY DATA:
- Working Hours: ${context.workingHours ? JSON.stringify(context.workingHours) : 'Not set'}
- Available Slots: ${context.availableSlots ? context.availableSlots.join(', ') : 'None available'}
- Services: ${context.services ? context.services.map(s => s.name || s.id).join(', ') : 'No services defined'}
- Appointments: ${context.appointments ? context.appointments.length : 0} confirmed appointments

BEHAVIOR:
- Be friendly and helpful
- Use the current availability data provided above
- Provide specific, actionable responses
- If you can't help with something, suggest contacting the barber shop directly

Current Context:
- Barber: ${barber.name || barber.businessName}
- Date: ${date}
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
    logger.error("OpenAI API Error:", error.response?.data || error.message);
    return "I'm here to help you with appointments and services at this barber shop. What would you like to do?";
  }
}

// Calculate available slots
function calculateAvailableSlots(appointments, workingHours) {
  const slots = [];
  
  if (!workingHours || !workingHours.timeSlots) {
    for (let hour = 9; hour < 18; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        const isBooked = appointments.some(apt => apt.time === timeStr);
        if (!isBooked) {
          slots.push(timeStr);
        }
      }
    }
    return slots;
  }
  
  workingHours.timeSlots.forEach(timeSlot => {
    const [startHour, startMinute] = timeSlot.start.split(':').map(Number);
    const [endHour, endMinute] = timeSlot.end.split(':').map(Number);
    
    let currentHour = startHour;
    let currentMinute = startMinute;
    
    while (currentHour < endHour || (currentHour === endHour && currentMinute < endMinute)) {
      const timeStr = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
      const isBooked = appointments.some(apt => apt.time === timeStr);
      if (!isBooked) {
        slots.push(timeStr);
      }
      
      currentMinute += 30;
      if (currentMinute >= 60) {
        currentMinute = 0;
        currentHour++;
      }
    }
  });
  
  return slots;
}

// Save conversation
async function saveConversation(customer, twilioNumber, message, reply, date, tz, type, barberId = null) {
  try {
    await admin.firestore().collection("conversations").add({
      customer,
      twilioNumber,
      message,
      reply,
      date,
      timezone: tz,
      timestamp: Date.now(),
      platform: 'whatsapp',
      botType: 'balanced-barber',
      conversationType: type,
      barberId
    });
  } catch (error) {
    logger.error("Error saving conversation:", error);
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
