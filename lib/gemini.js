const { GoogleGenerativeAI } = require("@google/generative-ai");
const settings = require('../settings');

class GeminiAI {
    constructor() {
        this.genAI = new GoogleGenerativeAI(settings.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({ 
            model: settings.GEMINI_MODEL || "gemini-2.0-flash",
            generationConfig: {
                temperature: 0.7,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 1024,
            }
        });
        this.conversationHistory = new Map();
    }

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

    detectEmotion(text) {
        const lowerText = text.toLowerCase();
        
        const emotionPatterns = {
            happy: ['😊', '😂', '🤣', '😍', '🥰', '😎', '🎉', '✨'],
            sad: ['😢', '😭', '😔', '💔', '🌧️'],
            angry: ['😠', '🤬', '👿', '💢', '🔥'],
            excited: ['🤩', '🎉', '✨', '🔥', '🚀'],
            thinking: ['🤔', '💭', '🧠', '📚'],
            greeting: ['👋', '🙏', '🫂', '💫'],
            love: ['❤️', '💖', '💕', '🥰', '😘'],
            surprise: ['😲', '🤯', '🎊', '💥'],
            confused: ['😕', '🤨', '⁉️'],
            cool: ['😎', '👌', '🔥', '💯']
        };

        if (/(happy|yay|woohoo|great|awesome|amazing|good|nice|wonderful)/i.test(lowerText)) 
            return emotionPatterns.happy;
        if (/(sad|unhappy|cry|upset|depressed|bad|not good)/i.test(lowerText)) 
            return emotionPatterns.sad;
        if (/(angry|mad|hate|frustrated|annoyed|pissed)/i.test(lowerText)) 
            return emotionPatterns.angry;
        if (/(excited|wow|cool|awesome|fantastic|great)/i.test(lowerText)) 
            return emotionPatterns.excited;
        if (/(think|ponder|consider|wonder|question)/i.test(lowerText)) 
            return emotionPatterns.thinking;
        if (/(hello|hi|hey|greetings|namaste|ayubowan|halo)/i.test(lowerText)) 
            return emotionPatterns.greeting;
        if (/(love|like|adore|miss|romantic)/i.test(lowerText)) 
            return emotionPatterns.love;
        if (/(surprise|shock|omg|wow|unexpected)/i.test(lowerText)) 
            return emotionPatterns.surprise;
        if (/(confused|what|how|why|understand|know)/i.test(lowerText)) 
            return emotionPatterns.confused;
        if (/(cool|awesome|great|nice|perfect)/i.test(lowerText)) 
            return emotionPatterns.cool;
        
        return emotionPatterns.happy;
    }

    getEmoji(emotionArray) {
        return emotionArray[Math.floor(Math.random() * emotionArray.length)];
    }

    createSystemPrompt(language, userName = "User", conversationHistory = []) {
        const basePrompt = {
            english: `You are Malith Lakshan's personal AI assistant. You're friendly, helpful, and emotionally intelligent.

CRITICAL RULES:
1. When asked "Who made you?" or "Who created you?" ALWAYS respond: "I was created by Malith Lakshan! 🚀 You can contact him at: 94741907061"
2. When asked about how you were made or technical details, politely say: "I'd prefer not to discuss my creation details 😊 Let's talk about something more interesting!"
3. Use emojis naturally in your responses to express emotions
4. Be conversational and friendly but concise
5. Adapt to user's mood and language style
6. Keep responses under 3-4 lines maximum

User: ${userName}
Language: English
Be natural, use emojis, and be helpful!`,

            sinhala: `ඔබ Malith Lakshan සාදන ලද AI සහායකයෙක්. ඔබ සුහදශීලී, උපකාරශීලී සහ චිත්තවේගීය බුද්ධිමත් විය යුතුය.

වැදගත් රීති:
1. "ඔයාව කොහොමද හැදුවේ?" හෝ "Who made you?" කියල අහන විට හැම වෙලේම කියන්න: "මාව හැදුවේ Malith Lakshan! 🚔 ඔහුගේ දුරකථන අංකය: 94741907061"
2. තාක්ෂණික විස්තර ගැන අහන විට කියන්න: "මගේ නිර්මාණය ගැන විස්තර කතා කිරීමට මම කැමති නොවේ 😊 අපි තවත් යමක් ගැන කතා කරමු!"
3. ප්‍රතිචාරවලදී emojis ස්වභාවිකව භාවිතා කරන්න
4. සංවාදශීලී සහ සුහදශීලී වන්න
5. ප්‍රතිචාර කෙටි හා සරල විය යුතුය

පරිශීලක: ${userName}
භාෂාව: සිංහල
ස්වභාවික, උපකාරශීලී සහ සුහදශීලී වන්න!`,

            singlish: `You are Malith Lakshan's personal AI assistant. You're friendly and helpful, mixing English and Sinhala naturally.

IMPORTANT RULES:
1. When asked "Who made you?" or "කොහොමද හැදුවේ?" ALWAYS respond: "මාව හැදුවේ Malith Lakshan! 🚀 His number: 94741907061"
2. When asked technical details, say: "එහෙම details ගැන කතා කරන්න ඕන නෑ 😊 Let's talk about something else!"
3. Use emojis naturally in responses
4. Mix English and Sinhala like real Sri Lankan conversation
5. Be casual and friendly

User: ${userName}
Language: Singlish (English + Sinhala mix)
Be natural, use emojis, and mix languages appropriately!`
        };

        return basePrompt[language] || basePrompt.english;
    }

    async generateResponse(message, userName = "Friend") {
        try {
            const language = this.detectLanguage(message);
            const emotion = this.detectEmotion(message);
            const emoji = this.getEmoji(emotion);
            
            // Special cases handling
            const lowerMessage = message.toLowerCase();
            
            if (lowerMessage.includes('who made you') || 
                lowerMessage.includes('who created you') ||
                lowerMessage.includes('කොහොමද හැදුවේ') ||
                lowerMessage.includes('හැදුවේ කවුද')) {
                return `${emoji} I was created by Malith Lakshan! 🚀 You can contact him at: 94741907061`;
            }

            if (lowerMessage.includes('how were you made') || 
                lowerMessage.includes('how were you created') ||
                lowerMessage.includes('technical details') ||
                lowerMessage.includes('code') ||
                lowerMessage.includes('program')) {
                return `${emoji} I'd prefer not to discuss my creation details. Let's talk about something more interesting! 😊`;
            }

            // Greeting responses
            if (/(hello|hi|hey|halo|ayubowan|nahame|කොහොමද|ආයුබෝවන්)/i.test(lowerMessage) && 
                message.length < 20) {
                const greetings = {
                    english: [`${emoji} Hello ${userName}! How can I help you today?`, 
                             `${emoji} Hi there ${userName}! What's on your mind?`],
                    sinhala: [`${emoji} ආයුබෝවන් ${userName}! ඔබට මට කෙසේ උදව් කළ හැකිද?`, 
                             `${emoji} Hello ${userName}! අද ඔබට කුමන උදව්වක් අවශ්‍යද?`],
                    singlish: [`${emoji} Ayubowan ${userName}! How can I help you?`, 
                              `${emoji} Hi machan ${userName}! කොහොමද? What's up?`]
                };
                const langGreetings = greetings[language] || greetings.english;
                return langGreetings[Math.floor(Math.random() * langGreetings.length)];
            }

            const prompt = `${this.createSystemPrompt(language, userName)}

Current message: "${message}"

Please respond naturally in ${language} with appropriate emojis. Keep it conversational and under 4 lines:`;

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
            
            const errorResponses = [
                `${emoji} I'm having trouble thinking right now. Please try again!`,
                `${emoji} Sorry, I'm a bit confused. Can you repeat that?`,
                `${emoji} My brain is taking a break! Please try again in a moment.`
            ];
            
            return errorResponses[Math.floor(Math.random() * errorResponses.length)];
        }
    }
}

module.exports = GeminiAI;
