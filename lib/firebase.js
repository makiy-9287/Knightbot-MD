const { initializeApp } = require('firebase/app');
const { getFirestore, collection, doc, setDoc, getDoc, updateDoc, deleteDoc } = require('firebase/firestore');
const settings = require('../settings');

class FirebaseManager {
    constructor() {
        try {
            this.app = initializeApp(settings.firebaseConfig);
            this.db = getFirestore(this.app);
            this.sessionsCollection = 'whatsapp_sessions';
            this.conversationsCollection = 'conversations';
            console.log('✅ Firebase initialized successfully');
        } catch (error) {
            console.error('❌ Firebase initialization error:', error);
        }
    }

    async saveSession(userId, sessionData) {
        try {
            const sessionRef = doc(this.db, this.sessionsCollection, userId);
            await setDoc(sessionRef, {
                ...sessionData,
                lastActive: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }, { merge: true });
            return true;
        } catch (error) {
            console.error('❌ Firebase Save Error:', error);
            return false;
        }
    }

    async getSession(userId) {
        try {
            const sessionRef = doc(this.db, this.sessionsCollection, userId);
            const sessionDoc = await getDoc(sessionRef);
            return sessionDoc.exists() ? sessionDoc.data() : null;
        } catch (error) {
            console.error('❌ Firebase Read Error:', error);
            return null;
        }
    }

    async updateConversation(userId, userMessage, botResponse) {
        try {
            const sessionRef = doc(this.db, this.sessionsCollection, userId);
            const session = await this.getSession(userId) || { 
                conversations: [],
                userId: userId,
                createdAt: new Date().toISOString()
            };
            
            // Add new conversation
            session.conversations = session.conversations || [];
            session.conversations.push({
                user: userMessage,
                bot: botResponse,
                timestamp: new Date().toISOString()
            });

            // Keep only last 15 conversations
            if (session.conversations.length > 15) {
                session.conversations = session.conversations.slice(-15);
            }

            // Update session
            await setDoc(sessionRef, {
                ...session,
                lastActive: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                totalMessages: session.conversations.length
            }, { merge: true });

            return session.conversations;
        } catch (error) {
            console.error('❌ Firebase Update Error:', error);
            return [];
        }
    }

    async getUserStats(userId) {
        try {
            const session = await this.getSession(userId);
            if (!session) return null;
            
            return {
                totalMessages: session.conversations?.length || 0,
                firstSeen: session.createdAt,
                lastActive: session.lastActive,
                userName: session.userName
            };
        } catch (error) {
            console.error('❌ Firebase Stats Error:', error);
            return null;
        }
    }
}

module.exports = FirebaseManager;
