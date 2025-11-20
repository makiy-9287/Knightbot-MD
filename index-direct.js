/**
 * Malith's AI WhatsApp Bot - DIRECT GEMINI CONNECTION
 * No limitations - Pure Gemini responses
 * Created by Malith Lakshan (94741907061)
 */

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

// Direct Gemini AI
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI("AIzaSyBr8g6SYD9ebRLb3KrrTwCKH_mXxWp7EJI");
const model = genAI.getGenerativeModel({ 
    model: "gemini-2.0-flash",
    // NO generationConfig - Let Gemini decide everything
});

console.log(chalk.green('🚀 Direct Gemini 2.0 Flash Connection'));

// Simple conversation memory
const conversationMemory = new Map();

async function startDirectBot() {
    try {
        console.log(chalk.green.bold('🤖 Starting Direct Gemini Bot...'));
        console.log(chalk.cyan('💬 Pure Gemini responses - No limitations'));
        
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
                    await bot.sendMessage('94741907061@s.whatsapp.net', {
                        text: '🤖 Direct Gemini Bot Connected!\n\nNow using pure Gemini 2.0 Flash with no limitations! 🚀'
                    });
                } catch (error) {}
                
                showDirectInfo();
            }

            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) {
                    console.log(chalk.blue('🔄 Reconnecting...'));
                    await delay(3000);
                    startDirectBot();
                }
            }
        });

        // DIRECT MESSAGE HANDLER - Pure Gemini
        bot.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;

            const message = messages[0];
            if (!message.message || !message.key || message.key.fromMe) return;

            const userJid = message.key.remoteJid;
            const userName = message.pushName || 'User';

            // Get message text
            const messageType = Object.keys(message.message)[0];
            let text = '';
            
            if (messageType === 'conversation') {
                text = message.message.conversation;
            } else if (messageType === 'extendedTextMessage') {
                text = message.message.extendedTextMessage.text;
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

            // DIRECT GEMINI CALL - No limitations
            try {
                // Get conversation history for context
                const history = conversationMemory.get(userJid) || [];
                
                // Build natural prompt with context
                let prompt = text;
                if (history.length > 0) {
                    prompt = `Context from our conversation:\n${history.slice(-4).join('\n')}\n\nCurrent message: ${text}`;
                }

                // Special handling for creator question
                if (text.toLowerCase().includes('who made you') || text.toLowerCase().includes('who created you')) {
                    await bot.sendMessage(userJid, {
                        text: '🤖 I was created by Malith Lakshan! 🚀 You can contact him at: 94741907061'
                    });
                    return;
                }

                // DIRECT GEMINI CALL - No restrictions
                const result = await model.generateContent(prompt);
                const response = await result.response;
                const aiResponse = response.text().trim();

                // Save to conversation memory
                history.push(`User: ${text}`);
                history.push(`AI: ${aiResponse}`);
                if (history.length > 10) history.splice(0, 2); // Keep last 5 exchanges
                conversationMemory.set(userJid, history);

                // Send pure Gemini response
                await bot.sendMessage(userJid, { text: aiResponse });
                console.log(chalk.green(`💬 Gemini: ${aiResponse}`));

            } catch (error) {
                console.error('Gemini Error:', error);
                await bot.sendMessage(userJid, { 
                    text: 'Sorry, there was an error. Please try again.' 
                });
            } finally {
                try {
                    await bot.sendPresenceUpdate('paused', userJid);
                } catch (error) {}
            }
        });

        // Simple call handler
        bot.ev.on('call', async (callData) => {
            if (!callData || !callData.length) return;
            
            const callerJid = callData[0].from;
            console.log(chalk.yellow(`📞 Call from: ${callerJid}`));
            
            try {
                await bot.sendMessage(callerJid, {
                    text: '📵 I\'m a text AI. Please send a message instead. 💬'
                });
            } catch (error) {}
        });

        console.log(chalk.green('✅ Direct Gemini Bot Ready!'));
        return bot;

    } catch (error) {
        console.error(chalk.red('Startup error:'), error);
        await delay(5000);
        startDirectBot();
    }
}

function showDirectInfo() {
    console.log(chalk.magenta('\n' + '═'.repeat(50)));
    console.log(chalk.yellow.bold('     DIRECT GEMINI BOT'));
    console.log(chalk.magenta('═'.repeat(50)));
    console.log(chalk.cyan('👨‍💻 Creator: Malith Lakshan'));
    console.log(chalk.cyan('📞 Contact: 94741907061'));
    console.log(chalk.cyan('🤖 AI: Gemini 2.0 Flash (Pure)'));
    console.log(chalk.cyan('🔓 No limitations'));
    console.log(chalk.cyan('💬 Natural responses'));
    console.log(chalk.green('✅ Pure Gemini experience!'));
    console.log(chalk.magenta('═'.repeat(50) + '\n'));
}

// Start bot
startDirectBot().catch(console.error);
