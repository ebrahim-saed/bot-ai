# 🔔 **Appointment Reminder System Documentation**

## 🎯 **Overview**

The appointment reminder system automatically sends WhatsApp notifications to customers 5 minutes before their scheduled appointments. It runs as a background job every minute and integrates seamlessly with the existing WhatsApp bot system.

---

## 🏗️ **System Architecture**

### **📅 Scheduled Job (checkReminders)**
- **Frequency**: Runs every minute via Cloud Scheduler
- **Function**: `checkReminders`
- **Purpose**: Automatically checks for appointments needing reminders
- **Configuration**: `* * * * *` (every minute) in business timezone

### **🔧 Core Logic (processRemindersCore)**
- **Function**: `processRemindersCore(now, options)`
- **Purpose**: Main reminder processing logic
- **Features**:
  - Calculates target time (now + 5 minutes)
  - Queries appointments collection
  - Sends WhatsApp reminders
  - Updates appointment records

### **🧪 Manual Testing (sendReminders)**
- **Function**: `sendReminders`
- **Purpose**: HTTP endpoint for manual testing
- **Usage**: `POST /sendReminders`
- **Parameters**: `tz` (timezone override)

---

## 📊 **How It Works**

### **1. Time Calculation**
```javascript
const targetDate = new Date(now.getTime() + 5 * 60 * 1000); // +5 minutes
const dateStr = targetDate.toLocaleDateString('en-CA'); // YYYY-MM-DD
const timeStr = targetDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }); // HH:mm
```

### **2. Appointment Query**
```javascript
const snapshot = await admin.firestore()
  .collection('appointments')
  .where('date', '==', dateStr)
  .where('time', '==', timeStr)
  .where('status', '==', 'confirmed')
  .get();
```

### **3. Reminder Message**
```
⏰ Reminder: You have a [service] appointment at [time] today at [business]. See you soon!
```

### **4. WhatsApp Integration**
- Uses Twilio WhatsApp API
- Sends to customer's WhatsApp number
- Updates appointment with `reminderSent: true`

---

## 🔧 **Configuration**

### **Environment Variables**
- `BUSINESS_TZ`: Business timezone (default: UTC)
- `TWILIO_ACCOUNT_SID`: Twilio account SID
- `TWILIO_AUTH_TOKEN`: Twilio auth token
- `TWILIO_WHATSAPP_FROM`: WhatsApp sender number

### **Appointment Data Structure**
```javascript
{
  businessId: "barber-shop-downtown",
  serviceId: "haircut",
  serviceName: "haircut",
  businessName: "Barber Shop Downtown",
  customerName: "John Doe",
  customerPhone: "whatsapp:+1234567890",
  date: "2025-09-18",
  time: "10:00",
  status: "confirmed",
  reminderSent: false,
  createdAt: timestamp
}
```

---

## 📱 **Reminder Message Examples**

### **Service Business**
```
⏰ Reminder: You have a haircut appointment at 10:00 today at Barber Shop Downtown. See you soon!
```

### **Product Business**
```
⏰ Reminder: You have a delivery appointment at 14:30 today at Fresh Market. See you soon!
```

---

## 🚀 **Usage**

### **Automatic Operation**
The system runs automatically every minute. No manual intervention required.

### **Manual Testing**
```bash
curl -X POST "https://us-central1-whatsapp-bot-ai-7226e.cloudfunctions.net/sendReminders" \
  -H "Content-Type: application/json" \
  -d '{"tz": "UTC"}'
```

### **Response Format**
```json
{
  "ok": true,
  "sent": 2
}
```

---

## 📈 **Monitoring & Logging**

### **Success Logs**
```
Reminder sent to whatsapp:+1234567890 for appointment abc123
```

### **Error Logs**
```
Failed to send reminder for appointment abc123: [error details]
```

### **Activity Logs**
```
Checking reminders for date=2025-09-18 time=10:00 tz=UTC
No appointments to remind at this time
```

---

## 🔒 **Security & Reliability**

### **Duplicate Prevention**
- Appointments are marked with `reminderSent: true`
- Prevents multiple reminders for the same appointment
- Tracks `reminderSentAt` timestamp

### **Error Handling**
- Comprehensive try-catch blocks
- Graceful failure handling
- Detailed error logging
- Continues processing other appointments if one fails

### **Data Validation**
- Validates phone number format
- Ensures WhatsApp prefix
- Checks appointment status
- Verifies required fields

---

## 🎯 **Features**

### **✅ Core Features**
- **Automatic Scheduling**: Runs every minute
- **5-Minute Advance**: Configurable reminder time
- **WhatsApp Integration**: Native WhatsApp messaging
- **Duplicate Prevention**: Smart reminder tracking
- **Personalized Messages**: Dynamic content generation
- **Error Handling**: Robust error management
- **Timezone Support**: Configurable business timezone
- **Manual Testing**: HTTP endpoint for testing

### **✅ Advanced Features**
- **Multi-Business Support**: Works with all business types
- **Service-Specific Messages**: Includes service details
- **Business Name Integration**: Shows business name
- **Flexible Phone Formats**: Handles various phone formats
- **Comprehensive Logging**: Detailed activity tracking
- **Firebase Integration**: Real-time database updates

---

## 🧪 **Testing**

### **Test Scripts**
- `test-reminder-system.js`: Basic functionality test
- `test-reminder-comprehensive.js`: Full system test

### **Test Scenarios**
1. **Create Appointment**: Book an appointment
2. **Wait for Reminder**: System automatically sends reminder
3. **Verify Message**: Check WhatsApp message received
4. **Check Database**: Verify `reminderSent` flag updated

---

## 📋 **Deployment Status**

### **✅ Deployed Functions**
- `checkReminders`: Scheduled job (every minute)
- `sendReminders`: Manual testing endpoint
- `processRemindersCore`: Core reminder logic

### **✅ Configuration**
- Twilio credentials configured
- WhatsApp number set up
- Timezone configured
- Firebase permissions set

---

## 🎉 **Ready for Production**

The appointment reminder system is fully functional and ready for production use. It provides:

- **Reliable Delivery**: Automatic WhatsApp reminders
- **Professional Messages**: Personalized notification content
- **Scalable Architecture**: Handles multiple businesses
- **Comprehensive Monitoring**: Full logging and error tracking
- **Easy Maintenance**: Simple configuration and testing

**🚀 The reminder system is now live and will automatically send WhatsApp notifications to customers 5 minutes before their appointments!**
