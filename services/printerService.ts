
import type { ActiveOrder, KitchenPrinterSettings, Table } from '../types';

/**
 * Formats an order's details into an array of strings, ready to be sent
 * to the backend print server. The backend will then join these strings.
 */
const formatOrderForBackend = (order: ActiveOrder): string[] => {
    const lines: string[] = [];
    
    // Add header info so the backend can print it
    const floorText = order.floor === 'lower' ? 'ชั้นล่าง' : 'ชั้นบน';
    const timeString = new Date(order.orderTime).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    lines.push(`โต๊ะ: ${order.tableName} (${floorText})`);
    lines.push(`เวลา: ${timeString}`);
    lines.push(`พนักงาน: ${order.placedBy}`);
    if (order.customerName) {
        lines.push(`ลูกค้า: ${order.customerName}`);
    }
    lines.push(''); // blank line

    // Add items
    order.items.forEach(item => {
        lines.push(`${item.name} ${item.isTakeaway ? '(กลับบ้าน)' : ''}  x${item.quantity}`);
        if (item.selectedOptions && item.selectedOptions.length > 0) {
            item.selectedOptions.forEach(opt => {
                lines.push(`   + ${opt.name}`);
            });
        }
        if (item.notes) {
            lines.push(`   ** หมายเหตุ: ${item.notes}`);
        }
        
        // Item-specific takeaway cutlery
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
    });

    return lines;
};


export const printerService = {
    /**
     * Sends the order object to a backend/intermediary service for printing.
     * The backend handles text formatting and encoding (e.g., TIS-620) for thermal printers.
     */
    printKitchenOrder: async (order: ActiveOrder, config: KitchenPrinterSettings): Promise<void> => {
        if (!config.ipAddress) {
            console.warn("Printer Server IP not configured");
            return;
        }

        const itemsAsStrings = formatOrderForBackend(order);

        // The user's backend code listens on port 3001.
        const url = `http://${config.ipAddress}:${config.port || 3001}/print`;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

            // The new payload structure matches the user's backend.
            const payload = {
                order: {
                    orderId: order.orderNumber,
                    items: itemsAsStrings,
                },
                paperSize: config.paperWidth,
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
                throw new Error(`Printer API responded with status ${response.status}`);
            }
        } catch (error) {
            console.error("Print error:", error);
            // Re-throw so the UI can show an error
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
        const floorText = table.floor === 'lower' ? 'ชั้นล่าง' : 'ชั้นบน';

        // Construct a simple "ticket" for the QR Code
        const itemsAsStrings = [
            `*** QR CODE สำหรับโต๊ะ ***`,
            `โต๊ะ: ${table.name} (${floorText})`,
            `--------------------------------`,
            `สแกนเพื่อสั่งอาหาร:`,
            `${qrUrl}`,
            `--------------------------------`,
            `(นำไปติดที่โต๊ะเพื่อให้ลูกค้าสแกน)`,
            new Date().toLocaleString('th-TH')
        ];

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const payload = {
                order: {
                    orderId: `QR-${table.name}`,
                    items: itemsAsStrings,
                },
                paperSize: config.paperWidth,
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
        } catch (error) {
            console.error("Print QR error:", error);
            throw error;
        }
    },

    /**
     * Sends a test payload to the printer service.
     */
    printTest: async (ip: string, paperWidth: string, port: string): Promise<boolean> => {
        if (!ip) return false;
        // Default to port 3001 to match user's backend.
        const url = `http://${ip}:${port || 3001}/print`;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

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
                paperSize: paperWidth
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            return response.ok;
        } catch (error) {
            console.error("Test print error:", error);
            return false;
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
