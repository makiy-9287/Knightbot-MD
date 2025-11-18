// config.js
require('dotenv').config();

module.exports = {
    // Bot Identity
    BOT_NAME: "Malith's AI Assistant",
    BOT_OWNER: "Malith Lakshan", 
    OWNER_NUMBER: "94741907061",

    // AI API Configuration (OpenAI GPT)
    OPENAI_API_KEY: "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", // Get from https://platform.openai.com/api-keys
    AI_MODEL: "gpt-3.5-turbo", // or "gpt-4"
    
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
        SUPPORTED_LANGUAGES: ['si', 'en', 'mixed'],
        DEFAULT_LANGUAGE: 'mixed',
        USE_EMOJIS: true,
        DETECT_EMOTIONS: true,
        MAX_HISTORY_LENGTH: 10,
        SESSION_TIMEOUT: 30 * 60 * 1000,
    },

    // Static Responses
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
    }
};
