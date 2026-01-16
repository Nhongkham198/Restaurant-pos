
import type { ActiveOrder, KitchenPrinterSettings, Table, CompletedOrder, CashierPrinterSettings } from '../types';

export const printerService = {
    /**
     * Sends the order object to a backend/intermediary service for printing.
     * UPDATED: Now splits the order into individual tickets per item for auto-cutting printers.
     */
    printKitchenOrder: async (order: ActiveOrder, config: KitchenPrinterSettings): Promise<void> => {
        if (!config.ipAddress) {
            throw new Error("ไม่ได้ตั้งค่า IP ของเครื่องพิมพ์ครัว");
        }

        const url = `http://${config.ipAddress}:${config.port || 3001}/print`;
        const timeString = new Date(order.orderTime).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        const totalItems = order.items.length;

        // Loop through each item and send a separate print request
        for (let i = 0; i < totalItems; i++) {
            const item = order.items[i];
            const lines: string[] = [];

            // --- Header (Included on every ticket) ---
            lines.push(`โต๊ะ: ${order.tableName} (${order.floor})`);
            lines.push(`ออเดอร์: #${order.orderNumber} (ใบที่ ${i + 1}/${totalItems})`);
            lines.push(`เวลา: ${timeString}`);
            lines.push(`พนักงาน: ${order.placedBy}`);
            if (order.customerName) {
                lines.push(`ลูกค้า: ${order.customerName}`);
            }
            lines.push('--------------------------------');

            // --- Item Details ---
            // Item Name
            lines.push(`${item.name} ${item.isTakeaway ? '(กลับบ้าน)' : ''}`);
            
            // Quantity (Large/Bold emphasis usually depends on printer, but text is clear here)
            lines.push(`จำนวน:  x${item.quantity}`);

            // Options
            if (item.selectedOptions && item.selectedOptions.length > 0) {
                item.selectedOptions.forEach(opt => {
                    lines.push(`   + ${opt.name}`);
                });
            }

            // Notes
            if (item.notes) {
                lines.push(`   ** หมายเหตุ: ${item.notes}`);
            }
            
            // Takeaway Cutlery
            if (item.isTakeaway && item.takeawayCutlery && item.takeawayCutlery.length > 0) {
                 const cutleryLines: string[] = [];
                 if (item.takeawayCutlery.includes('spoon-fork')) cutleryLines.push('ช้อนส้อม');
                 if (item.takeawayCutlery.includes('chopsticks')) cutleryLines.push('ตะเกียบ');
                 if (item.takeawayCutlery.includes('other') && item.takeawayCutleryNotes) cutleryLines.push(`อื่นๆ: ${item.takeawayCutleryNotes}`);
                 if (item.takeawayCutlery.includes('none')) cutleryLines.push('ไม่รับช้อนส้อม');
                 
                 if (cutleryLines.length > 0) {
                     lines.push(`   [รับ: ${cutleryLines.join(', ')}]`);
                 }
            }

            // --- Send Request for this specific item ---
            try {
                const controller = new AbortController();
                // Increase timeout to 8s to allow backend (5s) to fail gracefully first
                const timeoutId = setTimeout(() => controller.abort(), 8000); 

                const payload = {
                    order: {
                        // Generate a unique ID for this specific item ticket to prevent duplication issues on backend
                        orderId: `${order.orderNumber}-${item.cartItemId || i}`, 
                        items: lines,
                    },
                    paperSize: config.paperWidth,
                    targetPrinter: {
                        ip: config.targetPrinterIp || '',
                        port: config.targetPrinterPort || '9100'
                    }
                };

                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);

                if (!response.ok) {
                    const errJson = await response.json().catch(() => ({}));
                    throw new Error(errJson.error || `Printer API responded with status ${response.status}`);
                }
            } catch (error: any) {
                console.error(`Print error for item ${item.name}:`, error);
                if (error.name === 'AbortError') {
                    throw new Error("หมดเวลาเชื่อมต่อ (Timeout) - เครื่องพิมพ์ไม่ตอบสนอง ตรวจสอบ IP และสายแลน");
                }
                throw error;
            }
        }
    },

    printReceipt: async (order: CompletedOrder, config: CashierPrinterSettings, restaurantName: string): Promise<void> => {
        if (!config.ipAddress) {
            throw new Error("ไม่ได้ตั้งค่า IP ของ Print Server");
        }

        const url = `http://${config.ipAddress}:${config.port || 3001}/print`;
        const lines: string[] = [];
        const options = config.receiptOptions;
        const total = order.items.reduce((s, i) => s + (i.finalPrice * i.quantity), 0) + order.taxAmount;

        // Header
        if (options.printRestaurantName) lines.push(restaurantName);
        lines.push('ใบเสร็จรับเงิน/ใบกำกับภาษีอย่างย่อ');
        lines.push('----------------------------------------');

        if (options.printOrderId) lines.push(`ออเดอร์ #: ${order.orderNumber}`);
        if (options.printTableInfo) lines.push(`โต๊ะ: ${order.tableName} / ลูกค้า: ${order.customerCount} คน`);
        if (options.printDateTime) lines.push(`วันที่: ${new Date(order.completionTime).toLocaleString('th-TH')}`);
        if (options.printPlacedBy) lines.push(`พนักงาน: ${order.placedBy}`);
        lines.push('----------------------------------------');

        // Items
        if (options.printItems) {
            lines.push('รายการอาหาร');
            order.items.forEach(item => {
                const itemTotal = item.finalPrice * item.quantity;
                lines.push(`${item.quantity}x ${item.name} ..... ${itemTotal.toFixed(2)}`);
                if (item.selectedOptions && item.selectedOptions.length > 0) {
                    const optionsText = item.selectedOptions.map(o => o.name).join(', ');
                    lines.push(`  (${optionsText})`);
                }
            });
        }
        lines.push('----------------------------------------');

        const subtotal = order.items.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);

        // Totals
        if (options.printSubtotal) lines.push(`ยอดรวม: ${subtotal.toFixed(2)} บาท`);
        if (options.printTax && order.taxAmount > 0) lines.push(`ภาษี (${order.taxRate}%): ${order.taxAmount.toFixed(2)} บาท`);
        if (options.printTotal) lines.push(`ยอดสุทธิ: ${total.toFixed(2)} บาท`);
        lines.push('----------------------------------------');

        // Payment
        if (options.printPaymentDetails) {
            lines.push(`ชำระโดย: ${order.paymentDetails.method === 'cash' ? 'เงินสด' : 'โอนจ่าย'}`);
            if (order.paymentDetails.method === 'cash') {
                lines.push(`รับเงินมา: ${order.paymentDetails.cashReceived?.toFixed(2)} บาท`);
                lines.push(`เงินทอน: ${order.paymentDetails.changeGiven?.toFixed(2)} บาท`);
            }
        }
        lines.push('');

        // Footer
        if (options.printThankYouMessage) {
            lines.push('ขอบคุณที่ใช้บริการ');
        }
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);

            const payload = {
                order: {
                    orderId: `RECEIPT-${order.orderNumber}`,
                    items: lines,
                },
                paperSize: config.paperWidth,
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
                const errJson = await response.json().catch(() => ({}));
                throw new Error(errJson.error || `Printer API responded with status ${response.status}`);
            }
        } catch (error: any) {
            console.error(`Print receipt error for order #${order.orderNumber}:`, error);
            if (error.name === 'AbortError') {
                throw new Error("หมดเวลาเชื่อมต่อ (Timeout) - เครื่องพิมพ์ไม่ตอบสนอง");
            }
            throw error;
        }
    },

    /**
     * Sends a request to print a QR Code (as text/link) to the kitchen printer.
     */
    printTableQRCode: async (table: Table, qrUrl: string, config: KitchenPrinterSettings): Promise<void> => {
        if (!config.ipAddress) {
            throw new Error("ไม่ได้ตั้งค่า IP เครื่องพิมพ์ครัว");
        }

        const url = `http://${config.ipAddress}:${config.port || 3001}/print`;

        // Construct a simple "ticket" for the QR Code
        const itemsAsStrings = [
            `*** QR CODE สำหรับโต๊ะ ***`,
            `โต๊ะ: ${table.name} (${table.floor})`,
            `--------------------------------`,
            `สแกนเพื่อสั่งอาหาร:`,
            `${qrUrl}`,
            `--------------------------------`,
            `(นำไปติดที่โต๊ะเพื่อให้ลูกค้าสแกน)`,
            new Date().toLocaleString('th-TH')
        ];

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);

            const payload = {
                order: {
                    orderId: `QR-${table.name}`,
                    items: itemsAsStrings,
                },
                paperSize: config.paperWidth,
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
            console.error("Print QR error:", error);
            if (error.name === 'AbortError') {
                throw new Error("หมดเวลาเชื่อมต่อ (Timeout) - เครื่องพิมพ์ไม่ตอบสนอง");
            }
            throw error;
        }
    },

    /**
     * Sends a test payload to the printer service.
     */
    printTest: async (ip: string, paperWidth: string, port: string, targetPrinterIp?: string, targetPrinterPort?: string): Promise<boolean> => {
        if (!ip) throw new Error("ไม่ระบุ IP ของ Server");
        // Default to port 3001 to match user's backend.
        const url = `http://${ip}:${port || 3001}/print`;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);

            // Create a dummy order payload that the backend can process.
            const payload = {
                order: {
                    orderId: "TEST",
                    items: [
                        "ทดสอบการพิมพ์",
                        "ภาษาไทยชัดเจน 100%",
                        "Printer Connected!",
                        new Date().toLocaleString('th-TH')
                    ]
                },
                paperSize: paperWidth,
                targetPrinter: {
                    ip: targetPrinterIp || '',
                    port: targetPrinterPort || '9100'
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
                const errJson = await response.json().catch(() => ({}));
                throw new Error(errJson.error || `Server Error: ${response.status}`);
            }
            
            return true;
        } catch (error: any) {
            console.error("Test print error:", error);
            if (error.name === 'AbortError') {
                throw new Error("หมดเวลาเชื่อมต่อ (Timeout) - เครื่องพิมพ์ไม่ตอบสนอง ตรวจสอบ IP ให้แน่ใจว่าอยู่ในวงเดียวกัน");
            }
            throw error; // Propagate error to UI
        }
    },

    /**
     * Checks connectivity to the printer server without printing.
     */
    checkConnection: async (ip: string, port: string): Promise<boolean> => {
        if (!ip) return false;
        // Check root path to see if server is alive. Default to port 3001.
        const url = `http://${ip}:${port || 3001}/`;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout

            // mode: 'no-cors' allows us to check reachability even if the server 
            // doesn't return CORS headers for the root path.
            // If the server is unreachable, fetch will throw.
            await fetch(url, {
                method: 'GET',
                mode: 'no-cors',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            return true;
        } catch (error) {
            console.error("Connection check error:", error);
            return false;
        }
    }
};
