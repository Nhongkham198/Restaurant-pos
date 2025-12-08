import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { MenuItem, Table, OrderItem, ActiveOrder, StaffCall } from '../types';
import { Menu } from './Menu';
import { ItemCustomizationModal } from './ItemCustomizationModal';
import Swal from 'sweetalert2';

declare var html2canvas: any;

interface CustomerViewProps {
    table: Table;
    menuItems: MenuItem[];
    categories: string[];
    activeOrders: ActiveOrder[];
    allBranchOrders: ActiveOrder[]; // Added to calculate global queue position
    onPlaceOrder: (items: OrderItem[], customerName: string, customerCount: number) => void;
    onStaffCall: (table: Table, customerName: string) => void;
    recommendedMenuItemIds: number[];
}

export const CustomerView: React.FC<CustomerViewProps> = ({
    table,
    menuItems,
    categories,
    activeOrders,
    allBranchOrders,
    onPlaceOrder,
    onStaffCall,
    recommendedMenuItemIds
}) => {
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

    useEffect(() => {
        localStorage.setItem(cartKey, JSON.stringify(cartItems));
    }, [cartItems, cartKey]);


    const [isCartOpen, setIsCartOpen] = useState(false);
    const [isActiveOrderListOpen, setIsActiveOrderListOpen] = useState(false);
    const [itemToCustomize, setItemToCustomize] = useState<MenuItem | null>(null);
    const billContentRef = useRef<HTMLDivElement>(null);
    
    // --- Session Persistence Logic ---
    useEffect(() => {
        const sessionKey = `customer_session_${table.id}`;
        const savedSession = localStorage.getItem(sessionKey);
        
        if (savedSession) {
            try {
                const { name, pin } = JSON.parse(savedSession);

                // IMPORTANT FIX for refresh persistence:
                // Only perform actions if table.activePin is loaded from the database.
                // If it's undefined, we wait for the next render when Firestore data arrives.
                // This prevents a race condition where the session is deleted before the correct PIN is loaded.
                if (table.activePin !== undefined) {
                    if (pin === table.activePin) {
                        // PIN is correct, authenticate the session.
                        setCustomerName(name);
                        setPinInput(pin);
                        setIsAuthenticated(true);
                    } else {
                        // PIN is incorrect (changed by staff), the session is invalid.
                        localStorage.removeItem(sessionKey);
                    }
                }
                // If table.activePin is not available yet, do nothing and wait for the component to re-render.
                
            } catch (e) {
                // If parsing fails, the session data is corrupt.
                localStorage.removeItem(sessionKey);
            }
        }
    }, [table.id, table.activePin]);

    // --- Auto-Logout Logic (Real-time Security) ---
    useEffect(() => {
        // If user is logged in, but the table's PIN is suddenly cleared (Payment Confirmed)
        // or changed (Staff reset PIN), force logout immediately.
        // The check for `isAuthenticated` is sufficient to prevent race conditions on refresh,
        // because it only becomes true after the PIN has been successfully validated against
        // the loaded data from Firestore at least once.
        if (isAuthenticated && table.activePin !== pinInput) {
            // 1. Clear All Customer Data from localStorage
            const sessionKey = `customer_session_${table.id}`;
            const cartKey = `customer_cart_${table.id}`;
            localStorage.removeItem(sessionKey);
            localStorage.removeItem('customerSelectedBranch');
            localStorage.removeItem(cartKey); // Clear the persisted cart on logout

            // 2. Reset State
            setIsAuthenticated(false);
            setCustomerName('');
            setPinInput('');
            setCartItems([]);
            setIsCartOpen(false);
            setIsActiveOrderListOpen(false);

            // 3. Notify User
            Swal.fire({
                icon: 'success',
                title: 'ขอบคุณที่ใช้บริการ',
                text: 'การชำระเงินเสร็จสิ้น หรือเซสชั่นหมดอายุ',
                timer: 3000,
                showConfirmButton: false,
                allowOutsideClick: false
            });
        }
    }, [table.activePin, isAuthenticated, pinInput, table.id]);

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
            title: 'เพิ่มลงตะกร้าแล้ว',
            showConfirmButton: false,
            timer: 1500
        });
    };

    const handleRemoveItem = (cartItemId: string) => {
        setCartItems(prev => prev.filter(i => i.cartItemId !== cartItemId));
    };

    const handleSubmitOrder = () => {
        if (cartItems.length === 0) return;

        Swal.fire({
            title: 'ยืนยันการสั่งอาหาร?',
            text: `สั่งอาหาร ${cartItems.reduce((sum, i) => sum + i.quantity, 0)} รายการ`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'สั่งเลย',
            cancelButtonText: 'ตรวจสอบก่อน',
            confirmButtonColor: '#10B981'
        }).then((result) => {
            if (result.isConfirmed) {
                onPlaceOrder(cartItems, customerName, 1); 
                setCartItems([]);
                setIsCartOpen(false);
            }
        });
    };

    const handleCallStaffClick = () => {
        onStaffCall(table, customerName);
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: 'ส่งสัญญาณเรียกพนักงานแล้ว',
            text: 'กรุณารอสักครู่...',
            showConfirmButton: false,
            timer: 3000
        });
    };

    const handleSaveBillAsImage = async () => {
        if (!billContentRef.current) return;
    
        Swal.fire({
            title: 'กำลังสร้างรูปภาพ...',
            text: 'กรุณารอสักครู่',
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
            link.download = `bill-table-${table.name}-${new Date().toISOString().slice(0, 10)}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            Swal.close();
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: 'บันทึกรูปภาพสำเร็จ!',
                showConfirmButton: false,
                timer: 2000
            });
        } catch (error) {
            console.error('Error generating bill image:', error);
            Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: 'ไม่สามารถสร้างรูปภาพได้',
            });
        }
    };

    // Calculate Cart Totals
    const cartTotalAmount = useMemo(() => cartItems.reduce((sum, i) => sum + (i.finalPrice * i.quantity), 0), [cartItems]);
    const totalCartItemsCount = useMemo(() => cartItems.reduce((sum, i) => sum + i.quantity, 0), [cartItems]);

    // Calculate Confirmed Bill Total (Active Orders)
    const billTotal = useMemo(() => {
        return activeOrders.reduce((sum, order) => {
            const subtotal = order.items.reduce((s, i) => s + (i.finalPrice * i.quantity), 0);
            return sum + subtotal + order.taxAmount;
        }, 0);
    }, [activeOrders]);

    // --- Dynamic Order Status Logic ---
    const orderStatus = useMemo(() => {
        if (activeOrders.length === 0) return null;

        // Check if any order is currently cooking
        const isCooking = activeOrders.some(o => o.status === 'cooking');
        // Check if all orders are served
        const allServed = activeOrders.every(o => o.status === 'served');
        
        if (isCooking) {
            return { text: 'กำลังปรุง... 🍳', color: 'bg-orange-100 text-orange-700 border-orange-200' };
        }
        if (allServed) {
            return { text: 'เสิร์ฟครบแล้ว 😋', color: 'bg-green-100 text-green-700 border-green-200' };
        }
        
        // Default: Waiting in queue (status = 'waiting')
        // Calculate queue position
        // Find the timestamp of the earliest waiting order for THIS table
        const myEarliestOrderTime = Math.min(...activeOrders.filter(o => o.status === 'waiting').map(o => o.orderTime));
        
        // Count how many orders in the ENTIRE branch are ahead of this time (and are waiting or cooking)
        const queueAhead = allBranchOrders.filter(o => 
            (o.status === 'waiting' || o.status === 'cooking') && 
            o.orderTime < myEarliestOrderTime
        ).length;

        return { text: `รอคิว... (${queueAhead} คิว) ⏳`, color: 'bg-blue-100 text-blue-700 border-blue-200' };
    }, [activeOrders, allBranchOrders]);


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
            {/* Header */}
            <header className="bg-white shadow-sm px-4 py-3 z-10 relative">
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                            เมนูอาหาร 🍽️ 
                            <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-1 rounded-full">โต๊ะ {table.name}</span>
                        </h1>
                        <p className="text-xs text-gray-500 mt-1">คุณ{customerName}</p>
                    </div>
                    <div className="flex items-start gap-2">
                        <button
                            onClick={handleCallStaffClick}
                            className="flex flex-col items-center justify-center p-2 bg-yellow-100 text-yellow-800 rounded-lg shadow-sm hover:bg-yellow-200 active:bg-yellow-300 transition-colors"
                            title="เรียกพนักงาน"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                            </svg>
                            <span className="text-[9px] font-bold mt-0.5">เรียก</span>
                        </button>
                         {/* Right Side: Status & Bill */}
                        <div 
                            className="flex flex-col items-end gap-1.5 cursor-pointer hover:opacity-80 transition-opacity group"
                            onClick={() => setIsActiveOrderListOpen(true)}
                        >
                             {orderStatus && (
                                <span className={`text-xs font-bold px-2 py-1 rounded-full border shadow-sm ${orderStatus.color} animate-pulse`}>
                                    {orderStatus.text}
                                </span>
                            )}
                            <div className="text-right">
                                <div className="flex items-center justify-end gap-1 text-gray-400 text-[10px]">
                                    <span>ยอดที่ต้องชำระ</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <div className="flex items-center gap-1 justify-end">
                                    <span className="text-base font-bold text-blue-600 leading-none border-b border-dashed border-blue-300 group-hover:text-blue-700 transition-colors">{billTotal.toLocaleString()} ฿</span>
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
                        onClick={() => setIsCartOpen(true)}
                        className="w-full bg-blue-600 text-white shadow-xl rounded-xl p-4 flex justify-between items-center animate-bounce-in"
                    >
                        <div className="flex items-center gap-3">
                            <span className="bg-white text-blue-600 font-bold w-8 h-8 rounded-full flex items-center justify-center">
                                {totalCartItemsCount}
                            </span>
                            <div className="text-left leading-tight">
                                <span className="font-bold text-lg block">ดูตะกร้า</span>
                                <span className="text-xs font-light text-blue-100">ยังไม่รวมกับยอดบิล</span>
                            </div>
                        </div>
                        <span className="font-bold text-lg">{cartTotalAmount.toLocaleString()} ฿</span>
                    </button>
                </div>
            )}

            {/* Active Orders List Modal (History) */}
            {isActiveOrderListOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-end sm:items-center" onClick={() => setIsActiveOrderListOpen(false)}>
                    <div className="bg-white w-full sm:max-w-md h-[80vh] sm:h-auto sm:max-h-[90vh] rounded-t-2xl sm:rounded-xl shadow-2xl flex flex-col overflow-hidden animate-slide-up" onClick={e => e.stopPropagation()}>
                        
                        <div ref={billContentRef} className="flex-grow overflow-y-auto">
                            <div className="p-4 border-b bg-gray-50 flex justify-between items-center sticky top-0">
                                <h3 className="font-bold text-gray-800 text-lg">รายการที่สั่งไปแล้ว 🧾</h3>
                            </div>
                            
                            <div className="p-4 space-y-6">
                                {activeOrders.length === 0 ? (
                                    <div className="text-center text-gray-400 py-10">ยังไม่มีรายการที่สั่ง</div>
                                ) : (
                                    activeOrders.map((order) => (
                                        <div key={order.id} className="border-b last:border-0 pb-4 last:pb-0">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                                                    ออเดอร์ #{String(order.orderNumber).padStart(3, '0')}
                                                </span>
                                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                                    order.status === 'served' ? 'bg-green-100 text-green-700' :
                                                    order.status === 'cooking' ? 'bg-yellow-100 text-yellow-700' :
                                                    'bg-blue-100 text-blue-700'
                                                }`}>
                                                    {order.status === 'served' ? 'เสิร์ฟแล้ว' : order.status === 'cooking' ? 'กำลังปรุง' : 'รอคิว'}
                                                </span>
                                            </div>
                                            <ul className="space-y-2">
                                                {order.items.map((item, idx) => (
                                                    <li key={idx} className="flex justify-between text-sm text-gray-700">
                                                        <div>
                                                            <span className="font-medium">{item.quantity}x {item.name}</span>
                                                            {item.selectedOptions.length > 0 && (
                                                                <span className="text-xs text-gray-500 ml-1">({item.selectedOptions.map(o=>o.name).join(', ')})</span>
                                                            )}
                                                        </div>
                                                        <span className="font-mono text-gray-600">{(item.finalPrice * item.quantity).toLocaleString()}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="p-4 bg-gray-50 border-t sticky bottom-0">
                                <div className="flex justify-between items-center text-lg font-bold text-gray-800">
                                    <span>ยอดรวมทั้งหมด</span>
                                    <span className="text-blue-600">{billTotal.toLocaleString()} ฿</span>
                                </div>
                                <p className="text-xs text-gray-500 text-center mt-2">กรุณาชำระเงินที่เคาน์เตอร์เมื่อทานเสร็จ</p>
                            </div>
                        </div>

                        <div className="p-3 bg-white border-t flex flex-col gap-2">
                            <button
                                onClick={handleSaveBillAsImage}
                                className="w-full bg-green-600 text-white font-bold py-3 rounded-xl shadow-lg hover:bg-green-700 transition-colors text-base flex items-center justify-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 9.293a1 1 0 011.414 0L10 11.586l2.293-2.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 111.414-1.414L9 9.586V4a1 1 0 011-1z" clipRule="evenodd" />
                                </svg>
                                บันทึกบิลเป็นรูปภาพ
                            </button>
                            <button onClick={() => setIsActiveOrderListOpen(false)} className="w-full py-2 text-gray-700 font-semibold rounded-lg hover:bg-gray-100">
                                ปิด
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
                            <h2 className="text-xl font-bold text-gray-800">รายการในตะกร้า (ยังไม่สั่ง)</h2>
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
                                        <p className="font-bold text-gray-800">{item.name}</p>
                                        <p className="text-sm text-gray-500">
                                            {item.selectedOptions.map(o => o.name).join(', ')}
                                        </p>
                                        {item.notes && <p className="text-sm text-yellow-600">** {item.notes}</p>}
                                        <p className="text-blue-600 font-semibold mt-1">{item.finalPrice.toLocaleString()} ฿ x {item.quantity}</p>
                                    </div>
                                    <button 
                                        onClick={() => handleRemoveItem(item.cartItemId)}
                                        className="text-red-500 p-2"
                                    >
                                        ลบ
                                    </button>
                                </div>
                            ))}
                            {cartItems.length === 0 && (
                                <div className="text-center text-gray-400 py-10">
                                    ไม่มีสินค้าในตะกร้า
                                </div>
                            )}
                        </div>

                        <div className="p-4 border-t bg-gray-50">
                            <div className="flex justify-between mb-4 text-lg font-bold">
                                <span>ยอดในตะกร้า</span>
                                <span>{cartTotalAmount.toLocaleString()} ฿</span>
                            </div>
                            <button 
                                onClick={handleSubmitOrder}
                                className="w-full bg-green-600 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-green-700 transition-colors text-lg"
                            >
                                ยืนยันสั่งอาหาร 🚀
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ItemCustomizationModal 
                isOpen={!!itemToCustomize} 
                onClose={() => setItemToCustomize(null)} 
                item={itemToCustomize} 
                onConfirm={handleConfirmCustomization} 
            />
        </div>
    );
};