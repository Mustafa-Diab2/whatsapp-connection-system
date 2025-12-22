import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "./supabase";

const apiKey = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);

// Models
const chatModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });

export const ai = {
    async generateReply(prompt: string, history: any[] = []) {
        try {
            // Convert history to Gemini format
            const formattedHistory = history.map(msg => ({
                role: msg.role === 'user' ? 'user' : 'model',
                parts: [{ text: msg.parts ? msg.parts[0].text : (msg.content || "") }],
            }));

            const chat = chatModel.startChat({
                history: formattedHistory,
                generationConfig: {
                    maxOutputTokens: 500,
                },
            });

            const result = await chat.sendMessage(prompt);
            const response = await result.response;
            return response.text();
        } catch (error) {
            console.error("AI Generation Error:", error);
            throw error;
        }
    },

    async generateEmbedding(text: string): Promise<number[]> {
        try {
            const result = await embeddingModel.embedContent(text);
            const embedding = result.embedding;
            return embedding.values;
        } catch (error) {
            console.error("AI Embedding Error:", error);
            throw error;
        }
    },

    async generateRAGReply(userMessage: string, history: any[], organizationId: string, systemPrompt: string) {
        try {
            // 1. Generate embedding for user message
            const embedding = await this.generateEmbedding(userMessage);

            // 2. Search for relevant documents
            const docs = await db.searchDocuments(embedding, 0.5, 3, organizationId);

            // 3. Construct context string
            const contextText = docs.map((doc: any) => doc.content).join("\n\n");

            console.log(`[RAG] Found ${docs.length} relevant documents for Org ${organizationId}`);

            // 4. Augmented Prompt
            // We prepend the system prompt and context to the message or use it as system instruction if possible.
            // For now, we'll combine it into a "system" like message at the start or just rely on the prompt passed to generateReply

            const finalPrompt = `
            ${systemPrompt}
            
            Instruction:
            You are a smart and helpful AI assistant for a business using WhatsApp.
            Use the provided CONTEXT below to answer the user's question accurately.
            - If the answer is found in the CONTEXT, use it.
            - If the answer is partially found, use what you have and politely suggest contacting support for more details.
            - If the answer is NOT in the CONTEXT, you may use your general knowledge ONLY if it's a general greeting or simple question. Otherwise, politely state that you don't have that information.
            - Answer in the same language and tone as the user (usually Arabic or English).
            - Keep your response concise and suitable for WhatsApp (avoid long paragraphs).
            
            CONTEXT:
            ${contextText}
            
            USER QUESTION:
            ${userMessage}
            `;

            // Pass empty history here if we want to rely solely on the constructed prompt, OR pass history 
            // If we pass history, we should send the finalPrompt as the NEW message.
            return this.generateReply(finalPrompt, history);

        } catch (error) {
            console.error("RAG Generation Error:", error);
            // Fallback to normal generation
            return this.generateReply(userMessage, history);
        }
    }
};
