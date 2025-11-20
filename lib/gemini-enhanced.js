const { GoogleGenerativeAI } = require("@google/generative-ai");
const settings = require('../settings');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class EnhancedGeminiAI {
    constructor() {
        this.genAI = new GoogleGenerativeAI(settings.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({ 
            model: settings.GEMINI_MODEL || "gemini-2.0-flash",
            generationConfig: {
                temperature: 0.8,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 2048,
            }
        });
        
        this.visionModel = this.genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            generationConfig: {
                temperature: 0.4,
                maxOutputTokens: 1024,
            }
        });
    }

    // Enhanced language detection
    detectLanguage(text) {
        const sinhalaRegex = /[\u0D80-\u0DFF]/;
        const hasSinhala = sinhalaRegex.test(text);
        const englishWords = text.match(/\b[a-zA-Z]+\b/g) || [];
        
        if (hasSinhala && englishWords.length > 2) return 'singlish';
        if (hasSinhala) return 'sinhala';
        return 'english';
    }

    // Smart emotion detection
    detectEmotion(text) {
        const lowerText = text.toLowerCase();
        
        const emotionMap = {
            happy: ['😊', '😂', '🤣', '😍', '🥰', '😎', '🎉', '✨', '👍'],
            sad: ['😢', '😭', '😔', '💔', '🌧️', '🙁'],
            angry: ['😠', '🤬', '👿', '💢', '🔥', '😤'],
            excited: ['🤩', '🎉', '✨', '🔥', '🚀', '💫'],
            thinking: ['🤔', '💭', '🧠', '📚', '🔍'],
            greeting: ['👋', '🙏', '🫂', '💫', '😄'],
            love: ['❤️', '💖', '💕', '🥰', '😘', '💝'],
            surprise: ['😲', '🤯', '🎊', '💥', '⭐'],
            confused: ['😕', '🤨', '⁉️', '❓'],
            cool: ['😎', '👌', '🔥', '💯', '⭐']
        };

        if (/(happy|yay|woohoo|great|awesome|amazing|good|nice|wonderful|perfect)/i.test(lowerText)) 
            return emotionMap.happy;
        if (/(sad|unhappy|cry|upset|depressed|bad|not good|miss you)/i.test(lowerText)) 
            return emotionMap.sad;
        if (/(angry|mad|hate|frustrated|annoyed|pissed)/i.test(lowerText)) 
            return emotionMap.angry;
        if (/(excited|wow|cool|awesome|fantastic|great|yeah)/i.test(lowerText)) 
            return emotionMap.excited;
        if (/(think|ponder|consider|wonder|question|how|what|why)/i.test(lowerText)) 
            return emotionMap.thinking;
        if (/(hello|hi|hey|greetings|namaste|ayubowan|halo|good morning|good evening)/i.test(lowerText)) 
            return emotionMap.greeting;
        if (/(love|like|adore|miss|romantic|beautiful|handsome)/i.test(lowerText)) 
            return emotionMap.love;
        if (/(surprise|shock|omg|wow|unexpected|really)/i.test(lowerText)) 
            return emotionMap.surprise;
        if (/(confused|what|how|why|understand|know|explain)/i.test(lowerText)) 
            return emotionMap.confused;
        if (/(cool|awesome|great|nice|perfect|excellent)/i.test(lowerText)) 
            return emotionMap.cool;
        
        return emotionMap.happy;
    }

    getEmoji(emotionArray) {
        return emotionArray[Math.floor(Math.random() * emotionArray.length)];
    }

    // Generate image (using Gemini or external API)
    async generateImage(prompt) {
        try {
            // Using Gemini for image generation description
            const result = await this.model.generateContent(`
                Create a detailed image description for: "${prompt}"
                Be very descriptive about colors, style, composition.
                Return only the description, no other text.
            `);
            
            const description = await result.response.text();
            return {
                success: true,
                description: description.trim(),
                prompt: prompt,
                note: "Image generation would be implemented with DALL-E or Stable Diffusion API"
            };
        } catch (error) {
            return {
                success: false,
                error: "Image generation service unavailable"
            };
        }
    }

    // Read image content (Gemini Vision)
    async readImage(imageBuffer, imageType = 'image/jpeg') {
        try {
            // Convert buffer to base64
            const base64Image = imageBuffer.toString('base64');
            
            const result = await this.visionModel.generateContent([
                {
                    inlineData: {
                        data: base64Image,
                        mimeType: imageType
                    }
                },
                "Describe this image in detail. What do you see?"
            ]);

            const description = await result.response.text();
            return {
                success: true,
                description: description.trim()
            };
        } catch (error) {
            return {
                success: false,
                error: "Failed to analyze image"
            };
        }
    }

    // Analyze sticker
    async analyzeSticker(stickerBuffer) {
        try {
            const base64Sticker = stickerBuffer.toString('base64');
            
            const result = await this.visionModel.generateContent([
                {
                    inlineData: {
                        data: base64Sticker,
                        mimeType: 'image/webp'
                    }
                },
                "This is a WhatsApp sticker. Describe what you see and the emotion it might represent."
            ]);

            const analysis = await result.response.text();
            return {
                success: true,
                analysis: analysis.trim()
            };
        } catch (error) {
            return {
                success: false,
                error: "Failed to analyze sticker"
            };
        }
    }

    // Google search integration (via Gemini)
    async webSearch(query) {
        try {
            const result = await this.model.generateContent(`
                Perform a web search for: "${query}"
                Provide current, accurate information.
                Include relevant details and cite sources if possible.
                Keep it concise but informative.
            `);
            
            const searchResults = await result.response.text();
            return {
                success: true,
                results: searchResults.trim(),
                query: query
            };
        } catch (error) {
            return {
                success: false,
                error: "Search service unavailable"
            };
        }
    }

    // Enhanced response generation with memory context
    async generateResponse(message, userName = "Friend", memoryContext = "", conversationHistory = []) {
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
                return `${emoji} I'd prefer not to discuss my creation details. Let's talk about something more interesting!`;
            }

            // Smart greeting based on context
            if (this.isGreeting(message) && conversationHistory.length === 0) {
                return this.generateSmartGreeting(userName, language, emoji);
            }

            // Build context-aware prompt
            const contextPrompt = this.buildContextPrompt(message, userName, language, memoryContext, conversationHistory);

            const result = await this.model.generateContent(contextPrompt);
            const response = await result.response.text();
            let text = response.trim();

            // Ensure response ends with appropriate emoji
            if (!/(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)/gu.test(text)) {
                text += ` ${emoji}`;
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

    isGreeting(message) {
        const greetings = ['hello', 'hi', 'hey', 'halo', 'ayubowan', 'nahame', 'කොහොමද', 'ආයුබෝවන්'];
        return greetings.some(greet => message.toLowerCase().includes(greet)) && message.length < 25;
    }

    generateSmartGreeting(userName, language, emoji) {
        const greetings = {
            english: [
                `${emoji} Hey ${userName}! Great to see you! How can I help you today?`,
                `${emoji} Hello ${userName}! What's on your mind?`,
                `${emoji} Hi there ${userName}! Ready for a chat?`
            ],
            sinhala: [
                `${emoji} ආයුබෝවන් ${userName}! ඔබට මට කෙසේ උදව් කළ හැකිද?`,
                `${emoji} Hello ${userName}! අද ඔබට කුමන උදව්වක් අවශ්‍යද?`,
                `${emoji} Hi ${userName}! කොහොමද? සුදුසුකමක් ද?`
            ],
            singlish: [
                `${emoji} Ayubowan ${userName}! How can I help you machan?`,
                `${emoji} Hello ${userName}! කොහොමද? What's up?`,
                `${emoji} Hi there ${userName}! Ready for a chat? 😊`
            ]
        };

        const langGreetings = greetings[language] || greetings.english;
        return langGreetings[Math.floor(Math.random() * langGreetings.length)];
    }

    buildContextPrompt(message, userName, language, memoryContext, conversationHistory) {
        const basePrompt = {
            english: `You are Malith Lakshan's personal AI assistant. You're friendly, helpful, and emotionally intelligent.

CRITICAL RULES:
1. When asked "Who made you?" ALWAYS respond: "I was created by Malith Lakshan! 🚀 Contact: 94741907061"
2. Use emojis naturally in your responses
3. Be conversational but concise
4. Adapt to user's mood and language style
5. Keep responses engaging but not too long

User: ${userName}
Language: English
Memory Context: ${memoryContext}
Recent Conversation: ${conversationHistory.slice(-3).map(conv => `${conv.role}: ${conv.content}`).join('\n')}

Current message: "${message}"

Respond naturally in English with appropriate emojis:`,

            sinhala: `ඔබ Malith Lakshan සාදන ලද AI සහායකයෙක්. ඔබ සුහදශීලී සහ උපකාරශීලී විය යුතුය.

වැදගත් රීති:
1. "ඔයාව කොහොමද හැදුවේ?" කියල අහන විට හැම වෙලේම කියන්න: "මාව හැදුවේ Malith Lakshan! 🚔 දුරකථන: 94741907061"
2. ප්‍රතිචාරවලදී emojis ස්වභාවිකව භාවිතා කරන්න
3. සංවාදශීලී සහ සුහදශීලී වන්න
4. ප්‍රතිචාර කෙටි හා සරල විය යුතුය

පරිශීලක: ${userName}
භාෂාව: සිංහල
මතක සන්දර්භය: ${memoryContext}
මෑත සංවාදය: ${conversationHistory.slice(-3).map(conv => `${conv.role}: ${conv.content}`).join('\n')}

වත්මන් පණිවිඩය: "${message}"

ස්වභාවිකව සිංහලෙන් ප්‍රතිචාර දක්වන්න, emojis එකතු කරන්න:`,

            singlish: `You are Malith Lakshan's personal AI assistant. Mix English and Sinhala naturally.

IMPORTANT RULES:
1. When asked "Who made you?" ALWAYS respond: "මාව හැදුවේ Malith Lakshan! 🚀 His number: 94741907061"
2. Use emojis naturally in responses
3. Mix English and Sinhala like real Sri Lankan conversation
4. Be casual and friendly

User: ${userName}
Language: Singlish (English + Sinhala mix)
Memory Context: ${memoryContext}
Recent Conversation: ${conversationHistory.slice(-3).map(conv => `${conv.role}: ${conv.content}`).join('\n')}

Current message: "${message}"

Respond naturally in Singlish with appropriate emojis:`
        };

        return basePrompt[language] || basePrompt.english;
    }
}

module.exports = EnhancedGeminiAI;
