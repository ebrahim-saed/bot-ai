// Setup Business Data Function
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

exports.setupBusinessData = onRequest(async (req, res) => {
  try {
    console.log('🏢 Setting up location-based business data...');

    const businesses = [
      // Haifa Businesses
      {
        id: 'downtown-barbershop-haifa',
        name: 'Downtown BarberShop',
        businessName: 'Downtown BarberShop',
        location: 'haifa',
        address: '123 Main Street, Haifa',
        phone: '+972-4-123-4567',
        businessType: 'service',
        services: ['haircut', 'beard trim', 'shave'],
        description: 'Professional barber shop in downtown Haifa'
      },
      {
        id: 'haifa-hair-studio',
        name: 'Haifa Hair Studio',
        businessName: 'Haifa Hair Studio',
        location: 'haifa',
        address: '456 Oak Avenue, Haifa',
        phone: '+972-4-234-5678',
        businessType: 'service',
        services: ['haircut', 'hair coloring', 'styling'],
        description: 'Modern hair salon in Haifa'
      },
      {
        id: 'modern-cuts-haifa',
        name: 'Modern Cuts',
        businessName: 'Modern Cuts',
        location: 'haifa',
        address: '789 Pine Street, Haifa',
        phone: '+972-4-345-6789',
        businessType: 'service',
        services: ['haircut', 'beard trim'],
        description: 'Contemporary barber shop in Haifa'
      },
      {
        id: 'haifa-fresh-market',
        name: 'Haifa Fresh Market',
        businessName: 'Haifa Fresh Market',
        location: 'haifa',
        address: '321 Market Street, Haifa',
        phone: '+972-4-456-7890',
        businessType: 'product',
        products: ['organic apples', 'fresh vegetables', 'dairy products'],
        description: 'Fresh organic market in Haifa'
      },

      // Tel Aviv Businesses
      {
        id: 'tel-aviv-barbershop',
        name: 'Tel Aviv BarberShop',
        businessName: 'Tel Aviv BarberShop',
        location: 'tel aviv',
        address: '100 Dizengoff Street, Tel Aviv',
        phone: '+972-3-111-2222',
        businessType: 'service',
        services: ['haircut', 'beard trim', 'shave', 'hair styling'],
        description: 'Premium barber shop in Tel Aviv'
      },
      {
        id: 'tel-aviv-supermarket',
        name: 'Tel Aviv Supermarket',
        businessName: 'Tel Aviv Supermarket',
        location: 'tel aviv',
        address: '200 Allenby Street, Tel Aviv',
        phone: '+972-3-222-3333',
        businessType: 'product',
        products: ['groceries', 'household items', 'electronics'],
        description: 'Large supermarket in Tel Aviv'
      },

      // Jerusalem Businesses
      {
        id: 'jerusalem-barbershop',
        name: 'Jerusalem BarberShop',
        businessName: 'Jerusalem BarberShop',
        location: 'jerusalem',
        address: '50 Jaffa Street, Jerusalem',
        phone: '+972-2-333-4444',
        businessType: 'service',
        services: ['haircut', 'beard trim'],
        description: 'Traditional barber shop in Jerusalem'
      },
      {
        id: 'jerusalem-pharmacy',
        name: 'Jerusalem Pharmacy',
        businessName: 'Jerusalem Pharmacy',
        location: 'jerusalem',
        address: '75 King George Street, Jerusalem',
        phone: '+972-2-444-5555',
        businessType: 'product',
        products: ['medications', 'health products', 'cosmetics'],
        description: 'Full-service pharmacy in Jerusalem'
      }
    ];

    // Add businesses to Firestore
    for (const business of businesses) {
      await admin.firestore().collection('businesses').doc(business.id).set(business);
      console.log(`✅ Added business: ${business.name} in ${business.location}`);
    }

    // Add some services for service businesses
    const services = [
      {
        businessId: 'downtown-barbershop-haifa',
        name: 'Haircut',
        duration: 30,
        price: 50,
        description: 'Professional haircut service'
      },
      {
        businessId: 'downtown-barbershop-haifa',
        name: 'Beard Trim',
        duration: 20,
        price: 30,
        description: 'Professional beard trimming'
      },
      {
        businessId: 'haifa-hair-studio',
        name: 'Hair Coloring',
        duration: 120,
        price: 200,
        description: 'Professional hair coloring service'
      },
      {
        businessId: 'tel-aviv-barbershop',
        name: 'Premium Haircut',
        duration: 45,
        price: 80,
        description: 'Premium haircut with styling'
      }
    ];

    for (const service of services) {
      await admin.firestore().collection('services').add(service);
      console.log(`✅ Added service: ${service.name} for ${service.businessId}`);
    }

    // Add some products for product businesses
    const products = [
      {
        businessId: 'haifa-fresh-market',
        name: 'Organic Apples',
        category: 'fruits',
        price: 8.50,
        stock: 100,
        description: 'Fresh organic apples from local farms'
      },
      {
        businessId: 'haifa-fresh-market',
        name: 'Fresh Vegetables',
        category: 'vegetables',
        price: 12.00,
        stock: 50,
        description: 'Fresh seasonal vegetables'
      },
      {
        businessId: 'tel-aviv-supermarket',
        name: 'Household Items',
        category: 'household',
        price: 25.00,
        stock: 200,
        description: 'Various household items'
      }
    ];

    for (const product of products) {
      await admin.firestore().collection('products').add(product);
      console.log(`✅ Added product: ${product.name} for ${product.businessId}`);
    }

    res.status(200).json({
      success: true,
      message: 'Location-based business data setup complete!',
      businesses: businesses.length,
      services: services.length,
      products: products.length
    });

  } catch (error) {
    console.error('❌ Error setting up businesses:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
