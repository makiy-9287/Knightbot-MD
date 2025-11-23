const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const messageStore = new Map();
const TEMP_DIR = path.join(__dirname, '../tmp');

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Clean temp folder periodically
setInterval(() => {
    try {
        const files = fs.readdirSync(TEMP_DIR);
        const now = Date.now();
        
        for (const file of files) {
            const filePath = path.join(TEMP_DIR, file);
            const stats = fs.statSync(filePath);
            const age = now - stats.mtimeMs;
            
            // Delete files older than 1 hour
            if (age > 3600000) {
                fs.unlinkSync(filePath);
            }
        }
    } catch (err) {
        console.error('Temp cleanup error:', err);
    }
}, 300000); // Every 5 minutes

// Download and save media
async function downloadMedia(message, messageId) {
    try {
        let mediaType = null;
        let mediaPath = null;
        let caption = '';
        let mediaMessage = null;

        // Check for view-once messages
        const viewOnce = message.message?.viewOnceMessageV2?.message || 
                        message.message?.viewOnceMessage?.message;

        if (viewOnce) {
            if (viewOnce.imageMessage) {
                mediaMessage = viewOnce.imageMessage;
                mediaType = 'image';
                caption = viewOnce.imageMessage.caption || '';
            } else if (viewOnce.videoMessage) {
                mediaMessage = viewOnce.videoMessage;
                mediaType = 'video';
                caption = viewOnce.videoMessage.caption || '';
            }
        } else if (message.message?.imageMessage) {
            mediaMessage = message.message.imageMessage;
            mediaType = 'image';
            caption = message.message.imageMessage.caption || '';
        } else if (message.message?.videoMessage) {
            mediaMessage = message.message.videoMessage;
            mediaType = 'video';
            caption = message.message.videoMessage.caption || '';
        } else if (message.message?.audioMessage) {
            mediaMessage = message.message.audioMessage;
            mediaType = 'audio';
        } else if (message.message?.stickerMessage) {
            mediaMessage = message.message.stickerMessage;
            mediaType = 'sticker';
        } else if (message.message?.documentMessage) {
            mediaMessage = message.message.documentMessage;
            mediaType = 'document';
            caption = message.message.documentMessage.caption || '';
        }

        if (mediaMessage && mediaType) {
            const stream = await downloadContentFromMessage(mediaMessage, mediaType);
            const chunks = [];
            
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            
            const buffer = Buffer.concat(chunks);
            const ext = mediaType === 'image' ? 'jpg' : 
                       mediaType === 'video' ? 'mp4' : 
                       mediaType === 'audio' ? 'mp3' : 
                       mediaType === 'sticker' ? 'webp' : 
                       mediaType === 'document' ? 'pdf' : 'bin';
            
            mediaPath = path.join(TEMP_DIR, `${messageId}.${ext}`);
            fs.writeFileSync(mediaPath, buffer);
            
            return { mediaType, mediaPath, caption };
        }

        return { mediaType: null, mediaPath: null, caption: '' };
    } catch (err) {
        console.error('Download media error:', err);
        return { mediaType: null, mediaPath: null, caption: '' };
    }
}

// Store incoming messages
async function storeMessage(sock, message, sudoNumber) {
    try {
        if (!message.key?.id) return;

        const messageId = message.key.id;
        const sender = message.key.participant || message.key.remoteJid;
        const chatId = message.key.remoteJid;
        
        // Skip bot's own messages
        if (message.key.fromMe) return;

        let content = '';
        let mediaInfo = { mediaType: null, mediaPath: null, caption: '' };

        // Extract text content
        if (message.message?.conversation) {
            content = message.message.conversation;
        } else if (message.message?.extendedTextMessage?.text) {
            content = message.message.extendedTextMessage.text;
        }

        // Download media if present
        mediaInfo = await downloadMedia(message, messageId);
        
        if (mediaInfo.caption) {
            content = mediaInfo.caption;
        }

        // Store message data
        messageStore.set(messageId, {
            sender,
            chatId,
            content,
            mediaType: mediaInfo.mediaType,
            mediaPath: mediaInfo.mediaPath,
            timestamp: Date.now(),
            isGroup: chatId.endsWith('@g.us')
        });

        // Auto-clean old messages from memory (keep last 1000 only)
        if (messageStore.size > 1000) {
            const oldestKey = messageStore.keys().next().value;
            const oldest = messageStore.get(oldestKey);
            if (oldest?.mediaPath && fs.existsSync(oldest.mediaPath)) {
                try { fs.unlinkSync(oldest.mediaPath); } catch {}
            }
            messageStore.delete(oldestKey);
        }

    } catch (err) {
        console.error('Store message error:', err);
    }
}

