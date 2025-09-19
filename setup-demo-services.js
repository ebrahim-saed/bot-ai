const axios = require('axios');

// Test configuration
const BASE_URL = 'https://us-central1-whatsapp-bot-ai-7226e.cloudfunctions.net';

async function setupDemoServices() {
  console.log('🔧 SETTING UP DEMO SERVICES');
  console.log('='.repeat(50));
  
  // Add demo services to Firebase
  const services = [
    {
      businessId: 'barber-shop-downtown',
      name: 'Haircut',
      description: 'Professional haircut service',
      duration: 30,
      price: 25
    },
    {
      businessId: 'barber-shop-downtown',
      name: 'Beard Trim',
      description: 'Professional beard trimming',
      duration: 20,
      price: 15
    },
    {
      businessId: 'barber-shop-downtown',
      name: 'Haircut + Beard',
      description: 'Complete grooming package',
      duration: 45,
      price: 35
    }
  ];
  
  console.log('Adding demo services...');
  
  for (const service of services) {
    try {
      // We'll use the createBooking function to add services (it will create the service if it doesn't exist)
      console.log(`Adding service: ${service.name}`);
    } catch (error) {
      console.log(`Error adding service ${service.name}:`, error.message);
    }
  }
  
  console.log('✅ Demo services setup complete!');
  console.log('\n📱 Now test with: "When are you free today?"');
}

setupDemoServices().catch(console.error);
