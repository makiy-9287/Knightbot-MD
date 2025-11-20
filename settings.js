require('dotenv').config();

module.exports = {
    // Bot Identity
    botname: "Malith's Enhanced AI Assistant",
    owner: "94741907061",
    ownerName: "Malith Lakshan",
    
    // API Keys
    GEMINI_API_KEY: "AIzaSyBr8g6SYD9ebRLb3KrrTwCKH_mXxWp7EJI",
    GEMINI_MODEL: "gemini-2.0-flash",
    
    // Firebase Configuration (Optional - for future use)
    firebaseConfig: {
        apiKey: "AIzaSyBaGMyCNQRR-C6g4AS7gBSUO5ec88il2yU",
        authDomain: "laky-bot-project.firebaseapp.com",
        projectId: "laky-bot-project",
        storageBucket: "laky-bot-project.firebasestorage.app",
        messagingSenderId: "174580665716",
        appId: "1:174580665716:web:6371e6f37af1be2833f021"
    },
    
    // Enhanced Bot Settings
    sessionWriteInterval: 10000,
    maxConversationHistory: 20,
    maxMemoryItems: 15,
    version: "3.0",
    
    // Security Settings
    security: {
        maxMessagesPerMinute: 10,
        autoBlockThreshold: 5,
        callCooldownMinutes: 2,
        maxConsecutiveCalls: 2,
        enableAntiSpam: true,
        enableAutoBlock: true
    },
    
    // File Processing
    maxFileSize: 10 * 1024 * 1024, // 10MB
    supportedImageTypes: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'],
    supportedDocumentTypes: ['.pdf', '.txt', '.doc', '.docx'],
    
    // Memory Settings
    memoryBackupInterval: 6 * 60 * 60 * 1000, // 6 hours
    tempFileCleanupInterval: 60 * 60 * 1000, // 1 hour
    
    // AI Settings
    aiConfig: {
        temperature: 0.7,
        maxTokens: 2048,
        enableVision: true,
        enableSearch: true
    }
};

global.owner = '94741907061@s.whatsapp.net';
global.botname = "Malith's Enhanced AI Assistant";
