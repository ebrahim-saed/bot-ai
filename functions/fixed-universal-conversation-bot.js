// Fixed Universal Conversation Bot - Proper Booking Implementation
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

// Fixed Universal Conversation Bot
exports.fixedUniversalConversationBot = onRequest({ 
  secrets: [OPENAI_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM] 
}, async (req, res) => {
  try {
    const message = req.body.Body?.trim() || "Hi!";
    const customer = req.body.From || "Anonymous";
    const twilioNumber = req.body.To;
    
    logger.info(`Fixed Universal Conversation Bot - Customer: ${customer}, Message: ${message}`);
    
    const tz = (process.env.BUSINESS_TZ || req.query.tz || 'UTC').toString();
    const today = (req.query.date || req.body.date || new Date().toLocaleDateString('en-CA', { timeZone: tz })).toString();

    // Get conversation context
    const context = await getConversationContext(customer, today);
    
    // Handle booking requests directly first
    const bookingResponse = await handleBookingRequest(message, context, customer, today);
    if (bookingResponse) {
      await saveConversation(customer, twilioNumber, message, bookingResponse, today, tz, 'booking', context.selectedBarber?.id);
      const safeReply = escapeXml(bookingResponse);
      res.set('Content-Type', 'text/xml');
      res.status(200).send(`
        <Response>
            <Message>${safeReply}</Message>
        </Response>
      `);
      return;
    }
    
    // Use AI to handle other conversation flow
    const aiResponse = await handleConversationFlow(message, context, customer, today);
    
    // Handle special actions (booking, etc.)
    let finalResponse = aiResponse;
    if (aiResponse.includes("BOOKING:")) {
      finalResponse = await handleBookingAction(aiResponse, context.selectedBarber, customer, today);
    }
    
    // Save conversation
    await saveConversation(customer, twilioNumber, message, finalResponse, today, tz, 'universal-flow', context.selectedBarber?.id);
    
    const safeReply = escapeXml(finalResponse);
    res.set('Content-Type', 'text/xml');
    res.status(200).send(`
      <Response>
          <Message>${safeReply}</Message>
      </Response>
    `);
    
  } catch (err) {
    logger.error("Error in Fixed Universal Conversation Bot", err);
    res.status(500).send("Something went wrong");
  }
});

