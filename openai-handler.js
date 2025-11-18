// openai-handler.js
const axios = require('axios');
const config = require('./config');

class OpenAIHandler {
    constructor() {
        this.apiKey = config.OPENAI_API_KEY;
        this.apiUrl = 'https://api.openai.com/v1/chat/completions';
        this.conversationHistory = new Map();
    }

    detectLanguage(message) {
        const sinhalaRegex = /[\u0D80-\u0DFF]/;
        const hasSinhala = sinhalaRegex.test(message);
        const englishWords = message.match(/\b[a-zA-Z]+\b/g) || [];
        
        if (hasSinhala && englishWords.length > 3) return 'mixed';
        else if (hasSinhala) return 'si';
        else return 'en';
    }

    detectEmotion(message) {
        const lowerMessage = message.toLowerCase();
        const emotionPatterns = {
            happy: ['😊', '😂', '🤣', '😍', '🥰', '😘', 'happy', 'joy', 'good', 'great', 'awesome', 'thanks', 'thank you', 'සුබ', 'සතුටු', 'හරි', 'ජෝයි'],
            sad: ['😢', '😭', '😔', 'sad', 'unhappy', 'cry', 'bad', 'worst', 'දුක', 'කනගාටු', 'අසතුටු'],
            angry: ['😠', '😡', 'angry', 'mad', 'hate', 'frustrated', 'රිළව', 'කෝප', 'උදහස'],
            excited: ['😃', '🎉', '🔥', '💯', 'excited', 'wow', 'amazing', 'fantastic', 'උද්දාම', 'අමේසින්'],
            confused: ['😕', '🤔', 'confused', 'what', 'how', '?', 'කොහොම', 'මොකක්', 'ඇයි'],
            love: ['❤️', '💖', '💕', 'love', 'like', 'adore', 'ප්‍රේම', 'ආදරය', 'කැමති']
        };

        for (const [emotion, patterns] of Object.entries(emotionPatterns)) {
            if (patterns.some(pattern => lowerMessage.includes(pattern))) {
                return emotion;
            }
        }
        return 'neutral';
    }

    getEmojis(emotion, language) {
        const emojiMap = {
            happy: { en: '😊', si: '😊', mixed: '😊' },
            sad: { en: '😢', si: '😢', mixed: '😢' },
            angry: { en: '😠', si: '😠', mixed: '😠' },
            excited: { en: '🎉', si: '🎉', mixed: '🔥' },
            confused: { en: '🤔', si: '🤔', mixed: '🤔' },
            love: { en: '❤️', si: '❤️', mixed: '💕' },
            neutral: { en: '💬', si: '💬', mixed: '💬' }
        };
        return emojiMap[emotion]?.[language] || '💬';
    }

    createSystemPrompt(language, emotion) {
        const prompts = {
            en: `You are a friendly WhatsApp AI assistant created by Malith Lakshan. 
                  Respond naturally in English. Be helpful and use emojis. 
                  Current emotion: ${emotion}. Keep responses under 200 words.`,
                  
            si: `ඔබ මලිත් ලක්ෂන් විසින් සාදන ලද WhatsApp AI සහායකයෙක්. 
                  ස්වාභාවිකව සිංහලෙන් පිළිතුරු දෙන්න. උදව් කිරීම සහ emojis භාවිතා කරන්න.
                  චිත්තවේගය: ${emotion}. පිළිතුරු 200 වචනයකට අඩුවෙන් තබන්න.`,
                  
            mixed: `You are a friendly WhatsApp AI assistant created by Malith Lakshan.
                    Respond in Singlish (mix of English and Sinhala). Be natural like Sri Lankan friends chat.
                    Use emojis. Current emotion: ${emotion}. Keep responses short and sweet.`
        };
        
        return prompts[language] || prompts.en;
    }

    async generateResponse(userMessage, userId) {
        try {
            const language = this.detectLanguage(userMessage);
            const emotion = this.detectEmotion(userMessage);
            
            console.log(`📝 Language: ${language}, Emotion: ${emotion}, User: ${userId}`);

            // Get conversation history
            if (!this.conversationHistory.has(userId)) {
                this.conversationHistory.set(userId, []);
            }
            const history = this.conversationHistory.get(userId);

            const response = await axios.post(this.apiUrl, {
                model: config.AI_MODEL,
                messages: [
                    {
                        role: "system",
                        content: this.createSystemPrompt(language, emotion)
                    },
                    ...history.slice(-6), // Last 6 messages for context
                    {
                        role: "user", 
                        content: userMessage
                    }
                ],
                max_tokens: 500,
                temperature: 0.7
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            let responseText = response.data.choices[0].message.content;

            // Add emoji based on emotion
            const emoji = this.getEmojis(emotion, language);
            if (config.AI_SETTINGS.USE_EMOJIS && !responseText.includes(emoji)) {
                responseText = `${emoji} ${responseText}`;
            }

            // Update conversation history
            history.push(
                { role: "user", content: userMessage },
                { role: "assistant", content: responseText }
            );

            // Keep only last 10 messages
            if (history.length > 10) {
                this.conversationHistory.set(userId, history.slice(-10));
            }

            return {
                text: responseText,
                language: language,
                emotion: emotion,
                isStatic: false
            };

        } catch (error) {
            console.error('❌ OpenAI API Error:', error.response?.data || error.message);
            
            const language = this.detectLanguage(userMessage);
            const fallbackResponses = {
                en: "😅 Sorry, I'm having some technical issues. Please try again!",
                si: "😅 සමාවන්න, මට තාක්ෂණික ගැටලුවක් ඇත. කරුණාකර නැවත උත්සාහ කරන්න!",
                mixed: "😅 Sorry machan, mata technical issue ekak athi. Awasara ain karamu!"
            };
            
            return {
                text: fallbackResponses[language] || fallbackResponses.en,
                language: language,
                emotion: 'sad',
                isError: true
            };
        }
    }
}

module.exports = new OpenAIHandler();
