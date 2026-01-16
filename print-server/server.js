
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const net = require('net');
const iconv = require('iconv-lite');
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs'); // ใช้สำหรับอ่านข้อมูล Pixel ของรูปภาพ

// --- โหลดการตั้งค่าจากไฟล์ config.json ---
const configPath = path.join(__dirname, 'config.json');
let PRINTER_CONFIG = {
    host: '192.168.1.200',
    port: 9100,
    width: 42
};

if (fs.existsSync(configPath)) {
    try {
        const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        PRINTER_CONFIG = { ...PRINTER_CONFIG, ...savedConfig };
        console.log(`Loaded config: Printer at ${PRINTER_CONFIG.host}:${PRINTER_CONFIG.port}`);
    } catch (e) {
        console.error("Error loading config.json, using defaults.");
    }
}

const SERVER_PORT = 3000;

const app = express();
app.use(cors());
// เพิ่ม limit ให้รองรับรูปภาพ Base64 ขนาดใหญ่
app.use(bodyParser.json({ limit: '10mb' }));

const COMMANDS = {
    INIT: '\x1b\x40',
    CUT: '\x1d\x56\x41\x00',
};

// ฟังก์ชันแปลง PNG Buffer เป็น ESC/POS Raster Data (GS v 0)
function pngToRaster(pngBuffer) {
    const png = PNG.sync.read(pngBuffer);
    const width = png.width;
    const height = png.height;
    
    // คำนวณจำนวน Byte ต่อแถว (1 byte = 8 pixels)
    const bytesPerLine = Math.ceil(width / 8);
    const data = [];

    for (let y = 0; y < height; y++) {
        for (let b = 0; b < bytesPerLine; b++) {
            let byte = 0;
            for (let bit = 0; bit < 8; bit++) {
                const x = b * 8 + bit;
                let isBlack = false;
                
                if (x < width) {
                    const idx = (width * y + x) << 2;
                    const r = png.data[idx];
                    const g = png.data[idx + 1];
                    const b_val = png.data[idx + 2];
                    const alpha = png.data[idx + 3];
                    
                    // แปลงเป็นขาวดำ: ถ้าทึบแสงและสีเข้ม -> ดำ
                    if (alpha > 128 && (r + g + b_val) / 3 < 128) {
                        isBlack = true;
                    }
                }
                
                if (isBlack) {
                    // Set bit ที่ตรงกันเป็น 1
                    byte |= (1 << (7 - bit));
                }
            }
            data.push(byte);
        }
    }

    // Header คำสั่ง GS v 0 m xL xH yL yH
    // m = 0 (Normal)
    const header = Buffer.from([
        0x1d, 0x76, 0x30, 0x00, 
        bytesPerLine % 256, Math.floor(bytesPerLine / 256), 
        height % 256, Math.floor(height / 256)
    ]);

    return Buffer.concat([header, Buffer.from(data)]);
}

app.get('/', (req, res) => {
    res.send(`POS Print Server (Image Mode Supported)`);
});

app.post('/check-printer', (req, res) => {
    const { ip, port } = req.body;
    const targetHost = ip || PRINTER_CONFIG.host;
    const targetPort = port || PRINTER_CONFIG.port;

    console.log(`Checking printer status at ${targetHost}:${targetPort}...`);
    const sock = new net.Socket();
    sock.setTimeout(2500);

    sock.on('connect', () => {
        console.log(`Printer at ${targetHost} is ONLINE`);
        sock.destroy();
        res.json({ online: true, message: 'Online' });
    });

    sock.on('error', (err) => {
        console.error(`Check error: ${err.message}`);
        res.json({ online: false, message: err.message });
    });

    sock.on('timeout', () => {
        console.error(`Check timeout`);
        sock.destroy();
        res.json({ online: false, message: 'Timeout' });
    });

    sock.connect(targetPort, targetHost);
});

// Endpoint ใหม่สำหรับการพิมพ์รูปภาพโดยเฉพาะ (แก้ปัญหาภาษาไทย 100%)
app.post('/print-image', (req, res) => {
    const { image, targetPrinter } = req.body;
    // image: Base64 string (data:image/png;base64,...)
    
    if (!image) {
        return res.status(400).json({ success: false, error: 'No image data provided' });
    }

    const targetHost = (targetPrinter && targetPrinter.ip) ? targetPrinter.ip : PRINTER_CONFIG.host;
    const targetPort = (targetPrinter && targetPrinter.port) ? targetPrinter.port : PRINTER_CONFIG.port;

    console.log(`[Image Print] Printing to ${targetHost}...`);

    try {
        // 1. แปลง Base64 เป็น Buffer
        const base64Data = image.replace(/^data:image\/png;base64,/, "");
        const imageBuffer = Buffer.from(base64Data, 'base64');

        // 2. แปลง PNG เป็นคำสั่งเครื่องพิมพ์ (Raster Bit Image)
        const rasterData = pngToRaster(imageBuffer);

        // 3. ส่งคำสั่งไปยังเครื่องพิมพ์
        const client = new net.Socket();
        client.setTimeout(10000); // 10s timeout เพราะส่งข้อมูลเยอะ

        client.connect(targetPort, targetHost, () => {
            // Init
            client.write(Buffer.from(COMMANDS.INIT));
            // Image Data
            client.write(rasterData);
            // Feed & Cut
            client.write(Buffer.from('\n\n\n')); 
            client.write(Buffer.from(COMMANDS.CUT));
            client.end();
        });

        client.on('timeout', () => {
            console.error('Printer Connection Timeout');
            client.destroy();
            if (!res.headersSent) res.status(500).json({ success: false, error: 'Printer Timeout' });
        });

        client.on('error', (err) => {
            console.error('Printer Connection Error:', err.message);
            if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
        });

        client.on('close', () => {
            console.log('[Image Print] Success');
            if (!res.headersSent) res.json({ success: true });
        });

    } catch (error) {
        console.error('Image Processing Error:', error);
        res.status(500).json({ success: false, error: 'Image processing failed: ' + error.message });
    }
});

// Fallback endpoint เดิม (เผื่อยังมีการเรียกใช้)
app.post('/print', (req, res) => {
    // ... logic เดิม ... (ละไว้)
    // แต่แนะนำให้ใช้ /print-image แทน
    res.status(400).json({ success: false, error: 'Please update to use /print-image for better Thai support.' });
});

app.listen(SERVER_PORT, () => {
    console.log(`\n=== POS PRINT SERVER (IMAGE MODE) STARTED ===`);
    console.log(`listening on port: ${SERVER_PORT}`);
    console.log(`Features: Base64 to ESC/POS Raster`);
    console.log(`--------------------------------`);
    console.log(`IMPORTANT: Run "npm install pngjs" if you haven't.`);
    console.log(`================================\n`);
});
