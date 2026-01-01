
// ... existing imports
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { MenuItem, Table, OrderItem, ActiveOrder, StaffCall, CompletedOrder } from '../types';
import { Menu } from './Menu';
import { ItemCustomizationModal } from './ItemCustomizationModal';
import Swal from 'sweetalert2';

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
    const [customerName, setCustomerName] = useState('ลูกค้า'); // Default to generic name
    
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
    
    // --- Auto-Login / Session Logic (No PIN) ---
    useEffect(() => {
        const sessionKey = `customer_session_${table.id}`;
        const savedSession = localStorage.getItem(sessionKey);
        
        if (savedSession) {
            try {
                const { name } = JSON.parse(savedSession);
                setCustomerName(name || 'ลูกค้า');
                setIsAuthenticated(true);
            } catch (e) {
                // Invalid session, recreate
                initializeSession(sessionKey);
            }
        } else {
            // No session, create one automatically
            initializeSession(sessionKey);
        }
    }, [table.id]);

    const initializeSession = (sessionKey: string) => {
        // Generate a simple guest session
        const randomSuffix = Math.floor(Math.random() * 1000);
        const name = `Guest-${randomSuffix}`;
        localStorage.setItem(sessionKey, JSON.stringify({ name }));
        setCustomerName(name);
        setIsAuthenticated(true);
    };

    const handleLogout = () => {
        const sessionKey = `customer_session_${table.id}`;
        localStorage.removeItem(sessionKey);
        localStorage.removeItem(cartKey);
        localStorage.removeItem(myOrdersKey); // Clear my orders on explicit logout
        localStorage.removeItem('customerSelectedBranch');

        setIsAuthenticated(false);
        // Page usually reloads or re-inits here, triggering auto-login again for a fresh session
        window.location.reload(); 
    };

    const t = (text: string) => text;

    // --- IDENTIFY ITEMS (Mine vs Others) ---
    const { myItems, otherItems } = useMemo(() => {
        const mine: OrderItem[] = [];
        const others: { item: OrderItem, owner: string }[] = [];
        const myOrderSet = new Set(myOrderNumbers);
        const currentNormName = customerName?.trim().toLowerCase();

        // Filter for orders specifically for THIS table from the global list
        const tableOrders = Array.isArray(allBranchOrders) 
            ? allBranchOrders.filter(o => String(o.tableId) === String(table.id) && o.status !== 'cancelled' && o.status !== 'completed')
            : [];

        tableOrders.forEach(order => {
            const orderName = order.customerName || t('ไม่ระบุชื่อ');
            const orderNormName = order.customerName?.trim().toLowerCase();
            
            // Check if this whole order is "Mine" by name match (fallback)
            // eslint-disable-next-line eqeqeq
            const isMyOrderByName = isAuthenticated && currentNormName && orderNormName === currentNormName;

            order.items.forEach(item => {
                const originId = item.originalOrderNumber ?? order.orderNumber;
                const isMyItemById = myOrderSet.has(originId);

                if (isMyItemById || isMyOrderByName) {
                    mine.push(item);
                } else {
                    others.push({ item, owner: orderName });
                }
            });
        });

        return { myItems: mine, otherItems: others };
    }, [allBranchOrders, myOrderNumbers, isAuthenticated, customerName, table.id]);

    // Calculate totals
    const myTotal = useMemo(() => {
        return myItems.reduce((sum, item) => sum + (item.finalPrice * item.quantity), 0);
    }, [myItems]);

    const otherTotal = useMemo(() => {
        return otherItems.reduce((sum, { item }) => sum + (item.finalPrice * item.quantity), 0);
    }, [otherItems]);

    const grandTotal = myTotal + otherTotal;

    // Auto-add new orders to "My Orders" if I placed them (based on name match from session)
    useEffect(() => {
        if (!isAuthenticated || !customerName) return;

        try {
            const currentNormName = customerName.trim().toLowerCase();
            const newMyOrderIds: number[] = [];
            // activeOrders passed here are already filtered by tableId in App.tsx typically, 
            // but we use the one passed via props which is strictly for this table.
            activeOrders.forEach(order => {
                const orderNormName = order.customerName?.trim().toLowerCase();
                if (order && orderNormName === currentNormName && !myOrderNumbers.includes(order.orderNumber)) {
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
        
        // Trigger only if I had items before, and now they are gone (0 active items)
        if (prevCount > 0 && currentCount === 0 && !isProcessingPaymentRef.current) {
            isProcessingPaymentRef.current = true;
    
            // Find the most recently completed order that belongs to ME
            const myJustCompletedOrders = completedOrders.filter(o =>
                myOrderNumbers.some(myNum =>
                    o.orderNumber === myNum || (o.mergedOrderNumbers && o.mergedOrderNumbers.includes(myNum))
                )
            );
    
            if (myJustCompletedOrders.length === 0) {
                isProcessingPaymentRef.current = false;
                prevMyItemsCountRef.current = currentCount;
                return; 
            }

            const latestCompletedOrder = myJustCompletedOrders.sort((a, b) => b.completionTime - a.completionTime)[0];
    
            // Build the bill HTML for display and for html2canvas
            const subtotal = latestCompletedOrder.items.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
            const total = subtotal + latestCompletedOrder.taxAmount;
    
            const billHtml = `
                <div id="customer-final-bill" class="text-left p-4 bg-white font-sans text-black">
                    ${logoUrl ? `<img src="${logoUrl}" alt="Logo" class="mx-auto h-20 w-auto object-contain mb-4" crossOrigin="anonymous" />` : ''}
                    <h3 class="text-center text-xl font-bold mb-2">${restaurantName}</h3>
                    <p class="text-center text-xs text-gray-500 mb-4">ใบเสร็จรับเงิน (อย่างย่อ)</p>
                    <div class="text-sm space-y-1 mb-4">
                        <p><strong>โต๊ะ:</strong> ${latestCompletedOrder.tableName} (${latestCompletedOrder.floor})</p>
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
                html: `<div class="max-h-60 overflow-y-auto border rounded-lg">${billHtml}</div><p class="mt-4 text-sm text-red-500 font-bold">ระบบจะปิดอัตโนมัติใน 15 วินาที...</p>`,
                icon: 'success',
                showDenyButton: true,
                confirmButtonText: 'บันทึกบิล & ออก',
                denyButtonText: 'ไม่บันทึก & ออก',
                confirmButtonColor: '#3085d6',
                denyButtonColor: '#aaa',
                allowOutsideClick: false,
                timer: 15000, // 15 Seconds Auto-close
                timerProgressBar: true,
                preConfirm: async () => {
                    const billElement = document.getElementById('customer-final-bill');
                    if (billElement) {
                        try {
                            const canvas = await html2canvas(billElement, { scale: 2, useCORS: true });
                            return canvas.toDataURL('image/png');
                        } catch (err) {
                            console.error('Failed to save bill as image', err);
                            return null;
                        }
                    }
                    return null;
                }
            }).then((result) => {
                if (result.isConfirmed) {
                    const imageUrl = result.value;
                    if (imageUrl) {
                        const link = document.createElement('a');
                        link.href = imageUrl;
                        link.download = `bill-${latestCompletedOrder.tableName}-${customerName}-${new Date().toISOString().slice(0, 10)}.png`;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);

                        Swal.fire({
                            title: t('บันทึกสำเร็จ!'),
                            text: t('ออกจากระบบอัตโนมัติ...'),
                            icon: 'success',
                            timer: 2000,
                            timerProgressBar: true,
                            showConfirmButton: false
                        }).then(() => {
                            handleLogout();
                        });
                    } else {
                        Swal.fire(t('เกิดข้อผิดพลาด'), t('ไม่สามารถบันทึกบิลได้'), 'error')
                        .then(() => handleLogout());
                    }
                } else {
                    // This handles clicking "Deny" OR when the timer runs out
                    handleLogout();
                }
            });
        }
    
        prevMyItemsCountRef.current = currentCount;
    }, [myItems.length, isAuthenticated, completedOrders, myOrderNumbers, logoUrl, restaurantName, customerName]);
    

    const handleSelectItem = (item: MenuItem) => {
        setItemToCustomize(item);
    };

    const handleConfirmCustomization = (itemToAdd: OrderItem) => {
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
        setCartItems(prev => prev.filter(i => i.cartItemId !== cartItemId));
    };

    const handleSubmitOrder = async () => {
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
            
            Swal.fire({
                title: t('กำลังส่งรายการ...'),
                allowOutsideClick: false,
                didOpen: () => { Swal.showLoading(); }
            });

            try {
                // Force customerCount to 1 as strict tracking isn't critical in this flow, 
                // or we could add a simple prompt if needed.
                await onPlaceOrder(cartItems, customerName, 1); 
                setCartItems([]);
                setIsCartOpen(false);

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
                scale: 2, 
                useCORS: true, 
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

    // --- [REWORKED] Dynamic Order Status Logic (GLOBAL QUEUE) ---
    const orderStatus = useMemo(() => {
        try {
            // 1. Check if user has active items they placed
            if (myItems.length === 0) return null;

            // 2. Try to find these orders in the branch data
            // Safety check: allBranchOrders might be undefined during initial load or error
            if (!Array.isArray(allBranchOrders)) return null;

            const myTableOrders = allBranchOrders.filter(o => String(o.tableId) === String(table.id));

            // 3. Fallback: If I have items locally but branch orders are empty (sync delay),
            //    SHOW WAITING STATUS IMMEDIATELY. Do not return null.
            if (myTableOrders.length === 0) {
                 return { text: t('รอคิว'), color: 'bg-blue-600 text-white border-blue-700' };
            }

            // 4. PRIORITY 1: COOKING
            if (myTableOrders.some(o => o.status === 'cooking')) {
                 return { text: t('กำลังปรุง... 🍳'), color: 'bg-orange-500 text-white border-orange-600' };
            }

            // 5. PRIORITY 2: WAITING
            const waitingOrders = myTableOrders.filter(o => o.status === 'waiting');
            if (waitingOrders.length > 0) {
                const myEarliestOrderTime = Math.min(...waitingOrders.map(o => o.orderTime));

                // Count how many orders in the WHOLE BRANCH are waiting/cooking AND came before me
                const queueCount = allBranchOrders.filter(o => 
                    (o.status === 'waiting' || o.status === 'cooking') && 
                    o.orderTime < myEarliestOrderTime
                ).length;

                if (queueCount === 0) {
                    return { text: `${t('รอคิว')} (${t('คิวที่ 1')} ☝️)`, color: 'bg-blue-600 text-white border-blue-700' };
                }

                return { text: `${t('รอคิว...')} (${t('อีก')} ${queueCount} ${t('คิว')}) ⏳`, color: 'bg-blue-600 text-white border-blue-700' };
            }

            // 6. PRIORITY 3: SERVED
            const allServed = myTableOrders.every(o => o.status === 'served');
            if (allServed) {
                 return { text: t('เสิร์ฟครบแล้ว 😋'), color: 'bg-green-500 text-white border-green-600' };
            }

            // Default fallback
            return { text: t('รอคิว'), color: 'bg-blue-600 text-white border-blue-700' };

        } catch (e) {
            console.error("Status Calc Error", e);
            // Fallback on error if we know we have items
            return myItems.length > 0 ? { text: t('รอคิว'), color: 'bg-blue-600 text-white border-blue-700' } : null;
        }
    }, [allBranchOrders, isAuthenticated, table.id, myItems.length]);

    
    // If not authenticated (though effect above should catch this instantly),
    // show a simple loading state or a fallback.
    // We removed the PIN form, so basically we just wait for the effect to auto-login.
    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                <p className="mt-4 text-gray-600">กำลังเข้าสู่ระบบ...</p>
            </div>
        );
    }

    // --- MENU SCREEN ---
    return (
        <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
            {/* Header */}
            <header className="bg-white shadow-md z-30 relative">
                {/* Top Row: Language & Title (Mobile Friendly) */}
                <div className="flex justify-between items-center px-4 py-2 border-b border-gray-100 bg-gray-50/50">
                    <h1 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                        {t('เมนูอาหาร 🍽️')}
                    </h1>
                </div>

                {/* Main Header Content */}
                <div className="px-4 py-3 flex justify-between items-start">
                    <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-gray-600 bg-gray-100 px-3 py-1 rounded-full border border-gray-200 whitespace-nowrap">
                                {t('โต๊ะ')} <span className="text-gray-900 font-bold">{table.name} ({table.floor})</span>
                            </span>
                            
                            {/* STATUS BADGE - NOW INLINE and RELAXED LOGIC */}
                            {orderStatus && (
                                <span className={`text-xs font-bold px-3 py-1 rounded-full border shadow-sm ${orderStatus.color} whitespace-nowrap flex items-center gap-1 z-10`}>
                                    {orderStatus.text}
                                </span>
                            )}
                        </div>
                        {/* Optionally allow editing name, but kept simple for now */}
                        <p className="text-xs text-gray-400 pl-1">{t('คุณ')}{customerName}</p>
                    </div>

                    <div className="flex items-start gap-2 flex-shrink-0">
                        {/* Only show Call Staff button */}
                        <button
                            onClick={handleCallStaffClick}
                            className="flex flex-col items-center justify-center p-2 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-lg shadow-sm hover:bg-yellow-100 active:bg-yellow-200 transition-colors"
                            title={t('เรียกพนักงาน')}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                            </svg>
                            <span className="text-[10px] font-bold mt-0.5">{t('เรียก')}</span>
                        </button>
                         {/* Right Side: Bill Only (Status moved to left) */}
                        <div 
                            className="flex flex-col items-end gap-1 cursor-pointer hover:opacity-80 transition-opacity group bg-white p-1 rounded"
                            onClick={() => { setIsActiveOrderListOpen(true); }}
                        >
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
                    menuItems={menuItems}
                    setMenuItems={() => {}} // Read-only
                    categories={categories}
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
                        onClick={() => { setIsCartOpen(true); }}
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
                            <div className="p-4 border-b bg-gray-50 flex flex-col items-center sticky top-0 z-10">
                                {logoUrl && (
                                    <img src={logoUrl} alt="Logo" className="h-16 w-auto object-contain mb-2" crossOrigin="anonymous" />
                                )}
                                <h3 className="font-bold text-gray-800 text-lg">{t('รายการของฉัน')} ({t('คุณ')}{customerName}) 🧾</h3>
                                <p className="text-sm text-gray-600">{t('โต๊ะ')} {table.name} ({table.floor})</p>
                            </div>
                            
                            <div className="p-4 space-y-4">
                                {myItems.length === 0 && otherItems.length === 0 ? (
                                    <div className="text-center text-gray-400 py-10">{t('ยังไม่มีรายการที่สั่ง')}</div>
                                ) : (
                                    <>
                                        {/* SECTION 1: MY ITEMS */}
                                        {myItems.length > 0 && (
                                            <div className="bg-blue-50/50 p-2 rounded-lg border border-blue-100">
                                                <h4 className="font-bold text-blue-800 text-sm mb-2 flex items-center gap-1">
                                                    {t('รายการของคุณ')} <span className="text-xs font-normal text-blue-600">({customerName})</span> 👤
                                                </h4>
                                                <ul className="space-y-3">
                                                    {myItems.map((item, idx) => (
                                                        <li key={`mine-${idx}`} className="flex justify-between text-sm text-gray-700 border-b border-blue-100 pb-2 last:border-0">
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
                                            </div>
                                        )}

                                        {/* SECTION 2: OTHERS ITEMS */}
                                        {otherItems.length > 0 && (
                                            <div className="bg-gray-50 p-2 rounded-lg border border-gray-200 mt-2">
                                                <h4 className="font-bold text-gray-600 text-sm mb-2">{t('รายการของเพื่อนร่วมโต๊ะ')} 👥</h4>
                                                <ul className="space-y-3">
                                                    {otherItems.map(({ item, owner }, idx) => (
                                                        <li key={`other-${idx}`} className="flex justify-between text-sm text-gray-700 border-b border-gray-200 pb-2 last:border-0">
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-medium">{item.quantity}x {t(item.name)}</span>
                                                                    <span className="text-[10px] bg-gray-200 px-1.5 rounded text-gray-600">{owner}</span>
                                                                </div>
                                                                {item.isTakeaway && <span className="text-purple-600 text-xs ml-1">(กลับบ้าน)</span>}
                                                                {item.selectedOptions.length > 0 && (
                                                                    <div className="text-xs text-gray-500 ml-1">
                                                                        {item.selectedOptions.map(o=>t(o.name)).join(', ')}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <span className="font-mono text-gray-500">{(item.finalPrice * item.quantity).toLocaleString()}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            <div className="p-4 bg-gray-50 border-t sticky bottom-0">
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center text-base text-gray-600">
                                        <span>{t('ยอดของฉัน')}</span>
                                        <span className="font-bold text-blue-600">{myTotal.toLocaleString()} ฿</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xl font-bold text-gray-800 pt-2 border-t border-gray-200">
                                        <span>{t('ยอดรวมทั้งโต๊ะ')}</span>
                                        <span>{grandTotal.toLocaleString()} ฿</span>
                                    </div>
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
                    optionGroups: itemToCustomize.optionGroups?.map(g => ({
                        ...g,
                        name: t(g.name),
                        options: g.options?.map(o => ({
                            ...o,
                            name: t(o.name)
                        })) || []
                    })) || []
                } : null}
                onConfirm={handleConfirmCustomization} 
            />
        </div>
    );
};
