/**
 * Malith's AI WhatsApp Bot - SIMPLE & POWERFUL
 * Maximum message length + Direct Gemini integration
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

// Import Enhanced Gemini
const SimpleGeminiAI = require('./lib/simple-gemini');
const aiBot = new SimpleGeminiAI();

// Simple memory storage
class SimpleMemory {
    constructor() {
        this.conversations = new Map();
        console.log(chalk.green('💾 Simple Memory System'));
    }

    getConversation(userId) {
        return this.conversations.get(userId) || [];
    }

    addConversation(userId, userMsg, botMsg) {
        const history = this.conversations.get(userId) || [];
        history.push({ role: 'user', content: userMsg });
        history.push({ role: 'assistant', content: botMsg });
        
        // Keep last 20 messages for context
        if (history.length > 20) {
            history.splice(0, history.length - 20);
        }
        
        this.conversations.set(userId, history);
        return history;
    }
}

const memory = new SimpleMemory();

async function startSimpleBot() {
    try {
        console.log(chalk.green.bold('🚀 Starting Simple & Powerful AI Bot...'));
        
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
        });

        // Save credentials
        bot.ev.on('creds.update', saveCreds);

        // Connection handler
        bot.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log(chalk.yellow('\n📱 Scan QR Code:'));
                qrcode.generate(qr, { small: true });
            }

            if (connection === 'open') {
                console.log(chalk.green.bold('✅ Connected to WhatsApp!'));
                console.log(chalk.cyan(`🤖 Bot: ${bot.user?.name || 'Malith AI'}`));
                
                try {
                    await bot.sendMessage(global.owner, {
                        text: `🤖 Bot Connected!\n\nReady for long conversations with Gemini AI! 🚀`
                    });
                } catch (error) {}
                
                showSimpleInfo();
            }

            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) {
                    console.log(chalk.blue('🔄 Reconnecting...'));
                    await delay(5000);
                    startSimpleBot();
                }
            }
        });

        // Message handler - SIMPLE & DIRECT
        bot.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;

            const message = messages[0];
            if (!message.message || !message.key || message.key.fromMe) return;

            const userJid = message.key.remoteJid;
            const userName = message.pushName || 'User';
            const isGroup = userJid.endsWith('@g.us');

            // Ignore groups unless mentioned
            if (isGroup) {
                const botJid = bot.user?.id.split(':')[0] + '@s.whatsapp.net';
                const mentionedJid = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                if (!mentionedJid.includes(botJid)) return;
            }

            // Get message text
            const messageType = Object.keys(message.message)[0];
            let text = '';
            
            if (messageType === 'conversation') {
                text = message.message.conversation;
            } else if (messageType === 'extendedTextMessage') {
                text = message.message.extendedTextMessage.text;
            } else if (messageType === 'imageMessage') {
                await handleImageMessage(bot, message, userJid);
                return;
            }

            if (!text.trim()) return;

            console.log(chalk.blue(`📩 ${userName}: ${text}`));

            // Mark as read
            try {
                await bot.readMessages([message.key]);
            } catch (error) {}

            // Typing indicator
            try {
                await bot.sendPresenceUpdate('composing', userJid);
            } catch (error) {}

            // Get conversation history
            const conversationHistory = memory.getConversation(userJid);

            // Generate response with full context
            try {
                const aiResponse = await aiBot.generateResponse(text, userName, conversationHistory);
                
                // Save to memory
                memory.addConversation(userJid, text, aiResponse);

                // Send response
                await bot.sendMessage(userJid, { text: aiResponse });
                console.log(chalk.green(`🤖 Response (${aiResponse.length} chars)`));

            } catch (error) {
                console.error('AI Error:', error);
                await bot.sendMessage(userJid, { 
                    text: 'Sorry, I encountered an error. Please try again.' 
                });
            } finally {
                try {
                    await bot.sendPresenceUpdate('paused', userJid);
                } catch (error) {}
            }
        });

        // Simple call handler - ONE message only
        bot.ev.on('call', async (callData) => {
            if (!callData || !callData.length) return;
            
            const callerJid = callData[0].from;
            console.log(chalk.yellow(`📞 Call from: ${callerJid}`));
            
            try {
                await bot.sendMessage(callerJid, {
                    text: '📵 I\'m a text-based AI assistant. Please send a message instead. 💬'
                });
            } catch (error) {}
        });

        console.log(chalk.green('✅ Simple Bot Ready!'));
        return bot;

    } catch (error) {
        console.error(chalk.red('Startup error:'), error);
        await delay(10000);
        startSimpleBot();
    }
}

// Image message handler
async function handleImageMessage(bot, message, userJid) {
    try {
        const imageMessage = message.message.imageMessage;
        if (!imageMessage) return;

        await bot.sendMessage(userJid, {
            text: '🖼️ I see you sent an image! Image analysis feature is being enhanced. For now, please describe what you\'d like me to help with regarding this image. 📸'
        });
    } catch (error) {
        console.error('Image handling error:', error);
    }
}

function showSimpleInfo() {
    console.log(chalk.magenta('\n' + '═'.repeat(50)));
    console.log(chalk.yellow.bold('    SIMPLE & POWERFUL AI BOT'));
    console.log(chalk.magenta('═'.repeat(50)));
    console.log(chalk.cyan('👨‍💻 Creator: Malith Lakshan'));
    console.log(chalk.cyan('📞 Contact: 94741907061'));
    console.log(chalk.cyan('🤖 AI: Gemini 2.0 Flash (MAX LENGTH)'));
    console.log(chalk.cyan('💬 Responses: Up to 1000+ words'));
    console.log(chalk.cyan('🧠 Memory: Full conversation context'));
    console.log(chalk.green('✅ Ready for deep conversations!'));
    console.log(chalk.magenta('═'.repeat(50) + '\n'));
}

// Start bot
startSimpleBot().catch(console.error);
