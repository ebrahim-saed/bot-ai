const admin = require('firebase-admin');

// Initialize Firebase Admin
admin.initializeApp();

// Demo data for Service Business (Hair Studio)
async function setupServiceBusiness() {
  console.log('🏢 Setting up Service Business Demo Data...');
  
  const businessId = 'hair-studio-pro';
  
  // Create business
  await admin.firestore().collection('businesses').doc(businessId).set({
    businessName: 'Hair Studio Pro',
    businessType: 'service',
    businessInfo: {
      description: 'Professional hair salon offering cuts, colors, and styling',
      address: '123 Main Street, City',
      phone: '+1-555-HAIR-PRO',
      email: 'info@hairstudiopro.com'
    },
    settings: {
      slotDuration: 30,
      advanceBookingDays: 30,
      cancellationHours: 24
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Create services
  const services = [
    {
      businessId,
      serviceName: 'Haircut',
      description: 'Professional haircut and styling',
      duration: 30,
      price: 45,
      staff: ['stylist-1', 'stylist-2']
    },
    {
      businessId,
      serviceName: 'Hair Color',
      description: 'Full hair coloring service',
      duration: 120,
      price: 120,
      staff: ['stylist-1']
    },
    {
      businessId,
      serviceName: 'Haircut + Color',
      description: 'Haircut and color package',
      duration: 150,
      price: 150,
      staff: ['stylist-1']
    },
    {
      businessId,
      serviceName: 'Blowout',
      description: 'Professional blowout styling',
      duration: 45,
      price: 35,
      staff: ['stylist-2']
    }
  ];

  for (const service of services) {
    await admin.firestore().collection('services').add(service);
  }

  // Create staff
  const staff = [
    {
      businessId,
      staffName: 'Sarah Johnson',
      role: 'Senior Stylist',
      specialties: ['Haircut', 'Hair Color', 'Haircut + Color'],
      workingHours: { start: '09:00', end: '17:00' }
    },
    {
      businessId,
      staffName: 'Mike Chen',
      role: 'Stylist',
      specialties: ['Haircut', 'Blowout'],
      workingHours: { start: '10:00', end: '18:00' }
    }
  ];

  for (const staffMember of staff) {
    await admin.firestore().collection('staff').add(staffMember);
  }

  // Set operating hours for today
  const today = new Date().toLocaleDateString('en-CA');
  await admin.firestore().collection('operating_hours').doc(`${businessId}_${today}`).set({
    businessId,
    date: today,
    hours: [
      { start: '09:00', end: '18:00' }
    ],
    isOpen: true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log('✅ Service Business setup complete!');
  return businessId;
}

// Demo data for Product Business (Fresh Market)
async function setupProductBusiness() {
  console.log('🛒 Setting up Product Business Demo Data...');
  
  const businessId = 'fresh-market';
  
  // Create business
  await admin.firestore().collection('businesses').doc(businessId).set({
    businessName: 'Fresh Market',
    businessType: 'product',
    businessInfo: {
      description: 'Local grocery store with fresh produce and organic products',
      address: '456 Oak Avenue, City',
      phone: '+1-555-FRESH',
      email: 'orders@freshmarket.com'
    },
    settings: {
      deliveryRadius: 10,
      minOrderAmount: 25,
      deliveryFee: 5
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Create products
  const products = [
    {
      businessId,
      productName: 'Organic Apples',
      description: 'Fresh organic red apples, locally sourced',
      price: 3.99,
      stock: 50,
      category: 'Produce',
      images: ['https://example.com/apple1.jpg', 'https://example.com/apple2.jpg']
    },
    {
      businessId,
      productName: 'Whole Milk',
      description: 'Fresh whole milk, 1 gallon',
      price: 4.49,
      stock: 25,
      category: 'Dairy',
      images: ['https://example.com/milk1.jpg']
    },
    {
      businessId,
      productName: 'Organic Bread',
      description: 'Artisan organic whole wheat bread',
      price: 5.99,
      stock: 15,
      category: 'Bakery',
      images: ['https://example.com/bread1.jpg']
    },
    {
      businessId,
      productName: 'Free Range Eggs',
      description: 'Farm fresh free range eggs, dozen',
      price: 6.99,
      stock: 30,
      category: 'Dairy',
      images: ['https://example.com/eggs1.jpg']
    },
    {
      businessId,
      productName: 'Organic Spinach',
      description: 'Fresh organic baby spinach',
      price: 2.99,
      stock: 20,
      category: 'Produce',
      images: ['https://example.com/spinach1.jpg']
    },
    {
      businessId,
      productName: 'Greek Yogurt',
      description: 'Plain Greek yogurt, 32oz',
      price: 4.99,
      stock: 18,
      category: 'Dairy',
      images: ['https://example.com/yogurt1.jpg']
    }
  ];

  for (const product of products) {
    await admin.firestore().collection('products').add(product);
  }

  console.log('✅ Product Business setup complete!');
  return businessId;
}

// Setup both businesses
async function setupDemoData() {
  console.log('🚀 Setting up Hackathon Demo Data...\n');
  
  try {
    const serviceBusinessId = await setupServiceBusiness();
    const productBusinessId = await setupProductBusiness();
    
    console.log('\n🎉 Demo Data Setup Complete!');
    console.log('================================');
    console.log(`Service Business ID: ${serviceBusinessId}`);
    console.log(`Product Business ID: ${productBusinessId}`);
    console.log('\nYou can now test both business types!');
    
  } catch (error) {
    console.error('❌ Error setting up demo data:', error);
  }
}

// Run setup
setupDemoData();
