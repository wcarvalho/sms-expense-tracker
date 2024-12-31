const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize Firebase Admin (same as in sms-webhook.js)
let firebaseApp;
if (!firebaseApp) {
  firebaseApp = initializeApp({
    credential: require('firebase-admin').credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();

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

    // Decode the base64 encoded data
    const decodedBody = Buffer.from(event.body, 'base64').toString();
    
    // Parse the multipart form data
    const parts = decodedBody.split('--xYzZY');
    const emailData = {};
    
    // Extract relevant parts
    for (const [index, part] of parts.entries()) {
      if (part.includes('name="subject"')) {
        console.log(`part ${index}:`, part);
        emailData.subject = part.split('Fwd:').pop().trim();
        console.log('emailData.subject:', emailData.subject);
        break;
      }
    }
    
    // Verify we found a subject
    if (!emailData.subject) {
      return {
        statusCode: 400,
        body: 'Could not find email subject',
      };
    }

    // Extract transaction details from subject
    const subject = emailData.subject;
    console.log('subject:', subject);
    
    // Extract amount using regex
    const amountMatch = subject.match(/\$(\d+\.?\d*)/);
    if (!amountMatch) {
      return {
        statusCode: 400,
        body: 'Could not parse transaction amount',
      };
    }
    const amount = Number(amountMatch[1]);

    // Extract description (everything after "with ")
    const descriptionMatch = subject.match(/with (.*?)$/);
    if (!descriptionMatch) {
      return {
        statusCode: 400,
        body: 'Could not parse transaction description',
      };
    }
    const description = descriptionMatch[1];

    // Create the transaction
    const transaction = {
      description: description.trim(),
      amount: -amount, // Negative amount since it's an expense
      date: new Date().toISOString(), // Current date
      counts: true,
    };

    // Add to Firestore
    const transactionsRef = db.collection('transactions');
    await transactionsRef.add(transaction);

    // Update the current allowance
    const allowanceRef = db.doc('allowance/current');
    const allowanceDoc = await allowanceRef.get();
    const currentAmount = allowanceDoc.exists ? allowanceDoc.data().amount : 0;
    
    await allowanceRef.set({
      amount: currentAmount + transaction.amount
    });

    return {
      statusCode: 200,
      body: 'Transaction recorded successfully',
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