
import type { ActiveOrder, KitchenPrinterSettings, Table, CompletedOrder, CashierPrinterSettings, PrinterConnectionType } from '../types';

declare global {
    interface Window {
        html2canvas: any;
    }
}

const generateReceiptImage = async (lines: string[], paperWidth: '58mm' | '80mm'): Promise<string> => {
    return new Promise((resolve, reject) => {
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.top = '-9999px';
        container.style.left = '-9999px';
        container.style.backgroundColor = 'white';
        container.style.color = '#000000';
        container.style.width = paperWidth === '80mm' ? '560px' : '370px';
        container.style.fontFamily = '"Sarabun", sans-serif'; 
        container.style.padding = '15px';
        container.style.lineHeight = '1.2'; // Slightly relaxed line height
        container.style.fontSize = '34px'; // Increased font size for better readability
        container.style.fontWeight = '600';

        let htmlContent = '';
        lines.forEach(line => {
            let style = '';
            let text = line;
            if (line.startsWith('LINEMAN #')) {
                style = 'font-weight: 900; font-size: 60px; text-align: center; display: block; margin: 5px 0;';
            } else if (line.includes('***')) {
                style = 'font-weight: 800; font-size: 36px; margin: 5px 0;';
            } else if (line.startsWith('---')) {
                // Increased margin to separate the line from text above and below
                text = '<div style="border-bottom: 2px dashed black; margin: 15px 0 15px 0;"></div>';
                style = 'height: 2px;';
            }
            
            // Check if line is our custom HTML (starts with <div)
            if (text.trim().startsWith('<div')) {
                htmlContent += text;
            } else {
                htmlContent += `<div style="${style} white-space: pre-wrap;">${text}</div>`;
            }
        });

        container.innerHTML = htmlContent;
        document.body.appendChild(container);

        // Increase timeout slightly to allow images (like QR codes) to load if present
        setTimeout(() => {
            if (window.html2canvas) {
                window.html2canvas(container, {
                    scale: 1,
                    useCORS: true,
                    logging: false,
                    backgroundColor: '#ffffff'
                }).then((canvas: HTMLCanvasElement) => {
                    const base64 = canvas.toDataURL('image/png');
                    document.body.removeChild(container);
                    resolve(base64);
                }).catch(reject);
            } else reject(new Error("html2canvas not found"));
        }, 500); 
    });
};

