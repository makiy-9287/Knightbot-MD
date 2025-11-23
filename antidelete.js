const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const messageStore = new Map();
const TEMP_MEDIA_DIR = path.join(__dirname, 'tmp');
const OWNER_NUMBER = '94741907061@s.whatsapp.net';

// Ensure tmp dir exists
if (!fs.existsSync(TEMP_MEDIA_DIR)) {
    fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });
}

// Store ALL incoming messages
async function storeMessage(sock, message) {
    try {
        if (!message.key?.id) return;

        const messageId = message.key.id;
        let content = '';
        let mediaType = '';
        let mediaPath = '';

        const sender = message.key.participant || message.key.remoteJid;

        // Skip if message is from bot itself
        if (message.key.fromMe) return;

        console.log(`📝 Storing message from ${sender}`);

        // Get message content
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
                await fs.promises.writeFile(mediaPath, buffer);
            } catch (err) {
                console.error('Failed to download image:', err);
            }
        } else if (message.message?.videoMessage) {
            mediaType = 'video';
            content = message.message.videoMessage.caption || '';
            try {
                const buffer = await downloadContentFromMessage(message.message.videoMessage, 'video');
                mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.mp4`);
                await fs.promises.writeFile(mediaPath, buffer);
            } catch (err) {
                console.error('Failed to download video:', err);
            }
        } else if (message.message?.stickerMessage) {
            mediaType = 'sticker';
            try {
                const buffer = await downloadContentFromMessage(message.message.stickerMessage, 'sticker');
                mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.webp`);
                await fs.promises.writeFile(mediaPath, buffer);
            } catch (err) {
                console.error('Failed to download sticker:', err);
            }
        } else if (message.message?.audioMessage) {
            mediaType = 'audio';
            try {
                const buffer = await downloadContentFromMessage(message.message.audioMessage, 'audio');
                mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.mp3`);
                await fs.promises.writeFile(mediaPath, buffer);
            } catch (err) {
                console.error('Failed to download audio:', err);
            }
        }

        // Store message info
        messageStore.set(messageId, {
            content,
            mediaType,
            mediaPath,
            sender,
            group: message.key.remoteJid.endsWith('@g.us') ? message.key.remoteJid : null,
            timestamp: new Date().toISOString()
        });

        console.log(`✅ Message stored: ${messageId}`);

    } catch (err) {
        console.error('storeMessage error:', err);
    }
}

// Handle message deletion - FIXED VERSION
async function handleMessageRevocation(sock, update) {
    try {
        console.log('🔍 Checking for deleted message...');

        // Check if this is a message deletion
        if (update.update && update.update.messageStubType === 0) {
            
            const messageId = update.key.id;
            const deletedBy = update.participant || update.key.participant || update.key.remoteJid;

            console.log(`🗑️ Message deleted: ${messageId} by ${deletedBy}`);

            // Get original message from storage
            const original = messageStore.get(messageId);
            if (!original) {
                console.log('❌ Original message not found');
                return;
            }

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

            // Create report message
            let report = `🚨 *Message Delete Detected* 🚨\n\n` +
                `👤 *From:* @${senderName}\n` +
                `🗑️ *Deleted By:* @${deletedByName}\n` +
                `⏰ *Time:* ${time}\n`;

            // Add group info if available
            if (original.group) {
                try {
                    const groupMetadata = await sock.groupMetadata(original.group);
                    report += `👥 *Group:* ${groupMetadata.subject}\n`;
                } catch (err) {
                    report += `👥 *Group ID:* ${original.group}\n`;
                }
            }

            // Add message content or media info
            if (original.content) {
                report += `\n💬 *Deleted Message:*\n${original.content}`;
            } else if (original.mediaType) {
                report += `\n📎 *Media Type:* ${original.mediaType}`;
            }

            console.log(`📤 Sending delete report to owner...`);

            // Send report to owner
            await sock.sendMessage(OWNER_NUMBER, {
                text: report,
                mentions: [sender, deletedBy]
            });

            console.log('✅ Delete report sent to owner');

            // Send media if exists
            if (original.mediaType && original.mediaPath && fs.existsSync(original.mediaPath)) {
                const mediaCaption = `🗑️ Deleted ${original.mediaType}\n👤 From: @${senderName}\n⏰ ${time}`;

                try {
                    console.log(`📎 Sending deleted media: ${original.mediaType}`);
                    
                    switch (original.mediaType) {
                        case 'image':
                            await sock.sendMessage(OWNER_NUMBER, {
                                image: { url: original.mediaPath },
                                caption: mediaCaption,
                                mentions: [sender]
                            });
                            break;
                        case 'video':
                            await sock.sendMessage(OWNER_NUMBER, {
                                video: { url: original.mediaPath },
                                caption: mediaCaption,
                                mentions: [sender]
                            });
                            break;
                        case 'sticker':
                            await sock.sendMessage(OWNER_NUMBER, {
                                sticker: { url: original.mediaPath }
                            });
                            break;
                        case 'audio':
                            await sock.sendMessage(OWNER_NUMBER, {
                                audio: { url: original.mediaPath },
                                mimetype: 'audio/mpeg',
                                ptt: false
                            });
                            break;
                    }
                    console.log('✅ Deleted media sent to owner');
                } catch (err) {
                    console.error('❌ Error sending media:', err);
                }

                // Cleanup media file
                try {
                    fs.unlinkSync(original.mediaPath);
                    console.log('✅ Media file cleaned up');
                } catch (err) {
                    console.error('Media cleanup error:', err);
                }
            }

            // Remove from storage
            messageStore.delete(messageId);
            console.log(`✅ Message removed from storage`);

        }

    } catch (err) {
        console.error('❌ handleMessageRevocation error:', err);
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
                }
            } catch (err) {
                // Skip if file doesn't exist
            }
        }
    } catch (err) {
        console.error('Temp cleanup error:', err);
    }
}

// Start periodic cleanup every 10 minutes
setInterval(cleanTempFolder, 10 * 60 * 1000);

module.exports = {
    storeMessage,
    handleMessageRevocation
};
