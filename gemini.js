// gemini.js
const { GoogleGenerativeAI } = require("@google/generative-ai");
const config = require('./config');

class GeminiAI {
    constructor() {
        this.genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
        
        // Try different model names - Gemini frequently updates these
        this.availableModels = [
            "gemini-1.5-pro",
            "gemini-1.0-pro", 
            "gemini-pro",
            "models/gemini-pro",
            "gemini-1.5-flash"
        ];
        
        this.model = null;
        this.modelName = "";
        this.initializeModel();
        
        this.chatSessions = new Map();
    }

    // Initialize model with fallback options
    async initializeModel() {
        for (const modelName of this.availableModels) {
            try {
                this.model = this.genAI.getGenerativeModel({ 
                    model: modelName,
                    generationConfig: {
                        temperature: 0.7,
                        topK: 40,
                        topP: 0.95,
                        maxOutputTokens: 1024,
                    }
                });
                
                // Test the model with a simple request
                await this.model.generateContent("Hello");
                this.modelName = modelName;
                console.log(`✅ Gemini AI Model initialized: ${modelName}`);
                break;
            } catch (error) {
                console.log(`❌ Model ${modelName} failed: ${error.message}`);
                continue;
            }
        }
        
        if (!this.model) {
            console.error('❌ All Gemini models failed. Using fallback mode.');
        }
    }

    // Detect language from message
    detectLanguage(message) {
        const sinhalaRegex = /[\u0D80-\u0DFF]/;
        const hasSinhala = sinhalaRegex.test(message);
        const englishWords = message.match(/\b[a-zA-Z]+\b/g) || [];
        
        if (hasSinhala && englishWords.length > 3) {
            return 'mixed'; // Singlish
        } else if (hasSinhala) {
            return 'si'; // Sinhala
        } else {
            return 'en'; // English
        }
    }

    // Detect emotion from message
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

    // Get appropriate emojis based on emotion and language
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

    // Create AI prompt based on language and context
    createPrompt(message, language, emotion, chatHistory = []) {
        const basePrompt = {
            en: `You are a friendly WhatsApp AI assistant created by Malith Lakshan. Respond naturally and conversationally in English. 
                 Be helpful, warm, and use appropriate emojis. Current emotion detected: ${emotion}.`,
                 
            si: `ඔබ මලිත් ලක්ෂන් විසින් සාදන ලද සුහදශීලී WhatsApp AI සහායකයෙක්. ස්වාභාවික සහ සංවාදාත්මකව සිංහලෙන් පිළිතුරු දෙන්න. 
                 උදව් කිරීම, උණුසුම් වීම සහ සුදුසු emojis භාවිතා කරන්න. හඳුනාගත් චිත්තවේගය: ${emotion}.`,
                 
            mixed: `You are a friendly WhatsApp AI assistant created by Malith Lakshan. Respond in Singlish (mix of English and Sinhala). 
                    Be natural and conversational like Sri Lankan friends chat. Use appropriate emojis. Current emotion: ${emotion}.`
        };

        const historyContext = chatHistory.length > 0 
            ? `Previous conversation:\n${chatHistory.slice(-5).map(msg => `${msg.role}: ${msg.content}`).join('\n')}\n\n`
            : '';

        return `${basePrompt[language]}\n\n${historyContext}User: ${message}\nAssistant:`;
    }

    // Handle static responses for specific queries
    handleStaticResponse(message, language) {
        const lowerMessage = message.toLowerCase();
        
        // Check for creator questions
        const creatorKeywords = {
            en: ['who made you', 'who created you', 'who built you', 'your creator', 'who develop you'],
            si: ['මාව සාදා ඇත්තේ', 'මගේ නිර්මාතෘ', 'කවුද මාව හැදුවේ', 'මාව build කලේ', 'create කලේ'],
            mixed: ['මාව create කරන්නේ', 'මගේ owner', 'කව්ද මාව හැදුවේ', 'build කලේ']
        };

        const howMadeKeywords = {
            en: ['how were you made', 'how did you make', 'how were you created', 'how were you built', 'how you work'],
            si: ['කොහොමද මාව හැදුවේ', 'මාව සෑදූ ආකාරය', 'කෙසේ වනවාද', 'හැදුවේ කොහොමද'],
            mixed: ['කොහොමද create කලේ', 'හැදුවේ කොහොමද', 'work කරන්නේ කොහොමද']
        };

        // Check creator questions
        for (const keyword of creatorKeywords[language] || creatorKeywords.en) {
            if (lowerMessage.includes(keyword)) {
                return config.STATIC_RESPONSES.creator[language];
            }
        }

        // Check how-made questions
        for (const keyword of howMadeKeywords[language] || howMadeKeywords.en) {
            if (lowerMessage.includes(keyword)) {
                return config.STATIC_RESPONSES.how_made[language];
            }
        }

        return null;
    }

