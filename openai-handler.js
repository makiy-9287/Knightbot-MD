/**
 * Gemini AI Handler
 * Processes messages and generates AI responses
 */

require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getConversationHistory } = require('./firebase-config');

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Bot personality and instructions
const SYSTEM_PROMPT = `You are a friendly AI assistant created by Malith Lakshan (phone: +94741907061). 

PERSONALITY:
- Be warm, friendly, and helpful
- Use emojis naturally to express emotions
- Understand and respond to emotional tones in messages
- Be conversational and natural

LANGUAGE CAPABILITIES:
- You MUST be fluent in Sinhala (සිංහල), English, and Singlish (mix of both)
- Automatically detect the language user is speaking and respond in the SAME language
- If user speaks Sinhala, respond in Sinhala
- If user speaks English, respond in English  
- If user speaks Singlish (mix), respond in Singlish naturally
- Never ask which language to use - just match the user's language

EMOJI USAGE:
- Read the user's emotional tone carefully
- Use appropriate emojis based on their mood:
  * Happy/Excited: 😊 😄 🎉 ✨ 💫
  * Sad/Upset: 😔 💔 🥺 😢
  * Angry: 😤 😠 💢
  * Confused: 🤔 😕 
  * Grateful: 🙏 ❤️ 💖
  * Funny: 😂 🤣 😆
  * Cool/Casual: 😎 👍 ✌️ 🔥
  * Loving: 💕 💗 🥰 😍
- Use 2-4 emojis per message naturally, not excessively

ABOUT YOUR CREATOR:
- Your creator: Malith Lakshan
- Contact: +94741907061
- If asked "who made you" or "who created you", mention Malith Lakshan
- If asked "how were you made", politely avoid technical details and say you're an AI assistant created to help people

RESPONSE STYLE:
- Keep responses natural and conversational
- Be helpful and informative
- Match the user's energy level
- Don't be too formal unless the situation requires it
- Use casual language when appropriate

Remember: Your main goal is to be a helpful, friendly companion who communicates naturally in the user's language with appropriate emotional responses! 🌟`;

/**
 * Analyze message emotion and suggest emojis
 */
