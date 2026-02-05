
import type { ActiveOrder, CompletedOrder, KitchenPrinterSettings, CashierPrinterSettings, Table } from '../types';

// Declare html2canvas globally as it might be loaded via CDN
declare global {
    interface Window {
        html2canvas: any;
    }
}

// Helper to generate HTML and convert to image
const generateImageFromHtml = async (htmlContent: string, width = 576): Promise<string> => {
    // 576px is approx 80mm at 203dpi, or just a good width for 80mm printers
    // Create a hidden container
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.top = '-9999px';
    container.style.left = '-9999px';
    container.style.width = `${width}px`;
    container.style.backgroundColor = 'white';
    container.style.color = 'black';
    container.style.fontFamily = 'sans-serif';
    container.innerHTML = htmlContent;
    document.body.appendChild(container);

    try {
        // Assume html2canvas is available globally
        if (!window.html2canvas) {
            throw new Error("html2canvas library not found");
        }
        const canvas = await window.html2canvas(container, {
            scale: 2, // Better quality
            useCORS: true,
            logging: false,
            width: width,
            windowWidth: width
        });
        return canvas.toDataURL('image/png');
    } finally {
        if (document.body.contains(container)) {
            document.body.removeChild(container);
        }
    }
};

const sendToPrintServer = async (base64Image: string, config: KitchenPrinterSettings | CashierPrinterSettings) => {
    const serverUrl = `http://${config.ipAddress}:${config.port || 3000}/print-image`;
    
    // remove data:image/png;base64, prefix if present
    const cleanBase64 = base64Image.replace(/^data:image\/(png|jpg|jpeg);base64,/, "");

    const payload = {
        image: cleanBase64,
        connectionType: config.connectionType,
        targetPrinter: {
            ip: config.targetPrinterIp,
            port: config.targetPrinterPort ? parseInt(config.targetPrinterPort) : 9100,
            vid: config.vid,
            pid: config.pid
        }
    };

    const response = await fetch(serverUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error('Print server error');
    }
    return await response.json();
};

