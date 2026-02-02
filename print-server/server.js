
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

// --- PRINT QUEUE SYSTEM ---
// ระบบคิวเพื่อป้องกันการพิมพ์ชนกันเมื่อใช้เครื่องพิมพ์เดียวกัน
const printQueue = [];
let isProcessingQueue = false;

// Updated executePrintJob with Retry Logic
const executePrintJob = async (job) => {
    const { imageBuffer, connectionType, targetPrinter } = job;
    const rasterData = pngToRaster(imageBuffer);
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 2500; // 2.5 seconds

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            await new Promise((resolve, reject) => {
                if (connectionType === 'usb') {
                     if (!isUsbAvailable) return reject(new Error('USB Drivers not active'));
                     
                     try {
                        // Support Specific USB Device Targeting
                        let device;
                        if (targetPrinter && targetPrinter.vid && targetPrinter.pid) {
                            // Parse hex strings if necessary (e.g., "0x04b8" or "04b8")
                            const vid = parseInt(targetPrinter.vid.replace('0x', ''), 16);
                            const pid = parseInt(targetPrinter.pid.replace('0x', ''), 16);
                            console.log(`[USB Print] Targeting VID: 0x${vid.toString(16)} PID: 0x${pid.toString(16)}`);
                            device = new escpos.USB(vid, pid);
                        } else {
                            // Fallback to auto-detect first printer
                            console.log(`[USB Print] Auto-detecting first USB printer...`);
                            device = new escpos.USB();
                        }

                        if (!device) return reject(new Error('USB Device initialization failed'));

                        const printer = new escpos.Printer(device);
                        
                        device.open((err) => {
                            if (err) return reject(new Error('Cannot open USB printer (Check Zadig/WinUSB): ' + err.message));
                            
                            try {
                                console.log('[USB Print] Connection opened, sending data...');
                                // FIX: Use chaining and callback on the LAST write to ensure data is flushed before closing
                                printer.adapter
                                    .write(Buffer.from(COMMANDS.INIT))
                                    .write(rasterData)
                                    .write(Buffer.from('\n\n\n'))
                                    .write(Buffer.from(COMMANDS.CUT), () => {
                                        // This callback fires after the last write is acknowledged by the underlying driver
                                        console.log('[USB Print] Data transferred. Closing connection...');
                                        // Small timeout to let the hardware buffer catch up if needed
                                        setTimeout(() => {
                                            device.close(() => {
                                                console.log('[USB Print] Success - Connection Closed');
                                                resolve();
                                            });
                                        }, 200); 
                                    });
                                    
                            } catch (writeErr) {
                                device.close();
                                reject(writeErr);
                            }
                        });
                     } catch (e) { reject(e); }
                } else {
                    // Network Printing
                    const targetHost = (targetPrinter && targetPrinter.ip) ? targetPrinter.ip : PRINTER_CONFIG.host;
                    const targetPort = (targetPrinter && targetPrinter.port) ? targetPrinter.port : PRINTER_CONFIG.port;
                    
                    console.log(`[Network Print] Printing to ${targetHost}:${targetPort} (Attempt ${attempt}/${MAX_RETRIES})`);
                    const client = new net.Socket();
                    client.setTimeout(5000); // 5s timeout per attempt
                    
                    let handled = false;
                    const handleError = (err) => {
                        if (handled) return;
                        handled = true;
                        client.destroy();
                        reject(err);
                    };

                    client.connect(targetPort, targetHost, () => {
                        client.write(Buffer.from(COMMANDS.INIT));
                        client.write(rasterData);
                        client.write(Buffer.from('\n\n\n')); 
                        client.write(Buffer.from(COMMANDS.CUT));
                        client.end();
                    });

                    client.on('timeout', () => handleError(new Error('Printer Connection Timeout')));
                    client.on('error', (err) => handleError(err));
                    
                    client.on('close', (hadError) => {
                        if (!handled && !hadError) {
                            handled = true;
                            resolve();
                        }
                    });
                }
            });
            
            // If Promise resolved, the job is done.
            return;

        } catch (error) {
            console.error(`[Print] Attempt ${attempt} failed: ${error.message}`);
            if (attempt === MAX_RETRIES) throw error; // Re-throw if it was the last attempt
            
            // Wait before retrying
            await new Promise(r => setTimeout(r, RETRY_DELAY));
        }
    }
};