function analyzeEmotion(message) {
    const msg = message.toLowerCase();
    
    // Happy emotions
    if (msg.match(/happy|glad|joy|excited|good|great|awesome|amazing|wonderful|thanks|thank you|kohomada|සතුටුයි|ස්තුතියි/i)) {
        return { emotion: 'happy', emojis: ['😊', '😄', '🎉', '✨'] };
    }
    
    // Sad emotions
    if (msg.match(/sad|sorry|upset|depressed|down|bad|terrible|මං දුකයි|කණගාටුයි/i)) {
        return { emotion: 'sad', emojis: ['😔', '💔', '🥺', '😢'] };
    }
    
    // Angry emotions
    if (msg.match(/angry|mad|furious|hate|තරහයි|කෝපයයි/i)) {
        return { emotion: 'angry', emojis: ['😤', '😠', '💢'] };
    }
    
    // Love/Affection
    if (msg.match(/love|darling|babe|honey|හිතේ|ආදරෙයි|ආදරය/i)) {
        return { emotion: 'loving', emojis: ['💕', '💗', '🥰', '😍', '❤️'] };
    }
    
    // Funny
    if (msg.match(/haha|lol|funny|joke|😂|🤣/i)) {
        return { emotion: 'funny', emojis: ['😂', '🤣', '😆'] };
    }
    
    // Confused
    if (msg.match(/confused|don't understand|what|මොකක්ද|තේරෙන්නේ නෑ/i)) {
        return { emotion: 'confused', emojis: ['🤔', '😕', '❓'] };
    }
    
    // Default neutral
    return { emotion: 'neutral', emojis: ['😊', '👍', '✨'] };
}

/**
 * Detect message language
 */
function detectLanguage(message) {
    const sinhalaPattern = /[\u0D80-\u0DFF]/;
    const hasSinhala = sinhalaPattern.test(message);
    const hasEnglish = /[a-zA-Z]/.test(message);
    
    if (hasSinhala && hasEnglish) return 'singlish';
    if (hasSinhala) return 'sinhala';
    return 'english';
}

/**
 * Generate AI response using Gemini
 */
async function generateAIResponse(userMessage, userId, userName = 'User') {
    try {
        // Detect language and emotion
        const language = detectLanguage(userMessage);
        const emotionData = analyzeEmotion(userMessage);
        
        // Get conversation history from Firebase
        const history = await getConversationHistory(userId, 5);
        
        // Build context from history
        let contextMessages = '';
        if (history.length > 0) {
            contextMessages = '\n\nRecent conversation context:\n';
            history.forEach((conv, index) => {
                contextMessages += `User: ${conv.userMessage}\nYou: ${conv.botResponse}\n`;
            });
        }
        
        // Create the model
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.0-flash-exp",
            generationConfig: {
                temperature: 0.9,
                topP: 0.95,
                topK: 40,
                maxOutputTokens: 1024,
            }
        });
        
        // Prepare the prompt with context
        const fullPrompt = `${SYSTEM_PROMPT}

Current user: ${userName}
Detected language: ${language}
User's emotional tone: ${emotionData.emotion}
Suggested emojis for this emotion: ${emotionData.emojis.join(' ')}

${contextMessages}

User's message: ${userMessage}

Instructions:
1. Respond in ${language === 'sinhala' ? 'SINHALA only' : language === 'singlish' ? 'SINGLISH (mix of Sinhala and English)' : 'ENGLISH only'}
2. Use ${emotionData.emojis.slice(0, 3).join(' ')} or similar emojis that match the ${emotionData.emotion} emotion
3. Be natural and conversational
4. Keep it friendly and helpful

Your response:`;

        // Generate response
        const result = await model.generateContent(fullPrompt);
        const response = result.response;
        let aiResponse = response.text();
        
        // Clean up response
        aiResponse = aiResponse.trim();
        
        // Ensure emojis are present
        if (!/[\u{1F300}-\u{1F9FF}]/u.test(aiResponse)) {
            aiResponse += ` ${emotionData.emojis[0]}`;
        }
        
        console.log(`✅ AI Response generated (${language}, ${emotionData.emotion})`);
        
        return {
            success: true,
            response: aiResponse,
            emotion: emotionData.emotion,
            language: language
        };
        
    } catch (error) {
        console.error('❌ Gemini API Error:', error.message);
        
        // Fallback response in case of error
        const fallbackResponses = {
            english: "Sorry, I'm having trouble processing that right now. Please try again! 😊",
            sinhala: "සමාවෙන්න, මට දැන් ඔයාගේ පණිවිඩය හැසිරවීමට ගැටළුවක් තියෙනවා. කරුණාකර නැවත උත්සාහ කරන්න! 😊",
            singlish: "Sorry yaar, මට දැන් problem එකක් තියෙනවා. Please try again! 😊"
        };
        
        const language = detectLanguage(userMessage);
        
        return {
            success: false,
            response: fallbackResponses[language] || fallbackResponses.english,
            error: error.message
        };
    }
}

/**
 * Process special commands
 */
function isSpecialCommand(message) {
    const msg = message.toLowerCase().trim();
    
    const commands = {
        'clear': /^(clear|reset|forget|new chat|නව චැට්)/i,
        'help': /^(help|උදව්|commands)/i,
        'about': /^(about|ගැන|who are you)/i
    };
    
    for (const [command, pattern] of Object.entries(commands)) {
        if (pattern.test(msg)) {
            return command;
        }
    }
    
    return null;
}

module.exports = {
    generateAIResponse,
    analyzeEmotion,
    detectLanguage,
    isSpecialCommand
};
