/**
 * Malith's Gemini AI WhatsApp Bot
 * Powered by Google Gemini AI
 * Created by Malith Lakshan (94741907061)
 */

require('./settings');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const chalk = require('chalk');
const qrcode = require('qrcode-terminal');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion, 
    delay,
    makeCacheableSignalKeyStore
} = require("@whiskeysockets/baileys");
const NodeCache = require("node-cache");
const pino = require("pino");
const readline = require("readline");

// Import AI and Firebase
const GeminiAI = require('./lib/gemini');
const FirebaseManager = require('./lib/firebase');

// Initialize AI and Database
const aiBot = new GeminiAI();
const firebaseManager = new FirebaseManager();

const pairingCode = process.argv.includes("--pairing-code");
const useMobile = process.argv.includes("--mobile");

// Store for user sessions
const userSessions = new Map();

// Readline interface for pairing code
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (text) => new Promise((resolve) => rl.question(text, resolve));

async function startAIBot() {
    try {
        console.log(chalk.green.bold('🚀 Starting Malith\'s AI WhatsApp Bot...'));
        console.log(chalk.cyan('🤖 Powered by Gemini AI 2.0 Flash'));
        
        const { version, isLatest } = await fetchLatestBaileysVersion();
        const { state, saveCreds } = await useMultiFileAuthState('./session');
        const msgRetryCounterCache = new NodeCache();

        const bot = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: !pairingCode,
            browser: ["Malith AI Bot", "Chrome", "20.0.04"],
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
            },
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            msgRetryCounterCache,
            defaultQueryTimeoutMs: 60000,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
        });

        // Save credentials when updated
        bot.ev.on('creds.update', saveCreds);

        // Handle pairing code
        if (pairingCode && !bot.authState.creds.registered) {
            if (useMobile) throw new Error('Cannot use pairing code with mobile api');

            let phoneNumber = await question(chalk.blue.bold('📱 Enter your WhatsApp number (format: 94741907061): '));
            
            // Clean the phone number
            phoneNumber = phoneNumber.replace(/[^0-9]/g, '');
            
            if (!phoneNumber) {
                phoneNumber = "94741907061"; // Default to your number
            }

            console.log(chalk.yellow('🔄 Requesting pairing code...'));
            
            setTimeout(async () => {
                try {
                    let code = await bot.requestPairingCode(phoneNumber);
                    code = code?.match(/.{1,4}/g)?.join("-") || code;
                    console.log(chalk.green.bold('✅ Pairing Code:'), chalk.white.bgGreen(code));
                    console.log(chalk.cyan('\n📝 How to use:'));
                    console.log(chalk.cyan('1. Open WhatsApp → Settings → Linked Devices'));
                    console.log(chalk.cyan('2. Tap "Link a Device"'));
                    console.log(chalk.cyan('3. Enter the code: ') + chalk.white.bgGreen(code));
                    console.log(chalk.cyan('4. You\'re connected! 🎉'));
                } catch (error) {
                    console.error(chalk.red('❌ Error getting pairing code:'), error);
                }
            }, 3000);
        }

        // Handle QR code
        bot.ev.on('connection.update', (update) => {
            const { qr } = update;
            if (qr && !pairingCode) {
                console.log(chalk.yellow('📱 Scan this QR code with WhatsApp:'));
                qrcode.generate(qr, { small: true });
            }
        });

        // Handle incoming messages
        bot.ev.on('messages.upsert', async ({ messages, type }) => {
            try {
                if (type !== 'notify') return;

                const message = messages[0];
                if (!message.message || !message.key) return;

                // Get message content
                const messageType = Object.keys(message.message)[0];
                let text = '';
                
                if (messageType === 'conversation') {
                    text = message.message.conversation;
                } else if (messageType === 'extendedTextMessage') {
                    text = message.message.extendedTextMessage.text;
                }

                if (!text || message.key.fromMe) return;

                const userJid = message.key.remoteJid;
                const userName = message.pushName || 'Friend';
                const isGroup = userJid.endsWith('@g.us');

                // Ignore messages from groups unless mentioned
                if (isGroup) {
                    const botJid = bot.user.id.split(':')[0] + '@s.whatsapp.net';
                    const mentionedJid = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                    if (!mentionedJid.includes(botJid) && !text.includes('@' + botJid.split('@')[0])) {
                        return;
                    }
                    // Clean mention from text
                    text = text.replace(/@\d+/g, '').trim();
                }

                console.log(chalk.blue(`📩 [${isGroup ? 'GROUP' : 'DM'}] ${userName}: ${text}`));

                // Mark as read
                if (bot.readMessages) {
                    await bot.readMessages([message.key]);
                }

                // Typing indicator
                await bot.sendPresenceUpdate('composing', userJid);

                // Get or create user session
                let userSession = userSessions.get(userJid);
                if (!userSession) {
                    userSession = await firebaseManager.getSession(userJid) || {
                        userId: userJid,
                        userName: userName,
                        conversationCount: 0,
                        language: 'auto',
                        createdAt: new Date().toISOString()
                    };
                    userSessions.set(userJid, userSession);
                }

                // Generate AI response
                const aiResponse = await aiBot.generateResponse(text, userName);
                
                // Update conversation in Firebase
                await firebaseManager.updateConversation(userJid, text, aiResponse);
                
                // Update session data
                userSession.conversationCount++;
                userSession.lastActive = new Date().toISOString();
                userSession.userName = userName; // Update name if changed
                await firebaseManager.saveSession(userJid, userSession);

                // Stop typing
                await bot.sendPresenceUpdate('paused', userJid);

                // Send response
                await bot.sendMessage(userJid, { text: aiResponse });
                console.log(chalk.green(`🤖 AI Response: ${aiResponse}`));

            } catch (error) {
                console.error(chalk.red('❌ Message processing error:'), error);
                try {
                    const userJid = messages[0]?.key.remoteJid;
                    if (userJid) {
                        await bot.sendMessage(userJid, { 
                            text: '😅 Sorry, I encountered an error while processing your message. Please try again!' 
                        });
                    }
                } catch (sendError) {
                    console.error('Error sending error message:', sendError);
                }
            }
        });

        // Connection handling
        bot.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'connecting') {
                console.log(chalk.blue('🔄 Connecting to WhatsApp...'));
            }

            if (connection === 'open') {
                console.log(chalk.green.bold('✅ Successfully connected to WhatsApp!'));
                console.log(chalk.cyan(`🤖 Bot User: ${bot.user.name || 'Unknown'}`));
                
                // Send startup message to owner
                try {
                    const ownerJid = global.owner;
                    await bot.sendMessage(ownerJid, {
                        text: `🤖 *Malith\'s AI Bot Started Successfully!*\n\n✅ *Status:* Online and Ready!\n⏰ *Time:* ${new Date().toLocaleString()}\n🚀 *Powered by:* Gemini AI 2.0 Flash\n🌐 *Languages:* Sinhala, English, Singlish\n\nI\'m now ready to assist your friends! 🎉`
                    });
                } catch (error) {
                    console.log('ℹ️ Could not send startup message to owner');
                }

                // Display bot info
                showBotInfo();
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                console.log(chalk.yellow(`🔌 Connection closed. Status: ${statusCode}`));
                console.log(chalk.yellow(`🔄 Reconnecting: ${shouldReconnect}`));

                if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                    console.log(chalk.red('❌ Session logged out. Please re-authenticate.'));
                    try {
                        require('fs').rmSync('./session', { recursive: true, force: true });
                        console.log(chalk.yellow('🗑️ Session folder cleared.'));
                    } catch (error) {
                        console.error('Error clearing session:', error);
                    }
                }

                if (shouldReconnect) {
                    console.log(chalk.blue('🔄 Reconnecting in 5 seconds...'));
                    await delay(5000);
                    startAIBot();
                } else {
                    console.log(chalk.red('❌ Cannot reconnect. Please restart the bot.'));
                    process.exit(1);
                }
            }
        });

        // Anti-call feature
        bot.ev.on('call', async (callData) => {
            try {
                const call = callData[0];
                const callerJid = call.from;
                
                console.log(chalk.yellow(`📞 Call received from: ${callerJid}`));
                
                // Reject call
                try {
                    await bot.rejectCall(call.id, callerJid);
                } catch (rejectError) {
                    // Ignore rejection errors
                }
                
                // Send message
                await bot.sendMessage(callerJid, {
                    text: '📵 *Auto Call Rejection*\n\nI\'m an AI text-based assistant and cannot receive calls. \n\nPlease send a text message instead! 💬\n\n_This is an automated response_'
                });
                
            } catch (error) {
                console.error('Call handling error:', error);
            }
        });

        // Group events
        bot.ev.on('group-participants.update', async (update) => {
            console.log(chalk.blue('👥 Group update:', update));
        });

        // Contacts update
        bot.ev.on('contacts.update', (contacts) => {
            console.log(chalk.blue('📱 Contacts updated:', contacts.length));
        });

        return bot;

    } catch (error) {
        console.error(chalk.red('❌ Bot startup error:'), error);
        console.log(chalk.blue('🔄 Restarting in 10 seconds...'));
        await delay(10000);
        startAIBot();
    }
}

