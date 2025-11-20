/**
 * Malith's Gemini AI WhatsApp Bot
 * Powered by Google Gemini AI
 * Created by Malith Lakshan (94741907061)
 */
require('./settings')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const chalk = require('chalk')
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, delay } = require("@whiskeysockets/baileys")
const NodeCache = require("node-cache")
const pino = require("pino")

// Import AI and Firebase
const GeminiAI = require('./lib/gemini')
const FirebaseManager = require('./lib/firebase')

// Initialize AI and Database
const aiBot = new GeminiAI()
const firebaseManager = new FirebaseManager()

const pairingCode = process.argv.includes("--pairing-code")
const useMobile = process.argv.includes("--mobile")

// Store for user sessions
const userSessions = new Map()

async function startAIBot() {
    try {
        console.log(chalk.green('🚀 Starting Malith\'s AI WhatsApp Bot...'))
        
        const { version } = await fetchLatestBaileysVersion()
        const { state, saveCreds } = await useMultiFileAuthState('./session')

        const bot = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: !pairingCode,
            browser: ["Malith AI Bot", "Chrome", "20.0.04"],
            auth: {
                creds: state.creds,
                keys: state.keys,
            },
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
        })

        // Save credentials when updated
        bot.ev.on('creds.update', saveCreds)

        // Handle incoming messages
        bot.ev.on('messages.upsert', async ({ messages }) => {
            try {
                const message = messages[0]
                if (!message.message || message.key.remoteJid === 'status@broadcast') return

                // Get message content
                const messageType = Object.keys(message.message)[0]
                let text = ''
                
                if (messageType === 'conversation') {
                    text = message.message.conversation
                } else if (messageType === 'extendedTextMessage') {
                    text = message.message.extendedTextMessage.text
                }

                if (!text) return

                const userJid = message.key.remoteJid
                const userName = message.pushName || 'Friend'
                const isGroup = userJid.endsWith('@g.us')

                // Ignore messages from groups unless mentioned
                if (isGroup) {
                    const botJid = bot.user.id.split(':')[0] + '@s.whatsapp.net'
                    if (!text.includes(`@${botJid.split('@')[0]}`)) return
                    text = text.replace(`@${botJid.split('@')[0]}`, '').trim()
                }

                console.log(chalk.blue(`📩 Message from ${userName}: ${text}`))

                // Typing indicator
                await bot.sendPresenceUpdate('composing', userJid)

                // Get or create user session
                let userSession = userSessions.get(userJid)
                if (!userSession) {
                    userSession = await firebaseManager.getSession(userJid) || {
                        userId: userJid,
                        userName: userName,
                        conversationCount: 0,
                        createdAt: new Date().toISOString()
                    }
                    userSessions.set(userJid, userSession)
                }

                // Generate AI response
                const aiResponse = await aiBot.generateResponse(text, userName)
                
                // Update conversation in Firebase
                await firebaseManager.updateConversation(userJid, text, aiResponse)
                
                // Update session data
                userSession.conversationCount++
                userSession.lastActive = new Date().toISOString()
                await firebaseManager.saveSession(userJid, userSession)

                // Send response
                await bot.sendMessage(userJid, { text: aiResponse })
                console.log(chalk.green(`🤖 AI Response: ${aiResponse}`))

            } catch (error) {
                console.error(chalk.red('Message processing error:'), error)
                try {
                    const userJid = messages[0]?.key.remoteJid
                    if (userJid) {
                        await bot.sendMessage(userJid, { 
                            text: '😅 Sorry, I encountered an error. Please try again!' 
                        })
                    }
                } catch (sendError) {
                    console.error('Error sending error message:', sendError)
                }
            }
        })

        // Connection handling
        bot.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update

            if (qr && !pairingCode) {
                console.log(chalk.yellow('📱 Scan the QR code with WhatsApp to connect...'))
            }

            if (connection === 'connecting') {
                console.log(chalk.blue('🔄 Connecting to WhatsApp...'))
            }

            if (connection === 'open') {
                console.log(chalk.green('✅ Successfully connected to WhatsApp!'))
                console.log(chalk.cyan(`🤖 Bot User: ${bot.user.name || bot.user.id}`))
                
                // Send startup message to owner
                try {
                    const ownerJid = global.owner
                    await bot.sendMessage(ownerJid, {
                        text: `🤖 *Malith\'s AI Bot Started Successfully!*\n\n✅ *Status:* Online and Ready!\n⏰ *Time:* ${new Date().toLocaleString()}\n🚀 *Powered by:* Gemini AI 2.0 Flash\n\nI\'m now ready to assist your friends! ${getRandomEmoji()}`
                    })
                } catch (error) {
                    console.log('Could not send startup message to owner')
                }

                // Display bot info
                console.log(chalk.magenta('\n' + '='.repeat(50)))
                console.log(chalk.yellow.bold('          MALITH\'S AI WHATSAPP BOT'))
                console.log(chalk.magenta('='.repeat(50)))
                console.log(chalk.cyan('👨‍💻 Creator: Malith Lakshan'))
                console.log(chalk.cyan('📞 Contact: 94741907061'))
                console.log(chalk.cyan('🤖 AI Model: Gemini 2.0 Flash'))
                console.log(chalk.cyan('🌐 Languages: Sinhala, English, Singlish'))
                console.log(chalk.green('✅ Bot is ready to receive messages!'))
                console.log(chalk.magenta('='.repeat(50) + '\n'))
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut

                console.log(chalk.yellow(`🔌 Connection closed. Reconnecting: ${shouldReconnect}`))

                if (statusCode === DisconnectReason.loggedOut) {
                    console.log(chalk.red('❌ Session logged out. Please re-scan QR code.'))
                    try {
                        require('fs').rmSync('./session', { recursive: true, force: true })
                        console.log(chalk.yellow('🗑️ Session folder cleared.'))
                    } catch (error) {
                        console.error('Error clearing session:', error)
                    }
                }

                if (shouldReconnect) {
                    console.log(chalk.blue('🔄 Reconnecting in 5 seconds...'))
                    await delay(5000)
                    startAIBot()
                }
            }
        })

        // Handle group participants update (for future features)
        bot.ev.on('group-participants.update', async (update) => {
            console.log(chalk.blue('👥 Group update:', update))
        })

        // Anti-call feature
        bot.ev.on('call', async (call) => {
            try {
                const callerJid = call[0]?.from
                if (callerJid) {
                    await bot.sendMessage(callerJid, {
                        text: '📵 I\'m an AI text-based assistant and cannot receive calls. Please send a text message instead! 😊'
                    })
                }
            } catch (error) {
                console.log('Call rejection error:', error)
            }
        })

        return bot

    } catch (error) {
        console.error(chalk.red('❌ Bot startup error:'), error)
        console.log(chalk.blue('🔄 Restarting in 10 seconds...'))
        await delay(10000)
        startAIBot()
    }
}

// Helper function for random emojis
function getRandomEmoji() {
    const emojis = ['🚀', '🌟', '🔥', '💫', '🎯', '🤖', '✨', '💻']
    return emojis[Math.floor(Math.random() * emojis.length)]
}

// Error handling
process.on('uncaughtException', (error) => {
    console.error(chalk.red('🛑 Uncaught Exception:'), error)
})

process.on('unhandledRejection', (error) => {
    console.error(chalk.red('🛑 Unhandled Rejection:'), error)
})

// Start the bot
startAIBot().catch(console.error)

// Auto-restart on file changes (development)
if (process.env.NODE_ENV !== 'production') {
    const watcher = require('chokidar').watch(__filename)
    watcher.on('change', () => {
        console.log(chalk.yellow('🔄 File changed. Restarting...'))
        process.exit(0)
    })
}
