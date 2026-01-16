
import type { ActiveOrder, KitchenPrinterSettings, Table, CompletedOrder, CashierPrinterSettings } from '../types';

declare global {
    interface Window {
        html2canvas: any;
    }
}

// Helper to generate an image from text lines using HTML/Canvas
const generateReceiptImage = async (lines: string[], paperWidth: '58mm' | '80mm'): Promise<string> => {
    return new Promise((resolve, reject) => {
        // Create a hidden container
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.top = '-9999px';
        container.style.left = '-9999px';
        container.style.backgroundColor = 'white';
        container.style.color = 'black';
        // Set width based on paper size (80mm ~ 576 dots, 58mm ~ 384 dots)
        // We use slightly less to ensure margins
        container.style.width = paperWidth === '80mm' ? '550px' : '370px';
        container.style.fontFamily = '"Sarabun", sans-serif'; // Use the Thai font we loaded
        container.style.padding = '10px';
        container.style.lineHeight = '1.2';
        container.style.fontSize = '22px'; // Readable size
        container.style.fontWeight = '500';

        // Render lines
        let htmlContent = '';
        lines.forEach(line => {
            // Handle simple formatting
            let style = '';
            let text = line;
            
            if (line.includes('***')) { // Bold/Important
                style = 'font-weight: bold; font-size: 24px; margin: 5px 0;';
            } else if (line.startsWith('---') || line.startsWith('===')) { // Separator
                text = '<div style="border-bottom: 2px dashed black; margin: 10px 0;"></div>';
                style = 'height: 2px; overflow: hidden;';
            } else if (line.startsWith(' ')) { // Indented (options)
                style = 'padding-left: 20px; font-size: 20px; color: #333;';
            }

            if (text.startsWith('<div')) {
                htmlContent += text;
            } else {
                htmlContent += `<div style="${style} white-space: pre-wrap;">${text}</div>`;
            }
        });

        container.innerHTML = htmlContent;
        document.body.appendChild(container);

        // Wait a tiny bit for fonts to settle (safety) then capture
        setTimeout(() => {
            if (window.html2canvas) {
                window.html2canvas(container, {
                    scale: 1, // Native scale matches pixel width
                    useCORS: true,
                    logging: false,
                    backgroundColor: '#ffffff' // Force white background
                }).then((canvas: HTMLCanvasElement) => {
                    const base64 = canvas.toDataURL('image/png');
                    document.body.removeChild(container);
                    resolve(base64);
                }).catch((err: any) => {
                    document.body.removeChild(container);
                    reject(err);
                });
            } else {
                document.body.removeChild(container);
                reject(new Error("html2canvas library not found"));
            }
        }, 100);
    });
};

