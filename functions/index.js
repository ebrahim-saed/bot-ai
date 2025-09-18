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

    let openaiReply = await askOpenAI(message, freeSlotsString);

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

async function askOpenAI(message, freeSlotsString = '') {
  const apiKey = OPENAI_API_KEY.value();
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY secret. Set it with: firebase functions:secrets:set OPENAI_API_KEY");
  }
  let systemPrompt = `
You are a WhatsApp assistant for a local business.

Behavior rules:
1) Availability questions:
- If the user asks about availability for today (e.g., “what times are you free today?”, “do you have slots?”), reply with: "Today's available slots: <SLOTS>" using AvailableSlots below.
- If there are no available slots, say: "No available slots today."

2) Booking requests:
- If the user requests a specific valid time within today's availability, respond ONLY with:
BOOKING: HH:mm-HH:mm
- Do NOT add any extra text, emojis, or punctuation.
- Use 24-hour HH:mm format.
- Only output BOOKING if the requested interval is fully available per AvailableSlots. Otherwise do not output BOOKING.

3) General chat:
- If it’s not availability or a valid booking request, chat normally and be brief and friendly.

Hard constraints:
- Do not invent or guess times. Only use AvailableSlots.
- If the user asks for an unavailable time, do NOT output BOOKING. Instead, suggest the nearest options from AvailableSlots in normal chat.
- Always assume “today” refers to the business’s current day.

AvailableSlots: ${freeSlotsString && freeSlotsString.trim() ? freeSlotsString : 'none'}
  `.trim();

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
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      }
    }
  );

  return response.data.choices[0].message.content.trim();
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

  // Query bookings for that date and start time, not yet reminded
  const snapshot = await admin.firestore()
    .collection('bookings')
    .where('date', '==', dateStr)
    .where('start', '==', timeStr)
    .where('status', '==', 'confirmed')
    .get();

  if (snapshot.empty) {
    logger.info('No bookings to remind at this time');
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
    const booking = doc.data();
    if (booking.reminderSent) {
      continue;
    }
    const to = booking.phone?.startsWith('whatsapp:') ? booking.phone : `whatsapp:${booking.phone}`;
    const body = `⏰ Reminder: You have an appointment at ${booking.start} today.`;

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

      await doc.ref.update({ reminderSent: true, reminderSentAt: admin.firestore.FieldValue.serverTimestamp() });
      sentCount++;
      logger.info(`Reminder sent to ${to} for booking ${doc.id}`);
    } catch (err) {
      logger.error(`Failed to send reminder for booking ${doc.id}`, err);
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
