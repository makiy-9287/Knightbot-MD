/**
 * Laky AI Bot - Gemini Powered WhatsApp Bot
 * Copyright (c) 2024 Malith Lakshan
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 * 
 * Credits:
 * - Baileys Library by @adiwajshing
 * - Google Gemini AI
 * - Firebase Realtime Database
 */

require('dotenv').config();
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const chalk = require('chalk')
const path = require('path')
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    jidDecode,
    delay
} = require("@whiskeysockets/baileys")
const NodeCache = require("node-cache")
const pino = require("pino")
const readline = require("readline")

// Import AI handler
const { generateAIResponse, isSpecialCommand } = require('./gemini-handler')
const { saveConversation, clearConversationHistory } = require('./firebase-config')

// Configuration
const BOT_NAME = process.env.BOT_NAME || "LAKY AI BOT"
const OWNER_NAME = process.env.OWNER_NAME || "Malith Lakshan"
const OWNER_NUMBER = process.env.OWNER_NUMBER || "94741907061"

// Store for basic contact info (simplified)
const store = {
    contacts: {},
    readFromFile: () => {},
    writeToFile: () => {},
    bind: (ev) => {
        ev.on('contacts.update', (update) => {
            for (let contact of update) {
                const id = contact.id
                if (store.contacts) store.contacts[id] = { id, name: contact.notify }
            }
        })
    }
}

let phoneNumber = OWNER_NUMBER
let owner = OWNER_NAME

global.botname = BOT_NAME
global.themeemoji = "🤖"
const pairingCode = !!phoneNumber || process.argv.includes("--pairing-code")
const useMobile = process.argv.includes("--mobile")

// Readline interface for pairing code
const rl = process.stdin.isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null
const question = (text) => {
    if (rl) {
        return new Promise((resolve) => rl.question(text, resolve))
    } else {
        return Promise.resolve(phoneNumber)
    }
}

// Track typing states
const typingUsers = new Set()

