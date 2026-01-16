
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
        container.style.color = '#000000'; // Pure black for best contrast
        
        // Set width based on paper size (80mm ~ 576 dots, 58mm ~ 384 dots)
        // Use slightly less width to ensure safe margins
        container.style.width = paperWidth === '80mm' ? '560px' : '370px';
        container.style.fontFamily = '"Sarabun", sans-serif'; 
        container.style.padding = '15px';
        container.style.lineHeight = '1.3'; // Increase line height for readability
        container.style.fontSize = '36px'; // Increased from 22px to 36px (Big & Clear)
        container.style.fontWeight = '600'; // Semi-bold base

        // Render lines
        let htmlContent = '';
        lines.forEach(line => {
            // Handle simple formatting
            let style = '';
            let text = line;
            
            if (line.startsWith('LINEMAN #')) {
                // SPECIAL HUGE FONT FOR LINEMAN ORDER NUMBER
                style = 'font-weight: 900; font-size: 70px; text-align: center; display: block; margin: 10px 0 20px 0; line-height: 1;';
            } else if (line.includes('***')) { // Bold/Important Headers
                style = 'font-weight: 800; font-size: 42px; margin: 10px 0; display: block;';
            } else if (line.startsWith('---') || line.startsWith('===')) { // Separator
                text = '<div style="border-bottom: 3px dashed black; margin: 15px 0;"></div>';
                style = 'height: 5px; overflow: hidden;';
            } else if (line.startsWith(' ')) { // Indented (options/notes)
                // Slightly smaller but still large enough to read
                style = 'padding-left: 35px; font-size: 30px; font-weight: 500; color: #000;';
            } else if (line.includes('ออเดอร์:') || line.includes('โต๊ะ:')) {
                // Make Order # and Table # extra prominent
                style = 'font-weight: 800; font-size: 40px;';
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
                    scale: 1, // Native scale matches pixel width (1px = 1 dot)
                    useCORS: true,
                    logging: false,
                    backgroundColor: '#ffffff', // Force white background
                    onclone: (clonedDoc: Document) => {
                        // Ensure fonts are loaded in the clone if needed
                        const clonedContainer = clonedDoc.body.lastChild as HTMLElement;
                        if(clonedContainer) clonedContainer.style.visibility = 'visible';
                    }
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
        }, 150); // Increased timeout slightly for reliable font rendering
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
        if (order.orderType === 'lineman') {
            // CUSTOM HEADER FOR LINEMAN
            lines.push(`LINEMAN #${String(order.orderNumber).padStart(3, '0')}`);
            lines.push(`เวลา: ${timeString}`);
            lines.push('--------------------------------');
        } else {
            // STANDARD HEADER
            lines.push(`โต๊ะ: ${order.tableName} (${order.floor})`);
            lines.push(`ออเดอร์: #${String(order.orderNumber).padStart(3, '0')}`);
            lines.push(`เวลา: ${timeString}`);
            lines.push(`พนักงาน: ${order.placedBy}`);
            if (order.customerName) lines.push(`ลูกค้า: ${order.customerName}`);
            lines.push('--------------------------------');
        }

        // --- Items ---
        order.items.forEach((item, index) => {
            lines.push(`${index + 1}. ${item.name}`);
            
            // Only show 'Back Home' for non-LineMan orders, as LineMan implies takeaway
            if (item.isTakeaway && order.orderType !== 'lineman') {
                lines.push(`   *** กลับบ้าน ***`);
            }
            
            lines.push(`   จำนวน: x${item.quantity}`);
            
            if (item.selectedOptions && item.selectedOptions.length > 0) {
                item.selectedOptions.forEach(opt => lines.push(`   + ${opt.name}`));
            }
            if (item.notes) {
                lines.push(`   *** หมายเหตุ: ${item.notes} ***`);
            }
            if ((item.isTakeaway || order.orderType === 'lineman') && item.takeawayCutlery && item.takeawayCutlery.length > 0) {
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
                // Use a large space or separate line for price if needed
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
        throw new Error("การพิมพ์ QR Code ยังไม่รองรับในโหมดรูปภาพ");
    },

    printTest: async (ip: string, paperWidth: string, port: string, targetPrinterIp?: string, targetPrinterPort?: string): Promise<boolean> => {
        const url = `http://${ip}:${port || 3000}/print-image`;
        const lines = [
            "--- ทดสอบการพิมพ์ (แบบใหญ่) ---",
            "สวัสดีครับ / Hello World",
            "ภาษาไทยทดสอบ: กขคง",
            "สระบนล่าง: น้ำ ปู รู้",
            "วรรณยุกต์: ก้ ก๊ ก๋",
            "--------------------------------",
            "ตัวหนังสือใหญ่มองเห็นชัด!",
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
