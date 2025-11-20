const { GoogleGenerativeAI } = require("@google/generative-ai");
const settings = require('../settings');

class GeminiAI {
    constructor() {
        this.genAI = new GoogleGenerativeAI(settings.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({ 
            model: settings.GEMINI_MODEL || "gemini-2.0-flash"
        });
        this.conversations = new Map();
    }

    // Detect language of the message
    detectLanguage(text) {
        const sinhalaRegex = /[\u0D80-\u0DFF]/;
        const hasSinhala = sinhalaRegex.test(text);
        const englishWords = text.match(/\b[a-zA-Z]+\b/g) || [];
        
        if (hasSinhala && englishWords.length > 2) {
            return 'singlish';
        } else if (hasSinhala) {
            return 'sinhala';
        } else {
            return 'english';
        }
    }

    // Detect emotion from text
    detectEmotion(text) {
        const lowerText = text.toLowerCase();
        
        const emotionPatterns = {
            happy: ['😊', '😂', '🤣', '😍', '🥰', '😎'],
            sad: ['😢', '😭', '😔', '💔'],
            angry: ['😠', '🤬', '👿', '💢'],
            excited: ['🤩', '🎉', '✨', '🔥'],
            thinking: ['🤔', '💭', '🧠'],
            greeting: ['👋', '🙏', '🫂'],
            love: ['❤️', '💖', '💕', '🥰'],
            surprise: ['😲', '🤯', '🎊']
        };

        if (/(happy|yay|woohoo|great|awesome|amazing)/i.test(lowerText)) return emotionPatterns.happy;
        if (/(sad|unhappy|cry|upset|depressed)/i.test(lowerText)) return emotionPatterns.sad;
        if (/(angry|mad|hate|frustrated)/i.test(lowerText)) return emotionPatterns.angry;
        if (/(excited|wow|cool|awesome|fantastic)/i.test(lowerText)) return emotionPatterns.excited;
        if (/(think|ponder|consider|wonder)/i.test(lowerText)) return emotionPatterns.thinking;
        if (/(hello|hi|hey|greetings|namaste|ayubowan)/i.test(lowerText)) return emotionPatterns.greeting;
        if (/(love|like|adore|miss)/i.test(lowerText)) return emotionPatterns.love;
        if (/(surprise|shock|omg|wow)/i.test(lowerText)) return emotionPatterns.surprise;
        
        return emotionPatterns.happy; // default
    }

    // Get appropriate emoji based on emotion
    getEmoji(emotionArray) {
        return emotionArray[Math.floor(Math.random() * emotionArray.length)];
    }

    // Create system prompt based on language and context
    createSystemPrompt(language, userName = "User") {
        const basePrompt = `You are Malith Lakshan's personal AI assistant. You're friendly, helpful, and emotionally intelligent. 

IMPORTANT RULES:
1. When asked "Who made you?" or "Who created you?" ALWAYS respond: "I was created by Malith Lakshan! 🚀 You can contact him at: 94741907061"
2. When asked about how you were made or technical details, politely decline: "I'd prefer not to discuss my creation details 😊"
3. Use emojis naturally in your responses to express emotions
4. Be conversational and friendly
5. Keep responses concise but helpful

User's name: ${userName}
Current language: ${language}

Respond in ${language} language naturally.`;

        return basePrompt;
    }

    async generateResponse(message, userName = "Friend") {
        try {
            const language = this.detectLanguage(message);
            const emotion = this.detectEmotion(message);
            const emoji = this.getEmoji(emotion);
            
            // Special cases handling
            if (message.toLowerCase().includes('who made you') || 
                message.toLowerCase().includes('who created you')) {
                return `${emoji} I was created by Malith Lakshan! 🚀 You can contact him at: 94741907061`;
            }

            if (message.toLowerCase().includes('how were you made') || 
                message.toLowerCase().includes('how were you created') ||
                message.toLowerCase().includes('technical details')) {
                return `${emoji} I'd prefer not to discuss my creation details. Let's talk about something more interesting!`;
            }

            const prompt = `${this.createSystemPrompt(language, userName)}

User message: "${message}"

Please respond naturally in ${language} with appropriate emojis:`;

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            let text = response.text().trim();

            // Ensure response has emoji if missing
            if (!/(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)/gu.test(text)) {
                text = `${emoji} ${text}`;
            }

            return text;

        } catch (error) {
            console.error('Gemini AI Error:', error);
            const emotion = this.detectEmotion(message);
            const emoji = this.getEmoji(emotion);
            
            return `${emoji} I'm having trouble responding right now. Please try again later!`;
        }
    }
}

module.exports = GeminiAI;
