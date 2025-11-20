require('dotenv').config();

module.exports = {
    // Bot Identity
    botname: "Malith's AI Assistant",
    owner: "94741907061",
    ownerName: "Malith Lakshan",
    
    // API Keys
    GEMINI_API_KEY: "AIzaSyBr8g6SYD9ebRLb3KrrTwCKH_mXxWp7EJI",
    GEMINI_MODEL: "gemini-2.0-flash",
    
    // Firebase Configuration
    firebaseConfig: {
        apiKey: "AIzaSyBaGMyCNQRR-C6g4AS7gBSUO5ec88il2yU",
        authDomain: "laky-bot-project.firebaseapp.com",
        projectId: "laky-bot-project",
        storageBucket: "laky-bot-project.firebasestorage.app",
        messagingSenderId: "174580665716",
        appId: "1:174580665716:web:6371e6f37af1be2833f021"
    },
    
    // Bot Settings
    sessionWriteInterval: 10000,
    maxConversationHistory: 15,
    version: "2.0",
    autoReadMessages: true,
    antiCall: true
};

global.owner = '94741907061@s.whatsapp.net';
global.botname = "Malith's AI Assistant";
