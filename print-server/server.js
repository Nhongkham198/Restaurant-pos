
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const net = require('net');
const iconv = require('iconv-lite');
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

// --- USB Library Loading (Safe Mode) ---
let escpos, escposUsb;
let isUsbAvailable = false;

try {
    escpos = require('escpos');
    escposUsb = require('escpos-usb');
    escpos.USB = escposUsb;
    isUsbAvailable = true;
    console.log('[System] USB Drivers loaded successfully.');
} catch (e) {
    console.warn('[Warning] USB Drivers not found or failed to load. USB printing will be disabled.');
    console.warn('Error details:', e.message);
}

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
                    
                    if (alpha > 128 && (r + g + b_val) / 3 < 128) {
                        isBlack = true;
                    }
                }
                
                if (isBlack) {
                    byte |= (1 << (7 - bit));
                }
            }
            data.push(byte);
        }
    }

    const header = Buffer.from([
        0x1d, 0x76, 0x30, 0x00, 
        bytesPerLine % 256, Math.floor(bytesPerLine / 256), 
        height % 256, Math.floor(height / 256)
    ]);

    return Buffer.concat([header, Buffer.from(data)]);
}

app.get('/', (req, res) => {
    res.send(`POS Print Server (Network ${isUsbAvailable ? '+ USB' : ''} Supported)`);
});

app.post('/check-printer', (req, res) => {
    const { ip, port, connectionType } = req.body;
    
    if (connectionType === 'usb') {
        if (!isUsbAvailable) {
            return res.json({ online: false, message: 'USB Driver not loaded on server' });
        }
        try {
            const devices = escpos.USB.findPrinter();
            if (devices && devices.length > 0) {
                return res.json({ online: true, message: `Found ${devices.length} USB Printer(s)` });
            } else {
                return res.json({ online: false, message: 'No USB Printer found (Check connection/Zadig)' });
            }
        } catch (e) {
            return res.json({ online: false, message: e.message });
        }
    }

    const targetHost = ip || PRINTER_CONFIG.host;
    const targetPort = port || PRINTER_CONFIG.port;

    console.log(`Checking network printer at ${targetHost}:${targetPort}...`);
    const sock = new net.Socket();
    sock.setTimeout(2500);

    sock.on('connect', () => {
        sock.destroy();
        res.json({ online: true, message: 'Online' });
    });

    sock.on('error', (err) => res.json({ online: false, message: err.message }));
    sock.on('timeout', () => {
        sock.destroy();
        res.json({ online: false, message: 'Timeout' });
    });

    sock.connect(targetPort, targetHost);
});

app.post('/print-image', async (req, res) => {
    const { image, targetPrinter, connectionType } = req.body;
    
    if (!image) {
        return res.status(400).json({ success: false, error: 'No image data provided' });
    }

    try {
        const base64Data = image.replace(/^data:image\/png;base64,/, "");
        const imageBuffer = Buffer.from(base64Data, 'base64');
        const rasterData = pngToRaster(imageBuffer);

        if (connectionType === 'usb') {
            if (!isUsbAvailable) {
                return res.status(500).json({ success: false, error: 'USB Drivers not active on server' });
            }

            console.log('[USB Print] Processing...');
            try {
                const device = new escpos.USB();
                const printer = new escpos.Printer(device);

                device.open((err) => {
                    if (err) {
                        console.error('USB Open Error:', err);
                        return res.status(500).json({ success: false, error: 'Cannot open USB printer: ' + err.message });
                    }
                    
                    // Send raw raster data using printer.adapter.write for maximum compatibility
                    printer.adapter.write(Buffer.from(COMMANDS.INIT));
                    printer.adapter.write(rasterData);
                    printer.adapter.write(Buffer.from('\n\n\n'));
                    printer.adapter.write(Buffer.from(COMMANDS.CUT));
                    
                    device.close(() => {
                        console.log('[USB Print] Success');
                        if (!res.headersSent) res.json({ success: true });
                    });
                });
            } catch (usbErr) {
                console.error('USB Printer Error:', usbErr);
                res.status(500).json({ success: false, error: usbErr.message });
            }
        } else {
            // Network Printing
            const targetHost = (targetPrinter && targetPrinter.ip) ? targetPrinter.ip : PRINTER_CONFIG.host;
            const targetPort = (targetPrinter && targetPrinter.port) ? targetPrinter.port : PRINTER_CONFIG.port;

            console.log(`[Network Print] Printing to ${targetHost}...`);
            const client = new net.Socket();
            client.setTimeout(10000);

            client.connect(targetPort, targetHost, () => {
                client.write(Buffer.from(COMMANDS.INIT));
                client.write(rasterData);
                client.write(Buffer.from('\n\n\n')); 
                client.write(Buffer.from(COMMANDS.CUT));
                client.end();
            });

            client.on('timeout', () => {
                client.destroy();
                if (!res.headersSent) res.status(500).json({ success: false, error: 'Printer Timeout' });
            });

            client.on('error', (err) => {
                if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
            });

            client.on('close', () => {
                if (!res.headersSent) res.json({ success: true });
            });
        }

    } catch (error) {
        console.error('Image Processing Error:', error);
        res.status(500).json({ success: false, error: 'Image processing failed: ' + error.message });
    }
});

app.listen(SERVER_PORT, () => {
    console.log(`\n=== POS PRINT SERVER STARTED ===`);
    console.log(`listening on port: ${SERVER_PORT}`);
    console.log(`Network Mode: Enabled`);
    console.log(`USB Mode: ${isUsbAvailable ? 'Enabled' : 'Disabled (Drivers not loaded)'}`);
    console.log(`--------------------------------`);
    if (!isUsbAvailable) {
        console.log(`NOTE: To enable USB, ensure 'usb' and 'escpos-usb' are installed correctly.`);
    }
    console.log(`================================\n`);
});
