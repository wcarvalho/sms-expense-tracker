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
let currentReimburse;
let activeFilters = new Set(['unorganized', 'allowance', 'reimburse']); // Default active filters
let showingAll = false;
let currentSearchRegex = null;

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
        const q = query(transactionsRef, orderBy('date', 'asc')); // Order by date ascending for balance calculation
        const querySnapshot = await getDocs(q);

        // Calculate balances
        let transactions = [];
        let allowanceTotal = 0;
        let reimburseTotal = 0;
        let updatePromises = [];

        // First collect all transactions and calculate balances
        querySnapshot.forEach((docSnap) => {
            const id = docSnap.id;
            const data = docSnap.data();
            
            // Convert old data: if 'counts' is true, set category to 'allowance', otherwise 'unorganized'
            if (data.counts !== undefined && !data.category) {
                data.category = data.counts ? CATEGORIES.ALLOWANCE : CATEGORIES.UNORGANIZED;
                // Update the document in Firestore
                updateDoc(docSnap.ref, { 
                    category: data.category,
                    counts: deleteField() // Remove the old field
                });
            } else if (!data.category) {
                data.category = CATEGORIES.UNORGANIZED;
                // Update the document in Firestore
                updateDoc(docSnap.ref, { category: CATEGORIES.UNORGANIZED });
            }

            // Calculate running balance for allowance transactions
            if (data.category === CATEGORIES.ALLOWANCE) {
                allowanceTotal += Number(data.amount);
                
                // Check if balance needs updating
                if (data.balance !== allowanceTotal) {
                    data.balance = allowanceTotal;
                    updatePromises.push(updateDoc(docSnap.ref, { balance: allowanceTotal }));
                }
            }
            
            // Calculate running balance for reimburse transactions
            if (data.category === CATEGORIES.REIMBURSE) {
                reimburseTotal += Number(data.amount);
                
                // Check if balance needs updating
                if (data.balance !== reimburseTotal) {
                    data.balance = reimburseTotal;
                    updatePromises.push(updateDoc(docSnap.ref, { balance: reimburseTotal }));
                }
            }
            
            transactions.push({ id, data });
        });

        // Wait for all balance updates to complete
        if (updatePromises.length > 0) {
            await Promise.all(updatePromises);
            console.log(`Updated balances for ${updatePromises.length} transactions`);
        }
        
        // Update the UI with transactions in descending date order
        transactions.sort((a, b) => {
            const dateA = toDateObject(a.data.date);
            const dateB = toDateObject(b.data.date);
            return dateB - dateA; // Descending order
        });

        // Clear existing table
        document.getElementById('transactions-body').innerHTML = '';
        
        // Add transactions to the table if they match filters
        transactions.forEach(({ id, data }) => {
            // Check if it matches search term
            const matchesSearch = currentSearchRegex ? 
                (currentSearchRegex.test(data.description) || 
                 currentSearchRegex.test(data.note || '')) : true;
            
            // Only add to table if showing all or category is active AND matches search
            if ((showingAll || activeFilters.has(data.category)) && matchesSearch) {
                addTransactionToTable(id, data);
            }
        });
        
        // Update totals in the UI
        await setDoc(allowanceRef, {
            amount: allowanceTotal
        });
        
        currentAllowance = allowanceTotal;
        currentReimburse = reimburseTotal;
        updateAllowanceDisplay();
        updateReimburseDisplay();
    } catch (error) {
        console.error("Error loading data:", error);
    }
}

// Search transactions
function searchTransactions() {
    try {
        const searchTerm = document.getElementById('search-input').value.trim();
        if (searchTerm === '') {
            currentSearchRegex = null;
        } else {
            // Create a regex from the search term
            // Use try-catch to handle invalid regex patterns
            try {
                currentSearchRegex = new RegExp(searchTerm, 'i'); // 'i' for case-insensitive
            } catch (e) {
                alert('Invalid regex pattern. Please check your search query.');
                return;
            }
        }
        loadData(); // Reload with the search filter applied
    } catch (error) {
        console.error("Error searching transactions:", error);
    }
}

// Clear search
function clearSearch() {
    document.getElementById('search-input').value = '';
    currentSearchRegex = null;
    loadData(); // Reload with no search filter
}

function updateAllowanceDisplay() {
    document.getElementById('current-allowance').textContent = (isNaN(currentAllowance) ? 0 : currentAllowance).toFixed(2);
}

