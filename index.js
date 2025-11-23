/**
 * Malith's AntiDelete Bot
 * Simple bot that detects deleted messages
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

// Import AntiDelete functions
const { storeMessage, handleMessageRevocation } = require('./antidelete');

console.log(chalk.green('🚀 AntiDelete Bot Starting...'));

async function startBot() {
    try {
        console.log(chalk.green.bold('🤖 Starting AntiDelete Bot...'));
        
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
                console.log(chalk.cyan('🔰 AntiDelete: ACTIVE'));
                
                try {
                    await sock.sendMessage('94741907061@s.whatsapp.net', {
                        text: '🚨 *AntiDelete Bot Active!*\n\nI will notify you when someone deletes messages!'
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

        // Store ALL messages for AntiDelete
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;

            const message = messages[0];
            if (!message.message || !message.key) return;

            // Store message for AntiDelete
            await storeMessage(sock, message);
        });

        // Detect message deletions
        sock.ev.on('messages.update', async (updates) => {
            for (const update of updates) {
                await handleMessageRevocation(sock, update);
            }
        });

        // Keep alive
        setInterval(async () => {
            try { await sock.sendPresenceUpdate('available'); } catch (error) {}
        }, 60000);

        console.log(chalk.green('✅ AntiDelete Bot Ready!'));
        return sock;

    } catch (error) {
        console.error(chalk.red('Startup error:'), error);
        await delay(5000);
        startBot();
    }
}

function showBotInfo() {
    console.log(chalk.magenta('\n' + '═'.repeat(40)));
    console.log(chalk.yellow.bold('     ANTIDELETE BOT'));
    console.log(chalk.magenta('═'.repeat(40)));
    console.log(chalk.cyan('🔰 Monitoring: ALL messages'));
    console.log(chalk.cyan('👑 Owner: 94741907061'));
    console.log(chalk.cyan('📱 Reports: Deleted messages'));
    console.log(chalk.green('✅ Ready to detect deletions!'));
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
