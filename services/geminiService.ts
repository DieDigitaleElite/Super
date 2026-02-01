
import { GoogleGenAI } from "@google/genai";
import { APP_CONFIG } from "../constants";

/**
 * Komprimiert und skaliert Bilder, um das API-Limit (Error 400) nicht zu sprengen.
 */
async function optimizeImage(base64: string, maxWidth = 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else {
        if (height > maxWidth) {
          width *= maxWidth / height;
          height = maxWidth;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error("Canvas failure"));
      
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error("Bild konnte nicht verarbeitet werden."));
  });
}

function getCleanBase64(dataUrl: string): string {
  return dataUrl.replace(/^data:[^;]+;base64,/, "");
}

export async function estimateSizeFromImage(userBase64: string, productName: string): Promise<string> {
  try {
    const optimized = await optimizeImage(userBase64, 800);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: APP_CONFIG.TEXT_MODEL,
      contents: {
        parts: [
          { inlineData: { data: getCleanBase64(optimized), mimeType: "image/jpeg" } },
          { text: `Analyze this person and suggest a clothing size (XS, S, M, L, XL, XXL) for "${productName}". Return ONLY the code.` },
        ],
      },
    });

    const size = response.text?.trim().toUpperCase() || 'M';
    const validSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
    return validSizes.find(s => size.includes(s)) || 'M';
  } catch (error) {
    console.error("Size Error:", error);
    return 'M';
  }
}

export async function performVirtualTryOn(userBase64: string, productBase64: string, productName: string): Promise<string> {
  try {
    const [optUser, optProduct] = await Promise.all([
      optimizeImage(userBase64, 1024),
      optimizeImage(productBase64, 1024)
    ]);

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const promptText = `
      VIRTUAL TRY-ON.
      Dress the person from image 1 with the outfit from image 2 (${productName}).
      Keep face, hair, and background identical.
      The output must be the resulting image only.
    `;

    const response = await ai.models.generateContent({
      model: APP_CONFIG.IMAGE_MODEL,
      contents: {
        parts: [
          { inlineData: { data: getCleanBase64(optUser), mimeType: "image/jpeg" } },
          { inlineData: { data: getCleanBase64(optProduct), mimeType: "image/jpeg" } },
          { text: promptText },
        ],
      },
      config: {
        temperature: 0.1
      }
    });

    if (response.candidates?.[0]?.finishReason === 'SAFETY') {
      throw new Error("Das Bild wurde aus Sicherheitsgründen blockiert. Bitte wähle ein neutraleres Foto.");
    }

    const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (part?.inlineData?.data) {
      return `data:image/jpeg;base64,${part.inlineData.data}`;
    }

    throw new Error("KI hat kein Bild generiert. Bitte versuche es mit einem schärferen Foto.");
  } catch (error: any) {
    console.error("TryOn Error:", error);
    if (error.message?.includes("400")) throw new Error("Bilddaten zu groß oder ungültig. Bitte anderes Foto wählen.");
    throw error;
  }
}

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
  });
}

export async function urlToBase64(url: string): Promise<string> {
  if (url.startsWith('data:')) return url;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error("Canvas fail"));
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = () => reject(new Error("Produktbild Download fehlgeschlagen"));
    img.src = `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=1024&output=jpg`;
  });
}
