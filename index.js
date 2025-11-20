/**
 * Malith's Gemini AI WhatsApp Bot - FINAL WORKING VERSION
 * No Firebase - No Errors - Fully Functional
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
    delay
} = require("@whiskeysockets/baileys");
const NodeCache = require("node-cache");
const pino = require("pino");

// Import AI only - No Firebase
const GeminiAI = require('./lib/gemini');

// Initialize AI
const aiBot = new GeminiAI();

// Simple local session manager (replaces Firebase)
class SessionManager {
    constructor() {
        this.sessions = new Map();
        console.log(chalk.green('💾 Using fast local session storage'));
    }

    async getSession(userId) {
        return this.sessions.get(userId) || {
            userId: userId,
            conversationCount: 0,
            createdAt: new Date().toISOString()
        };
    }

    async saveSession(userId, sessionData) {
        this.sessions.set(userId, sessionData);
        return true;
    }

    async updateConversation(userId, userMessage, botResponse) {
        let session = this.sessions.get(userId) || {
            userId: userId,
            conversations: [],
            conversationCount: 0,
            createdAt: new Date().toISOString()
        };

        // Add new conversation
        session.conversations = session.conversations || [];
        session.conversations.push({
            user: userMessage,
            bot: botResponse,
            timestamp: new Date().toISOString()
        });

        // Keep only last 10 conversations (save memory)
        if (session.conversations.length > 10) {
            session.conversations = session.conversations.slice(-10);
        }

        session.conversationCount++;
        session.lastActive = new Date().toISOString();
        
        this.sessions.set(userId, session);
        return session.conversations;
    }
}

// Initialize session manager
const sessionManager = new SessionManager();

async function startAIBot() {
    try {
        console.log(chalk.green.bold('🚀 Malith\'s AI WhatsApp Bot - FINAL VERSION'));
        console.log(chalk.cyan('🤖 Powered by Gemini AI 2.0 Flash'));
        console.log(chalk.yellow('💾 Local Storage - No Firebase Errors'));
        
        const { version } = await fetchLatestBaileysVersion();
        const { state, saveCreds } = await useMultiFileAuthState('./session');
        const msgRetryCounterCache = new NodeCache();

        const bot = makeWASocket({
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

        // Save credentials when updated
        bot.ev.on('creds.update', saveCreds);

        // Handle connection updates
        bot.ev.on('connection.update', async (update) => {
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
                console.log(chalk.green.bold('\n✅ SUCCESS! Connected to WhatsApp!'));
                console.log(chalk.cyan(`🤖 Bot User: ${bot.user?.name || 'Malith AI Bot'}`));
                
                // Send startup message to owner
                try {
                    const ownerJid = global.owner;
                    if (ownerJid) {
                        await bot.sendMessage(ownerJid, {
                            text: `🤖 *Malith\'s AI Bot - FINAL VERSION!*\n\n✅ Connected: ${new Date().toLocaleString()}\n🚀 Powered by Gemini AI 2.0 Flash\n🌐 Languages: Sinhala/English/Singlish\n💾 Storage: Local (Fast & Reliable)\n\nCreated by Malith Lakshan (94741907061) 🎉`
                        });
                        console.log(chalk.green('📨 Startup message sent to owner'));
                    }
                } catch (error) {
                    console.log(chalk.yellow('ℹ️ Could not send startup message'));
                }

                showBotInfo();
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                if (shouldReconnect) {
                    console.log(chalk.blue('🔄 Reconnecting in 3 seconds...'));
                    await delay(3000);
                    startAIBot();
                }
            }
        });

        // Handle incoming messages
        bot.ev.on('messages.upsert', async ({ messages, type }) => {
            try {
                if (type !== 'notify') return;

                const message = messages[0];
                if (!message.message || !message.key || message.key.fromMe) return;

                // Get message text
                const messageType = Object.keys(message.message)[0];
                let text = '';
                
                if (messageType === 'conversation') {
                    text = message.message.conversation;
                } else if (messageType === 'extendedTextMessage') {
                    text = message.message.extendedTextMessage.text;
                } else {
                    return; // Ignore media messages for now
                }

                if (!text.trim()) return;

                const userJid = message.key.remoteJid;
                const userName = message.pushName || 'Friend';
                const isGroup = userJid.endsWith('@g.us');

                console.log(chalk.blue(`\n📩 [${isGroup ? 'GROUP' : 'DM'}] ${userName}: ${text}`));

                // Handle group messages only when mentioned
                if (isGroup) {
                    const botJid = bot.user?.id.split(':')[0] + '@s.whatsapp.net';
                    const mentionedJid = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                    if (!mentionedJid.includes(botJid) && !text.includes('@' + botJid.split('@')[0])) {
                        return;
                    }
                    text = text.replace(/@\d+/g, '').trim();
                }

                // Mark as read
                try {
                    await bot.readMessages([message.key]);
                } catch (error) {
                    // Ignore read errors
                }

                // Typing indicator
                try {
                    await bot.sendPresenceUpdate('composing', userJid);
                } catch (error) {
                    // Ignore presence errors
                }

                // Get user session
                const userSession = await sessionManager.getSession(userJid);

                // Generate AI response
                console.log(chalk.yellow('🤖 Processing with Gemini AI...'));
                const aiResponse = await aiBot.generateResponse(text, userName);
                
                // Update conversation
                await sessionManager.updateConversation(userJid, text, aiResponse);

                // Stop typing
                try {
                    await bot.sendPresenceUpdate('paused', userJid);
                } catch (error) {
                    // Ignore presence errors
                }

                // Send response
                await bot.sendMessage(userJid, { text: aiResponse });
                console.log(chalk.green(`💬 AI Response: ${aiResponse}`));

            } catch (error) {
                console.error(chalk.red('❌ Message error:'), error.message);
                try {
                    const userJid = messages[0]?.key.remoteJid;
                    if (userJid) {
                        await bot.sendMessage(userJid, { 
                            text: '😅 Sorry! Temporary issue. Please try again.' 
                        });
                    }
                } catch (sendError) {
                    // Ignore send errors
                }
            }
        });

        // Anti-call feature
        bot.ev.on('call', async (callData) => {
            try {
                if (!callData || !callData.length) return;
                
                const call = callData[0];
                const callerJid = call.from;
                
                console.log(chalk.yellow(`📞 Call received from: ${callerJid}`));
                
                await bot.sendMessage(callerJid, {
                    text: '📵 *Auto Call Response*\n\nI\'m Malith\'s AI text assistant! 🤖\n\nI can only respond to text messages.\n\nPlease send me a message instead! 💬\n\n_Created by Malith Lakshan (94741907061)_'
                });
                
            } catch (error) {
                console.error('Call error:', error.message);
            }
        });

        console.log(chalk.green('✅ Bot ready! No Firebase errors!'));
        return bot;

    } catch (error) {
        console.error(chalk.red('❌ Startup error:'), error.message);
        console.log(chalk.blue('🔄 Restarting in 5 seconds...'));
        await delay(5000);
        startAIBot();
    }
}

function showBotInfo() {
    console.log(chalk.magenta('\n' + '═'.repeat(60)));
    console.log(chalk.yellow.bold('           MALITH\'S AI BOT - FINAL VERSION'));
    console.log(chalk.magenta('═'.repeat(60)));
    console.log(chalk.cyan('👨‍💻 Creator:') + chalk.white(' Malith Lakshan'));
    console.log(chalk.cyan('📞 Contact:') + chalk.white(' 94741907061'));
    console.log(chalk.cyan('🤖 AI Model:') + chalk.white(' Gemini 2.0 Flash'));
    console.log(chalk.cyan('🌐 Languages:') + chalk.white(' Sinhala, English, Singlish'));
    console.log(chalk.cyan('💾 Storage:') + chalk.white(' Local (Fast & Reliable)'));
    console.log(chalk.cyan('😊 Features:') + chalk.white(' Emotional AI + Smart Emojis'));
    console.log(chalk.green.bold('✅ ZERO ERRORS - READY FOR USE!'));
    console.log(chalk.magenta('═'.repeat(60)));
    console.log(chalk.yellow('\n💡 Test these messages:'));
    console.log(chalk.yellow('   English: "Hello, who made you?"'));
    console.log(chalk.yellow('   Sinhala: "හෙලෝ, කොහොමද?"'));
    console.log(chalk.yellow('   Singlish: "මචන්, what\'s up?"\n'));
}

// Error handling
process.on('uncaughtException', (error) => {
    console.error(chalk.red.bold('🛑 Exception:'), error.message);
});

process.on('unhandledRejection', (error) => {
    console.error(chalk.red.bold('🛑 Rejection:'), error.message);
});

process.on('SIGINT', () => {
    console.log(chalk.yellow('\n🛑 Shutting down...'));
    console.log(chalk.green('👋 Thank you for using Malith\'s AI Bot!'));
    process.exit(0);
});

// Start the bot
console.log(chalk.blue.bold('\n🎯 Starting Final Version...'));
startAIBot().catch(console.error);
