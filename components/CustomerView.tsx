
// ... imports
import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { MenuItem, Table, OrderItem, ActiveOrder, StaffCall, CompletedOrder } from '../types';
import { Menu } from './Menu';
import { ItemCustomizationModal } from './ItemCustomizationModal';
import Swal from 'sweetalert2';
import { GoogleGenAI } from "@google/genai";

declare var html2canvas: any;

interface CustomerViewProps {
    table: Table;
    menuItems: MenuItem[];
    categories: string[];
    activeOrders: ActiveOrder[];
    allBranchOrders: ActiveOrder[]; // Added to calculate global queue position and find merged items
    completedOrders: CompletedOrder[];
    onPlaceOrder: (items: OrderItem[], customerName: string, customerCount: number) => Promise<void> | void;
    onStaffCall: (table: Table, customerName: string) => void;
    recommendedMenuItemIds: number[];
    logoUrl: string | null;
    restaurantName: string;
}

export const CustomerView: React.FC<CustomerViewProps> = ({
    table,
    menuItems,
    categories,
    activeOrders,
    allBranchOrders,
    completedOrders,
    onPlaceOrder,
    onStaffCall,
    recommendedMenuItemIds,
    logoUrl,
    restaurantName,
}) => {
    // ... state ...
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [customerName, setCustomerName] = useState('');
    const [pinInput, setPinInput] = useState('');
    
    // --- CART PERSISTENCE ---
    const cartKey = `customer_cart_${table.id}`;
    const [cartItems, setCartItems] = useState<OrderItem[]>(() => {
        const savedCart = localStorage.getItem(cartKey);
        try {
            return savedCart ? JSON.parse(savedCart) : [];
        } catch (e) {
            console.error(`Error parsing cart for table ${table.id}`, e);
            localStorage.removeItem(cartKey);
            return [];
        }
    });

    // --- MY ORDERS PERSISTENCE (To track items even after merge) ---
    const myOrdersKey = `customer_my_orders_${table.id}`;
    const [myOrderNumbers, setMyOrderNumbers] = useState<number[]>(() => {
        const saved = localStorage.getItem(myOrdersKey);
        try {
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });

    const [language, setLanguage] = useState<'th' | 'en'>('th');
    const [translations, setTranslations] = useState<Record<string, string> | null>(null);
    const [isTranslating, setIsTranslating] = useState(false);

    useEffect(() => {
        localStorage.setItem(cartKey, JSON.stringify(cartItems));
    }, [cartItems, cartKey]);

    useEffect(() => {
        localStorage.setItem(myOrdersKey, JSON.stringify(myOrderNumbers));
    }, [myOrderNumbers, myOrdersKey]);


    const [isCartOpen, setIsCartOpen] = useState(false);
    const [isActiveOrderListOpen, setIsActiveOrderListOpen] = useState(false);
    const [itemToCustomize, setItemToCustomize] = useState<MenuItem | null>(null);
    const billContentRef = useRef<HTMLDivElement>(null);
    
    // Used to detect when *all* my items are gone (paid)
    const prevMyItemsCountRef = useRef<number>(0);
    const isProcessingPaymentRef = useRef(false);
    
    // --- Session Persistence Logic ---
    useEffect(() => {
        const sessionKey = `customer_session_${table.id}`;
        const savedSession = localStorage.getItem(sessionKey);
        
        if (savedSession) {
            try {
                const { name, pin } = JSON.parse(savedSession);

                if (table.activePin) {
                    if (pin === table.activePin) {
                        setCustomerName(name);
                        setPinInput(pin);
                        setIsAuthenticated(true);
                    } else {
                        localStorage.removeItem(sessionKey);
                    }
                }
            } catch (e) {
                localStorage.removeItem(sessionKey);
            }
        }
    }, [table.id, table.activePin]);

    const handleLogout = () => {
        const sessionKey = `customer_session_${table.id}`;
        localStorage.removeItem(sessionKey);
        localStorage.removeItem(cartKey);
        localStorage.removeItem(myOrdersKey); // Clear my orders on explicit logout
        localStorage.removeItem('customerSelectedBranch');

        setIsAuthenticated(false);
        setCustomerName('');
        setPinInput('');
        setCartItems([]);
        setMyOrderNumbers([]);
        setIsCartOpen(false);
        setIsActiveOrderListOpen(false);
        isProcessingPaymentRef.current = false;
    };

    // --- IDENTIFY MY ITEMS (Even if merged) ---
    // We scan ALL branch orders because if a bill is merged to another table, it won't be in 'activeOrders' (which is filtered by table).
    // We look for items that have an 'originalOrderNumber' matching one of 'myOrderNumbers'.
    const myItems = useMemo(() => {
        try {
            const items: OrderItem[] = [];
            if (myOrderNumbers.length === 0) return items;

            const myOrderSet = new Set(myOrderNumbers);

            if (Array.isArray(allBranchOrders)) {
                allBranchOrders.forEach(order => {
                    // Safety check: ensure order and order.items exist
                    if (order && Array.isArray(order.items)) {
                        order.items.forEach(item => {
                            if (!item) return; // Safety check for null items
                            // Check if this item originated from one of my orders
                            const originId = item.originalOrderNumber ?? order.orderNumber;
                            if (myOrderSet.has(originId)) {
                                items.push(item);
                            }
                        });
                    }
                });
            }
            return items;
        } catch (e) {
            console.error("Error calculating myItems:", e);
            return [];
        }
    }, [allBranchOrders, myOrderNumbers]);

    // Calculate totals specifically for ME
    const myTotal = useMemo(() => {
        try {
            return myItems.reduce((sum, item) => sum + (item.finalPrice * item.quantity), 0);
        } catch (e) {
            console.error("Error calculating myTotal:", e);
            return 0;
        }
    }, [myItems]);

    // Auto-add new orders to "My Orders" if I placed them
    useEffect(() => {
        if (!isAuthenticated || !customerName) return;

        try {
            // Scan active orders for this table. If we find an order with my name that I don't track yet, track it.
            // This handles the immediate update after placing an order.
            const newMyOrderIds: number[] = [];
            activeOrders.forEach(order => {
                if (order && order.customerName === customerName && !myOrderNumbers.includes(order.orderNumber)) {
                    newMyOrderIds.push(order.orderNumber);
                }
            });

            if (newMyOrderIds.length > 0) {
                setMyOrderNumbers(prev => [...prev, ...newMyOrderIds]);
            }
        } catch (e) {
            console.error("Error updating myOrderNumbers:", e);
        }
    }, [activeOrders, customerName, isAuthenticated, myOrderNumbers]);


    // --- Detect Payment & Trigger Save Bill/Logout Flow ---
    useEffect(() => {
        if (!isAuthenticated) return;
    
        const currentCount = myItems.length;
        const prevCount = prevMyItemsCountRef.current;
    
        if (prevCount > 0 && currentCount === 0 && !isProcessingPaymentRef.current) {
            isProcessingPaymentRef.current = true;
    
            // Find the most recently completed order that belongs to me
            const myJustCompletedOrders = completedOrders.filter(o =>
                myOrderNumbers.some(myNum =>
                    o.orderNumber === myNum || (o.mergedOrderNumbers && o.mergedOrderNumbers.includes(myNum))
                )
            );
    
            const latestCompletedOrder = myJustCompletedOrders.sort((a, b) => b.completionTime - a.completionTime)[0];
    
            if (!latestCompletedOrder) {
                // Failsafe: if we can't find the order, show a simple message and log out.
                Swal.fire({
                    title: 'ขอบคุณที่มาอุดหนุนครับ/ค่ะ 🙏',
                    text: "รายการของคุณชำระเงินเรียบร้อยแล้ว",
                    icon: 'success',
                    confirmButtonText: 'ออกจากระบบ',
                    allowOutsideClick: false,
                }).then(() => {
                    handleLogout();
                });
                return;
            }
    
            // Build the bill HTML for display and for html2canvas
            const subtotal = latestCompletedOrder.items.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
            const total = subtotal + latestCompletedOrder.taxAmount;
    
            const billHtml = `
                <div id="customer-final-bill" class="text-left p-4 bg-white font-sans text-black">
                    ${logoUrl ? `<img src="${logoUrl}" alt="Logo" class="mx-auto h-20 w-auto object-contain mb-4" crossOrigin="anonymous" />` : ''}
                    <h3 class="text-center text-xl font-bold mb-2">${restaurantName}</h3>
                    <p class="text-center text-xs text-gray-500 mb-4">ใบเสร็จรับเงิน (อย่างย่อ)</p>
                    <div class="text-sm space-y-1 mb-4">
                        <p><strong>โต๊ะ:</strong> ${latestCompletedOrder.tableName}</p>
                        <p><strong>ลูกค้า:</strong> ${customerName}</p>
                        <p><strong>วันที่:</strong> ${new Date(latestCompletedOrder.completionTime).toLocaleString('th-TH')}</p>
                    </div>
                    <div class="border-t border-b border-dashed border-gray-400 py-2 my-2 space-y-1 text-sm">
                        ${latestCompletedOrder.items.map(item => `
                            <div class="flex justify-between">
                                <span class="pr-2">${item.quantity}x ${item.name}</span>
                                <span>${(item.finalPrice * item.quantity).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                        `).join('')}
                    </div>
                    <div class="text-sm space-y-1 mt-4">
                         <div class="flex justify-between">
                            <span>ยอดรวม</span>
                            <span>${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</span>
                        </div>
                        ${latestCompletedOrder.taxAmount > 0 ? `
                        <div class="flex justify-between">
                            <span>ภาษี (${latestCompletedOrder.taxRate}%)</span>
                            <span>${latestCompletedOrder.taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</span>
                        </div>
                        ` : ''}
                        <div class="flex justify-between font-bold text-base mt-2 pt-2 border-t border-gray-400">
                            <span>ยอดสุทธิ</span>
                            <span>${total.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</span>
                        </div>
                    </div>
                    <p class="text-center text-sm font-semibold mt-6">ขอบคุณที่มาอุดหนุนร้านเรานะคะ 🙏</p>
                </div>
            `;
    
            Swal.fire({
                title: 'ชำระเงินเรียบร้อย!',
                html: `<div class="max-h-60 overflow-y-auto border rounded-lg">${billHtml}</div><p class="mt-4">ท่านต้องการบันทึกบิลนี้หรือไม่?</p>`,
                icon: 'success',
                showDenyButton: true,
                confirmButtonText: 'ใช่, บันทึกบิล & ออก',
                denyButtonText: 'ไม่ใช่, ออกเลย',
                confirmButtonColor: '#3085d6',
                denyButtonColor: '#aaa',
                allowOutsideClick: false,
                // --- FIX: Capture DOM element before closing Swal using preConfirm ---
                preConfirm: async () => {
                    const billElement = document.getElementById('customer-final-bill');
                    if (billElement) {
                        try {
                            const canvas = await html2canvas(billElement, { scale: 2, useCORS: true });
                            return canvas.toDataURL('image/png');
                        } catch (err) {
                            console.error('Failed to save bill as image', err);
                            // Return null to indicate failure but don't crash Swal
                            return null;
                        }
                    }
                    return null;
                }
            }).then((result) => {
                if (result.isConfirmed) {
                    const imageUrl = result.value;
                    if (imageUrl) {
                        // Create download link
                        const link = document.createElement('a');
                        link.href = imageUrl;
                        link.download = `bill-${latestCompletedOrder.tableName}-${customerName}-${new Date().toISOString().slice(0, 10)}.png`;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);

                        Swal.fire({
                            title: t('บันทึกสำเร็จ!'),
                            text: t('บิลของคุณถูกบันทึกเป็นรูปภาพแล้ว'),
                            icon: 'success',
                            timer: 2000,
                            showConfirmButton: false
                        }).then(() => {
                            handleLogout();
                        });
                    } else {
                        // If result.value is null (capture failed)
                        Swal.fire(t('เกิดข้อผิดพลาด'), t('ไม่สามารถบันทึกบิลได้'), 'error')
                        .then(() => handleLogout());
                    }
                } else { 
                    // User clicked Deny (No) or closed
                    handleLogout();
                }
            });
        }
    
        prevMyItemsCountRef.current = currentCount;
    }, [myItems.length, isAuthenticated, completedOrders, myOrderNumbers, logoUrl, restaurantName, customerName]);
    

    // --- Monitor Session validity (PIN Changes) ---
    useEffect(() => {
        // If authenticated, but PIN doesn't match anymore
        if (isAuthenticated && table.activePin !== pinInput) {
            
            // If we are already processing a payment success flow, ignore this generic PIN reset logic
            if (isProcessingPaymentRef.current) return;

            // If I still have active items, allow me to stay (maybe just a PIN refresh) or show merged status
            if (myItems.length > 0) {
                // If items exist but PIN changed, it's weird but we shouldn't just kick if they are eating.
                // However, security-wise, if PIN changed, maybe we should re-verify?
                // For now, per requirement "don't logout if merged", we trust the session unless explicitly cleared.
                // But if the Table itself was cleared (no active orders at all on table), that's different.
                
                // If table is completely empty but I have items elsewhere (merged), I'm effectively a guest on another table now.
                // We'll let them stay to view their bill.
            } else {
                // No items and PIN changed? Likely a table reset for new customer.
                 Swal.fire({
                    title: 'สิ้นสุดการบริการ',
                    text: 'ขอบคุณที่ใช้บริการ 🙏',
                    timer: 2000,
                    showConfirmButton: false,
                    allowOutsideClick: false
                }).then(() => {
                    handleLogout();
                });
            }
        }
    }, [table.activePin, isAuthenticated, pinInput, myItems.length]);

    const checkSessionValidity = (): boolean => {
        // We relax the PIN check if the user has active items (might be merged/moved)
        if (myItems.length > 0) return true;
        if (table.activePin !== pinInput) {
            return false;
        }
        return true;
    };


    // Login Handler
    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (!customerName.trim()) {
            Swal.fire('กรุณาระบุชื่อ', 'โปรดใส่ชื่อของคุณ', 'warning');
            return;
        }
        if (pinInput !== table.activePin) {
            Swal.fire('รหัสไม่ถูกต้อง', 'กรุณาตรวจสอบรหัส PIN กับพนักงาน', 'error');
            return;
        }
        
        // Save session
        localStorage.setItem(`customer_session_${table.id}`, JSON.stringify({
            name: customerName.trim(),
            pin: pinInput
        }));

        setIsAuthenticated(true);
    };

    const handleSelectItem = (item: MenuItem) => {
        if (!checkSessionValidity()) return;
        setItemToCustomize(item);
    };

    const handleConfirmCustomization = (itemToAdd: OrderItem) => {
        if (!checkSessionValidity()) return;
        setCartItems(prev => {
            const existingItem = prev.find(i => i.cartItemId === itemToAdd.cartItemId);
            if (existingItem) {
                return prev.map(i => i.cartItemId === itemToAdd.cartItemId ? { ...i, quantity: i.quantity + itemToAdd.quantity } : i);
            }
            return [...prev, itemToAdd];
        });
        setItemToCustomize(null);
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: t('เพิ่มลงตะกร้าแล้ว'),
            showConfirmButton: false,
            timer: 1500
        });
    };

    const handleRemoveItem = (cartItemId: string) => {
        if (!checkSessionValidity()) return;
        setCartItems(prev => prev.filter(i => i.cartItemId !== cartItemId));
    };

    const handleSubmitOrder = async () => {
        if (!checkSessionValidity()) return;
        if (cartItems.length === 0) return;

        const result = await Swal.fire({
            title: t('ยืนยันการสั่งอาหาร?'),
            text: `${t('สั่งอาหาร')} ${cartItems.reduce((sum, i) => sum + i.quantity, 0)} ${t('รายการ')}`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: t('สั่งเลย'),
            cancelButtonText: t('ตรวจสอบก่อน'),
            confirmButtonColor: '#10B981'
        });

        if (result.isConfirmed) {
            if (!checkSessionValidity()) return;
            
            // Show loading state
            Swal.fire({
                title: t('กำลังส่งรายการ...'),
                allowOutsideClick: false,
                didOpen: () => { Swal.showLoading(); }
            });

            try {
                // Call onPlaceOrder (App.tsx handles this async)
                await onPlaceOrder(cartItems, customerName, 1); 
                
                // Clear cart immediately
                setCartItems([]);
                setIsCartOpen(false);

                // Show success message immediately here (since App.tsx modal isn't visible in customer mode)
                await Swal.fire({
                    icon: 'success',
                    title: t('สั่งอาหารสำเร็จ!'),
                    text: t('รายการอาหารถูกส่งเข้าครัวแล้ว'),
                    timer: 2500,
                    showConfirmButton: false
                });

            } catch (error) {
                console.error("Order failed", error);
                Swal.fire({
                    icon: 'error',
                    title: t('เกิดข้อผิดพลาด'),
                    text: t('ไม่สามารถสั่งอาหารได้ กรุณาลองใหม่อีกครั้ง'),
                });
            }
        }
    };

    const handleCallStaffClick = () => {
        if (!checkSessionValidity()) return;
        onStaffCall(table, customerName);
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: t('ส่งสัญญาณเรียกพนักงานแล้ว'),
            text: t('กรุณารอสักครู่...'),
            showConfirmButton: false,
            timer: 3000
        });
    };

    const handleSaveBillAsImage = async () => {
        if (!billContentRef.current) return;
    
        Swal.fire({
            title: t('กำลังสร้างรูปภาพ...'),
            text: t('กรุณารอสักครู่'),
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });
    
        try {
            const canvas = await html2canvas(billContentRef.current, {
                scale: 2, // Higher resolution
                useCORS: true, // For any external images if they exist
            });
            const image = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.href = image;
            link.download = `bill-table-${table.name}-${customerName}-${new Date().toISOString().slice(0, 10)}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            Swal.close();
            return Promise.resolve(); 
        } catch (error) {
            console.error('Error generating bill image:', error);
            Swal.fire({
                icon: 'error',
                title: t('เกิดข้อผิดพลาด'),
                text: t('ไม่สามารถสร้างรูปภาพได้'),
            });
            return Promise.reject();
        }
    };

    // Calculate Cart Totals
    const cartTotalAmount = useMemo(() => {
        try {
            return cartItems.reduce((sum, i) => sum + (i.finalPrice * i.quantity), 0);
        } catch (e) {
            console.error("Error calculating cartTotalAmount:", e);
            return 0;
        }
    }, [cartItems]);
    
    const totalCartItemsCount = useMemo(() => {
        try {
            return cartItems.reduce((sum, i) => sum + i.quantity, 0);
        } catch (e) {
            console.error("Error calculating totalCartItemsCount:", e);
            return 0;
        }
    }, [cartItems]);


    // --- Dynamic Order Status Logic (Personalized) ---
    const orderStatus = useMemo(() => {
        try {
            if (myItems.length === 0) return null;
            if (!Array.isArray(allBranchOrders) || allBranchOrders.length === 0) return null;

            // Check status of my items by looking at their parent orders in activeOrders/allBranchOrders
            // We need to find the status of the orders these items belong to.
            const myOrdersStatuses = new Set<string>();
            
            allBranchOrders.forEach(order => {
                // Safety check
                if (!order || !order.items) return;

                // If this order contains any of my items
                const hasMyItems = order.items.some(item => 
                    item && (
                        (item.originalOrderNumber && myOrderNumbers.includes(item.originalOrderNumber)) ||
                        myOrderNumbers.includes(order.orderNumber)
                    )
                );
                
                if (hasMyItems) {
                    myOrdersStatuses.add(order.status);
                }
            });

            if (myOrdersStatuses.has('cooking')) {
                return { text: t('กำลังปรุง... 🍳'), color: 'bg-orange-100 text-orange-700 border-orange-200' };
            }
            if (myOrdersStatuses.has('waiting')) {
                 const myOrders = allBranchOrders.filter(o => o.status === 'waiting' && myOrderNumbers.includes(o.orderNumber));
                 
                 // Handle empty array case for Math.min
                 let myEarliestOrderTime = Date.now();
                 if (myOrders.length > 0) {
                     myEarliestOrderTime = Math.min(...myOrders.map(o => o.orderTime));
                 }

                 const queueAhead = allBranchOrders.filter(o => 
                    (o.status === 'waiting' || o.status === 'cooking') && 
                    o.orderTime < myEarliestOrderTime
                ).length;
                return { text: `${t('รอคิว...')} (${queueAhead} ${t('คิว')}) ⏳`, color: 'bg-blue-100 text-blue-700 border-blue-200' };
            }
            
            return { text: t('เสิร์ฟครบแล้ว 😋'), color: 'bg-green-100 text-green-700 border-green-200' };
        } catch (e) {
            console.error("Error calculating orderStatus:", e);
            return null;
        }
    }, [myItems, allBranchOrders, myOrderNumbers, language, translations]);


    const t = (text: string): string => {
        if (language === 'th' || !translations) {
            return text;
        }
        return translations[text] || text;
    };
    
    const translateMenu = async () => {
        // ... (existing translateMenu logic)
        setIsTranslating(true);
        try {
            // Use the provided key as fallback or main key
            const apiKey = process.env.API_KEY || "AIzaSyCfQvFBBkaxteAf-R8dCbj9qew01UokHbs";

            // Check for API key availability
            if (!apiKey) {
                console.warn("Gemini API Key is missing. Translation skipped.");
                Swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'warning',
                    title: 'ระบบแปลภาษาไม่พร้อมใช้งาน',
                    showConfirmButton: false,
                    timer: 2000
                });
                setLanguage('th'); 
                return;
            }

            const ai = new GoogleGenAI({ apiKey: apiKey });
    
            const staticText = [
                'เมนูอาหาร 🍽️', 'โต๊ะ', 'คุณ', 'เรียกพนักงาน', 'ยอดของฉัน', 'ดูตะกร้า', 'ยังไม่รวมกับยอดบิล', 'รายการของฉัน',
                'ยังไม่มีรายการที่สั่ง', 'ยอดรวมของฉัน', '* ราคานี้เป็นเฉพาะรายการที่คุณสั่ง', 'บันทึกรายการของฉัน', 'ปิด',
                'รายการในตะกร้า (ยังไม่สั่ง)', 'ไม่มีสินค้าในตะกร้า', 'ยอดในตะกร้า', 'ยืนยันสั่งอาหาร 🚀', 'เพิ่มลงตะกร้าแล้ว',
                'ยืนยันการสั่งอาหาร?', 'สั่งอาหาร', 'รายการ', 'สั่งเลย', 'ตรวจสอบก่อน', 'ส่งสัญญาณเรียกพนักงานแล้ว', 'กรุณารอสักครู่...',
                'กำลังสร้างรูปภาพ...', 'เกิดข้อผิดพลาด', 'ไม่สามารถสร้างรูปภาพได้', 'กำลังปรุง... 🍳', 'รอคิว...', 'คิว', 'เสิร์ฟครบแล้ว 😋',
                'บันทึกสำเร็จ!', 'บิลของคุณถูกบันทึกเป็นรูปภาพแล้ว', 'สั่งอาหารสำเร็จ!', 'รายการอาหารถูกส่งเข้าครัวแล้ว',
                'กำลังส่งรายการ...', 'ไม่สามารถสั่งอาหารได้ กรุณาลองใหม่', 'เกิดข้อผิดพลาด'
            ];
    
            const dynamicText = new Set<string>();
            menuItems.forEach(item => {
                dynamicText.add(item.name);
                item.optionGroups?.forEach(group => {
                    dynamicText.add(group.name);
                    group.options.forEach(option => dynamicText.add(option.name));
                });
            });
            categories.forEach(cat => dynamicText.add(cat));
    
            const allText = [...staticText, ...Array.from(dynamicText)];
            const uniqueText = Array.from(new Set(allText));
            
            const textToTranslate: Record<string, string> = {};
            uniqueText.forEach(text => {
                textToTranslate[text] = text;
            });
    
            const prompt = `Translate the values of the following JSON object from Thai to English. Return ONLY the JSON object. Do not include markdown formatting or explanations.\n${JSON.stringify(textToTranslate, null, 2)}`;
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    responseMimeType: 'application/json'
                }
            });
    
            const result = JSON.parse(response.text);
            setTranslations(result);
        } catch (error) {
            console.error("Translation failed:", error);
            Swal.fire('Translation Unavailable', 'Cannot translate at this time.', 'info');
            setLanguage('th'); 
        } finally {
            setIsTranslating(false);
        }
    };
    
    const handleLanguageSwitch = (lang: 'th' | 'en') => {
        setLanguage(lang);
        if (lang === 'en' && !translations) {
            translateMenu();
        }
    };

    const translatedMenuItems = useMemo(() => {
        if (language === 'th' || !translations) return menuItems;
        return menuItems.map(item => ({
            ...item,
            name: translations[item.name] || item.name,
            optionGroups: item.optionGroups?.map(group => ({
                ...group,
                name: translations[group.name] || group.name,
                options: group.options.map(option => ({
                    ...option,
                    name: translations[option.name] || option.name
                }))
            }))
        }));
    }, [menuItems, language, translations]);

    const translatedCategories = useMemo(() => {
        if (language === 'th' || !translations) return categories;
        return categories.map(cat => translations[cat] || cat);
    }, [categories, language, translations]);

    // ... (rest of the file remains unchanged from here down to JSX)
    
    // --- LOGIN SCREEN ---
    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
                <div className="bg-white p-8 rounded-2xl shadow-lg max-w-md w-full text-center">
                    <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-800 mb-2">สวัสดีครับ/ค่ะ 🙏</h1>
                    <p className="text-gray-600 mb-6">โต๊ะ: <span className="font-bold text-blue-600 text-xl">{table.name} ({table.floor})</span></p>
                    
                    <form onSubmit={handleLogin} className="space-y-4 text-left">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อเล่นของคุณ</label>
                            <input 
                                type="text" 
                                value={customerName}
                                onChange={e => setCustomerName(e.target.value)}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="ระบุชื่อเล่น..."
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">รหัส PIN (3 หลัก)</label>
                            <input 
                                type="tel" 
                                maxLength={3}
                                value={pinInput}
                                onChange={e => setPinInput(e.target.value)}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-center text-2xl tracking-widest font-bold"
                                placeholder="XXX"
                            />
                            <p className="text-xs text-gray-400 mt-1 text-center">* ขอรหัสจากพนักงาน หรือดูที่ป้ายโต๊ะ</p>
                        </div>
                        <button 
                            type="submit"
                            className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl shadow-md hover:bg-blue-700 transition-colors mt-4"
                        >
                            เข้าสู่เมนูอาหาร
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    // --- MENU SCREEN ---
    return (
        <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
            {isTranslating && (
                <div className="absolute inset-0 bg-white/80 z-50 flex flex-col items-center justify-center">
                    <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    <p className="mt-2 text-gray-600">Translating...</p>
                </div>
            )}
            {/* Header */}
            <header className="bg-white shadow-sm px-4 py-3 z-10 relative">
                <div className="absolute top-3 left-3 z-20 bg-gray-100 rounded-full shadow p-1 flex text-xs">
                    <button onClick={() => handleLanguageSwitch('th')} className={`px-3 py-1 rounded-full font-semibold ${language === 'th' ? 'bg-blue-600 text-white' : 'text-gray-600'}`}>TH</button>
                    <button onClick={() => handleLanguageSwitch('en')} className={`px-3 py-1 rounded-full font-semibold ${language === 'en' ? 'bg-blue-600 text-white' : 'text-gray-600'}`}>EN</button>
                </div>
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                            {t('เมนูอาหาร 🍽️')}
                            <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-1 rounded-full">{t('โต๊ะ')} {table.name}</span>
                        </h1>
                        <p className="text-xs text-gray-500 mt-1">{t('คุณ')}{customerName}</p>
                    </div>
                    <div className="flex items-start gap-2">
                        {/* Only show Call Staff button */}
                        <button
                            onClick={handleCallStaffClick}
                            className="flex flex-col items-center justify-center p-2 bg-yellow-100 text-yellow-800 rounded-lg shadow-sm hover:bg-yellow-200 active:bg-yellow-300 transition-colors"
                            title={t('เรียกพนักงาน')}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                            </svg>
                            <span className="text-[9px] font-bold mt-0.5">{t('เรียก')}</span>
                        </button>
                         {/* Right Side: Status & Bill */}
                        <div 
                            className="flex flex-col items-end gap-1.5 cursor-pointer hover:opacity-80 transition-opacity group"
                            onClick={() => { if (checkSessionValidity()) setIsActiveOrderListOpen(true); }}
                        >
                             {orderStatus && (
                                <span className={`text-xs font-bold px-2 py-1 rounded-full border shadow-sm ${orderStatus.color} animate-pulse`}>
                                    {orderStatus.text}
                                </span>
                            )}
                            <div className="text-right">
                                <div className="flex items-center justify-end gap-1 text-gray-400 text-[10px]">
                                    <span>{t('ยอดของฉัน')}</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <div className="flex items-center gap-1 justify-end">
                                    <span className="text-base font-bold text-blue-600 leading-none border-b border-dashed border-blue-300 group-hover:text-blue-700 transition-colors">{myTotal.toLocaleString()} ฿</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </header>
            
            {/* Menu Content */}
            <div className="flex-1 overflow-hidden relative">
                <Menu 
                    menuItems={translatedMenuItems}
                    setMenuItems={() => {}} // Read-only
                    categories={translatedCategories}
                    onSelectItem={handleSelectItem}
                    isEditMode={false}
                    onEditItem={() => {}}
                    onAddNewItem={() => {}}
                    onDeleteItem={() => {}}
                    onUpdateCategory={() => {}}
                    onDeleteCategory={() => {}}
                    onAddCategory={() => {}}
                    onImportMenu={() => {}}
                    recommendedMenuItemIds={recommendedMenuItemIds}
                />
            </div>

            {/* Float Cart Button */}
            {totalCartItemsCount > 0 && (
                <div className="absolute bottom-6 left-4 right-4 z-20">
                    <button 
                        onClick={() => { if (checkSessionValidity()) setIsCartOpen(true); }}
                        className="w-full bg-blue-600 text-white shadow-xl rounded-xl p-4 flex justify-between items-center animate-bounce-in"
                    >
                        <div className="flex items-center gap-3">
                            <span className="bg-white text-blue-600 font-bold w-8 h-8 rounded-full flex items-center justify-center">
                                {totalCartItemsCount}
                            </span>
                            <div className="text-left leading-tight">
                                <span className="font-bold text-lg block">{t('ดูตะกร้า')}</span>
                                <span className="text-xs font-light text-blue-100">{t('ยังไม่รวมกับยอดบิล')}</span>
                            </div>
                        </div>
                        <span className="font-bold text-lg">{cartTotalAmount.toLocaleString()} ฿</span>
                    </button>
                </div>
            )}

            {/* My Orders List Modal */}
            {isActiveOrderListOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-end sm:items-center" onClick={() => setIsActiveOrderListOpen(false)}>
                    <div className="bg-white w-full sm:max-w-md h-[80vh] sm:h-auto sm:max-h-[90vh] rounded-t-2xl sm:rounded-xl shadow-2xl flex flex-col overflow-hidden animate-slide-up" onClick={e => e.stopPropagation()}>
                        
                        <div ref={billContentRef} className="flex-grow overflow-y-auto">
                            <div className="p-4 border-b bg-gray-50 flex flex-col items-center sticky top-0">
                                {logoUrl && (
                                    <img src={logoUrl} alt="Logo" className="h-16 w-auto object-contain mb-2" crossOrigin="anonymous" />
                                )}
                                <h3 className="font-bold text-gray-800 text-lg">{t('รายการของฉัน')} ({t('คุณ')}{customerName}) 🧾</h3>
                            </div>
                            
                            <div className="p-4 space-y-4">
                                {myItems.length === 0 ? (
                                    <div className="text-center text-gray-400 py-10">{t('ยังไม่มีรายการที่สั่ง')}</div>
                                ) : (
                                    <ul className="space-y-3">
                                        {myItems.map((item, idx) => (
                                            <li key={idx} className="flex justify-between text-sm text-gray-700 border-b pb-2 last:border-0">
                                                <div>
                                                    <span className="font-medium">{item.quantity}x {t(item.name)}</span>
                                                    {item.isTakeaway && <span className="text-purple-600 text-xs ml-1">(กลับบ้าน)</span>}
                                                    {item.selectedOptions.length > 0 && (
                                                        <div className="text-xs text-gray-500 ml-1">
                                                            {item.selectedOptions.map(o=>t(o.name)).join(', ')}
                                                        </div>
                                                    )}
                                                </div>
                                                <span className="font-mono text-gray-600 font-bold">{(item.finalPrice * item.quantity).toLocaleString()}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>

                            <div className="p-4 bg-gray-50 border-t sticky bottom-0">
                                <div className="flex justify-between items-center text-lg font-bold text-gray-800">
                                    <span>{t('ยอดรวมของฉัน')}</span>
                                    <span className="text-blue-600">{myTotal.toLocaleString()} ฿</span>
                                </div>
                                <p className="text-xs text-gray-500 text-center mt-2">
                                    {t('* ราคานี้เป็นเฉพาะรายการที่คุณสั่ง')}
                                </p>
                            </div>
                        </div>

                        <div className="p-3 bg-white border-t flex flex-col gap-2">
                            <button
                                onClick={handleSaveBillAsImage}
                                disabled={myItems.length === 0}
                                className="w-full bg-green-600 text-white font-bold py-3 rounded-xl shadow-lg hover:bg-green-700 transition-colors text-base flex items-center justify-center gap-2 disabled:bg-gray-400"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 9.293a1 1 0 011.414 0L10 11.586l2.293-2.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 011.414-1.414L9 9.586V4a1 1 0 011-1z" clipRule="evenodd" />
                                </svg>
                                {t('บันทึกรายการของฉัน')}
                            </button>
                            <button onClick={() => setIsActiveOrderListOpen(false)} className="w-full py-2 text-gray-700 font-semibold rounded-lg hover:bg-gray-100">
                                {t('ปิด')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cart Modal (Full Screen on Mobile) */}
            {isCartOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-end sm:justify-center items-end sm:items-center">
                    <div className="bg-white w-full sm:max-w-md h-[90vh] sm:h-[80vh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col animate-slide-up">
                        <div className="p-4 border-b flex justify-between items-center">
                            <h2 className="text-xl font-bold text-gray-800">{t('รายการในตะกร้า (ยังไม่สั่ง)')}</h2>
                            <button onClick={() => setIsCartOpen(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200">
                                <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {cartItems.map(item => (
                                <div key={item.cartItemId} className="flex justify-between items-start border-b pb-4">
                                    <div className="flex-1">
                                        <p className="font-bold text-gray-800">{t(item.name)}</p>
                                        <p className="text-sm text-gray-500">
                                            {item.selectedOptions.map(o => t(o.name)).join(', ')}
                                        </p>
                                        {item.notes && <p className="text-sm text-yellow-600">** {item.notes}</p>}
                                        <p className="text-blue-600 font-semibold mt-1">{item.finalPrice.toLocaleString()} ฿ x {item.quantity}</p>
                                    </div>
                                    <button 
                                        onClick={() => handleRemoveItem(item.cartItemId)}
                                        className="text-red-500 p-2"
                                    >
                                        {t('ลบ')}
                                    </button>
                                </div>
                            ))}
                            {cartItems.length === 0 && (
                                <div className="text-center text-gray-400 py-10">
                                    {t('ไม่มีสินค้าในตะกร้า')}
                                </div>
                            )}
                        </div>

                        <div className="p-4 border-t bg-gray-50">
                            <div className="flex justify-between mb-4 text-lg font-bold">
                                <span>{t('ยอดในตะกร้า')}</span>
                                <span>{cartTotalAmount.toLocaleString()} ฿</span>
                            </div>
                            <button 
                                onClick={handleSubmitOrder}
                                className="w-full bg-green-600 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-green-700 transition-colors text-lg"
                            >
                                {t('ยืนยันสั่งอาหาร 🚀')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ItemCustomizationModal 
                isOpen={!!itemToCustomize} 
                onClose={() => setItemToCustomize(null)} 
                item={itemToCustomize ? {
                    ...itemToCustomize,
                    name: t(itemToCustomize.name),
                    optionGroups: itemToCustomize.optionGroups?.map(g => ({...g, name: t(g.name), options: g.options.map(o => ({...o, name: t(o.name)}))}))
                } : null}
                onConfirm={handleConfirmCustomization} 
            />
        </div>
    );
};