export const printerService = {
    checkPrinterStatus: async (ip: string, port: string, targetIp: string, targetPort: string, type: string, vid?: string, pid?: string) => {
        try {
            const response = await fetch(`http://${ip}:${port || 3000}/check-printer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetIp, targetPort, type, vid, pid })
            });
            if (response.ok) return { online: true };
            return { online: false, message: 'Server unreachable' };
        } catch (e) {
            return { online: false, message: (e as Error).message };
        }
    },

    scanUsbDevices: async (ip: string, port: string) => {
        const response = await fetch(`http://${ip}:${port || 3000}/scan-usb`);
        if (!response.ok) throw new Error('Scan failed');
        const data = await response.json();
        return data.devices || [];
    },

    printTest: async (ip: string, width: string, port: string, targetIp?: string, targetPort?: string, type?: string, vid?: string, pid?: string) => {
        // Create a simple test image HTML
        const html = `<div style="padding: 20px; text-align: center; font-size: 24px; font-weight: bold;">TEST PRINT<br/>SUCCESS!</div>`;
        const base64 = await generateImageFromHtml(html);
        return sendToPrintServer(base64, { 
            ipAddress: ip, 
            port, 
            paperWidth: width as any, 
            connectionType: type as any,
            targetPrinterIp: targetIp,
            targetPrinterPort: targetPort,
            vid,
            pid
        });
    },

    printCustomImage: async (base64Image: string, config: CashierPrinterSettings) => {
        return sendToPrintServer(base64Image, config);
    },

    printKitchenOrder: async (order: ActiveOrder, config: KitchenPrinterSettings) => {
        // Construct HTML for kitchen ticket
        const fsNormal = '18px';
        const fsLarge = '24px';
        const fsXLarge = '32px';
        
        let itemsHtml = '';
        order.items.forEach(item => {
            const optionsHtml = item.selectedOptions?.length > 0 
                ? `<div style="font-size: ${fsNormal}; color: #333; margin-top: 5px; font-weight: normal;">+ ${item.selectedOptions.map(o => o.name).join(', ')}</div>` 
                : '';
            
            const notesHtml = item.notes 
                ? `<div style="font-size: ${fsNormal}; font-weight: bold; background-color: #000; color: #fff; display: inline-block; padding: 4px 8px; border-radius: 4px; margin-top: 5px;">Note: ${item.notes}</div>` 
                : '';
            
            let takeawayLabel = 'กลับบ้าน';
            if (item.takeawayCutlery && item.takeawayCutlery.length > 0) {
                const cutleryNames = item.takeawayCutlery.map(c => {
                    if (c === 'spoon-fork') return 'ช้อนส้อม';
                    if (c === 'chopsticks') return 'ตะเกียบ';
                    if (c === 'none') return 'ไม่รับอุปกรณ์';
                    if (c === 'other') return item.takeawayCutleryNotes || 'อื่นๆ';
                    return '';
                }).filter(Boolean).join(' + ');

                if (cutleryNames) {
                    takeawayLabel = `กลับบ้าน (${cutleryNames})`;
                }
            }

            const takeawayHtml = item.isTakeaway 
                ? `<div style="font-size: ${fsNormal}; font-weight: 900; border: 2px solid #000; display: inline-block; padding: 2px 5px; margin-top: 5px; line-height: 1.2;">${takeawayLabel}</div>` 
                : '';

            itemsHtml += `
                <div style="display: flex; align-items: flex-start; margin-bottom: 15px; border-bottom: 1px dashed #ccc; padding-bottom: 15px;">
                    <div style="font-size: ${fsXLarge}; font-weight: 900; min-width: 60px; margin-right: 10px; line-height: 1.2; text-align: left;">
                        ${item.quantity}x
                    </div>
                    <div style="flex: 1; display: flex; flex-direction: column; align-items: flex-start;">
                        <div style="font-size: ${fsLarge}; font-weight: 900; line-height: 1.2; word-break: break-word;">
                            ${item.name}
                        </div>
                        ${optionsHtml}
                        ${notesHtml}
                        ${takeawayHtml}
                    </div>
                </div>
            `;
        });

        const html = `
            <div style="padding: 20px; font-family: sans-serif; color: #000; background: #fff;">
                <div style="text-align: center; border-bottom: 3px solid #000; padding-bottom: 10px; margin-bottom: 20px;">
                    <div style="font-size: ${fsXLarge}; font-weight: 900;">KITCHEN ORDER</div>
                    <div style="font-size: ${fsLarge}; margin-top: 5px;">Table: <span style="font-size: ${fsXLarge}; font-weight: 900;">${order.tableName}</span></div>
                    <div style="font-size: ${fsNormal};">Order #: ${order.orderNumber}</div>
                    <div style="font-size: ${fsNormal};">${new Date(order.orderTime).toLocaleString('th-TH')}</div>
                </div>
                ${itemsHtml}
                <div style="text-align: center; font-size: ${fsNormal}; margin-top: 20px; font-weight: bold;">
                    Items: ${order.items.reduce((s, i) => s + i.quantity, 0)}
                </div>
            </div>
        `;

        const base64 = await generateImageFromHtml(html);
        return sendToPrintServer(base64, config);
    },

    printReceipt: async (order: CompletedOrder, config: CashierPrinterSettings, restaurantName: string, logoUrl: string | null) => {
        const fsNormal = '16px';
        const fsLarge = '20px';
        const fsHeader = '24px';

        let itemsHtml = '';
        order.items.forEach(item => {
             itemsHtml += `
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-size: ${fsNormal};">
                    <div style="flex: 1;">${item.quantity}x ${item.name}</div>
                    <div style="font-weight: bold;">${(item.finalPrice * item.quantity).toLocaleString()}</div>
                </div>
            `;
        });

        const subtotal = order.items.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
        const total = subtotal + order.taxAmount;

        const html = `
            <div style="padding: 20px; font-family: sans-serif; color: #000; background: #fff;">
                <div style="text-align: center; margin-bottom: 20px;">
                    ${logoUrl && config.receiptOptions?.showLogo ? `<img src="${logoUrl}" style="max-height: 80px; max-width: 80%; margin-bottom: 10px;" />` : ''}
                    <div style="font-size: ${fsHeader}; font-weight: bold;">${restaurantName}</div>
                    ${config.receiptOptions?.showAddress && config.receiptOptions.address ? `<div style="font-size: ${fsNormal}; margin-top: 5px;">${config.receiptOptions.address}</div>` : ''}
                    ${config.receiptOptions?.showPhoneNumber && config.receiptOptions.phoneNumber ? `<div style="font-size: ${fsNormal};">Tel: ${config.receiptOptions.phoneNumber}</div>` : ''}
                </div>
                
                <div style="border-bottom: 1px dashed #000; margin-bottom: 10px;"></div>
                
                <div style="font-size: ${fsNormal}; margin-bottom: 10px;">
                    <div>Date: ${new Date(order.completionTime).toLocaleString('th-TH')}</div>
                    <div>Order: #${order.orderNumber}</div>
                    <div>Table: ${order.tableName}</div>
                </div>

                <div style="border-bottom: 1px dashed #000; margin-bottom: 10px;"></div>

                ${itemsHtml}

                <div style="border-bottom: 1px dashed #000; margin-top: 10px; margin-bottom: 10px;"></div>

                <div style="font-size: ${fsLarge};">
                    <div style="display: flex; justify-content: space-between;">
                        <span>Subtotal</span>
                        <span>${subtotal.toLocaleString()}</span>
                    </div>
                    ${order.taxAmount > 0 ? `
                    <div style="display: flex; justify-content: space-between;">
                        <span>Tax</span>
                        <span>${order.taxAmount.toLocaleString()}</span>
                    </div>` : ''}
                    <div style="display: flex; justify-content: space-between; font-weight: bold; margin-top: 5px; font-size: 28px;">
                        <span>Total</span>
                        <span>${total.toLocaleString()}</span>
                    </div>
                </div>

                <div style="text-align: center; margin-top: 30px; font-size: ${fsNormal};">
                    ${config.receiptOptions?.thankYouMessage || 'Thank You!'}
                </div>
            </div>
        `;

        const base64 = await generateImageFromHtml(html);
        return sendToPrintServer(base64, config);
    },

    printTableQRCode: async (table: Table, url: string, config: KitchenPrinterSettings) => {
        // Generate a simple card with QR code
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}`;
        
        const html = `
            <div style="padding: 40px; font-family: sans-serif; text-align: center; background: white;">
                <div style="font-size: 32px; font-weight: bold; margin-bottom: 20px;">โต๊ะ ${table.name}</div>
                <img src="${qrApiUrl}" style="width: 250px; height: 250px;" />
                <div style="font-size: 20px; margin-top: 20px;">สแกนเพื่อสั่งอาหาร</div>
            </div>
        `;
        const base64 = await generateImageFromHtml(html);
        return sendToPrintServer(base64, config);
    },

    printBill: async (order: ActiveOrder, config: CashierPrinterSettings, restaurantName: string, logoUrl: string | null) => {
        const fsNormal = '16px';
        const fsLarge = '20px';
        
        let itemsHtml = '';
        order.items.forEach(item => {
             itemsHtml += `
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-size: ${fsNormal};">
                    <div style="flex: 1;">${item.quantity}x ${item.name}</div>
                    <div style="font-weight: bold;">${(item.finalPrice * item.quantity).toLocaleString()}</div>
                </div>
            `;
        });

        const subtotal = order.items.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
        const total = subtotal + order.taxAmount;

        const html = `
            <div style="padding: 20px; font-family: sans-serif; color: #000; background: #fff;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <div style="font-size: 24px; font-weight: bold;">CHECK BILL</div>
                    <div style="font-size: 18px; margin-top: 5px;">Table: ${order.tableName}</div>
                </div>
                
                <div style="border-bottom: 1px dashed #000; margin-bottom: 10px;"></div>
                ${itemsHtml}
                <div style="border-bottom: 1px dashed #000; margin-top: 10px; margin-bottom: 10px;"></div>

                <div style="font-size: ${fsLarge}; font-weight: bold; text-align: right;">
                    Total: ${total.toLocaleString()}
                </div>
            </div>
        `;
        const base64 = await generateImageFromHtml(html);
        return sendToPrintServer(base64, config);
    }
};
