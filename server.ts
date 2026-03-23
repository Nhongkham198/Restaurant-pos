import express from "express";
import path from "path";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

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
    
    // Robust image parsing: handle both data URLs and raw base64
    let base64Data = "";
    let mimeType = "image/jpeg"; // Default fallback

    if (imageUrl && imageUrl.includes(',')) {
      const parts = imageUrl.split(',');
      base64Data = parts[1];
      const mimePart = parts[0].split(';')[0];
      if (mimePart.includes(':')) {
        mimeType = mimePart.split(':')[1];
      }
    } else {
      base64Data = imageUrl || "";
    }

    if (!base64Data) {
      throw new Error("ไม่พบข้อมูลรูปภาพที่ถูกต้อง");
    }

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
            text: `Analyze this food delivery order screenshot (e.g., LineMan, Shopee Food, Grab).
            
            CRITICAL CONCEPT: "Block Processing" (Multi-line Context)
            1. Identify the "Main Item" which usually starts with a quantity like "1x" or "2x".
            2. All subsequent lines below a Main Item are "Options" or "Details" for that item until you reach the next Main Item (another "1x").
            3. Link these lines together.
            
            4. [Set] & Parentheses Handling: 
               - If an item starts with "[เซตสุดฮิต]" or "[Best Seller]", ignore these prefixes.
               - Ignore text inside parentheses for the main item name matching (e.g., "บิบิมบับ (ข้าวยำเกาหลี)" -> "บิบิมบับ").
               - Example: "1x [เซตสุดฮิต] บิบิมบับ (ข้าวยำเกาหลี) + ต๊อกบกกี (ต๊อกผัดซอสเกาหลี) + คิมมารี (สาหร่ายห่อวุ้นเส้นทอด)" 
                 Match to: "เซต บิบิมบับ + ต๊อกบกกี + คิมมารี (LineMan only)".
            
            5. Header & Option Filtering: 
               - Skip headers like "เครื่องเคียง", "ความสุก", "ประเภท", "ตัวเลือก", "เนื้อ", "การย่าง", "เพิ่มชีส".
               - Extract the actual values (e.g., "สามชั้น", "ย่างซอสโคชูจัง", "ไม่เพิ่มชีส").
               - If you see "ไม่เพิ่ม..." or "ไม่รับ...", extract it as an option.
            
            Extract the following information:
            1. Platform: Identify the delivery platform (LineMan, ShopeeFood, GrabFood, etc.).
            2. Order Number: Look for a number preceded by '#' (e.g., #8298).
            3. Items: Extract all food items as structured blocks.
            
            IMPORTANT: Here is the list of available menu items in the POS system:
            ${menuContext}
            
            Matching Rules:
            - (LineMan): "[เซตสุดฮิต] หมูย่างเกาหลี + ข้าวญี่ปุ่น" -> "เซต หมูย่างเกาหลี + ข้าวญี่ปุ่น (LineMan only)".
            - (LineMan): "[เซตสุดฮิต] บิบิมบับ + ต๊อกบกกี + คิมมารี" -> "เซต บิบิมบับ + ต๊อกบกกี + คิมมารี (LineMan only)".
            - (LineMan): "หมูย่างเกาหลี" WITHOUT rice/set mentioned -> "หมูย่างเกาหลี (กับข้าว)".
            
            Return ONLY a JSON object in this format:
            {
              "platform": "string",
              "orderNumber": "string",
              "items": [
                { "name": "string", "quantity": number, "options": ["string"] }
              ]
            }
            
            Strictly follow the JSON format. Do not include any markdown formatting or extra text.`
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: 4096
      }
    });

    if (!response.text) {
      throw new Error("AI returned an empty response. Please try again.");
    }

    // Clean response text in case it has markdown blocks (e.g., ```json ... ```)
    let cleanText = response.text.trim();
    if (cleanText.startsWith("```")) {
      cleanText = cleanText.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    }

    res.json(JSON.parse(cleanText));
  } catch (error: any) {
    console.error("AI Error Details:", error);
    let errorMessage = "Failed to process image";
    if (error.message && (error.message.includes("API key not valid") || error.message.includes("403"))) {
      errorMessage = "API Key ไม่ถูกต้อง หรือไม่มีสิทธิ์ใช้งาน (403 Forbidden) กรุณาตรวจสอบการตั้งค่าใน Secrets หรือ Vercel Environment Variables";
    } else if (error.message) {
      errorMessage = error.message;
    }
    res.status(500).json({ error: errorMessage, details: error.message });
  }
});

// Vite middleware สำหรับการพัฒนา
if (process.env.NODE_ENV !== "production") {
  const startDev = async () => {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  };
  startDev();
} else {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*all', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Only listen if not on Vercel
if (!process.env.VERCEL) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
