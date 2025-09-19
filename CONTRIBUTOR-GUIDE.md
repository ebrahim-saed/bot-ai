# 🤖 Universal MCP AI Bot - Contributor Guide

## 🎯 **PROJECT OVERVIEW**

Welcome to the **Universal MCP AI Bot** project! This is a sophisticated WhatsApp-based business discovery and appointment booking system that helps customers find and interact with local businesses using AI-powered conversations.

### **What This Project Does:**
- **Location-Based Business Discovery**: Customers can search for businesses by location (e.g., "barber shops in Haifa")
- **Appointment Booking**: Book appointments with service businesses
- **Product Ordering**: Order products from local businesses
- **Automated Reminders**: Send WhatsApp reminders 5 minutes before appointments
- **Multi-Business Support**: Handles both service and product businesses

---

## 🏗️ **TECHNICAL ARCHITECTURE**

### **Core Technologies:**
- **Firebase Functions**: Serverless backend (Node.js 18)
- **Firebase Firestore**: Real-time NoSQL database
- **Twilio**: WhatsApp Business API integration
- **OpenAI GPT-4**: AI language processing
- **Model Context Protocol (MCP)**: Tool-based AI architecture

### **System Components:**
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   WhatsApp      │    │  Firebase       │    │   OpenAI        │
│   (Twilio)      │◄──►│  Functions      │◄──►│   GPT-4         │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Customer      │    │  Firestore      │    │   MCP Tools     │
│   Messages      │    │  Database       │    │   (Business     │
│                 │    │                 │    │    Discovery)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

---

## 🔄 **SYSTEM FLOW**

### **1. Customer Interaction Flow:**
```
Customer sends WhatsApp message
         ↓
Twilio receives message
         ↓
Firebase Function processes message
         ↓
AI analyzes message and determines intent
         ↓
MCP Tools execute business logic
         ↓
Response sent back via WhatsApp
```

### **2. Location-Based Business Discovery:**
```
Customer: "Give me all barber shops in Haifa"
         ↓
AI detects location query
         ↓
search_businesses_by_location tool executes
         ↓
Firebase query: businesses where location = "haifa"
         ↓
Results filtered by business type
         ↓
Numbered list returned to customer
         ↓
Customer selects business by number
         ↓
Business context maintained for future interactions
```

### **3. Appointment Booking Flow:**
```
Customer: "Book me a haircut at 2 PM"
         ↓
AI detects booking intent
         ↓
get_available_appointments tool checks availability
         ↓
book_appointment tool creates appointment
         ↓
Appointment saved to Firestore
         ↓
Confirmation sent to customer
         ↓
Reminder system schedules 5-minute advance notification
```

### **4. Reminder System Flow:**
```
Cloud Scheduler triggers checkReminders every minute
         ↓
Function calculates: current time + 5 minutes
         ↓
Query appointments for that exact time
         ↓
Send WhatsApp reminders to customers
         ↓
Mark appointments as reminderSent = true
```

---

## 📁 **PROJECT STRUCTURE**

```
bot-ai/
├── functions/                    # Firebase Functions
│   ├── index.js                 # Main functions file
│   ├── fixed-location-bot.js    # Working location bot
│   ├── simple-mcp-bot.js        # MCP-based bot (needs fixing)
│   ├── setup-business-data.js   # Business data setup
│   └── universal-mcp-server.js  # MCP server (backup)
├── public/                      # Static files
├── firebase.json               # Firebase configuration
├── firestore.rules            # Database security rules
└── Documentation files        # Various README files
```

---

## 🚀 **CURRENT STATUS**

### **✅ WORKING FEATURES:**
- **Location-based business search**: "Give me all barber shops in Haifa"
- **Business selection**: Choose from numbered lists
- **Appointment booking**: Book appointments with selected businesses
- **Reminder system**: Automated 5-minute advance notifications
- **WhatsApp integration**: Full Twilio support
- **Database operations**: All CRUD operations working

### **⚠️ NEEDS IMPROVEMENT:**
- **MCP AI Bots**: Tool calling not working properly
- **Natural language handling**: Limited to exact patterns
- **Complex queries**: Some variations not supported
- **Error handling**: Could be more robust

---

## 🛠️ **SETUP INSTRUCTIONS**

### **Prerequisites:**
- Node.js 18+
- Firebase CLI
- Git
- Twilio account
- OpenAI API key

### **Installation:**
```bash
# Clone the repository
git clone <repository-url>
cd bot-ai

# Install dependencies
npm install

# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Set up project
firebase use whatsapp-bot-ai-7226e

# Install function dependencies
cd functions
npm install
cd ..
```

### **Environment Setup:**
```bash
# Set Firebase project
firebase use whatsapp-bot-ai-7226e

# Deploy functions
firebase deploy --only functions

# Set up business data
curl -X POST "https://us-central1-whatsapp-bot-ai-7226e.cloudfunctions.net/setupBusinessData"
```

