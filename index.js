/**
 * Malith's AI WhatsApp Bot - ENHANCED VERSION
 * With Memory, Security, Image Processing & Owner Commands
 * Created by Malith Lakshan (94741907061)
 */

require('./settings');
const fs = require('fs');
const chalk = require('chalk');
const qrcode = require('qrcode-terminal');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion, 
    delay,
    downloadContentFromMessage
} = require("@whiskeysockets/baileys");
const NodeCache = require("node-cache");
const pino = require("pino");

// Import Enhanced Modules
const EnhancedGeminiAI = require('./lib/gemini-enhanced');
const GitHubMemoryManager = require('./lib/memory-manager');
const SecurityManager = require('./lib/security-manager');
const ComprehensiveErrorHandler = require('./lib/error-handler');
const FileHandler = require('./lib/file-handler');
const OwnerCommands = require('./lib/owner-commands');

// Initialize Enhanced Components
const aiBot = new EnhancedGeminiAI();
const memoryManager = new GitHubMemoryManager();
const securityManager = new SecurityManager();
const errorHandler = new ComprehensiveErrorHandler();
const fileHandler = new FileHandler();

// Track active calls to prevent spam
const activeCalls = new Set();
const userStates = new Map();

class EnhancedAIBot {
    constructor() {
        this.bot = null;
        this.ownerCommands = null;
        console.log(chalk.green.bold('🚀 Enhanced AI Bot Initializing...'));
    }

    async start() {
        try {
            const { version } = await fetchLatestBaileysVersion();
            const { state, saveCreds } = await useMultiFileAuthState('./session');
            const msgRetryCounterCache = new NodeCache();

            this.bot = makeWASocket({
                version,
                logger: pino({ level: 'silent' }),
                auth: state,
                markOnlineOnConnect: true,
                generateHighQualityLinkPreview: true,
                syncFullHistory: false,
                msgRetryCounterCache,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 10000,
            });

            // Initialize owner commands
            this.ownerCommands = new OwnerCommands(
                this.bot, 
                memoryManager, 
                securityManager, 
                errorHandler
            );

            // Save credentials when updated
            this.bot.ev.on('creds.update', saveCreds);

            // Setup all event handlers
            this.setupConnectionHandler();
            this.setupMessageHandler();
            this.setupCallHandler();
            this.setupGroupHandler();

            console.log(chalk.green('✅ Enhanced Bot Initialized Successfully'));
            return this.bot;

        } catch (error) {
            errorHandler.handleError(error, {
                type: 'BOT_STARTUP',
                severity: 'CRITICAL'
            });
            
            console.log(chalk.blue('🔄 Restarting in 10 seconds...'));
            await delay(10000);
            return this.start();
        }
    }

