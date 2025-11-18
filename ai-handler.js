// ai-handler.js
const geminiAI = require('./gemini');
const firebaseDB = require('./firebase');
const config = require('./config');

class AIHandler {
    constructor() {
        this.userSessions = new Map();
        this.setupCleanupInterval();
    }

    // Setup session cleanup interval
    setupCleanupInterval() {
        setInterval(() => {
            this.cleanupOldSessions();
        }, 5 * 60 * 1000); // Cleanup every 5 minutes
    }

    // Cleanup old user sessions
    cleanupOldSessions() {
        const now = Date.now();
        for (const [userId, session] of this.userSessions.entries()) {
            if (now - session.lastActivity > config.AI_SETTINGS.SESSION_TIMEOUT) {
                this.userSessions.delete(userId);
                console.log(`🧹 Cleared inactive session for: ${userId}`);
            }
        }
    }

    // Update user session
    updateUserSession(userId) {
        if (!this.userSessions.has(userId)) {
            this.userSessions.set(userId, {
                startTime: Date.now(),
                messageCount: 0,
                lastActivity: Date.now(),
                language: config.AI_SETTINGS.DEFAULT_LANGUAGE
            });
        } else {
            const session = this.userSessions.get(userId);
            session.lastActivity = Date.now();
            session.messageCount++;
        }
    }

    // Get user session
    getUserSession(userId) {
        return this.userSessions.get(userId) || {
            startTime: Date.now(),
            messageCount: 0,
            lastActivity: Date.now(),
            language: config.AI_SETTINGS.DEFAULT_LANGUAGE
        };
    }

    // Main message handler
    async handleMessage(message, userInfo) {
        const { userId, userName, isGroup, groupId } = userInfo;
        
        try {
            // Update user session
            this.updateUserSession(userId);

            // Save user message to Firebase
            await firebaseDB.saveChatMessage(userId, {
                role: 'user',
                content: message,
                timestamp: Date.now(),
                userName: userName,
                isGroup: isGroup,
                groupId: groupId
            });

            // Get chat history for context
            const chatHistory = await firebaseDB.getChatHistory(userId, config.AI_SETTINGS.MAX_HISTORY_LENGTH);
            
            console.log(`💬 Processing message from ${userName} (${userId}): ${message.substring(0, 50)}...`);

            // Generate AI response
            const aiResponse = await geminiAI.generateResponse(message, userId);

            // Save AI response to Firebase
            await firebaseDB.saveChatMessage(userId, {
                role: 'assistant',
                content: aiResponse.text,
                timestamp: Date.now(),
                language: aiResponse.language,
                emotion: aiResponse.emotion,
                isStatic: aiResponse.isStatic
            });

            // Update bot statistics
            await firebaseDB.updateBotStats();

            console.log(`🤖 AI Response (${aiResponse.language}, ${aiResponse.emotion}): ${aiResponse.text.substring(0, 50)}...`);

            return {
                success: true,
                message: aiResponse.text,
                language: aiResponse.language,
                emotion: aiResponse.emotion,
                isStatic: aiResponse.isStatic,
                session: this.getUserSession(userId)
            };

        } catch (error) {
            console.error('❌ Error in AI handler:', error);
            
            const errorResponses = {
                en: "😵 Oops! I encountered an error. Please try again in a moment.",
                si: "😵 අහෝ! මට දෝෂයක් ඇති විය. කරුණාකර මොහොතකින් නැවත උත්සාහ කරන්න.",
                mixed: "😵 Aiyo! Mata error ekak athi viya. Please awasarain thawa karamu."
            };

            // Detect language for error response
            const detectedLang = geminiAI.detectLanguage(message);
            
            return {
                success: false,
                message: errorResponses[detectedLang] || errorResponses.en,
                language: detectedLang,
                emotion: 'sad',
                isError: true
            };
        }
    }

    // Handle group messages (optional filtering)
    async handleGroupMessage(message, userInfo) {
        const { userId, userName, groupId, groupName } = userInfo;
        
        // You can add group-specific logic here
        // For example, only respond when mentioned or in specific groups
        
        return await this.handleMessage(message, userInfo);
    }

    // Get user chat history
    async getUserHistory(userId) {
        try {
            const history = await firebaseDB.getChatHistory(userId);
            const session = this.getUserSession(userId);
            
            return {
                success: true,
                history: history,
                session: session
            };
        } catch (error) {
            console.error('❌ Error getting user history:', error);
            return {
                success: false,
                history: [],
                session: null
            };
        }
    }

    // Clear user chat history
    async clearUserHistory(userId) {
        try {
            await firebaseDB.clearUserHistory(userId);
            geminiAI.clearUserHistory(userId);
            this.userSessions.delete(userId);
            
            return {
                success: true,
                message: "Chat history cleared successfully! 🧹"
            };
        } catch (error) {
            console.error('❌ Error clearing user history:', error);
            return {
                success: false,
                message: "Failed to clear chat history. 😢"
            };
        }
    }

    // Get bot statistics
    async getStatistics() {
        try {
            const stats = await firebaseDB.getBotStats();
            const activeSessions = this.userSessions.size;
            
            return {
                success: true,
                stats: {
                    ...stats,
                    activeSessions: activeSessions,
                    uptime: process.uptime()
                }
            };
        } catch (error) {
            console.error('❌ Error getting statistics:', error);
            return {
                success: false,
                stats: null
            };
        }
    }
}

module.exports = new AIHandler();
