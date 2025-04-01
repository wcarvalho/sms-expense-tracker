// Import Firebase modules directly
import { initializeApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
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
    getDoc,
    deleteField
} from 'firebase/firestore';

let db;
let currentAllowance;

// Categories
const CATEGORIES = {
    UNORGANIZED: 'unorganized',
    ALLOWANCE: 'allowance',
    NEED: 'need',
    REIMBURSE: 'reimburse',
    REIMBURSED: 'reimbursed'
};

// Load initial data
async function loadData() {
    try {
        // Load current allowance
        const allowanceRef = doc(db, 'allowance', 'current');
        const allowanceSnap = await getDoc(allowanceRef);
        if (allowanceSnap.exists()) {
            currentAllowance = Number(allowanceSnap.data().amount);
            updateAllowanceDisplay();
        } else {
            console.warn("No allowance document found");
            currentAllowance = 0;
            updateAllowanceDisplay();
        }

        // Load transactions
        const transactionsRef = collection(db, 'transactions');
        const q = query(transactionsRef, orderBy('date', 'desc'));
        const querySnapshot = await getDocs(q);

        console.log('looping through transactions');
        // Clear existing table
        document.getElementById('transactions-body').innerHTML = '';
        
        // Calculate total allowance
        let allowanceTotal = 0;
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            // Convert old data: if 'counts' is true, set category to 'allowance', otherwise 'unorganized'
            if (data.counts !== undefined && !data.category) {
                data.category = data.counts ? CATEGORIES.ALLOWANCE : CATEGORIES.UNORGANIZED;
                // Update the document in Firestore
                updateDoc(doc.ref, { 
                    category: data.category,
                    counts: deleteField() // Remove the old field
                });
            } else if (!data.category) {
                data.category = CATEGORIES.UNORGANIZED;
                // Update the document in Firestore
                updateDoc(doc.ref, { category: CATEGORIES.UNORGANIZED });
            }
            
            addTransactionToTable(doc.id, data);
            
            // Only count allowance category transactions for the total
            if (data.category === CATEGORIES.ALLOWANCE) {
                allowanceTotal += Number(data.amount);
            }
        });
        
        // Update allowance
        await setDoc(allowanceRef, {
            amount: allowanceTotal
        });
        
        currentAllowance = allowanceTotal;
        updateAllowanceDisplay();
    } catch (error) {
        console.error("Error loading data:", error);
    }
}

function updateAllowanceDisplay() {
    document.getElementById('current-allowance').textContent = (isNaN(currentAllowance) ? 0 : currentAllowance).toFixed(2);
}

async function addAllowance() {
    const amount = Number(document.getElementById('add-amount').value);
    if (isNaN(amount)) return 0;
    if (amount === 0) return 0;
  
    try {
        // Add transaction with Firestore Timestamp
        const transaction = {
            description: 'Allowance',
            amount: amount,
            date: new Date().toISOString(), // Store as ISO string for consistency
            category: CATEGORIES.ALLOWANCE
        };

        const transactionsRef = collection(db, 'transactions');
        const docRef = await addDoc(transactionsRef, transaction);
        addTransactionToTable(docRef.id, transaction);

        // Recalculate and update allowance total
        await calculateAllowanceTotal();
        
        document.getElementById('add-amount').value = '';
    } catch (error) {
        console.error("Error adding allowance:", error);
    }
}

function addTransactionToTable(id, transaction) {
    const tbody = document.getElementById('transactions-body');
    const row = document.createElement('tr');
    
    // Set row class based on category
    row.className = `category-${transaction.category || CATEGORIES.UNORGANIZED}`;
    row.dataset.id = id;
    
    const amount = Number(transaction.amount);
    
    // Handle both Firestore Timestamp and ISO string dates
    const date = transaction.date?.toDate ? 
        transaction.date.toDate().toLocaleDateString() : 
        new Date(transaction.date).toLocaleDateString();
    
    row.innerHTML = `
        <td>${transaction.description}</td>
        <td>$${amount.toFixed(2)}</td>
        <td>${date}</td>
        <td><button class="category-button" data-id="${id}">${transaction.category || CATEGORIES.UNORGANIZED}</button></td>
        <td><button data-id="${id}" class="delete-btn">Delete</button></td>
    `;
    
    // Add event listeners
    const categoryBtn = row.querySelector('.category-button');
    categoryBtn.addEventListener('click', () => toggleCategory(id));
    
    const deleteBtn = row.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', () => deleteTransaction(id));
    
    tbody.appendChild(row);
}

