/**
 * Malith's WhatsApp Bot - GPT & Imagine Only
 * Clean version without AntiDelete
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
    delay
} = require("@whiskeysockets/baileys");
const NodeCache = require("node-cache");
const pino = require("pino");

console.log(chalk.green('🚀 Malith Bot Starting...'));

// AI Command Handler (GPT Only)
async function handleAICommand(sock, chatId, message, text) {
    try {
        const parts = text.split(' ');
        const query = parts.slice(1).join(' ').trim();

        if (!query) {
            return await sock.sendMessage(chatId, { 
                text: "Please provide a question after .gpt\n\nExample: .gpt write a basic html code"
            }, { quoted: message });
        }

        // Show typing indicator
        await sock.sendPresenceUpdate('composing', chatId);

        const response = await axios.get(`https://zellapi.autos/ai/chatbot?text=${encodeURIComponent(query)}`);
        
        if (response.data && response.data.status && response.data.result) {
            const answer = response.data.result;
            await sock.sendMessage(chatId, { text: answer }, { quoted: message });
        } else {
            throw new Error('Invalid response from API');
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

// Main Bot Function
async function startBot() {
    try {
        console.log(chalk.green.bold('🤖 Starting Bot...'));
        
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
                console.log(chalk.cyan('🟢 GPT & Imagine Ready'));
                
                try {
                    await sock.sendMessage('94741907061@s.whatsapp.net', {
                        text: '🤖 *Malith Bot Active!*\n\n✅ GPT AI: .gpt\n🎨 Image Generation: .imagine\n⚡ All systems go!'
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
            const userName = message.pushName || 'User';

            // Get message text
            const messageType = Object.keys(message.message)[0];
            let text = '';
            
            if (messageType === 'conversation') {
                text = message.message.conversation;
            } else if (messageType === 'extendedTextMessage') {
                text = message.message.extendedTextMessage.text;
            }

            // Check for commands
            if (text && text.startsWith('.')) {
                console.log(chalk.blue(`💬 Command from ${userName}: ${text}`));

                // Mark as read
                try { await sock.readMessages([message.key]); } catch (error) {}

                const command = text.split(' ')[0].toLowerCase();

                if (command === '.gpt') {
                    await handleAICommand(sock, chatId, message, text);
                } 
                else if (command === '.imagine') {
                    await handleImagineCommand(sock, chatId, message, text);
                }
            }
        });

        // Keep alive
        setInterval(async () => {
            try { await sock.sendPresenceUpdate('available'); } catch (error) {}
        }, 60000);

        console.log(chalk.green('✅ Bot Ready!'));
        return sock;

    } catch (error) {
        console.error(chalk.red('Startup error:'), error);
        await delay(5000);
        startBot();
    }
}

function showBotInfo() {
    console.log(chalk.magenta('\n' + '═'.repeat(40)));
    console.log(chalk.yellow.bold('     MALITH BOT'));
    console.log(chalk.magenta('═'.repeat(40)));
    console.log(chalk.cyan('🤖 AI: GPT Only'));
    console.log(chalk.cyan('🎨 Image: .imagine'));
    console.log(chalk.cyan('⚡ Fast & Clean'));
    console.log(chalk.green('✅ Ready to use!'));
    console.log(chalk.magenta('═'.repeat(40) + '\n'));
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