// Handle booking requests directly
async function handleBookingRequest(message, context, customer, today) {
  const lowerMessage = message.toLowerCase();
  
  // Check if this is a booking request
  if (!lowerMessage.includes('book') && !lowerMessage.includes('appointment')) {
    return null;
  }
  
  // Must have a selected barber
  if (!context.selectedBarber) {
    return "Please select a barber first before booking. You can search for barbers in your area.";
  }
  
  // Extract time from message
  const timeMatch = lowerMessage.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/);
  if (!timeMatch) {
    return "Please specify a time for your appointment. For example: 'Book me for 12:00' or 'Book me for 2 PM'";
  }
  
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
  
  // Check availability
  const barberContext = await getBarberContext(context.selectedBarber.id, today);
  if (!barberContext.availableSlots || !barberContext.availableSlots.includes(timeStr)) {
    return `Sorry, ${timeStr} is not available at ${context.selectedBarber.name || context.selectedBarber.businessName}. Here are the available times:\n\n${barberContext.availableSlots ? barberContext.availableSlots.join(', ') : 'No times available'}`;
  }
  
  // Determine service
  let serviceId = 'haircut'; // Default
  let serviceName = 'haircut';
  
  if (lowerMessage.includes('beard') || lowerMessage.includes('trim')) {
    serviceId = 'beard-trim';
    serviceName = 'beard trim';
  } else if (lowerMessage.includes('haircut') || lowerMessage.includes('hair')) {
    serviceId = 'haircut';
    serviceName = 'haircut';
  }
  
  // Create appointment
  try {
    const appointmentRef = await admin.firestore().collection('appointments').add({
      businessId: context.selectedBarber.id,
      serviceId,
      serviceName,
      businessName: context.selectedBarber.name || context.selectedBarber.businessName,
      customerName: customer,
      customerPhone: customer,
      date: today,
      time: timeStr,
      status: 'confirmed',
      reminderSent: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return `✅ You're booked for ${serviceName} at ${timeStr} on ${today} at ${context.selectedBarber.name || context.selectedBarber.businessName}. Your appointment ID is ${appointmentRef.id}. See you then!`;
    
  } catch (error) {
    logger.error("Error creating appointment:", error);
    return "❌ Sorry, something went wrong booking your appointment. Please try again.";
  }
}

// Get conversation context
async function getConversationContext(customerId, today) {
  try {
    // Get selected barber from session
    let selectedBarber = await getSelectedBarber(customerId);
    
    // Get all barbers for discovery
    const allBarbers = await getAllBarbers();
    
    // Get barber context if selected
    let barberContext = null;
    if (selectedBarber) {
      barberContext = await getBarberContext(selectedBarber.id, today);
    }
    
    return {
      selectedBarber,
      allBarbers,
      barberContext,
      today,
      customerId
    };
  } catch (error) {
    logger.error("Error getting conversation context:", error);
    return {
      selectedBarber: null,
      allBarbers: [],
      barberContext: null,
      today,
      customerId
    };
  }
}

// Handle conversation flow with AI
async function handleConversationFlow(message, context, customer, today) {
  const apiKey = OPENAI_API_KEY.value();
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY secret");
  }
  
  const cleanApiKey = apiKey.trim().replace(/[^\x20-\x7E]/g, '');
  
  // Build comprehensive system prompt for conversation flow
  let systemPrompt = `
You are a Universal Business Assistant. Currently, you ONLY handle BARBER BUSINESSES (services). Ignore any product business requests.

CONVERSATION FLOW RULES:

1. ENTRY POINTS:
   A) General Discovery: "Show me all the barbers in Haifa"
      - Query database for barbers in location
      - Return numbered list for selection
      - Wait for customer to choose number
   
   B) Direct Business Request: "What are the free times at Downtown BarberShop?"
      - Detect barber name from message
      - Set context to that barber
      - Answer the specific question

2. AFTER BARBER SELECTION:
   Once a barber is selected, handle these requests:
   
   A) Availability: "When are you free today?"
      - Check working hours + existing bookings
      - Return free time slots
   
   B) Working Hours: "What are your working hours on Friday?"
      - Fetch hours from database
      - Respond with schedule
   
   C) Business Status: "Are you open now?"
      - Check current time vs working hours
      - Respond with open/closed status
   
   D) Services: "What services do you offer?"
      - List available services

IMPORTANT: For booking requests, use this EXACT format:
BOOKING: SERVICE_ID:TIME
Examples: 
- BOOKING: haircut:14:00
- BOOKING: beard-trim:12:00

CURRENT CUSTOMER STATE:
- Customer: ${customer}
- Selected Barber: ${context.selectedBarber ? context.selectedBarber.name || context.selectedBarber.businessName : 'None'}
- Date: ${today}

AVAILABLE BARBERS:
${context.allBarbers.map((barber, index) => 
  `${index + 1}. ${barber.name || barber.businessName} (ID: ${barber.id})
   - Location: ${barber.location || 'Not specified'}
   - Address: ${barber.address || 'Not specified'}
   - Phone: ${barber.phone || 'Not specified'}`
).join('\n')}

${context.selectedBarber ? `
SELECTED BARBER DETAILS:
- Name: ${context.selectedBarber.name || context.selectedBarber.businessName}
- ID: ${context.selectedBarber.id}
- Location: ${context.selectedBarber.location || 'Not specified'}
- Address: ${context.selectedBarber.address || 'Not specified'}
- Phone: ${context.selectedBarber.phone || 'Not specified'}

SELECTED BARBER AVAILABILITY:
- Working Hours: ${context.barberContext?.workingHours ? JSON.stringify(context.barberContext.workingHours) : 'Not set'}
- Available Slots: ${context.barberContext?.availableSlots ? context.barberContext.availableSlots.join(', ') : 'None available'}
- Services: ${context.barberContext?.services ? context.barberContext.services.map(s => s.name || s.id).join(', ') : 'No services defined'}
- Appointments: ${context.barberContext?.appointments ? context.barberContext.appointments.length : 0} confirmed appointments
` : ''}

RESPONSE FORMATS:
- For barber discovery: "I found X barbers in [location]:\n\n1. [Barber Name]\n   Address: [Address]\n   Phone: [Phone]\n\n2. [Barber Name]\n   Address: [Address]\n   Phone: [Phone]\n\nPlease choose a number (1-X) to select a barber shop."
- For barber selection: "Great! I've selected '[Barber Name]' for you. How can I help you with this barber shop?"
- For availability: "Available times for [Barber Name] today:\n\n[Time slots]\n\nPlease let me know which time you'd like to book!"
- For booking: Use "BOOKING: SERVICE_ID:TIME" format
- For working hours: "Working hours for [Barber Name]:\n\n• [Day]: [Start] - [End]"

IMPORTANT RULES:
1. ONLY handle barber businesses - ignore product requests
2. If customer asks for barbers in a location, show ALL barbers in that location
3. If customer selects a number, set that barber as selected
4. If customer asks about availability/booking without a selected barber, ask them to choose first
5. Always use the current data provided above
6. Be friendly and helpful
7. For booking requests, ALWAYS use the BOOKING: format

Current Context:
- Customer: ${customer}
- Selected Barber: ${context.selectedBarber ? context.selectedBarber.name || context.selectedBarber.businessName : 'None'}
- Date: ${today}
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
        temperature: 0.7,
        max_tokens: 600
      },
      {
        headers: {
          "Authorization": `Bearer ${cleanApiKey}`,
          "Content-Type": "application/json"
        },
        timeout: 15000
      }
    );

    return response.data.choices[0].message.content.trim();
  } catch (error) {
    logger.error("OpenAI API Error:", error.response?.data || error.message);
    return "I'm here to help you with barber shop appointments. What would you like to do?";
  }
}

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

// Get all barbers
async function getAllBarbers() {
  try {
    const snapshot = await admin.firestore()
      .collection('businesses')
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
    logger.error("Error getting all barbers:", error);
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

// Handle booking action
async function handleBookingAction(aiReply, selectedBarber, customer, date) {
  try {
    if (!selectedBarber) {
      return "Please select a barber first before booking.";
    }
    
    // Try multiple booking patterns
    let bookingMatch = aiReply.match(/BOOKING:\s*(\w+):(\d{2}:\d{2})/);
    
    if (!bookingMatch) {
      return "❌ Sorry, I couldn't understand the booking request. Please try again.";
    }
    
    const [, serviceId, time] = bookingMatch;
    
    // Create appointment
    const appointmentRef = await admin.firestore().collection('appointments').add({
      businessId: selectedBarber.id,
      serviceId,
      serviceName: serviceId,
      businessName: selectedBarber.name || selectedBarber.businessName,
      customerName: customer,
      customerPhone: customer,
      date,
      time,
      status: 'confirmed',
      reminderSent: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return `✅ You're booked for ${serviceId} at ${time} on ${date} at ${selectedBarber.name || selectedBarber.businessName}. Your appointment ID is ${appointmentRef.id}. See you then!`;
    
  } catch (error) {
    logger.error("Error handling booking action", error);
    return "❌ Sorry, something went wrong booking your appointment. Please try again.";
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
      botType: 'fixed-universal-conversation',
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
