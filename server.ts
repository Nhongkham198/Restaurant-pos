import express from "express";
import path from "path";
import axios from "axios";
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
  const { imageUrl, menuContext, branchId } = req.body;
  
  let apiKey = (process.env.GEMINI_API_KEY2 || process.env.GEMINI_API_KEY || process.env.API_KEY || "").trim();
  
  // Try to fetch branch-specific API key if branchId is provided
  if (branchId) {
    try {
      const projectId = "restaurant-pos-f8bd4";
      // useFirestoreSync stores branches in 'branches/data' document under 'value' field
      const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/branches/data`;
      const branchRes = await axios.get(firestoreUrl);
      const branchesArray = branchRes.data.fields?.value?.arrayValue?.values || [];
      
      // Find the branch with matching ID
      const targetBranch = branchesArray.find((b: any) => {
        const fields = b.mapValue?.fields;
        return fields?.id?.integerValue === branchId.toString() || fields?.id?.doubleValue === branchId;
      });

      if (targetBranch) {
        const fields = targetBranch.mapValue?.fields;
        if (fields?.geminiApiKey && fields.geminiApiKey.stringValue) {
          const branchKey = fields.geminiApiKey.stringValue.trim();
          if (branchKey && branchKey !== "YOUR_API_KEY") {
            apiKey = branchKey;
            console.log(`Using branch-specific API key for branch ${branchId}`);
          }
        }
      }
    } catch (err: any) {
      console.warn(`Could not fetch branch-specific API key for branch ${branchId}:`, err.message);
      // Fallback to default apiKey
    }
  }
  
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
            text: `Analyze this food delivery order screenshot.
            
            PLATFORM IDENTIFICATION (CRITICAL):
            - LineMan: Look for GREEN accents, green buttons (e.g., "พร้อมจัดส่ง"), or the LineMan logo.
            - ShopeeFood: Look for ORANGE or RED accents, orange buttons, or the Shopee logo.
            - GrabFood: Look for GREEN/WHITE accents with a distinct Grab layout.
            - Check the top header, logos, and overall color theme carefully. Do not default to LineMan if you see orange/red.
            
            CRITICAL CONCEPT: "Bullet Point Priority"
            1. Identify the "Main Item" which usually starts with a quantity like "1x" or "2x".
            2. All subsequent lines below a Main Item that start with a bullet point (•) are the "Options" or "Choices" for that item.
            3. IGNORE any lines that are headers (e.g., "ความสุก", "ประเภท", "เพิ่มชีส", "การย่าง"). ONLY extract the values after the bullet points (•).
            
            4. STRICT MATCHING & SPLITTING:
               - You must distinguish between different types of items even if they share adjectives.
               - If a single bullet point contains multiple distinct attributes (e.g., "Meat Type" + "Cooking Style" + "Add-ons"), you MUST split them into separate strings in the "options" array.
               - Example: "• หมูย่างดูโอ ย่างซอสโคชูจัง (สันคอ+สามชั้น)" -> split into ["หมูย่างดูโอ", "ย่างซอสโคชูจัง", "(สันคอ+สามชั้น)"].
               - Example: "• สันคอหมูย่างซอสโคชูจัง" -> split into ["สันคอหมูย่าง", "ซอสโคชูจัง"].
            
            5. "No add" Handling:
               - If an option says "• ไม่เพิ่มชีส" or "• ไม่รับ...", you must extract this exact string. 
               - The system will map this to a "No add" option in the POS.
            
            6. [Set] & Parentheses Handling: 
               - If an item starts with "[เซตสุดฮิต]" or "[Best Seller]", ignore these prefixes.
               - Ignore text inside parentheses for the main item name matching (e.g., "บิบิมบับ (ข้าวยำเกาหลี)" -> "บิบิมบับ").
               - For options, keep parentheses text as a separate option if it contains important details like "(สันคอ+สามชั้น)".
            
            7. KEYWORD PRIORITY:
               - "ดูโอ" or "Duo" is a high-priority keyword for meat types. Ensure it is extracted clearly.
               - "ย่างเกลือ", "ซอสโคชูจัง", "ย่างซอส" are high-priority keywords for cooking styles.
            
            Extract the following information:
            1. Platform: Identify the delivery platform (LineMan, ShopeeFood, GrabFood, etc.).
            2. Order Number: Look for a number preceded by '#' (e.g., #1388) or a long order ID string.
            3. Items: Extract all food items as structured blocks.
            
            IMPORTANT: Here is the list of available menu items in the POS system:
            ${menuContext}
            
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
