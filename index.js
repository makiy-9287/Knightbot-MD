/**
 * Malith's Gemini AI WhatsApp Bot - WORKING VERSION
 * Powered by Google Gemini AI
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

// Import AI and Firebase
const GeminiAI = require('./lib/gemini');
const FirebaseManager = require('./lib/firebase');

// Initialize AI and Database
const aiBot = new GeminiAI();
const firebaseManager = new FirebaseManager();

// Store for user sessions
const userSessions = new Map();

async function startAIBot() {
    try {
        console.log(chalk.green.bold('🚀 Starting Malith\'s AI WhatsApp Bot...'));
        console.log(chalk.cyan('🤖 Powered by Gemini AI 2.0 Flash'));
        
        const { version } = await fetchLatestBaileysVersion();
        const { state, saveCreds } = await useMultiFileAuthState('./session');
        const msgRetryCounterCache = new NodeCache();

        console.log(chalk.blue('🔐 Loading WhatsApp connection...'));

        const bot = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            // REMOVED printQRInTerminal - we handle QR manually
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

        // Handle connection updates - MANUAL QR CODE HANDLING
        bot.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            console.log(chalk.blue(`🔄 Connection status: ${connection}`));

            // MANUAL QR CODE HANDLING - This is the fix!
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
                console.log(chalk.blue('🔄 Connecting to WhatsApp servers...'));
            }

            if (connection === 'open') {
                console.log(chalk.green.bold('\n✅ SUCCESS! Connected to WhatsApp!'));
                console.log(chalk.cyan(`🤖 Bot User: ${bot.user?.name || 'Malith AI Bot'}`));
                
                // Send startup message to owner
                try {
                    const ownerJid = global.owner;
                    if (ownerJid) {
                        await bot.sendMessage(ownerJid, {
                            text: `🤖 *Malith\'s AI Bot Activated!*\n\n✅ Connected: ${new Date().toLocaleString()}\n🚀 Powered by Gemini AI 2.0 Flash\n🌐 Ready to assist in Sinhala/English/Singlish!\n\nCreated by Malith Lakshan (94741907061) 🎉`
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

                console.log(chalk.yellow(`🔌 Connection closed. Status code: ${statusCode}`));
                console.log(chalk.yellow(`🔄 Auto-reconnect: ${shouldReconnect}`));

                if (statusCode === DisconnectReason.loggedOut) {
                    console.log(chalk.red('❌ Session logged out. Clearing session...'));
                    try {
                        if (fs.existsSync('./session')) {
                            fs.rmSync('./session', { recursive: true, force: true });
                            console.log(chalk.yellow('🗑️ Session folder deleted. Please scan QR code again.'));
                        }
                    } catch (error) {
                        console.error('Error clearing session:', error);
                    }
                }

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
                    // Clean mention from text
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

                // Get or create user session
                let userSession = userSessions.get(userJid);
                if (!userSession) {
                    userSession = await firebaseManager.getSession(userJid) || {
                        userId: userJid,
                        userName: userName,
                        conversationCount: 0,
                        createdAt: new Date().toISOString()
                    };
                    userSessions.set(userJid, userSession);
                }

                // Generate AI response
                console.log(chalk.yellow('🤖 Processing with Gemini AI...'));
                const aiResponse = await aiBot.generateResponse(text, userName);
                
                // Update conversation in Firebase
                await firebaseManager.updateConversation(userJid, text, aiResponse);
                
                // Update session
                userSession.conversationCount++;
                userSession.lastActive = new Date().toISOString();
                userSession.userName = userName;
                await firebaseManager.saveSession(userJid, userSession);

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
                console.error(chalk.red('❌ Message processing error:'), error.message);
                try {
                    const userJid = messages[0]?.key.remoteJid;
                    if (userJid) {
                        await bot.sendMessage(userJid, { 
                            text: '😅 Sorry! I encountered an error. Please try again in a moment.' 
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
                    text: '📵 *Auto Call Response*\n\nI\'m Malith\'s AI text assistant! 🤖\n\nI can only respond to text messages, not calls.\n\nPlease send me a message instead! 💬\n\n_Created by Malith Lakshan (94741907061)_'
                });
                
            } catch (error) {
                console.error('Call handling error:', error.message);
            }
        });

        // Group events (for logging)
        bot.ev.on('group-participants.update', async (update) => {
            console.log(chalk.blue('👥 Group update:'), update.id);
        });

        console.log(chalk.green('✅ Bot initialization complete!'));
        console.log(chalk.yellow('📱 Waiting for QR code to be generated...'));

        return bot;

    } catch (error) {
        console.error(chalk.red('❌ Bot startup error:'), error.message);
        console.log(chalk.blue('🔄 Restarting in 5 seconds...'));
        await delay(5000);
        startAIBot();
    }
}

function showBotInfo() {
    console.log(chalk.magenta('\n' + '═'.repeat(60)));
    console.log(chalk.yellow.bold('           MALITH\'S AI WHATSAPP BOT'));
    console.log(chalk.magenta('═'.repeat(60)));
    console.log(chalk.cyan('👨‍💻 Creator:') + chalk.white(' Malith Lakshan'));
    console.log(chalk.cyan('📞 Contact:') + chalk.white(' 94741907061'));
    console.log(chalk.cyan('🤖 AI Model:') + chalk.white(' Gemini 2.0 Flash'));
    console.log(chalk.cyan('🌐 Languages:') + chalk.white(' Sinhala, English, Singlish'));
    console.log(chalk.cyan('💾 Storage:') + chalk.white(' Firebase Database'));
    console.log(chalk.cyan('😊 Features:') + chalk.white(' Emotional AI + Emojis'));
    console.log(chalk.green.bold('✅ BOT IS READY TO RECEIVE MESSAGES!'));
    console.log(chalk.magenta('═'.repeat(60)));
    console.log(chalk.yellow('\n💡 Now anyone can message this number and get AI responses!'));
    console.log(chalk.yellow('🎯 The bot will auto-detect language and respond appropriately.\n'));
}

// Error handling
process.on('uncaughtException', (error) => {
    console.error(chalk.red.bold('🛑 Uncaught Exception:'), error.message);
});

process.on('unhandledRejection', (error) => {
    console.error(chalk.red.bold('🛑 Unhandled Rejection:'), error.message);
});

// Clean shutdown
process.on('SIGINT', () => {
    console.log(chalk.yellow('\n🛑 Shutting down Malith\'s AI Bot...'));
    console.log(chalk.green('👋 Thank you for using Malith\'s AI Assistant!'));
    process.exit(0);
});

// Start the bot
console.log(chalk.blue.bold('\n🎯 Malith\'s AI Bot Initializing...'));
console.log(chalk.cyan('💡 Make sure you have stable internet connection'));
startAIBot().catch(console.error);
