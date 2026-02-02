
import type { ActiveOrder, KitchenPrinterSettings, Table, CompletedOrder, CashierPrinterSettings, ReceiptPrintSettings, PrinterConnectionType } from '../types';

declare global {
    interface Window {
        html2canvas: any;
    }
}

// --- Helper: Trim Whitespace from Canvas (Save Paper) ---
const trimCanvas = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    
    const width = canvas.width;
    const height = canvas.height;
    
    // Get image data
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    // Scan from bottom to top to find the first CONTENT pixel
    let foundY = -1;
    
    // Iterate rows from bottom
    for (let y = height - 1; y >= 0; y--) {
        for (let x = 0; x < width; x++) {
            const index = (y * width + x) * 4;
            const r = data[index];
            const g = data[index + 1];
            const b = data[index + 2];
            const a = data[index + 3];
            
            // Check if pixel is NOT WHITE and has opacity
            if (a > 20 && (r < 240 || g < 240 || b < 240)) {
                foundY = y;
                break;
            }
        }
        if (foundY !== -1) break;
    }
    
    // If content found, crop the canvas
    if (foundY !== -1 && foundY < height - 1) {
        // Cut extremely close to the content (only +10px padding)
        const newHeight = Math.min(foundY + 10, height);
        
        const trimmedCanvas = document.createElement('canvas');
        trimmedCanvas.width = width;
        trimmedCanvas.height = newHeight;
        const trimmedCtx = trimmedCanvas.getContext('2d');
        
        if (trimmedCtx) {
            // Fill with white first
            trimmedCtx.fillStyle = '#ffffff';
            trimmedCtx.fillRect(0, 0, width, newHeight);
            trimmedCtx.drawImage(canvas, 0, 0, width, newHeight, 0, 0, width, newHeight);
            return trimmedCanvas;
        }
    }
    
    return canvas;
};

// --- Core Generator ---
const generateImageFromHtml = async (htmlContent: string, widthPx: number): Promise<string> => {
    const container = document.createElement('div');
    
    // Use absolute positioning to isolate content
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = `${widthPx}px`;
    container.style.height = 'auto'; 
    container.style.margin = '0';
    container.style.padding = '0'; 
    container.style.backgroundColor = '#ffffff'; 
    container.style.color = '#000000';
    container.style.overflow = 'visible'; 
    
    // Use Sarabun for Thai support
    container.style.fontFamily = "'Sarabun', sans-serif"; 
    container.style.lineHeight = '1.3'; 
    container.style.setProperty('-webkit-font-smoothing', 'antialiased'); 
    
    container.innerHTML = htmlContent;
    document.body.appendChild(container);

    // Wait for fonts/images
    await document.fonts.ready;
    await new Promise(r => setTimeout(r, 200)); 

    const contentHeight = container.offsetHeight;

    try {
        if (!window.html2canvas) throw new Error("html2canvas library not loaded");

        const canvas = await window.html2canvas(container, {
            scale: 2, // High resolution
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff', 
            width: widthPx,
            height: contentHeight,
            windowWidth: widthPx,
            windowHeight: contentHeight + 100, // Extra buffer
            onclone: (clonedDoc: any) => {
                const clonedEl = clonedDoc.querySelector('div');
                if (clonedEl) {
                    clonedEl.style.height = 'auto';
                    clonedEl.style.overflow = 'visible';
                }
            }
        });
        
        // AUTO-TRIM based on non-white pixels
        const trimmedCanvas = trimCanvas(canvas);
        
        const base64 = trimmedCanvas.toDataURL('image/png');
        document.body.removeChild(container);
        return base64;
    } catch (e) {
        if (document.body.contains(container)) {
            document.body.removeChild(container);
        }
        console.error("HTML2Canvas Error:", e);
        throw e;
    }
};

