
import type { ActiveOrder, KitchenPrinterSettings, Table, CompletedOrder, CashierPrinterSettings, PrinterConnectionType } from '../types';

declare global {
    interface Window {
        html2canvas: any;
    }
}

// ... (generateReceiptImage function remains the same) ...
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
        container.style.lineHeight = '1.2'; 
        container.style.fontSize = '34px'; 
        container.style.fontWeight = '600';

        let htmlContent = '';
        
        if (logoUrl) {
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
                text = '<div style="border-bottom: 2px dashed black; margin: 15px 0 15px 0;"></div>';
                style = 'height: 2px;';
            } else if (line.startsWith('RESTAURANT_NAME:')) {
                text = line.replace('RESTAURANT_NAME:', '');
                style = 'font-weight: 900; font-size: 42px; text-align: center; display: block; margin-bottom: 5px; margin-top: 5px; line-height: 1.1;';
            } else if (line.startsWith('CENTER:')) {
                text = line.replace('CENTER:', '');
                style = 'text-align: center; display: block;';
            }
            
            if (text.trim().startsWith('<div')) {
                htmlContent += text;
            } else {
                htmlContent += `<div style="${style} white-space: pre-wrap;">${text}</div>`;
            }
        });

        // *** STAR TSP100 FIX: MAXIMIZED PADDING ***
        // Use 300px height with invisible content (.) to act as a robust software feed.
        // This forces the printer to "print" this whitespace, pushing the real content past the cutter.
        htmlContent += `<div style="height: 300px; width: 100%; display: flex; align-items: flex-end; justify-content: center; color: transparent;">.</div>`;

        container.innerHTML = htmlContent;
        document.body.appendChild(container);

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
        }, 800); 
    });
};

