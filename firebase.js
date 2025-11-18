// firebase.js
const admin = require('firebase-admin');
const config = require('./config');

// Initialize Firebase Admin
const serviceAccount = {
    type: "service_account",
    project_id: config.FIREBASE_CONFIG.projectId,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    client_email: `firebase-adminsdk-${process.env.FIREBASE_ADMIN_ID}@${config.FIREBASE_CONFIG.projectId}.iam.gserviceaccount.com`,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-${process.env.FIREBASE_ADMIN_ID}%40${config.FIREBASE_CONFIG.projectId}.iam.gserviceaccount.com`
};

class FirebaseDB {
    constructor() {
        try {
            if (!admin.apps.length) {
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                    databaseURL: `https://${config.FIREBASE_CONFIG.projectId}-default-rtdb.firebaseio.com`
                });
            }
            this.db = admin.database();
            console.log('✅ Firebase initialized successfully');
        } catch (error) {
            console.error('❌ Firebase initialization error:', error);
            // Fallback to in-memory storage if Firebase fails
            this.db = null;
            this.memoryStorage = new Map();
        }
    }

    // Get user reference
    getUserRef(userId) {
        const cleanUserId = userId.replace(/[^a-zA-Z0-9]/g, '_');
        return this.db ? this.db.ref(`users/${cleanUserId}`) : null;
    }

    // Save chat message to history
    async saveChatMessage(userId, messageData) {
        try {
            const { role, content, timestamp = Date.now(), language, emotion } = messageData;
            
            if (this.db) {
                const userRef = this.getUserRef(userId);
                const chatRef = userRef.child('chatHistory').push();
                
                await chatRef.set({
                    role,
                    content,
                    timestamp,
                    language,
                    emotion,
                    messageId: chatRef.key
                });

                // Keep only last 20 messages to avoid database bloat
                await this.cleanupOldMessages(userId);
            } else {
                // Fallback to memory storage
                if (!this.memoryStorage.has(userId)) {
                    this.memoryStorage.set(userId, []);
                }
                const userChats = this.memoryStorage.get(userId);
                userChats.push({ ...messageData, timestamp });
                
                // Keep only last 20 messages
                if (userChats.length > 20) {
                    userChats.splice(0, userChats.length - 20);
                }
            }
            
            return true;
        } catch (error) {
            console.error('❌ Error saving chat message:', error);
            return false;
        }
    }

    // Get chat history for a user
    async getChatHistory(userId, limit = 10) {
        try {
            if (this.db) {
                const userRef = this.getUserRef(userId);
                const snapshot = await userRef.child('chatHistory')
                    .orderByChild('timestamp')
                    .limitToLast(limit)
                    .once('value');
                
                const history = [];
                snapshot.forEach(childSnapshot => {
                    const message = childSnapshot.val();
                    history.push(message);
                });
                
                return history.sort((a, b) => a.timestamp - b.timestamp);
            } else {
                // Fallback to memory storage
                const userChats = this.memoryStorage.get(userId) || [];
                return userChats.slice(-limit);
            }
        } catch (error) {
            console.error('❌ Error getting chat history:', error);
            return [];
        }
    }

    // Cleanup old messages
    async cleanupOldMessages(userId, keepCount = 20) {
        try {
            if (this.db) {
                const userRef = this.getUserRef(userId);
                const snapshot = await userRef.child('chatHistory')
                    .orderByChild('timestamp')
                    .once('value');
                
                const messages = [];
                snapshot.forEach(childSnapshot => {
                    messages.push({
                        key: childSnapshot.key,
                        ...childSnapshot.val()
                    });
                });
                
                // Remove old messages if exceeding keepCount
                if (messages.length > keepCount) {
                    const messagesToDelete = messages.slice(0, messages.length - keepCount);
                    const updates = {};
                    
                    messagesToDelete.forEach(msg => {
                        updates[`chatHistory/${msg.key}`] = null;
                    });
                    
                    await userRef.update(updates);
                }
            }
        } catch (error) {
            console.error('❌ Error cleaning up old messages:', error);
        }
    }

    // Update user preferences
    async updateUserPreferences(userId, preferences) {
        try {
            if (this.db) {
                const userRef = this.getUserRef(userId);
                await userRef.child('preferences').update(preferences);
            } else {
                // Memory storage fallback
                if (!this.memoryStorage.has(`prefs_${userId}`)) {
                    this.memoryStorage.set(`prefs_${userId}`, {});
                }
                const userPrefs = this.memoryStorage.get(`prefs_${userId}`);
                Object.assign(userPrefs, preferences);
            }
            
            return true;
        } catch (error) {
            console.error('❌ Error updating user preferences:', error);
            return false;
        }
    }

    // Get user preferences
    async getUserPreferences(userId) {
        try {
            if (this.db) {
                const userRef = this.getUserRef(userId);
                const snapshot = await userRef.child('preferences').once('value');
                return snapshot.val() || {};
            } else {
                // Memory storage fallback
                return this.memoryStorage.get(`prefs_${userId}`) || {};
            }
        } catch (error) {
            console.error('❌ Error getting user preferences:', error);
            return {};
        }
    }

    // Save user session data
    async saveUserSession(userId, sessionData) {
        try {
            if (this.db) {
                const userRef = this.getUserRef(userId);
                await userRef.child('session').update({
                    ...sessionData,
                    lastActive: Date.now()
                });
            } else {
                // Memory storage fallback
                this.memoryStorage.set(`session_${userId}`, {
                    ...sessionData,
                    lastActive: Date.now()
                });
            }
            
            return true;
        } catch (error) {
            console.error('❌ Error saving user session:', error);
            return false;
        }
    }

    // Get user session data
    async getUserSession(userId) {
        try {
            if (this.db) {
                const userRef = this.getUserRef(userId);
                const snapshot = await userRef.child('session').once('value');
                return snapshot.val() || {};
            } else {
                // Memory storage fallback
                return this.memoryStorage.get(`session_${userId}`) || {};
            }
        } catch (error) {
            console.error('❌ Error getting user session:', error);
            return {};
        }
    }

    // Get bot usage statistics
    async getBotStats() {
        try {
            if (this.db) {
                const statsRef = this.db.ref('botStats');
                const snapshot = await statsRef.once('value');
                return snapshot.val() || { totalUsers: 0, totalMessages: 0, lastReset: Date.now() };
            } else {
                return { totalUsers: this.memoryStorage.size, totalMessages: 0, lastReset: Date.now() };
            }
        } catch (error) {
            console.error('❌ Error getting bot stats:', error);
            return { totalUsers: 0, totalMessages: 0, lastReset: Date.now() };
        }
    }

    // Update bot statistics
    async updateBotStats() {
        try {
            if (this.db) {
                const statsRef = this.db.ref('botStats');
                const currentStats = await this.getBotStats();
                
                await statsRef.update({
                    totalUsers: currentStats.totalUsers + 1,
                    totalMessages: currentStats.totalMessages + 1,
                    lastUpdated: Date.now()
                });
            }
        } catch (error) {
            console.error('❌ Error updating bot stats:', error);
        }
    }

    // Clear user chat history
    async clearUserHistory(userId) {
        try {
            if (this.db) {
                const userRef = this.getUserRef(userId);
                await userRef.child('chatHistory').remove();
            } else {
                this.memoryStorage.delete(userId);
            }
            
            return true;
        } catch (error) {
            console.error('❌ Error clearing user history:', error);
            return false;
        }
    }
}

// For now, we'll use memory storage since we don't have the service account details
// You'll need to set up Firebase Admin SDK properly for production use
module.exports = new FirebaseDB();