    // Main method to generate AI response
    async generateResponse(userMessage, userId) {
        try {
            // If model initialization failed, use fallback responses
            if (!this.model) {
                return this.getFallbackResponse(userMessage);
            }

            // Detect language and emotion
            const language = this.detectLanguage(userMessage);
            const emotion = this.detectEmotion(userMessage);
            
            console.log(`📝 Language: ${language}, Emotion: ${emotion}, User: ${userId}`);

            // Check for static responses first
            const staticResponse = this.handleStaticResponse(userMessage, language);
            if (staticResponse) {
                return {
                    text: staticResponse,
                    language: language,
                    emotion: emotion,
                    isStatic: true
                };
            }

            // Get or create chat session
            if (!this.chatSessions.has(userId)) {
                this.chatSessions.set(userId, this.model.startChat({
                    history: [],
                    generationConfig: {
                        temperature: 0.7,
                        topK: 40,
                        topP: 0.95,
                        maxOutputTokens: 1024,
                    },
                }));
            }

            const chatSession = this.chatSessions.get(userId);
            
            // Generate AI response
            const result = await chatSession.sendMessage(userMessage);
            let responseText = result.response.text();

            // Add emoji based on emotion and language if not already present
            const emoji = this.getEmojis(emotion, language);
            if (config.AI_SETTINGS.USE_EMOJIS && !responseText.includes(emoji)) {
                responseText = `${emoji} ${responseText}`;
            }

            return {
                text: responseText,
                language: language,
                emotion: emotion,
                isStatic: false
            };

        } catch (error) {
            console.error('❌ Gemini AI Error:', error.message);
            return this.getFallbackResponse(userMessage, error);
        }
    }

    // Get fallback response when AI fails
    getFallbackResponse(userMessage, error = null) {
        const language = this.detectLanguage(userMessage);
        const emotion = this.detectEmotion(userMessage);
        
        // Enhanced fallback responses with basic intelligence
        const lowerMessage = userMessage.toLowerCase();
        
        // Greeting detection
        if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('hey') || 
            lowerMessage.includes('ආයුබෝවන්') || lowerMessage.includes('හායි')) {
            const greetings = {
                en: "👋 Hello! I'm having some technical issues but I'm still here to chat!",
                si: "👋 ආයුබෝවන්! මට තාක්ෂණික ගැටලුවක් තිබෙනවා, නමුත් මම තවමත් සංවාදයට සූදානම්!",
                mixed: "👋 Hello machan! Mata technical issue ekak thibba, but mama ain chat karanna ready!"
            };
            return {
                text: greetings[language] || greetings.en,
                language: language,
                emotion: 'happy',
                isStatic: false,
                isFallback: true
            };
        }
        
        // Creator question fallback
        if (lowerMessage.includes('who made') || lowerMessage.includes('creator') || 
            lowerMessage.includes('කවුද හැදුවේ') || lowerMessage.includes('create කරන්නේ')) {
            return {
                text: config.STATIC_RESPONSES.creator[language],
                language: language,
                emotion: emotion,
                isStatic: true,
                isFallback: true
            };
        }

        // Default fallback responses
        const fallbackResponses = {
            en: "🤖 I'm Malith's AI assistant! Currently experiencing technical difficulties. Please try again in a moment!",
            si: "🤖 මම මලිත්ගේ AI සහායකයා! දැන් තාක්ෂණික ගැටලුවක් තිබේ. කරුණාකර මොහොතකින් නැවත උත්සාහ කරන්න!",
            mixed: "🤖 Mama Malith ge AI assistant! Dan technical issue ekak thiyenawa. Please awasarain thawa karamu!"
        };
        
        return {
            text: fallbackResponses[language] || fallbackResponses.en,
            language: language,
            emotion: 'sad',
            isStatic: false,
            isFallback: true
        };
    }

    // Clear chat history for a user
    clearUserHistory(userId) {
        this.chatSessions.delete(userId);
    }
}

module.exports = new GeminiAI();
