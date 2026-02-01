
import { GoogleGenAI } from "@google/genai";
import { APP_CONFIG } from "../constants";

async function fetchWithRetry<T>(fn: () => Promise<T>, retries = 2, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const isRetryable = error.message?.includes("429") || error.status === 429;
    if (retries > 0 && isRetryable) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

async function optimizeImage(base64: string, maxWidth = 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; }
      } else {
        if (height > maxWidth) { width *= maxWidth / height; height = maxWidth; }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error("Canvas fail"));
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = () => reject(new Error("Bildfehler"));
  });
}

function getCleanBase64(dataUrl: string): string {
  return dataUrl.replace(/^data:[^;]+;base64,/, "");
}

export async function estimateSizeFromImage(userBase64: string, productName: string): Promise<string> {
  return fetchWithRetry(async () => {
    const optimized = await optimizeImage(userBase64, 800);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: APP_CONFIG.TEXT_MODEL,
      contents: {
        parts: [
          { inlineData: { data: getCleanBase64(optimized), mimeType: "image/jpeg" } },
          { text: `Analyze the person. Suggest size (XS-XXL) for ${productName}. Code only.` },
        ],
      },
    });
    const size = response.text?.trim().toUpperCase() || 'M';
    return ['XS', 'S', 'M', 'L', 'XL', 'XXL'].find(s => size.includes(s)) || 'M';
  });
}

export async function performVirtualTryOn(userBase64: string, productBase64: string, productName: string): Promise<string> {
  return fetchWithRetry(async () => {
    const optUser = await optimizeImage(userBase64, 1024);
    const optProduct = await optimizeImage(productBase64, 1024);

    // WICHTIG: GoogleGenAI immer frisch instanziieren für den aktuellsten Key
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const response = await ai.models.generateContent({
      model: APP_CONFIG.IMAGE_MODEL,
      contents: {
        parts: [
          { inlineData: { data: getCleanBase64(optUser), mimeType: "image/jpeg" } },
          { inlineData: { data: getCleanBase64(optProduct), mimeType: "image/jpeg" } },
          { text: `VIRTUAL TRY-ON: Dress the person in image 1 with the outfit from image 2 (${productName}). Keep person and background identical. High quality, realistic.` },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: "3:4", // Optimiert für Ganzkörperfotos
          imageSize: "1K"
        }
      }
    });

    const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (part?.inlineData?.data) {
      return `data:image/jpeg;base64,${part.inlineData.data}`;
    }
    throw new Error("KI konnte das Bild nicht generieren. Bitte versuche es erneut.");
  });
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
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => reject(new Error("Produktbild Download fehlgeschlagen"));
    img.src = `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=1024&output=jpg`;
  });
}
