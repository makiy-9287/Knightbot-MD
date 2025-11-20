/**
 * Firebase Configuration for AI Chatbot
 * Stores conversation history and context
 */

require('dotenv').config();
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, set, get, push, remove, query, orderByChild, limitToLast } = require('firebase/database');

// Firebase configuration
const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com`
};

// Initialize Firebase
let app, database;
try {
    app = initializeApp(firebaseConfig);
    database = getDatabase(app);
    console.log('✅ Firebase initialized successfully');
} catch (error) {
    console.error('❌ Firebase initialization error:', error.message);
}

/**
 * Save conversation to Firebase
 */
async function saveConversation(userId, userMessage, botResponse) {
    try {
        const conversationRef = ref(database, `conversations/${userId}`);
        await push(conversationRef, {
            userMessage,
            botResponse,
            timestamp: Date.now()
        });
        return true;
    } catch (error) {
        console.error('Error saving conversation:', error.message);
        return false;
    }
}

/**
 * Get conversation history (last 10 messages)
 */
async function getConversationHistory(userId, limit = 10) {
    try {
        const conversationRef = ref(database, `conversations/${userId}`);
        const conversationQuery = query(conversationRef, orderByChild('timestamp'), limitToLast(limit));
        const snapshot = await get(conversationQuery);
        
        if (snapshot.exists()) {
            const history = [];
            snapshot.forEach((child) => {
                history.push(child.val());
            });
            return history;
        }
        return [];
    } catch (error) {
        console.error('Error getting conversation history:', error.message);
        return [];
    }
}

/**
 * Clear conversation history for a user
 */
async function clearConversationHistory(userId) {
    try {
        const conversationRef = ref(database, `conversations/${userId}`);
        await remove(conversationRef);
        return true;
    } catch (error) {
        console.error('Error clearing conversation:', error.message);
        return false;
    }
}

/**
 * Save user preferences
 */
async function saveUserPreference(userId, preferenceKey, preferenceValue) {
    try {
        const userRef = ref(database, `users/${userId}/${preferenceKey}`);
        await set(userRef, preferenceValue);
        return true;
    } catch (error) {
        console.error('Error saving preference:', error.message);
        return false;
    }
}

/**
 * Get user preference
 */
async function getUserPreference(userId, preferenceKey) {
    try {
        const userRef = ref(database, `users/${userId}/${preferenceKey}`);
        const snapshot = await get(userRef);
        return snapshot.exists() ? snapshot.val() : null;
    } catch (error) {
        console.error('Error getting preference:', error.message);
        return null;
    }
}

module.exports = {
    database,
    saveConversation,
    getConversationHistory,
    clearConversationHistory,
    saveUserPreference,
    getUserPreference
};
