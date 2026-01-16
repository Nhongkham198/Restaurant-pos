
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const net = require('net');
const iconv = require('iconv-lite'); // สำหรับแปลงภาษาไทย
const fs = require('fs');
const path = require('path');

// --- โหลดการตั้งค่าจากไฟล์ config.json ---
const configPath = path.join(__dirname, 'config.json');
let PRINTER_CONFIG = {
    host: '192.168.1.200', // Default fallback
    port: 9100,
    width: 42
};

// พยายามอ่านไฟล์ config
if (fs.existsSync(configPath)) {
    try {
        const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        PRINTER_CONFIG = { ...PRINTER_CONFIG, ...savedConfig };
        console.log(`Loaded config: Printer at ${PRINTER_CONFIG.host}:${PRINTER_CONFIG.port}`);
    } catch (e) {
        console.error("Error loading config.json, using defaults.");
    }
}

const SERVER_PORT = 3000; // พอร์ตของ Server นี้ (ที่จะเอาไปใส่ในหน้าตั้งค่า POS)

const app = express();
app.use(cors()); // อนุญาตให้ Vercel เรียกใช้งานได้
app.use(bodyParser.json());

// คำสั่งมาตรฐาน ESC/POS
const ESC = '\x1b';
const GS = '\x1d';
const COMMANDS = {
    INIT: ESC + '@',
    CUT: GS + 'V' + '\x41' + '\x00',
    TEXT_NORMAL: ESC + '!' + '\x00',
    TEXT_DOUBLE_HEIGHT: ESC + '!' + '\x10',
    TEXT_DOUBLE_WIDTH: ESC + '!' + '\x20',
    TEXT_BIG: ESC + '!' + '\x30',
    ALIGN_LEFT: ESC + 'a' + '\x00',
    ALIGN_CENTER: ESC + 'a' + '\x01',
    ALIGN_RIGHT: ESC + 'a' + '\x02',
    // คำสั่งเลือก Code Page ภาษาไทย
    // เครื่องพิมพ์ส่วนใหญ่ใช้ \x15 (21) หรือ \xFF (255) สำหรับภาษาไทย
    // หากพิมพ์ไม่ออก ให้ลองแก้ \x15 เป็น \xFF หรือ \x16 ดูครับ
    CODE_PAGE_THAI: ESC + 't' + '\x15' 
};

// ฟังก์ชั่นแก้ไขสระลอย/จม สำหรับภาษาไทย (Thai Glyph Replacement)
// ช่วยให้ สระอื, ไม้เอก, ไม้โท ไม่ซ้อนทับกัน หรือลอยห่างเกินไป
function cleanThaiString(text) {
    if (!text) return '';
    
    // แปลง SARA AM (ำ) ให้เป็น นิคหิต (ํ) + สระอา (า) เพื่อการจัดวางที่ดีขึ้นในบางฟอนต์
    // text = text.replace(/ำ/g, '\u0E4D\u0E32'); 
    
    // สามารถเพิ่ม logic การสลับตำแหน่งสระบนล่างได้ที่นี่หากจำเป็น
    // แต่เบื้องต้นการใช้ Code Page ที่ถูกต้องจะแก้ปัญหาส่วนใหญ่ได้
    return text;
}

// Route สำหรับตรวจสอบว่า Server ทำงานอยู่ไหม
app.get('/', (req, res) => {
    res.send(`Print Server is Running...`);
});

// Route ใหม่: ตรวจสอบสถานะเครื่องพิมพ์ (Ping แบบ TCP)
app.post('/check-printer', (req, res) => {
    const { ip, port } = req.body;
    const targetHost = ip || PRINTER_CONFIG.host;
    const targetPort = port || PRINTER_CONFIG.port;

    console.log(`Checking printer status at ${targetHost}:${targetPort}...`);

    const sock = new net.Socket();
    sock.setTimeout(2500); // 2.5 วินาที timeout

    sock.on('connect', () => {
        console.log(`Printer at ${targetHost} is ONLINE`);
        sock.destroy();
        res.json({ online: true, message: 'เครื่องพิมพ์ออนไลน์พร้อมใช้งาน' });
    });

    sock.on('error', (err) => {
        console.error(`Printer check error: ${err.message}`);
        res.json({ online: false, message: `เชื่อมต่อไม่ได้: ${err.message}` });
    });

    sock.on('timeout', () => {
        console.error(`Printer check timeout`);
        sock.destroy();
        res.json({ online: false, message: 'หมดเวลาเชื่อมต่อ (Timeout) - เครื่องพิมพ์อาจปิดอยู่หรือคนละวงแลน' });
    });

    sock.connect(targetPort, targetHost);
});

