/**
 * Malith's Advanced WhatsApp Bot
 * All features integrated: AI, AntiDelete, Imagine
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
const path = require('path');

console.log(chalk.green('🚀 Malith Advanced Bot Starting...'));

// Configuration
const SUDO_NUMBERS = ['94741907061@s.whatsapp.net'];
const messageStore = new Map();
const TEMP_MEDIA_DIR = path.join(__dirname, 'tmp');
const CONFIG_PATH = path.join(__dirname, 'data/antidelete.json');

// Ensure directories exist
if (!fs.existsSync(TEMP_MEDIA_DIR)) {
    fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });
}
if (!fs.existsSync(path.dirname(CONFIG_PATH))) {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
}

// Load AntiDelete Config
function loadAntideleteConfig() {
    try {
        if (!fs.existsSync(CONFIG_PATH)) return { enabled: false };
        return JSON.parse(fs.readFileSync(CONFIG_PATH));
    } catch {
        return { enabled: false };
    }
}

// Save AntiDelete Config
function saveAntideleteConfig(config) {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    } catch (err) {
        console.error('Config save error:', err);
    }
}

// Check if user is sudo
function isSudo(userJid) {
    return SUDO_NUMBERS.includes(userJid);
}

// AI Command Handler
async function handleAICommand(sock, chatId, message, text) {
    try {
        const parts = text.split(' ');
        const command = parts[0].toLowerCase();
        const query = parts.slice(1).join(' ').trim();

        if (!query) {
            return await sock.sendMessage(chatId, { 
                text: "Please provide a question after .gpt or .gemini\n\nExample: .gpt write a basic html code"
            }, { quoted: message });
        }

        // Show typing indicator
        await sock.sendPresenceUpdate('composing', chatId);

        if (command === '.gpt') {
            const response = await axios.get(`https://zellapi.autos/ai/chatbot?text=${encodeURIComponent(query)}`);
            
            if (response.data && response.data.status && response.data.result) {
                const answer = response.data.result;
                await sock.sendMessage(chatId, { text: answer }, { quoted: message });
            } else {
                throw new Error('Invalid response from API');
            }
        } else if (command === '.gemini') {
            const apis = [
                `https://vapis.my.id/api/gemini?q=${encodeURIComponent(query)}`,
                `https://api.siputzx.my.id/api/ai/gemini-pro?content=${encodeURIComponent(query)}`,
                `https://api.ryzendesu.vip/api/ai/gemini?text=${encodeURIComponent(query)}`,
                `https://zellapi.autos/ai/chatbot?text=${encodeURIComponent(query)}`,
                `https://api.giftedtech.my.id/api/ai/geminiai?apikey=gifted&q=${encodeURIComponent(query)}`,
                `https://api.giftedtech.my.id/api/ai/geminiaipro?apikey=gifted&q=${encodeURIComponent(query)}`
            ];

            for (const api of apis) {
                try {
                    const response = await axios.get(api);
                    const data = response.data;

                    if (data.message || data.data || data.answer || data.result) {
                        const answer = data.message || data.data || data.answer || data.result;
                        await sock.sendMessage(chatId, { text: answer }, { quoted: message });
                        return;
                    }
                } catch (e) {
                    continue;
                }
            }
            throw new Error('All Gemini APIs failed');
        }

    } catch (error) {
        console.error('AI Command Error:', error);
        await sock.sendMessage(chatId, {
            text: "❌ Failed to get response. Please try again later."
        }, { quoted: message });
    } finally {
        await sock.sendPresenceUpdate('paused', chatId);
    }
}

// Imagine Command Handler
async function handleImagineCommand(sock, chatId, message, text) {
    try {
        const imagePrompt = text.slice(9).trim();
        
        if (!imagePrompt) {
            await sock.sendMessage(chatId, {
                text: 'Please provide a prompt for the image generation.\nExample: .imagine a beautiful sunset over mountains'
            }, { quoted: message });
            return;
        }

        await sock.sendPresenceUpdate('composing', chatId);
        await sock.sendMessage(chatId, { text: '🎨 Generating your image... Please wait.' }, { quoted: message });

        // Enhance the prompt with quality keywords
        const enhancedPrompt = enhancePrompt(imagePrompt);

        const response = await axios.get(`https://shizoapi.onrender.com/api/ai/imagine?apikey=shizo&query=${encodeURIComponent(enhancedPrompt)}`, {
            responseType: 'arraybuffer'
        });

        const imageBuffer = Buffer.from(response.data);

        await sock.sendMessage(chatId, {
            image: imageBuffer,
            caption: `🎨 Generated image for: "${imagePrompt}"`
        }, { quoted: message });

    } catch (error) {
        console.error('Imagine Command Error:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Failed to generate image. Please try again later.'
        }, { quoted: message });
    } finally {
        await sock.sendPresenceUpdate('paused', chatId);
    }
}

function enhancePrompt(prompt) {
    const qualityEnhancers = [
        'high quality', 'detailed', 'masterpiece', 'best quality', 
        'ultra realistic', '4k', 'highly detailed'
    ];
    const numEnhancers = Math.floor(Math.random() * 2) + 3;
    const selectedEnhancers = qualityEnhancers.sort(() => Math.random() - 0.5).slice(0, numEnhancers);
    return `${prompt}, ${selectedEnhancers.join(', ')}`;
}

// AntiDelete Command Handler
async function handleAntiDeleteCommand(sock, chatId, message, match) {
    const userJid = message.key.participant || message.key.remoteJid;
    
    if (!isSudo(userJid)) {
        return sock.sendMessage(chatId, { text: '*Only sudo users can use this command.*' }, { quoted: message });
    }

    const config = loadAntideleteConfig();

    if (!match) {
        return sock.sendMessage(chatId, {
            text: `*ANTIDELETE SETUP*\n\nCurrent Status: ${config.enabled ? '✅ Enabled' : '❌ Disabled'}\n\n*.antidelete on* - Enable\n*.antidelete off* - Disable`
        }, { quoted: message });
    }

    if (match === 'on') {
        config.enabled = true;
    } else if (match === 'off') {
        config.enabled = false;
    } else {
        return sock.sendMessage(chatId, { text: '*Invalid command. Use .antidelete to see usage.*' }, { quoted: message });
    }

    saveAntideleteConfig(config);
    return sock.sendMessage(chatId, { text: `*Antidelete ${match === 'on' ? 'enabled' : 'disabled'}*` }, { quoted: message });
}

// Help Command Handler
async function handleHelpCommand(sock, chatId, message) {
    const userJid = message.key.participant || message.key.remoteJid;
    
    if (!isSudo(userJid)) {
        return sock.sendMessage(chatId, { text: '*Only sudo users can use this command.*' }, { quoted: message });
    }

    const helpText = `*🤖 MALITH BOT COMMANDS*

*PUBLIC COMMANDS:*
• .gpt <question> - Get AI response (GPT)
• .gemini <question> - Get AI response (Gemini)
• .imagine <prompt> - Generate AI image

*SUDO COMMANDS:*
• .antidelete on/off - Enable/disable anti-delete
• .help - Show this help menu

*Developer:* Malith Lakshan (94741907061)`;

    await sock.sendMessage(chatId, { text: helpText }, { quoted: message });
}

// Store messages for AntiDelete
async function storeMessage(sock, message) {
    try {
        const config = loadAntideleteConfig();
        if (!config.enabled) return;

        if (!message.key?.id) return;

        const messageId = message.key.id;
        let content = '';
        let mediaType = '';
        let mediaPath = '';

        const sender = message.key.participant || message.key.remoteJid;

        if (message.message?.conversation) {
            content = message.message.conversation;
        } else if (message.message?.extendedTextMessage?.text) {
            content = message.message.extendedTextMessage.text;
        } else if (message.message?.imageMessage) {
            mediaType = 'image';
            content = message.message.imageMessage.caption || '';
            const buffer = await downloadContentFromMessage(message.message.imageMessage, 'image');
            mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.jpg`);
            await fs.promises.writeFile(mediaPath, buffer);
        }

        messageStore.set(messageId, {
            content,
            mediaType,
            mediaPath,
            sender,
            group: message.key.remoteJid.endsWith('@g.us') ? message.key.remoteJid : null,
            timestamp: new Date().toISOString()
        });

    } catch (err) {
        console.error('storeMessage error:', err);
    }
}

// Handle message deletion
async function handleMessageRevocation(sock, revocationMessage) {
    try {
        const config = loadAntideleteConfig();
        if (!config.enabled) return;

        const messageId = revocationMessage.message.protocolMessage.key.id;
        const deletedBy = revocationMessage.participant || revocationMessage.key.participant || revocationMessage.key.remoteJid;

        // Don't report if sudo deletes
        if (isSudo(deletedBy)) return;

        const original = messageStore.get(messageId);
        if (!original) return;

        const sender = original.sender;
        const senderName = sender.split('@')[0];

        const time = new Date().toLocaleString('en-US', {
            timeZone: 'Asia/Kolkata',
            hour12: true, hour: '2-digit', minute: '2-digit'
        });

        let text = `*🔰 ANTIDELETE REPORT 🔰*\n\n` +
            `*🗑️ Deleted By:* @${deletedBy.split('@')[0]}\n` +
            `*👤 Sender:* @${senderName}\n` +
            `*📱 Number:* ${sender}\n` +
            `*🕒 Time:* ${time}\n`;

        if (original.content) {
            text += `\n*💬 Deleted Message:*\n${original.content}`;
        }

        // Send to all sudo numbers
        for (const sudoNumber of SUDO_NUMBERS) {
            try {
                await sock.sendMessage(sudoNumber, { text, mentions: [deletedBy, sender] });
                
                // Send media if exists
                if (original.mediaType && fs.existsSync(original.mediaPath)) {
                    const mediaOptions = { caption: `*Deleted ${original.mediaType}*`, mentions: [sender] };
                    
                    if (original.mediaType === 'image') {
                        await sock.sendMessage(sudoNumber, { image: { url: original.mediaPath }, ...mediaOptions });
                    }
                }
            } catch (err) {
                console.error('Error sending to sudo:', err);
            }
        }

        // Cleanup
        if (original.mediaPath && fs.existsSync(original.mediaPath)) {
            try { fs.unlinkSync(original.mediaPath); } catch (err) {}
        }
        messageStore.delete(messageId);

    } catch (err) {
        console.error('handleMessageRevocation error:', err);
    }
}

// Main Bot Function
async function startBot() {
    try {
        console.log(chalk.green.bold('🤖 Starting Advanced Bot...'));
        
        const { version } = await fetchLatestBaileysVersion();
        const { state, saveCreds } = await useMultiFileAuthState('./session');
        const msgRetryCounterCache = new NodeCache();

        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            auth: state,
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: true,
            msgRetryCounterCache,
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log(chalk.yellow('\n📱 Scan QR Code:'));
                qrcode.generate(qr, { small: true });
            }

            if (connection === 'open') {
                console.log(chalk.green.bold('✅ Connected to WhatsApp!'));
                console.log(chalk.cyan('🟢 All Features Active'));
                
                try {
                    await sock.sendMessage(SUDO_NUMBERS[0], {
                        text: '🤖 *Malith Advanced Bot Active!*\n\n✅ AI Commands: .gpt, .gemini\n🎨 Image Generation: .imagine\n🔰 AntiDelete: Ready\n⚡ All systems go!'
                    });
                } catch (error) {}
                
                showBotInfo();
            }

            if (connection === 'close') {
                console.log(chalk.red('🔌 Connection closed, reconnecting...'));
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) {
                    console.log(chalk.blue('🔄 Reconnecting in 3 seconds...'));
                    await delay(3000);
                    startBot();
                }
            }
        });

        // Message Handler
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;

            const message = messages[0];
            if (!message.message || !message.key) return;

            const chatId = message.key.remoteJid;
            const userJid = message.key.participant || chatId;
            const userName = message.pushName || 'User';

            // Get message text
            const messageType = Object.keys(message.message)[0];
            let text = '';
            
            if (messageType === 'conversation') {
                text = message.message.conversation;
            } else if (messageType === 'extendedTextMessage') {
                text = message.message.extendedTextMessage.text;
            }

            // Store message for AntiDelete
            await storeMessage(sock, message);

            // Check for commands
            if (text && text.startsWith('.')) {
                console.log(chalk.blue(`💬 Command from ${userName}: ${text}`));

                // Mark as read
                try { await sock.readMessages([message.key]); } catch (error) {}

                const command = text.split(' ')[0].toLowerCase();

                // Public commands
                if (command === '.gpt' || command === '.gemini') {
                    await handleAICommand(sock, chatId, message, text);
                } 
                else if (command === '.imagine') {
                    await handleImagineCommand(sock, chatId, message, text);
                }
                // Sudo commands
                else if (command === '.antidelete') {
                    const match = text.split(' ')[1];
                    await handleAntiDeleteCommand(sock, chatId, message, match);
                }
                else if (command === '.help') {
                    await handleHelpCommand(sock, chatId, message);
                }
            }
        });

        // Handle message deletions
        sock.ev.on('messages.update', async (updates) => {
            for (const update of updates) {
                if (update.update && update.update.messageStubType === 0) { // Message deleted
                    await handleMessageRevocation(sock, update);
                }
            }
        });

        // Keep alive
        setInterval(async () => {
            try { await sock.sendPresenceUpdate('available'); } catch (error) {}
        }, 60000);

        console.log(chalk.green('✅ Advanced Bot Ready!'));
        return sock;

    } catch (error) {
        console.error(chalk.red('Startup error:'), error);
        await delay(5000);
        startBot();
    }
}

function showBotInfo() {
    console.log(chalk.magenta('\n' + '═'.repeat(50)));
    console.log(chalk.yellow.bold('     MALITH ADVANCED BOT'));
    console.log(chalk.magenta('═'.repeat(50)));
    console.log(chalk.cyan('🤖 AI: GPT & Gemini APIs'));
    console.log(chalk.cyan('🎨 Image: .imagine command'));
    console.log(chalk.cyan('🔰 AntiDelete: Sudo protected'));
    console.log(chalk.cyan('👑 Sudo: 94741907061'));
    console.log(chalk.cyan('⚡ Commands: .gpt, .gemini, .imagine'));
    console.log(chalk.green('✅ All features integrated!'));
    console.log(chalk.magenta('═'.repeat(50) + '\n'));
}

// Handle process events
process.on('SIGINT', () => {
    console.log(chalk.yellow('\n🔄 Restarting bot...'));
    startBot();
});

process.on('uncaughtException', (error) => {
    console.error(chalk.red('Uncaught exception:'), error);
    console.log(chalk.blue('🔄 Restarting...'));
    startBot();
});

// Start bot
startBot().catch(error => {
    console.error(chalk.red('Fatal error:'), error);
    setTimeout(startBot, 10000);
});
