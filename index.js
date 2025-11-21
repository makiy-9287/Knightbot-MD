/**
 * Malith's Friendly AI Assistant
 * Direct Gemini with friendly responses & emojis
 * Created by Malith Lakshan
 */

const fs = require('fs');
const chalk = require('chalk');
const qrcode = require('qrcode-terminal');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion, 
    delay,
    downloadMediaMessage
} = require("@whiskeysockets/baileys");
const NodeCache = require("node-cache");
const pino = require("pino");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI("AIzaSyBr8g6SYD9ebRLb3KrrTwCKH_mXxWp7EJI");
const model = genAI.getGenerativeModel({ 
    model: "gemini-2.0-flash",
});

console.log(chalk.green('🚀 Malith AI Assistant Starting...'));

async function startBot() {
    try {
        console.log(chalk.green.bold('🤖 Starting Friendly AI Assistant...'));
        
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
                
                try {
                    await bot.sendMessage('94789570921@s.whatsapp.net', {
                        text: '👋 Hello! Your friendly AI assistant is now active! 🤖\n\nHow can I help you today? 😊'
                    });
                } catch (error) {}
                
                showBotInfo();
            }

            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) {
                    console.log(chalk.blue('🔄 Reconnecting...'));
                    await delay(3000);
                    startBot();
                }
            }
        });

        // FRIENDLY MESSAGE HANDLER
        bot.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;

            const message = messages[0];
            if (!message.message || !message.key || message.key.fromMe) return;

            const userJid = message.key.remoteJid;
            const userName = message.pushName || 'Friend';

            // Get message content
            let text = '';
            let isImage = false;

            const messageType = Object.keys(message.message)[0];
            
            if (messageType === 'conversation') {
                text = message.message.conversation;
            } else if (messageType === 'extendedTextMessage') {
                text = message.message.extendedTextMessage.text;
            } else if (messageType === 'imageMessage') {
                isImage = true;
                text = message.message.imageMessage.caption || '';
            }

            if (!text.trim() && !isImage) return;

            // Show only sender name
            console.log(chalk.blue(`💬 Message from: ${userName}`));

            // Mark as read
            try {
                await bot.readMessages([message.key]);
            } catch (error) {}

            // Typing indicator
            try {
                await bot.sendPresenceUpdate('composing', userJid);
            } catch (error) {}

            try {
                let aiResponse = '';

                if (isImage) {
                    aiResponse = await handleFriendlyImageResponse(text);
                } else {
                    aiResponse = await handleFriendlyTextMessage(text, userName);
                }

                // Send friendly response
                await bot.sendMessage(userJid, { text: aiResponse });
                console.log(chalk.green(`✅ Friendly response sent to: ${userName}`));

            } catch (error) {
                console.error('Error:', error);
                await bot.sendMessage(userJid, { 
                    text: '😅 Oops! There was a small issue. Please try again! 🔄' 
                });
            } finally {
                try {
                    await bot.sendPresenceUpdate('paused', userJid);
                } catch (error) {}
            }
        });

        // Friendly call handler
        bot.ev.on('call', async (callData) => {
            if (!callData || !callData.length) return;
            
            const callerJid = callData[0].from;
            console.log(chalk.yellow(`📞 Call from: ${callerJid}`));
            
            try {
                await bot.sendMessage(callerJid, {
                    text: "📵 Hey there! I'm a text-based assistant. ✨\n\nSend me a message instead - I'd love to help! 💬"
                });
            } catch (error) {}
        });

        console.log(chalk.green('✅ Friendly Assistant Ready!'));
        return bot;

    } catch (error) {
        console.error(chalk.red('Startup error:'), error);
        await delay(5000);
        startBot();
    }
}

// Friendly text message handling
async function handleFriendlyTextMessage(text, userName) {
    try {
        const friendlyPrompt = `You are a friendly, warm AI assistant in a private WhatsApp chat. Respond naturally and conversationally.

User's message: "${text}"

Important guidelines:
- Use friendly, warm tone with appropriate emojis 😊✨🌟
- Be conversational and natural
- Use the user's name occasionally: ${userName}
- Respond in the same language the user uses
- Keep responses helpful but personal
- Add relevant emojis to make it engaging
- Don't be too formal - be like a friendly assistant
- For questions, be thorough but friendly
- For casual chat, be warm and engaging

Make it feel like a real WhatsApp conversation between friends!`;

        const result = await model.generateContent(friendlyPrompt);
        const response = await result.response;
        return response.text().trim();
        
    } catch (error) {
        console.error('Gemini error:', error);
        return `😅 Sorry ${userName}, I'm having trouble right now. Can you try again? 🔄`;
    }
}

// Friendly image response
async function handleFriendlyImageResponse(caption) {
    try {
        let prompt = "The user sent an image";
        if (caption) {
            prompt += ` with this message: "${caption}".`;
        } else {
            prompt += ".";
        }
        
        prompt += ` Respond in a friendly, helpful way with some emojis. Describe what you would see and engage naturally.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return `🖼️ ${response.text().trim()}`;
        
    } catch (error) {
        return '📸 Thanks for the image! I received it but having trouble analyzing right now. 😅';
    }
}

function showBotInfo() {
    console.log(chalk.magenta('\n' + '═'.repeat(50)));
    console.log(chalk.yellow.bold('     FRIENDLY AI ASSISTANT'));
    console.log(chalk.magenta('═'.repeat(50)));
    console.log(chalk.cyan('🤖 AI: Gemini 2.0 Flash'));
    console.log(chalk.cyan('💬 Style: Friendly & Personal'));
    console.log(chalk.cyan('😊 Tone: Warm with Emojis'));
    console.log(chalk.cyan('👤 Personal: Uses names naturally'));
    console.log(chalk.green('✅ Your private AI assistant!'));
    console.log(chalk.magenta('═'.repeat(50) + '\n'));
}

// Start bot
startBot().catch(console.error);
