/**
 * Malith's Super AI Bot - All Features Integrated
 * Gemini AI + Image Generation + Anti-Delete + Commands
 * Created by Malith Lakshan
 */

const fs = require('fs');
const chalk = require('chalk');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
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
const { GoogleGenerativeAI } = require("@google/generative-ai");
const path = require('path');

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI("AIzaSyBr8g6SYD9ebRLb3KrrTwCKH_mXxWp7EJI");
const model = genAI.getGenerativeModel({ 
    model: "gemini-2.0-flash",
});

console.log(chalk.green('🚀 Malith Super Bot - All Features Starting...'));

// Enhanced conversation memory
const conversationMemory = new Map();
const processingUsers = new Set();
const messageStore = new Map();
const TEMP_MEDIA_DIR = path.join(__dirname, 'tmp');

// Ensure tmp dir exists
if (!fs.existsSync(TEMP_MEDIA_DIR)) {
    fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });
}

// Anti-delete configuration
let antideleteEnabled = false;

async function startSuperBot() {
    try {
        console.log(chalk.green.bold('🤖 Starting Super Bot with All Features...'));
        
        const { version } = await fetchLatestBaileysVersion();
        const { state, saveCreds } = await useMultiFileAuthState('./session');
        const msgRetryCounterCache = new NodeCache();

        const bot = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            auth: state,
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: true,
            msgRetryCounterCache,
            getMessage: async () => {
                return {
                    conversation: 'Hello from Malith Super Bot! 🤖'
                }
            }
        });

        // Save credentials
        bot.ev.on('creds.update', saveCreds);

        // Connection handler - Always try to stay connected
        bot.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log(chalk.yellow('\n📱 Scan QR Code:'));
                qrcode.generate(qr, { small: true });
            }

            if (connection === 'open') {
                console.log(chalk.green.bold('✅ Connected to WhatsApp!'));
                console.log(chalk.cyan('🟢 Status: Always Online'));
                
                // Set online presence
                try {
                    await bot.sendPresenceUpdate('available');
                } catch (error) {}
                
                showSuperBotInfo();
            }

            if (connection === 'close') {
                console.log(chalk.red('🔌 Connection closed, reconnecting...'));
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) {
                    console.log(chalk.blue('🔄 Reconnecting in 3 seconds...'));
                    await delay(3000);
                    startSuperBot();
                }
            }
        });

        // ENHANCED MESSAGE HANDLER - All Features
        bot.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;

            const message = messages[0];
            if (!message.message || !message.key || message.key.fromMe) return;

            const userJid = message.key.remoteJid;
            const userName = message.pushName || 'Friend';
            const messageText = getMessageText(message);

            // Store message for anti-delete (before processing)
            if (antideleteEnabled) {
                await storeMessage(bot, message);
            }

            // Show only sender name
            console.log(chalk.blue(`💬 Message from: ${userName}`));

            // Skip if already processing
            if (processingUsers.has(userJid)) {
                return;
            }

            processingUsers.add(userJid);

            // Mark as read immediately
            try {
                await bot.readMessages([message.key]);
            } catch (error) {}

            try {
                // Start typing indicator
                await bot.sendPresenceUpdate('composing', userJid);

                // Check for commands
                if (messageText.startsWith('.') || messageText.startsWith('!')) {
                    await handleCommand(bot, userJid, message, messageText);
                } else {
                    // Regular AI conversation
                    await handleAIConversation(bot, userJid, messageText, userName);
                }

                console.log(chalk.green(`✅ Response sent to: ${userName}`));

            } catch (error) {
                console.error('Error:', error);
                try {
                    await bot.sendMessage(userJid, { 
                        text: '😅 Sorry, I encountered an error. Please try again.' 
                    });
                } catch (sendError) {}
            } finally {
                // Remove from processing set and ensure typing stops
                try {
                    await bot.sendPresenceUpdate('paused', userJid);
                } catch (error) {}
                processingUsers.delete(userJid);
            }
        });

        // Handle message deletions for anti-delete
        bot.ev.on('messages.update', async (updates) => {
            if (!antideleteEnabled) return;
            
            for (const update of updates) {
                if (update.update && update.update.messageStubType === 0) { // Message deleted
                    await handleMessageRevocation(bot, update);
                }
            }
        });

        // Keep alive - send presence updates regularly
        setInterval(async () => {
            try {
                await bot.sendPresenceUpdate('available');
            } catch (error) {
                // Silent fail
            }
        }, 60000);

        // Auto-reconnect if connection drops
        setInterval(async () => {
            try {
                await bot.sendPresenceUpdate('available');
            } catch (error) {
                console.log(chalk.yellow('🔄 Checking connection...'));
            }
        }, 30000);

        console.log(chalk.green('✅ Super Bot Ready with All Features!'));
        return bot;

    } catch (error) {
        console.error(chalk.red('Startup error:'), error);
        console.log(chalk.blue('🔄 Restarting in 5 seconds...'));
        await delay(5000);
        startSuperBot();
    }
}

