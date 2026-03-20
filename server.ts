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
            text: `Analyze this food delivery order screenshot (e.g., Shopee Food, Grab, LineMan).
            Extract the following information:
            1. Platform: Identify the delivery platform. If there is a prominent ORANGE bar/header at the top, it is likely "ShopeeFood".
            2. Order Number: Look for a number preceded by '#' (e.g., #125).
            3. Items: Extract all food items, their quantities, and any options/notes.

            IMPORTANT: Here is the list of available menu items in the POS system:
            ${menuContext}

            Try to match the items in the image to the menu items above. 
            - IMPORTANT (LineMan): Look at the main item line (usually starts with "1x"). If it says "[เซตสุดฮิต] หมูย่างเกาหลี + ข้าวญี่ปุ่น", you MUST extract the name as "เซต หมูย่าง+ข้าวญี่ปุ่น (LineMan only)". DO NOT remove the "+ ข้าวญี่ปุ่น" part and DO NOT add "(ไม่มีข้าว)" to the name.
            - IMPORTANT (LineMan): If you see an option "หมูย่างเกาหลี - เพิ่มข้าว" followed by a bullet point "ข้าวญี่ปุ่น", this is an ADDITIONAL bowl of rice. You MUST return "ข้าวญี่ปุ่น" as a SEPARATE item in the "items" list with quantity 1, in addition to the main set item.
            - For the pork item options, if you see "หมูย่างดูโอ ย่างเกลือ", extract "ดูโอ Duo" and "ย่างเกลือ" as options for the main pork item.
            - Delivery platforms often add prefixes like "[เซตสุดฮิต]" or "[Best Seller]". Ignore these when matching.
            - If an item is definitely not in the menu, return its name as it appears in the image.

            Return ONLY a JSON object in this format:
            {
              "platform": "ShopeeFood" | "GrabFood" | "LineMan" | "Other",
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
