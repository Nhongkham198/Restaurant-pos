
import type { ActiveOrder, KitchenPrinterSettings } from '../types';

const formatReceiptText = (order: ActiveOrder) => {
    const floorText = order.floor === 'lower' ? 'ชั้นล่าง' : 'ชั้นบน';
    const timeString = new Date(order.orderTime).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    
    let text = '';
    // Header
    text += `โต๊ะ ${order.tableName} (${floorText})\n`;
    text += `เวลา: ${timeString}\n`;
    text += `--------------------------------\n`;
    
    // Items
    order.items.forEach(item => {
        text += `${item.name} ${item.isTakeaway ? '(กลับบ้าน)' : ''}  x${item.quantity}\n`;
        if (item.selectedOptions && item.selectedOptions.length > 0) {
            item.selectedOptions.forEach(opt => {
                text += `   + ${opt.name}\n`;
            });
        }
    });
    
    // Footer
    text += `--------------------------------\n`;
    text += `*** สิ้นสุดรายการ ***\n`;
    text += `\n\n\n`; // Feed paper
    
    return text;
};

export const printerService = {
    /**
     * Sends text payload to a backend/intermediary service for printing.
     * This allows the backend to handle encoding (e.g., TIS-620) for thermal printers.
     */
    printKitchenOrder: async (order: ActiveOrder, config: KitchenPrinterSettings): Promise<void> => {
        if (!config.ipAddress) {
            console.warn("Printer Server IP not configured");
            return;
        }

        const text = formatReceiptText(order);
        // Assuming the backend is running on the specified IP/Port and accepts POST /print
        // Default to port 3000 for Node.js server if not specified
        const url = `http://${config.ipAddress}:${config.port || 3000}/print`;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

            // Simplify payload to match the user's provided server.js example.
            const payload = {
                text,
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
     * Sends a test string to the printer.
     */
    printTest: async (ip: string, paperWidth: string, port: string): Promise<boolean> => {
        if (!ip) return false;
        // Default to port 3000 for Node.js server if not specified
        const url = `http://${ip}:${port || 3000}/print`;
        const text = `\nทดสอบการพิมพ์\nภาษาไทยชัดเจน 100%\nPrinter Connected!\n${new Date().toLocaleString('th-TH')}\n\n\n`;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            // Simplify payload to match the user's provided server.js example.
            const payload = {
                text,
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
        // Check root path to see if server is alive
        const url = `http://${ip}:${port || 3000}/`;

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
