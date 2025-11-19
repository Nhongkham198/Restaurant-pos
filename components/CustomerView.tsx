
import React, { useState, useEffect, useMemo } from 'react';
import type { MenuItem, Table, OrderItem, ActiveOrder } from '../types';
import { Menu } from './Menu';
import { ItemCustomizationModal } from './ItemCustomizationModal';
import Swal from 'sweetalert2';

interface CustomerViewProps {
    table: Table;
    menuItems: MenuItem[];
    categories: string[];
    activeOrders: ActiveOrder[];
    allBranchOrders: ActiveOrder[]; // Added to calculate global queue position
    onPlaceOrder: (items: OrderItem[], customerName: string, customerCount: number) => void;
}

export const CustomerView: React.FC<CustomerViewProps> = ({
    table,
    menuItems,
    categories,
    activeOrders,
    allBranchOrders,
    onPlaceOrder
}) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [customerName, setCustomerName] = useState('');
    const [pinInput, setPinInput] = useState('');
    const [cartItems, setCartItems] = useState<OrderItem[]>([]);
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [isActiveOrderListOpen, setIsActiveOrderListOpen] = useState(false);
    const [itemToCustomize, setItemToCustomize] = useState<MenuItem | null>(null);
    
    // --- Session Persistence Logic ---
    useEffect(() => {
        const sessionKey = `customer_session_${table.id}`;
        const savedSession = localStorage.getItem(sessionKey);
        
        if (savedSession) {
            try {
                const { name, pin } = JSON.parse(savedSession);
                // Only auto-login if the PIN matches the current active PIN of the table.
                // This ensures that if the table is cleared/reset by staff, the old session is invalid.
                if (pin === table.activePin && table.activePin) {
                    setCustomerName(name);
                    setPinInput(pin); // Ensure pinInput is set for comparison later
                    setIsAuthenticated(true);
                } else {
                    // PIN changed or invalid, clear session
                    localStorage.removeItem(sessionKey);
                }
            } catch (e) {
                localStorage.removeItem(sessionKey);
            }
        }
    }, [table.id, table.activePin]);

    // --- Auto-Logout Logic (Real-time Security) ---
    useEffect(() => {
        // If user is logged in, but the table's PIN is suddenly cleared (Payment Confirmed)
        // or changed (Staff reset PIN), force logout immediately.
        if (isAuthenticated) {
            if (!table.activePin || table.activePin !== pinInput) {
                // 1. Clear Session
                const sessionKey = `customer_session_${table.id}`;
                localStorage.removeItem(sessionKey);

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
                    <p className="text-gray-600 mb-6">โต๊ะ: <span className="font-bold text-blue-600 text-xl">{table.name}</span></p>
                    
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
                <div className="flex justify-between items-start mb-1">
                    <div>
                        <h1 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                            เมนูอาหาร 🍽️ 
                            <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-1 rounded-full">โต๊ะ {table.name}</span>
                        </h1>
                        <p className="text-xs text-gray-500 mt-1">คุณ{customerName}</p>
                    </div>
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
            </header>
            
            {/* Warning Banner */}
            <div className="bg-red-100 text-red-700 text-xs px-4 py-2 text-center border-b border-red-200 shadow-inner z-10">
                <strong>⚠️ ห้ามรีเฟรชหน้าจอ!</strong> หากหลุดให้เข้าใหม่โดยใช้ <u>ชื่อเดิม</u> และ <u>รหัสเดิม</u> เท่านั้น
            </div>

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
                    <div className="bg-white w-full sm:max-w-md h-[80vh] sm:h-auto rounded-t-2xl sm:rounded-xl shadow-2xl flex flex-col overflow-hidden animate-slide-up" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b bg-gray-50 flex justify-between items-center sticky top-0">
                            <h3 className="font-bold text-gray-800 text-lg">รายการที่สั่งไปแล้ว 🧾</h3>
                            <button onClick={() => setIsActiveOrderListOpen(false)} className="p-1 rounded-full hover:bg-gray-200 text-gray-500">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-4 space-y-6">
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

                        <div className="p-4 bg-gray-50 border-t">
                            <div className="flex justify-between items-center text-lg font-bold text-gray-800">
                                <span>ยอดรวมทั้งหมด</span>
                                <span className="text-blue-600">{billTotal.toLocaleString()} ฿</span>
                            </div>
                            <p className="text-xs text-gray-500 text-center mt-2">กรุณาชำระเงินที่เคาน์เตอร์เมื่อทานเสร็จ</p>
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
