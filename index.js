const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const { storeMessage, handleMessageRevocation } = require('./lib/antidelete');

// Configuration
const SUDO_NUMBER = '94741907061@s.whatsapp.net';
const AUTH_DIR = './auth_info';
const messageStore = new Map();

// Ensure directories exist
if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
}
if (!fs.existsSync('./lib')) {
    fs.mkdirSync('./lib', { recursive: true });
}
if (!fs.existsSync('./tmp')) {
    fs.mkdirSync('./tmp', { recursive: true });
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state,
        browser: ['Antidelete Bot', 'Chrome', '1.0.0'],
        markOnlineOnConnect: true,
    });

    // QR Code generation
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('\n📱 Scan this QR code to connect:\n');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('❌ Connection closed. Reconnecting:', shouldReconnect);
            
            if (shouldReconnect) {
                setTimeout(() => connectToWhatsApp(), 3000);
            }
        } else if (connection === 'open') {
            console.log('✅ Connected to WhatsApp!');
            console.log('🤖 Antidelete Bot is now active');
            console.log('📞 Sudo Number:', SUDO_NUMBER.replace('@s.whatsapp.net', ''));
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Message handler - Store all messages
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        try {
            if (type !== 'notify') return;

            for (const message of messages) {
                if (!message.key || !message.key.id) continue;

                // Store message for antidelete
                await storeMessage(sock, message, SUDO_NUMBER);

                // Log received message
                const from = message.key.remoteJid;
                const sender = message.key.participant || from;
                const isGroup = from.endsWith('@g.us');
                
                console.log(`📩 Message received from ${sender.split('@')[0]}${isGroup ? ' in group' : ''}`);
            }
        } catch (err) {
            console.error('Error in messages.upsert:', err);
        }
    });

    // Message deletion handler
    sock.ev.on('messages.update', async (updates) => {
        try {
            for (const update of updates) {
                if (update.update.messageStubType === 1 || update.key.fromMe === false) {
                    // Check if message was deleted
                    const messageId = update.key.id;
                    const stored = messageStore.get(messageId);
                    
                    if (stored && update.update.message?.protocolMessage?.type === 0) {
                        await handleMessageRevocation(sock, update, stored, SUDO_NUMBER);
                        messageStore.delete(messageId);
                    }
                }
            }
        } catch (err) {
            console.error('Error in messages.update:', err);
        }
    });

    // Protocol message handler (for revoked messages)
    sock.ev.on('messages.upsert', async ({ messages }) => {
        try {
            for (const msg of messages) {
                if (msg.message?.protocolMessage?.type === 0) {
                    // This is a delete/revoke message
                    await handleMessageRevocation(sock, msg, messageStore, SUDO_NUMBER);
                }
            }
        } catch (err) {
            console.error('Error handling protocol message:', err);
        }
    });

    return sock;
}

// Start the bot
console.log('🚀 Starting Antidelete Bot...\n');
connectToWhatsApp().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});

// Export for use in other modules
module.exports = { messageStore };
