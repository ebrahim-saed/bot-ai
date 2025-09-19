// Improved Universal Barber Bot with better context handling
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

// Improved Universal Barber Bot
exports.improvedUniversalBarberBot = onRequest({ 
  secrets: [OPENAI_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM] 
}, async (req, res) => {
  try {
    const message = req.body.Body?.trim() || "Hi!";
    const customer = req.body.From || "Anonymous";
    const twilioNumber = req.body.To;
    
    logger.info(`Improved Universal Barber Bot - Customer: ${customer}, Message: ${message}`);
    
    const tz = (process.env.BUSINESS_TZ || req.query.tz || 'UTC').toString();
    const today = (req.query.date || req.body.date || new Date().toLocaleDateString('en-CA', { timeZone: tz })).toString();

    // Step 1: Check if customer has a selected barber in current conversation
    let selectedBarber = await getSelectedBarber(customer);
    
    // Step 2: If no selected barber, try to identify barber from message
    if (!selectedBarber) {
      selectedBarber = await identifyBarberFromMessage(message);
    }
    
    // Step 3: If still no barber, handle discovery flow
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
    
    // Step 4: Handle barber selection from numbered list
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
    
    // Step 5: If we have a selected barber, handle barber-specific operations
    if (selectedBarber) {
      const barberResponse = await handleBarberOperations(message, selectedBarber, customer, today);
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
    
    // Step 6: Fallback - no barber identified
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
    logger.error("Error in Improved Universal Barber Bot", err);
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
        // Get barber details
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
    // Get all barbers from database
    const barbersSnapshot = await admin.firestore()
      .collection('businesses')
      .where('businessType', '==', 'service')
      .get();
    
    const barbers = [];
    barbersSnapshot.forEach(doc => {
      const data = doc.data();
      // Filter for barber-related businesses
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
    
    // Check if message mentions any barber name
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

// Handle barber discovery flow
async function handleBarberDiscovery(message, customer) {
  try {
    // Check for location-based search patterns
    const locationPatterns = [
      /(?:give me|show me|find|search).*?(?:barber|hair|salon).*?in\s+(\w+)/i,
      /(?:barber|hair|salon).*?in\s+(\w+)/i,
      /in\s+(\w+).*?(?:barber|hair|salon)/i
    ];

    // Check for location-based search
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
        
        // Store the barber list for selection
        await admin.firestore().collection('customer_sessions').doc(customer).set({
          pendingBarberSelection: barbers,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        return response;
      }
    }

    return null; // Not a discovery query
  } catch (error) {
    logger.error("Error in handleBarberDiscovery:", error);
    return null;
  }
}

// Handle barber selection from numbered list
async function handleBarberSelection(message, customer) {
  try {
    const numberMatch = message.match(/^(\d+)$/);
    if (!numberMatch) {
      return null;
    }
    
    const choice = parseInt(numberMatch[1]);
    
    // Get pending barber selection
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
    
    // Set the selected barber
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

// Handle barber-specific operations with improved context
async function handleBarberOperations(message, barber, customer, today) {
  try {
    // Get barber context (services, working hours, appointments)
    const context = await getBarberContext(barber.id, today);
    
    // Handle specific queries directly first
    const directResponse = await handleDirectQueries(message, barber, context, today);
    if (directResponse) {
      return directResponse;
    }
    
    // Use AI for other requests
    const aiResponse = await askBarberAI(message, barber, context, today);
    
    // Handle special actions (booking, etc.)
    if (aiResponse.includes("BOOKING:")) {
      return await handleBarberBooking(aiResponse, barber, customer, today);
    }
    
    return aiResponse;
    
  } catch (error) {
    logger.error("Error handling barber operations:", error);
    return "Sorry, I'm having trouble processing your request. Please try again.";
  }
}

// Handle direct queries without AI
async function handleDirectQueries(message, barber, context, today) {
  const lowerMessage = message.toLowerCase();
  
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
      // Group times by hour for better readability
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
  
  // Booking availability check
  if (lowerMessage.includes('book') && lowerMessage.includes('12:00')) {
    if (context.availableSlots && context.availableSlots.includes('12:00')) {
      return `Yes! 12:00 is available at ${barber.name || barber.businessName}. Would you like me to book this appointment for you? Just say "yes" to confirm.`;
    } else {
      return `Sorry, 12:00 is not available at ${barber.name || barber.businessName}. Here are the available times:\n\n${context.availableSlots ? context.availableSlots.join(', ') : 'No times available'}`;
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
  
  return null; // Not a direct query
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
      // Filter for barber-related businesses
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

// Get barber context (services, working hours, appointments)
async function getBarberContext(barberId, date) {
  try {
    // Get services
    const servicesSnapshot = await admin.firestore()
      .collection('services')
      .where('businessId', '==', barberId)
      .get();

    const services = [];
    servicesSnapshot.forEach(doc => {
      services.push({ id: doc.id, ...doc.data() });
    });

    // Get working hours
    const workingHoursDoc = await admin.firestore()
      .collection('working_hours')
      .doc(`${barberId}_${date}`)
      .get();

    let workingHours = null;
    if (workingHoursDoc.exists) {
      workingHours = workingHoursDoc.data();
    }

    // Get appointments
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

    // Calculate available slots
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

// AI function for barber-specific operations
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

CAPABILITIES:
- Check availability and time slots
- Book appointments
- Show working hours
- List services
- Confirm or decline bookings

BOOKING FORMAT: When user wants to book, respond with:
BOOKING: SERVICE_ID:TIME
Example: BOOKING: haircut:14:00

IMPORTANT: If user mentions a specific time (like "2 PM", "3 PM", "book me for 2 PM"), 
automatically create a booking response in the format above.

BEHAVIOR:
- Be friendly and helpful
- Use the current availability data provided above
- Always confirm bookings with details
- If a time slot is unavailable, suggest alternatives
- Do NOT try to call external tools - use only the data provided above

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

// Handle barber booking
async function handleBarberBooking(aiReply, barber, customer, date) {
  try {
    // Try multiple booking patterns
    let bookingMatch = aiReply.match(/BOOKING:\s*(\w+):(\d{2}:\d{2})/);
    
    if (!bookingMatch) {
      // Try alternative patterns
      bookingMatch = aiReply.match(/book.*?(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
      if (bookingMatch) {
        let [, hour, minute, period] = bookingMatch;
        hour = parseInt(hour);
        minute = minute ? parseInt(minute) : 0;
        
        // Convert to 24-hour format
        if (period && period.toLowerCase() === 'pm' && hour !== 12) {
          hour += 12;
        } else if (period && period.toLowerCase() === 'am' && hour === 12) {
          hour = 0;
        }
        
        const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        const serviceId = 'haircut'; // Default service
        
        // Create appointment
        const appointmentRef = await admin.firestore().collection('appointments').add({
          businessId: barber.id,
          serviceId,
          serviceName: serviceId,
          businessName: barber.name || barber.businessName,
          customerName: customer,
          customerPhone: customer,
          date,
          time,
          status: 'confirmed',
          reminderSent: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return `✅ You're booked for ${serviceId} at ${time} on ${date} at ${barber.name || barber.businessName}. Your appointment ID is ${appointmentRef.id}. See you then!`;
      }
    } else {
      const [, serviceId, time] = bookingMatch;
      
      // Create appointment
      const appointmentRef = await admin.firestore().collection('appointments').add({
        businessId: barber.id,
        serviceId,
        serviceName: serviceId,
        businessName: barber.name || barber.businessName,
        customerName: customer,
        customerPhone: customer,
        date,
        time,
        status: 'confirmed',
        reminderSent: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return `✅ You're booked for ${serviceId} at ${time} on ${date} at ${barber.name || barber.businessName}. Your appointment ID is ${appointmentRef.id}. See you then!`;
    }
    
    return "❌ Sorry, I couldn't understand the booking request. Please try again.";
  } catch (error) {
    logger.error("Error handling barber booking", error);
    return "❌ Sorry, something went wrong booking your appointment. Please try again.";
  }
}

// Calculate available slots
function calculateAvailableSlots(appointments, workingHours) {
  const slots = [];
  
  // If no working hours set, use default hours (9 AM - 6 PM)
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
  
  // Use working hours to generate slots
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
      
      // Add 30 minutes
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
      botType: 'improved-universal-barber',
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