// Route สำหรับรับคำสั่งพิมพ์จาก POS
app.post('/print', (req, res) => {
    // รับ targetPrinter จาก frontend ถ้ามี ให้ใช้ค่านี้แทน config เดิม
    const { order, paperSize, targetPrinter } = req.body;
    
    // Determine Target Printer Config
    const targetHost = (targetPrinter && targetPrinter.ip) ? targetPrinter.ip : PRINTER_CONFIG.host;
    const targetPort = (targetPrinter && targetPrinter.port) ? targetPrinter.port : PRINTER_CONFIG.port;

    console.log(`[${new Date().toLocaleTimeString()}] Received print job #${order.orderId} -> Target: ${targetHost}:${targetPort}`);

    // เชื่อมต่อกับเครื่องพิมพ์
    const client = new net.Socket();
    
    // Set a timeout of 5 seconds for connection attempt
    client.setTimeout(5000);

    client.connect(targetPort, targetHost, () => {
        console.log('Connected to printer at ' + targetHost);
        
        // 1. ส่งคำสั่งเริ่มต้น (Init)
        client.write(Buffer.from(COMMANDS.INIT));
        
        // 2. *** ส่งคำสั่งเลือกภาษาไทย (สำคัญมาก) ***
        client.write(Buffer.from(COMMANDS.CODE_PAGE_THAI));
        
        // 3. วนลูปข้อมูลแต่ละบรรทัดที่ส่งมาจาก Frontend
        if (order.items && Array.isArray(order.items)) {
            order.items.forEach(line => {
                // จัดการข้อความภาษาไทยก่อนพิมพ์
                const processedLine = cleanThaiString(line);
                
                // แปลงข้อความเป็น TIS-620 (ภาษาไทย)
                // การใช้ iconv-lite กับ tis620 จะแปลง Unicode เป็น 1-byte char ที่เครื่องพิมพ์เข้าใจ
                const encodedLine = iconv.encode(processedLine + '\n', 'tis620');
                client.write(encodedLine);
            });
        }

        // 4. ส่งคำสั่งตัดกระดาษ (Cut)
        client.write(Buffer.from('\n\n\n')); // Feed กระดาษเปล่านิดหน่อย
        client.write(Buffer.from(COMMANDS.CUT));

        // 5. ปิดการเชื่อมต่อ
        client.end();
    });

    // Handle timeout specifically
    client.on('timeout', () => {
        console.error('Printer Connection Timeout');
        client.destroy(); // Kill socket
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: `เชื่อมต่อเครื่องพิมพ์ ${targetHost} ไม่ได้ (Timeout)` });
        }
    });

    client.on('error', (err) => {
        console.error('Printer Connection Error:', err.message);
        // ส่ง Error กลับไปที่ Frontend ให้ชัดเจน
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: `ไม่สามารถเชื่อมต่อเครื่องพิมพ์ที่ ${targetHost}:${targetPort} ได้ (${err.message})` });
        }
    });

    client.on('close', () => {
        console.log('Printer connection closed');
        // ตอบกลับไปที่ POS ว่าพิมพ์สำเร็จ (ต้องตอบกลับก่อน connection ปิดจริง หรือใน callback write ก็ได้)
        if (!res.headersSent) {
             res.json({ success: true });
        }
    });
});

app.listen(SERVER_PORT, () => {
    console.log(`\n=== POS PRINT SERVER STARTED ===`);
    console.log(`listening on port: ${SERVER_PORT}`);
    console.log(`Default Printer Config: ${PRINTER_CONFIG.host}:${PRINTER_CONFIG.port}`);
    console.log(`\nวิธีใช้งาน:`);
    console.log(`1. เปิดโปรแกรม POS บนมือถือ/คอม`);
    console.log(`2. ไปที่ "ตั้งค่า" -> "เครื่องพิมพ์ครัว"`);
    console.log(`3. ใส่ IP ของคอมพิวเตอร์เครื่องนี้ (เช่น 192.168.1.xx) ในช่อง "Print Server IP"`);
    console.log(`4. ใส่ IP ของเครื่องพิมพ์จริง ในช่อง "IP เครื่องพิมพ์ (Hardware)" บนหน้าเว็บ`);
    console.log(`================================\n`);
});
