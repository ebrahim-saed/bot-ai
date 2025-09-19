const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();

// Secrets
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const TWILIO_ACCOUNT_SID = defineSecret("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = defineSecret("TWILIO_AUTH_TOKEN");
const TWILIO_WHATSAPP_FROM = defineSecret("TWILIO_WHATSAPP_FROM");

// Set working hours for a barber
exports.setWorkingHours = onRequest(async (req, res) => {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { barberId, date, timeSlots } = req.body;

    if (!barberId || !date || !timeSlots || !Array.isArray(timeSlots)) {
      return res.status(400).json({ 
        error: 'Missing required fields: barberId, date, timeSlots' 
      });
    }

    const docId = `${barberId}_${date}`;
    
    await admin.firestore().collection('working_hours').doc(docId).set({
      barberId,
      date,
      timeSlots,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({ 
      success: true, 
      message: 'Working hours updated successfully',
      docId 
    });
  } catch (err) {
    logger.error("Error setting working hours", err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

exports.fakeChat = onRequest({ secrets: [OPENAI_API_KEY] }, async (req, res) => {
  try {
    const message = req.body.Body?.trim() || "Hi!";
    const customer = req.body.From || "Anonymous";
    const barberId = (req.query.barberId || req.body.barberId || 'default').toString();
    const tz = (process.env.BUSINESS_TZ || req.query.tz || 'UTC').toString();
    const today = (req.query.date || req.body.date || new Date().toLocaleDateString('en-CA', { timeZone: tz })).toString();

    const workingHoursDoc = await admin.firestore()
      .collection('working_hours')
      .doc(`${barberId}_${today}`)
      .get();

    // Load existing bookings for today
    const bookingsSnapshot = await admin.firestore()
      .collection('bookings')
      .where('barberId', '==', barberId)
      .where('date', '==', today)
      .get();

    const bookings = [];
    bookingsSnapshot.forEach(doc => {
      bookings.push(doc.data());
    });

    // Calculate free slots
    let freeSlotsString = '';
    if (workingHoursDoc.exists) {
      const workingHours = workingHoursDoc.data();
      const freeSlots = calculateFreeSlots(workingHours.timeSlots, bookings);
      freeSlotsString = formatFreeSlots(freeSlots);
    }

    let openaiReply = await askOpenAI(message, freeSlotsString, barberId, today);

    let bookingReply = null;

    if (openaiReply.startsWith("BOOKING:")) {
      const times = openaiReply.replace("BOOKING:", "").trim(); // "15:00-15:30"
      const [start, end] = times.split("-");

      try {
        // Validate that the requested time falls within working hours
        if (workingHoursDoc.exists) {
          const workingHours = workingHoursDoc.data().timeSlots;
          if (!isTimeWithinWorkingHours(start.trim(), end.trim(), workingHours)) {
            bookingReply = "❌ Sorry, that time is outside our working hours. Please choose from available slots.";
          } else {
            await admin.firestore().collection('bookings').add({
              barberId,
              customerName: customer,
              phone: customer,
              date: today,
              start: start.trim(),
              end: end.trim(),
              status: 'confirmed',
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            bookingReply = `✅ You're booked for ${start.trim()} today. See you then!`;
          }
        } else {
          bookingReply = "❌ Sorry, no working hours are set for today.";
        }
      } catch (err) {
        logger.error("Error saving booking", err);
        bookingReply = "❌ Sorry, something went wrong saving your booking.";
      }
    }

    // If booking was detected, override GPT reply with confirmation
    if (bookingReply) {
    openaiReply = bookingReply;
    }


        await admin.firestore().collection("messages").add({
        customer,
        message,
        reply: openaiReply,
        barberId,
        date: today,
        timezone: tz,
        timestamp: Date.now()
        });

        const safeReply = escapeXml(openaiReply);

        res.set('Content-Type', 'text/xml');
        res.status(200).send(`
        <Response>
            <Message>${safeReply}</Message>
        </Response>
        `);
    } catch (err) {
        logger.error("Error handling message", err);
        res.status(500).send("Something went wrong");
    }
    });
// Escape XML special characters
function escapeXml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function askOpenAI(message, freeSlotsString = '', barberId = 'default', date = null) {
  const apiKey = OPENAI_API_KEY.value();
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY secret. Set it with: firebase functions:secrets:set OPENAI_API_KEY");
  }
  
  // Clean the API key to remove any invalid characters
  const cleanApiKey = apiKey.trim().replace(/[^\x20-\x7E]/g, '');
  
  // Enhanced system prompt with MCP capabilities
  let systemPrompt = `
You are a WhatsApp assistant for a local business with direct access to Firebase data.

Behavior rules:
1) Availability questions:
- If the user asks about availability (e.g., "what times are you free?", "show me available slots", "give me all the times that you are free"), you can query Firebase directly using the available tools.
- Use the get_available_slots tool to get real-time availability data.
- Present the information in a friendly, readable format.

2) Booking requests:
- If the user requests a specific time, use the get_available_slots tool first to check availability.
- If the time is available, use the create_booking tool to make the booking.
- Confirm the booking with the customer.

3) Working hours management:
- If the user asks about working hours or wants to set them, use the get_working_hours or set_working_hours tools.

4) General chat:
- For other questions, chat normally and be brief and friendly.
- You have access to real-time data, so always use the tools to get current information.

Available tools:
- get_available_slots: Get available time slots for a barber on a specific date
- get_working_hours: Get working hours for a barber on a specific date  
- get_bookings: Get all bookings for a barber on a specific date
- create_booking: Create a new booking
- set_working_hours: Set working hours for a barber on a specific date

Current context:
- Barber ID: ${barberId}
- Date: ${date || 'today'}
- AvailableSlots: ${freeSlotsString && freeSlotsString.trim() ? freeSlotsString : 'none'}

Always use the appropriate tools to get real-time data rather than relying on the AvailableSlots string above.
  `.trim();

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: systemPrompt.trim()
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
        timeout: 10000 // 10 second timeout
      }
    );

    return response.data.choices[0].message.content.trim();
  } catch (error) {
    logger.error("OpenAI API Error:", error.response?.data || error.message);
    
    // Fallback response when OpenAI fails
    if (freeSlotsString && freeSlotsString.trim() && freeSlotsString !== 'none') {
      return `Today's available slots: ${freeSlotsString}`;
    } else {
      return "I'm having trouble accessing our schedule right now. Please try again in a moment or contact us directly.";
    }
  }
}

// Helper function to calculate free slots
function calculateFreeSlots(workingHours, bookings) {
  const freeSlots = [];
  
  for (const workingSlot of workingHours) {
    const workingStart = timeToMinutes(workingSlot.start);
    const workingEnd = timeToMinutes(workingSlot.end);
    
    // Find overlapping bookings
    const overlappingBookings = bookings.filter(booking => {
      const bookingStart = timeToMinutes(booking.start);
      const bookingEnd = timeToMinutes(booking.end);
      
      return !(bookingEnd <= workingStart || bookingStart >= workingEnd);
    });
    
    // Sort bookings by start time
    overlappingBookings.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
    
    let currentTime = workingStart;
    
    for (const booking of overlappingBookings) {
      const bookingStart = timeToMinutes(booking.start);
      const bookingEnd = timeToMinutes(booking.end);
      
      // Add free slot before this booking
      if (currentTime < bookingStart) {
        freeSlots.push({
          start: minutesToTime(currentTime),
          end: minutesToTime(bookingStart)
        });
      }
      
      currentTime = Math.max(currentTime, bookingEnd);
    }
    
    // Add free slot after last booking
    if (currentTime < workingEnd) {
      freeSlots.push({
        start: minutesToTime(currentTime),
        end: minutesToTime(workingEnd)
      });
    }
  }
  
  return freeSlots;
}

// Helper function to format free slots as string
function formatFreeSlots(freeSlots) {
  if (freeSlots.length === 0) {
    return 'No available slots today.';
  }
  
  return freeSlots.map(slot => `${slot.start}-${slot.end}`).join(', ');
}

// Helper function to convert time string to minutes
function timeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

// Helper function to convert minutes to time string
function minutesToTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

// Helper function to validate if a time slot falls within working hours
function isTimeWithinWorkingHours(start, end, workingHours) {
  const requestedStart = timeToMinutes(start);
  const requestedEnd = timeToMinutes(end);
  
  for (const slot of workingHours) {
    const slotStart = timeToMinutes(slot.start);
    const slotEnd = timeToMinutes(slot.end);
    
    // Check if the requested time is completely within this working slot
    if (requestedStart >= slotStart && requestedEnd <= slotEnd) {
      return true;
    }
  }
  
  return false;
}

exports.createBooking = onRequest(async (req, res) => {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { barberId, customerName, phone, date, start, end } = req.body;

    if (!barberId || !customerName || !phone || !date || !start || !end) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check working hours exist for this date
    const workingHoursDoc = await admin.firestore()
      .collection('working_hours')
      .doc(`${barberId}_${date}`)
      .get();

    if (!workingHoursDoc.exists) {
      return res.status(400).json({ error: 'No working hours set for this date' });
    }

    const workingHours = workingHoursDoc.data().timeSlots;

    // Validate that requested time falls within working hours
    if (!isTimeWithinWorkingHours(start, end, workingHours)) {
      return res.status(400).json({ 
        error: 'Requested time is outside working hours',
        workingHours: workingHours
      });
    }

    // Load existing bookings for this date
    const bookingsSnapshot = await admin.firestore()
      .collection('bookings')
      .where('barberId', '==', barberId)
      .where('date', '==', date)
      .get();

    const bookings = [];
    bookingsSnapshot.forEach(doc => bookings.push(doc.data()));

    // Check if requested time overlaps existing bookings
    const newStart = timeToMinutes(start);
    const newEnd = timeToMinutes(end);

    const conflict = bookings.some(b => {
      const bStart = timeToMinutes(b.start);
      const bEnd = timeToMinutes(b.end);
      return !(newEnd <= bStart || newStart >= bEnd);
    });

    if (conflict) {
      return res.status(400).json({ error: 'Time slot already booked' });
    }

    // Save booking
    const bookingRef = await admin.firestore().collection('bookings').add({
      barberId,
      customerName,
      phone,
      date,
      start,
      end,
      status: 'confirmed',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({
      success: true,
      message: 'Booking confirmed',
      bookingId: bookingRef.id
    });

  } catch (err) {
    logger.error("Error creating booking", err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===================== Reminders =====================

async function processRemindersCore(now = new Date(), options = {}) {
  const tz = (process.env.BUSINESS_TZ || options.tz || 'UTC').toString();
  // Compute target time = now + 5 minutes, in business timezone, formatted to HH:mm and YYYY-MM-DD
  const targetDate = new Date(now.getTime() + 5 * 60 * 1000);
  const dateStr = targetDate.toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD
  const timeStr = targetDate.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }); // HH:mm

  logger.info(`Checking reminders for date=${dateStr} time=${timeStr} tz=${tz}`);

  // Query appointments for that date and time, not yet reminded
  const snapshot = await admin.firestore()
    .collection('appointments')
    .where('date', '==', dateStr)
    .where('time', '==', timeStr)
    .where('status', '==', 'confirmed')
    .get();

  if (snapshot.empty) {
    logger.info('No appointments to remind at this time');
    return { sent: 0 };
  }

  const accountSid = TWILIO_ACCOUNT_SID.value();
  const authToken = TWILIO_AUTH_TOKEN.value();
  const fromNumber = TWILIO_WHATSAPP_FROM.value(); // e.g., 'whatsapp:+14155238886' or your WhatsApp sender

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error('Missing Twilio secrets (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM)');
  }

  let sentCount = 0;

  for (const doc of snapshot.docs) {
    const appointment = doc.data();
    if (appointment.reminderSent) {
      continue;
    }
    
    // Get customer phone number - try different possible fields
    let customerPhone = appointment.customerPhone || appointment.phone || appointment.customer;
    if (!customerPhone) {
      logger.warn(`No phone number found for appointment ${doc.id}`);
      continue;
    }
    
    // Ensure phone number has whatsapp: prefix
    const to = customerPhone.startsWith('whatsapp:') ? customerPhone : `whatsapp:${customerPhone}`;
    
    // Create personalized reminder message
    const serviceName = appointment.serviceName || appointment.serviceId || 'appointment';
    const businessName = appointment.businessName || 'our business';
    const body = `⏰ Reminder: You have a ${serviceName} appointment at ${appointment.time} today at ${businessName}. See you soon!`;

    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      const params = new URLSearchParams();
      params.append('From', fromNumber);
      params.append('To', to);
      params.append('Body', body);

      await axios.post(url, params, {
        auth: { username: accountSid, password: authToken },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      await doc.ref.update({ 
        reminderSent: true, 
        reminderSentAt: admin.firestore.FieldValue.serverTimestamp() 
      });
      sentCount++;
      logger.info(`Reminder sent to ${to} for appointment ${doc.id}`);
    } catch (err) {
      logger.error(`Failed to send reminder for appointment ${doc.id}`, err);
    }
  }

  return { sent: sentCount };
}

// HTTP trigger for manual testing
exports.sendReminders = onRequest({ secrets: [TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM] }, async (req, res) => {
  try {
    const result = await processRemindersCore(new Date(), { tz: req.query.tz || req.body?.tz });
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    logger.error('sendReminders error', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Scheduled job: every minute
exports.checkReminders = onSchedule({ schedule: '* * * * *', timeZone: process.env.BUSINESS_TZ || 'UTC' }, async (event) => {
  try {
    await processRemindersCore(new Date());
  } catch (err) {
    logger.error('checkReminders error', err);
  }
});

// Twilio Number to Business ID Mapping
const TWILIO_NUMBER_TO_BUSINESS = {
  'whatsapp:+14155238886': 'service-businesses'  // All service businesses use this number
  // Product businesses number will be added later
};

// Function to detect business ID from Twilio number
async function detectBusinessIdFromTwilio(req) {
  try {
    const twilioNumber = req.body.To; // The number the message was sent to
    const customerPhone = req.body.From; // The customer's number
    const message = req.body.Body?.trim() || "";
    
    // Method 1: Twilio Number Mapping (Primary)
    if (twilioNumber && TWILIO_NUMBER_TO_BUSINESS[twilioNumber]) {
      const mappedBusinessId = TWILIO_NUMBER_TO_BUSINESS[twilioNumber];
      
      // If it's a generic service business number, use message analysis
      if (mappedBusinessId === 'service-businesses') {
        const serviceBusinessId = extractServiceBusinessIdFromMessage(message);
        logger.info(`Service business ID detected from message: ${serviceBusinessId}`);
        return serviceBusinessId;
      }
      
      logger.info(`Business ID detected from Twilio number: ${mappedBusinessId}`);
      return mappedBusinessId;
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

// Extract service business ID from message content
function extractServiceBusinessIdFromMessage(message) {
  const serviceBusinessKeywords = {
    'barber': 'barber-shop-downtown',
    'haircut': 'barber-shop-downtown',
    'hair': 'barber-shop-downtown',
    'beard': 'barber-shop-downtown',
    'shave': 'barber-shop-downtown',
    'lawyer': 'lawyer-office',
    'legal': 'lawyer-office',
    'attorney': 'lawyer-office',
    'court': 'lawyer-office',
    'spa': 'spa-center',
    'massage': 'spa-center',
    'wellness': 'spa-center',
    'relax': 'spa-center',
    'dentist': 'dentist-clinic',
    'dental': 'dentist-clinic',
    'tooth': 'dentist-clinic',
    'gym': 'gym-fitness',
    'fitness': 'gym-fitness',
    'workout': 'gym-fitness',
    'exercise': 'gym-fitness'
  };
  
  const lowerMessage = message.toLowerCase();
  for (const [keyword, businessId] of Object.entries(serviceBusinessKeywords)) {
    if (lowerMessage.includes(keyword)) {
      return businessId;
    }
  }
  
  // Default to a generic service business if no specific keywords found
  return 'barber-shop-downtown';
}

// Extract business ID from message content (general)
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

// WhatsApp Bot for Service Businesses (Barber, Lawyer, etc.)
exports.whatsappServiceBot = onRequest({ secrets: [OPENAI_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM] }, async (req, res) => {
  try {
    const message = req.body.Body?.trim() || "Hi!";
    const customer = req.body.From || "Anonymous";
    const twilioNumber = req.body.To; // The business's Twilio number
    
    // Detect business ID using multiple methods
    const businessId = await detectBusinessIdFromTwilio(req);
    
    logger.info(`Service Bot - Business: ${businessId}, Customer: ${customer}, Twilio: ${twilioNumber}`);
    const tz = (process.env.BUSINESS_TZ || req.query.tz || 'UTC').toString();
    const today = (req.query.date || req.body.date || new Date().toLocaleDateString('en-CA', { timeZone: tz })).toString();

    // Force service business type
    const businessType = 'service';

    // Get service context
    const contextInfo = await getServiceContext(businessId, today);

    // Get AI response
    let aiReply = await askUniversalAI(message, businessType, contextInfo, businessId, today);

    // Handle special actions (booking, etc.)
    let actionReply = null;
    if (aiReply.includes("BOOKING:")) {
      actionReply = await handleServiceBooking(aiReply, businessId, customer, today);
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
    logger.error("Error handling WhatsApp service message", err);
    res.status(500).send("Something went wrong");
  }
});

// WhatsApp Bot for Product Businesses (Supermarket, Restaurant, etc.)
exports.whatsappProductBot = onRequest({ secrets: [OPENAI_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM] }, async (req, res) => {
  try {
    const message = req.body.Body?.trim() || "Hi!";
    const customer = req.body.From || "Anonymous";
    const twilioNumber = req.body.To; // The business's Twilio number
    
    // Detect business ID using multiple methods
    const businessId = await detectBusinessIdFromTwilio(req);
    
    logger.info(`Product Bot - Business: ${businessId}, Customer: ${customer}, Twilio: ${twilioNumber}`);
    const tz = (process.env.BUSINESS_TZ || req.query.tz || 'UTC').toString();
    const today = (req.query.date || req.body.date || new Date().toLocaleDateString('en-CA', { timeZone: tz })).toString();

    // Force product business type
    const businessType = 'product';

    // Get product context
    const contextInfo = await getProductContext(businessId);

    // Get AI response
    let aiReply = await askUniversalAI(message, businessType, contextInfo, businessId, today);

    // Handle special actions (ordering, etc.)
    let actionReply = null;
    if (aiReply.includes("ORDER:")) {
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
    logger.error("Error handling WhatsApp product message", err);
    res.status(500).send("Something went wrong");
  }
});

// Universal WhatsApp Bot (Auto-detects business type)
exports.whatsappUniversalBot = onRequest({ secrets: [OPENAI_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM] }, async (req, res) => {
  try {
    const message = req.body.Body?.trim() || "Hi!";
    const customer = req.body.From || "Anonymous";
    const twilioNumber = req.body.To; // The business's Twilio number
    
    // Detect business ID using multiple methods
    const businessId = await detectBusinessIdFromTwilio(req);
    
    logger.info(`Universal Bot - Business: ${businessId}, Customer: ${customer}, Twilio: ${twilioNumber}`);
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

// Universal AI Bot for both Service and Product Businesses
exports.universalBot = onRequest({ secrets: [OPENAI_API_KEY] }, async (req, res) => {
  try {
    const message = req.body.Body?.trim() || "Hi!";
    const customer = req.body.From || "Anonymous";
    const businessId = (req.query.businessId || req.body.businessId || 'default').toString();
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

    // Save conversation
    await admin.firestore().collection("conversations").add({
      businessId,
      businessType,
      customer,
      message,
      reply: aiReply,
      date: today,
      timezone: tz,
      timestamp: Date.now()
    });

    const safeReply = escapeXml(aiReply);

    res.set('Content-Type', 'text/xml');
    res.status(200).send(`
      <Response>
          <Message>${safeReply}</Message>
      </Response>
    `);
  } catch (err) {
    logger.error("Error handling message", err);
    res.status(500).send("Something went wrong");
  }
});

// Detect business type
async function detectBusinessType(businessId) {
  try {
    const businessDoc = await admin.firestore()
      .collection('businesses')
      .doc(businessId)
      .get();

    if (businessDoc.exists) {
      return businessDoc.data().businessType || 'service'; // default to service
    }
    
    // Default business setup if not found
    await admin.firestore().collection('businesses').doc(businessId).set({
      businessName: 'Default Business',
      businessType: 'service',
      businessInfo: {
        description: 'A default business setup'
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return 'service';
  } catch (error) {
    logger.error("Error detecting business type", error);
    return 'service'; // fallback
  }
}

// Get service business context
async function getServiceContext(businessId, date) {
  try {
    // Get available services
    const servicesSnapshot = await admin.firestore()
      .collection('services')
      .where('businessId', '==', businessId)
      .get();

    const services = [];
    servicesSnapshot.forEach(doc => {
      services.push({ id: doc.id, ...doc.data() });
    });

    // Get working hours for the date
    const workingHoursDoc = await admin.firestore()
      .collection('working_hours')
      .doc(`${businessId}_${date}`)
      .get();

    let workingHours = null;
    if (workingHoursDoc.exists) {
      workingHours = workingHoursDoc.data();
    }

    // Get available appointments
    const appointmentsSnapshot = await admin.firestore()
      .collection('appointments')
      .where('businessId', '==', businessId)
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
      availableSlots,
      businessId,
      date
    };
  } catch (error) {
    logger.error("Error getting service context", error);
    return { 
      services: [], 
      appointments: [], 
      workingHours: null,
      availableSlots: [],
      businessId,
      date
    };
  }
}

// Get product business context
async function getProductContext(businessId) {
  try {
    // Get products with low stock
    const productsSnapshot = await admin.firestore()
      .collection('products')
      .where('businessId', '==', businessId)
      .where('stock', '>', 0)
      .limit(10)
      .get();

    const products = [];
    productsSnapshot.forEach(doc => {
      products.push({ id: doc.id, ...doc.data() });
    });

    return {
      products,
      totalProducts: products.length
    };
  } catch (error) {
    logger.error("Error getting product context", error);
    return { products: [], totalProducts: 0 };
  }
}

// Universal AI function
async function askUniversalAI(message, businessType, contextInfo, businessId, date) {
  const apiKey = OPENAI_API_KEY.value();
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY secret");
  }
  
  const cleanApiKey = apiKey.trim().replace(/[^\x20-\x7E]/g, '');
  
  let systemPrompt = `
You are a universal AI assistant for businesses. You can handle both service-based and product-based businesses.

BUSINESS TYPE: ${businessType.toUpperCase()}

${businessType === 'service' ? `
SERVICE BUSINESS CAPABILITIES:
- Book appointments and schedule services
- Check availability and time slots
- Manage service packages and staff
- Handle recurring appointments
- Process waitlists

CURRENT AVAILABILITY DATA:
Working Hours: ${contextInfo.workingHours ? JSON.stringify(contextInfo.workingHours) : 'Not set'}
Available Slots: ${contextInfo.availableSlots ? contextInfo.availableSlots.join(', ') : 'None available'}
Services: ${contextInfo.services ? contextInfo.services.map(s => s.name || s.id).join(', ') : 'No services defined'}
Appointments: ${contextInfo.appointments ? contextInfo.appointments.length : 0} confirmed appointments

BOOKING FORMAT: When user wants to book, respond with:
BOOKING: SERVICE_ID:TIME
Example: BOOKING: haircut:14:00

IMPORTANT: If user mentions a specific time (like "2 PM", "3 PM", "book me for 2 PM"), 
automatically create a booking response in the format above.

AVAILABILITY RESPONSES: When user asks about availability, use the current availability data provided above.
Present the information in a friendly, readable format with specific time slots.
` : `
PRODUCT BUSINESS CAPABILITIES:
- Check product availability and stock
- Search products by name or category
- Place orders and manage inventory
- Handle delivery and pickup
- Process bulk orders

CURRENT PRODUCT DATA:
Products: ${contextInfo.products ? contextInfo.products.map(p => `${p.name || p.id} (Stock: ${p.stock || 0})`).join(', ') : 'No products available'}
Low Stock Items: ${contextInfo.lowStockItems ? contextInfo.lowStockItems.length : 0} items

ORDER FORMAT: When user wants to order, respond with:
ORDER: PRODUCT_ID:QUANTITY
Example: ORDER: apple:5
`}

GENERAL BEHAVIOR:
- Be friendly and helpful
- Ask clarifying questions when needed
- Provide accurate information based on the current data provided
- Always confirm bookings/orders with details
- Do NOT try to call external tools or interfaces - use only the data provided above

Current Context:
- Business ID: ${businessId}
- Date: ${date}
- Business Type: ${businessType}
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
    
    // Fallback response
    if (businessType === 'service') {
      return "I'm here to help you book appointments and schedule services. What would you like to do?";
    } else {
      return "I'm here to help you find products and place orders. What are you looking for?";
    }
  }
}

// Handle service booking
async function handleServiceBooking(aiReply, businessId, customer, date) {
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
          businessId,
          serviceId,
          serviceName: serviceId, // Use serviceId as serviceName for now
          businessName: businessId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), // Convert businessId to readable name
          customerName: customer,
          customerPhone: customer,
          date,
          time,
          status: 'confirmed',
          reminderSent: false, // Initialize reminder flag
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return `✅ You're booked for ${serviceId} at ${time} on ${date}. Your appointment ID is ${appointmentRef.id}. See you then!`;
      }
    } else {
      const [, serviceId, time] = bookingMatch;
      
      // Create appointment
      const appointmentRef = await admin.firestore().collection('appointments').add({
        businessId,
        serviceId,
        serviceName: serviceId, // Use serviceId as serviceName for now
        businessName: businessId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), // Convert businessId to readable name
        customerName: customer,
        customerPhone: customer,
        date,
        time,
        status: 'confirmed',
        reminderSent: false, // Initialize reminder flag
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return `✅ You're booked for ${serviceId} at ${time} on ${date}. Your appointment ID is ${appointmentRef.id}. See you then!`;
    }
    
    return "❌ Sorry, I couldn't understand the booking request. Please try again.";
  } catch (error) {
    logger.error("Error handling service booking", error);
    return "❌ Sorry, something went wrong booking your appointment. Please try again.";
  }
}

// Handle product order
async function handleProductOrder(aiReply, businessId, customer) {
  try {
    const orderMatch = aiReply.match(/ORDER:\s*(\w+):(\d+)/);
    if (!orderMatch) {
      return "❌ Sorry, I couldn't understand the order request. Please try again.";
    }

    const [, productId, quantity] = orderMatch;
    
    // Get product details
    const productDoc = await admin.firestore()
      .collection('products')
      .doc(productId)
      .get();

    if (!productDoc.exists) {
      return "❌ Product not found. Please check the product ID.";
    }

    const productData = productDoc.data();
    
    if (productData.stock < parseInt(quantity)) {
      return `❌ Sorry, we only have ${productData.stock} ${productData.productName} in stock.`;
    }

    // Create order
    const orderRef = await admin.firestore().collection('orders').add({
      businessId,
      customerName: customer,
      customerPhone: customer,
      products: [{
        productId,
        productName: productData.productName,
        quantity: parseInt(quantity),
        price: productData.price,
        total: productData.price * parseInt(quantity)
      }],
      totalAmount: productData.price * parseInt(quantity),
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return `✅ Order placed! ${quantity} ${productData.productName} for $${productData.price * parseInt(quantity)}. Order ID: ${orderRef.id}`;
  } catch (error) {
    logger.error("Error handling product order", error);
    return "❌ Sorry, something went wrong processing your order. Please try again.";
  }
}

// Helper function to calculate available slots
function calculateAvailableSlots(appointments, workingHours) {
  const slots = [];
  
  // If no working hours set, use default hours (9 AM - 6 PM)
  if (!workingHours || !workingHours.timeSlots) {
    for (let hour = 3; hour < 18; hour++) {
      for (let minute = 0; minute < 60; minute += 10) {
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
      
      // Add 10 minutes
      currentMinute += 10;
      if (currentMinute >= 60) {
        currentMinute = 0;
        currentHour++;
      }
    }
  });
  
  return slots;
}


// Enhanced Universal AI Bot with Location-Based Business Discovery
exports.enhancedUniversalBot = require('./enhanced-universal-ai-bot.js').enhancedUniversalBot;


// Setup Business Data Function
exports.setupBusinessData = require('./setup-business-data.js').setupBusinessData;


// Location-Based Universal Bot
exports.locationUniversalBot = require('./location-universal-bot.js').locationUniversalBot;


// Fixed Location-Based Universal Bot
exports.fixedLocationBot = require('./fixed-location-bot.js').fixedLocationBot;


// MCP-Based Location Bot


// Simple MCP-Based Location Bot
exports.simpleMCPBot = require('./simple-mcp-bot.js').simpleMCPBot;
