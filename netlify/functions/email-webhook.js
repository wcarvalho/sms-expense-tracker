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
    // Parse the raw email data from SendGrid
    const data = JSON.parse(event.body);
    
    // Log the entire email for debugging
    console.log('Received email:', {
      subject: data.subject,
      text: data.text,
      html: data.html
    });

    // Check if this is a Gmail verification email
    if (data.subject && data.subject.includes('Gmail Forwarding Confirmation')) {
      // Extract verification code - it's usually a number in the email body
      const verificationMatch = data.text.match(/\b\d{5,}\b/);
      const verificationCode = verificationMatch ? verificationMatch[0] : null;

      if (verificationCode) {
        console.log('Gmail Verification Code:', verificationCode);
        return {
          statusCode: 200,
          body: `Gmail Verification Code: ${verificationCode}`,
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