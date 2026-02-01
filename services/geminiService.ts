
import { GoogleGenAI } from "@google/genai";
import { APP_CONFIG } from "../constants";

/**
 * Hilfsfunktion für automatische Wiederholungsversuche bei API-Fehlern.
 */
async function fetchWithRetry<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const isRetryable = error.message?.includes("429") || error.status === 429 || error.message?.includes("quota");
    if (retries > 0 && isRetryable) {
      console.warn(`API Limit erreicht. Erneuter Versuch in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

/**
 * Skaliert und komprimiert Bilder massiv, um API-Fehler (400) zu vermeiden.
 */
async function optimizeImage(base64: string, maxWidth = 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // Seitenverhältnis beibehalten und auf maxWidth begrenzen
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
      if (!ctx) return reject(new Error("Canvas context failure"));
      
      // Weißer Hintergrund für JPEG-Konvertierung
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      
      // 0.7 Qualität ist ein guter Kompromiss für die KI-Analyse
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => reject(new Error("Bild konnte nicht verarbeitet werden."));
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
          { text: `Analyze this person and suggest a clothing size (XS, S, M, L, XL, XXL) for "${productName}". Return ONLY the code.` },
        ],
      },
    });

    const size = response.text?.trim().toUpperCase() || 'M';
    const validSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
    return validSizes.find(s => size.includes(s)) || 'M';
  });
}

export async function performVirtualTryOn(userBase64: string, productBase64: string, productName: string): Promise<string> {
  return fetchWithRetry(async () => {
    // Bilder nacheinander optimieren
    const optUser = await optimizeImage(userBase64, 1024);
    const optProduct = await optimizeImage(productBase64, 1024);

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

    throw new Error("KI hat kein Bild generiert. Bitte versuche es mit einem anderen Foto.");
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