export const printerService = {
    // NEW: Scan for USB devices via the server
    scanUsbDevices: async (serverIp: string, serverPort: string): Promise<any[]> => {
        const url = `http://${serverIp}:${serverPort || 3001}/scan-usb`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to scan USB devices");
        const data = await res.json();
        return data.devices || [];
    },

    printKitchenOrder: async (order: ActiveOrder, config: KitchenPrinterSettings): Promise<void> => {
        if (!config.ipAddress) throw new Error("ไม่ได้ตั้งค่า IP ของ Print Server");

        const url = `http://${config.ipAddress}:${config.port || 3001}/print-image`;
        
        const displayOrderNumber = order.manualOrderNumber ? `#${order.manualOrderNumber}` : `#${String(order.orderNumber).padStart(3, '0')}`;

        const lines: string[] = [];
        
        if (order.orderType === 'lineman') {
            const providerName = order.tableName || 'Delivery';
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

        let itemsHtml = `
        <div style="width: 100%;">
            <table style="width: 100%; border-collapse: collapse; table-layout: fixed;">`;

        order.items.forEach((item, index) => {
            let detailsHtml = '';
            
            if (item.selectedOptions && item.selectedOptions.length > 0) {
                item.selectedOptions.forEach(opt => {
                    detailsHtml += `<div style="font-size: 0.85em; font-weight: normal; margin-top: 2px; padding-left: 15px;">+ ${opt.name}</div>`;
                });
            }

            if (item.notes) {
                detailsHtml += `<div style="font-size: 0.85em; font-weight: normal; margin-top: 4px; padding-left: 15px;">*** ${item.notes} ***</div>`;
            }

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
                        port: config.targetPrinterPort || '9100',
                        vid: config.usbVid,
                        pid: config.usbPid
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

    printBill: async (order: ActiveOrder, config: CashierPrinterSettings, restaurantName: string, logoUrl?: string | null): Promise<void> => {
        if (!config.ipAddress) throw new Error("ไม่ได้ตั้งค่า IP ของ Print Server");

        const opts = config.receiptOptions;
        const url = `http://${config.ipAddress}:${config.port || 3001}/print-image`;
        const lines: string[] = [];

        if (opts.showRestaurantName) {
            lines.push(`RESTAURANT_NAME:${restaurantName}`);
        }
        
        if (opts.showAddress && opts.address) {
            lines.push(`CENTER:${opts.address}`);
        }
        if (opts.showPhoneNumber && opts.phoneNumber) {
            lines.push(`CENTER:Tel: ${opts.phoneNumber}`);
        }

        lines.push(' ');
        lines.push('CENTER:ใบแจ้งหนี้ / CHECK BILL'); 
        lines.push('--------------------------------');
        
        if (opts.showTable) lines.push(`โต๊ะ: ${order.tableName}`);
        lines.push(`Order: #${order.orderNumber}`);
        lines.push(`วันที่: ${new Date().toLocaleString('th-TH')}`); 
        if (opts.showStaff && order.placedBy) {
            lines.push(`พนักงาน: ${order.placedBy}`);
        }

        if (opts.showItems) lines.push('--------------------------------');

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

        const subtotal = order.items.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
        
        if (opts.showSubtotal) {
                lines.push(`<div style="display: flex; justify-content: space-between;"><div>รวมเงิน</div><div>${subtotal.toFixed(2)}</div></div>`);
        }
        if (opts.showTax) {
                lines.push(`<div style="display: flex; justify-content: space-between;"><div>ภาษี (${order.taxRate}%)</div><div>${order.taxAmount.toFixed(2)}</div></div>`);
        }
        const total = subtotal + order.taxAmount;
        lines.push(`<div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 32px; margin-top: 5px;"><div>ยอดสุทธิ</div><div>${total.toFixed(2)}</div></div>`);
        
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
                        port: config.targetPrinterPort || '9100',
                        vid: config.usbVid,
                        pid: config.usbPid
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
        const url = `http://${config.ipAddress}:${config.port || 3001}/print-image`;
        const lines: string[] = [];

        if (opts.showRestaurantName) {
            lines.push(`RESTAURANT_NAME:${restaurantName}`);
        }
        
        if (opts.showAddress && opts.address) {
            lines.push(`CENTER:${opts.address}`);
        }
        if (opts.showPhoneNumber && opts.phoneNumber) {
            lines.push(`CENTER:Tel: ${opts.phoneNumber}`);
        }

        lines.push(' ');

        lines.push('CENTER:ใบเสร็จรับเงิน');
        lines.push('--------------------------------');
        
        if (opts.showTable) lines.push(`โต๊ะ: ${order.tableName}`);
        if (opts.showOrderId) lines.push(`Order: #${order.orderNumber}`); 
        if (opts.showDateTime) {
            lines.push(`วันที่: ${new Date(order.completionTime).toLocaleString('th-TH')}`);
        }
        if (opts.showStaff && order.completedBy) {
            lines.push(`พนักงาน: ${order.completedBy}`);
        }

        if (opts.showItems) lines.push('--------------------------------');

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

        if (opts.showPaymentMethod) {
            const method = order.paymentDetails.method === 'cash' ? 'เงินสด' : 'โอนจ่าย';
            lines.push(`<div style="text-align: center; margin-top: 5px;">ชำระโดย: ${method}</div>`);
        }

        if (opts.showThankYouMessage && opts.thankYouMessage) {
            lines.push(`*** ${opts.thankYouMessage} ***`);
        }

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
                        port: config.targetPrinterPort || '9100',
                        vid: config.usbVid,
                        pid: config.usbPid
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

    printCustomImage: async (base64Image: string, config: CashierPrinterSettings): Promise<void> => {
        if (!config.ipAddress) throw new Error("ไม่ได้ตั้งค่า IP ของ Print Server");

        const url = `http://${config.ipAddress}:${config.port || 3001}/print-image`;

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: base64Image,
                    connectionType: config.connectionType,
                    targetPrinter: {
                        ip: config.targetPrinterIp || '',
                        port: config.targetPrinterPort || '9100',
                        vid: config.usbVid,
                        pid: config.usbPid
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

    printTest: async (ip: string, paperWidth: string, port: string, targetPrinterIp?: string, targetPrinterPort?: string, connectionType: PrinterConnectionType = 'network', vid?: string, pid?: string): Promise<boolean> => {
        const url = `http://${ip}:${port || 3001}/print-image`;
        const lines = [
            "--- ทดสอบการพิมพ์ ---", 
            `โหมด: ${connectionType.toUpperCase()}`, 
            `VID: ${vid || '-'} PID: ${pid || '-'}`,
            "-------------------------",
            "หากคุณอ่านข้อความนี้ได้",
            "แสดงว่าเครื่องพิมพ์ทำงานปกติ",
            "-------------------------",
            "..........................",
            new Date().toLocaleString('th-TH'),
            " ",
            " ",
            " ",
            "-------------------------" // Add padding at bottom
        ];
        const base64Image = await generateReceiptImage(lines, paperWidth as '58mm' | '80mm');
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image: base64Image,
                connectionType,
                targetPrinter: { ip: targetPrinterIp || '', port: targetPrinterPort || '9100', vid, pid }
            })
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `Server returned ${res.status}`);
        }
        return true;
    },
    
    checkPrinterStatus: async (serverIp: string, serverPort: string, printerIp: string, printerPort: string, connectionType: PrinterConnectionType, vid?: string, pid?: string): Promise<{ online: boolean, message: string }> => {
        const url = `http://${serverIp}:${serverPort || 3001}/check-printer`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip: printerIp, port: printerPort || '9100', connectionType, vid, pid })
        });
        return await res.json();
    },

    printTableQRCode: async (table: Table, customerUrl: string, config: KitchenPrinterSettings): Promise<void> => {
        if (!config.ipAddress) throw new Error("ไม่ได้ตั้งค่า IP ของ Print Server");

        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(customerUrl)}`;
        
        const lines: string[] = [];
        lines.push(`<div style="text-align: center; font-weight: 800; font-size: 60px; margin-bottom: 5px;">โต๊ะ: ${table.name}</div>`);
        lines.push(`<div style="text-align: center; font-size: 28px; margin-bottom: 10px;">(${table.floor})</div>`);
        lines.push('---');
        lines.push(`<div style="text-align: center; margin: 25px 0;"><img src="${qrApiUrl}" style="width: 400px; height: 400px;" crossOrigin="anonymous" /></div>`);
        lines.push('---');
        lines.push('<div style="text-align: center; font-size: 32px; font-weight: bold; margin-top: 15px;">สแกนเพื่อสั่งอาหาร</div>');
        lines.push('<div style="text-align: center; font-size: 24px; margin-bottom: 10px;">Scan to Order</div>');

        try {
            const base64Image = await generateReceiptImage(lines, config.paperWidth);
            const url = `http://${config.ipAddress}:${config.port || 3001}/print-image`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: base64Image,
                    connectionType: config.connectionType,
                    targetPrinter: {
                        ip: config.targetPrinterIp || '',
                        port: config.targetPrinterPort || '9100',
                        vid: config.usbVid,
                        pid: config.usbPid
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
