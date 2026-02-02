
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const net = require('net');
const iconv = require('iconv-lite');
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const usb = require('usb'); // Direct access to usb library for scanning

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

// Helper to write to USB device with Promise (Wait for completion)
const writeDeviceAsync = (device, data) => {
    return new Promise((resolve, reject) => {
        device.write(data, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
};

// NEW: Chunked write for Network Socket (Optimized for speed)
const writeSocketChunked = async (client, data) => {
    // 8KB chunks for network seems safe
    const CHUNK_SIZE = 8192; 
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const chunk = data.slice(i, i + CHUNK_SIZE);
        const canWrite = client.write(chunk);
        if (!canWrite) {
            // Wait for drain if buffer is full
            await new Promise(resolve => client.once('drain', resolve));
        }
        // Micro delay to prevent flooding printer buffer (Reduced to 2ms for speed)
        await new Promise(resolve => setTimeout(resolve, 5));
    }
};

// NEW: Chunked write with smaller buffer size for better stability (USB)
const writeDeviceChunked = async (device, data) => {
    // Reduced chunk size to 4096 bytes (4KB) for USB to balance speed/stability
    const CHUNK_SIZE = 4096; 
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const chunk = data.slice(i, i + CHUNK_SIZE);
        await writeDeviceAsync(device, chunk);
        // Micro delay
        await new Promise(resolve => setTimeout(resolve, 5)); 
    }
};

// --- PRINT QUEUE SYSTEM ---
const printQueue = [];
let isProcessingQueue = false;

const executePrintJob = async (job) => {
    const { imageBuffer, connectionType, targetPrinter } = job;
    const rasterData = pngToRaster(imageBuffer);
    const MAX_RETRIES = 2; // Reduced retries for background processing
    const RETRY_DELAY = 1500;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            await new Promise(async (resolve, reject) => {
                if (connectionType === 'usb') {
                     if (!isUsbAvailable) return reject(new Error('USB Drivers not active'));
                     
                     try {
                        let device;
                        // Check if specific VID/PID is provided
                        if (targetPrinter && targetPrinter.vid && targetPrinter.pid) {
                            const vid = parseInt(targetPrinter.vid, 16);
                            const pid = parseInt(targetPrinter.pid, 16);
                            console.log(`[USB Print] Connecting to specific device VID: ${targetPrinter.vid}, PID: ${targetPrinter.pid}`);
                            device = new escpos.USB(vid, pid);
                        } else {
                            console.log(`[USB Print] Connecting to default/first USB device`);
                            device = new escpos.USB();
                        }

                        if (!device) return reject(new Error('USB Device instance could not be created'));

                        device.open(async (err) => {
                            if (err) return reject(new Error('Cannot open USB printer: ' + err.message));
                            
                            try {
                                console.log('[USB Print] Device opened. Preparing data...');
                                
                                // Combine commands into one large buffer
                                const combinedBuffer = Buffer.concat([
                                    Buffer.from(COMMANDS.INIT),
                                    rasterData,
                                    Buffer.from('\n\n\n'),
                                    Buffer.from(COMMANDS.CUT)
                                ]);

                                // Send the combined buffer in chunks
                                await writeDeviceChunked(device, combinedBuffer);
                                
                                console.log(`[USB Print] Sent ${combinedBuffer.length} bytes.`);
                                
                                // Wait 1 second before closing
                                setTimeout(() => {
                                    try {
                                        device.close(() => {
                                            console.log('[USB Print] Connection closed cleanly.');
                                            resolve();
                                        });
                                    } catch (closeErr) {
                                        console.warn('[USB Print] Warning during close:', closeErr.message);
                                        resolve(); // Treat as success even if close throws
                                    }
                                }, 1000); 
                                
                            } catch (writeErr) {
                                console.error('[USB Print] Write error:', writeErr);
                                try { device.close(); } catch(e){}
                                reject(writeErr);
                            }
                        });
                     } catch (e) { reject(e); }
                } else {
                    // Network Printing
                    const targetHost = (targetPrinter && targetPrinter.ip) ? targetPrinter.ip : PRINTER_CONFIG.host;
                    const targetPort = (targetPrinter && targetPrinter.port) ? targetPrinter.port : PRINTER_CONFIG.port;
                    
                    if (!targetHost) {
                        return reject(new Error('Target Printer IP is missing'));
                    }

                    console.log(`[Network Print] Printing to ${targetHost}:${targetPort} (Attempt ${attempt}/${MAX_RETRIES})`);
                    const client = new net.Socket();
                    client.setTimeout(15000); // 15s timeout
                    
                    let handled = false;
                    const handleError = (err) => {
                        if (handled) return;
                        handled = true;
                        client.destroy();
                        reject(err);
                    };

                    client.connect(targetPort, targetHost, async () => {
                        try {
                            const combinedBuffer = Buffer.concat([
                                Buffer.from(COMMANDS.INIT),
                                rasterData,
                                Buffer.from('\n\n\n'),
                                Buffer.from(COMMANDS.CUT)
                            ]);
                            
                            // Send in chunks
                            await writeSocketChunked(client, combinedBuffer);
                            
                            // Wait for data to flush before ending
                            // Add a small delay before closing to ensure printer receives everything
                            setTimeout(() => {
                                client.end();
                            }, 500);
                        } catch (err) {
                            handleError(err);
                        }
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
            return; // Job Done

        } catch (error) {
            console.error(`[Print] Attempt ${attempt} failed: ${error.message}`);
            if (attempt === MAX_RETRIES) throw error;
            await new Promise(r => setTimeout(r, RETRY_DELAY));
        }
    }
};

const processQueue = async () => {
    if (isProcessingQueue || printQueue.length === 0) return;
    
    isProcessingQueue = true;
    const job = printQueue.shift();

    try {
        // Execute print job (background)
        await executePrintJob(job);
        console.log('[Queue] Job completed successfully.');
    } catch (error) {
        console.error('[Queue] Job failed permanently:', error.message);
    } finally {
        isProcessingQueue = false;
        // Check for next job
        setTimeout(() => { processQueue(); }, 500);
    }
};

app.get('/', (req, res) => {
    res.send(`POS Print Server (Network ${isUsbAvailable ? '+ USB' : ''} Supported) - Queue Active: ${printQueue.length}`);
});

// NEW: Endpoint to scan connected USB devices
app.get('/scan-usb', (req, res) => {
    if (!isUsbAvailable) {
        return res.status(500).json({ error: 'USB Drivers not loaded' });
    }
    try {
        const devices = usb.getDeviceList();
        
        // Map to simple objects
        const printerCandidates = devices.map(d => {
            try {
                return {
                    vid: '0x' + d.deviceDescriptor.idVendor.toString(16).padStart(4, '0'),
                    pid: '0x' + d.deviceDescriptor.idProduct.toString(16).padStart(4, '0'),
                    busNumber: d.busNumber,
                    deviceAddress: d.deviceAddress
                };
            } catch (err) {
                return null;
            }
        }).filter(d => d !== null);
            
        res.json({ devices: printerCandidates });
    } catch (e) {
        console.error("Scan Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/check-printer', (req, res) => {
    const { ip, port, connectionType, vid, pid } = req.body;
    
    if (connectionType === 'usb') {
        if (!isUsbAvailable) {
            return res.json({ online: false, message: 'USB Driver not loaded on server' });
        }
        try {
            if (vid && pid) {
                const targetVid = parseInt(vid, 16);
                const targetPid = parseInt(pid, 16);
                const devices = usb.getDeviceList();
                const found = devices.some(d => d.deviceDescriptor.idVendor === targetVid && d.deviceDescriptor.idProduct === targetPid);
                
                if (found) {
                    return res.json({ online: true, message: `Found USB Device (${vid}:${pid})` });
                } else {
                    return res.json({ online: false, message: `Device ${vid}:${pid} not connected` });
                }
            } 
            
            const devices = escpos.USB.findPrinter();
            if (devices && devices.length > 0) {
                return res.json({ online: true, message: `Found ${devices.length} USB Printer(s)` });
            } else {
                return res.json({ online: false, message: 'No USB Printer found' });
            }
        } catch (e) {
            return res.json({ online: false, message: e.message });
        }
    }

    // Network Check
    const targetHost = ip || PRINTER_CONFIG.host;
    const targetPort = port || PRINTER_CONFIG.port;
    
    if (!targetHost) {
        return res.json({ online: false, message: 'Missing IP Address' });
    }

    const sock = new net.Socket();
    sock.setTimeout(2500);
    sock.on('connect', () => { sock.destroy(); res.json({ online: true, message: 'Online' }); });
    sock.on('error', (err) => res.json({ online: false, message: err.message }));
    sock.on('timeout', () => { sock.destroy(); res.json({ online: false, message: 'Timeout' }); });
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

        // --- FIRE AND FORGET IMPLEMENTATION ---
        // 1. Send Success Response Immediately
        res.json({ success: true, message: 'Job queued successfully' });

        // 2. Add to Queue for background processing
        console.log(`[Queue] Added new print job. Queue size: ${printQueue.length + 1}`);
        
        // Push object WITHOUT 'res' (Response is already sent)
        printQueue.push({ imageBuffer, connectionType, targetPrinter });
        
        // Trigger background processing
        processQueue();

    } catch (error) {
        console.error('Request Error:', error);
        // Only send error if we haven't responded yet (though unlikely here)
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: 'Request failed: ' + error.message });
        }
    }
});

app.listen(SERVER_PORT, () => {
    console.log(`\n=== POS PRINT SERVER STARTED ===`);
    console.log(`listening on port: ${SERVER_PORT}`);
    console.log(`Network Mode: Enabled`);
    console.log(`USB Mode: ${isUsbAvailable ? 'Enabled' : 'Disabled (Drivers not loaded)'}`);
    console.log(`================================\n`);
});
