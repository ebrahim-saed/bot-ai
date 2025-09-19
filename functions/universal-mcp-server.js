const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

class UniversalMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'universal-mcp-server',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // Universal Tools
          {
            name: 'detect_business_type',
            description: 'Detect if a business is service-based or product-based',
            inputSchema: {
              type: 'object',
              properties: {
                businessId: { type: 'string', description: 'Business ID' }
              },
              required: ['businessId']
            }
          },
          {
            name: 'get_business_info',
            description: 'Get general business information',
            inputSchema: {
              type: 'object',
              properties: {
                businessId: { type: 'string', description: 'Business ID' }
              },
              required: ['businessId']
            }
          },
          {
            name: 'get_operating_hours',
            description: 'Get business operating hours',
            inputSchema: {
              type: 'object',
              properties: {
                businessId: { type: 'string', description: 'Business ID' },
                date: { type: 'string', description: 'Date in YYYY-MM-DD format' }
              },
              required: ['businessId', 'date']
            }
          },
          // Service Business Tools
          {
            name: 'get_available_appointments',
            description: 'Get available appointment slots for service businesses',
            inputSchema: {
              type: 'object',
              properties: {
                businessId: { type: 'string', description: 'Business ID' },
                serviceId: { type: 'string', description: 'Service ID' },
                date: { type: 'string', description: 'Date in YYYY-MM-DD format' }
              },
              required: ['businessId', 'date']
            }
          },
          {
            name: 'book_appointment',
            description: 'Book an appointment for service businesses',
            inputSchema: {
              type: 'object',
              properties: {
                businessId: { type: 'string', description: 'Business ID' },
                serviceId: { type: 'string', description: 'Service ID' },
                customerName: { type: 'string', description: 'Customer name' },
                customerPhone: { type: 'string', description: 'Customer phone' },
                date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
                time: { type: 'string', description: 'Time in HH:mm format' }
              },
              required: ['businessId', 'serviceId', 'customerName', 'customerPhone', 'date', 'time']
            }
          },
          {
            name: 'get_services',
            description: 'Get available services for a business',
            inputSchema: {
              type: 'object',
              properties: {
                businessId: { type: 'string', description: 'Business ID' }
              },
              required: ['businessId']
            }
          },
          {
            name: 'get_staff_availability',
            description: 'Get staff availability for service businesses',
            inputSchema: {
              type: 'object',
              properties: {
                businessId: { type: 'string', description: 'Business ID' },
                date: { type: 'string', description: 'Date in YYYY-MM-DD format' }
              },
              required: ['businessId', 'date']
            }
          },
          // Product Business Tools
          {
            name: 'get_product_availability',
            description: 'Check product availability and stock levels',
            inputSchema: {
              type: 'object',
              properties: {
                businessId: { type: 'string', description: 'Business ID' },
                productId: { type: 'string', description: 'Product ID' }
              },
              required: ['businessId', 'productId']
            }
          },
          {
            name: 'search_products',
            description: 'Search for products by name or category',
            inputSchema: {
              type: 'object',
              properties: {
                businessId: { type: 'string', description: 'Business ID' },
                query: { type: 'string', description: 'Search query' },
                category: { type: 'string', description: 'Product category (optional)' }
              },
              required: ['businessId', 'query']
            }
          },
          {
            name: 'get_inventory_levels',
            description: 'Get current inventory levels for products',
            inputSchema: {
              type: 'object',
              properties: {
                businessId: { type: 'string', description: 'Business ID' },
                category: { type: 'string', description: 'Product category (optional)' }
              },
              required: ['businessId']
            }
          },
          {
            name: 'place_product_order',
            description: 'Place an order for products',
            inputSchema: {
              type: 'object',
              properties: {
                businessId: { type: 'string', description: 'Business ID' },
                customerName: { type: 'string', description: 'Customer name' },
                customerPhone: { type: 'string', description: 'Customer phone' },
                products: { 
                  type: 'array', 
                  description: 'Array of products with quantities',
                  items: {
                    type: 'object',
                    properties: {
                      productId: { type: 'string' },
                      quantity: { type: 'number' }
                    }
                  }
                },
                deliveryType: { type: 'string', description: 'pickup or delivery' }
              },
              required: ['businessId', 'customerName', 'customerPhone', 'products']
            }
          },
          {
            name: 'get_product_details',
            description: 'Get detailed product information including images',
            inputSchema: {
              type: 'object',
              properties: {
                businessId: { type: 'string', description: 'Business ID' },
                productId: { type: 'string', description: 'Product ID' }
              },
              required: ['businessId', 'productId']
            }
          }
        ]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          // Universal Tools
          case 'detect_business_type':
            return await this.detectBusinessType(args);
          case 'get_business_info':
            return await this.getBusinessInfo(args);
          case 'get_operating_hours':
            return await this.getOperatingHours(args);
          
          // Service Business Tools
          case 'get_available_appointments':
            return await this.getAvailableAppointments(args);
          case 'book_appointment':
            return await this.bookAppointment(args);
          case 'get_services':
            return await this.getServices(args);
          case 'get_staff_availability':
            return await this.getStaffAvailability(args);
          
          // Product Business Tools
          case 'get_product_availability':
            return await this.getProductAvailability(args);
          case 'search_products':
            return await this.searchProducts(args);
          case 'get_inventory_levels':
            return await this.getInventoryLevels(args);
          case 'place_product_order':
            return await this.placeProductOrder(args);
          case 'get_product_details':
            return await this.getProductDetails(args);
          
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`
            }
          ]
        };
      }
    });
  }

  // Universal Tools Implementation
  async detectBusinessType(args) {
    const { businessId } = args;
    
    const businessDoc = await admin.firestore()
      .collection('businesses')
      .doc(businessId)
      .get();

    if (!businessDoc.exists) {
      throw new Error(`Business ${businessId} not found`);
    }

    const businessData = businessDoc.data();
    const businessType = businessData.businessType || 'unknown';

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            businessId,
            businessType,
            businessName: businessData.businessName,
            detected: businessType !== 'unknown'
          }, null, 2)
        }
      ]
    };
  }

  async getBusinessInfo(args) {
    const { businessId } = args;
    
    const businessDoc = await admin.firestore()
      .collection('businesses')
      .doc(businessId)
      .get();

    if (!businessDoc.exists) {
      throw new Error(`Business ${businessId} not found`);
    }

    const businessData = businessDoc.data();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            businessId,
            businessName: businessData.businessName,
            businessType: businessData.businessType,
            businessInfo: businessData.businessInfo,
            settings: businessData.settings
          }, null, 2)
        }
      ]
    };
  }

  async getOperatingHours(args) {
    const { businessId, date } = args;
    
    const hoursDoc = await admin.firestore()
      .collection('operating_hours')
      .doc(`${businessId}_${date}`)
      .get();

    if (!hoursDoc.exists) {
      // Return default hours if not set
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              businessId,
              date,
              hours: 'Not set - using default business hours',
              isOpen: true
            }, null, 2)
          }
        ]
      };
    }

    const hoursData = hoursDoc.data();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            businessId,
            date,
            hours: hoursData.hours,
            isOpen: hoursData.isOpen
          }, null, 2)
        }
      ]
    };
  }

  // Service Business Tools Implementation
  async getAvailableAppointments(args) {
    const { businessId, serviceId, date } = args;
    
    // Get operating hours
    const hoursDoc = await admin.firestore()
      .collection('operating_hours')
      .doc(`${businessId}_${date}`)
      .get();

    if (!hoursDoc.exists) {
      throw new Error('No operating hours set for this date');
    }

    const hoursData = hoursDoc.data();
    
    // Get existing appointments
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
    const availableSlots = this.calculateAvailableSlots(hoursData.hours, appointments, serviceId);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            businessId,
            serviceId,
            date,
            availableSlots,
            totalSlots: availableSlots.length
          }, null, 2)
        }
      ]
    };
  }

  async bookAppointment(args) {
    const { businessId, serviceId, customerName, customerPhone, date, time } = args;
    
    // Check if slot is available
    const availableSlots = await this.getAvailableAppointments({ businessId, serviceId, date });
    const availableData = JSON.parse(availableSlots.content[0].text);
    
    const isAvailable = availableData.availableSlots.some(slot => 
      slot.start === time
    );

    if (!isAvailable) {
      throw new Error('Time slot is not available');
    }

    // Create appointment
    const appointmentRef = await admin.firestore().collection('appointments').add({
      businessId,
      serviceId,
      customerName,
      customerPhone,
      date,
      time,
      status: 'confirmed',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: 'Appointment booked successfully',
            appointmentId: appointmentRef.id
          }, null, 2)
        }
      ]
    };
  }

  async getServices(args) {
    const { businessId } = args;
    
    const servicesSnapshot = await admin.firestore()
      .collection('services')
      .where('businessId', '==', businessId)
      .get();

    const services = [];
    servicesSnapshot.forEach(doc => {
      services.push({ id: doc.id, ...doc.data() });
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            businessId,
            services,
            totalServices: services.length
          }, null, 2)
        }
      ]
    };
  }

  async getStaffAvailability(args) {
    const { businessId, date } = args;
    
    const staffSnapshot = await admin.firestore()
      .collection('staff')
      .where('businessId', '==', businessId)
      .get();

    const staff = [];
    staffSnapshot.forEach(doc => {
      staff.push({ id: doc.id, ...doc.data() });
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            businessId,
            date,
            staff,
            totalStaff: staff.length
          }, null, 2)
        }
      ]
    };
  }

  // Product Business Tools Implementation
  async getProductAvailability(args) {
    const { businessId, productId } = args;
    
    const productDoc = await admin.firestore()
      .collection('products')
      .doc(productId)
      .get();

    if (!productDoc.exists) {
      throw new Error(`Product ${productId} not found`);
    }

    const productData = productDoc.data();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            businessId,
            productId,
            productName: productData.productName,
            stock: productData.stock,
            available: productData.stock > 0,
            price: productData.price
          }, null, 2)
        }
      ]
    };
  }

  async searchProducts(args) {
    const { businessId, query, category } = args;
    
    let productsQuery = admin.firestore()
      .collection('products')
      .where('businessId', '==', businessId);

    if (category) {
      productsQuery = productsQuery.where('category', '==', category);
    }

    const productsSnapshot = await productsQuery.get();

    const products = [];
    productsSnapshot.forEach(doc => {
      const productData = doc.data();
      // Simple text search
      if (productData.productName.toLowerCase().includes(query.toLowerCase()) ||
          productData.description.toLowerCase().includes(query.toLowerCase())) {
        products.push({ id: doc.id, ...productData });
      }
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            businessId,
            query,
            category,
            products,
            totalFound: products.length
          }, null, 2)
        }
      ]
    };
  }

  async getInventoryLevels(args) {
    const { businessId, category } = args;
    
    let productsQuery = admin.firestore()
      .collection('products')
      .where('businessId', '==', businessId);

    if (category) {
      productsQuery = productsQuery.where('category', '==', category);
    }

    const productsSnapshot = await productsQuery.get();

    const inventory = [];
    productsSnapshot.forEach(doc => {
      const productData = doc.data();
      inventory.push({
        productId: doc.id,
        productName: productData.productName,
        stock: productData.stock,
        category: productData.category
      });
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            businessId,
            category,
            inventory,
            totalProducts: inventory.length,
            lowStock: inventory.filter(item => item.stock < 10).length
          }, null, 2)
        }
      ]
    };
  }

  async placeProductOrder(args) {
    const { businessId, customerName, customerPhone, products, deliveryType } = args;
    
    let totalAmount = 0;
    const orderItems = [];

    // Validate products and calculate total
    for (const item of products) {
      const productDoc = await admin.firestore()
        .collection('products')
        .doc(item.productId)
        .get();

      if (!productDoc.exists) {
        throw new Error(`Product ${item.productId} not found`);
      }

      const productData = productDoc.data();
      
      if (productData.stock < item.quantity) {
        throw new Error(`Insufficient stock for ${productData.productName}`);
      }

      const itemTotal = productData.price * item.quantity;
      totalAmount += itemTotal;

      orderItems.push({
        productId: item.productId,
        productName: productData.productName,
        quantity: item.quantity,
        price: productData.price,
        total: itemTotal
      });
    }

    // Create order
    const orderRef = await admin.firestore().collection('orders').add({
      businessId,
      customerName,
      customerPhone,
      products: orderItems,
      totalAmount,
      deliveryType: deliveryType || 'pickup',
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: 'Order placed successfully',
            orderId: orderRef.id,
            totalAmount,
            orderItems
          }, null, 2)
        }
      ]
    };
  }

  async getProductDetails(args) {
    const { businessId, productId } = args;
    
    const productDoc = await admin.firestore()
      .collection('products')
      .doc(productId)
      .get();

    if (!productDoc.exists) {
      throw new Error(`Product ${productId} not found`);
    }

    const productData = productDoc.data();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            businessId,
            productId,
            productName: productData.productName,
            description: productData.description,
            price: productData.price,
            stock: productData.stock,
            images: productData.images || [],
            category: productData.category,
            available: productData.stock > 0
          }, null, 2)
        }
      ]
    };
  }

  // Helper Functions
  calculateAvailableSlots(operatingHours, appointments, serviceId) {
    const availableSlots = [];
    
    // This is a simplified version - in production you'd want more sophisticated logic
    for (const hour of operatingHours) {
      const startTime = this.timeToMinutes(hour.start);
      const endTime = this.timeToMinutes(hour.end);
      
      // Generate 30-minute slots
      for (let time = startTime; time < endTime; time += 30) {
        const timeStr = this.minutesToTime(time);
        
        // Check if this slot is booked
        const isBooked = appointments.some(appointment => 
          appointment.time === timeStr
        );
        
        if (!isBooked) {
          availableSlots.push({
            start: timeStr,
            end: this.minutesToTime(time + 30)
          });
        }
      }
    }
    
    return availableSlots;
  }

  timeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }

  minutesToTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Universal MCP server running on stdio');
  }
}

// Start the server
if (require.main === module) {
  const server = new UniversalMCPServer();
  server.run().catch(console.error);
}

module.exports = UniversalMCPServer;
