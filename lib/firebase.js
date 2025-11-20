const { initializeApp } = require('firebase/app');
const { getFirestore, collection, doc, setDoc, getDoc, updateDoc } = require('firebase/firestore');
const settings = require('../settings');

class FirebaseManager {
    constructor() {
        this.app = initializeApp(settings.firebaseConfig);
        this.db = getFirestore(this.app);
        this.sessionsCollection = 'whatsapp_sessions';
    }

    async saveSession(userId, sessionData) {
        try {
            const sessionRef = doc(this.db, this.sessionsCollection, userId);
            await setDoc(sessionRef, {
                ...sessionData,
                lastActive: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
            return true;
        } catch (error) {
            console.error('Firebase Save Error:', error);
            return false;
        }
    }

    async getSession(userId) {
        try {
            const sessionRef = doc(this.db, this.sessionsCollection, userId);
            const sessionDoc = await getDoc(sessionRef);
            return sessionDoc.exists() ? sessionDoc.data() : null;
        } catch (error) {
            console.error('Firebase Read Error:', error);
            return null;
        }
    }

    async updateConversation(userId, userMessage, botResponse) {
        try {
            const sessionRef = doc(this.db, this.sessionsCollection, userId);
            const session = await this.getSession(userId) || { conversations: [] };
            
            // Add new conversation
            session.conversations = session.conversations || [];
            session.conversations.push({
                user: userMessage,
                bot: botResponse,
                timestamp: new Date().toISOString()
            });

            // Keep only last 10 conversations
            if (session.conversations.length > 10) {
                session.conversations = session.conversations.slice(-10);
            }

            await updateDoc(sessionRef, {
                conversations: session.conversations,
                lastActive: new Date().toISOString()
            });

            return session.conversations;
        } catch (error) {
            console.error('Firebase Update Error:', error);
            return [];
        }
    }
}

module.exports = FirebaseManager;
