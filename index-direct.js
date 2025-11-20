/**
 * Malith's AI WhatsApp Bot - NATURAL CONVERSATION
 * No over-explaining - Just natural responses
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
});

console.log(chalk.green('🚀 Natural Conversation Bot'));

// Simple conversation memory
const conversationMemory = new Map();

async function startNaturalBot() {
    try {
        console.log(chalk.green.bold('🤖 Starting Natural Conversation Bot...'));
        
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
                        text: '🤖 Natural Conversation Bot Active!\n\nNow responding naturally without over-explaining! 🎯'
                    });
                } catch (error) {}
                
                showNaturalInfo();
            }

            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) {
                    console.log(chalk.blue('🔄 Reconnecting...'));
                    await delay(3000);
                    startNaturalBot();
                }
            }
        });

        // NATURAL MESSAGE HANDLER
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

            try {
                // Get conversation history
                const history = conversationMemory.get(userJid) || [];
                
                // Build smart prompt for natural conversation
                let prompt = `You are having a natural WhatsApp conversation. Respond naturally and conversationally.

User's name: ${userName}
Current message: "${text}"`;

                // Add context if available
                if (history.length > 0) {
                    prompt += `\n\nPrevious messages:\n${history.slice(-4).join('\n')}`;
                }

                // Add instructions for natural behavior
                prompt += `\n\nImportant: Respond naturally like a human in a chat. Don't explain your thought process. Don't repeat the user's question. Just give a direct, conversational response in the same language as the user.`;

                // Special case for creator question
                if (text.toLowerCase().includes('who made you') || text.toLowerCase().includes('who created you')) {
                    await bot.sendMessage(userJid, {
                        text: '🤖 I was created by Malith Lakshan! 🚀 You can contact him at: 94741907061'
                    });
                    return;
                }

                // Get natural response from Gemini
                const result = await model.generateContent(prompt);
                const response = await result.response;
                let aiResponse = response.text().trim();

                // Clean up response - remove any thought process explanations
                aiResponse = cleanResponse(aiResponse);

                // Save to conversation memory
                history.push(`User: ${text}`);
                history.push(`AI: ${aiResponse}`);
                if (history.length > 8) history.splice(0, 2);
                conversationMemory.set(userJid, history);

                // Send natural response
                await bot.sendMessage(userJid, { text: aiResponse });
                console.log(chalk.green(`💬 Response: ${aiResponse}`));

            } catch (error) {
                console.error('Error:', error);
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

        console.log(chalk.green('✅ Natural Bot Ready!'));
        return bot;

    } catch (error) {
        console.error(chalk.red('Startup error:'), error);
        await delay(5000);
        startNaturalBot();
    }
}

// Clean responses - remove thought process explanations
function cleanResponse(text) {
    // Remove common over-explaining patterns
    const patterns = [
        /The user is asking:/i,
        /The user is now asking:/i,
        /I need to respond by:/i,
        /Therefore, I should:/i,
        /I understand that:/i,
        /Okay, I understand/i,
        /I should now proceed to:/i,
        /the user is confirming that/i,
        /the user was indeed asking/i,
        /I need to acknowledge/i,
        /respond appropriately/i
    ];

    let cleaned = text;
    patterns.forEach(pattern => {
        cleaned = cleaned.replace(pattern, '');
    });

    // Remove extra spaces and clean up
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    // If cleaning removed everything, use original
    return cleaned.length > 10 ? cleaned : text;
}

function showNaturalInfo() {
    console.log(chalk.magenta('\n' + '═'.repeat(50)));
    console.log(chalk.yellow.bold('     NATURAL CONVERSATION BOT'));
    console.log(chalk.magenta('═'.repeat(50)));
    console.log(chalk.cyan('👨‍💻 Creator: Malith Lakshan'));
    console.log(chalk.cyan('📞 Contact: 94741907061'));
    console.log(chalk.cyan('🤖 AI: Gemini 2.0 Flash'));
    console.log(chalk.cyan('💬 Responses: Natural & Direct'));
    console.log(chalk.cyan('🚫 No over-explaining'));
    console.log(chalk.green('✅ Clean conversations!'));
    console.log(chalk.magenta('═'.repeat(50) + '\n'));
}

// Start bot
startNaturalBot().catch(console.error);
