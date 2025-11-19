
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

    const totalAmount = useMemo(() => cartItems.reduce((sum, i) => sum + (i.finalPrice * i.quantity), 0), [cartItems]);
    const totalItemsCount = useMemo(() => cartItems.reduce((sum, i) => sum + i.quantity, 0), [cartItems]);

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
            <header className="bg-white shadow-sm px-4 py-3 flex justify-between items-center z-10">
                <div>
                    <h1 className="font-bold text-gray-800 text-lg">เมนูอาหาร 🍽️</h1>
                    <p className="text-xs text-gray-500">โต๊ะ {table.name} • คุณ{customerName}</p>
                </div>
                <div className="text-sm font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
                    {activeOrders.length > 0 ? 'รออาหาร...' : 'กำลังสั่ง'}
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
            {totalItemsCount > 0 && (
                <div className="absolute bottom-6 left-4 right-4 z-20">
                    <button 
                        onClick={() => setIsCartOpen(true)}
                        className="w-full bg-blue-600 text-white shadow-xl rounded-xl p-4 flex justify-between items-center animate-bounce-in"
                    >
                        <div className="flex items-center gap-3">
                            <span className="bg-white text-blue-600 font-bold w-8 h-8 rounded-full flex items-center justify-center">
                                {totalItemsCount}
                            </span>
                            <span className="font-semibold text-lg">ดูตะกร้า</span>
                        </div>
                        <span className="font-bold text-lg">{totalAmount.toLocaleString()} ฿</span>
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
                                <span>ยอดรวม</span>
                                <span>{totalAmount.toLocaleString()} ฿</span>
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
