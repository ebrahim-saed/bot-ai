// Smart OpenAI Barber Bot - Dynamic with cost optimization
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

// Smart OpenAI Barber Bot
exports.smartOpenAIBarberBot = onRequest({ 
  secrets: [OPENAI_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM] 
}, async (req, res) => {
  try {
    const message = req.body.Body?.trim() || "Hi!";
    const customer = req.body.From || "Anonymous";
    const twilioNumber = req.body.To;
    
    logger.info(`Smart OpenAI Barber Bot - Customer: ${customer}, Message: ${message}`);
    
    const tz = (process.env.BUSINESS_TZ || req.query.tz || 'UTC').toString();
    const today = (req.query.date || req.body.date || new Date().toLocaleDateString('en-CA', { timeZone: tz })).toString();

    // Get comprehensive context for AI
    const context = await getComprehensiveContext(customer, today);
    
    // Use AI to handle the request dynamically
    const aiResponse = await askSmartBarberAI(message, context, customer, today);
    
    // Handle special actions (booking, etc.)
    let finalResponse = aiResponse;
    if (aiResponse.includes("BOOKING:")) {
      finalResponse = await handleBarberBooking(aiResponse, context.selectedBarber, customer, today);
    }
    
    // Save conversation
    await saveConversation(customer, twilioNumber, message, finalResponse, today, tz, 'smart-ai', context.selectedBarber?.id);
    
    const safeReply = escapeXml(finalResponse);
    res.set('Content-Type', 'text/xml');
    res.status(200).send(`
      <Response>
          <Message>${safeReply}</Message>
      </Response>
    `);
    
  } catch (err) {
    logger.error("Error in Smart OpenAI Barber Bot", err);
    res.status(500).send("Something went wrong");
  }
});

// Get comprehensive context for AI
async function getComprehensiveContext(customerId, today) {
  try {
    // Get selected barber
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
    logger.error("Error getting comprehensive context:", error);
    return {
      selectedBarber: null,
      allBarbers: [],
      barberContext: null,
      today,
      customerId
    };
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

// Smart AI function with comprehensive context
async function askSmartBarberAI(message, context, customer, today) {
  const apiKey = OPENAI_API_KEY.value();
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY secret");
  }
  
  const cleanApiKey = apiKey.trim().replace(/[^\x20-\x7E]/g, '');
  
  // Build comprehensive system prompt
  let systemPrompt = `
You are a smart barber shop assistant that can handle multiple barbers dynamically.

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

CAPABILITIES:
1. BARBER DISCOVERY: Show barbers by location (e.g., "Give me all barbers in Haifa")
2. BARBER SELECTION: Help customer choose from a list
3. AVAILABILITY CHECK: Show available times for selected barber
4. BOOKING: Book appointments with specific times
5. SERVICES: List services offered by selected barber
6. WORKING HOURS: Show business hours

RESPONSE FORMATS:
- For barber discovery: List barbers with numbers for selection
- For barber selection: Confirm selection and set context
- For availability: Show available time slots
- For booking: Use format "BOOKING: SERVICE_ID:TIME" (e.g., "BOOKING: haircut:14:00")
- For confirmation: Handle "yes" responses for bookings

IMPORTANT RULES:
1. If customer asks for barbers in a location, show ALL barbers in that location with numbers
2. If customer selects a number, set that barber as selected and confirm
3. If customer asks about availability/booking without a selected barber, ask them to choose first
4. Always use the current data provided above
5. Be friendly and helpful
6. Handle "yes" responses for booking confirmations

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
        max_tokens: 500
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
    return "I'm here to help you with barber shop services. What would you like to do?";
  }
}

// Handle barber booking
async function handleBarberBooking(aiReply, selectedBarber, customer, date) {
  try {
    if (!selectedBarber) {
      return "Please select a barber first before booking.";
    }
    
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
      }
    } else {
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
      botType: 'smart-openai-barber',
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
