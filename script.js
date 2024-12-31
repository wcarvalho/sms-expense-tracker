// Import Firebase modules directly
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-analytics.js";
import { 
    getFirestore, 
    collection, 
    doc,
    getDocs,
    addDoc,
    setDoc,
    deleteDoc,
    updateDoc,
    query,
    where,
    orderBy,
    getDoc 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

let currentAllowance;

// Load initial data
async function loadData() {
    try {
        const allowanceRef = doc(window.db, 'allowance', 'current');
        const allowanceSnap = await getDoc(allowanceRef);
        if (allowanceSnap.exists()) {
            currentAllowance = allowanceSnap.data().amount;
            updateAllowanceDisplay();
        } else {
            console.warn("No allowance document found");
            currentAllowance = 0;
            updateAllowanceDisplay();
        }

        // Load transactions
        const transactionsRef = collection(window.db, 'transactions');
        const q = query(transactionsRef, orderBy('date', 'desc'));
        const querySnapshot = await getDocs(q);
        
        querySnapshot.forEach((doc) => {
            addTransactionToTable(doc.id, doc.data());
        });
    } catch (error) {
        console.error("Error loading data:", error);
        alert("Error accessing database. Please check your permissions and authentication status.");
    }
}

function updateAllowanceDisplay() {
    document.getElementById('current-allowance').textContent = currentAllowance.toFixed(2);
}

async function addAllowance() {
    const amount = document.getElementById('add-amount').value;
    if (isNaN(amount)) return;

    try {
        const newAmount = currentAllowance + amount;
        const allowanceRef = doc(window.db, 'allowance', 'current');
        await setDoc(allowanceRef, {
            amount: newAmount
        });

        // Add transaction
        const transaction = {
            description: 'Added allowance',
            amount: amount,
            date: new Date(),
            counts: true
        };

        const transactionsRef = collection(window.db, 'transactions');
        const docRef = await addDoc(transactionsRef, transaction);
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
        const transactionRef = doc(window.db, 'transactions', id);
        await updateDoc(transactionRef, {
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
        const transactionRef = doc(window.db, 'transactions', id);
        await deleteDoc(transactionRef);
        // Refresh the page to update the display
        location.reload();
    } catch (error) {
        console.error("Error deleting transaction:", error);
    }
}

async function calculateTotalAllowance() {
    try {
        const transactionsRef = collection(window.db, 'transactions');
        const q = query(transactionsRef, where('counts', '==', true));
        const querySnapshot = await getDocs(q);
        
        let total = 0;
        querySnapshot.forEach(doc => {
            total += doc.data().amount;
        });

        const allowanceRef = doc(window.db, 'allowance', 'current');
        await setDoc(allowanceRef, {
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
        
        // Set db directly on window
        window.db = getFirestore(app);

        // Load data after Firebase is initialized
        await loadData();
    } catch (error) {
        console.error("Firebase initialization error:", error);
        alert("Error connecting to database. Please check your configuration and try again.");
    }
});

// Add event listener when the document loads
document.getElementById('add-allowance-btn').addEventListener('click', addAllowance);