function updateReimburseDisplay() {
    document.getElementById('current-reimburse').textContent = (isNaN(currentReimburse) ? 0 : currentReimburse).toFixed(2);
}

async function addAllowance() {
    const amount = Number(document.getElementById('add-amount').value);
    if (isNaN(amount)) return 0;
    if (amount === 0) return 0;
  
    try {
        // Update current allowance
        currentAllowance += amount;
        
        // Add transaction with Firestore Timestamp
        const transaction = {
            description: 'Allowance',
            amount: amount,
            date: new Date().toISOString(), // Store as ISO string for consistency
            category: CATEGORIES.ALLOWANCE,
            balance: currentAllowance, // Store the current balance
            note: '' // Initialize empty note
        };

        const transactionsRef = collection(db, 'transactions');
        const docRef = await addDoc(transactionsRef, transaction);
        addTransactionToTable(docRef.id, transaction);

        // Update allowance total in Firestore
        const allowanceRef = doc(db, 'allowance', 'current');
        await setDoc(allowanceRef, {
            amount: currentAllowance
        });
        
        updateAllowanceDisplay();
        document.getElementById('add-amount').value = '';
    } catch (error) {
        console.error("Error adding allowance:", error);
    }
}

// Helper function to convert any date format to a Date object
function toDateObject(dateValue) {
    if (!dateValue) return new Date(0);
    
    // Handle Firestore Timestamp
    if (dateValue.toDate && typeof dateValue.toDate === 'function') {
        return dateValue.toDate();
    }
    
    // Handle ISO string or other date formats
    return new Date(dateValue);
}

