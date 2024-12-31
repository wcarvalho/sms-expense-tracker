let currentAllowance;

// Load initial data
async function loadData() {
    try {
        const allowanceDoc = await db.collection('allowance').doc('current').get();
        if (allowanceDoc.exists) {
            currentAllowance = allowanceDoc.data().amount;
            updateAllowanceDisplay();
        }

        // Load transactions
        const transactions = await db.collection('transactions')
            .orderBy('date', 'desc')
            .get();
        
        transactions.forEach(doc => {
            addTransactionToTable(doc.id, doc.data());
        });
    } catch (error) {
        console.error("Error loading data:", error);
    }
}

function updateAllowanceDisplay() {
    document.getElementById('current-allowance').textContent = currentAllowance.toFixed(2);
}

async function addAllowance() {
    const amount = parseFloat(document.getElementById('add-amount').value);
    if (isNaN(amount)) return;

    try {
        const newAmount = currentAllowance + amount;
        await db.collection('allowance').doc('current').set({
            amount: newAmount
        });

        // Add transaction
        const transaction = {
            description: 'Added allowance',
            amount: amount,
            date: new Date(),
            counts: true
        };

        const docRef = await db.collection('transactions').add(transaction);
        addTransactionToTable(docRef.id, transaction);
        
        currentAllowance = newAmount;
        updateAllowanceDisplay();
        document.getElementById('add-amount').value = '';
    } catch (error) {
        console.error("Error adding allowance:", error);
    }
}

function addTransactionToTable(id, transaction) {
    const tbody = document.getElementById('transactions-body');
    const row = document.createElement('tr');
    
    row.innerHTML = `
        <td>${transaction.description}</td>
        <td>$${transaction.amount.toFixed(2)}</td>
        <td>${transaction.date.toDate().toLocaleDateString()}</td>
        <td><input type="checkbox" ${transaction.counts ? 'checked' : ''} 
            onchange="updateTransactionCount('${id}', this.checked)"></td>
        <td><button onclick="deleteTransaction('${id}')">Delete</button></td>
    `;
    
    tbody.prepend(row);
}

async function updateTransactionCount(id, counts) {
    try {
        await db.collection('transactions').doc(id).update({
            counts: counts
        });
        // Recalculate allowance
        calculateTotalAllowance();
    } catch (error) {
        console.error("Error updating transaction:", error);
    }
}

async function deleteTransaction(id) {
    try {
        await db.collection('transactions').doc(id).delete();
        // Refresh the page to update the display
        location.reload();
    } catch (error) {
        console.error("Error deleting transaction:", error);
    }
}

async function calculateTotalAllowance() {
    try {
        const transactions = await db.collection('transactions')
            .where('counts', '==', true)
            .get();
        
        let total = 0;
        transactions.forEach(doc => {
            total += doc.data().amount;
        });

        await db.collection('allowance').doc('current').set({
            amount: total
        });

        currentAllowance = total;
        updateAllowanceDisplay();
    } catch (error) {
        console.error("Error calculating allowance:", error);
    }
}

async function loadFirebaseConfig() {
    try {
        const response = await fetch('/config.json');
        if (!response.ok) {
            throw new Error('Failed to load Firebase configuration');
        }
        return await response.json();
    } catch (error) {
        console.error('Error loading Firebase config:', error);
        throw error;
    }
}

// Modify the existing code to use this config
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const firebaseConfig = await loadFirebaseConfig();
        
        // Initialize Firebase
        const app = initializeApp(firebaseConfig);
        const analytics = getAnalytics(app);
        const db = getFirestore(app);
        window.db = db;

        // Load data after Firebase is initialized
        await loadData();
    } catch (error) {
        console.error('Failed to initialize app:', error);
    }
}); 