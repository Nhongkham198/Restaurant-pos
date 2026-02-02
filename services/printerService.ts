
import type { ActiveOrder, KitchenPrinterSettings, Table, CompletedOrder, CashierPrinterSettings, PrinterConnectionType } from '../types';

declare global {
    interface Window {
        html2canvas: any;
    }
}

const generateReceiptImage = async (lines: string[], paperWidth: '58mm' | '80mm', logoUrl?: string | null): Promise<string> => {
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
        
        // Add Logo if URL provided - IMPROVED CENTERING & SPACING
        if (logoUrl) {
            // margin: 0 auto on img ensures centering. margin-bottom: 0px brings text closer.
            htmlContent += `<div style="width: 100%; margin-bottom: 0px; display: block;"><img src="${logoUrl}" style="display: block; margin: 0 auto; max-width: 60%; height: auto;" crossOrigin="anonymous" /></div>`;
        }

        lines.forEach(line => {
            let style = '';
            let text = line;
            if (line.startsWith('LINEMAN #')) {
                style = 'font-weight: 900; font-size: 60px; text-align: center; display: block; margin: 5px 0;';
            } else if (line.includes('***')) {
                style = 'font-weight: 800; font-size: 36px; margin: 5px 0; text-align: center;';
            } else if (line.startsWith('---')) {
                // Increased margin to separate the line from text above and below
                text = '<div style="border-bottom: 2px dashed black; margin: 15px 0 15px 0;"></div>';
                style = 'height: 2px;';
            } else if (line.startsWith('RESTAURANT_NAME:')) {
                text = line.replace('RESTAURANT_NAME:', '');
                // Added margin-top: 5px to keep it tight but readable, line-height: 1.1
                style = 'font-weight: 900; font-size: 42px; text-align: center; display: block; margin-bottom: 5px; margin-top: 5px; line-height: 1.1;';
            } else if (line.startsWith('CENTER:')) {
                text = line.replace('CENTER:', '');
                style = 'text-align: center; display: block;';
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
        }, 800); // Increased timeout for logo loading
    });
};

