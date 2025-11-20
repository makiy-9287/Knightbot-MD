const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

class OwnerCommands {
    constructor(bot, memoryManager, securityManager, errorHandler) {
        this.bot = bot;
        this.memoryManager = memoryManager;
        this.securityManager = securityManager;
        this.errorHandler = errorHandler;
        this.ownerNumber = '94741907061@s.whatsapp.net';
        this.commands = this.loadCommands();
        console.log(chalk.green('👑 Owner Command Panel Activated'));
    }

    loadCommands() {
        return {
            // Bot management
            '!status': this.getStatus.bind(this),
            '!restart': this.restartBot.bind(this),
            '!broadcast': this.broadcastMessage.bind(this),
            
            // User management
            '!block': this.blockUser.bind(this),
            '!unblock': this.unblockUser.bind(this),
            '!users': this.getUserStats.bind(this),
            
            // Memory management
            '!backup': this.backupMemory.bind(this),
            '!memory': this.getMemoryStats.bind(this),
            '!clearmemory': this.clearUserMemory.bind(this),
            
            // Security
            '!security': this.getSecurityStats.bind(this),
            '!spamstats': this.getSpamStats.bind(this),
            
            // System
            '!errors': this.getErrorStats.bind(this),
            '!cleanup': this.cleanupSystem.bind(this),
            '!help': this.showHelp.bind(this)
        };
    }

    // Check if user is owner
    isOwner(userJid) {
        return userJid === this.ownerNumber;
    }

    // Handle owner commands
    async handleCommand(message, userJid, userName) {
        if (!this.isOwner(userJid)) {
            return { handled: false, response: null };
        }

        const text = message.message.conversation || 
                    message.message.extendedTextMessage?.text || '';

        const command = text.split(' ')[0].toLowerCase();
        const args = text.split(' ').slice(1);

        if (this.commands[command]) {
            console.log(chalk.blue(`👑 Owner command: ${command} by ${userName}`));
            try {
                const response = await this.commands[command](args, userJid);
                return { handled: true, response };
            } catch (error) {
                this.errorHandler.handleError(error, {
                    type: 'OWNER_COMMAND',
                    command: command,
                    userJid: userJid
                });
                return { 
                    handled: true, 
                    response: `❌ Command failed: ${error.message}` 
                };
            }
        }

        return { handled: false, response: null };
    }

    // Command implementations
    async getStatus(args, userJid) {
        const memoryStats = await this.memoryManager.getErrorStats();
        const securityStats = this.securityManager.getSecurityStats();
        
        return `🤖 *BOT STATUS*\n\n` +
               `🕒 Uptime: ${Math.floor(process.uptime() / 60)} minutes\n` +
               `💾 Memory: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB\n` +
               `🚫 Blocked Users: ${securityStats.blockedUsers}\n` +
               `📊 Total Errors: ${memoryStats.totalErrors}\n` +
               `🛡️ Security: ${securityStats.enableAntiSpam ? 'ACTIVE' : 'INACTIVE'}\n` +
               `✅ Status: OPERATIONAL`;
    }

    async restartBot(args, userJid) {
        await this.bot.sendMessage(userJid, { 
            text: '🔄 Restarting bot...' 
        });
        
        setTimeout(() => {
            process.exit(0);
        }, 2000);
        
        return 'Bot restart initiated...';
    }

    async broadcastMessage(args, userJid) {
        if (args.length < 1) {
            return 'Usage: !broadcast <message>';
        }

        const message = args.join(' ');
        // Implementation would broadcast to all users
        return `📢 Broadcast prepared: "${message}"`;
    }

    async blockUser(args, userJid) {
        if (args.length < 1) {
            return 'Usage: !block <phone_number>';
        }

        const phoneNumber = args[0].replace(/[^0-9]/g, '');
        const userJidToBlock = `${phoneNumber}@s.whatsapp.net`;
        
        this.securityManager.blockUser(userJidToBlock);
        return `🚫 User blocked: ${phoneNumber}`;
    }

