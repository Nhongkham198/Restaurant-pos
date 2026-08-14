

import type { ActiveOrder, KitchenPrinterSettings, Table, CompletedOrder, CashierPrinterSettings, ReceiptPrintSettings, PrinterConnectionType, OrderItem } from '../types';
import Swal from 'sweetalert2';

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

// --- Constants for EXACT Printable Widths (Smart Fit) ---
// 58mm Paper: Physical head width is usually 384 dots. We use 375 to have a tiny safe margin but fill more space.
// 80mm Paper: Physical head width is usually 576 dots. We use 575 to have a tiny safe margin but fill more space.
const TARGET_WIDTH_58MM = 375; 
const TARGET_WIDTH_80MM = 575; 

// --- Core Generator ---
const generateImageFromHtml = async (htmlContent: string, targetWidthPx: number): Promise<string> => {
    const container = document.createElement('div');
    
    // We render the HTML at the TARGET width initially to ensure word-wrapping happens correctly
    // for the physical paper width.
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = `${targetWidthPx}px`; 
    container.style.height = 'auto'; 
    container.style.margin = '0';
    container.style.padding = '0'; 
    container.style.backgroundColor = '#ffffff'; 
    container.style.color = '#000000';
    container.style.overflow = 'hidden'; // Prevent spillover
    
    // Force text wrapping - Vital for preventing cutoff
    container.style.wordWrap = 'break-word';
    container.style.overflowWrap = 'break-word';
    container.style.whiteSpace = 'normal';
    
    // Use Sarabun for Thai support with optimizeLegibility
    container.style.fontFamily = "'Sarabun', sans-serif"; 
    // FIX: Increase line height to 1.4 to prevent Thai vowels from overlapping
    container.style.lineHeight = '1.4'; 
    container.style.setProperty('-webkit-font-smoothing', 'none'); // Disable antialiasing in CSS
    container.style.setProperty('text-rendering', 'optimizeSpeed'); // Use sharper rendering
    
    container.innerHTML = htmlContent;
    document.body.appendChild(container);

    // Wait for fonts/images
    await document.fonts.ready;
    await new Promise(r => setTimeout(r, 200)); 

    const contentHeight = container.offsetHeight;

    try {
        if (!window.html2canvas) throw new Error("html2canvas library not loaded");

        // 1. Capture at 2x Resolution for sharpness
        const rawCanvas = await window.html2canvas(container, {
            scale: 2, 
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff', 
            width: targetWidthPx,
            height: contentHeight,
            windowWidth: targetWidthPx,
            windowHeight: contentHeight + 100, // Extra buffer
            onclone: (clonedDoc: any) => {
                const clonedEl = clonedDoc.querySelector('div');
                if (clonedEl) {
                    clonedEl.style.height = 'auto';
                    clonedEl.style.overflow = 'visible';
                }
            }
        });
        
        // 2. Trim Whitespace from bottom
        const trimmedCanvas = trimCanvas(rawCanvas);

        // 3. SMART FIT: Resize the high-res canvas down to the EXACT target width
        // This ensures pixel-perfect fit for the thermal printer head
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = targetWidthPx;
        finalCanvas.height = (trimmedCanvas.height / trimmedCanvas.width) * targetWidthPx;
        
        const ctx = finalCanvas.getContext('2d');
        if (!ctx) throw new Error("Could not get context");

        // KEY FIX: Disable smoothing for sharper text edges on thermal printers
        // When downscaling text for monochrome/thermal printing, smoothing creates blurry gray pixels.
        // Nearest-neighbor (smoothing = false) keeps edges sharp black/white.
        ctx.imageSmoothingEnabled = false; 
        
        // Fill white background just in case
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
        
        // Draw the trimmed (large) canvas into the exact-width canvas
        ctx.drawImage(trimmedCanvas, 0, 0, finalCanvas.width, finalCanvas.height);
        
        const base64 = finalCanvas.toDataURL('image/png');
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
    getRouteItemsForPrinter: (items: OrderItem[], printerName: string, allPrinters: KitchenPrinterSettings[]): OrderItem[] => {
        if (allPrinters.length <= 1) {
            return items;
        }

        const nameLower = (printerName || '').toLowerCase();
        
        const isDrinkPrinter = /บาร์น้ำ|น้ำ|เครื่องดื่ม|drink|bar|beverage|cafe|กาแฟ|ชา|เบียร์|เหล้า|wine|cocktail|juice/i.test(nameLower);
        const isDessertPrinter = /ของหวาน|ขนม|หวาน|dessert|bakery|cake|เค้ก|ไอศกรีม|ice cream|crepe|waffle/i.test(nameLower);
        const isFoodPrinter = !isDrinkPrinter && !isDessertPrinter;

        const isDrinkItem = (item: OrderItem) => {
            const cat = (item.category || '').toLowerCase();
            return /เครื่องดื่ม|น้ำ|กาแฟ|ชา|ชาไข่มุก|บาร์|เหล้า|เบียร์|wine|drink|beverage/i.test(cat);
        };

        const isDessertItem = (item: OrderItem) => {
            const cat = (item.category || '').toLowerCase();
            return /ของหวาน|ขนม|หวาน|เค้ก|dessert|bakery|cake|ice cream/i.test(cat);
        };

        // Filter items
        let filtered = items.filter(item => {
            if (isDrinkPrinter) {
                return isDrinkItem(item);
            }
            if (isDessertPrinter) {
                return isDessertItem(item);
            }
            if (isFoodPrinter) {
                return !isDrinkItem(item) && !isDessertItem(item);
            }
            return false;
        });

        // Fallback mechanism to prevent orphan items
        const firstFoodPrinter = allPrinters.find(p => {
            const pName = (p.name || '').toLowerCase();
            return !/บาร์น้ำ|น้ำ|เครื่องดื่ม|drink|bar|beverage|cafe|กาแฟ|ชา|เบียร์|เหล้า|wine|cocktail|juice/i.test(pName) &&
                   !/ของหวาน|ขนม|หวาน|dessert|bakery|cake|เค้ก|ไอศกรีม|ice cream|crepe|waffle/i.test(pName);
        });

        const isFirstFoodPrinter = firstFoodPrinter ? firstFoodPrinter.id === allPrinters.find(p => p.name === printerName)?.id : false;
        const isFallbackPrinter = isFirstFoodPrinter || (!allPrinters.some(p => {
            const pName = (p.name || '').toLowerCase();
            return !/บาร์น้ำ|น้ำ|เครื่องดื่ม|drink|bar|beverage|cafe|กาแฟ|ชา|เบียร์|เหล้า|wine|cocktail|juice/i.test(pName) &&
                   !/ของหวาน|ขนม|หวาน|dessert|bakery|cake|เค้ก|ไอศกรีม|ice cream|crepe|waffle/i.test(pName);
        }) && allPrinters[0]?.name === printerName);

        if (isFallbackPrinter) {
            const leftoverItems = items.filter(item => !isDrinkItem(item) && !isDessertItem(item));
            leftoverItems.forEach(item => {
                if (!filtered.some(f => f.cartItemId === item.cartItemId)) {
                    filtered.push(item);
                }
            });
        }

        return filtered;
    },

    printSingleKitchenOrder: async (order: ActiveOrder, config: KitchenPrinterSettings): Promise<void> => {
        if (!config.ipAddress) throw new Error("ไม่ได้ตั้งค่า IP ของ Print Server");

        const url = `http://${config.ipAddress}:${config.port || 3000}/print-image`;
        const is58mm = config.paperWidth === '58mm';
        
        // Use smart fit constants
        const targetWidth = is58mm ? TARGET_WIDTH_58MM : TARGET_WIDTH_80MM;
        
        // Font Sizes adjusted for 360px/550px widths (Big & Clear)
        const fsNormal = is58mm ? '24px' : '28px'; 
        const fsLarge = is58mm ? '32px' : '40px';
        const fsXLarge = is58mm ? '48px' : '56px';
        
        // Reduced size for Item names (Requested by user for better aesthetics)
        const fsItem = is58mm ? '26px' : '34px'; 
        
        const displayOrderNumber = order.manualOrderNumber ? `#${order.manualOrderNumber}` : `#${String(order.orderNumber).padStart(3, '0')}`;
        const timeStr = new Date(order.orderTime).toLocaleTimeString('th-TH', {hour: '2-digit', minute:'2-digit'});

        // Generate Items HTML
        let itemsHtml = '';
        order.items.forEach(item => {
            // Options: Align with item name in the right column
            const optionsHtml = item.selectedOptions?.length > 0 
                ? `<div style="font-size: ${fsNormal}; color: #333; margin-top: 2px; font-weight: normal;">+ ${item.selectedOptions.map(o => o.name).join(', ')}</div>` 
                : '';
            
            // Notes: Align with item name
            const notesHtml = item.notes 
                ? `<div style="font-size: ${fsNormal}; font-weight: bold; background-color: #000; color: #fff; display: inline-block; padding: 5px 8px; border-radius: 4px; margin-top: 5px;">Note: ${item.notes}</div>` 
                : '';
            
            const isItemTakeaway = item.isTakeaway || order.orderType === 'lineman' || order.orderType === 'takeaway';

            // Takeaway Badge: Align with item name
            const takeawayHtml = (isItemTakeaway && order.orderType !== 'lineman')
                ? `<div style="font-size: ${fsNormal}; font-weight: 900; border: 2px solid #000; display: inline-block; padding: 2px 6px; margin-top: 5px;">กลับบ้าน</div>` 
                : '';

            // Cutlery: Align with item name
            let cutleryHtml = '';
            if (isItemTakeaway && item.takeawayCutlery && item.takeawayCutlery.length > 0) {
                let cutleryText = '';
                if (item.takeawayCutlery.includes('none')) {
                    cutleryText = 'ไม่รับ';
                } else {
                    cutleryText = item.takeawayCutlery.map(c => {
                        if (c === 'spoon-fork') return 'ช้อนส้อม';
                        if (c === 'chopsticks') return 'ตะเกียบ';
                        if (c === 'other') return item.takeawayCutleryNotes || 'อื่นๆ';
                        return '';
                    }).filter(Boolean).join(', ');
                }

                if (cutleryText) {
                    cutleryHtml = `<div style="font-size: ${fsNormal}; font-weight: bold; background-color: #000; color: #fff; display: inline-block; padding: 5px 8px; border-radius: 4px; margin-top: 5px;">รับ: ${cutleryText}</div>`;
                }
            }
            
            // NEW 2-Column Layout
            itemsHtml += `
                <div style="margin-bottom: 20px; border-bottom: 1px dotted #ccc; padding-bottom: 15px; display: flex; align-items: flex-start;">
                    <!-- Left Column: Quantity -->
                    <div style="width: 15%; min-width: 45px; text-align: right; font-size: ${fsItem}; font-weight: 900; line-height: 1.1; padding-right: 12px; flex-shrink: 0;">
                        ${item.quantity}x
                    </div>
                    
                    <!-- Right Column: Details -->
                    <div style="flex: 1; display: flex; flex-direction: column; align-items: flex-start;">
                        <div style="font-size: ${fsItem}; font-weight: 900; line-height: 1.1; word-break: break-word;">
                            ${item.name}
                        </div>
                        ${optionsHtml}
                        ${notesHtml}
                        ${takeawayHtml}
                        ${cutleryHtml}
                    </div>
                </div>
            `;
        });

        // Full Kitchen Template
        const htmlContent = `
            <div style="width: 100%; box-sizing: border-box; font-family: 'Sarabun', sans-serif; color: #000; padding: 5px;">
                <div style="text-align: center; margin-bottom: 5px; border-bottom: 3px solid #000; padding-bottom: 8px;">
                    <div style="font-size: ${fsNormal}; font-weight: bold;">ใบรายการอาหาร (ครัว)</div>
                    
                    <div style="font-size: ${fsXLarge}; font-weight: 900; margin: 10px 0 10px 0; line-height: 1; word-break: break-all;">${order.orderType === 'lineman' ? (order.tableName || 'Delivery') : `โต๊ะ ${order.tableName}`}</div>
                    
                    ${order.orderType !== 'lineman' ? `<div style="font-size: ${fsLarge}; font-weight: bold; margin-bottom: 10px;">(${order.floor})</div>` : ''}
                    
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; font-size: ${fsLarge}; font-weight: bold; padding-top: 8px;">
                        <span>Order: ${displayOrderNumber}</span>
                        <span>เวลา: ${timeStr}</span>
                    </div>
                </div>
                
                <div style="text-align: left; padding-top: 10px;">
                    ${itemsHtml}
                </div>
                
                <div style="border-top: 3px solid #000; margin-top: 10px; width: 100%; height: 1px;"></div>
                <div style="text-align: center; margin-top: 5px; font-size: ${fsNormal};">--- จบรายการ ---</div>
            </div>
        `;

        try {
            const base64Image = await generateImageFromHtml(htmlContent, targetWidth);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    image: base64Image,
                    connectionType: config.connectionType,
                    printerName: config.name || '',
                    targetPrinter: {
                        name: config.name || '',
                        printerName: config.name || '',
                        ip: config.targetPrinterIp || '',
                        port: config.targetPrinterPort || '9100',
                        vid: config.vid || '',
                        pid: config.pid || ''
                    }
                })
            });
            clearTimeout(timeoutId);

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `Server returned ${res.status}`);
            }
        } catch (error: any) {
            if (error.name === 'AbortError' || error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
                throw new Error(`ไม่สามารถเชื่อมต่อ Print Server (${config.ipAddress}:${config.port || 3000}) ได้ กรุณาตรวจสอบว่าเปิดโปรแกรม Print Server หรือยัง`);
            }
            throw new Error(error.message || 'พิมพ์ล้มเหลว');
        }
    },

    analyzeOrderRouting: (items: OrderItem[], allPrinters: KitchenPrinterSettings[]): {
        toPrint: { [printerIdOrName: string]: { printer: KitchenPrinterSettings, items: OrderItem[] } },
        unassigned: { item: OrderItem, guessedPrinterName: string }[]
    } => {
        const toPrint: { [printerIdOrName: string]: { printer: KitchenPrinterSettings, items: OrderItem[] } } = {};
        const unassigned: { item: OrderItem, guessedPrinterName: string }[] = [];

        if (allPrinters.length === 0) {
            return { toPrint, unassigned };
        }

        // 1. Identify which kitchen printers we have
        const drinkPrinters = allPrinters.filter(p => /บาร์น้ำ|น้ำ|เครื่องดื่ม|drink|bar|beverage|cafe|กาแฟ|ชา|เบียร์|เหล้า|wine|cocktail|juice/i.test(p.name || ''));
        const dessertPrinters = allPrinters.filter(p => /ของหวาน|ขนม|หวาน|dessert|bakery|cake|เค้ก|ไอศกรีม|ice cream|crepe|waffle/i.test(p.name || ''));
        const foodPrinters = allPrinters.filter(p => !drinkPrinters.includes(p) && !dessertPrinters.includes(p));

        const getGuessedPrinterForItem = (item: OrderItem): KitchenPrinterSettings => {
            const cat = (item.category || '').toLowerCase();
            const isDrink = /เครื่องดื่ม|น้ำ|กาแฟ|ชา|ชาไข่มุก|บาร์|เหล้า|เบียร์|wine|drink|beverage/i.test(cat);
            const isDessert = /ของหวาน|ขนม|หวาน|เค้ก|dessert|bakery|cake|ice cream/i.test(cat);

            if (isDrink && drinkPrinters.length > 0) {
                return drinkPrinters[0];
            }
            if (isDessert && dessertPrinters.length > 0) {
                return dessertPrinters[0];
            }
            if (foodPrinters.length > 0) {
                return foodPrinters[0];
            }
            return allPrinters[0];
        };

        items.forEach(item => {
            if (item.targetPrinterId) {
                // Find printer by ID or Name
                const foundPrinter = allPrinters.find(p => p.id === item.targetPrinterId || p.name === item.targetPrinterId);
                if (foundPrinter) {
                    const printerKey = foundPrinter.id || foundPrinter.name || 'default';
                    if (!toPrint[printerKey]) {
                        toPrint[printerKey] = { printer: foundPrinter, items: [] };
                    }
                    toPrint[printerKey].items.push(item);
                } else {
                    const guessed = getGuessedPrinterForItem(item);
                    unassigned.push({ item, guessedPrinterName: guessed.name || 'ไม่ทราบครัว' });
                }
            } else {
                const guessed = getGuessedPrinterForItem(item);
                unassigned.push({ item, guessedPrinterName: guessed.name || 'ไม่ทราบครัว' });
            }
        });

        return { toPrint, unassigned };
    },

    printKitchenOrder: async (order: ActiveOrder, config: KitchenPrinterSettings, allKitchens?: KitchenPrinterSettings[]): Promise<void> => {
        const kitchensToPrint = allKitchens && allKitchens.length > 0 ? allKitchens : (config ? [config] : []);
        if (kitchensToPrint.length === 0) {
            throw new Error("ไม่มีเครื่องพิมพ์ครัวให้ทำงาน");
        }

        const analysis = printerService.analyzeOrderRouting(order.items, kitchensToPrint);
        const errors: string[] = [];
        
        // 1. Print only the explicitly bound items
        for (const printerKey of Object.keys(analysis.toPrint)) {
            const { printer, items: routedItems } = analysis.toPrint[printerKey];
            if (!printer.ipAddress) continue;

            const subOrder: ActiveOrder = {
                ...order,
                items: routedItems
            };

            try {
                await printerService.printSingleKitchenOrder(subOrder, printer);
            } catch (err: any) {
                console.error(`[printerService] Printing to ${printer.name || 'unnamed kitchen printer'} failed:`, err);
                errors.push(`${printer.name || 'ครัว'}: ${err.message}`);
            }
        }

        // 2. Trigger warning popup alert for unassigned/Automatic items
        if (analysis.unassigned.length > 0) {
            const listHtml = analysis.unassigned.map(({ item, guessedPrinterName }) => 
                `<li><strong>${item.name}</strong> x${item.quantity} (ระบบคาดเดา: <span style="color: #2563eb; font-weight: bold;">${guessedPrinterName}</span>)</li>`
            ).join('');

            Swal.fire({
                title: 'พบเมนูที่ไม่มีการผูกเครื่องพิมพ์',
                html: `
                    <div style="text-align: left; font-size: 15px; font-family: 'Sarabun', sans-serif;">
                        <p style="margin-bottom: 10px; color: #dc2626; font-weight: bold;">⚠️ ออเดอร์ของเมนูเหล่านี้ไม่ได้ถูกส่งพิมพ์ไปยังห้องครัว:</p>
                        <ul style="list-style-type: decimal; padding-left: 20px; margin-bottom: 15px; line-height: 1.6;">
                            ${listHtml}
                        </ul>
                        <p style="color: #4b5563; font-size: 13px; margin-top: 10px; border-top: 1px solid #e5e7eb; padding-top: 10px;">
                            *กรุณาแจ้งพนักงานในครัวด้วยตนเอง หรือเข้าสู่โหมดแก้ไขเมนูเพื่อผูกเครื่องพิมพ์สำหรับการพิมพ์ครั้งถัดไป
                        </p>
                    </div>
                `,
                icon: 'warning',
                confirmButtonText: 'รับทราบ',
                confirmButtonColor: '#2563eb'
            });
        }

        if (errors.length > 0) {
            throw new Error(errors.join(', '));
        }
    },

    // --- 2. Receipt / Check Bill Printing ---
    printReceipt: async (order: CompletedOrder, config: CashierPrinterSettings, restaurantName: string, logoUrl?: string | null, qrCodeUrl?: string | null): Promise<void> => {
        if (!config.ipAddress) throw new Error("ไม่ได้ตั้งค่า IP ของ Print Server");

        const url = `http://${config.ipAddress}:${config.port || 3000}/print-image`;
        const is58mm = config.paperWidth === '58mm';
        
        // Use smart fit constants
        const targetWidth = is58mm ? TARGET_WIDTH_58MM : TARGET_WIDTH_80MM;
        
        const opts = config.receiptOptions;

        // Optimized Font Sizes for Receipt (Bigger!)
        const fsSmall = is58mm ? '22px' : '24px';
        const fsNormal = is58mm ? '26px' : '28px';
        const fsLarge = is58mm ? '32px' : '36px';
        const fsXLarge = is58mm ? '40px' : '46px';

        // Header Logic
        let headerHtml = '';
        if (logoUrl && opts.showLogo) {
            // FIX: Increased max-height for larger logo and centered it using display: block and margin: 0 auto
            headerHtml += `<div style="text-align: center; margin-bottom: 5px;"><img src="${logoUrl}" style="max-height: 150px; max-width: 100%; object-fit: contain; display: block; margin: 0 auto;" crossOrigin="anonymous"/></div>`;
        }
        if (opts.showRestaurantName) {
            headerHtml += `<div style="font-size: ${fsLarge}; font-weight: 900; line-height: 1.2; margin-bottom: 4px; text-align: center;">${restaurantName}</div>`;
        }
        if (opts.showAddress && opts.address) {
            headerHtml += `<div style="font-size: ${fsSmall}; text-align: center; line-height: 1.3; margin-bottom: 2px; padding: 0 5px;">${opts.address}</div>`;
        }
        if (opts.showPhoneNumber && opts.phoneNumber) {
            headerHtml += `<div style="font-size: ${fsSmall}; text-align: center;">โทร: ${opts.phoneNumber}</div>`;
        }

        // Items Logic with Table Layout for Alignment
        let itemsHtml = '';
        if (opts.showItems) {
            itemsHtml += `<table style="width: 100%; font-size: ${fsNormal}; border-collapse: collapse; margin-bottom: 5px; table-layout: fixed;">`;
            // FIX: Padding bottom added to headers to prevent line intersection
            // FIX: Border bottom moved to headers instead of row
            itemsHtml += `
                <tr style="">
                    <th style="text-align:left; width: ${is58mm ? '55%' : '60%'}; padding-bottom: 8px; border-bottom: 2px solid #000;">รายการ</th>
                    <th style="text-align:right; width: ${is58mm ? '15%' : '15%'}; padding-bottom: 8px; border-bottom: 2px solid #000;">Qty</th>
                    <th style="text-align:right; width: ${is58mm ? '30%' : '25%'}; padding-bottom: 8px; border-bottom: 2px solid #000;">รวม</th>
                </tr>`;
            
            order.items.forEach(item => {
                const itemTotal = (item.finalPrice * item.quantity).toFixed(2);
                itemsHtml += `
                    <tr>
                        <td style="padding-top: 8px; padding-bottom: 4px; vertical-align: top; word-wrap: break-word; overflow-wrap: break-word; padding-right: 2px;">
                            <div style="font-weight: bold; line-height: 1.2;">${item.name}</div>
                            ${item.selectedOptions.length > 0 ? `<div style="font-size: ${fsSmall}; font-weight: normal; color: #333;">- ${item.selectedOptions.map(o=>o.name).join(', ')}</div>` : ''}
                        </td>
                        <td style="text-align: right; vertical-align: top; padding-top: 8px;">${item.quantity}</td>
                        <td style="text-align: right; vertical-align: top; padding-top: 8px;">${itemTotal}</td>
                    </tr>
                `;
            });
            itemsHtml += `</table>`;
        }

        // Totals Logic
        const subtotal = order.items.reduce((s, i) => s + i.finalPrice * i.quantity, 0);
        const total = subtotal + order.taxAmount;
        // FIX: Increased top padding for totals
        let totalsHtml = `<div style="font-size: ${fsNormal}; border-top: 2px dotted #000; padding-top: 10px; margin-top: 10px;">`;
        
        if (opts.showSubtotal) totalsHtml += `<div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>รวมเงิน</span><span>${subtotal.toFixed(2)}</span></div>`;
        if (opts.showTax && order.taxAmount > 0) totalsHtml += `<div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>ภาษี (${order.taxRate}%)</span><span>${order.taxAmount.toFixed(2)}</span></div>`;
        if (opts.showTotal) totalsHtml += `<div style="display: flex; justify-content: space-between; font-weight: 900; font-size: ${fsLarge}; margin-top: 8px; border-top: 1px solid #000; padding-top: 8px;"><span>ยอดสุทธิ</span><span>${total.toFixed(2)}</span></div>`;
        if (opts.showPaymentMethod) {
            const method = order.paymentDetails.method === 'cash' ? 'เงินสด' : 'โอนจ่าย';
            totalsHtml += `<div style="text-align: center; margin-top: 12px; font-size: ${fsSmall};">(ชำระโดย: ${method})</div>`;
        }
        totalsHtml += `</div>`;

        // NEW: QR Code Logic
        let qrCodeHtml = '';
        if (qrCodeUrl && opts.showQrCode) {
            qrCodeHtml = `
                <div style="text-align: center; margin-top: 15px; padding-top: 15px; border-top: 1px dashed #000;">
                    <div style="font-size: ${fsNormal}; font-weight: bold; margin-bottom: 8px;">สแกนเพื่อชำระเงิน</div>
                    <img src="${qrCodeUrl}" style="max-height: 200px; max-width: 200px; object-fit: contain; display: block; margin: 0 auto;" crossOrigin="anonymous"/>
                </div>
            `;
        }

        // Full Receipt Template
        const htmlContent = `
            <div style="width: 100%; box-sizing: border-box; font-family: 'Sarabun', sans-serif; color: #000; padding: 5px 0;">
                ${headerHtml}
                <div style="border-bottom: 1px dashed #000; margin: 10px 0;"></div>
                <div style="text-align: center; font-size: ${fsLarge}; font-weight: bold; margin-bottom: 10px;">ใบเสร็จรับเงิน</div>
                
                <div style="font-size: ${fsSmall}; margin-bottom: 12px; line-height: 1.4;">
                    ${opts.showTable ? `<div>โต๊ะ: <span style="font-weight:bold; font-size: ${fsNormal};">${order.tableName}</span></div>` : ''}
                    ${opts.showOrderId ? `<div>Order: #${order.orderNumber}</div>` : ''}
                    ${opts.showDateTime ? `<div>วันที่: ${new Date(order.completionTime).toLocaleString('th-TH')}</div>` : ''}
                    ${opts.showStaff && order.completedBy ? `<div>พนักงาน: ${order.completedBy}</div>` : ''}
                </div>

                ${itemsHtml}
                ${totalsHtml}

                ${opts.showThankYouMessage && opts.thankYouMessage ? `<div style="text-align: center; margin-top: 20px; font-size: ${fsNormal}; font-weight: bold; line-height: 1.8; padding-bottom: 15px;">*** ${opts.thankYouMessage} ***</div>` : ''}
                ${qrCodeHtml}
            </div>
        `;

        try {
            const base64Image = await generateImageFromHtml(htmlContent, targetWidth);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    image: base64Image,
                    connectionType: config.connectionType,
                    printerName: (config as any).name || '',
                    // Use VID/PID for Star Micronics support
                    targetPrinter: {
                        name: (config as any).name || '',
                        printerName: (config as any).name || '',
                        ip: config.targetPrinterIp || '',
                        port: config.targetPrinterPort || '9100',
                        vid: config.vid || '',
                        pid: config.pid || ''
                    }
                })
            });
            clearTimeout(timeoutId);

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `Server returned ${res.status}`);
            }
        } catch (error: any) {
            if (error.name === 'AbortError' || error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
                throw new Error(`ไม่สามารถเชื่อมต่อ Print Server (${config.ipAddress}:${config.port || 3000}) ได้ กรุณาตรวจสอบว่าเปิดโปรแกรม Print Server หรือยัง`);
            }
            throw new Error(error.message || 'พิมพ์ล้มเหลว');
        }
    },

    // --- 3. Check Bill (Preliminary Bill) ---
    printBill: async (order: ActiveOrder, config: CashierPrinterSettings, restaurantName: string, logoUrl?: string | null, qrCodeUrl?: string | null): Promise<void> => {
        const is58mm = config.paperWidth === '58mm';
        
        // Use smart fit constants
        const targetWidth = is58mm ? TARGET_WIDTH_58MM : TARGET_WIDTH_80MM;
        
        const subtotal = order.items.reduce((s, i) => s + i.finalPrice * i.quantity, 0);
        const total = subtotal + order.taxAmount;

        // Optimized Font Sizes (Bigger!)
        const fsSmall = is58mm ? '22px' : '24px';
        const fsNormal = is58mm ? '26px' : '28px';
        const fsLarge = is58mm ? '32px' : '36px';
        const fsXLarge = is58mm ? '40px' : '46px';

        let qrCodeHtml = '';
        if (qrCodeUrl) {
            qrCodeHtml = `
                <div style="text-align: center; margin-top: 15px; padding-top: 15px; border-top: 1px dashed #000;">
                    <div style="font-size: ${fsNormal}; font-weight: bold; margin-bottom: 8px;">สแกนเพื่อชำระเงิน</div>
                    <img src="${qrCodeUrl}" style="max-height: 200px; max-width: 200px; object-fit: contain; display: block; margin: 0 auto;" crossOrigin="anonymous"/>
                </div>
            `;
        }

        const htmlContent = `
            <div style="width: 100%; box-sizing: border-box; font-family: 'Sarabun', sans-serif; color: #000; padding: 5px 0;">
                <div style="text-align: center; margin-bottom: 5px;">
                    <div style="font-size: ${fsLarge}; font-weight: 900; line-height: 1.2;">${restaurantName}</div>
                    <div style="font-size: ${fsNormal}; font-weight: bold; margin-top: 2px;">ใบแจ้งรายการ (Check Bill)</div>
                    <div style="font-size: ${fsSmall}; color: #555;">(ยังไม่ได้ชำระเงิน)</div>
                </div>
                
                <div style="border-bottom: 1px dashed #000; margin: 5px 0;"></div>

                <div style="font-size: ${fsSmall}; margin-bottom: 10px; line-height: 1.4;">
                    <div>โต๊ะ: <span style="font-weight:bold; font-size: ${fsNormal};">${order.tableName}</span></div>
                    <div>Order: #${order.orderNumber}</div>
                    <div>เวลา: ${new Date().toLocaleString('th-TH')}</div>
                </div>

                <table style="width: 100%; font-size: ${fsNormal}; border-collapse: collapse; margin-bottom: 5px; table-layout: fixed;">
                    <tr style="">
                        <th style="text-align:left; width: ${is58mm ? '55%' : '60%'}; padding-bottom: 8px; border-bottom: 2px solid #000;">รายการ</th>
                        <th style="text-align:right; width: ${is58mm ? '45%' : '40%'}; padding-bottom: 8px; border-bottom: 2px solid #000;">รวม</th>
                    </tr>
                    ${order.items.map(item => `
                        <tr>
                            <td style="padding-top: 8px; padding-bottom: 4px; word-wrap: break-word; overflow-wrap: break-word;">${item.quantity} x ${item.name}</td>
                            <td style="text-align: right; vertical-align: top; padding-top: 8px;">${(item.finalPrice * item.quantity).toFixed(2)}</td>
                        </tr>
                    `).join('')}
                </table>

                <div style="border-top: 2px dotted #000; padding-top: 10px; margin-top: 10px;">
                    <div style="display: flex; justify-content: space-between; font-size: ${fsNormal}; margin-bottom: 4px;">
                        <span>ยอดรวม</span><span>${subtotal.toFixed(2)}</span>
                    </div>
                    ${order.taxAmount > 0 ? `<div style="display: flex; justify-content: space-between; font-size: ${fsNormal}; margin-bottom: 4px;"><span>ภาษี (${order.taxRate}%)</span><span>${order.taxAmount.toFixed(2)}</span></div>` : ''}
                    <div style="display: flex; justify-content: space-between; font-size: ${fsXLarge}; font-weight: 900; margin-top: 8px; padding-top: 8px; border-top: 1px solid #000;">
                        <span>ยอดสุทธิ</span><span>${total.toFixed(2)}</span>
                    </div>
                </div>
                ${qrCodeHtml}
            </div>
        `;

        const url = `http://${config.ipAddress}:${config.port || 3000}/print-image`;
        try {
            const base64Image = await generateImageFromHtml(htmlContent, targetWidth);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    image: base64Image,
                    connectionType: config.connectionType,
                    printerName: (config as any).name || '',
                    targetPrinter: {
                        name: (config as any).name || '',
                        printerName: (config as any).name || '',
                        ip: config.targetPrinterIp || '',
                        port: config.targetPrinterPort || '9100',
                        vid: config.vid || '',
                        pid: config.pid || ''
                    }
                })
            });
            clearTimeout(timeoutId);

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `Server returned ${res.status}`);
            }
        } catch (error: any) {
            if (error.name === 'AbortError' || error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
                throw new Error(`ไม่สามารถเชื่อมต่อ Print Server (${config.ipAddress}:${config.port || 3000}) ได้ กรุณาตรวจสอบว่าเปิดโปรแกรม Print Server หรือยัง`);
            }
            throw new Error(error.message || 'พิมพ์ล้มเหลว');
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
        
        const is58mm = config.paperWidth === '58mm';
        
        // Use smart fit constants
        const targetWidth = is58mm ? TARGET_WIDTH_58MM : TARGET_WIDTH_80MM;
        
        const qrSize = is58mm ? 200 : 300;
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(customerUrl)}`;
        
        // Font sizes
        const fsTitle = is58mm ? '28px' : '36px';
        const fsSub = is58mm ? '20px' : '24px';
        
        const html = `
            <div style="text-align: center; padding: 10px; font-family: 'Sarabun', sans-serif; width: 100%; box-sizing: border-box; color: #000;">
                <div style="font-size: ${fsTitle}; font-weight: 900; line-height: 1.2;">${table.name}</div>
                <div style="font-size: ${fsSub}; margin-bottom: 5px;">(${table.floor})</div>
                <div style="border-top: 3px solid #000; margin: 5px 0;"></div>
                <div style="margin: 10px auto; width: ${qrSize}px; height: ${qrSize}px; border: 3px solid #000; padding: 5px;">
                    <img src="${qrApiUrl}" style="width: 100%; height: 100%;" />
                </div>
                <div style="font-size: ${fsSub}; font-weight: bold; margin-top: 10px;">สแกนเพื่อสั่งอาหาร</div>
                <div style="font-size: 16px;">Scan to Order</div>
            </div>
        `;

        const imageBase64 = await generateImageFromHtml(html, targetWidth);
        const url = `http://${config.ipAddress}:${config.port || 3000}/print-image`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    image: imageBase64,
                    connectionType: config.connectionType,
                    printerName: config.name || '',
                    targetPrinter: {
                        name: config.name || '',
                        printerName: config.name || '',
                        ip: config.targetPrinterIp || '',
                        port: config.targetPrinterPort || '9100',
                        vid: config.vid || '',
                        pid: config.pid || ''
                    }
                })
            });
            clearTimeout(timeoutId);
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `Server returned ${res.status}`);
            }
        } catch (error: any) {
            if (error.name === 'AbortError' || error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
                throw new Error(`ไม่สามารถเชื่อมต่อ Print Server (${config.ipAddress}:${config.port || 3000}) ได้ กรุณาตรวจสอบว่าเปิดโปรแกรม Print Server หรือยัง`);
            }
            throw new Error(error.message || 'พิมพ์ล้มเหลว');
        }
    },

    // --- 6. Test & Check ---
    printTest: async (ip: string, paperWidth: string, port: string, targetPrinterIp?: string, targetPrinterPort?: string, connectionType: PrinterConnectionType = 'network', vid?: string, pid?: string, printerName?: string): Promise<boolean> => {
        const url = `http://${ip}:${port || 3000}/print-image`;
        
        const is58mm = paperWidth === '58mm';
        const targetWidth = is58mm ? TARGET_WIDTH_58MM : TARGET_WIDTH_80MM;
        
        // --- UPDATED FONT SIZES FOR TEST PRINT ---
        // Matching the user's request for larger text like the reference image
        const fsTitle = is58mm ? '32px' : '48px'; 
        const fsNormal = is58mm ? '22px' : '32px';
        const fsSmall = is58mm ? '18px' : '22px';

        const html = `
            <div style="width: 100%; box-sizing: border-box; font-family: 'Sarabun', sans-serif; text-align: center; border: 2px solid #000; padding: 5px; color: #000; word-wrap: break-word; overflow-wrap: break-word;">
                <div style="font-size: ${fsTitle}; font-weight: 900; line-height: 1.2;">TEST PRINT</div>
                <div style="font-size: ${fsNormal}; font-weight: bold; margin-top: 2px; line-height: 1.2;">ทดสอบภาษาไทย</div>
                <div style="font-size: ${fsSmall};">(Sarabun Font)</div>
                <hr style="margin: 5px 0; border-top: 1px solid #000;" />
                <div style="font-size: ${fsSmall}; text-align: left; padding-left: 2px; font-weight: bold; line-height: 1.3;">
                    <div>Mode: ${connectionType.toUpperCase()}</div>
                    ${connectionType === 'usb' ? `<div style="word-break: break-all;">VID:${vid || '-'} PID:${pid || '-'}</div>` : ''}
                    <div>Date: ${new Date().toLocaleDateString('th-TH')}</div>
                </div>
                <div style="font-size: ${fsTitle}; margin-top: 5px; font-weight: bold;">OK ✅</div>
            </div>
        `;

        try {
            const imageBase64 = await generateImageFromHtml(html, targetWidth);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    image: imageBase64,
                    connectionType,
                    printerName: printerName || '',
                    targetPrinter: { 
                        name: printerName || '',
                        printerName: printerName || '',
                        ip: targetPrinterIp || '', 
                        port: targetPrinterPort || '9100',
                        vid: vid || '', 
                        pid: pid || '' 
                    }
                })
            });
            clearTimeout(timeoutId);
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `Server returned ${res.status}`);
            }
            return res.ok;
        } catch (error: any) {
            console.error("Test print error:", error);
            if (error.name === 'AbortError' || error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
                throw new Error(`ไม่สามารถเชื่อมต่อ Print Server (${ip}:${port || 3000}) ได้ กรุณาตรวจสอบว่าเปิดโปรแกรม Print Server หรือยัง`);
            }
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