// Handle message deletion
async function handleMessageRevocation(sock, update, store, sudoNumber) {
    try {
        const deletedMessageId = update.key?.id || update.message?.protocolMessage?.key?.id;
        
        if (!deletedMessageId) return;

        const stored = store.get(deletedMessageId);
        
        if (!stored) {
            console.log('⚠️  Deleted message not found in store');
            return;
        }

        const deleter = update.key?.participant || update.key?.remoteJid;
        const sender = stored.sender;
        const senderNumber = sender.split('@')[0];
        const deleterNumber = deleter.split('@')[0];
        
        // Get time
        const time = new Date().toLocaleString('en-US', {
            timeZone: 'Asia/Colombo',
            hour12: true,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });

        // Build report
        let report = `╔═══════════════════════╗\n`;
        report += `║  🗑️ *MESSAGE DELETED* 🗑️  ║\n`;
        report += `╚═══════════════════════╝\n\n`;
        report += `⏰ *Time:* ${time}\n`;
        report += `🚫 *Deleted by:* @${deleterNumber}\n`;
        report += `👤 *Sender:* @${senderNumber}\n`;
        report += `📱 *Number:* ${sender}\n`;

        if (stored.isGroup) {
            try {
                const groupMeta = await sock.groupMetadata(stored.chatId);
                report += `👥 *Group:* ${groupMeta.subject}\n`;
            } catch {}
        }

        if (stored.content) {
            report += `\n💬 *Deleted Message:*\n${stored.content}\n`;
        }

        // Send report
        await sock.sendMessage(sudoNumber, {
            text: report,
            mentions: [deleter, sender]
        });

        console.log(`🗑️  Message deleted by ${deleterNumber} - Notified sudo`);

        // Send media if exists
        if (stored.mediaType && stored.mediaPath && fs.existsSync(stored.mediaPath)) {
            const mediaOptions = {
                caption: `📎 *Deleted ${stored.mediaType.toUpperCase()}*\n👤 From: @${senderNumber}`,
                mentions: [sender]
            };

            try {
                switch (stored.mediaType) {
                    case 'image':
                        await sock.sendMessage(sudoNumber, {
                            image: fs.readFileSync(stored.mediaPath),
                            ...mediaOptions
                        });
                        break;
                    case 'video':
                        await sock.sendMessage(sudoNumber, {
                            video: fs.readFileSync(stored.mediaPath),
                            ...mediaOptions
                        });
                        break;
                    case 'audio':
                        await sock.sendMessage(sudoNumber, {
                            audio: fs.readFileSync(stored.mediaPath),
                            mimetype: 'audio/mpeg',
                            ptt: false,
                            ...mediaOptions
                        });
                        break;
                    case 'sticker':
                        await sock.sendMessage(sudoNumber, {
                            sticker: fs.readFileSync(stored.mediaPath)
                        });
                        break;
                    case 'document':
                        await sock.sendMessage(sudoNumber, {
                            document: fs.readFileSync(stored.mediaPath),
                            mimetype: 'application/pdf',
                            fileName: 'deleted_document.pdf',
                            ...mediaOptions
                        });
                        break;
                }

                console.log(`📎 Sent deleted ${stored.mediaType} to sudo`);
            } catch (err) {
                console.error('Error sending media:', err);
                await sock.sendMessage(sudoNumber, {
                    text: `⚠️ Error sending deleted media: ${err.message}`
                });
            }

            // Cleanup media file
            try {
                fs.unlinkSync(stored.mediaPath);
            } catch (err) {
                console.error('Cleanup error:', err);
            }
        }

        // Remove from store
        store.delete(deletedMessageId);

    } catch (err) {
        console.error('Handle revocation error:', err);
    }
}

module.exports = {
    storeMessage,
    handleMessageRevocation,
    messageStore
};
