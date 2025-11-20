/**
 * Laky AI Bot - WhatsApp AI Chatbot
 * Copyright (c) 2024 Malith Lakshan
 * 
 * Powered by Gemini AI & Firebase
 */

require('dotenv').config();
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const chalk = require('chalk')
const PhoneNumber = require('awesome-phonenumber')
const { handleMessages, handleGroupParticipantUpdate, handleStatus } = require('./ai-main');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    jidDecode,
    jidNormalizedUser,
    makeCacheableSignalKeyStore,
    delay
} = require("@whiskeysockets/baileys")
const NodeCache = require("node-cache")
const pino = require("pino")
const readline = require("readline")
const { rmSync } = require('fs')

// Bot Configuration
global.botname = process.env.BOT_NAME || "LAKY AI BOT"
global.ownername = process.env.OWNER_NAME || "Malith Lakshan"
global.ownerNumber = process.env.OWNER_NUMBER || "94741907061"
global.themeemoji = "🤖"

// Settings
const settings = {
    version: '2.0.0',
    ownerNumber: global.ownerNumber,
    storeWriteInterval: 10000
}

// Create necessary directories
if (!fs.existsSync('./session')) fs.mkdirSync('./session')

// Simple in-memory store (lightweight alternative)
const store = {
    contacts: {},
    messages: {},
    bind: (ev) => {
        ev.on('contacts.update', (update) => {
            for (let contact of update) {
                const id = contact.id
                if (store.contacts) store.contacts[id] = { id, name: contact.notify }
            }
        })
    },
    loadMessage: async (jid, id) => {
        return store.messages[jid]?.[id] || null
    }
}

// Memory optimization
setInterval(() => {
    if (global.gc) {
        global.gc()
        console.log('🧹 Memory cleaned')
    }
}, 60_000)

// Memory monitoring
setInterval(() => {
    const used = process.memoryUsage().rss / 1024 / 1024
    if (used > 500) {
        console.log('⚠️ RAM usage high, restarting...')
        process.exit(1)
    }
}, 30_000)

const pairingCode = process.argv.includes("--pairing-code") || true
const useMobile = process.argv.includes("--mobile")

// Readline interface
const rl = process.stdin.isTTY ? readline.createInterface({ 
    input: process.stdin, 
    output: process.stdout 
}) : null

const question = (text) => {
    if (rl) {
        return new Promise((resolve) => rl.question(text, resolve))
    }
    return Promise.resolve(settings.ownerNumber)
}