// Format date to MM/DD/YYYY
function formatDate(dateString) {
    const date = new Date(dateString);
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

// Format date for input (YYYY-MM-DD)
function formatDateForInput(dateString) {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function addTransactionToTable(id, transaction) {
    const tbody = document.getElementById('transactions-body');
    const row = document.createElement('tr');
    
    // Set row class based on category
    row.className = `category-${transaction.category || CATEGORIES.UNORGANIZED}`;
    row.dataset.id = id;
    
    const amount = Number(transaction.amount);
    
    // Handle date using the helper function
    const transactionDate = toDateObject(transaction.date);
    const formattedDate = formatDate(transactionDate);
    
    // Format the balance if it exists, otherwise show dash
    const balanceDisplay = transaction.balance ? 
        `$${Number(transaction.balance).toFixed(2)}` : 
        '-';
    
    row.innerHTML = `
        <td>${transaction.description}</td>
        <td>$${amount.toFixed(2)}</td>
        <td>${balanceDisplay}</td>
        <td class="date-cell" data-id="${id}">${formattedDate}</td>
        <td><button class="category-button" data-id="${id}">${transaction.category || CATEGORIES.UNORGANIZED}</button></td>
        <td><button data-id="${id}" class="delete-btn">Delete</button></td>
        <td><input type="text" class="note-input" data-id="${id}" value="${transaction.note || ''}" placeholder=""></td>
    `;
    
    // Add event listeners
    const categoryBtn = row.querySelector('.category-button');
    categoryBtn.addEventListener('click', () => toggleCategory(id));
    
    const deleteBtn = row.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', () => deleteTransaction(id));

    // Add date edit event listener
    const dateCell = row.querySelector('.date-cell');
    dateCell.addEventListener('click', () => editDate(id, transactionDate));

    // Add note input event listener
    const noteInput = row.querySelector('.note-input');
    noteInput.addEventListener('change', async (e) => {
        try {
            const transactionRef = doc(db, 'transactions', id);
            await updateDoc(transactionRef, {
                note: e.target.value
            });
        } catch (error) {
            console.error("Error updating note:", error);
        }
    });
    
    tbody.appendChild(row);
}

// Function to edit transaction date
async function editDate(id, currentDate) {
    const dateCell = document.querySelector(`.date-cell[data-id="${id}"]`);
    if (!dateCell) return;
    
    // Save the original text for cancellation
    const originalText = dateCell.textContent;
    
    // Create date input
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.value = formatDateForInput(currentDate);
    
    // Clear cell and add input
    dateCell.textContent = '';
    dateCell.appendChild(dateInput);
    dateInput.focus();
    
    // Handle input blur (cancel if clicked outside)
    dateInput.addEventListener('blur', () => {
        setTimeout(() => {
            // Only restore if the cell still contains the input
            if (dateCell.contains(dateInput)) {
                dateCell.textContent = originalText;
            }
        }, 150); // Small delay to allow the change event to fire first
    });
    
    // Handle date change
    dateInput.addEventListener('change', async () => {
        try {
            const newDate = new Date(dateInput.value);
            
            if (isNaN(newDate.getTime())) {
                throw new Error('Invalid date');
            }
            
            // Get transaction info to check category
            const transactionRef = doc(db, 'transactions', id);
            const transactionSnap = await getDoc(transactionRef);
            const transactionData = transactionSnap.data();
            const category = transactionData?.category;
            
            // Update in Firestore
            await updateDoc(transactionRef, {
                date: newDate.toISOString()
            });
            
            // Update the cell display
            dateCell.textContent = formatDate(newDate);
            
            // Recalculate balances if this is an allowance or reimburse transaction
            if (category === CATEGORIES.ALLOWANCE || category === CATEGORIES.REIMBURSE) {
                await loadData(); // This will recalculate all balances
            }
        } catch (error) {
            console.error("Error updating date:", error);
            dateCell.textContent = originalText;
        }
    });
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
            
            // Update the document's category
            await updateDoc(transactionRef, {
                category: newCategory
            });
            
            // Update the UI
            const row = document.querySelector(`tr[data-id="${id}"]`);
            row.className = `category-${newCategory}`;
            const button = row.querySelector('.category-button');
            button.textContent = newCategory;
            
            // Need to recalculate all balances if category changes to/from ALLOWANCE or REIMBURSE
            const needsRecalculation = 
                oldCategory === CATEGORIES.ALLOWANCE || 
                newCategory === CATEGORIES.ALLOWANCE || 
                oldCategory === CATEGORIES.REIMBURSE || 
                newCategory === CATEGORIES.REIMBURSE;
                
            if (needsRecalculation) {
                // Reload data to recalculate all balances
                await loadData();
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
            const category = transactionSnap.data().category;
            // Delete the transaction
            await deleteDoc(transactionRef);
            
            // Remove the row from the table
            const row = document.querySelector(`tr[data-id="${id}"]`);
            row.remove();
            
            // Recalculate balances if needed
            if (category === CATEGORIES.ALLOWANCE || category === CATEGORIES.REIMBURSE) {
                await loadData(); // This will recalculate all balances
            }
        }
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

async function calculateReimburseTotal() {
    try {
        const transactionsRef = collection(db, 'transactions');
        const q = query(transactionsRef, where('category', '==', CATEGORIES.REIMBURSE));
        const querySnapshot = await getDocs(q);
        
        let total = 0;
        querySnapshot.forEach(doc => {
            total += Number(doc.data().amount);
        });

        currentReimburse = total;
        updateReimburseDisplay();
    } catch (error) {
        console.error("Error calculating reimburse total:", error);
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Get Firebase config from environment variables
        const firebaseConfig = {
            apiKey: process.env.FIREBASE_API_KEY,
            authDomain: process.env.FIREBASE_AUTH_DOMAIN,
            projectId: process.env.FIREBASE_PROJECT_ID,
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
            messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
            appId: process.env.FIREBASE_APP_ID,
            measurementId: process.env.FIREBASE_MEASUREMENT_ID
        };

        const app = initializeApp(firebaseConfig);
        const analytics = getAnalytics(app);

        db = getFirestore(app);

        // Add event listeners
        document.getElementById('add-allowance-btn').addEventListener('click', addAllowance);

        // Add search event listeners
        document.getElementById('search-btn').addEventListener('click', searchTransactions);
        document.getElementById('clear-search-btn').addEventListener('click', clearSearch);
        document.getElementById('search-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                searchTransactions();
            }
        });

        // Add category filter event listeners
        document.querySelectorAll('.category-filter').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    activeFilters.add(e.target.value);
                } else {
                    activeFilters.delete(e.target.value);
                }
                showingAll = false;
                loadData(); // Reload data to update the display
            });
        });

        // Add refresh and show all button listeners
        document.getElementById('refresh-btn').addEventListener('click', () => {
            showingAll = false;
            loadData();
        });

        document.getElementById('show-all-btn').addEventListener('click', () => {
            showingAll = true;
            loadData();
        });

        // Load data after initialization
        await loadData();
    } catch (error) {
        console.error("Firebase initialization error:", error);
        alert("Error connecting to database. Please check your configuration and try again.");
    }
});
