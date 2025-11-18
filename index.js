/**
 * Knight AI Bot - Gemini Powered WhatsApp Bot
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
    delay
} = require("@whiskeysockets/baileys")
const NodeCache = require("node-cache")
const pino = require("pino")
const readline = require("readline")

// Import our AI modules
const config = require('./config')
const aiHandler = require('./ai-handler')

// Store for basic contact info (simplified from original)
const store = {
    contacts: {},
    readFromFile: () => {},
    writeToFile: () => {},
    bind: () => {}
}

let phoneNumber = config.OWNER_NUMBER
let owner = config.BOT_OWNER

global.botname = config.BOT_NAME
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

async function startAIBot() {
    try {
        let { version, isLatest } = await fetchLatestBaileysVersion()
        const { state, saveCreds } = await useMultiFileAuthState(`./session`)
        const msgRetryCounterCache = new NodeCache()

        const AIBot = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: !pairingCode,
            browser: config.WHATSAPP_SETTINGS.BROWSER,
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
        AIBot.ev.on('creds.update', saveCreds)

        // Utility functions
        AIBot.decodeJid = (jid) => {
            if (!jid) return jid
            if (/:\d+@/gi.test(jid)) {
                let decode = jidDecode(jid) || {}
                return decode.user && decode.server && decode.user + '@' + decode.server || jid
            } else return jid
        }

        AIBot.getName = (jid) => {
            const id = AIBot.decodeJid(jid)
            if (id.endsWith("@g.us")) {
                return "Group Chat"
            } else {
                return store.contacts[id]?.name || "User"
            }
        }

        // Main message handler
        AIBot.ev.on('messages.upsert', async chatUpdate => {
            try {
                const mek = chatUpdate.messages[0]
                if (!mek.message) return
                
                // Extract message content
                mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') 
                    ? mek.message.ephemeralMessage.message 
                    : mek.message

                // Ignore status broadcasts and specific message types
                if (mek.key && mek.key.remoteJid === 'status@broadcast') return
                if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return

                // Only process text messages for AI
                const messageType = Object.keys(mek.message)[0]
                if (messageType !== 'conversation' && messageType !== 'extendedTextMessage') return

                const messageText = mek.message[messageType]?.text || mek.message[messageType]?.matchedText
                if (!messageText) return

                // Get user info
                const userJid = mek.key.remoteJid
                const userName = AIBot.getName(userJid)
                const isGroup = userJid.endsWith('@g.us')
                const userId = mek.key.fromMe ? AIBot.user.id : mek.key.participant || mek.key.remoteJid

                // Prepare user info for AI handler
                const userInfo = {
                    userId: userId,
                    userName: userName,
                    isGroup: isGroup,
                    groupId: isGroup ? userJid : null,
                    groupName: isGroup ? userName : null
                }

                console.log(chalk.cyan(`📩 New message from ${userName} (${isGroup ? 'Group' : 'Private'}): ${messageText.substring(0, 50)}...`))

                // Process message through AI
                const aiResult = await aiHandler.handleMessage(messageText, userInfo)

                if (aiResult.success) {
                    // Send AI response
                    await AIBot.sendMessage(userJid, { 
                        text: aiResult.message 
                    })
                    console.log(chalk.green(`✅ AI Response sent to ${userName}`))
                } else {
                    // Send error response
                    await AIBot.sendMessage(userJid, { 
                        text: aiResult.message 
                    })
                    console.log(chalk.red(`❌ Error response sent to ${userName}`))
                }

            } catch (err) {
                console.error("Error processing message:", err)
                // Send generic error message
                try {
                    if (mek.key && mek.key.remoteJid) {
                        await AIBot.sendMessage(mek.key.remoteJid, {
                            text: '❌ An error occurred while processing your message. Please try again.'
                        })
                    }
                } catch (sendError) {
                    console.error("Failed to send error message:", sendError)
                }
            }
        })

        // Handle contacts update
        AIBot.ev.on('contacts.update', update => {
            for (let contact of update) {
                let id = AIBot.decodeJid(contact.id)
                if (store && store.contacts) store.contacts[id] = { id, name: contact.notify }
            }
        })

        // Handle pairing code
        if (pairingCode && !AIBot.authState.creds.registered) {
            if (useMobile) throw new Error('Cannot use pairing code with mobile api')

            let phoneNumber
            if (!!global.phoneNumber) {
                phoneNumber = global.phoneNumber
            } else {
                phoneNumber = await question(chalk.bgBlack(chalk.greenBright(`Please type your WhatsApp number 😍\nFormat: 94741907061 (without + or spaces) : `)))
            }

            phoneNumber = phoneNumber.replace(/[^0-9]/g, '')

            const pn = require('awesome-phonenumber');
            if (!pn('+' + phoneNumber).isValid()) {
                console.log(chalk.red('Invalid phone number. Please enter your full international number without + or spaces.'));
                process.exit(1);
            }

            setTimeout(async () => {
                try {
                    let code = await AIBot.requestPairingCode(phoneNumber)
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
        AIBot.ev.on('connection.update', async (s) => {
            const { connection, lastDisconnect, qr } = s
            
            if (qr) {
                console.log(chalk.yellow('📱 QR Code generated. Please scan with WhatsApp.'))
            }
            
            if (connection === 'connecting') {
                console.log(chalk.yellow('🔄 Connecting to WhatsApp...'))
            }
            
            if (connection == "open") {
                console.log(chalk.magenta(` `))
                console.log(chalk.yellow(`🌿Connected to => ` + JSON.stringify(AIBot.user, null, 2)))

                try {
                    const botNumber = AIBot.user.id.split(':')[0] + '@s.whatsapp.net';
                    await AIBot.sendMessage(botNumber, {
                        text: `🤖 ${config.BOT_NAME} Connected Successfully!\n\n⏰ Time: ${new Date().toLocaleString()}\n✅ Status: Online and Ready!\n\n🚀 Powered by Google Gemini AI\n💾 Memory: Firebase Database\n👨‍💻 Creator: ${config.BOT_OWNER}`
                    });
                } catch (error) {
                    console.error('Error sending connection message:', error.message)
                }

                await delay(1999)
                console.log(chalk.yellow(`\n\n                  ${chalk.bold.blue(`[ ${global.botname} ]`)}\n\n`))
                console.log(chalk.cyan(`< ================================================== >`))
                console.log(chalk.magenta(`\n${global.themeemoji} AI Assistant: ${config.BOT_NAME}`))
                console.log(chalk.magenta(`${global.themeemoji} Creator: ${owner}`))
                console.log(chalk.magenta(`${global.themeemoji} WhatsApp: +${phoneNumber}`))
                console.log(chalk.magenta(`${global.themeemoji} AI Engine: Google Gemini`))
                console.log(chalk.green(`${global.themeemoji} 🤖 AI Bot Connected Successfully! ✅`))
                console.log(chalk.blue(`🌐 Languages: Sinhala | English | Singlish`))
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
                    startAIBot()
                }
            }
        })

        // Simple anti-call handler
        const antiCallNotified = new Set();
        AIBot.ev.on('call', async (calls) => {
            try {
                for (const call of calls) {
                    const callerJid = call.from || call.peerJid || call.chatId;
                    if (!callerJid) continue;
                    
                    if (!antiCallNotified.has(callerJid)) {
                        antiCallNotified.add(callerJid);
                        setTimeout(() => antiCallNotified.delete(callerJid), 60000);
                        await AIBot.sendMessage(callerJid, { 
                            text: '📵 Calls are not supported. Please send a text message instead.' 
                        });
                    }
                }
            } catch (e) {
                // ignore call errors
            }
        });

        return AIBot

    } catch (error) {
        console.error('Error in startAIBot:', error)
        await delay(5000)
        startAIBot()
    }
}

// Start the bot with error handling
startAIBot().catch(error => {
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
