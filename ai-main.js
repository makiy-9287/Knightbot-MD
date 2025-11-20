/**
 * AI Message Handler
 * Main logic for processing WhatsApp messages with Gemini AI
 */

require('dotenv').config();
const { generateAIResponse, isSpecialCommand } = require('./gemini-handler');
const { saveConversation, clearConversationHistory, getConversationHistory } = require('./firebase-config');
const { smsg } = require('./lib/myfunc');

// Track typing states to prevent multiple typing indicators
const typingUsers = new Set();

/**
 * Main message handler with AI integration
 */
async function handleMessages(sock, chatUpdate) {
    try {
        const m = chatUpdate.messages[0];
        if (!m.message) return;
        
        // Serialize message
        const msg = await smsg(sock, m);
        if (!msg) return;
        
        // Ignore broadcast and own messages
        if (msg.key.remoteJid === 'status@broadcast') return;
        if (msg.key.fromMe) return;
        
        // Get message text
        const text = (msg.text || '').trim();
        if (!text) return;
        
        // Get sender info
        const sender = msg.key.remoteJid;
        const isGroup = sender.endsWith('@g.us');
        const userId = isGroup ? msg.key.participant : sender;
        const userName = msg.pushName || 'User';
        
        // Clean user ID for Firebase (remove special chars)
        const cleanUserId = userId.replace(/[^a-zA-Z0-9]/g, '_');
        
        console.log(`📩 Message from ${userName}: ${text.substring(0, 50)}...`);
        
        // Send typing indicator
        if (!typingUsers.has(sender)) {
            typingUsers.add(sender);
            await sock.sendPresenceUpdate('composing', sender);
        }
        
        try {
            // Check for special commands
            const command = isSpecialCommand(text);
            
            if (command === 'clear') {
                await clearConversationHistory(cleanUserId);
                await sock.sendMessage(sender, {
                    text: '🗑️ Conversation cleared! Let\'s start fresh! ✨\n\nපැරණි සංවාද මකා දැමුවා! අලුතෙන් පටන් ගමු! ✨',
                    contextInfo: getContextInfo()
                }, { quoted: msg });
                return;
            }
            
            if (command === 'help') {
                const helpText = `🤖 *AI Assistant Help* 🤖

*Commands:*
• Just chat naturally - I'll respond!
• "clear" - Clear conversation history
• "help" - Show this message

*Languages I speak:*
🇱🇰 Sinhala (සිංහල)
🇬🇧 English
🌏 Singlish (Mix)

*About Me:*
I'm an AI assistant created by Malith Lakshan to help and chat with you! I understand emotions and respond with appropriate emojis 😊

*Creator Contact:*
📱 +${process.env.OWNER_NUMBER}

Just send me any message and I'll respond naturally! 💬✨`;
                
                await sock.sendMessage(sender, {
                    text: helpText,
                    contextInfo: getContextInfo()
                }, { quoted: msg });
                return;
            }
            
            // Generate AI response
            const aiResult = await generateAIResponse(text, cleanUserId, userName);
            
            if (aiResult.success) {
                // Save conversation to Firebase
                await saveConversation(cleanUserId, text, aiResult.response);
                
                // Send AI response
                await sock.sendMessage(sender, {
                    text: aiResult.response,
                    contextInfo: getContextInfo()
                }, { quoted: msg });
                
                console.log(`✅ AI responded (${aiResult.language}, ${aiResult.emotion})`);
            } else {
                // Send error message
                await sock.sendMessage(sender, {
                    text: aiResult.response,
                    contextInfo: getContextInfo()
                }, { quoted: msg });
            }
            
        } catch (error) {
            console.error('❌ Error processing message:', error);
            
            // Send error message to user
            await sock.sendMessage(sender, {
                text: '❌ Oops! Something went wrong. Please try again! 😊\n\nඅපොයි! මොකක්හරි වැරැද්දක්. කරුණාකර නැවත උත්සාහ කරන්න! 😊',
                contextInfo: getContextInfo()
            }, { quoted: msg });
        } finally {
            // Remove typing indicator
            typingUsers.delete(sender);
            await sock.sendPresenceUpdate('paused', sender);
        }
        
    } catch (error) {
        console.error('❌ Error in handleMessages:', error);
    }
}

/**
 * Get context info for message branding
 */
function getContextInfo() {
    return {
        forwardingScore: 1,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: '120363161513685998@newsletter',
            newsletterName: 'Laky AI Assistant',
            serverMessageId: -1
        }
    };
}

/**
 * Handle group participant updates (join/leave)
 */
async function handleGroupParticipantUpdate(sock, update) {
    try {
        const { id, participants, action } = update;
        
        for (const participant of participants) {
            if (action === 'add') {
                await sock.sendMessage(id, {
                    text: `👋 Welcome to the group! I'm an AI assistant here to help! Feel free to chat with me anytime! 😊\n\nගෘපයට සාදරයෙන් පිළිගනිමු! මම AI සහායකයෙක්. ඕනම වෙලාවක මාත් එක්ක කතා කරන්න! 😊`,
                    mentions: [participant],
                    contextInfo: getContextInfo()
                });
            }
        }
    } catch (error) {
        console.error('Error in group update:', error);
    }
}

/**
 * Handle status views
 */
async function handleStatus(sock, statusUpdate) {
    // You can implement status viewing logic here if needed
    // For now, we'll keep it minimal
    return;
}

module.exports = {
    handleMessages,
    handleGroupParticipantUpdate,
    handleStatus
};
