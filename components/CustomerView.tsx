import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { MenuItem, Table, OrderItem, ActiveOrder, CompletedOrder } from '../types';
import { ItemCustomizationModal } from './ItemCustomizationModal';
import { MenuItemImage } from './MenuItemImage';
import Swal from 'sweetalert2';

// --- DICTIONARY ---
// (Optional: Could be expanded for localization if needed, kept basic for now)

interface CustomerViewProps {
    table: Table;
    menuItems: MenuItem[];
    categories: string[];
    activeOrders: ActiveOrder[];
    allBranchOrders: ActiveOrder[];
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
    // State
    const [cart, setCart] = useState<OrderItem[]>([]);
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<string>('ทั้งหมด');
    const [searchTerm, setSearchTerm] = useState('');
    const [itemToCustomize, setItemToCustomize] = useState<MenuItem | null>(null);
    const [customerName, setCustomerName] = useState('');
    const [isOrderHistoryOpen, setIsOrderHistoryOpen] = useState(false);

    // Derived state
    const filteredItems = useMemo(() => {
        let items = menuItems;
        
        // Filter by category
        if (selectedCategory !== 'ทั้งหมด') {
            items = items.filter(i => i.category === selectedCategory);
        }
        
        // Filter by search
        if (searchTerm.trim()) {
            const lowerTerm = searchTerm.toLowerCase();
            items = items.filter(i => i.name.toLowerCase().includes(lowerTerm));
        }
        
        return items;
    }, [menuItems, selectedCategory, searchTerm]);

