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
let currentNotReimbursed;
let activeFilters = new Set(['unorganized', 'allowance', 'reimburse', 'not_reimbursed']); // Default active filters
let showingAll = false;
let currentSearchRegex = null;

// Categories
const CATEGORIES = {
    UNORGANIZED: 'unorganized',
    ALLOWANCE: 'allowance',
    NEED: 'need',
    REIMBURSE: 'reimburse',
    REIMBURSED: 'reimbursed',
    NOT_REIMBURSED: 'not_reimbursed'
};

// Add after the existing imports
let charts = {
    allowance: null,
    reimburse: null,
    notReimbursed: null
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
        let notReimbursedTotal = 0;
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
            
            if (data.category === CATEGORIES.NOT_REIMBURSED) {
                notReimbursedTotal += Number(data.amount);
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
        let totalAmount = 0;
        transactions.forEach(({ id, data }) => {
            // Check if it matches search term
            const matchesSearch = currentSearchRegex ? 
                (currentSearchRegex.test(data.description) || 
                 currentSearchRegex.test(data.note || '')) : true;
            
            // Only add to table if showing all or category is active AND matches search
            if ((showingAll || activeFilters.has(data.category)) && matchesSearch) {
                addTransactionToTable(id, data);
                totalAmount += Number(data.amount);
            }
        });
        
        // Add summary row
        const tbody = document.getElementById('transactions-body');
        const summaryRow = document.createElement('tr');
        summaryRow.className = 'summary-row';
        summaryRow.innerHTML = `
            <td><strong>Total</strong></td>
            <td><strong>$${totalAmount.toFixed(2)}</strong></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
        `;
        tbody.appendChild(summaryRow);
        
        // Update totals in the UI
        await setDoc(allowanceRef, {
            amount: allowanceTotal
        });
        
        currentAllowance = allowanceTotal;
        currentReimburse = reimburseTotal;
        currentNotReimbursed = notReimbursedTotal;
        updateAllowanceDisplay();
        updateReimburseDisplay();
        updateNotReimbursedDisplay();

        // Update charts if we're on the plots tab
        if (document.getElementById('plots-tab').classList.contains('active')) {
            await updateCharts();
        }
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

function updateNotReimbursedDisplay() {
    document.getElementById('current-not-reimbursed').textContent = 
        (isNaN(currentNotReimbursed) ? 0 : currentNotReimbursed).toFixed(2);
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
        <td>${formattedDate}</td>
        <td><button class="category-button" data-id="${id}">${transaction.category || CATEGORIES.UNORGANIZED}</button></td>
        <td><button data-id="${id}" class="delete-btn">Delete</button></td>
        <td><input type="text" class="note-input" data-id="${id}" value="${transaction.note || ''}" placeholder=""></td>
    `;
    
    // Add event listeners
    const categoryBtn = row.querySelector('.category-button');
    categoryBtn.addEventListener('click', () => toggleCategory(id));
    
    const deleteBtn = row.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', () => deleteTransaction(id));

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

// New function to just update the totals
async function recalculateTotals() {
    try {
        const transactionsRef = collection(db, 'transactions');
        const querySnapshot = await getDocs(transactionsRef);
        
        let allowanceTotal = 0;
        let reimburseTotal = 0;
        let notReimbursedTotal = 0;

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const amount = Number(data.amount);
            
            switch(data.category) {
                case CATEGORIES.ALLOWANCE:
                    allowanceTotal += amount;
                    break;
                case CATEGORIES.REIMBURSE:
                    reimburseTotal += amount;
                    break;
                case CATEGORIES.NOT_REIMBURSED:
                    notReimbursedTotal += amount;
                    break;
            }
        });

        // Update the totals
        currentAllowance = allowanceTotal;
        currentReimburse = reimburseTotal;
        currentNotReimbursed = notReimbursedTotal;

        // Update the displays
        updateAllowanceDisplay();
        updateReimburseDisplay();
        updateNotReimbursedDisplay();

        // Update allowance in Firestore
        const allowanceRef = doc(db, 'allowance', 'current');
        await setDoc(allowanceRef, {
            amount: allowanceTotal
        });
    } catch (error) {
        console.error("Error recalculating totals:", error);
    }
}

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
            
            // Update just the UI elements for this row
            const row = document.querySelector(`tr[data-id="${id}"]`);
            row.className = `category-${newCategory}`;
            const button = row.querySelector('.category-button');
            button.textContent = newCategory;
            
            // Just update the totals without reloading the table
            await recalculateTotals();
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

// Add this function to create/update charts
async function updateCharts() {
    try {
        const transactionsRef = collection(db, 'transactions');
        const q = query(transactionsRef, orderBy('date', 'asc'));
        const querySnapshot = await getDocs(q);

        const data = {
            dates: [],
            allowance: [],
            reimburse: [],
            notReimbursed: []
        };

        let allowanceTotal = 0;
        let reimburseTotal = 0;
        let notReimbursedTotal = 0;

        // Group transactions by week
        const weeklyData = new Map();
        const startDate = new Date();
        startDate.setHours(0, 0, 0, 0);

        querySnapshot.forEach((doc) => {
            const transaction = doc.data();
            const date = toDateObject(transaction.date);
            const amount = Number(transaction.amount);

            // Get the start of the week for this date
            const weekStart = new Date(date);
            weekStart.setHours(0, 0, 0, 0);
            weekStart.setDate(date.getDate() - date.getDay()); // Set to Sunday of the week

            const weekKey = weekStart.toISOString();

            if (!weeklyData.has(weekKey)) {
                weeklyData.set(weekKey, {
                    date: weekStart,
                    allowance: 0,
                    reimburse: 0,
                    notReimbursed: 0
                });
            }

            const weekData = weeklyData.get(weekKey);

            switch(transaction.category) {
                case CATEGORIES.ALLOWANCE:
                    allowanceTotal += amount;
                    weekData.allowance = allowanceTotal;
                    break;
                case CATEGORIES.REIMBURSE:
                    reimburseTotal += amount;
                    weekData.reimburse = reimburseTotal;
                    break;
                case CATEGORIES.NOT_REIMBURSED:
                    notReimbursedTotal += amount;
                    weekData.notReimbursed = notReimbursedTotal;
                    break;
            }
        });

        // Sort the weeks and populate the data arrays
        const sortedWeeks = Array.from(weeklyData.values()).sort((a, b) => a.date - b.date);
        
        sortedWeeks.forEach(week => {
            data.dates.push(formatDate(week.date));
            data.allowance.push(week.allowance);
            data.reimburse.push(week.reimburse);
            data.notReimbursed.push(week.notReimbursed);
        });

        // Create or update charts
        const chartConfig = {
            type: 'line',
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            font: {
                                size: 14,
                                family: 'Arial'
                            },
                            padding: 20
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleFont: {
                            size: 14,
                            family: 'Arial'
                        },
                        bodyFont: {
                            size: 14,
                            family: 'Arial'
                        },
                        padding: 12,
                        cornerRadius: 4,
                        displayColors: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(0, 0, 0, 0.1)',
                            drawBorder: false
                        },
                        ticks: {
                            font: {
                                size: 12,
                                family: 'Arial'
                            },
                            padding: 10
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            font: {
                                size: 12,
                                family: 'Arial'
                            },
                            padding: 10,
                            maxRotation: 45,
                            minRotation: 45
                        }
                    }
                },
                elements: {
                    line: {
                        tension: 0.4,
                        borderWidth: 2
                    },
                    point: {
                        radius: 3,
                        hoverRadius: 5
                    }
                }
            }
        };

        // Allowance chart
        if (!charts.allowance) {
            charts.allowance = new Chart(
                document.getElementById('allowance-chart'),
                {
                    ...chartConfig,
                    data: {
                        labels: data.dates,
                        datasets: [{
                            label: 'Allowance',
                            data: data.allowance,
                            borderColor: '#9C27B0',
                            backgroundColor: 'rgba(156, 39, 176, 0.1)',
                            fill: true
                        }]
                    }
                }
            );
        } else {
            charts.allowance.data.labels = data.dates;
            charts.allowance.data.datasets[0].data = data.allowance;
            charts.allowance.update();
        }

        // Reimburse chart
        if (!charts.reimburse) {
            charts.reimburse = new Chart(
                document.getElementById('reimburse-chart'),
                {
                    ...chartConfig,
                    data: {
                        labels: data.dates,
                        datasets: [{
                            label: 'To Reimburse',
                            data: data.reimburse,
                            borderColor: '#F44336',
                            backgroundColor: 'rgba(244, 67, 54, 0.1)',
                            fill: true
                        }]
                    }
                }
            );
        } else {
            charts.reimburse.data.labels = data.dates;
            charts.reimburse.data.datasets[0].data = data.reimburse;
            charts.reimburse.update();
        }

        // Not Reimbursed chart
        if (!charts.notReimbursed) {
            charts.notReimbursed = new Chart(
                document.getElementById('not-reimbursed-chart'),
                {
                    ...chartConfig,
                    data: {
                        labels: data.dates,
                        datasets: [{
                            label: 'Not Reimbursed',
                            data: data.notReimbursed,
                            borderColor: '#607D8B',
                            backgroundColor: 'rgba(96, 125, 139, 0.1)',
                            fill: true
                        }]
                    }
                }
            );
        } else {
            charts.notReimbursed.data.labels = data.dates;
            charts.notReimbursed.data.datasets[0].data = data.notReimbursed;
            charts.notReimbursed.update();
        }
    } catch (error) {
        console.error("Error updating charts:", error);
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

        // Add tab event listeners
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', () => {
                // Remove active class from all buttons and contents
                document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
                
                // Add active class to clicked button and corresponding content
                button.classList.add('active');
                document.getElementById(`${button.dataset.tab}-tab`).classList.add('active');

                // If switching to plots tab, update charts
                if (button.dataset.tab === 'plots') {
                    updateCharts();
                }
            });
        });

        // Load data after initialization
        await loadData();
    } catch (error) {
        console.error("Firebase initialization error:", error);
        alert("Error connecting to database. Please check your configuration and try again.");
    }
});