// Toggle between categories
async function toggleCategory(id) {
    try {
        const transactionRef = doc(db, 'transactions', id);
        const transactionSnap = await getDoc(transactionRef);
        
        if (transactionSnap.exists()) {
            // Always get the current category from Firestore
            const oldCategory = transactionSnap.data().category || CATEGORIES.UNORGANIZED;
            
            const categories = Object.values(CATEGORIES);
            const currentIndex = categories.indexOf(oldCategory);
            const nextIndex = (currentIndex + 1) % categories.length;
            const newCategory = categories[nextIndex];
            
            // Update the document
            await updateDoc(transactionRef, {
                category: newCategory
            });
            
            // Update the UI
            const row = document.querySelector(`tr[data-id="${id}"]`);
            row.className = `category-${newCategory}`;
            const button = row.querySelector('.category-button');
            button.textContent = newCategory;
            
            // Recalculate allowance total if needed
            if (oldCategory === CATEGORIES.ALLOWANCE || newCategory === CATEGORIES.ALLOWANCE) {
                await calculateAllowanceTotal();
            }
        }
    } catch (error) {
        console.error("Error updating category:", error);
    }
}

async function deleteTransaction(id) {
    try {
        const transactionRef = doc(db, 'transactions', id);
        const transactionSnap = await getDoc(transactionRef);
        
        if (transactionSnap.exists()) {
            // Delete the transaction
            await deleteDoc(transactionRef);
            
            // Recalculate allowance total if needed
            if (transactionSnap.data().category === CATEGORIES.ALLOWANCE) {
                await calculateAllowanceTotal();
            }
        }
        
        // Remove the row from the table
        const row = document.querySelector(`tr[data-id="${id}"]`);
        row.remove();
    } catch (error) {
        console.error("Error deleting transaction:", error);
    }
}

async function calculateAllowanceTotal() {
    try {
        const transactionsRef = collection(db, 'transactions');
        const q = query(transactionsRef, where('category', '==', CATEGORIES.ALLOWANCE));
        const querySnapshot = await getDocs(q);
        
        let total = 0;
        querySnapshot.forEach(doc => {
            total += Number(doc.data().amount);
        });

        const allowanceRef = doc(db, 'allowance', 'current');
        await setDoc(allowanceRef, {
            amount: total
        });

        currentAllowance = total;
        updateAllowanceDisplay();
    } catch (error) {
        console.error("Error calculating allowance:", error);
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Get the API key from the environment variable
        const apiKey = process.env.FIREBASE_API_KEY;

        if (!apiKey) {
            throw new Error('Firebase API key is not configured');
        }

        const firebaseConfig = {
            apiKey: apiKey,
            authDomain: "automatic-expenses.firebaseapp.com",
            projectId: "automatic-expenses",
            storageBucket: "automatic-expenses.firebasestorage.app",
            messagingSenderId: "44040847013",
            appId: "1:44040847013:web:b74a0fa66e6f99ba1ad74c",
            measurementId: "G-7K0JLEX9KQ"
        };

        const app = initializeApp(firebaseConfig);
        const analytics = getAnalytics(app);

        db = getFirestore(app);

        // Add event listeners
        document.getElementById('add-allowance-btn').addEventListener('click', addAllowance);

        // Load data after initialization
        await loadData();
    } catch (error) {
        console.error("Firebase initialization error:", error);
        alert("Error connecting to database. Please check your configuration and try again.");
    }
});