function showBotInfo() {
    console.log(chalk.magenta('\n' + '═'.repeat(60)));
    console.log(chalk.yellow.bold('              MALITH\'S AI WHATSAPP BOT'));
    console.log(chalk.magenta('═'.repeat(60)));
    console.log(chalk.cyan('👨‍💻 Creator:') + chalk.white(' Malith Lakshan'));
    console.log(chalk.cyan('📞 Contact:') + chalk.white(' 94741907061'));
    console.log(chalk.cyan('🤖 AI Model:') + chalk.white(' Gemini 2.0 Flash'));
    console.log(chalk.cyan('🌐 Languages:') + chalk.white(' Sinhala, English, Singlish'));
    console.log(chalk.cyan('💾 Storage:') + chalk.white(' Firebase Realtime DB'));
    console.log(chalk.cyan('🔐 Login:') + chalk.white(' QR Code + Pairing Code'));
    console.log(chalk.green.bold('✅ Bot is ready to receive messages!'));
    console.log(chalk.magenta('═'.repeat(60) + '\n'));
}

// Error handling
process.on('uncaughtException', (error) => {
    console.error(chalk.red.bold('🛑 Uncaught Exception:'), error);
});

process.on('unhandledRejection', (error) => {
    console.error(chalk.red.bold('🛑 Unhandled Rejection:'), error);
});

// Cleanup on exit
process.on('SIGINT', () => {
    console.log(chalk.yellow('\n🛑 Shutting down bot...'));
    if (rl) rl.close();
    process.exit(0);
});

// Start the bot
console.log(chalk.blue.bold('🎯 Starting Malith\'s AI Bot...'));
console.log(chalk.cyan('💡 Use: npm run pair (for pairing code) or npm start (for QR code)'));
startAIBot().catch(console.error);