export const printerService = {
    printKitchenOrder: async (order: ActiveOrder, config: KitchenPrinterSettings): Promise<void> => {
        if (!config.ipAddress) throw new Error("ไม่ได้ตั้งค่า IP ของ Print Server");

        const url = `http://${config.ipAddress}:${config.port || 3000}/print-image`;
        
        // Prefer manual number if available (e.g. LineMan #023)
        const displayOrderNumber = order.manualOrderNumber ? `#${order.manualOrderNumber}` : `#${String(order.orderNumber).padStart(3, '0')}`;

        const lines: string[] = [];
        
        // Conditional Table Label: Remove "โต๊ะ:" if LineMan
        if (order.orderType === 'lineman') {
            lines.push(`${order.tableName}`); 
        } else {
            lines.push(`โต๊ะ: ${order.tableName} (${order.floor})`);
        }

        lines.push(`ออเดอร์: ${displayOrderNumber}`);
        lines.push('--------------------------------');

        // FIX: Build a SINGLE table for ALL items to minimize vertical spacing but allow row padding
        let itemsHtml = `
        <div style="width: 100%;">
            <table style="width: 100%; border-collapse: collapse; table-layout: fixed;">`;

        order.items.forEach((item, index) => {
            // Build options string
            let detailsHtml = '';
            
            // 1. Selected Options (e.g. + เพิ่มชีส, + เผ็ดน้อย)
            if (item.selectedOptions && item.selectedOptions.length > 0) {
                item.selectedOptions.forEach(opt => {
                    detailsHtml += `<div style="font-size: 0.85em; font-weight: normal; margin-top: 2px; padding-left: 15px;">+ ${opt.name}</div>`;
                });
            }

            // 2. Notes (e.g. *** ไม่ใส่ผัก ***)
            if (item.notes) {
                detailsHtml += `<div style="font-size: 0.85em; font-weight: normal; margin-top: 4px; padding-left: 15px;">*** ${item.notes} ***</div>`;
            }

            // Added padding-bottom: 12px to separate items
            // Added padding-top: 4px
            itemsHtml += `
                <tr style="vertical-align: top;">
                    <td style="width: 12%; font-weight: bold; text-align: left; line-height: 1.1; padding-top: 4px; padding-bottom: 12px;">
                        ${index + 1}.
                    </td>
                    <td style="width: 68%; text-align: left; font-weight: bold; line-height: 1.1; word-wrap: break-word; overflow-wrap: break-word; padding-right: 5px; padding-top: 4px; padding-bottom: 12px;">
                        ${item.name}
                        ${detailsHtml}
                    </td>
                    <td style="width: 20%; text-align: right; font-weight: 800; font-size: 1.1em; line-height: 1.1; white-space: nowrap; padding-top: 4px; padding-bottom: 12px;">
                        x ${item.quantity}
                    </td>
                </tr>`;
        });

        itemsHtml += `
            </table>
        </div>`;
        
        lines.push(itemsHtml);

        try {
            const base64Image = await generateReceiptImage(lines, config.paperWidth);
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: base64Image,
                    connectionType: config.connectionType,
                    targetPrinter: {
                        ip: config.targetPrinterIp || '',
                        port: config.targetPrinterPort || '9100'
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

    printReceipt: async (order: CompletedOrder, config: CashierPrinterSettings, restaurantName: string): Promise<void> => {
        if (!config.ipAddress) throw new Error("ไม่ได้ตั้งค่า IP ของ Print Server");

        const url = `http://${config.ipAddress}:${config.port || 3000}/print-image`;
        const lines: string[] = [restaurantName, 'ใบเสร็จรับเงิน', '--------------------------------'];
        
        // Use simpler layout for receipt
        order.items.forEach(item => {
             const itemHtml = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 2px; font-size: 28px;">
                <div style="flex: 1;">${item.quantity} x ${item.name}</div>
                <div style="width: 100px; text-align: right;">${(item.finalPrice * item.quantity).toFixed(2)}</div>
            </div>`;
            lines.push(itemHtml);
        });

        try {
            const base64Image = await generateReceiptImage(lines, config.paperWidth);
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: base64Image,
                    connectionType: config.connectionType,
                    targetPrinter: {
                        ip: config.targetPrinterIp || '',
                        port: config.targetPrinterPort || '9100'
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

    printTest: async (ip: string, paperWidth: string, port: string, targetPrinterIp?: string, targetPrinterPort?: string, connectionType: PrinterConnectionType = 'network'): Promise<boolean> => {
        const url = `http://${ip}:${port || 3000}/print-image`;
        const lines = ["--- ทดสอบการพิมพ์ ---", `โหมด: ${connectionType.toUpperCase()}`, new Date().toLocaleString('th-TH')];
        const base64Image = await generateReceiptImage(lines, paperWidth as '58mm' | '80mm');
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image: base64Image,
                connectionType,
                targetPrinter: { ip: targetPrinterIp || '', port: targetPrinterPort || '9100' }
            })
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `Server returned ${res.status}`);
        }
        return true;
    },
    
    checkPrinterStatus: async (serverIp: string, serverPort: string, printerIp: string, printerPort: string, connectionType: PrinterConnectionType): Promise<{ online: boolean, message: string }> => {
        const url = `http://${serverIp}:${serverPort || 3000}/check-printer`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip: printerIp, port: printerPort || '9100', connectionType })
        });
        return await res.json();
    },

    printTableQRCode: async (table: Table, customerUrl: string, config: KitchenPrinterSettings): Promise<void> => {
        if (!config.ipAddress) throw new Error("ไม่ได้ตั้งค่า IP ของ Print Server");

        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(customerUrl)}`;
        
        const lines: string[] = [];
        // Using explicit div for centering and specific sizing for the QR page
        lines.push(`<div style="text-align: center; font-weight: 800; font-size: 60px; margin-bottom: 5px;">โต๊ะ: ${table.name}</div>`);
        lines.push(`<div style="text-align: center; font-size: 28px; margin-bottom: 10px;">(${table.floor})</div>`);
        lines.push('---');
        lines.push(`<div style="text-align: center; margin: 25px 0;"><img src="${qrApiUrl}" style="width: 400px; height: 400px;" crossOrigin="anonymous" /></div>`);
        lines.push('---');
        lines.push('<div style="text-align: center; font-size: 32px; font-weight: bold; margin-top: 15px;">สแกนเพื่อสั่งอาหาร</div>');
        lines.push('<div style="text-align: center; font-size: 24px; margin-bottom: 10px;">Scan to Order</div>');

        try {
            const base64Image = await generateReceiptImage(lines, config.paperWidth);
            const url = `http://${config.ipAddress}:${config.port || 3000}/print-image`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: base64Image,
                    connectionType: config.connectionType,
                    targetPrinter: {
                        ip: config.targetPrinterIp || '',
                        port: config.targetPrinterPort || '9100'
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
    }
};