async function startLakyBot() {
    try {
        let { version, isLatest } = await fetchLatestBaileysVersion()
        const { state, saveCreds } = await useMultiFileAuthState(`./session`)
        const msgRetryCounterCache = new NodeCache()

        const LakyBot = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: !pairingCode,
            browser: ["Laky AI Bot", "Chrome", "1.0.0"],
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
            },
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            getMessage: async (key) => {
                return "" // Simplified - no message storage
            },
            msgRetryCounterCache,
            defaultQueryTimeoutMs: 60000,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
        })

        // Save credentials when they update
        LakyBot.ev.on('creds.update', saveCreds)

        // Bind store
        store.bind(LakyBot.ev)

        // Utility functions
        LakyBot.decodeJid = (jid) => {
            if (!jid) return jid
            if (/:\d+@/gi.test(jid)) {
                let decode = jidDecode(jid) || {}
                return decode.user && decode.server && decode.user + '@' + decode.server || jid
            } else return jid
        }

        LakyBot.getName = (jid) => {
            const id = LakyBot.decodeJid(jid)
            if (id.endsWith("@g.us")) {
                return store.contacts[id]?.name || "Group Chat"
            } else {
                return store.contacts[id]?.name || "User"
            }
        }

        // Main message handler with AI
        LakyBot.ev.on('messages.upsert', async chatUpdate => {
            try {
                const mek = chatUpdate.messages[0]
                if (!mek.message) return
                
                // Extract message content
                mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') 
                    ? mek.message.ephemeralMessage.message 
                    : mek.message

                // Ignore status broadcasts
                if (mek.key && mek.key.remoteJid === 'status@broadcast') return
                if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return

                // Get message text
                const messageType = Object.keys(mek.message)[0]
                let messageText = ''
                
                if (messageType === 'conversation') {
                    messageText = mek.message.conversation
                } else if (messageType === 'extendedTextMessage') {
                    messageText = mek.message.extendedTextMessage.text
                } else {
                    return // Ignore non-text messages
                }

                if (!messageText || !messageText.trim()) return

                // Get user info
                const userJid = mek.key.remoteJid
                const userName = mek.pushName || LakyBot.getName(userJid)
                const isGroup = userJid.endsWith('@g.us')
                const userId = mek.key.fromMe ? LakyBot.user.id : (mek.key.participant || mek.key.remoteJid)
                const cleanUserId = userId.replace(/[^a-zA-Z0-9]/g, '_')

                console.log(chalk.cyan(`📩 Message from ${userName} (${isGroup ? 'Group' : 'Private'}): ${messageText.substring(0, 50)}...`))

                // Send typing indicator
                if (!typingUsers.has(userJid)) {
                    typingUsers.add(userJid)
                    await LakyBot.sendPresenceUpdate('composing', userJid)
                }

                try {
                    // Check for special commands
                    const command = isSpecialCommand(messageText)
                    
                    if (command === 'clear') {
                        await clearConversationHistory(cleanUserId)
                        await LakyBot.sendMessage(userJid, {
                            text: '🗑️ Conversation cleared! Let\'s start fresh! ✨\n\nපැරණි සංවාද මකා දැමුවා! අලුතෙන් පටන් ගමු! ✨'
                        })
                        return
                    }
                    
                    if (command === 'help') {
                        const helpText = `🤖 *Laky AI Assistant Help* 🤖

*Commands:*
• Just chat naturally - I'll respond!
• "clear" - Clear conversation history
• "help" - Show this message

*Languages I speak:*
🇱🇰 Sinhala (සිංහල)
🇬🇧 English
🌏 Singlish (Mix)

*About Me:*
I'm an AI assistant created by ${OWNER_NAME} to help and chat with you! I understand emotions and respond with appropriate emojis 😊

*Creator Contact:*
📱 +${OWNER_NUMBER}

Just send me any message and I'll respond naturally! 💬✨`
                        
                        await LakyBot.sendMessage(userJid, { text: helpText })
                        return
                    }

                    // Generate AI response
                    const aiResult = await generateAIResponse(messageText, cleanUserId, userName)

                    if (aiResult.success) {
                        // Save conversation to Firebase
                        await saveConversation(cleanUserId, messageText, aiResult.response)
                        
                        // Send AI response
                        await LakyBot.sendMessage(userJid, { 
                            text: aiResult.response 
                        })
                        
                        console.log(chalk.green(`✅ AI Response sent (${aiResult.language}, ${aiResult.emotion})`))
                    } else {
                        // Send error response
                        await LakyBot.sendMessage(userJid, { 
                            text: aiResult.response 
                        })
                        console.log(chalk.red(`❌ Error response sent`))
                    }

                } catch (error) {
                    console.error('❌ Error processing message:', error.message)
                    
                    // Send error message to user
                    await LakyBot.sendMessage(userJid, {
                        text: '❌ Oops! Something went wrong. Please try again! 😊\n\nඅපොයි! මොකක්හරි වැරැද්දක්. කරුණාකර නැවත උත්සාහ කරන්න! 😊'
                    })
                } finally {
                    // Remove typing indicator
                    typingUsers.delete(userJid)
                    await LakyBot.sendPresenceUpdate('paused', userJid)
                }

            } catch (err) {
                console.error("Error in messages.upsert:", err)
            }
        })

        // Handle pairing code
        if (pairingCode && !LakyBot.authState.creds.registered) {
            if (useMobile) throw new Error('Cannot use pairing code with mobile api')

            let phoneNumber
            if (!!global.phoneNumber) {
                phoneNumber = global.phoneNumber
            } else {
                phoneNumber = await question(chalk.bgBlack(chalk.greenBright(`Please type your WhatsApp number 😊\nFormat: 94741907061 (without + or spaces) : `)))
            }

            phoneNumber = phoneNumber.replace(/[^0-9]/g, '')

            const pn = require('awesome-phonenumber');
            if (!pn('+' + phoneNumber).isValid()) {
                console.log(chalk.red('Invalid phone number. Please enter your full international number without + or spaces.'));
                process.exit(1);
            }

            setTimeout(async () => {
                try {
                    let code = await LakyBot.requestPairingCode(phoneNumber)
                    code = code?.match(/.{1,4}/g)?.join("-") || code
                    console.log(chalk.black(chalk.bgGreen(`Your Pairing Code : `)), chalk.black(chalk.white(code)))
                    console.log(chalk.yellow(`\nPlease enter this code in your WhatsApp app:\n1. Open WhatsApp\n2. Go to Settings > Linked Devices\n3. Tap "Link a Device"\n4. Enter the code shown above`))
                } catch (error) {
                    console.error('Error requesting pairing code:', error)
                    console.log(chalk.red('Failed to get pairing code. Please check your phone number and try again.'))
                }
            }, 3000)
        }

        // Connection handling
        LakyBot.ev.on('connection.update', async (s) => {
            const { connection, lastDisconnect, qr } = s
            
            if (qr) {
                console.log(chalk.yellow('📱 QR Code generated. Please scan with WhatsApp.'))
            }
            
            if (connection === 'connecting') {
                console.log(chalk.yellow('🔄 Connecting to WhatsApp...'))
            }
            
            if (connection == "open") {
                console.log(chalk.magenta(` `))
                console.log(chalk.yellow(`🌿Connected to => ` + JSON.stringify(LakyBot.user, null, 2)))

                try {
                    const botNumber = LakyBot.user.id.split(':')[0] + '@s.whatsapp.net';
                    await LakyBot.sendMessage(botNumber, {
                        text: `🤖 ${BOT_NAME} Connected Successfully!\n\n⏰ Time: ${new Date().toLocaleString()}\n✅ Status: Online and Ready!\n\n🚀 Powered by Google Gemini AI\n💾 Memory: Firebase Database\n👨‍💻 Creator: ${OWNER_NAME}\n📱 Contact: +${OWNER_NUMBER}`
                    });
                } catch (error) {
                    console.error('Error sending connection message:', error.message)
                }

                await delay(1999)
                console.log(chalk.yellow(`\n\n                  ${chalk.bold.blue(`[ ${global.botname} ]`)}\n\n`))
                console.log(chalk.cyan(`< ================================================== >`))
                console.log(chalk.magenta(`\n${global.themeemoji} AI Assistant: ${BOT_NAME}`))
                console.log(chalk.magenta(`${global.themeemoji} Creator: ${owner}`))
                console.log(chalk.magenta(`${global.themeemoji} WhatsApp: +${phoneNumber}`))
                console.log(chalk.magenta(`${global.themeemoji} AI Engine: Google Gemini`))
                console.log(chalk.green(`${global.themeemoji} 🤖 AI Bot Connected Successfully! ✅`))
                console.log(chalk.blue(`🌍 Languages: Sinhala | English | Singlish`))
                console.log(chalk.blue(`🎯 Emotion Detection: Enabled`))
                console.log(chalk.blue(`💬 Context Memory: Enabled`))
            }
            
            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut
                const statusCode = lastDisconnect?.error?.output?.statusCode
                
                console.log(chalk.red(`Connection closed due to ${lastDisconnect?.error}, reconnecting ${shouldReconnect}`))
                
                if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                    try {
                        require('fs').rmSync('./session', { recursive: true, force: true })
                        console.log(chalk.yellow('Session folder deleted. Please re-authenticate.'))
                    } catch (error) {
                        console.error('Error deleting session:', error)
                    }
                    console.log(chalk.red('Session logged out. Please re-authenticate.'))
                }
                
                if (shouldReconnect) {
                    console.log(chalk.yellow('Reconnecting...'))
                    await delay(5000)
                    startLakyBot()
                }
            }
        })

        // Simple anti-call handler
        const antiCallNotified = new Set();
        LakyBot.ev.on('call', async (calls) => {
            try {
                for (const call of calls) {
                    const callerJid = call.from || call.peerJid || call.chatId;
                    if (!callerJid) continue;
                    
                    if (!antiCallNotified.has(callerJid)) {
                        antiCallNotified.add(callerJid);
                        setTimeout(() => antiCallNotified.delete(callerJid), 60000);
                        await LakyBot.sendMessage(callerJid, { 
                            text: '📵 Calls are not supported. Please send a text message instead. 😊\n\nකෝල් කරන්න බෑ. කරුණාකර text එකක් යවන්න! 😊' 
                        });
                    }
                }
            } catch (e) {
                // ignore call errors
            }
        });

        return LakyBot

    } catch (error) {
        console.error('Error in startLakyBot:', error)
        await delay(5000)
        startLakyBot()
    }
}

// Start the bot with error handling
console.log(chalk.blue('\n🚀 Starting Laky AI Bot...\n'))
startLakyBot().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
})

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err)
})

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err)
})

// File watch for development
let file = require.resolve(__filename)
fs.watchFile(file, () => {
    fs.unwatchFile(file)
    console.log(chalk.redBright(`Update ${__filename}`))
    delete require.cache[file]
    require(file)
})
