exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: 'Method Not Allowed',
      headers: { 'Content-Type': 'text/plain' }
    };
  }

  try {
    // Log the raw data before parsing
    console.log('Raw webhook data:', event.body);
    
    // Decode the base64 encoded data
    const decodedBody = Buffer.from(event.body, 'base64').toString();
    
    // Parse the multipart form data
    const parts = decodedBody.split('--xYzZY');
    const emailData = {};
    
    // Extract relevant parts
    for (const part of parts) {
      if (part.includes('name="subject"')) {
        emailData.subject = part.split('\n\n')[1].trim();
      }
      if (part.includes('name="email"')) {
        emailData.text = part.split('\n\n')[1].trim();
      }
    }

    // Log the parsed email data
    console.log('Parsed email:', emailData);

    // Check if this is a Gmail verification email
    if (emailData.subject && emailData.subject.includes('Gmail Forwarding Confirmation')) {
      // Extract verification code from the URL instead of looking for numbers
      const urlMatch = emailData.text.match(/https:\/\/mail\.google\.com\/mail\/[^\s]+/);
      if (urlMatch) {
        console.log('Gmail Verification URL:', urlMatch[0]);
        return {
          statusCode: 200,
          body: `Gmail Verification URL: ${urlMatch[0]}`,
          headers: { 'Content-Type': 'text/plain' }
        };
      }
    }

    // If it's not a verification email, process it normally
    // ... your existing transaction processing code here ...

    return {
      statusCode: 200,
      body: 'Email processed',
      headers: { 'Content-Type': 'text/plain' }
    };

  } catch (error) {
    console.error('Error processing email:', error);
    return {
      statusCode: 500,
      body: 'Internal server error',
      headers: { 'Content-Type': 'text/plain' }
    };
  }
};