const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { writeFile } = require('fs/promises');

const messageStore = new Map();
const TEMP_MEDIA_DIR = path.join(__dirname, 'tmp');
const OWNER_NUMBER = '94741907061@s.whatsapp.net';

// Ensure tmp dir exists
if (!fs.existsSync(TEMP_MEDIA_DIR)) {
    fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });
}

// AntiDelete configuration (in-memory only)
let antiDeleteConfig = {
    enabled: false
};

// Check if user is owner
function isOwner(userJid) {
    return userJid === OWNER_NUMBER;
}

// Command Handler
async function handleAntideleteCommand(sock, chatId, message, match) {
    const senderId = message.key.participant || message.key.remoteJid;
    
    if (!isOwner(senderId)) {
        return sock.sendMessage(chatId, { text: '*Only the owner can use this command.*' }, { quoted: message });
    }

    if (!match) {
        return sock.sendMessage(chatId, {
            text: `*ANTIDELETE SETUP*\n\nCurrent Status: ${antiDeleteConfig.enabled ? '✅ Enabled' : '❌ Disabled'}\n\n*.antidelete on* - Enable\n*.antidelete off* - Disable`
        }, {quoted: message});
    }

    if (match === 'on') {
        antiDeleteConfig.enabled = true;
        return sock.sendMessage(chatId, { text: '*✅ AntiDelete enabled*' }, {quoted:message});
    } else if (match === 'off') {
        antiDeleteConfig.enabled = false;
        return sock.sendMessage(chatId, { text: '*❌ AntiDelete disabled*' }, {quoted:message});
    } else {
        return sock.sendMessage(chatId, { text: '*Invalid command. Use .antidelete to see usage.*' }, {quoted:message});
    }
}

// Store incoming messages
async function storeMessage(sock, message) {
    try {
        if (!antiDeleteConfig.enabled) return; // Don't store if antidelete is disabled

        if (!message.key?.id) return;

        const messageId = message.key.id;
        let content = '';
        let mediaType = '';
        let mediaPath = '';

        const sender = message.key.participant || message.key.remoteJid;

        // Skip if message is from bot or owner
        if (message.key.fromMe || isOwner(sender)) return;

        // Detect content
        if (message.message?.conversation) {
            content = message.message.conversation;
        } else if (message.message?.extendedTextMessage?.text) {
            content = message.message.extendedTextMessage.text;
        } else if (message.message?.imageMessage) {
            mediaType = 'image';
            content = message.message.imageMessage.caption || '';
            try {
                const buffer = await downloadContentFromMessage(message.message.imageMessage, 'image');
                mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.jpg`);
                await writeFile(mediaPath, buffer);
            } catch (err) {
                console.error('Failed to download image:', err);
            }
        } else if (message.message?.videoMessage) {
            mediaType = 'video';
            content = message.message.videoMessage.caption || '';
            try {
                const buffer = await downloadContentFromMessage(message.message.videoMessage, 'video');
                mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.mp4`);
                await writeFile(mediaPath, buffer);
            } catch (err) {
                console.error('Failed to download video:', err);
            }
        } else if (message.message?.stickerMessage) {
            mediaType = 'sticker';
            try {
                const buffer = await downloadContentFromMessage(message.message.stickerMessage, 'sticker');
                mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.webp`);
                await writeFile(mediaPath, buffer);
            } catch (err) {
                console.error('Failed to download sticker:', err);
            }
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
        if (!antiDeleteConfig.enabled) return;

        const messageId = revocationMessage.message.protocolMessage.key.id;
        const deletedBy = revocationMessage.participant || revocationMessage.key.participant || revocationMessage.key.remoteJid;

        // Don't report if owner deletes
        if (isOwner(deletedBy)) return;

        const original = messageStore.get(messageId);
        if (!original) return;

        const sender = original.sender;
        const senderName = sender.split('@')[0];
        const deletedByName = deletedBy.split('@')[0];

        const time = new Date().toLocaleString('en-US', {
            timeZone: 'Asia/Kolkata',
            hour12: true, 
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit'
        });

        let text = `*🔰 ANTIDELETE REPORT 🔰*\n\n` +
            `*🗑️ Deleted By:* @${deletedByName}\n` +
            `*👤 Sender:* @${senderName}\n` +
            `*📱 Number:* ${sender}\n` +
            `*🕒 Time:* ${time}\n`;

        if (original.group) {
            try {
                const groupMetadata = await sock.groupMetadata(original.group);
                text += `*👥 Group:* ${groupMetadata.subject}\n`;
            } catch (err) {
                text += `*👥 Group:* ${original.group}\n`;
            }
        }

        if (original.content) {
            text += `\n*💬 Deleted Message:*\n${original.content}`;
        }

        // Send report to owner
        await sock.sendMessage(OWNER_NUMBER, {
            text,
            mentions: [deletedBy, sender]
        });

        // Send media if exists
        if (original.mediaType && fs.existsSync(original.mediaPath)) {
            const mediaOptions = {
                caption: `*Deleted ${original.mediaType}*\nFrom: @${senderName}`,
                mentions: [sender]
            };

            try {
                switch (original.mediaType) {
                    case 'image':
                        await sock.sendMessage(OWNER_NUMBER, {
                            image: { url: original.mediaPath },
                            ...mediaOptions
                        });
                        break;
                    case 'sticker':
                        await sock.sendMessage(OWNER_NUMBER, {
                            sticker: { url: original.mediaPath },
                            ...mediaOptions
                        });
                        break;
                    case 'video':
                        await sock.sendMessage(OWNER_NUMBER, {
                            video: { url: original.mediaPath },
                            ...mediaOptions
                        });
                        break;
                }
            } catch (err) {
                await sock.sendMessage(OWNER_NUMBER, {
                    text: `⚠️ Error sending media: ${err.message}`
                });
            }

            // Cleanup
            try {
                fs.unlinkSync(original.mediaPath);
            } catch (err) {
                console.error('Media cleanup error:', err);
            }
        }

        messageStore.delete(messageId);

    } catch (err) {
        console.error('handleMessageRevocation error:', err);
    }
}

// Clean temp folder periodically
function cleanTempFolder() {
    try {
        if (!fs.existsSync(TEMP_MEDIA_DIR)) return;
        
        const files = fs.readdirSync(TEMP_MEDIA_DIR);
        const now = Date.now();
        const MAX_AGE = 30 * 60 * 1000; // 30 minutes
        
        for (const file of files) {
            const filePath = path.join(TEMP_MEDIA_DIR, file);
            try {
                const stats = fs.statSync(filePath);
                if (now - stats.mtime.getTime() > MAX_AGE) {
                    fs.unlinkSync(filePath);
                    console.log(`Cleaned up old file: ${file}`);
                }
            } catch (err) {
                // Skip if file doesn't exist or other error
            }
        }
    } catch (err) {
        console.error('Temp cleanup error:', err);
    }
}

// Start periodic cleanup every 10 minutes
setInterval(cleanTempFolder, 10 * 60 * 1000);

module.exports = {
    handleAntideleteCommand,
    handleMessageRevocation,
    storeMessage
};
