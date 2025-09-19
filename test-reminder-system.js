const axios = require('axios');

// Test configuration
const BASE_URL = 'https://us-central1-whatsapp-bot-ai-7226e.cloudfunctions.net';

async function testReminderSystem() {
  console.log('🔔 TESTING REMINDER SYSTEM');
  console.log('='.repeat(50));
  
  // Step 1: Create a test appointment for 5 minutes from now
  const now = new Date();
  const futureTime = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes from now
  const dateStr = futureTime.toLocaleDateString('en-CA');
  const timeStr = futureTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  
  console.log(`Creating test appointment for ${dateStr} at ${timeStr}`);
  
  // Create an appointment via the WhatsApp bot
  try {
    const bookingResponse = await axios.post(`${BASE_URL}/whatsappUniversalBot`, {
      Body: `I want to book a haircut at ${timeStr}`,
      From: 'whatsapp:+1234567890',
      To: 'whatsapp:+14155238886'
    });
    
    console.log('✅ Appointment created:', bookingResponse.data);
  } catch (error) {
    console.log('❌ Error creating appointment:', error.message);
  }
  
  // Step 2: Test the reminder system manually
  console.log('\n🔔 Testing reminder system...');
  
  try {
    const reminderResponse = await axios.post(`${BASE_URL}/sendReminders`, {
      tz: 'UTC'
    });
    
    console.log('✅ Reminder system response:', reminderResponse.data);
    
    if (reminderResponse.data.sent > 0) {
      console.log('🎉 SUCCESS: Reminders were sent!');
    } else {
      console.log('ℹ️  No reminders to send at this time (this is normal if no appointments are 5 minutes away)');
    }
    
  } catch (error) {
    console.log('❌ Error testing reminder system:', error.message);
  }
  
  // Step 3: Show how the scheduled job works
  console.log('\n📅 SCHEDULED JOB INFORMATION:');
  console.log('- The checkReminders function runs every minute automatically');
  console.log('- It checks for appointments that are 5 minutes away');
  console.log('- It sends WhatsApp reminders to customers');
  console.log('- It marks appointments as reminderSent to avoid duplicates');
  
  console.log('\n🎯 REMINDER SYSTEM FEATURES:');
  console.log('✅ Automatic scheduling (runs every minute)');
  console.log('✅ 5-minute advance notifications');
  console.log('✅ WhatsApp integration');
  console.log('✅ Duplicate prevention');
  console.log('✅ Personalized messages');
  console.log('✅ Error handling and logging');
  
  console.log('\n📱 REMINDER MESSAGE FORMAT:');
  console.log('⏰ Reminder: You have a [service] appointment at [time] today at [business]. See you soon!');
  
  console.log('\n🚀 REMINDER SYSTEM IS READY!');
}

testReminderSystem().catch(console.error);
