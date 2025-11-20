const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class GitHubMemoryManager {
    constructor() {
        this.memoryDir = './data/user-memory';
        this.ensureDirectoryExists();
        console.log('💾 GitHub-style Memory Manager Activated');
    }

    ensureDirectoryExists() {
        if (!fs.existsSync('./data')) {
            fs.mkdirSync('./data', { recursive: true });
        }
        if (!fs.existsSync(this.memoryDir)) {
            fs.mkdirSync(this.memoryDir, { recursive: true });
        }
    }

    // Generate user ID hash for filename
    generateUserId(userJid) {
        return crypto.createHash('md5').update(userJid).digest('hex');
    }

    // Save user memory to file
    async saveUserMemory(userJid, memoryData) {
        try {
            const userId = this.generateUserId(userJid);
            const filePath = path.join(this.memoryDir, `${userId}.json`);
            
            const memory = {
                userId: userJid,
                ...memoryData,
                lastUpdated: new Date().toISOString(),
                version: '1.0'
            };

            fs.writeFileSync(filePath, JSON.stringify(memory, null, 2));
            return true;
        } catch (error) {
            console.error('Memory save error:', error);
            return false;
        }
    }

    // Load user memory from file
    async loadUserMemory(userJid) {
        try {
            const userId = this.generateUserId(userJid);
            const filePath = path.join(this.memoryDir, `${userId}.json`);
            
            if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath, 'utf8');
                return JSON.parse(data);
            }
            return null;
        } catch (error) {
            console.error('Memory load error:', error);
            return null;
        }
    }

    // Update conversation with memory context
    async updateConversationMemory(userJid, userMessage, botResponse, userName) {
        try {
            let memory = await this.loadUserMemory(userJid) || {
                userId: userJid,
                userName: userName,
                conversations: [],
                conversationCount: 0,
                memory: [],
                preferences: {},
                createdAt: new Date().toISOString()
            };

            // Update user name if provided
            if (userName && userName !== 'Friend') {
                memory.userName = userName;
            }

            // Add conversation
            memory.conversations = memory.conversations || [];
            memory.conversations.push({
                user: userMessage,
                bot: botResponse,
                timestamp: new Date().toISOString()
            });

            // Keep only last 20 conversations
            if (memory.conversations.length > 20) {
                memory.conversations = memory.conversations.slice(-20);
            }

            memory.conversationCount++;
            memory.lastActive = new Date().toISOString();

            // Extract and store important information
            this.extractMemory(memory, userMessage, botResponse);

            // Save updated memory
            await this.saveUserMemory(userJid, memory);
            
            return memory;
        } catch (error) {
            console.error('Memory update error:', error);
            return null;
        }
    }

    // Smart memory extraction
    extractMemory(memory, userMessage, botResponse) {
        const lowerMessage = userMessage.toLowerCase();
        
        // Extract name
        if (lowerMessage.includes('my name is') || lowerMessage.includes('i am') || lowerMessage.includes('call me')) {
            const nameMatch = userMessage.match(/(?:my name is|i am|call me)\s+([^,.!?]+)/i);
            if (nameMatch && nameMatch[1]) {
                memory.preferences.name = nameMatch[1].trim();
                console.log(`🧠 Remembered name: ${memory.preferences.name}`);
            }
        }

        // Extract preferences
        if (lowerMessage.includes(' i like ') || lowerMessage.includes(' i love ') || lowerMessage.includes(' my favorite ')) {
            const likeMatch = userMessage.match(/(?:i like|i love|my favorite)\s+([^,.!?]+)/i);
            if (likeMatch && likeMatch[1]) {
                memory.memory.push(`Likes: ${likeMatch[1].trim()}`);
                console.log(`🧠 Remembered preference: ${likeMatch[1].trim()}`);
            }
        }

        // Extract dislikes
        if (lowerMessage.includes(' i hate ') || lowerMessage.includes(' i dislike ') || lowerMessage.includes(" i don't like ")) {
            const dislikeMatch = userMessage.match(/(?:i hate|i dislike|i don't like)\s+([^,.!?]+)/i);
            if (dislikeMatch && dislikeMatch[1]) {
                memory.memory.push(`Dislikes: ${dislikeMatch[1].trim()}`);
                console.log(`🧠 Remembered dislike: ${dislikeMatch[1].trim()}`);
            }
        }

        // Extract important facts
        if (lowerMessage.includes('remember that') || lowerMessage.includes('i am from') || lowerMessage.includes('i work as')) {
            if (userMessage.length < 100) {
                memory.memory.push(`Fact: ${userMessage}`);
                console.log(`🧠 Remembered fact: ${userMessage}`);
            }
        }

        // Keep memory manageable
        if (memory.memory.length > 15) {
            memory.memory = memory.memory.slice(-15);
        }
    }

    // Get memory context for AI
    getMemoryContext(memory) {
        if (!memory) return '';

        let context = '';
        
        // Add user info
        if (memory.preferences.name) {
            context += `User's name: ${memory.preferences.name}\n`;
        }
        if (memory.userName && memory.userName !== 'Friend') {
            context += `Known as: ${memory.userName}\n`;
        }

        // Add memory items
        if (memory.memory.length > 0) {
            context += `Remember:\n`;
            memory.memory.slice(-5).forEach((item, index) => {
                context += `• ${item}\n`;
            });
        }

        // Add conversation stats
        context += `Total conversations: ${memory.conversationCount}\n`;
        context += `Last active: ${new Date(memory.lastActive).toLocaleDateString()}`;

        return context;
    }

    // Get recent conversation history
    getConversationHistory(memory, maxMessages = 6) {
        if (!memory || !memory.conversations) return [];
        
        const history = [];
        memory.conversations.slice(-maxMessages).forEach(conv => {
            history.push({ role: 'user', content: conv.user });
            history.push({ role: 'assistant', content: conv.bot });
        });
        
        return history;
    }

    // Backup all memory (for GitHub commits)
    async backupMemory() {
        try {
            const backupDir = './data/memory-backup';
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }

            const backupFile = path.join(backupDir, `memory-backup-${Date.now()}.json`);
            const memories = {};

            const files = fs.readdirSync(this.memoryDir);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const filePath = path.join(this.memoryDir, file);
                    const data = fs.readFileSync(filePath, 'utf8');
                    memories[file] = JSON.parse(data);
                }
            }

            fs.writeFileSync(backupFile, JSON.stringify(memories, null, 2));
            console.log(`💾 Memory backup created: ${backupFile}`);
            return true;
        } catch (error) {
            console.error('Backup error:', error);
            return false;
        }
    }
}

module.exports = GitHubMemoryManager;
