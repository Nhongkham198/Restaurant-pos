import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = 3000;

async function startServer() {

  app.use(express.json());

  // --- ตัวอย่างการสร้าง API ฟรีของคุณเอง ---
  // คุณสามารถเพิ่ม API ใหม่ๆ ได้ที่นี่
  app.get("/api/hello", (req, res) => {
    res.json({ message: "สวัสดี! นี่คือ API ฟรีที่คุณสร้างขึ้นเอง" });
  });

  // API สำหรับอ่านออเดอร์ (ย้ายมาไว้ฝั่ง Server เพื่อความปลอดภัยของ API Key)
  app.post("/api/read-order", async (req, res) => {
    const { imageUrl, menuContext } = req.body;
    
    const apiKey = (process.env.GEMINI_API_KEY2 || process.env.GEMINI_API_KEY || process.env.API_KEY || "").trim();
    console.log("API Key present:", !!apiKey);
    if (apiKey) {
      console.log("API Key preview:", apiKey.substring(0, 10) + "...");
    }
    
    if (!apiKey || apiKey === "YOUR_API_KEY") {
      return res.status(500).json({ error: "API Key is not configured correctly on server. Please check your Secrets." });
    }

    try {
      const ai = new GoogleGenAI({ apiKey: apiKey });
      const base64Data = imageUrl.split(',')[1];
      const mimeType = imageUrl.split(';')[0].split(':')[1];

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType
              }
            },
            {
              text: `Analyze this food delivery order screenshot (e.g., Shopee Food, Grab, LineMan).
              Extract the following information:
              1. Platform: Identify the delivery platform. If there is a prominent ORANGE bar/header at the top, it is likely "ShopeeFood".
              2. Order Number: Look for a number preceded by '#' (e.g., #125).
              3. Items: Extract all food items, their quantities, and any options/notes.

              IMPORTANT: Here is the list of available menu items in the POS system:
              ${menuContext}

              Try to match the items in the image to the menu items above. If an item is slightly different (e.g., "ซุปตุ๊กบู" vs "ซุปดุ๊กบลู"), use the name from the POS menu. If an item is definitely not in the menu, return its name as it appears in the image.

              Return ONLY a JSON object in this format:
              {
                "platform": "ShopeeFood" | "GrabFood" | "LineMan" | "Other",
                "orderNumber": "string",
                "items": [
                  { "name": "string", "quantity": number, "options": ["string"] }
                ]
              }`
            }
          ]
        },
        config: {
          responseMimeType: "application/json"
        }
      });

      if (!response.text) {
        throw new Error("AI returned an empty response. Please try again.");
      }

      res.json(JSON.parse(response.text));
    } catch (error: any) {
      console.error("AI Error Details:", error);
      // Extract a cleaner error message if possible
      let errorMessage = "Failed to process image";
      if (error.message && error.message.includes("API key not valid")) {
        errorMessage = "API Key ไม่ถูกต้อง กรุณาตรวจสอบการตั้งค่าใน Secrets";
      } else if (error.message) {
        errorMessage = error.message;
      }
      res.status(500).json({ error: errorMessage });
    }
  });

  // Vite middleware สำหรับการพัฒนา
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Only listen if not on Vercel
  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

startServer();

export default app;
