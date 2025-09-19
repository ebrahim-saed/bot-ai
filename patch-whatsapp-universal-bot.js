// Patch to add location-based business discovery to whatsappUniversalBot
const fs = require('fs');

// Read the current index.js file
let indexContent = fs.readFileSync('functions/index.js', 'utf8');

// Find the whatsappUniversalBot function and add location handling
const locationHandlingCode = `
    // First, try to handle location-based queries
    let locationResponse = await handleLocationQuery(message, customer);
    
    if (locationResponse) {
      // Save conversation with location search info
      await admin.firestore().collection("conversations").add({
        customer,
        twilioNumber,
        message,
        reply: locationResponse,
        date: today,
        timezone: tz,
        timestamp: Date.now(),
        platform: 'whatsapp',
        botType: 'universal-location'
      });

      const safeReply = escapeXml(locationResponse);
      res.set('Content-Type', 'text/xml');
      res.status(200).send(\`
        <Response>
            <Message>\${safeReply}</Message>
        </Response>
      \`);
      return;
    }
    
    // If not a location query, continue with existing logic`;

// Insert the location handling code after the business ID detection
const insertPoint = '    // Detect business ID using multiple methods';
const newContent = indexContent.replace(
  insertPoint,
  insertPoint + locationHandlingCode
);

// Write the updated content back
fs.writeFileSync('functions/index.js', newContent);

console.log('✅ Successfully patched whatsappUniversalBot with location-based business discovery!');
