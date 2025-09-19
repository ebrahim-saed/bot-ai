# 🚀 Universal MCP AI Bot - Hackathon Project

## 🎯 Project Overview

A revolutionary **Model Context Protocol (MCP) AI bot** that intelligently handles **two major business categories**:

### 🏢 Service Businesses
- **Barber Shops, Salons, Spas** - Appointment booking, service scheduling
- **Lawyers, Consultants, Therapists** - Session booking, availability management
- **Doctors, Dentists, Veterinarians** - Medical appointment scheduling
- **Tutors, Trainers, Coaches** - Lesson booking, skill-based scheduling
- **Event Planners, Photographers** - Event management, package deals

### 🛒 Product Businesses
- **Supermarkets, Grocery Stores** - Inventory management, order processing
- **Restaurants, Cafes, Food Trucks** - Menu management, delivery orders
- **Retail Stores, Boutiques** - Product catalog, stock management
- **Pharmacies, Health Stores** - Prescription management, health products
- **Electronics, Hardware Stores** - Technical products, specifications

## 🌟 Key Features

### Service Business Capabilities
- ✅ **Smart Appointment Booking** - AI understands natural language requests
- ✅ **Service Management** - Multiple services with different durations
- ✅ **Staff Scheduling** - Handle multiple staff members
- ✅ **Event Management** - Group bookings, workshops, packages
- ✅ **Waitlist Management** - Queue management for busy periods
- ✅ **Recurring Appointments** - Regular client management
- ✅ **Service Packages** - Bundled services with discounts
- ✅ **Real-time Availability** - Live slot checking

### Product Business Capabilities
- ✅ **Intelligent Inventory Management** - Real-time stock tracking
- ✅ **Product Catalog** - Images, descriptions, detailed information
- ✅ **Smart Search** - Natural language product search
- ✅ **Order Management** - Seamless order placement and tracking
- ✅ **Price Management** - Dynamic pricing, discounts, bulk orders
- ✅ **Delivery Scheduling** - Home delivery, pickup options
- ✅ **Stock Alerts** - Low stock notifications
- ✅ **Category Management** - Organized product categorization

## 🏗️ Technical Architecture

### MCP Tools Structure
```
Universal MCP Server
├── Universal Tools
│   ├── detect_business_type
│   ├── get_business_info
│   └── get_operating_hours
├── Service Business Tools
│   ├── get_available_appointments
│   ├── book_appointment
│   ├── get_services
│   └── get_staff_availability
└── Product Business Tools
    ├── get_product_availability
    ├── search_products
    ├── get_inventory_levels
    ├── place_product_order
    └── get_product_details
```

### Database Schema
```
Firebase Collections:
├── businesses (business info, type detection)
├── services (service definitions for service businesses)
├── products (product catalog for product businesses)
├── appointments (booking records)
├── orders (product orders)
├── staff (staff information)
└── conversations (AI interaction logs)
```

## 🎬 Demo Scenarios

### Service Business Demo: "Hair Studio Pro"
```
Customer: "I need a haircut and color treatment"
Bot: "I can help you book a haircut and color! Let me check our availability..."
Bot: "We have these services available:
      - Haircut (30 min, $45)
      - Hair Color (2 hours, $120)
      - Haircut + Color Package (2.5 hours, $150)
      
      Available slots today: 10:00, 14:00, 16:00
      Which would you prefer?"

Customer: "Book me for the package at 2 PM"
Bot: "✅ You're booked for Haircut + Color Package at 14:00 today. 
      Your appointment ID is APT-12345. See you then!"
```

### Product Business Demo: "Fresh Market"
```
Customer: "Do you have organic apples in stock?"
Bot: "Yes! We have Organic Apples in stock:
      - Price: $3.99
      - Stock: 50 available
      - Description: Fresh organic red apples, locally sourced
      
      Would you like to place an order?"

Customer: "I want to order 5 apples"
Bot: "✅ Order placed! 5 Organic Apples for $19.95. 
      Order ID: ORD-67890. 
      Delivery or pickup?"
```

## 🚀 Quick Start

### 1. Setup Demo Data
```bash
npm run setup-demo
```

### 2. Deploy Functions
```bash
firebase deploy --only functions
```

### 3. Test Service Business
```bash
# Test hair studio
curl -X POST https://us-central1-whatsapp-bot-ai-7226e.cloudfunctions.net/universalBot \
  -H "Content-Type: application/json" \
  -d '{"From":"+1234567890","Body":"What services do you offer?","businessId":"hair-studio-pro"}'
```

### 4. Test Product Business
```bash
# Test fresh market
curl -X POST https://us-central1-whatsapp-bot-ai-7226e.cloudfunctions.net/universalBot \
  -H "Content-Type: application/json" \
  -d '{"From":"+1234567890","Body":"Do you have organic apples?","businessId":"fresh-market"}'
```

### 5. Run Complete Test Suite
```bash
npm run test-hackathon
```

## 🎯 Hackathon Presentation Points

### Innovation
- **First Universal MCP Bot** - Handles multiple business types intelligently
- **Business Type Detection** - Automatically adapts to service vs product businesses
- **Natural Language Processing** - Understands complex customer requests
- **Real-time Data Access** - Live Firebase integration through MCP

### Technical Excellence
- **Modern Architecture** - MCP protocol integration
- **Scalable Design** - Easy to add new business types
- **Error Handling** - Robust fallback mechanisms
- **Performance** - Fast response times with caching

### Business Value
- **Reduces Manual Work** - Automates booking and ordering
- **Increases Efficiency** - 24/7 customer service
- **Improves Customer Experience** - Natural language interaction
- **Scalable Solution** - Works for any business type

### Demo Highlights
- **Live Service Booking** - Real appointment scheduling
- **Live Product Orders** - Real inventory management
- **Cross-business Intelligence** - Handles inappropriate requests gracefully
- **Performance Metrics** - Fast response times

## 📊 Test Results

```
🚀 HACKATHON PROJECT TEST SUITE
================================
✅ Service Business scenarios tested
✅ Product Business scenarios tested  
✅ Cross-business type handling tested
✅ Performance tested

🎯 Overall Result: 100% tests passed
🚀 Ready for hackathon presentation!
```

## 🔧 Development Commands

```bash
# Setup demo data
npm run setup-demo

# Run universal MCP server
npm run universal-mcp-server

# Test hackathon scenarios
npm run test-hackathon

# Deploy functions
firebase deploy --only functions

# View logs
firebase functions:log
```

## 🌟 Future Enhancements

- **Multi-language Support** - International business support
- **Payment Integration** - Stripe, PayPal integration
- **Analytics Dashboard** - Business insights and metrics
- **Mobile App** - Native mobile applications
- **Voice Integration** - Voice-based interactions
- **AI Learning** - Machine learning for better responses

## 📞 Contact

**Hackathon Team**: Universal MCP AI Bot
**Project**: Multi-business AI assistant with MCP integration
**Demo**: Live service booking + product ordering
**Innovation**: First universal business AI bot

---

**🚀 Ready to revolutionize business automation!**