const processQueue = async () => {
    if (isProcessingQueue || printQueue.length === 0) return;
    
    isProcessingQueue = true;
    const job = printQueue.shift(); // Get the next job

    try {
        await executePrintJob(job);
        // Respond success to the frontend ONLY after the job is processed
        if (!job.res.headersSent) job.res.json({ success: true });
    } catch (error) {
        console.error('Print Job Failed:', error.message);
        if (!job.res.headersSent) job.res.status(500).json({ success: false, error: error.message });
    } finally {
        isProcessingQueue = false;
        // Add a small delay to let the printer reset/buffer clear before next job
        setTimeout(() => {
            processQueue(); 
        }, 1000);
    }
};

app.get('/', (req, res) => {
    res.send(`POS Print Server (Network ${isUsbAvailable ? '+ USB' : ''} Supported) - Queue Active: ${printQueue.length}`);
});

// NEW: Endpoint to scan and list all connected USB printers
app.get('/scan-usb', (req, res) => {
    if (!isUsbAvailable) {
        return res.status(500).json({ success: false, error: 'USB Drivers not loaded' });
    }
    try {
        // escpos.USB.findPrinter() returns an array of Device objects
        const devices = escpos.USB.findPrinter();
        
        // Map to a cleaner format for the frontend
        const printerList = devices.map(device => {
            // Depending on the OS/Driver, these properties might vary slightly, but usually found in deviceDescriptor
            const desc = device.deviceDescriptor || {};
            return {
                vid: '0x' + (desc.idVendor ? desc.idVendor.toString(16).padStart(4, '0') : '????'),
                pid: '0x' + (desc.idProduct ? desc.idProduct.toString(16).padStart(4, '0') : '????'),
                manufacturer: '', 
                product: '' 
            };
        });
        
        res.json({ success: true, devices: printerList });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/check-printer', (req, res) => {
    const { ip, port, connectionType, vid, pid } = req.body;
    
    if (connectionType === 'usb') {
        if (!isUsbAvailable) {
            return res.json({ online: false, message: 'USB Driver not loaded on server' });
        }
        try {
            // If specific VID/PID provided, check specifically for it
            if (vid && pid) {
                const targetVid = parseInt(vid.replace('0x', ''), 16);
                const targetPid = parseInt(pid.replace('0x', ''), 16);
                const device = new escpos.USB(targetVid, targetPid);
                // Try to just instantiate it (checking existence)
                if (device) {
                     return res.json({ online: true, message: `Found Printer (VID:${vid}, PID:${pid})` });
                }
                return res.json({ online: false, message: `Printer (VID:${vid}, PID:${pid}) Not Found` });
            }

            // Otherwise, check for ANY printer
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

app.post('/print-image', (req, res) => {
    const { image, targetPrinter, connectionType } = req.body;
    
    if (!image) {
        return res.status(400).json({ success: false, error: 'No image data provided' });
    }

    try {
        const base64Data = image.replace(/^data:image\/png;base64,/, "");
        const imageBuffer = Buffer.from(base64Data, 'base64');

        // Add job to queue instead of processing immediately
        console.log(`[Queue] Added new print job. Queue size: ${printQueue.length + 1}`);
        printQueue.push({ res, imageBuffer, connectionType, targetPrinter });
        
        processQueue();

    } catch (error) {
        console.error('Request Error:', error);
        res.status(500).json({ success: false, error: 'Request failed: ' + error.message });
    }
});

app.listen(SERVER_PORT, () => {
    console.log(`\n=== POS PRINT SERVER STARTED ===`);
    console.log(`listening on port: ${SERVER_PORT}`);
    console.log(`Network Mode: Enabled`);
    console.log(`USB Mode: ${isUsbAvailable ? 'Enabled' : 'Disabled (Drivers not loaded)'}`);
    console.log(`Queue System: Active`);
    console.log(`--------------------------------`);
    if (!isUsbAvailable) {
        console.log(`NOTE: To enable USB, ensure 'usb' and 'escpos-usb' are installed correctly.`);
    }
    console.log(`================================\n`);
});
