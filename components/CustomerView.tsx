
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
    onPlaceOrder: (items: OrderItem[], customerName: string, customerCount: number) => void;
}

export const CustomerView: React.FC<CustomerViewProps> = ({
    table,
    menuItems,
    categories,
    activeOrders,
    onPlaceOrder
}) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [customerName, setCustomerName] = useState('');
    const [pinInput, setPinInput] = useState('');
    const [cartItems, setCartItems] = useState<OrderItem[]>([]);
    const [isCartOpen, setIsCartOpen] = useState(false);
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
        return { text: 'รอคิว... ⏳', color: 'bg-blue-100 text-blue-700 border-blue-200' };
    }, [activeOrders]);


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
            <header className="bg-white shadow-sm px-4 py-3 z-10">
                <div className="flex justify-between items-start mb-1">
                    <div>
                        <h1 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                            เมนูอาหาร 🍽️ 
                            <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-1 rounded-full">โต๊ะ {table.name}</span>
                        </h1>
                        <p className="text-xs text-gray-500 mt-1">คุณ{customerName}</p>
                    </div>
                     {/* Right Side: Status & Bill */}
                    <div className="flex flex-col items-end gap-1.5">
                         {orderStatus && (
                            <span className={`text-xs font-bold px-2 py-1 rounded-full border shadow-sm ${orderStatus.color} animate-pulse`}>
                                {orderStatus.text}
                            </span>
                        )}
                        <div className="text-right">
                            <span className="text-[10px] text-gray-400 block">ยอดที่ต้องชำระ</span>
                            <span className="text-base font-bold text-blue-600 leading-none">{billTotal.toLocaleString()} ฿</span>
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

            {/* Cart Modal (Full Screen on Mobile) */}
            {isCartOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-end sm:justify-center items-end sm:items-center">
                    <div className="bg-white w-full sm:max-w-md h-[90vh] sm:h-[80vh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col animate-slide-up">
                        <div className="p-4 border-b flex justify-between items-center">
                            <h2 className="text-xl font-bold text-gray-800">รายการที่เลือก</h2>
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
