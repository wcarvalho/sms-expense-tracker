const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize Firebase Admin
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
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const params = new URLSearchParams(event.body);
    const messageBody = params.get('Body');
    
    // Extract amount using regex
    const amountMatch = messageBody.match(/\$(\d+\.?\d*)/);
    if (!amountMatch) {
      return {
        statusCode: 400,
        body: 'Could not parse transaction amount',
      };
    }
    const amount = Number(amountMatch[1]);

    // Extract date
    const dateMatch = messageBody.match(/on ([A-Za-z]+ \d{1,2}, \d{4})/);
    if (!dateMatch) {
      return {
        statusCode: 400,
        body: 'Could not parse transaction date',
      };
    }
    const dateStr = dateMatch[1];

    // Extract merchant/description
    const descriptionMatch = messageBody.match(/with (.*?) on/);
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
      date: new Date(dateStr).toISOString(),
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

    // Return success response
    return {
      statusCode: 200,
      body: 'Transaction recorded successfully',
      headers: { 'Content-Type': 'text/plain' },
    };
  } catch (error) {
    console.error('Error processing SMS:', error);
    return {
      statusCode: 500,
      body: 'Internal server error',
      headers: { 'Content-Type': 'text/plain' },
    };
  }
}; 