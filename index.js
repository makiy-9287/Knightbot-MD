/**
 * Malith's Official WhatsApp Bot
 * Command-only AI with Anti-Delete & Image Generation
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
    delay
} = require("@whiskeysockets/baileys");
const NodeCache = require("node-cache");
const pino = require("pino");

// Import your separate modules
const aiCommand = require('./ai');
const { handleAntideleteCommand, storeMessage, handleMessageRevocation } = require('./antidelete');
const imagineCommand = require('./imagine');

console.log(chalk.green('🚀 Malith Official Bot Starting...'));

// Anti-delete always enabled
const antideleteEnabled = true;

async function startOfficialBot() {
    try {
        console.log(chalk.green.bold('🤖 Starting Official Bot...'));
        
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
                console.log(chalk.cyan('🟢 Status: Always Online'));
                
                showBotInfo();
            }

            if (connection === 'close') {
                console.log(chalk.red('🔌 Connection closed, reconnecting...'));
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) {
                    console.log(chalk.blue('🔄 Reconnecting in 3 seconds...'));
                    await delay(3000);
                    startOfficialBot();
                }
            }
        });

        // MESSAGE HANDLER - Command Only
        bot.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;

            const message = messages[0];
            if (!message.message || !message.key || message.key.fromMe) return;

            const userJid = message.key.remoteJid;
            const userName = message.pushName || 'User';
            const messageText = getMessageText(message);

            // Store message for anti-delete (always enabled)
            if (antideleteEnabled) {
                await storeMessage(bot, message);
            }

            // Show only sender name
            console.log(chalk.blue(`📩 Message from: ${userName}`));

            // Mark as read immediately
            try {
                await bot.readMessages([message.key]);
            } catch (error) {}

            // Process commands only
            if (messageText.startsWith('.')) {
                await handleCommand(bot, userJid, message, messageText, userName);
            }
            // No response for regular messages - only commands
        });

        // Handle message deletions for anti-delete
        bot.ev.on('messages.update', async (updates) => {
            if (!antideleteEnabled) return;
            
            for (const update of updates) {
                if (update.update && update.update.messageStubType === 0) {
                    await handleMessageRevocation(bot, update);
                }
            }
        });

        // Keep alive
        setInterval(async () => {
            try {
                await bot.sendPresenceUpdate('available');
            } catch (error) {}
        }, 60000);

        console.log(chalk.green('✅ Official Bot Ready!'));
        return bot;

    } catch (error) {
        console.error(chalk.red('Startup error:'), error);
        await delay(5000);
        startOfficialBot();
    }
}

// Handle commands only
async function handleCommand(bot, userJid, message, text, userName) {
    const command = text.split(' ')[0].toLowerCase();
    const args = text.slice(command.length).trim();

    switch (command) {
        case '.gpt':
        case '.gemini':
            await aiCommand(bot, userJid, message);
            break;
            
        case '.imagine':
            await imagineCommand(bot, userJid, message);
            break;
            
        case '.antidelete':
            await handleAntideleteCommand(bot, userJid, message, args);
            break;
            
        case '.help':
            await showHelp(bot, userJid, message);
            break;
            
        default:
            // No response for unknown commands
            break;
    }
}

// Help Command
async function showHelp(bot, userJid, message) {
    const helpText = `*🤖 MALITH OFFICIAL BOT - COMMANDS*

*AI Commands:*
.gpt <question> - Get answer from GPT
.gemini <question> - Get answer from Gemini
.imagine <prompt> - Generate AI images

*Utility Commands:*
.antidelete - Anti-delete system status
.help - Show this help menu

*Note:* Bot only responds to commands starting with dot (.)`;

    await bot.sendMessage(userJid, { text: helpText }, { quoted: message });
}

// Utility function
function getMessageText(message) {
    if (message.message?.conversation) return message.message.conversation;
    if (message.message?.extendedTextMessage?.text) return message.message.extendedTextMessage.text;
    return '';
}

function showBotInfo() {
    console.log(chalk.magenta('\n' + '═'.repeat(50)));
    console.log(chalk.yellow.bold('     MALITH OFFICIAL BOT'));
    console.log(chalk.magenta('═'.repeat(50)));
    console.log(chalk.cyan('🤖 AI: Command-only (.gpt, .gemini, .imagine)'));
    console.log(chalk.cyan('🛡️ Anti-delete: Always Enabled'));
    console.log(chalk.cyan('💬 Responses: Only to commands with dot'));
    console.log(chalk.cyan('🚫 No typing indicators'));
    console.log(chalk.cyan('🟢 Status: Always Online'));
    console.log(chalk.green('✅ Ready for official use!'));
    console.log(chalk.magenta('═'.repeat(50) + '\n'));
}

// Handle process events
process.on('uncaughtException', (error) => {
    console.error(chalk.red('Uncaught exception:'), error);
});

process.on('unhandledRejection', (error) => {
    console.error(chalk.red('Unhandled rejection:'), error);
});

// Start bot
startOfficialBot().catch(error => {
    console.error(chalk.red('Fatal error:'), error);
    setTimeout(startOfficialBot, 10000);
});