async function startLakyBot() {
    try {
        let { version } = await fetchLatestBaileysVersion()
        const { state, saveCreds } = await useMultiFileAuthState('./session')
        const msgRetryCounterCache = new NodeCache()

        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: !pairingCode,
            browser: ["Laky AI Bot", "Chrome", "1.0.0"],
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
            },
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            getMessage: async (key) => {
                let jid = jidNormalizedUser(key.remoteJid)
                let msg = await store.loadMessage(jid, key.id)
                return msg?.message || ""
            },
            msgRetryCounterCache,
            defaultQueryTimeoutMs: 60000,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
        })

        // Save credentials
        sock.ev.on('creds.update', saveCreds)

        // Bind store
        store.bind(sock.ev)

        // Decode JID helper
        sock.decodeJid = (jid) => {
            if (!jid) return jid
            if (/:\d+@/gi.test(jid)) {
                let decode = jidDecode(jid) || {}
                return decode.user && decode.server && decode.user + '@' + decode.server || jid
            }
            return jid
        }

        // Get name helper
        sock.getName = (jid) => {
            let id = sock.decodeJid(jid)
            if (id.endsWith("@g.us")) {
                let v = store.contacts[id] || {}
                return v.name || v.subject || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international')
            }
            let v = store.contacts[id] || {}
            return v.name || v.subject || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international')
        }

        sock.public = true

        // Message handling
        sock.ev.on('messages.upsert', async chatUpdate => {
            try {
                const mek = chatUpdate.messages[0]
                if (!mek.message) return
                
                // Handle ephemeral messages
                mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') 
                    ? mek.message.ephemeralMessage.message 
                    : mek.message

                // Ignore status broadcast
                if (mek.key?.remoteJid === 'status@broadcast') {
                    await handleStatus(sock, chatUpdate)
                    return
                }

                // Ignore Baileys messages
                if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return

                // Clear retry cache
                if (sock?.msgRetryCounterCache) {
                    sock.msgRetryCounterCache.clear()
                }

                // Handle with AI
                try {
                    await handleMessages(sock, chatUpdate)
                } catch (err) {
                    console.error("❌ Message handler error:", err.message)
                    if (mek.key?.remoteJid) {
                        await sock.sendMessage(mek.key.remoteJid, {
                            text: '❌ Error processing message. Please try again! 😊\n\nමොකක්හරි වැරැද්දක්. නැවත try කරන්න! 😊'
                        }).catch(() => {})
                    }
                }
            } catch (err) {
                console.error("❌ Message upsert error:", err.message)
            }
        })

        // Pairing code handling
        if (pairingCode && !sock.authState.creds.registered) {
            if (useMobile) throw new Error('Cannot use pairing code with mobile')

            let phoneNumber = await question(chalk.bgBlack(chalk.greenBright(
                `\n📱 Enter your WhatsApp number\nFormat: 94741907061 (no + or spaces)\n\n> `
            )))

            phoneNumber = phoneNumber.replace(/[^0-9]/g, '')

            const pn = require('awesome-phonenumber')
            if (!pn('+' + phoneNumber).isValid()) {
                console.log(chalk.red('❌ Invalid phone number!'))
                process.exit(1)
            }

            setTimeout(async () => {
                try {
                    let code = await sock.requestPairingCode(phoneNumber)
                    code = code?.match(/.{1,4}/g)?.join("-") || code
                    console.log(chalk.bgGreen(chalk.black(`\n✅ Your Pairing Code: ${code}\n`)))
                    console.log(chalk.yellow('Enter this code in WhatsApp:\n1. Open WhatsApp\n2. Settings > Linked Devices\n3. Link a Device\n4. Enter code\n'))
                } catch (error) {
                    console.error('❌ Failed to get pairing code:', error.message)
                }
            }, 3000)
        }

        // Connection updates
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update

            if (qr) {
                console.log(chalk.yellow('📱 QR Code generated. Scan with WhatsApp.'))
            }

            if (connection === 'connecting') {
                console.log(chalk.yellow('🔄 Connecting to WhatsApp...'))
            }

            if (connection === 'open') {
                console.log(chalk.green('\n✅ Connected to WhatsApp!\n'))
                console.log(chalk.cyan('═══════════════════════════════════'))
                console.log(chalk.magenta(`🤖 ${global.botname}`))
                console.log(chalk.magenta(`👨‍💻 Creator: ${global.ownername}`))
                console.log(chalk.magenta(`📱 Contact: +${global.ownerNumber}`))
                console.log(chalk.magenta(`🧠 AI: Google Gemini`))
                console.log(chalk.magenta(`🌍 Languages: Sinhala, English, Singlish`))
                console.log(chalk.magenta(`📦 Version: ${settings.version}`))
                console.log(chalk.cyan('═══════════════════════════════════\n'))

                try {
                    const botNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net'
                    await sock.sendMessage(botNumber, {
                        text: `🤖 *Laky AI Bot Connected!* 🎉

⏰ ${new Date().toLocaleString()}
✅ Status: Online
🧠 Powered by: Gemini AI
🌍 Languages: Sinhala, English, Singlish

💬 Just message naturally and I'll respond!

👨‍💻 Creator: ${global.ownername}
📱 Contact: +${global.ownerNumber}

Let's chat! 😊✨`
                    })
                } catch (error) {
                    console.log('Note: Could not send connection message')
                }
            }

            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
                const statusCode = lastDisconnect?.error?.output?.statusCode

                console.log(chalk.red(`Connection closed: ${lastDisconnect?.error?.message}`))

                if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                    try {
                        rmSync('./session', { recursive: true, force: true })
                        console.log(chalk.yellow('Session deleted. Please re-authenticate.'))
                    } catch {}
                }

                if (shouldReconnect) {
                    console.log(chalk.yellow('Reconnecting in 5 seconds...'))
                    await delay(5000)
                    startLakyBot()
                }
            }
        })

        // Group participant updates
        sock.ev.on('group-participants.update', async (update) => {
            await handleGroupParticipantUpdate(sock, update)
        })

        // Status updates
        sock.ev.on('messages.upsert', async (m) => {
            if (m.messages[0]?.key?.remoteJid === 'status@broadcast') {
                await handleStatus(sock, m)
            }
        })

        return sock

    } catch (error) {
        console.error('❌ Fatal error:', error.message)
        await delay(5000)
        startLakyBot()
    }
}

// Start bot
console.log(chalk.blue('\n🚀 Starting Laky AI Bot...\n'))
startLakyBot().catch(error => {
    console.error('❌ Fatal error:', error)
    process.exit(1)
})

// Error handlers
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err.message)
})

process.on('unhandledRejection', (err) => {
    console.error('❌ Unhandled Rejection:', err.message)
})

// Hot reload
let file = require.resolve(__filename)
fs.watchFile(file, () => {
    fs.unwatchFile(file)
    console.log(chalk.yellow(`♻️ ${__filename} updated`))
    delete require.cache[file]
    require(file)
})
