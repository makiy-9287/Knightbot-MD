// ai-handler.js
const openAI = require('./openai-handler');
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

    // Handle static responses
    handleStaticResponse(message, language) {
        const lowerMessage = message.toLowerCase();
        
        const creatorKeywords = {
            en: ['who made you', 'who created you', 'who built you', 'your creator', 'who develop you', 'who is your owner'],
            si: ['මාව සාදා ඇත්තේ', 'මගේ නිර්මාතෘ', 'කවුද මාව හැදුවේ', 'මාව build කලේ', 'create කලේ', 'මගේ හිමිකරු'],
            mixed: ['මාව create කරන්නේ', 'මගේ owner', 'කව්ද මාව හැදුවේ', 'build කලේ', 'හිමිකරු']
        };

        const howMadeKeywords = {
            en: ['how were you made', 'how did you make', 'how were you created', 'how were you built', 'how you work'],
            si: ['කොහොමද මාව හැදුවේ', 'මාව සෑදූ ආකාරය', 'කෙසේ වනවාද', 'හැදුවේ කොහොමද'],
            mixed: ['කොහොමද create කලේ', 'හැදුවේ කොහොමද', 'work කරන්නේ කොහොමද']
        };

        // Check creator questions
        for (const keyword of creatorKeywords[language] || creatorKeywords.en) {
            if (lowerMessage.includes(keyword)) {
                return config.STATIC_RESPONSES.creator[language];
            }
        }

        // Check how-made questions
        for (const keyword of howMadeKeywords[language] || howMadeKeywords.en) {
            if (lowerMessage.includes(keyword)) {
                return config.STATIC_RESPONSES.how_made[language];
            }
        }

        return null;
    }

    // Main message handler
    async handleMessage(message, userInfo) {
        const { userId, userName, isGroup, groupId } = userInfo;
        
        try {
            // Update user session
            this.updateUserSession(userId);

            // Detect language for static responses
            const language = openAI.detectLanguage(message);
            
            // Check for static responses first
            const staticResponse = this.handleStaticResponse(message, language);
            if (staticResponse) {
                // Save static response to Firebase
                await firebaseDB.saveChatMessage(userId, {
                    role: 'user',
                    content: message,
                    timestamp: Date.now(),
                    userName: userName,
                    isGroup: isGroup,
                    groupId: groupId
                });

                await firebaseDB.saveChatMessage(userId, {
                    role: 'assistant',
                    content: staticResponse,
                    timestamp: Date.now(),
                    language: language,
                    emotion: 'happy',
                    isStatic: true
                });

                console.log(`✅ Static response sent to ${userName}`);
                
                return {
                    success: true,
                    message: staticResponse,
                    language: language,
                    emotion: 'happy',
                    isStatic: true,
                    session: this.getUserSession(userId)
                };
            }

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

            // Generate AI response using OpenAI
            const aiResponse = await openAI.generateResponse(message, userId);

            // Save AI response to Firebase
            await firebaseDB.saveChatMessage(userId, {
                role: 'assistant',
                content: aiResponse.text,
                timestamp: Date.now(),
                language: aiResponse.language,
                emotion: aiResponse.emotion,
                isStatic: false
            });

            // Update bot statistics
            await firebaseDB.updateBotStats();

            console.log(`🤖 AI Response (${aiResponse.language}, ${aiResponse.emotion}): ${aiResponse.text.substring(0, 50)}...`);

            return {
                success: true,
                message: aiResponse.text,
                language: aiResponse.language,
                emotion: aiResponse.emotion,
                isStatic: false,
                session: this.getUserSession(userId)
            };

        } catch (error) {
            console.error('❌ Error in AI handler:', error);
            
            const language = openAI.detectLanguage(message);
            const errorResponses = {
                en: "😵 Oops! I encountered an error. Please try again in a moment.",
                si: "😵 අහෝ! මට දෝෂයක් ඇති විය. කරුණාකර මොහොතකින් නැවත උත්සාහ කරන්න.",
                mixed: "😵 Aiyo! Mata error ekak athi viya. Please awasarain thawa karamu."
            };
            
            return {
                success: false,
                message: errorResponses[language] || errorResponses.en,
                language: language,
                emotion: 'sad',
                isError: true
            };
        }
    }

    // Handle group messages
    async handleGroupMessage(message, userInfo) {
        const { userId, userName, groupId, groupName } = userInfo;
        
        // You can add group-specific logic here
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
            if (openAI.conversationHistory) {
                openAI.conversationHistory.delete(userId);
            }
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
