import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

function checkApiKey() {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY") {
    throw new Error("Gemini API Key is not configured. Please add it to the Secrets panel.");
  }
}

export async function generateStudyNotes(topic: string, language: string = 'English') {
  checkApiKey();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Generate comprehensive study notes for the topic: "${topic}" in ${language}. 
      Use Markdown formatting with clear headings, bullet points, and bold text for key terms. 
      Include a summary section at the end.`,
      config: {
        systemInstruction: "You are an expert educational content creator. Your notes are clear, concise, and highly informative.",
      },
    });

    return response.text;
  } catch (error: any) {
    console.error("Error generating notes:", error);
    throw new Error(error.message || "Failed to generate study notes.");
  }
}

export async function generateQuiz(topic: string, language: string = 'English') {
  checkApiKey();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Generate a 5-question multiple-choice quiz about: "${topic}" in ${language}.`,
      config: {
        systemInstruction: "You are a quiz master. Provide challenging but fair questions with clear explanations for the correct answers.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              correctAnswer: { type: Type.STRING },
              explanation: { type: Type.STRING }
            },
            required: ["question", "options", "correctAnswer", "explanation"]
          }
        }
      },
    });

    return JSON.parse(response.text);
  } catch (error: any) {
    console.error("Error generating quiz:", error);
    throw new Error(error.message || "Failed to generate quiz.");
  }
}
