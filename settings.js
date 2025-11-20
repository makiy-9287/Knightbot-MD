// settings.js - Advanced Configuration
module.exports = {
    // Bot Identity
    BOT_NAME: "Malith's AI Assistant",
    CREATOR_JID: "94741907061@s.whatsapp.net",
    CREATOR_NAME: "Malith Lakshan",
    CREATOR_NUMBER: "94741907061",
    
    // AI Configuration
    GEMINI_API_KEY: "AIzaSyBr8g6SYD9ebRLb3KrrTwCKH_mXxWp7EJI",
    GEMINI_MODEL: "gemini-2.0-flash",
    
    // Rate Limiting
    RATE_LIMIT: {
        MAX_REQUESTS: 10,
        TIME_WINDOW: 60000, // 1 minute
        MAX_CONCURRENT: 5
    },
    
    // Conversation Settings
    MAX_HISTORY: 8,
    MAX_RESPONSE_WORDS: 1000,
    
    // Features
    IMAGE_SUPPORT: true,
    MULTI_USER_SUPPORT: true,
    CALL_AUTO_REPLY: true,
    
    // Language Settings
    DEFAULT_LANGUAGE: "mixed",
    SUPPORTED_LANGUAGES: ["sinhala", "english", , "mixed"],
    
    // Natural Conversation Words
    CASUAL_WORDS: ["machan", "bro", "ado", "you", "these", "hari"],
    
    version: "2.0.0"
};

// Global variables
global.owner = '94741907061@s.whatsapp.net';
global.botname = "Malith's Advanced AI";
global.creatorName = "Malith Lakshan";
