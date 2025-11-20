// test-bot.js - Simple test version
const { makeWASocket, useMultiFileAuthState, DisconnectReason, delay } = require("@whiskeysockets/baileys");
const chalk = require('chalk');
const qrcode = require('qrcode-terminal');

async function testBot() {
    console.log(chalk.green('🧪 Testing WhatsApp connection...'));
    
    const { state, saveCreds } = await useMultiFileAuthState('./session');
    const bot = makeWASocket({
        printQRInTerminal: true,
        auth: state,
    });

    bot.ev.on('creds.update', saveCreds);

    bot.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log(chalk.yellow('📱 Scan this QR code:'));
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'open') {
            console.log(chalk.green('✅ Connected!'));
            console.log(chalk.blue('Bot is ready for messages.'));
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(chalk.yellow('Connection closed. Reconnect:', shouldReconnect));
            if (shouldReconnect) testBot();
        }
    });

    bot.ev.on('messages.upsert', ({ messages }) => {
        const msg = messages[0];
        if (!msg.key.fromMe && msg.message) {
            console.log(chalk.blue('📨 New message:'), msg.message.conversation || 'Media message');
            // Auto-reply
            bot.sendMessage(msg.key.remoteJid, { 
                text: '🤖 Hello! This is Malith\'s AI Bot. I\'m working!' 
            });
        }
    });
}

testBot().catch(console.error);
