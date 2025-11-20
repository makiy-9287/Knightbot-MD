const fs = require('fs');
const path = require('path');

class SecurityManager {
    constructor() {
        this.blockedUsers = new Set();
        this.spamDetection = new Map();
        this.callTracker = new Map();
        this.securityConfig = this.loadSecurityConfig();
        console.log('🛡️ Security Manager Activated');
    }

    loadSecurityConfig() {
        const configPath = './config/security.json';
        const defaultConfig = {
            maxMessagesPerMinute: 50,
            autoBlockThreshold: 5,
            callCooldownMinutes: 2,
            maxConsecutiveCalls: 2,
            protectedNumbers: ['94741907061'],
            enableAntiSpam: true,
            enableAutoBlock: true
        };

        try {
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                return { ...defaultConfig, ...config };
            }
            
            // Create config directory and file
            if (!fs.existsSync('./config')) {
                fs.mkdirSync('./config', { recursive: true });
            }
            fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
            return defaultConfig;
        } catch (error) {
            console.error('Security config error:', error);
            return defaultConfig;
        }
    }

    // Spam detection
    detectSpam(userJid, message) {
        if (!this.securityConfig.enableAntiSpam) return false;

        const now = Date.now();
        const userData = this.spamDetection.get(userJid) || { count: 0, lastMessage: 0, warnings: 0 };

        // Reset counter if more than 1 minute passed
        if (now - userData.lastMessage > 60000) {
            userData.count = 0;
        }

        userData.count++;
        userData.lastMessage = now;

        // Check for spam patterns
        const isSpam = this.checkSpamPatterns(message, userData);

        this.spamDetection.set(userJid, userData);

        if (userData.count > this.securityConfig.maxMessagesPerMinute || isSpam) {
            userData.warnings++;
            console.log(`🚨 Spam detected from ${userJid}. Warnings: ${userData.warnings}`);
            
            if (userData.warnings >= this.securityConfig.autoBlockThreshold && this.securityConfig.enableAutoBlock) {
                this.blockUser(userJid);
                return true;
            }
        }

        return false;
    }

    checkSpamPatterns(message, userData) {
        const lowerMessage = message.toLowerCase();
        
        // Check for repetitive messages
        if (userData.lastMessageText === message && userData.count > 3) {
            return true;
        }
        userData.lastMessageText = message;

        // Check for spam keywords
        const spamKeywords = ['http://', 'https://', 'www.', '.com', 'buy now', 'click here', 'free money', 'lottery'];
        if (spamKeywords.some(keyword => lowerMessage.includes(keyword))) {
            return true;
        }

        // Check message length (too short repetitive messages)
        if (message.length < 5 && userData.count > 5) {
            return true;
        }

        return false;
    }

    // Call management
    trackCall(callerJid) {
        const now = Date.now();
        const callData = this.callTracker.get(callerJid) || { count: 0, lastCall: 0, notified: false };

        // Reset if cooldown period passed
        if (now - callData.lastCall > this.securityConfig.callCooldownMinutes * 60000) {
            callData.count = 0;
            callData.notified = false;
        }

        callData.count++;
        callData.lastCall = now;

        this.callTracker.set(callerJid, callData);

        // Check if should block for excessive calls
        if (callData.count > this.securityConfig.maxConsecutiveCalls) {
            console.log(`📞 Excessive calls from ${callerJid}. Blocking.`);
            this.blockUser(callerJid);
            return { shouldBlock: true, shouldNotify: false };
        }

        return { 
            shouldBlock: false, 
            shouldNotify: !callData.notified,
            callCount: callData.count 
        };
    }

    markCallNotified(callerJid) {
        const callData = this.callTracker.get(callerJid);
        if (callData) {
            callData.notified = true;
            this.callTracker.set(callerJid, callData);
        }
    }

    // User blocking
    blockUser(userJid) {
        this.blockedUsers.add(userJid);
        console.log(`🚫 User blocked: ${userJid}`);
        
        // Save blocked users to file
        this.saveBlockedUsers();
    }

    isUserBlocked(userJid) {
        return this.blockedUsers.has(userJid);
    }

    unblockUser(userJid) {
        this.blockedUsers.delete(userJid);
        this.saveBlockedUsers();
        console.log(`✅ User unblocked: ${userJid}`);
    }

    saveBlockedUsers() {
        try {
            const blockedPath = './data/blocked-users.json';
            const blockedArray = Array.from(this.blockedUsers);
            fs.writeFileSync(blockedPath, JSON.stringify(blockedArray, null, 2));
        } catch (error) {
            console.error('Save blocked users error:', error);
        }
    }

    loadBlockedUsers() {
        try {
            const blockedPath = './data/blocked-users.json';
            if (fs.existsSync(blockedPath)) {
                const blockedArray = JSON.parse(fs.readFileSync(blockedPath, 'utf8'));
                blockedArray.forEach(user => this.blockedUsers.add(user));
            }
        } catch (error) {
            console.error('Load blocked users error:', error);
        }
    }

    // Owner verification
    isOwner(userJid) {
        const ownerNumbers = this.securityConfig.protectedNumbers.map(num => `${num}@s.whatsapp.net`);
        return ownerNumbers.includes(userJid);
    }

    // Security check for messages
    securityCheck(userJid, message) {
        if (this.isUserBlocked(userJid)) {
            return { allowed: false, reason: 'blocked' };
        }

        if (this.detectSpam(userJid, message)) {
            return { allowed: false, reason: 'spam' };
        }

        return { allowed: true, reason: '' };
    }

    // Get security stats
    getSecurityStats() {
        return {
            blockedUsers: this.blockedUsers.size,
            spamWarnings: this.spamDetection.size,
            activeCallTrackers: this.callTracker.size,
            securityConfig: this.securityConfig
        };
    }
}

module.exports = SecurityManager;
