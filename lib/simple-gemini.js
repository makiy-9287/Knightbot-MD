const { GoogleGenerativeAI } = require("@google/generative-ai");
const settings = require('../settings');

class SimpleGeminiAI {
    constructor() {
        this.genAI = new GoogleGenerativeAI(settings.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({ 
            model: "gemini-2.0-flash",  // Using 1.5 for longer context
           
            },
            systemInstruction: `You are  personal AI assistant. You provide detailed, comprehensive responses up to 1000 words when needed.

IMPORTANT GUIDELINES:
- When asked "Who made you?" respond: "I was created by Malith Lakshan! Contact: 94741907061"
- Provide detailed, thoughtful responses
- Use emojis sparingly and only when they add value
- Maintain conversation context and memory
- Be helpful, informative, and engaging
- Write in the same language as the user (Sinhala/English/Singlish)
- Don't hesitate to write long, comprehensive answers when the topic requires it`
        });
        
        console.log('🚀 Gemini 1.5 Flash loaded with 8192 token limit');
    }

    async generateResponse(message, userName = "User", conversationHistory = []) {
        try {
            // Build conversation context
            let context = "";
            if (conversationHistory.length > 0) {
                context = "Previous conversation:\n";
                conversationHistory.slice(-6).forEach(msg => {
                    context += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
                });
                context += "\nCurrent message: ";
            }

            const fullPrompt = `${context}"${message}"\n\nPlease provide a comprehensive response. You can write up to 1000 words if needed.`;

            const result = await this.model.generateContent(fullPrompt);
            const response = await result.response;
            let text = response.text().trim();

            // Ensure reasonable emoji usage (not too many)
            text = this.optimizeEmojis(text);

            return text;

        } catch (error) {
            console.error('Gemini Error:', error);
            return 'I apologize, but I encountered an error processing your message. Please try again.';
        }
    }

    optimizeEmojis(text) {
        // Count emojis in text
        const emojiCount = (text.match(/[\p{Emoji_Presentation}]/gu) || []).length;
        
        // If too many emojis, reduce them
        if (emojiCount > 5) {
            // Keep only first 2-3 emojis
            const emojis = text.match(/[\p{Emoji_Presentation}]/gu) || [];
            const keepEmojis = emojis.slice(0, 3);
            
            // Remove all emojis and add back only the ones to keep
            let cleanText = text.replace(/[\p{Emoji_Presentation}]/gu, '');
            if (keepEmojis.length > 0) {
                cleanText += ' ' + keepEmojis.join(' ');
            }
            
            return cleanText.trim();
        }
        
        return text;
    }

    // Simple image analysis (placeholder for now)
    async analyzeImage(imageBuffer) {
        return {
            success: true,
            description: "Image analysis feature is being enhanced. Please describe what you see or what you'd like to know about the image."
        };
    }

    // Simple image generation (placeholder)
    async generateImage(prompt) {
        return {
            success: true,
            description: `I would generate an image for: "${prompt}". Image generation feature is coming soon! 🎨`,
            note: "Use external image generation services for actual image creation"
        };
    }
}

module.exports = SimpleGeminiAI;