export const printerService = {
    /**
     * Prints Kitchen Order by converting text to image first (Best for Thai)
     * Now consolidates all items into ONE slip for performance and paper saving.
     */
    printKitchenOrder: async (order: ActiveOrder, config: KitchenPrinterSettings): Promise<void> => {
        if (!config.ipAddress) {
            throw new Error("ไม่ได้ตั้งค่า IP ของเครื่องพิมพ์ครัว");
        }

        const url = `http://${config.ipAddress}:${config.port || 3000}/print-image`;
        const timeString = new Date(order.orderTime).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        
        const lines: string[] = [];

        // --- Header ---
        lines.push(`โต๊ะ: ${order.tableName} (${order.floor})`);
        lines.push(`ออเดอร์: #${String(order.orderNumber).padStart(3, '0')}`);
        lines.push(`เวลา: ${timeString}`);
        lines.push(`พนักงาน: ${order.placedBy}`);
        if (order.customerName) lines.push(`ลูกค้า: ${order.customerName}`);
        lines.push('--------------------------------');

        // --- Items ---
        order.items.forEach((item, index) => {
            lines.push(`${index + 1}. ${item.name}`);
            if (item.isTakeaway) lines.push(`   *** กลับบ้าน ***`);
            lines.push(`   จำนวน: x${item.quantity}`);
            
            if (item.selectedOptions && item.selectedOptions.length > 0) {
                item.selectedOptions.forEach(opt => lines.push(`   + ${opt.name}`));
            }
            if (item.notes) {
                lines.push(`   *** หมายเหตุ: ${item.notes} ***`);
            }
            if (item.isTakeaway && item.takeawayCutlery && item.takeawayCutlery.length > 0) {
                 const cutlery = item.takeawayCutlery.map(c => 
                    c === 'spoon-fork' ? 'ช้อนส้อม' : 
                    c === 'chopsticks' ? 'ตะเกียบ' : 
                    c === 'none' ? 'ไม่รับช้อน' : 'อื่นๆ'
                 ).join(', ');
                 lines.push(`   [รับ: ${cutlery}]`);
            }
            lines.push(' '); // Spacer
        });
        
        lines.push('--------------------------------');
        lines.push(`รวม: ${order.items.reduce((s,i)=>s+i.quantity,0)} รายการ`);

        try {
            // 1. Generate Image
            const base64Image = await generateReceiptImage(lines, config.paperWidth);

            // 2. Send Image to Backend
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // More time for image

            const payload = {
                image: base64Image,
                targetPrinter: {
                    ip: config.targetPrinterIp || '',
                    port: config.targetPrinterPort || '9100'
                }
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`Printer API responded with status ${response.status}`);
            }
        } catch (error: any) {
            console.error(`Print error:`, error);
            throw new Error("ไม่สามารถพิมพ์รูปภาพได้: " + (error.message || "Unknown error"));
        }
    },

    /**
     * Prints Customer Receipt (Image Mode)
     */
    printReceipt: async (order: CompletedOrder, config: CashierPrinterSettings, restaurantName: string): Promise<void> => {
        if (!config.ipAddress) {
            throw new Error("ไม่ได้ตั้งค่า IP ของ Print Server");
        }

        const url = `http://${config.ipAddress}:${config.port || 3000}/print-image`;
        const lines: string[] = [];
        const options = config.receiptOptions;
        const total = order.items.reduce((s, i) => s + (i.finalPrice * i.quantity), 0) + order.taxAmount;

        // Header
        if (options.printRestaurantName) lines.push(restaurantName);
        lines.push('ใบเสร็จรับเงิน (Receipt)');
        lines.push('================================');

        if (options.printOrderId) lines.push(`ออเดอร์ #: ${order.orderNumber}`);
        if (options.printTableInfo) lines.push(`โต๊ะ: ${order.tableName}`);
        if (options.printDateTime) lines.push(`วันที่: ${new Date(order.completionTime).toLocaleString('th-TH')}`);
        lines.push('--------------------------------');

        // Items
        if (options.printItems) {
            order.items.forEach(item => {
                const itemTotal = item.finalPrice * item.quantity;
                lines.push(`${item.quantity} x ${item.name}`);
                if (item.selectedOptions && item.selectedOptions.length > 0) {
                    const opts = item.selectedOptions.map(o => o.name).join(', ');
                    lines.push(`    (${opts})`);
                }
                // Alignment hack with spaces (Canvas renders spaces correctly for monospaced look if needed, but Sarabun is variable width)
                // For variable width font in image, simple right align is hard without tables.
                // We'll just put price on next line indented or same line.
                lines.push(`                      ${itemTotal.toFixed(2)}`);
            });
        }
        lines.push('--------------------------------');

        // Totals
        const subtotal = order.items.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
        if (options.printSubtotal) lines.push(`รวมเงิน:       ${subtotal.toFixed(2)}`);
        if (options.printTax && order.taxAmount > 0) lines.push(`ภาษี (${order.taxRate}%):    ${order.taxAmount.toFixed(2)}`);
        if (options.printTotal) {
            lines.push(`ยอดสุทธิ:      ${total.toFixed(2)}`);
            lines.push('================================');
        }

        // Footer
        if (options.printThankYouMessage) lines.push('ขอบคุณที่ใช้บริการ');

        try {
            const base64Image = await generateReceiptImage(lines, config.paperWidth);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            const payload = {
                image: base64Image,
                targetPrinter: {
                    ip: config.targetPrinterIp || '',
                    port: config.targetPrinterPort || '9100'
                }
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`Printer API responded with status ${response.status}`);
            }
        } catch (error: any) {
            console.error(`Print receipt error:`, error);
            throw error;
        }
    },

    printTableQRCode: async (table: Table, qrUrl: string, config: KitchenPrinterSettings): Promise<void> => {
        // Image printing for QR is tricky because we need to render the QR code image into the canvas.
        // For now, let's stick to text link or skip implementing image-based QR printing to keep complexity down, 
        // as html2canvas might taint canvas with external QR images if not careful.
        // We will just print the URL text for now or throw "Not supported in Image Mode yet".
        throw new Error("การพิมพ์ QR Code ยังไม่รองรับในโหมดรูปภาพ");
    },

    printTest: async (ip: string, paperWidth: string, port: string, targetPrinterIp?: string, targetPrinterPort?: string): Promise<boolean> => {
        const url = `http://${ip}:${port || 3000}/print-image`;
        const lines = [
            "--- ทดสอบการพิมพ์ (รูปภาพ) ---",
            "สวัสดีครับ / Hello World",
            "ภาษาไทยทดสอบ: กขคง",
            "สระบนล่าง: น้ำ ปู รู้",
            "วรรณยุกต์: ก้ ก๊ ก๋",
            "--------------------------------",
            "Image Mode Works!",
            new Date().toLocaleString('th-TH')
        ];

        try {
            const base64Image = await generateReceiptImage(lines, paperWidth as '58mm' | '80mm');
            
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: base64Image,
                    targetPrinter: {
                        ip: targetPrinterIp || '',
                        port: targetPrinterPort || '9100'
                    }
                })
            });
            
            if (!response.ok) throw new Error("Server Error");
            return true;
        } catch (e: any) {
            throw new Error(e.message);
        }
    },
    
    checkConnection: async (ip: string, port: string): Promise<boolean> => {
        if (!ip) return false;
        const url = `http://${ip}:${port || 3000}/`;
        try {
            await fetch(url, { method: 'GET', mode: 'no-cors' });
            return true;
        } catch { return false; }
    },

    checkPrinterStatus: async (serverIp: string, serverPort: string, printerIp: string, printerPort: string): Promise<{ online: boolean, message: string }> => {
        if (!serverIp || !printerIp) return { online: false, message: 'ข้อมูล IP ไม่ครบ' };
        const url = `http://${serverIp}:${serverPort || 3000}/check-printer`;
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ip: printerIp, port: printerPort || '9100' })
            });
            if (!res.ok) return { online: false, message: 'Server Error' };
            return await res.json();
        } catch {
            return { online: false, message: 'Connection Failed' };
        }
    }
};
