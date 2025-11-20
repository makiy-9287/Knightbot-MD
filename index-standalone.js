/**
 * Malith's AI WhatsApp Bot - STANDALONE VERSION
 * No missing dependencies - Maximum message length
 * Created by Malith Lakshan (94741907061)
 */

// Use simple settings without dotenv
const settings = require('./settings-simple');
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

// Import the enhanced Gemini AI
const { GoogleGenerativeAI } = require("@google/generative-ai");

class SimpleGeminiAI {
    constructor() {
        this.genAI = new GoogleGenerativeAI(settings.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({ 
            model: "gemini-2.0-flash",
            generationConfig: {
                temperature: 0.7,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 8192,  // MAXIMUM LENGTH
            }
        });
        console.log('🚀 Gemini 1.5 Flash loaded with 8192 token limit');
    }

    async generateResponse(message, userName = "User", conversationHistory = []) {
        try {
            // Build comprehensive prompt with context
            let prompt = `You are Malith Lakshan's personal AI assistant. Provide detailed, comprehensive responses.

User: ${userName}
Current message: "${message}"`;

            // Add conversation history if available
            if (conversationHistory.length > 0) {
                prompt += "\n\nRecent conversation history:\n";
                conversationHistory.slice(-8).forEach(msg => {
                    prompt += `${msg.role === 'user' ? 'User' : 'You'}: ${msg.content}\n`;
                });
            }

            prompt += `\n\nProvide a comprehensive, detailed response. You can write extensive answers when needed. Use emojis very sparingly.`;

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            let text = response.text().trim();

            return text;

        } catch (error) {
            console.error('Gemini Error:', error);
            return 'I apologize, but I encountered an error. Please try again.';
        }
    }
}

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
        
        // Keep last 15 messages for context
        if (history.length > 15) {
            history.splice(0, history.length - 15);
        }
        
        this.conversations.set(userId, history);
        return history;
    }
}

const memory = new SimpleMemory();

async function startSimpleBot() {
    try {
        console.log(chalk.green.bold('🚀 Starting Standalone AI Bot...'));
        console.log(chalk.cyan('🤖 Maximum message length enabled (8192 tokens)'));
        
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
                console.log(chalk.yellow('\n📱 Scan this QR code with WhatsApp:'));
                qrcode.generate(qr, { small: true });
                console.log(chalk.yellow('📱 WhatsApp → Settings → Linked Devices → Link a Device\n'));
            }

            if (connection === 'connecting') {
                console.log(chalk.blue('🔄 Connecting to WhatsApp...'));
            }

            if (connection === 'open') {
                console.log(chalk.green.bold('\n✅ SUCCESS! Connected to WhatsApp!'));
                console.log(chalk.cyan(`🤖 Bot User: ${bot.user?.name || 'Malith AI Bot'}`));
                
                // Send startup message to owner
                try {
                    await bot.sendMessage(global.owner, {
                        text: `🤖 *AI Bot Activated!*\n\n✅ Connected successfully\n🚀 Maximum message length enabled\n🧠 Full conversation memory\n\nReady for deep conversations! 📚`
                    });
                    console.log(chalk.green('📨 Startup message sent to owner'));
                } catch (error) {
                    console.log(chalk.yellow('ℹ️ Could not send startup message'));
                }
                
                showBotInfo();
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                console.log(chalk.yellow(`🔌 Connection closed. Reconnecting: ${shouldReconnect}`));

                if (shouldReconnect) {
                    console.log(chalk.blue('🔄 Reconnecting in 5 seconds...'));
                    await delay(5000);
                    startSimpleBot();
                }
            }
        });

        // Simple message handler
        bot.ev.on('messages.upsert', async ({ messages, type }) => {
            try {
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
                    if (!mentionedJid.includes(botJid)) {
                        return;
                    }
                }

                // Get message text
                const messageType = Object.keys(message.message)[0];
                let text = '';
                
                if (messageType === 'conversation') {
                    text = message.message.conversation;
                } else if (messageType === 'extendedTextMessage') {
                    text = message.message.extendedTextMessage.text;
                }

                if (!text.trim()) return;

                console.log(chalk.blue(`\n📩 ${userName}: ${text}`));

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

                // Generate AI response with full context
                console.log(chalk.yellow('🤖 Processing with Gemini AI (max length)...'));
                const aiResponse = await aiBot.generateResponse(text, userName, conversationHistory);
                
                // Save to memory
                memory.addConversation(userJid, text, aiResponse);

                // Stop typing
                try {
                    await bot.sendPresenceUpdate('paused', userJid);
                } catch (error) {}

                // Send response
                await bot.sendMessage(userJid, { text: aiResponse });
                console.log(chalk.green(`💬 Response sent (${aiResponse.length} characters)`));

            } catch (error) {
                console.error(chalk.red('Message processing error:'), error.message);
                try {
                    const userJid = messages[0]?.key.remoteJid;
                    await bot.sendMessage(userJid, { 
                        text: 'Sorry, I encountered an error. Please try again.' 
                    });
                } catch (sendError) {}
            }
        });

        // Simple call handler - ONE message only
        bot.ev.on('call', async (callData) => {
            try {
                if (!callData || !callData.length) return;
                
                const call = callData[0];
                const callerJid = call.from;
                
                console.log(chalk.yellow(`📞 Call from: ${callerJid}`));
                
                await bot.sendMessage(callerJid, {
                    text: '📵 I\'m a text-based AI assistant. Please send a message instead of calling. Thank you! 💬'
                });
                
            } catch (error) {
                console.error('Call error:', error.message);
            }
        });

        console.log(chalk.green('✅ Standalone Bot Ready!'));
        return bot;

    } catch (error) {
        console.error(chalk.red('❌ Startup error:'), error.message);
        console.log(chalk.blue('🔄 Restarting in 10 seconds...'));
        await delay(10000);
        startSimpleBot();
    }
}

function showBotInfo() {
    console.log(chalk.magenta('\n' + '═'.repeat(60)));
    console.log(chalk.yellow.bold('        STANDALONE AI BOT - MAXIMUM POWER'));
    console.log(chalk.magenta('═'.repeat(60)));
    console.log(chalk.cyan('👨‍💻 Creator:') + chalk.white(' Malith Lakshan'));
    console.log(chalk.cyan('📞 Contact:') + chalk.white(' 94741907061'));
    console.log(chalk.cyan('🤖 AI Model:') + chalk.white(' Gemini 1.5 Flash'));
    console.log(chalk.cyan('💬 Max Length:') + chalk.white(' 8192 tokens (~1000+ words)'));
    console.log(chalk.cyan('🧠 Memory:') + chalk.white(' Full conversation context'));
    console.log(chalk.cyan('🎯 Features:') + chalk.white(' No spam protection, Pure AI'));
    console.log(chalk.green.bold('✅ READY FOR DEEP CONVERSATIONS!'));
    console.log(chalk.magenta('═'.repeat(60)));
    console.log(chalk.yellow('\n💡 The bot will now provide very detailed, long responses!'));
    console.log(chalk.yellow('📚 Perfect for complex questions and deep discussions.\n'));
}

// Start the bot
console.log(chalk.blue.bold('\n🎯 Starting Standalone AI Bot...'));
startSimpleBot().catch(console.error);