// Handle commands
async function handleCommand(bot, userJid, message, text) {
    const command = text.split(' ')[0].toLowerCase();
    const args = text.slice(command.length).trim();

    switch (command) {
        case '.gpt':
        case '.gemini':
            await handleAICommand(bot, userJid, message, command, args);
            break;
            
        case '.imagine':
            await handleImagineCommand(bot, userJid, message, args);
            break;
            
        case '.antidelete':
            await handleAntideleteCommand(bot, userJid, message, args);
            break;
            
        case '.help':
            await showHelp(bot, userJid, message);
            break;
            
        default:
            await bot.sendMessage(userJid, { 
                text: '❓ Unknown command. Use .help to see available commands.' 
            }, { quoted: message });
    }
}

// AI Command (.gpt & .gemini)
async function handleAICommand(bot, userJid, message, command, query) {
    if (!query) {
        return await bot.sendMessage(userJid, { 
            text: `Please provide a question after ${command}\nExample: ${command} write a story about moon`
        }, { quoted: message });
    }

    try {
        // React with robot emoji
        await bot.sendMessage(userJid, {
            react: { text: '🤖', key: message.key }
        });

        if (command === '.gpt') {
            const response = await axios.get(`https://zellapi.autos/ai/chatbot?text=${encodeURIComponent(query)}`);
            if (response.data && response.data.status && response.data.result) {
                await bot.sendMessage(userJid, {
                    text: response.data.result
                }, { quoted: message });
            } else {
                throw new Error('Invalid response from API');
            }
        } else if (command === '.gemini') {
            const apis = [
                `https://vapis.my.id/api/gemini?q=${encodeURIComponent(query)}`,
                `https://api.siputzx.my.id/api/ai/gemini-pro?content=${encodeURIComponent(query)}`,
                `https://api.ryzendesu.vip/api/ai/gemini?text=${encodeURIComponent(query)}`,
                `https://zellapi.autos/ai/chatbot?text=${encodeURIComponent(query)}`
            ];

            for (const api of apis) {
                try {
                    const response = await axios.get(api);
                    const data = response.data;

                    if (data.message || data.data || data.answer || data.result) {
                        const answer = data.message || data.data || data.answer || data.result;
                        await bot.sendMessage(userJid, {
                            text: answer
                        }, { quoted: message });
                        return;
                    }
                } catch (e) {
                    continue;
                }
            }
            throw new Error('All Gemini APIs failed');
        }
    } catch (error) {
        console.error('API Error:', error);
        await bot.sendMessage(userJid, {
            text: "❌ Failed to get response. Please try again later."
        }, { quoted: message });
    }
}

// Imagine Command (.imagine)
async function handleImagineCommand(bot, userJid, message, prompt) {
    if (!prompt) {
        return await bot.sendMessage(userJid, {
            text: 'Please provide a prompt for image generation.\nExample: .imagine a beautiful sunset over mountains'
        }, { quoted: message });
    }

    try {
        await bot.sendMessage(userJid, {
            text: '🎨 Generating your image... Please wait.'
        }, { quoted: message });

        const enhancedPrompt = enhancePrompt(prompt);
        const response = await axios.get(`https://shizoapi.onrender.com/api/ai/imagine?apikey=shizo&query=${encodeURIComponent(enhancedPrompt)}`, {
            responseType: 'arraybuffer'
        });

        const imageBuffer = Buffer.from(response.data);
        await bot.sendMessage(userJid, {
            image: imageBuffer,
            caption: `🎨 Generated image for: "${prompt}"`
        }, { quoted: message });

    } catch (error) {
        console.error('Imagine error:', error);
        await bot.sendMessage(userJid, {
            text: '❌ Failed to generate image. Please try again later.'
        }, { quoted: message });
    }
}

// Anti-delete Command (.antidelete)
async function handleAntideleteCommand(bot, userJid, message, args) {
    const isCreator = userJid === '94741907061@s.whatsapp.net';
    
    if (!isCreator) {
        return await bot.sendMessage(userJid, { 
            text: '*Only the bot owner can use this command.*' 
        }, { quoted: message });
    }

    if (!args) {
        return await bot.sendMessage(userJid, {
            text: `*ANTIDELETE SETUP*\n\nCurrent Status: ${antideleteEnabled ? '✅ Enabled' : '❌ Disabled'}\n\n.antidelete on - Enable\n.antidelete off - Disable`
        }, { quoted: message });
    }

    if (args === 'on') {
        antideleteEnabled = true;
        await bot.sendMessage(userJid, { 
            text: '*✅ Anti-delete enabled*' 
        }, { quoted: message });
    } else if (args === 'off') {
        antideleteEnabled = false;
        await bot.sendMessage(userJid, { 
            text: '*❌ Anti-delete disabled*' 
        }, { quoted: message });
    }
}