    const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + (item.finalPrice * item.quantity), 0), [cart]);
    const cartCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);

    // Handlers
    const handleAddToCart = (item: MenuItem) => {
        setItemToCustomize(item);
    };

    const confirmAddToCart = (orderItem: OrderItem) => {
        setCart(prev => {
            // Check if identical item exists (same id, options, notes)
            const existingIndex = prev.findIndex(i => i.cartItemId === orderItem.cartItemId);
            if (existingIndex >= 0) {
                const newCart = [...prev];
                newCart[existingIndex].quantity += orderItem.quantity;
                return newCart;
            }
            return [...prev, orderItem];
        });
        setItemToCustomize(null);
        Swal.fire({
            icon: 'success',
            title: 'เพิ่มลงตะกร้าแล้ว',
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 1000
        });
    };

    const removeFromCart = (cartItemId: string) => {
        setCart(prev => prev.filter(i => i.cartItemId !== cartItemId));
    };

    const updateCartQuantity = (cartItemId: string, delta: number) => {
        setCart(prev => prev.map(item => {
            if (item.cartItemId === cartItemId) {
                const newQty = Math.max(0, item.quantity + delta);
                return { ...item, quantity: newQty };
            }
            return item;
        }).filter(item => item.quantity > 0));
    };

    const handlePlaceOrder = async () => {
        if (cart.length === 0) return;
        
        const result = await Swal.fire({
            title: 'ยืนยันการสั่งอาหาร?',
            text: `ยืนยันการสั่งอาหาร ${cartCount} รายการ รวม ${cartTotal.toLocaleString()} บาท`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'ยืนยันสั่งเลย',
            cancelButtonText: 'ตรวจสอบก่อน',
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33'
        });

        if (result.isConfirmed) {
            try {
                await onPlaceOrder(cart, customerName || 'Guest', 1);
                setCart([]);
                setIsCartOpen(false);
                Swal.fire({
                    icon: 'success',
                    title: 'สั่งอาหารสำเร็จ!',
                    text: 'รายการอาหารถูกส่งเข้าครัวแล้ว',
                    timer: 2000,
                    showConfirmButton: false
                });
            } catch (error) {
                Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถสั่งอาหารได้ กรุณาลองใหม่อีกครั้ง', 'error');
            }
        }
    };

    const handleCallStaff = () => {
        Swal.fire({
            title: 'เรียกพนักงาน?',
            text: 'ต้องการให้พนักงานมาที่โต๊ะหรือไม่',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'เรียกพนักงาน',
            cancelButtonText: 'ยกเลิก'
        }).then((result) => {
            if (result.isConfirmed) {
                onStaffCall(table, customerName || 'Guest');
                Swal.fire({
                    icon: 'success',
                    title: 'ส่งสัญญาณเรียกพนักงานแล้ว',
                    timer: 1500,
                    showConfirmButton: false
                });
            }
        });
    };

    // Render Logic
    return (
        <div className="flex flex-col h-full bg-gray-100 font-sans">
            {/* Header */}
            <header className="bg-white shadow-sm p-3 sticky top-0 z-20 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    {logoUrl ? (
                        <img src={logoUrl} alt="Logo" className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                        <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center text-xs font-bold text-gray-500">Logo</div>
                    )}
                    <div>
                        <h1 className="font-bold text-gray-800 text-lg leading-none">{restaurantName}</h1>
                        <p className="text-sm text-gray-500">โต๊ะ: <span className="font-bold text-blue-600 text-lg">{table.name}</span></p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setIsOrderHistoryOpen(true)} className="p-2 bg-gray-100 rounded-full text-gray-600 relative">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                        {activeOrders.length > 0 && <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></span>}
                    </button>
                    <button onClick={handleCallStaff} className="p-2 bg-yellow-100 text-yellow-700 rounded-full">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                    </button>
                </div>
            </header>

            {/* Categories Sticky Bar */}
            <div className="bg-white border-b sticky top-[64px] z-10 overflow-x-auto whitespace-nowrap p-2 shadow-sm hide-scrollbar">
                {categories.map(cat => (
                    <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-4 py-1.5 rounded-full text-sm font-semibold mx-1 transition-colors ${selectedCategory === cat ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-600'}`}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            {/* Content: Menu List */}
            <div className="flex-1 overflow-y-auto p-4 pb-24">
                {/* Search */}
                <div className="mb-4">
                    <input 
                        type="text" 
                        placeholder="ค้นหาเมนู..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full p-3 rounded-xl border-none shadow-sm focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                {/* Recommended Section (Only on "All" tab and no search) */}
                {selectedCategory === 'ทั้งหมด' && !searchTerm && recommendedMenuItemIds.length > 0 && (
                    <div className="mb-6">
                        <h2 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                            <span className="text-red-500 text-xl">★</span> เมนูแนะนำ
                        </h2>
                        <div className="flex overflow-x-auto gap-4 pb-2 hide-scrollbar">
                            {menuItems.filter(i => recommendedMenuItemIds.includes(i.id)).map(item => (
                                <div key={item.id} className="min-w-[140px] w-[140px] bg-white rounded-xl shadow-md overflow-hidden flex-shrink-0" onClick={() => handleAddToCart(item)}>
                                    <div className="h-24 relative">
                                        <MenuItemImage src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                                        <div className="absolute bottom-0 right-0 bg-red-600 text-white text-xs px-2 py-0.5 rounded-tl-lg font-bold">แนะนำ</div>
                                    </div>
                                    <div className="p-2">
                                        <h3 className="font-semibold text-gray-800 text-sm truncate">{item.name}</h3>
                                        <p className="text-blue-600 font-bold text-sm">{item.price} ฿</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Menu Grid */}
                <div className="grid grid-cols-1 gap-3">
                    {filteredItems.map(item => (
                        <div 
                            key={item.id} 
                            onClick={() => handleAddToCart(item)}
                            className="bg-white p-3 rounded-xl shadow-sm flex gap-3 active:scale-[0.98] transition-transform"
                        >
                            <div className="w-24 h-24 rounded-lg overflow-hidden flex-shrink-0 bg-gray-200">
                                <MenuItemImage src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                            </div>
                            <div className="flex-1 flex flex-col justify-between py-1">
                                <div>
                                    <h3 className="font-bold text-gray-800 text-lg leading-tight line-clamp-2">{item.name}</h3>
                                    <p className="text-xs text-gray-500 mt-1">{item.category}</p>
                                </div>
                                <div className="flex justify-between items-end">
                                    <span className="font-bold text-xl text-blue-600">{item.price}<span className="text-xs font-normal text-gray-500 ml-1">฿</span></span>
                                    <button className="bg-blue-100 text-blue-600 p-2 rounded-full">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                
                {filteredItems.length === 0 && (
                    <div className="text-center py-10 text-gray-500">
                        ไม่พบรายการอาหาร
                    </div>
                )}
            </div>

            {/* Floating Cart Button */}
            {cartCount > 0 && (
                <div className="fixed bottom-4 left-4 right-4 z-30">
                    <button 
                        onClick={() => setIsCartOpen(true)}
                        className="w-full bg-blue-600 text-white p-4 rounded-2xl shadow-xl flex justify-between items-center animate-bounce-small"
                    >
                        <div className="flex items-center gap-3">
                            <span className="bg-white text-blue-600 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">{cartCount}</span>
                            <span className="font-bold text-lg">ตะกร้าของฉัน</span>
                        </div>
                        <span className="font-bold text-xl">{cartTotal.toLocaleString()} ฿</span>
                    </button>
                </div>
            )}

            {/* Cart Modal/Drawer */}
            {isCartOpen && (
                <div className="fixed inset-0 bg-black/60 z-40 flex justify-end" onClick={() => setIsCartOpen(false)}>
                    <div className="w-full h-[90vh] mt-auto bg-white rounded-t-2xl flex flex-col animate-slide-up" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b flex justify-between items-center">
                            <h2 className="text-xl font-bold">รายการในตะกร้า</h2>
                            <button onClick={() => setIsCartOpen(false)} className="text-gray-500 p-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {cart.length === 0 ? (
                                <div className="text-center text-gray-500 mt-10">ไม่มีสินค้าในตะกร้า</div>
                            ) : (
                                cart.map(item => (
                                    <div key={item.cartItemId} className="flex gap-3 border-b pb-4">
                                        <div className="w-20 h-20 bg-gray-100 rounded-lg flex-shrink-0 overflow-hidden">
                                            <MenuItemImage src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                                        </div>
                                        <div className="flex-1 flex flex-col justify-between">
                                            <div>
                                                <h4 className="font-bold text-gray-800">{item.name}</h4>
                                                <p className="text-sm text-gray-500">
                                                    {item.selectedOptions.map(o => o.name).join(', ')} 
                                                    {item.notes && <span className="text-red-500 ml-1">({item.notes})</span>}
                                                </p>
                                            </div>
                                            <div className="flex justify-between items-end">
                                                <div className="flex items-center border rounded-lg overflow-hidden">
                                                    <button onClick={() => updateCartQuantity(item.cartItemId, -1)} className="px-3 py-1 bg-gray-50 text-gray-600 hover:bg-gray-100">-</button>
                                                    <span className="px-3 py-1 font-bold text-sm min-w-[2rem] text-center">{item.quantity}</span>
                                                    <button onClick={() => updateCartQuantity(item.cartItemId, 1)} className="px-3 py-1 bg-gray-50 text-gray-600 hover:bg-gray-100">+</button>
                                                </div>
                                                <div className="flex flex-col items-end">
                                                    <span className="font-bold text-blue-600 text-lg">{(item.finalPrice * item.quantity).toLocaleString()} ฿</span>
                                                    <button onClick={() => removeFromCart(item.cartItemId)} className="text-xs text-red-500 underline mt-1">ลบ</button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="p-4 border-t bg-gray-50 pb-8">
                            <div className="flex justify-between items-center mb-4">
                                <span className="text-gray-600 font-bold">ยอดรวม</span>
                                <span className="text-2xl font-bold text-blue-600">{cartTotal.toLocaleString()} ฿</span>
                            </div>
                            <div className="mb-4">
                                <input 
                                    type="text" 
                                    placeholder="ชื่อของคุณ (Option)" 
                                    value={customerName} 
                                    onChange={e => setCustomerName(e.target.value)} 
                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <button 
                                onClick={handlePlaceOrder} 
                                disabled={cart.length === 0}
                                className="w-full bg-green-600 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-lg"
                            >
                                ยืนยันสั่งอาหาร
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Order History Modal */}
            {isOrderHistoryOpen && (
                <div className="fixed inset-0 bg-black/60 z-40 flex justify-end" onClick={() => setIsOrderHistoryOpen(false)}>
                    <div className="w-full h-[85vh] mt-auto bg-white rounded-t-2xl flex flex-col animate-slide-up" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-2xl">
                            <h2 className="text-xl font-bold text-gray-800">รายการที่สั่งแล้ว</h2>
                            <button onClick={() => setIsOrderHistoryOpen(false)} className="p-2 bg-gray-200 rounded-full">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 bg-gray-100 space-y-4">
                            {/* Combine active and completed orders for history */}
                            {[...activeOrders, ...completedOrders]
                                .filter(o => o.tableId === table.id)
                                .sort((a,b) => b.id - a.id) // Newest first
                                .map(order => (
                                    <div key={order.id} className="bg-white rounded-xl p-4 shadow-sm">
                                        <div className="flex justify-between items-start mb-2 border-b pb-2">
                                            <div>
                                                <span className="font-bold text-gray-800">Order #{String(order.orderNumber).padStart(3, '0')}</span>
                                                <span className="text-xs text-gray-500 block">{new Date(order.orderTime).toLocaleTimeString('th-TH', {hour: '2-digit', minute:'2-digit'})}</span>
                                            </div>
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${
                                                order.status === 'completed' ? 'bg-green-100 text-green-700' :
                                                order.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                                                order.status === 'served' ? 'bg-blue-100 text-blue-700' :
                                                'bg-yellow-100 text-yellow-700'
                                            }`}>
                                                {order.status === 'completed' ? 'ชำระแล้ว' : 
                                                 order.status === 'cancelled' ? 'ยกเลิก' : 
                                                 order.status === 'served' ? 'เสิร์ฟแล้ว' : 'กำลังทำ'}
                                            </span>
                                        </div>
                                        <div className="space-y-2">
                                            {order.items.map((item, idx) => (
                                                <div key={idx} className="flex justify-between text-sm">
                                                    <span className="text-gray-700">{item.quantity}x {item.name}</span>
                                                    <span className="font-medium">{(item.finalPrice * item.quantity).toLocaleString()}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="mt-3 pt-2 border-t flex justify-between items-center font-bold">
                                            <span>รวม</span>
                                            <span className="text-blue-600">
                                                {(order.items.reduce((acc, i) => acc + i.finalPrice * i.quantity, 0) + order.taxAmount).toLocaleString()} ฿
                                            </span>
                                        </div>
                                    </div>
                                ))
                            }
                            {activeOrders.length === 0 && completedOrders.length === 0 && (
                                <div className="text-center text-gray-500 mt-10">ยังไม่มีประวัติการสั่งอาหาร</div>
                            )}
                        </div>
                        <div className="p-4 bg-white border-t">
                            <div className="flex justify-between items-center text-lg font-bold">
                                <span>ยอดรวมทั้งโต๊ะ</span>
                                <span className="text-blue-600">
                                    {[...activeOrders, ...completedOrders]
                                        .filter(o => o.tableId === table.id && o.status !== 'cancelled')
                                        .reduce((sum, order) => sum + order.items.reduce((s, i) => s + i.finalPrice * i.quantity, 0) + order.taxAmount, 0)
                                        .toLocaleString()
                                    } ฿
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Customization Modal */}
            <ItemCustomizationModal 
                isOpen={!!itemToCustomize}
                onClose={() => setItemToCustomize(null)}
                item={itemToCustomize}
                onConfirm={confirmAddToCart}
            />
        </div>
    );
};