
import { GoogleGenAI, Type } from "@google/genai";
import { AIExtractionResult, ReceiptConfig } from "../types";

/**
 * Basic extraction of price, cost, and category from a product image.
 */
export const extractProductInfo = async (base64Image: string, retryCount = 0): Promise<AIExtractionResult | null> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const mimeType = base64Image.includes(';') ? base64Image.split(';')[0].split(':')[1] : "image/jpeg";
    const data = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { inlineData: { mimeType, data } },
          { text: "Act as a fast POS scanner. Extract: price, cost, category. Return JSON only." }
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            price: { type: Type.NUMBER },
            cost: { type: Type.NUMBER },
            category: { type: Type.STRING },
          },
          required: ["name", "price", "cost", "category"],
        },
      },
    });

    if (!response.text) return null;
    return JSON.parse(response.text) as AIExtractionResult;
  } catch (error) {
    if (retryCount < 2) {
      console.warn(`Extraction failed, retrying... (${retryCount + 1})`);
      return extractProductInfo(base64Image, retryCount + 1);
    }
    console.error("AI Extraction failed after retries:", error);
    return null;
  }
};

/**
 * Extracts business information from a business card image.
 */
export const extractBusinessCardInfo = async (base64Image: string): Promise<Partial<ReceiptConfig> | null> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const mimeType = base64Image.includes(';') ? base64Image.split(';')[0].split(':')[1] : "image/jpeg";
    const data = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { inlineData: { mimeType, data } },
          { text: "Extract business details from this business card. Required fields: companyName, address, phone, email. Return JSON only." }
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            companyName: { type: Type.STRING },
            address: { type: Type.STRING },
            phone: { type: Type.STRING },
            email: { type: Type.STRING },
          },
          required: ["companyName", "address", "phone", "email"],
        },
      },
    });

    if (!response.text) return null;
    return JSON.parse(response.text) as Partial<ReceiptConfig>;
  } catch (error) {
    console.error("Business Card AI Extraction failed:", error);
    return null;
  }
};