// Regular AI Conversation
async function handleAIConversation(bot, userJid, text, userName) {
    const history = conversationMemory.get(userJid) || [];
    
    const prompt = `Previous conversation: ${history.slice(-4).join('\n')}
    
Current message from ${userName}: "${text}"

Respond as a friendly AI assistant in WhatsApp. Be natural and conversational. 
Use only ONE emoji per message maximum. Choose the most relevant emoji.
Respond in the same language as the user. Keep responses clear and helpful.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let aiResponse = response.text().trim();

    // Clean emojis - limit to one per message
    aiResponse = limitEmojis(aiResponse);

    // Update conversation memory
    history.push(`User: ${text}`);
    history.push(`Assistant: ${aiResponse}`);
    if (history.length > 20) history.splice(0, 4);
    conversationMemory.set(userJid, history);

    await bot.sendMessage(userJid, { text: aiResponse });
}

// Help Command
async function showHelp(bot, userJid, message) {
    const helpText = `*🤖 MALITH SUPER BOT - HELP MENU*

*AI Commands:*
.gpt <question> - Get answer from GPT
.gemini <question> - Get answer from Gemini
.imagine <prompt> - Generate AI images

*Utility Commands:*
.antidelete - Anti-delete system (Owner only)
.help - Show this help menu

*Regular Chat:*
Just send a message to chat naturally with AI!

*Owner:* Malith Lakshan (94741907061)`;

    await bot.sendMessage(userJid, { text: helpText }, { quoted: message });
}

// Anti-delete functions
async function storeMessage(bot, message) {
    try {
        if (!message.key?.id) return;
        const messageId = message.key.id;
        const text = getMessageText(message);
        
        messageStore.set(messageId, {
            content: text,
            sender: message.key.participant || message.key.remoteJid,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Store message error:', error);
    }
}

async function handleMessageRevocation(bot, update) {
    try {
        const messageId = update.key.id;
        const original = messageStore.get(messageId);
        if (!original) return;

        const ownerJid = '94741907061@s.whatsapp.net';
        const time = new Date().toLocaleString();

        const report = `*🔰 ANTIDELETE REPORT 🔰*

🗑️ Message was deleted
👤 Sender: ${original.sender}
🕒 Original time: ${new Date(original.timestamp).toLocaleString()}
🕒 Deleted time: ${time}

💬 Deleted message:
${original.content || '[Media message]'}`;

        await bot.sendMessage(ownerJid, { text: report });
        messageStore.delete(messageId);

    } catch (error) {
        console.error('Anti-delete error:', error);
    }
}

// Utility functions
function getMessageText(message) {
    if (message.message?.conversation) return message.message.conversation;
    if (message.message?.extendedTextMessage?.text) return message.message.extendedTextMessage.text;
    return '';
}

function limitEmojis(text) {
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
    const emojis = text.match(emojiRegex);
    if (!emojis || emojis.length <= 1) return text;
    
    const firstEmoji = emojis[0];
    let result = text.replace(emojiRegex, (emoji, index) => {
        return emoji === firstEmoji ? emoji : '';
    });
    
    return result.replace(/\s+/g, ' ').trim();
}

function enhancePrompt(prompt) {
    const enhancers = ['high quality', 'detailed', 'masterpiece', '4k', 'ultra realistic'];
    const selected = enhancers.sort(() => Math.random() - 0.5).slice(0, 3);
    return `${prompt}, ${selected.join(', ')}`;
}

function showSuperBotInfo() {
    console.log(chalk.magenta('\n' + '═'.repeat(60)));
    console.log(chalk.yellow.bold('     MALITH SUPER BOT - ALL FEATURES'));
    console.log(chalk.magenta('═'.repeat(60)));
    console.log(chalk.cyan('🤖 AI: Direct Gemini + Multiple APIs'));
    console.log(chalk.cyan('🎨 Image: AI Generation with .imagine'));
    console.log(chalk.cyan('🛡️ Anti-delete: Message protection'));
    console.log(chalk.cyan('💬 Commands: .gpt, .gemini, .imagine, .antidelete'));
    console.log(chalk.cyan('⌨️ Typing: Real-time indicators'));
    console.log(chalk.cyan('🟢 Status: Always Online'));
    console.log(chalk.green('✅ All features integrated!'));
    console.log(chalk.magenta('═'.repeat(60) + '\n'));
}

// Handle process events for stability
process.on('uncaughtException', (error) => {
    console.error(chalk.red('Uncaught exception:'), error);
});

process.on('unhandledRejection', (error) => {
    console.error(chalk.red('Unhandled rejection:'), error);
});

// Start the super bot
startSuperBot().catch(error => {
    console.error(chalk.red('Fatal error:'), error);
    setTimeout(startSuperBot, 10000);
});