---

## 🧪 **TESTING**

### **Test Location Search:**
```bash
curl -X POST "https://us-central1-whatsapp-bot-ai-7226e.cloudfunctions.net/fixedLocationBot" \
  -H "Content-Type: application/json" \
  -d '{"From":"+1234567890","Body":"Give me all barber shops in Haifa","To":"whatsapp:+14155238886"}'
```

### **Test Reminder System:**
```bash
curl -X POST "https://us-central1-whatsapp-bot-ai-7226e.cloudfunctions.net/sendReminders"
```

### **Available Test Files:**
- `test-whatsapp-bots.js` - Test WhatsApp integration
- `test-reminder-system.js` - Test reminder functionality
- `test-hackathon-scenarios.js` - Comprehensive test suite

---

## 🎯 **CONTRIBUTION OPPORTUNITIES**

### **High Priority:**
1. **Fix MCP Bot Tool Calling**: Debug why tools aren't being called
2. **Improve Natural Language**: Handle more query variations
3. **Add Error Handling**: Better error messages and recovery
4. **Performance Optimization**: Reduce latency and improve response times

### **Medium Priority:**
1. **Add More Business Types**: Restaurants, pharmacies, etc.
2. **Enhance UI/UX**: Better message formatting
3. **Add Analytics**: Track usage and performance
4. **Internationalization**: Support multiple languages

### **Low Priority:**
1. **Add Tests**: Unit tests and integration tests
2. **Documentation**: API documentation and guides
3. **Monitoring**: Add logging and monitoring
4. **Security**: Enhance security measures

---

## 🔧 **DEVELOPMENT WORKFLOW**

### **Making Changes:**
1. **Create feature branch**: `git checkout -b feature/your-feature`
2. **Make changes**: Edit code in `functions/` directory
3. **Test locally**: Use Firebase emulator or test endpoints
4. **Deploy**: `firebase deploy --only functions:functionName`
5. **Test deployed**: Verify functionality works
6. **Create PR**: Submit pull request for review

### **Code Style:**
- Use ES6+ JavaScript
- Follow Firebase Functions best practices
- Add comments for complex logic
- Use meaningful variable names
- Handle errors gracefully

---

## �� **DATABASE SCHEMA**

### **Collections:**
- **businesses**: Business information and locations
- **appointments**: Customer appointments
- **orders**: Product orders
- **customer_sessions**: User context and selections
- **conversations**: Chat history
- **services**: Available services for businesses
- **products**: Product catalogs

### **Example Business Document:**
```javascript
{
  id: "downtown-barbershop-haifa",
  name: "Downtown BarberShop",
  location: "haifa",
  address: "123 Main Street, Haifa",
  phone: "+972-4-123-4567",
  businessType: "service",
  services: ["haircut", "beard trim", "shave"]
}
```

---

## 🚨 **COMMON ISSUES & SOLUTIONS**

### **Issue: Function not deploying**
- **Solution**: Check Firebase CLI version and project settings
- **Command**: `firebase use whatsapp-bot-ai-7226e`

### **Issue: Tool calling not working**
- **Solution**: Check OpenAI API key and tool definitions
- **Debug**: Add logging to tool execution functions

### **Issue: WhatsApp messages not sending**
- **Solution**: Verify Twilio credentials and webhook URLs
- **Check**: Twilio console for message status

### **Issue: Database queries failing**
- **Solution**: Check Firestore rules and indexes
- **Debug**: Use Firebase console to inspect data

---

## 📚 **LEARNING RESOURCES**

### **Firebase:**
- [Firebase Functions Documentation](https://firebase.google.com/docs/functions)
- [Firestore Documentation](https://firebase.google.com/docs/firestore)

### **Twilio:**
- [Twilio WhatsApp API](https://www.twilio.com/docs/whatsapp)
- [Webhook Configuration](https://www.twilio.com/docs/messaging/webhooks)

### **OpenAI:**
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [Function Calling Guide](https://platform.openai.com/docs/guides/function-calling)

### **MCP:**
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/sdk)

---

## 🤝 **GETTING STARTED**

### **First Steps:**
1. **Read this guide thoroughly**
2. **Set up development environment**
3. **Deploy and test existing functions**
4. **Pick a small issue to work on**
5. **Join the team communication channel**

### **Recommended First Tasks:**
1. **Fix a simple bug** in the existing code
2. **Add a new business type** to the database
3. **Improve error messages** in one of the bots
4. **Add logging** to track function execution

### **Questions?**
- Check existing documentation files
- Look at test files for examples
- Ask team members for guidance
- Create issues for bugs or feature requests

---

## 🎉 **WELCOME TO THE TEAM!**

This project is a great opportunity to work with cutting-edge AI technology, real-time messaging, and scalable cloud infrastructure. The system is already functional and serving real users, so your contributions will have immediate impact.

**Happy coding! 🚀**
