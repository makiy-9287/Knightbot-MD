// config.js
require('dotenv').config();

module.exports = {
    // Bot Identity
    BOT_NAME: "Malith's AI Assistant",
    BOT_OWNER: "Malith Lakshan",
    OWNER_NUMBER: "94741907061",
    
    // Gemini API Configuration
    GEMINI_API_KEY: "AIzaSyBr8g6SYD9ebRLb3KrrTwCKH_mXxWp7EJI",

     // Gemini Model Options (will try in order)
    GEMINI_MODELS: [
        "gemini-1.5-pro",
        "gemini-1.0-pro", 
        "gemini-pro",
        "models/gemini-pro",
        "gemini-1.5-flash"
    ],
    
    // Firebase Configuration
    FIREBASE_CONFIG: {
        apiKey: "AIzaSyBaGMyCNQRR-C6g4AS7gBSUO5ec88il2yU",
        authDomain: "laky-bot-project.firebaseapp.com",
        projectId: "laky-bot-project",
        storageBucket: "laky-bot-project.firebasestorage.app",
        messagingSenderId: "174580665716",
        appId: "1:174580665716:web:6371e6f37af1be2833f021"
    },
    
    // AI Behavior Settings
    AI_SETTINGS: {
        // Language support: Sinhala, English, Singlish (mixed)
        SUPPORTED_LANGUAGES: ['si', 'en', 'mixed'],
        DEFAULT_LANGUAGE: 'mixed',
        
        // Response settings
        USE_EMOJIS: true,
        DETECT_EMOTIONS: true,
        
        // Chat memory
        MAX_HISTORY_LENGTH: 10, // Keep last 10 messages for context
        SESSION_TIMEOUT: 30 * 60 * 1000, // 30 minutes session timeout
    },
    
    // Bot Responses for specific queries
    STATIC_RESPONSES: {
        creator: {
            en: "🤖 I was created by *Malith Lakshan* 📱 Contact: +94741907061",
            si: "🤖 මාව සාදා ඇත්තේ *මලිත් ලක්ෂන්* විසිනි 📱 දුරකථන: +94741907061",
            mixed: "🤖 මාව create කරන්නේ *Malith Lakshan* තමයි 📱 Contact: +94741907061"
        },
        how_made: {
            en: "😊 I'm here to help you with conversations and information!",
            si: "😊 මම ඔබට සංවාද සහ තොරතුරු සපයා ගැනීමට ඇති!",
            mixed: "😊 I'm here to help you with conversations and information machan!"
        }
    },
    
    // Baileys WhatsApp Settings
    WHATSAPP_SETTINGS: {
        BROWSER: ["Ubuntu", "Chrome", "20.0.04"],
        PRINT_QR: true,
        AUTH_TYPE: "multi-file"
    }
};