    async unblockUser(args, userJid) {
        if (args.length < 1) {
            return 'Usage: !unblock <phone_number>';
        }

        const phoneNumber = args[0].replace(/[^0-9]/g, '');
        const userJidToUnblock = `${phoneNumber}@s.whatsapp.net`;
        
        this.securityManager.unblockUser(userJidToUnblock);
        return `✅ User unblocked: ${phoneNumber}`;
    }

    async getUserStats(args, userJid) {
        // Implementation would get user statistics
        return `📊 User stats feature coming soon...`;
    }

    async backupMemory(args, userJid) {
        const success = await this.memoryManager.backupMemory();
        return success ? 
            '💾 Memory backup completed!' : 
            '❌ Memory backup failed!';
    }

    async getMemoryStats(args, userJid) {
        const stats = this.memoryManager.getErrorStats();
        return `🧠 *MEMORY STATS*\n\n` +
               `📁 Total Users: ${stats.totalErrors}\n` +
               `💬 Total Conversations: ${stats.errorsToday}\n` +
               `🕒 Last Backup: ${new Date().toLocaleString()}`;
    }

    async clearUserMemory(args, userJid) {
        if (args.length < 1) {
            return 'Usage: !clearmemory <phone_number>';
        }
        return `🗑️ Memory clearance feature coming soon...`;
    }

    async getSecurityStats(args, userJid) {
        const stats = this.securityManager.getSecurityStats();
        return `🛡️ *SECURITY STATS*\n\n` +
               `🚫 Blocked Users: ${stats.blockedUsers}\n` +
               `⚠️ Spam Warnings: ${stats.spamWarnings}\n` +
               `📞 Call Trackers: ${stats.activeCallTrackers}\n` +
               `🔒 Anti-Spam: ${stats.securityConfig.enableAntiSpam ? 'ON' : 'OFF'}\n` +
               `🛑 Auto-Block: ${stats.securityConfig.enableAutoBlock ? 'ON' : 'OFF'}`;
    }

    async getSpamStats(args, userJid) {
        return `📈 Spam statistics feature coming soon...`;
    }

    async getErrorStats(args, userJid) {
        const stats = this.errorHandler.getErrorStats();
        return `🚨 *ERROR STATISTICS*\n\n` +
               `📊 Total Errors: ${stats.totalErrors}\n` +
               `📅 Errors Today: ${stats.errorsToday}\n` +
               `🔴 Critical: ${stats.errorLevels.HIGH || 0}\n` +
               `🟡 Warnings: ${stats.errorLevels.MEDIUM || 0}\n` +
               `🟢 Info: ${stats.errorLevels.LOW || 0}`;
    }

    async cleanupSystem(args, userJid) {
        await this.memoryManager.cleanupTempFiles();
        this.errorHandler.cleanupOldLogs();
        return `🧹 System cleanup completed!`;
    }

    async showHelp(args, userJid) {
        return `👑 *OWNER COMMANDS*\n\n` +
               `🤖 Bot Management:\n` +
               `!status - Bot status\n` +
               `!restart - Restart bot\n` +
               `!broadcast <msg> - Broadcast message\n\n` +
               `👥 User Management:\n` +
               `!block <num> - Block user\n` +
               `!unblock <num> - Unblock user\n` +
               `!users - User statistics\n\n` +
               `🧠 Memory:\n` +
               `!backup - Backup memory\n` +
               `!memory - Memory stats\n` +
               `!clearmemory <num> - Clear user memory\n\n` +
               `🛡️ Security:\n` +
               `!security - Security stats\n` +
               `!spamstats - Spam statistics\n\n` +
               `⚙️ System:\n` +
               `!errors - Error statistics\n` +
               `!cleanup - Cleanup system\n` +
               `!help - This help message`;
    }
}

module.exports = OwnerCommands;