export const printerService = {
    // --- 1. Kitchen Order Printing ---
    printKitchenOrder: async (order: ActiveOrder, config: KitchenPrinterSettings): Promise<void> => {
        if (!config.ipAddress) throw new Error("ไม่ได้ตั้งค่า IP ของ Print Server");

        const url = `http://${config.ipAddress}:${config.port || 3000}/print-image`;
        const paperWidthPx = config.paperWidth === '58mm' ? 370 : 560; // 58mm vs 80mm pixel width
        
        const displayOrderNumber = order.manualOrderNumber ? `#${order.manualOrderNumber}` : `#${String(order.orderNumber).padStart(3, '0')}`;
        const timeStr = new Date(order.orderTime).toLocaleTimeString('th-TH', {hour: '2-digit', minute:'2-digit'});

        // Generate Items HTML
        let itemsHtml = '';
        order.items.forEach(item => {
            const optionsHtml = item.selectedOptions?.length > 0 
                ? `<div style="font-size: 22px; color: #333; padding-left: 30px; margin-top: 2px; font-weight: normal;">+ ${item.selectedOptions.map(o => o.name).join(', ')}</div>` 
                : '';
            
            const notesHtml = item.notes 
                ? `<div style="font-size: 20px; font-weight: bold; background-color: #000; color: #fff; display: inline-block; padding: 2px 8px; border-radius: 4px; margin-top: 5px; margin-left: 30px;">Note: ${item.notes}</div>` 
                : '';
            
            const takeawayHtml = item.isTakeaway 
                ? `<div style="font-size: 20px; font-weight: 900; border: 2px solid #000; display: inline-block; padding: 2px 6px; margin-left: 30px; margin-top: 5px;">กลับบ้าน</div>` 
                : '';

            itemsHtml += `
                <div style="margin-bottom: 15px; border-bottom: 1px dotted #ccc; padding-bottom: 10px;">
                    <div style="font-size: 32px; font-weight: 900; line-height: 1.2; display: flex; align-items: start;">
                        <span style="min-width: 50px; text-align: right; margin-right: 10px;">${item.quantity}</span>
                        <span>x ${item.name}</span>
                    </div>
                    ${optionsHtml}
                    ${notesHtml}
                    ${takeawayHtml}
                </div>
            `;
        });

        // Full Kitchen Template
        const htmlContent = `
            <div style="width: 100%; box-sizing: border-box; font-family: 'Sarabun', sans-serif; color: #000; padding: 10px;">
                <div style="text-align: center; margin-bottom: 10px; border-bottom: 4px solid #000; padding-bottom: 10px;">
                    <div style="font-size: 24px; font-weight: bold;">ใบรายการอาหาร (ครัว)</div>
                    <div style="font-size: 56px; font-weight: 900; margin: 5px 0; line-height: 1;">${order.orderType === 'lineman' ? (order.tableName || 'Delivery') : `โต๊ะ ${order.tableName}`}</div>
                    ${order.orderType !== 'lineman' ? `<div style="font-size: 28px; font-weight: bold;">(${order.floor})</div>` : ''}
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; font-size: 24px; font-weight: bold; border-top: 2px solid #000; padding-top: 5px;">
                        <span>Order: ${displayOrderNumber}</span>
                        <span>เวลา: ${timeStr}</span>
                    </div>
                </div>
                
                <div style="text-align: left;">
                    ${itemsHtml}
                </div>
                
                <div style="border-top: 4px solid #000; margin-top: 10px; width: 100%; height: 1px;"></div>
                <div style="text-align: center; margin-top: 5px; font-size: 18px;">--- จบรายการ ---</div>
            </div>
        `;

        try {
            const base64Image = await generateImageFromHtml(htmlContent, paperWidthPx);
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: base64Image,
                    connectionType: config.connectionType,
                    // Pass specific hardware details to Server
                    targetPrinter: {
                        ip: config.targetPrinterIp || '',
                        port: config.targetPrinterPort || '9100',
                        vid: config.vid || '',
                        pid: config.pid || ''
                    }
                })
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `Server returned ${res.status}`);
            }
        } catch (error: any) {
            throw new Error("พิมพ์ล้มเหลว: " + error.message);
        }
    },

    // --- 2. Receipt / Check Bill Printing ---
    printReceipt: async (order: CompletedOrder, config: CashierPrinterSettings, restaurantName: string, logoUrl?: string | null): Promise<void> => {
        if (!config.ipAddress) throw new Error("ไม่ได้ตั้งค่า IP ของ Print Server");

        const url = `http://${config.ipAddress}:${config.port || 3000}/print-image`;
        const paperWidthPx = config.paperWidth === '58mm' ? 370 : 560;
        const opts = config.receiptOptions;

        // Header Logic
        let headerHtml = '';
        if (logoUrl && opts.showLogo) {
            headerHtml += `<div style="text-align: center; margin-bottom: 10px;"><img src="${logoUrl}" style="max-height: 80px; max-width: 80%;" crossOrigin="anonymous"/></div>`;
        }
        if (opts.showRestaurantName) {
            headerHtml += `<div style="font-size: 32px; font-weight: 900; line-height: 1.2; margin-bottom: 5px; text-align: center;">${restaurantName}</div>`;
        }
        if (opts.showAddress && opts.address) {
            headerHtml += `<div style="font-size: 18px; text-align: center;">${opts.address}</div>`;
        }
        if (opts.showPhoneNumber && opts.phoneNumber) {
            headerHtml += `<div style="font-size: 18px; text-align: center;">โทร: ${opts.phoneNumber}</div>`;
        }

        // Items Logic
        let itemsHtml = '';
        if (opts.showItems) {
            itemsHtml += `<table style="width: 100%; font-size: 20px; border-collapse: collapse; margin-bottom: 10px;">`;
            itemsHtml += `<tr style="border-bottom: 2px solid #000;"><th style="text-align:left; padding-bottom: 5px;">รายการ</th><th style="text-align:right; width: 40px; padding-bottom: 5px;">Qty</th><th style="text-align:right; width: 80px; padding-bottom: 5px;">รวม</th></tr>`;
            
            order.items.forEach(item => {
                const itemTotal = (item.finalPrice * item.quantity).toFixed(2);
                itemsHtml += `
                    <tr>
                        <td style="padding-top: 5px; font-weight: bold; line-height: 1.2;">
                            ${item.name}
                            ${item.selectedOptions.length > 0 ? `<div style="font-size: 16px; font-weight: normal; color: #555;">- ${item.selectedOptions.map(o=>o.name).join(', ')}</div>` : ''}
                        </td>
                        <td style="text-align: right; vertical-align: top; padding-top: 5px;">${item.quantity}</td>
                        <td style="text-align: right; vertical-align: top; padding-top: 5px;">${itemTotal}</td>
                    </tr>
                `;
            });
            itemsHtml += `</table>`;
        }

        // Totals Logic
        const subtotal = order.items.reduce((s, i) => s + i.finalPrice * i.quantity, 0);
        const total = subtotal + order.taxAmount;
        let totalsHtml = `<div style="font-size: 20px; border-top: 1px dashed #000; padding-top: 10px;">`;
        
        if (opts.showSubtotal) totalsHtml += `<div style="display: flex; justify-content: space-between;"><span>รวมเงิน</span><span>${subtotal.toFixed(2)}</span></div>`;
        if (opts.showTax && order.taxAmount > 0) totalsHtml += `<div style="display: flex; justify-content: space-between;"><span>ภาษี (${order.taxRate}%)</span><span>${order.taxAmount.toFixed(2)}</span></div>`;
        if (opts.showTotal) totalsHtml += `<div style="display: flex; justify-content: space-between; font-weight: 900; font-size: 32px; margin-top: 10px; border-top: 2px solid #000; padding-top: 5px;"><span>ยอดสุทธิ</span><span>${total.toFixed(2)}</span></div>`;
        if (opts.showPaymentMethod) {
            const method = order.paymentDetails.method === 'cash' ? 'เงินสด' : 'โอนจ่าย';
            totalsHtml += `<div style="text-align: center; margin-top: 10px; font-size: 18px;">(ชำระโดย: ${method})</div>`;
        }
        totalsHtml += `</div>`;

        // Full Receipt Template
        const htmlContent = `
            <div style="width: 100%; box-sizing: border-box; font-family: 'Sarabun', sans-serif; color: #000; padding: 10px 15px;">
                ${headerHtml}
                <div style="border-bottom: 2px dashed #000; margin: 10px 0;"></div>
                <div style="text-align: center; font-size: 24px; font-weight: bold; margin-bottom: 10px;">ใบเสร็จรับเงิน</div>
                
                <div style="font-size: 18px; margin-bottom: 10px;">
                    ${opts.showTable ? `<div>โต๊ะ: <span style="font-weight:bold; font-size: 20px;">${order.tableName}</span></div>` : ''}
                    ${opts.showOrderId ? `<div>Order: #${order.orderNumber}</div>` : ''}
                    ${opts.showDateTime ? `<div>วันที่: ${new Date(order.completionTime).toLocaleString('th-TH')}</div>` : ''}
                    ${opts.showStaff && order.completedBy ? `<div>พนักงาน: ${order.completedBy}</div>` : ''}
                </div>

                ${itemsHtml}
                ${totalsHtml}

                ${opts.showThankYouMessage && opts.thankYouMessage ? `<div style="text-align: center; margin-top: 20px; font-size: 20px; font-weight: bold;">*** ${opts.thankYouMessage} ***</div>` : ''}
            </div>
        `;

        try {
            const base64Image = await generateImageFromHtml(htmlContent, paperWidthPx);
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: base64Image,
                    connectionType: config.connectionType,
                    // Use VID/PID for Star Micronics support
                    targetPrinter: {
                        ip: config.targetPrinterIp || '',
                        port: config.targetPrinterPort || '9100',
                        vid: config.vid || '',
                        pid: config.pid || ''
                    }
                })
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `Server returned ${res.status}`);
            }
        } catch (error: any) {
            throw new Error("พิมพ์ล้มเหลว: " + error.message);
        }
    },

    // --- 3. Check Bill (Preliminary Bill) ---
    printBill: async (order: ActiveOrder, config: CashierPrinterSettings, restaurantName: string, logoUrl?: string | null): Promise<void> => {
        // ... Logic similar to printReceipt but with "CHECK BILL" title ...
        // Re-using the same structure as printReceipt for consistency
        const dummyCompletedOrder = {
            ...order,
            status: 'completed',
            completionTime: Date.now(),
            paymentDetails: { method: 'pending' },
            completedBy: order.placedBy
        } as unknown as CompletedOrder;

        // Override settings for Check Bill
        const checkBillConfig = {
            ...config,
            receiptOptions: {
                ...config.receiptOptions,
                showThankYouMessage: false, // Don't show thank you yet
                thankYouMessage: ''
            }
        };

        // We can reuse printReceipt but change the title logic inside? 
        // For simplicity, let's just create a custom HTML for Check Bill here
        const paperWidthPx = config.paperWidth === '58mm' ? 370 : 560;
        const subtotal = order.items.reduce((s, i) => s + i.finalPrice * i.quantity, 0);
        const total = subtotal + order.taxAmount;

        const htmlContent = `
            <div style="width: 100%; box-sizing: border-box; font-family: 'Sarabun', sans-serif; color: #000; padding: 10px 15px;">
                <div style="text-align: center; margin-bottom: 10px;">
                    <div style="font-size: 32px; font-weight: 900; line-height: 1.2;">${restaurantName}</div>
                    <div style="font-size: 28px; font-weight: bold; margin-top: 5px;">ใบแจ้งรายการ (Check Bill)</div>
                    <div style="font-size: 18px; color: #555;">(ยังไม่ได้ชำระเงิน)</div>
                </div>
                
                <div style="border-bottom: 2px dashed #000; margin: 10px 0;"></div>

                <div style="font-size: 20px; margin-bottom: 10px;">
                    <div>โต๊ะ: <span style="font-weight:bold; font-size: 24px;">${order.tableName}</span></div>
                    <div>Order: #${order.orderNumber}</div>
                    <div>เวลา: ${new Date().toLocaleString('th-TH')}</div>
                </div>

                <table style="width: 100%; font-size: 20px; border-collapse: collapse; margin-bottom: 10px;">
                    <tr style="border-bottom: 2px solid #000;">
                        <th style="text-align:left;">รายการ</th><th style="text-align:right;">รวม</th>
                    </tr>
                    ${order.items.map(item => `
                        <tr>
                            <td style="padding-top: 5px;">${item.quantity} x ${item.name}</td>
                            <td style="text-align: right; padding-top: 5px;">${(item.finalPrice * item.quantity).toFixed(2)}</td>
                        </tr>
                    `).join('')}
                </table>

                <div style="border-top: 2px solid #000; padding-top: 10px; margin-top: 10px;">
                    <div style="display: flex; justify-content: space-between; font-size: 20px;">
                        <span>ยอดรวม</span><span>${subtotal.toFixed(2)}</span>
                    </div>
                    ${order.taxAmount > 0 ? `<div style="display: flex; justify-content: space-between; font-size: 20px;"><span>ภาษี (${order.taxRate}%)</span><span>${order.taxAmount.toFixed(2)}</span></div>` : ''}
                    <div style="display: flex; justify-content: space-between; font-size: 36px; font-weight: 900; margin-top: 10px;">
                        <span>ยอดสุทธิ</span><span>${total.toFixed(2)}</span>
                    </div>
                </div>
            </div>
        `;

        const url = `http://${config.ipAddress}:${config.port || 3000}/print-image`;
        try {
            const base64Image = await generateImageFromHtml(htmlContent, paperWidthPx);
            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: base64Image,
                    connectionType: config.connectionType,
                    targetPrinter: {
                        ip: config.targetPrinterIp || '',
                        port: config.targetPrinterPort || '9100',
                        vid: config.vid || '',
                        pid: config.pid || ''
                    }
                })
            });
        } catch (error: any) {
            throw new Error("พิมพ์ล้มเหลว: " + error.message);
        }
    },

    // --- 4. Custom Image Print (for CashBillModal) ---
    printCustomImage: async (base64Image: string, config: CashierPrinterSettings): Promise<void> => {
        if (!config.ipAddress) throw new Error("ไม่ได้ตั้งค่า IP");
        const url = `http://${config.ipAddress}:${config.port || 3000}/print-image`;
        
        // This accepts pre-generated images (like from the edit bill modal)
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image: base64Image,
                connectionType: config.connectionType,
                targetPrinter: {
                    ip: config.targetPrinterIp || '',
                    port: config.targetPrinterPort || '9100',
                    vid: config.vid || '',
                    pid: config.pid || ''
                }
            })
        });
    },

    // --- 5. QR Code Table ---
    printTableQRCode: async (table: Table, customerUrl: string, config: KitchenPrinterSettings): Promise<void> => {
        if (!config.ipAddress) throw new Error("Printer config missing");
        
        const paperWidthPx = config.paperWidth === '58mm' ? 370 : 560;
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(customerUrl)}`;
        
        const html = `
            <div style="text-align: center; padding: 10px; font-family: 'Sarabun', sans-serif; width: 100%; box-sizing: border-box; color: #000;">
                <div style="font-size: 60px; font-weight: 900; line-height: 1;">${table.name}</div>
                <div style="font-size: 28px; margin-bottom: 10px;">(${table.floor})</div>
                <div style="border-top: 4px solid #000; margin: 10px 0;"></div>
                <div style="margin: 20px auto; width: 300px; height: 300px; border: 4px solid #000; padding: 10px;">
                    <img src="${qrApiUrl}" style="width: 100%; height: 100%;" />
                </div>
                <div style="font-size: 32px; font-weight: bold; margin-top: 15px;">สแกนเพื่อสั่งอาหาร</div>
                <div style="font-size: 24px;">Scan to Order</div>
            </div>
        `;

        const imageBase64 = await generateImageFromHtml(html, paperWidthPx);
        const url = `http://${config.ipAddress}:${config.port || 3000}/print-image`;
        
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image: imageBase64,
                connectionType: config.connectionType,
                targetPrinter: {
                    ip: config.targetPrinterIp || '',
                    port: config.targetPrinterPort || '9100',
                    vid: config.vid || '',
                    pid: config.pid || ''
                }
            })
        });
    },

    // --- 6. Test & Check ---
    printTest: async (ip: string, paperWidth: string, port: string, targetPrinterIp?: string, targetPrinterPort?: string, connectionType: PrinterConnectionType = 'network', vid?: string, pid?: string): Promise<boolean> => {
        const url = `http://${ip}:${port || 3000}/print-image`;
        const paperWidthPx = paperWidth === '58mm' ? 370 : 560;
        
        const html = `
            <div style="padding: 20px; font-family: 'Sarabun', sans-serif; text-align: center; border: 5px solid #000; width: 100%; box-sizing: border-box; color: #000;">
                <div style="font-size: 48px; font-weight: 900;">TEST PRINT</div>
                <div style="font-size: 28px; font-weight: bold; margin-top: 10px;">ทดสอบภาษาไทย</div>
                <div style="font-size: 24px;">(Sarabun Font)</div>
                <hr style="margin: 20px 0; border-top: 3px solid #000;" />
                <div style="font-size: 24px; text-align: left; padding-left: 10px; font-weight: bold;">
                    <div>Mode: ${connectionType.toUpperCase()}</div>
                    ${connectionType === 'usb' ? `<div>VID: ${vid || '-'} PID: ${pid || '-'}</div>` : ''}
                    <div>Date: ${new Date().toLocaleDateString('th-TH')}</div>
                </div>
                <div style="font-size: 64px; margin-top: 20px;">OK ✅</div>
            </div>
        `;

        try {
            const imageBase64 = await generateImageFromHtml(html, paperWidthPx);
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: imageBase64,
                    connectionType,
                    targetPrinter: { 
                        ip: targetPrinterIp || '', 
                        port: targetPrinterPort || '9100',
                        vid: vid || '', 
                        pid: pid || '' 
                    }
                })
            });
            return res.ok;
        } catch (error) {
            console.error("Test print error:", error);
            throw error;
        }
    },
    
    checkPrinterStatus: async (serverIp: string, serverPort: string, printerIp: string, printerPort: string, connectionType: PrinterConnectionType, vid?: string, pid?: string): Promise<{ online: boolean, message: string }> => {
        const url = `http://${serverIp}:${serverPort || 3000}/check-printer`;
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ip: printerIp, port: printerPort || '9100', connectionType, vid, pid })
            });
            return await res.json();
        } catch (e: any) {
            return { online: false, message: e.message };
        }
    },

    scanUsbDevices: async (serverIp: string, serverPort: string): Promise<any[]> => {
        const url = `http://${serverIp}:${serverPort || 3000}/scan-usb`;
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error('Scan failed');
            const data = await res.json();
            return data.devices || [];
        } catch (error: any) {
            throw new Error("Scan failed: " + error.message);
        }
    }
};