    setupConnectionHandler() {
        this.bot.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            // QR Code handling
            if (qr) {
                console.log(chalk.yellow('\n📱 =========================================='));
                console.log(chalk.yellow('📱           SCAN THIS QR CODE'));
                console.log(chalk.yellow('📱 =========================================='));
                qrcode.generate(qr, { small: true });
                console.log(chalk.yellow('📱 =========================================='));
                console.log(chalk.yellow('📱 Open WhatsApp → Linked Devices → Scan QR Code'));
                console.log(chalk.yellow('📱 ==========================================\n'));
            }

            if (connection === 'connecting') {
                console.log(chalk.blue('🔄 Connecting to WhatsApp...'));
            }

            if (connection === 'open') {
                console.log(chalk.green.bold('\n✅ ENHANCED BOT CONNECTED!'));
                console.log(chalk.cyan(`🤖 Bot User: ${this.bot.user?.name || 'Malith AI Bot'}`));
                
                await this.sendStartupMessage();
                this.showEnhancedBotInfo();
                
                // Start background tasks
                this.startBackgroundTasks();
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                errorHandler.handleError(new Error(`Connection closed: ${statusCode}`), {
                    type: 'CONNECTION',
                    statusCode: statusCode,
                    severity: 'HIGH'
                });

                if (shouldReconnect) {
                    console.log(chalk.blue('🔄 Reconnecting in 5 seconds...'));
                    await delay(5000);
                    this.start();
                }
            }
        });
    }

    setupMessageHandler() {
        this.bot.ev.on('messages.upsert', async ({ messages, type }) => {
            try {
                if (type !== 'notify') return;

                const message = messages[0];
                if (!message.message || !message.key || message.key.fromMe) return;

                const userJid = message.key.remoteJid;
                const userName = message.pushName || 'Friend';
                const isGroup = userJid.endsWith('@g.us');

                // Security check first
                const securityCheck = securityManager.securityCheck(userJid, 'message');
                if (!securityCheck.allowed) {
                    console.log(chalk.red(`🚫 Blocked message from ${userJid}: ${securityCheck.reason}`));
                    return;
                }

                // Handle owner commands
                const commandResult = await this.ownerCommands.handleCommand(message, userJid, userName);
                if (commandResult.handled) {
                    if (commandResult.response) {
                        await this.bot.sendMessage(userJid, { text: commandResult.response });
                    }
                    return;
                }

                // Process different message types
                await this.processMessage(message, userJid, userName, isGroup);

            } catch (error) {
                errorHandler.handleMessageError(error, {
                    userJid: messages[0]?.key.remoteJid,
                    messageType: Object.keys(messages[0]?.message || {})[0],
                    messageText: this.extractMessageText(messages[0])
                });
            }
        });
    }

    setupCallHandler() {
        this.bot.ev.on('call', async (callData) => {
            try {
                if (!callData || !callData.length) return;

                const call = callData[0];
                const callerJid = call.from;

                if (activeCalls.has(callerJid)) {
                    return; // Already handling this call
                }

                activeCalls.add(callerJid);
                console.log(chalk.yellow(`📞 Call received from: ${callerJid}`));

                // Security check for calls
                const callTracking = securityManager.trackCall(callerJid);
                
                if (callTracking.shouldBlock) {
                    console.log(chalk.red(`🚫 Blocking excessive calls from: ${callerJid}`));
                    activeCalls.delete(callerJid);
                    return;
                }

                // Send ONE message only if not already notified
                if (callTracking.shouldNotify) {
                    await this.bot.sendMessage(callerJid, {
                        text: '📵 *Auto Call Response*\n\nI\'m Malith\'s AI text assistant! 🤖\n\nI can only respond to text messages, not calls.\n\nPlease send me a message instead! 💬\n\n_Created by Malith Lakshan (94741907061)_'
                    });
                    securityManager.markCallNotified(callerJid);
                }

                // Auto-reject call after short delay
                setTimeout(() => {
                    activeCalls.delete(callerJid);
                }, 2000);

            } catch (error) {
                errorHandler.handleError(error, {
                    type: 'CALL_HANDLING',
                    severity: 'MEDIUM'
                });
                activeCalls.delete(callData[0]?.from);
            }
        });
    }

    setupGroupHandler() {
        this.bot.ev.on('group-participants.update', async (update) => {
            console.log(chalk.blue(`👥 Group update: ${update.id}`));
            // Future: Add group welcome messages, etc.
        });
    }

    async processMessage(message, userJid, userName, isGroup) {
        // Mark as read
        try {
            await this.bot.readMessages([message.key]);
        } catch (error) {
            // Ignore read errors
        }

        // Handle group messages only when mentioned
        if (isGroup) {
            const botJid = this.bot.user?.id.split(':')[0] + '@s.whatsapp.net';
            const mentionedJid = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
            
            if (!mentionedJid.includes(botJid) && 
                !this.extractMessageText(message).includes('@' + botJid.split('@')[0])) {
                return;
            }
        }

        const messageText = this.extractMessageText(message);
        console.log(chalk.blue(`\n📩 [${isGroup ? 'GROUP' : 'DM'}] ${userName}: ${messageText || 'Media Message'}`));

        // Handle media messages
        if (this.isMediaMessage(message)) {
            await this.handleMediaMessage(message, userJid, userName);
            return;
        }

        // Handle text messages
        if (messageText) {
            await this.handleTextMessage(messageText, userJid, userName, isGroup);
        }
    }

    async handleMediaMessage(message, userJid, userName) {
        try {
            const messageType = Object.keys(message.message)[0];
            
            // Typing indicator
            await this.bot.sendPresenceUpdate('composing', userJid);

            switch (messageType) {
                case 'imageMessage':
                    await this.handleImageMessage(message, userJid, userName);
                    break;
                    
                case 'stickerMessage':
                    await this.handleStickerMessage(message, userJid, userName);
                    break;
                    
                case 'documentMessage':
                    await this.handleDocumentMessage(message, userJid, userName);
                    break;
                    
                default:
                    await this.bot.sendMessage(userJid, {
                        text: '📁 I see you sent a file! Currently I can process images, stickers, and some documents. 🖼️'
                    });
            }

            await this.bot.sendPresenceUpdate('paused', userJid);

        } catch (error) {
            errorHandler.handleMessageError(error, {
                userJid: userJid,
                messageType: 'MEDIA',
                operation: 'PROCESSING'
            });
            
            await this.bot.sendMessage(userJid, {
                text: '😅 Sorry, I had trouble processing that file. Please try again!'
            });
        }
    }

    async handleImageMessage(message, userJid, userName) {
        const imageData = await fileHandler.processImageMessage(message, this.bot);
        
        if (imageData.success) {
            // Analyze image with Gemini Vision
            const analysis = await aiBot.readImage(imageData.buffer, imageData.mimeType);
            
            if (analysis.success) {
                await this.bot.sendMessage(userJid, {
                    text: `🖼️ *Image Analysis:*\n\n${analysis.description}\n\n${imageData.caption ? `Caption: ${imageData.caption}` : ''}`
                });
            } else {
                await this.bot.sendMessage(userJid, {
                    text: '❌ Sorry, I couldn\'t analyze that image properly.'
                });
            }
        }
    }

    async handleStickerMessage(message, userJid, userName) {
        const stickerData = await fileHandler.processStickerMessage(message, this.bot);
        
        if (stickerData.success) {
            const analysis = await aiBot.analyzeSticker(stickerData.buffer);
            
            if (analysis.success) {
                await this.bot.sendMessage(userJid, {
                    text: `😊 *Sticker Analysis:*\n\n${analysis.analysis}`
                });
            }
        }
    }

    async handleDocumentMessage(message, userJid, userName) {
        const docData = await fileHandler.processDocumentMessage(message, this.bot);
        
        if (docData.success) {
            await this.bot.sendMessage(userJid, {
                text: `📄 I received your document: "${docData.fileName}"\n\nSize: ${fileHandler.formatFileSize(docData.fileSize)}\n\nI can read text from documents - this feature is coming soon! 🚀`
            });
        }
    }

    async handleTextMessage(messageText, userJid, userName, isGroup) {
        try {
            // Typing indicator
            await this.bot.sendPresenceUpdate('composing', userJid);

            // Load user memory and conversation history
            const userMemory = await memoryManager.loadUserMemory(userJid);
            const memoryContext = memoryManager.getMemoryContext(userMemory);
            const conversationHistory = memoryManager.getConversationHistory(userMemory, 6);

            // Check for special commands
            const specialResponse = await this.handleSpecialCommands(messageText, userJid);
            if (specialResponse) {
                await this.bot.sendMessage(userJid, { text: specialResponse });
                await this.bot.sendPresenceUpdate('paused', userJid);
                return;
            }

            // Generate AI response with memory context
            console.log(chalk.yellow('🤖 Processing with Enhanced Gemini AI...'));
            const aiResponse = await aiBot.generateResponse(
                messageText, 
                userName, 
                memoryContext, 
                conversationHistory
            );

            // Update user memory
            await memoryManager.updateConversationMemory(userJid, messageText, aiResponse, userName);

            // Stop typing and send response
            await this.bot.sendPresenceUpdate('paused', userJid);
            await this.bot.sendMessage(userJid, { text: aiResponse });
            
            console.log(chalk.green(`💬 AI Response: ${aiResponse}`));

        } catch (error) {
            errorHandler.handleAIError(error, {
                promptLength: messageText.length,
                model: 'gemini-2.0-flash'
            });
            
            await this.bot.sendMessage(userJid, {
                text: '😅 Sorry, I encountered an error while processing your message. Please try again!'
            });
        }
    }

    async handleSpecialCommands(messageText, userJid) {
        const lowerMessage = messageText.toLowerCase().trim();

        // Image generation
        if (lowerMessage.startsWith('!generate') || lowerMessage.startsWith('!image')) {
            const prompt = messageText.replace(/^!generate|^!image/i, '').trim();
            if (prompt) {
                const imageResult = await aiBot.generateImage(prompt);
                if (imageResult.success) {
                    return `🎨 *Image Generation Request:*\n\nPrompt: "${prompt}"\n\nDescription: ${imageResult.description}\n\n${imageResult.note}`;
                } else {
                    return `❌ Image generation failed: ${imageResult.error}`;
                }
            }
        }

        // Web search
        if (lowerMessage.startsWith('!search') || lowerMessage.startsWith('!google')) {
            const query = messageText.replace(/^!search|^!google/i, '').trim();
            if (query) {
                const searchResult = await aiBot.webSearch(query);
                if (searchResult.success) {
                    return `🔍 *Search Results for "${query}":*\n\n${searchResult.results}`;
                } else {
                    return `❌ Search failed: ${searchResult.error}`;
                }
            }
        }

        return null;
    }

    extractMessageText(message) {
        const messageType = Object.keys(message.message)[0];
        
        if (messageType === 'conversation') {
            return message.message.conversation;
        } else if (messageType === 'extendedTextMessage') {
            return message.message.extendedTextMessage.text;
        } else if (message.message.imageMessage?.caption) {
            return message.message.imageMessage.caption;
        }
        
        return '';
    }

    isMediaMessage(message) {
        const mediaTypes = ['imageMessage', 'stickerMessage', 'documentMessage', 'videoMessage', 'audioMessage'];
        return mediaTypes.some(type => message.message[type]);
    }

    async sendStartupMessage() {
        try {
            const ownerJid = global.owner;
            await this.bot.sendMessage(ownerJid, {
                text: `🤖 *ENHANCED AI BOT ACTIVATED!*\n\n✅ Connected: ${new Date().toLocaleString()}\n🚀 Powered by Gemini AI 2.0 Flash\n🌐 Languages: Sinhala/English/Singlish\n💾 Memory: GitHub-based Storage\n🛡️ Security: Advanced Protection\n📁 Media: Image & Sticker Support\n\nCreated by Malith Lakshan (94741907061) 🎉\n\nUse !help for owner commands.`
            });
            console.log(chalk.green('📨 Enhanced startup message sent to owner'));
        } catch (error) {
            console.log(chalk.yellow('ℹ️ Could not send startup message'));
        }
    }

    showEnhancedBotInfo() {
        console.log(chalk.magenta('\n' + '═'.repeat(70)));
        console.log(chalk.yellow.bold('              MALITH\'S ENHANCED AI WHATSAPP BOT'));
        console.log(chalk.magenta('═'.repeat(70)));
        console.log(chalk.cyan('👨‍💻 Creator:') + chalk.white(' Malith Lakshan'));
        console.log(chalk.cyan('📞 Contact:') + chalk.white(' 94741907061'));
        console.log(chalk.cyan('🤖 AI Model:') + chalk.white(' Gemini 2.0 Flash + Vision'));
        console.log(chalk.cyan('🌐 Languages:') + chalk.white(' Sinhala, English, Singlish'));
        console.log(chalk.cyan('💾 Memory:') + chalk.white(' GitHub-based Storage'));
        console.log(chalk.cyan('🛡️ Security:') + chalk.white(' Advanced Anti-Spam & Protection'));
        console.log(chalk.cyan('📁 Media:') + chalk.white(' Image & Sticker Processing'));
        console.log(chalk.cyan('👑 Owner:') + chalk.white(' Command Panel Active'));
        console.log(chalk.green.bold('✅ ENHANCED BOT READY WITH ALL FEATURES!'));
        console.log(chalk.magenta('═'.repeat(70)));
        console.log(chalk.yellow('\n💡 Test Features:'));
        console.log(chalk.yellow('   Text: "Hello, who made you?"'));
        console.log(chalk.yellow('   Image: Send any image for analysis'));
        console.log(chalk.yellow('   Sticker: Send sticker for description'));
        console.log(chalk.yellow('   Commands: !generate <prompt>, !search <query>'));
        console.log(chalk.yellow('   Owner: !help for command list\n'));
    }

    startBackgroundTasks() {
        // Cleanup temporary files every hour
        setInterval(() => {
            fileHandler.cleanupTempFiles(60);
        }, 60 * 60 * 1000);

        // Backup memory every 6 hours
        setInterval(() => {
            memoryManager.backupMemory();
        }, 6 * 60 * 60 * 1000);

        // Cleanup error logs daily
        setInterval(() => {
            errorHandler.cleanupOldLogs();
        }, 24 * 60 * 60 * 1000);

        console.log(chalk.blue('🔄 Background tasks started'));
    }
}

// Enhanced error handling
process.on('uncaughtException', (error) => {
    const errorHandler = new ComprehensiveErrorHandler();
    errorHandler.handleError(error, {
        type: 'UNCAUGHT_EXCEPTION',
        severity: 'CRITICAL'
    });
});

process.on('unhandledRejection', (error) => {
    const errorHandler = new ComprehensiveErrorHandler();
    errorHandler.handleError(error, {
        type: 'UNHANDLED_REJECTION',
        severity: 'HIGH'
    });
});

process.on('SIGINT', () => {
    console.log(chalk.yellow('\n🛑 Enhanced Bot Shutting Down...'));
    console.log(chalk.green('👋 Thank you for using Malith\'s Enhanced AI Bot!'));
    process.exit(0);
});

// Start the enhanced bot
async function main() {
    try {
        const enhancedBot = new EnhancedAIBot();
        await enhancedBot.start();
    } catch (error) {
        console.error(chalk.red('❌ Failed to start enhanced bot:'), error);
        process.exit(1);
    }
}

console.log(chalk.blue.bold('\n🎯 Starting Enhanced AI Bot with All Features...'));
main().catch(console.error);