export const printerService = {
    printKitchenOrder: async (order: ActiveOrder, config: KitchenPrinterSettings): Promise<void> => {
        if (!config.ipAddress) throw new Error("ไม่ได้ตั้งค่า IP ของ Print Server");

        const url = `http://${config.ipAddress}:${config.port || 3000}/print-image`;
        
        // Prefer manual number if available (e.g. LineMan #023)
        const displayOrderNumber = order.manualOrderNumber ? `#${order.manualOrderNumber}` : `#${String(order.orderNumber).padStart(3, '0')}`;

        const lines: string[] = [];
        
        // Conditional Table Label
        if (order.orderType === 'lineman') {
            const providerName = order.tableName || 'Delivery';
            // Prevent printing "Delivery Delivery" if provider name is just "Delivery"
            if (providerName.toLowerCase() === 'delivery') {
                lines.push('Delivery');
            } else {
                lines.push(`Delivery ${providerName}`); 
            }
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

    // New method for printing preliminary bills (Check Bill)
    printBill: async (order: ActiveOrder, config: CashierPrinterSettings, restaurantName: string, logoUrl?: string | null): Promise<void> => {
        if (!config.ipAddress) throw new Error("ไม่ได้ตั้งค่า IP ของ Print Server");

        const opts = config.receiptOptions;
        const url = `http://${config.ipAddress}:${config.port || 3000}/print-image`;
        const lines: string[] = [];

        // 1. Header Section
        if (opts.showRestaurantName) {
            lines.push(`RESTAURANT_NAME:${restaurantName}`);
        }
        
        // Address & Phone (Reuse options from receipt settings for consistency)
        if (opts.showAddress && opts.address) {
            lines.push(`CENTER:${opts.address}`);
        }
        if (opts.showPhoneNumber && opts.phoneNumber) {
            lines.push(`CENTER:Tel: ${opts.phoneNumber}`);
        }

        lines.push(' ');
        lines.push('CENTER:ใบแจ้งหนี้ / CHECK BILL'); // Distinct title
        lines.push('--------------------------------');
        
        // 2. Meta Section
        if (opts.showTable) lines.push(`โต๊ะ: ${order.tableName}`);
        lines.push(`Order: #${order.orderNumber}`);
        lines.push(`วันที่: ${new Date().toLocaleString('th-TH')}`); // Use current time for check bill
        if (opts.showStaff && order.placedBy) {
            lines.push(`พนักงาน: ${order.placedBy}`);
        }

        if (opts.showItems) lines.push('--------------------------------');

        // 3. Items Section
        if (opts.showItems) {
            order.items.forEach(item => {
                 const itemHtml = `
                <div style="display: flex; justify-content: space-between; margin-bottom: 2px; font-size: 28px;">
                    <div style="flex: 1;">${item.quantity} x ${item.name}</div>
                    <div style="width: 100px; text-align: right;">${(item.finalPrice * item.quantity).toFixed(2)}</div>
                </div>`;
                lines.push(itemHtml);
            });
            lines.push('--------------------------------');
        }

        // 4. Totals Section
        const subtotal = order.items.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
        
        if (opts.showSubtotal) {
                lines.push(`<div style="display: flex; justify-content: space-between;"><div>รวมเงิน</div><div>${subtotal.toFixed(2)}</div></div>`);
        }
        if (opts.showTax) {
                lines.push(`<div style="display: flex; justify-content: space-between;"><div>ภาษี (${order.taxRate}%)</div><div>${order.taxAmount.toFixed(2)}</div></div>`);
        }
        // Always show total
        const total = subtotal + order.taxAmount;
        lines.push(`<div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 32px; margin-top: 5px;"><div>ยอดสุทธิ</div><div>${total.toFixed(2)}</div></div>`);
        
        // Footer
        lines.push(' ');
        lines.push('CENTER:(ยังไม่ได้ชำระเงิน / Unpaid)');

        try {
            const base64Image = await generateReceiptImage(lines, config.paperWidth, logoUrl || undefined);
            
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

    printReceipt: async (order: CompletedOrder, config: CashierPrinterSettings, restaurantName: string, logoUrl?: string | null): Promise<void> => {
        if (!config.ipAddress) throw new Error("ไม่ได้ตั้งค่า IP ของ Print Server");

        const opts = config.receiptOptions;
        const url = `http://${config.ipAddress}:${config.port || 3000}/print-image`;
        const lines: string[] = [];

        // 1. Header Section
        if (opts.showRestaurantName) {
            lines.push(`RESTAURANT_NAME:${restaurantName}`);
        }
        
        // Address & Phone
        if (opts.showAddress && opts.address) {
            lines.push(`CENTER:${opts.address}`);
        }
        if (opts.showPhoneNumber && opts.phoneNumber) {
            lines.push(`CENTER:Tel: ${opts.phoneNumber}`);
        }

        // Add a blank line between Tel and Title
        lines.push(' ');

        // Title
        lines.push('CENTER:ใบเสร็จรับเงิน');
        lines.push('--------------------------------');
        
        // 2. Meta Section
        if (opts.showTable) lines.push(`โต๊ะ: ${order.tableName}`);
        if (opts.showOrderId) lines.push(`Order: #${order.orderNumber}`); // If users want this OFF, it's off
        if (opts.showDateTime) {
            lines.push(`วันที่: ${new Date(order.completionTime).toLocaleString('th-TH')}`);
        }
        if (opts.showStaff && order.completedBy) {
            lines.push(`พนักงาน: ${order.completedBy}`);
        }

        if (opts.showItems) lines.push('--------------------------------');

        // 3. Items Section
        if (opts.showItems) {
            order.items.forEach(item => {
                 const itemHtml = `
                <div style="display: flex; justify-content: space-between; margin-bottom: 2px; font-size: 28px;">
                    <div style="flex: 1;">${item.quantity} x ${item.name}</div>
                    <div style="width: 100px; text-align: right;">${(item.finalPrice * item.quantity).toFixed(2)}</div>
                </div>`;
                lines.push(itemHtml);
            });
            lines.push('--------------------------------');
        }

        // 4. Totals Section
        if (opts.showSubtotal || opts.showTax || opts.showTotal) {
            const subtotal = order.items.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
            
            if (opts.showSubtotal) {
                 lines.push(`<div style="display: flex; justify-content: space-between;"><div>รวมเงิน</div><div>${subtotal.toFixed(2)}</div></div>`);
            }
            if (opts.showTax) {
                 lines.push(`<div style="display: flex; justify-content: space-between;"><div>ภาษี (${order.taxRate}%)</div><div>${order.taxAmount.toFixed(2)}</div></div>`);
            }
            if (opts.showTotal) {
                 const total = subtotal + order.taxAmount;
                 lines.push(`<div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 32px; margin-top: 5px;"><div>ยอดสุทธิ</div><div>${total.toFixed(2)}</div></div>`);
            }
        }

        // 5. Payment Method
        if (opts.showPaymentMethod) {
            const method = order.paymentDetails.method === 'cash' ? 'เงินสด' : 'โอนจ่าย';
            lines.push(`<div style="text-align: center; margin-top: 5px;">ชำระโดย: ${method}</div>`);
        }

        // 6. Footer
        if (opts.showThankYouMessage && opts.thankYouMessage) {
            lines.push(`*** ${opts.thankYouMessage} ***`);
        }

        try {
            // Pass undefined if logoUrl is null to match optional type
            const base64Image = await generateReceiptImage(lines, config.paperWidth, logoUrl || undefined);
            
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

    // New method to print any pre-generated base64 image (used by CashBillModal)
    printCustomImage: async (base64Image: string, config: CashierPrinterSettings): Promise<void> => {
        if (!config.ipAddress) throw new Error("ไม่ได้ตั้งค่า IP ของ Print Server");

        const url = `http://${config.ipAddress}:${config.port || 3000}/print-image`;

        try {
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
