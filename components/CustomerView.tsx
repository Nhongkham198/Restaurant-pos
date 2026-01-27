
import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { MenuItem, Table, OrderItem, ActiveOrder, CompletedOrder } from '../types';
import { ItemCustomizationModal } from './ItemCustomizationModal';
import { MenuItemImage } from './MenuItemImage';
import Swal from 'sweetalert2';

// --- TRANSLATION DICTIONARY ---
const DICTIONARY: Record<string, string> = {
    // UI Elements
    'เมนูอาหาร': 'Menu',
    'โต๊ะ': 'Table',
    'คุณ': 'Guest',
    'เรียกพนักงาน': 'Call Staff',
    'ยอดของฉัน': 'My Total',
    'ดูตะกร้า': 'View Cart',
    'รายการในตะกร้า': 'Cart',
    'ไม่มีสินค้าในตะกร้า': 'Cart is empty',
    'ยืนยันสั่งอาหาร': 'Confirm Order',
    'ลบ': 'Remove',
    'รายการที่สั่งแล้ว': 'Order History',
    'ยังไม่มีรายการที่สั่ง': 'No orders yet',
    'ยอดรวมทั้งโต๊ะ': 'Table Total',
    'ยืนยันการสั่งอาหาร?': 'Confirm Order?',
    'สั่งเลย': 'Order Now',
    'ตรวจสอบก่อน': 'Check First',
    'กำลังส่งรายการ...': 'Sending order...',
    'สั่งอาหารสำเร็จ!': 'Order Success!',
    'รายการอาหารถูกส่งเข้าครัวแล้ว': 'Your order has been sent to the kitchen',
    'เกิดข้อผิดพลาด': 'Error',
    'ไม่สามารถสั่งอาหารได้ กรุณาลองใหม่อีกครั้ง': 'Cannot place order. Please try again.',
    'ส่งสัญญาณเรียกพนักงานแล้ว': 'Staff called',
    'เมนูแนะนำ': 'Recommended',
    'ไม่พบรายการอาหาร': 'No items found',
    'ตะกร้าของฉัน': 'My Cart',
    'ชื่อของคุณ (Option)': 'Your Name (Optional)',
    'ยอดรวม': 'Total',
    'ชำระแล้ว': 'Paid',
    'ยกเลิก': 'Cancelled',
    'เสิร์ฟแล้ว': 'Served',
    'กำลังทำ': 'Cooking',
    'จำนวน': 'Qty',
    'ราคา': 'Price',
    'บาท': 'THB',
    'รวม': 'Total',
    'ค้นหาเมนู...': 'Search menu...',
    'เพิ่มลงตะกร้าแล้ว': 'Added to cart',
    'ไม่ระบุชื่อ': 'Guest',
    
    // Categories (General)
    'ทั้งหมด': 'All',
    'อาหารจานเดียว': 'Rice Dishes',
    'อาหารเกาหลี': 'Korean Food',
    'ของทานเล่น': 'Appetizers',
    'เครื่องดื่ม': 'Drinks', 
    'ของสด': 'Fresh Food',
    'ของแห้ง': 'Dry Food',
    'เครื่องปรุง': 'Seasonings',
    
    // Categories (Specific Requests)
    'เมนู ซุป': 'Soup Menu',
    'เมนู ข้าว': 'Rice Menu',
    'เมนู เส้น': 'Noodle Menu',
    'อาหารจานหลัก': 'Main Course',
    'เมนู ทานเล่น': 'Snack Menu',
    'เมนู เซต': 'Set Menu'
};

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
    const [language, setLanguage] = useState<'TH' | 'EN'>('TH');

    // Helper for translation
    const t = (key: string) => {
        if (language === 'EN') {
            return DICTIONARY[key] || key;
        }
        return key;
    };

    // Derived state with Safety Checks
    const safeMenuItems = useMemo(() => Array.isArray(menuItems) ? menuItems : [], [menuItems]);
    const safeCategories = useMemo(() => Array.isArray(categories) ? categories : [], [categories]);

    const filteredItems = useMemo(() => {
        let items = safeMenuItems;
        
        // Filter by category
        // IMPORTANT: We compare against the Thai category name (key) because that's what is stored in the DB item.category
        if (selectedCategory !== 'ทั้งหมด') {
            items = items.filter(i => i.category === selectedCategory);
        }
        
        // Filter by search
        if (searchTerm.trim()) {
            const lowerTerm = searchTerm.toLowerCase();
            items = items.filter(i => 
                (i.name && i.name.toLowerCase().includes(lowerTerm)) || 
                (i.nameEn && i.nameEn.toLowerCase().includes(lowerTerm))
            );
        }
        
        return items;
    }, [safeMenuItems, selectedCategory, searchTerm]);

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
        
        // Simple toast notification
        const toast = document.createElement('div');
        toast.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-full text-sm z-50 animate-bounce';
        toast.textContent = `✓ ${t('เพิ่มลงตะกร้าแล้ว')}`;
        document.body.appendChild(toast);
        setTimeout(() => document.body.removeChild(toast), 1500);
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
            title: t('ยืนยันการสั่งอาหาร?'),
            text: `${t('ยอดรวม')} ${cartTotal.toLocaleString()} ${t('บาท')}`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: t('สั่งเลย'),
            cancelButtonText: t('ตรวจสอบก่อน'),
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            reverseButtons: true
        });

        if (result.isConfirmed) {
            try {
                await onPlaceOrder(cart, customerName || t('ไม่ระบุชื่อ'), 1);
                setCart([]);
                setIsCartOpen(false);
                Swal.fire({
                    icon: 'success',
                    title: t('สั่งอาหารสำเร็จ!'),
                    text: t('รายการอาหารถูกส่งเข้าครัวแล้ว'),
                    timer: 2000,
                    showConfirmButton: false
                });
            } catch (error) {
                Swal.fire(t('เกิดข้อผิดพลาด'), t('ไม่สามารถสั่งอาหารได้ กรุณาลองใหม่อีกครั้ง'), 'error');
            }
        }
    };

    const handleCallStaff = () => {
        Swal.fire({
            title: t('เรียกพนักงาน') + '?',
            text: t('ต้องการให้พนักงานมาที่โต๊ะหรือไม่'),
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: t('เรียกพนักงาน'),
            cancelButtonText: t('ยกเลิก'),
            confirmButtonColor: '#fbbf24', // Yellow/Amber
            cancelButtonColor: '#9ca3af'
        }).then((result) => {
            if (result.isConfirmed) {
                onStaffCall(table, customerName || 'Guest');
                Swal.fire({
                    icon: 'success',
                    title: t('ส่งสัญญาณเรียกพนักงานแล้ว'),
                    timer: 1500,
                    showConfirmButton: false
                });
            }
        });
    };

    // Render Logic
    return (
        <div className="flex flex-col h-full bg-gray-50 font-sans absolute inset-0 overflow-hidden">
            {/* Header */}
            <header className="bg-white shadow-sm p-3 flex justify-between items-center z-20 flex-shrink-0">
                <div className="flex items-center gap-3">
                    {logoUrl ? (
                        <img src={logoUrl} alt="Logo" className="w-10 h-10 rounded-full object-cover border border-gray-200" />
                    ) : (
                        <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center text-xs font-bold text-gray-500">Logo</div>
                    )}
                    <div>
                        <h1 className="font-bold text-gray-800 text-lg leading-none">
                            {t('เมนูอาหาร')}
                        </h1>
                        <p className="text-xs text-gray-500 mt-0.5">
                            {t('โต๊ะ')} <span className="font-bold text-blue-600 text-sm">{table.name}</span>
                        </p>
                    </div>
                </div>
                
                <div className="flex items-center gap-2">
                    {/* Language Switcher */}
                    <button 
                        onClick={() => setLanguage(prev => prev === 'TH' ? 'EN' : 'TH')}
                        className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-600 border border-gray-200 shadow-sm"
                    >
                        {language === 'TH' ? 'EN' : 'TH'}
                    </button>

                    <button onClick={() => setIsOrderHistoryOpen(true)} className="p-2 bg-gray-100 rounded-full text-gray-600 relative hover:bg-gray-200 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                        {activeOrders.length > 0 && <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>}
                    </button>
                    
                    <button onClick={handleCallStaff} className="p-2 bg-yellow-100 text-yellow-700 rounded-full hover:bg-yellow-200 transition-colors shadow-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                    </button>
                </div>
            </header>

            {/* Categories Sticky Bar */}
            <div className="bg-white border-b sticky top-0 z-10 overflow-x-auto whitespace-nowrap p-2 shadow-sm hide-scrollbar flex-shrink-0">
                {safeCategories.map(cat => (
                    <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-4 py-1.5 rounded-full text-sm font-semibold mx-1 transition-colors ${selectedCategory === cat ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-600'}`}
                    >
                        {t(cat)}
                    </button>
                ))}
            </div>

            {/* Content: Menu List */}
            <div className="flex-1 overflow-y-auto p-4 pb-24 bg-gray-50">
                {/* Search */}
                <div className="mb-4 relative">
                    <input 
                        type="text" 
                        placeholder={t('ค้นหาเมนู...')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 rounded-xl border-none shadow-sm focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 absolute left-3 top-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>

                {/* Recommended Section */}
                {selectedCategory === 'ทั้งหมด' && !searchTerm && recommendedMenuItemIds.length > 0 && (
                    <div className="mb-6">
                        <h2 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                            <span className="text-yellow-500 text-xl">★</span> {t('เมนูแนะนำ')}
                        </h2>
                        <div className="flex overflow-x-auto gap-4 pb-2 hide-scrollbar">
                            {safeMenuItems.filter(i => recommendedMenuItemIds.includes(i.id)).map(item => (
                                <div key={item.id} className="min-w-[150px] w-[150px] bg-white rounded-xl shadow-sm overflow-hidden flex-shrink-0 active:scale-95 transition-transform" onClick={() => handleAddToCart(item)}>
                                    <div className="h-28 relative">
                                        <MenuItemImage src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                                        <div className="absolute top-2 left-2 bg-yellow-400 text-white text-[10px] px-2 py-0.5 rounded-full font-bold shadow-sm">Hot</div>
                                    </div>
                                    <div className="p-3">
                                        <h3 className="font-semibold text-gray-800 text-sm truncate">{language === 'EN' && item.nameEn ? item.nameEn : item.name}</h3>
                                        <p className="text-blue-600 font-bold text-sm mt-1">{item.price} ฿</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Menu Grid */}
                <h2 className="text-xl font-bold text-gray-800 mb-3">{t(selectedCategory)}</h2>
                <div className="grid grid-cols-1 gap-3">
                    {filteredItems.map(item => (
                        <div 
                            key={item.id} 
                            onClick={() => handleAddToCart(item)}
                            className="bg-white p-3 rounded-xl shadow-sm flex gap-3 active:scale-[0.98] transition-transform border border-gray-100"
                        >
                            <div className="w-24 h-24 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                                <MenuItemImage src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                            </div>
                            <div className="flex-1 flex flex-col justify-between py-1">
                                <div>
                                    <h3 className="font-bold text-gray-800 text-base leading-tight line-clamp-2">
                                        {language === 'EN' && item.nameEn ? item.nameEn : item.name}
                                    </h3>
                                    {language === 'EN' && item.nameEn && (
                                        <p className="text-xs text-gray-400 mt-0.5">{item.name}</p>
                                    )}
                                </div>
                                <div className="flex justify-between items-end">
                                    <span className="font-bold text-lg text-blue-600">{item.price} <span className="text-xs font-normal text-gray-500">฿</span></span>
                                    <button className="bg-blue-50 text-blue-600 p-2 rounded-full hover:bg-blue-100 transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                
                {filteredItems.length === 0 && (
                    <div className="text-center py-10 text-gray-400 flex flex-col items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                        <p>{t('ไม่พบรายการอาหาร')}</p>
                    </div>
                )}
            </div>

            {/* Floating Cart Button */}
            {cartCount > 0 && (
                <div className="fixed bottom-4 left-4 right-4 z-30">
                    <button 
                        onClick={() => setIsCartOpen(true)}
                        className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white p-4 rounded-2xl shadow-xl flex justify-between items-center animate-bounce-small active:scale-95 transition-transform"
                    >
                        <div className="flex items-center gap-3">
                            <span className="bg-white text-blue-600 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">{cartCount}</span>
                            <span className="font-bold text-lg">{t('ตะกร้าของฉัน')}</span>
                        </div>
                        <span className="font-bold text-xl">{cartTotal.toLocaleString()} ฿</span>
                    </button>
                </div>
            )}

            {/* Cart Modal/Drawer */}
            {isCartOpen && (
                <div className="fixed inset-0 bg-black/60 z-40 flex justify-end" onClick={() => setIsCartOpen(false)}>
                    <div className="w-full h-[90vh] mt-auto bg-white rounded-t-2xl flex flex-col animate-slide-up shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-2xl">
                            <h2 className="text-xl font-bold text-gray-800">{t('รายการในตะกร้า')}</h2>
                            <button onClick={() => setIsCartOpen(false)} className="text-gray-500 p-2 hover:bg-gray-200 rounded-full">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {cart.length === 0 ? (
                                <div className="text-center text-gray-500 mt-20 flex flex-col items-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                                    </svg>
                                    {t('ไม่มีสินค้าในตะกร้า')}
                                </div>
                            ) : (
                                cart.map(item => (
                                    <div key={item.cartItemId} className="flex gap-3 border-b border-gray-100 pb-4">
                                        <div className="w-20 h-20 bg-gray-100 rounded-lg flex-shrink-0 overflow-hidden">
                                            <MenuItemImage src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                                        </div>
                                        <div className="flex-1 flex flex-col justify-between">
                                            <div>
                                                <h4 className="font-bold text-gray-800 text-sm leading-tight">
                                                    {language === 'EN' && item.nameEn ? item.nameEn : item.name}
                                                </h4>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    {item.selectedOptions.map(o => language === 'EN' && o.nameEn ? o.nameEn : o.name).join(', ')} 
                                                    {item.notes && <span className="text-red-500 ml-1 block">Note: {item.notes}</span>}
                                                </p>
                                            </div>
                                            <div className="flex justify-between items-end mt-2">
                                                <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden h-8">
                                                    <button onClick={() => updateCartQuantity(item.cartItemId, -1)} className="px-2 h-full bg-gray-50 text-gray-600 hover:bg-gray-100 font-bold">-</button>
                                                    <span className="px-2 h-full font-bold text-sm min-w-[1.5rem] flex items-center justify-center bg-white">{item.quantity}</span>
                                                    <button onClick={() => updateCartQuantity(item.cartItemId, 1)} className="px-2 h-full bg-gray-50 text-gray-600 hover:bg-gray-100 font-bold">+</button>
                                                </div>
                                                <div className="flex flex-col items-end">
                                                    <span className="font-bold text-blue-600 text-base">{(item.finalPrice * item.quantity).toLocaleString()} ฿</span>
                                                    <button onClick={() => removeFromCart(item.cartItemId)} className="text-[10px] text-red-500 underline mt-1">{t('ลบ')}</button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="p-4 border-t bg-gray-50 pb-8 rounded-b-xl shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
                            <div className="flex justify-between items-center mb-4">
                                <span className="text-gray-600 font-bold">{t('ยอดรวม')}</span>
                                <span className="text-2xl font-bold text-blue-600">{cartTotal.toLocaleString()} ฿</span>
                            </div>
                            <div className="mb-4">
                                <input 
                                    type="text" 
                                    placeholder={t('ชื่อของคุณ (Option)')}
                                    value={customerName} 
                                    onChange={e => setCustomerName(e.target.value)} 
                                    className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 bg-white"
                                />
                            </div>
                            <button 
                                onClick={handlePlaceOrder} 
                                disabled={cart.length === 0}
                                className="w-full bg-green-600 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-lg transition-colors"
                            >
                                {t('ยืนยันสั่งอาหาร')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Order History Modal */}
            {isOrderHistoryOpen && (
                <div className="fixed inset-0 bg-black/60 z-40 flex justify-end" onClick={() => setIsOrderHistoryOpen(false)}>
                    <div className="w-full h-[85vh] mt-auto bg-white rounded-t-2xl flex flex-col animate-slide-up shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-2xl">
                            <h2 className="text-xl font-bold text-gray-800">{t('รายการที่สั่งแล้ว')}</h2>
                            <button onClick={() => setIsOrderHistoryOpen(false)} className="p-2 bg-gray-200 rounded-full hover:bg-gray-300">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 bg-gray-100 space-y-4">
                            {/* Combine active and completed orders for history */}
                            {[...activeOrders, ...completedOrders]
                                .filter(o => o.tableId === table.id)
                                .sort((a,b) => b.id - a.id) // Newest first
                                .map(order => (
                                    <div key={order.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                                        <div className="flex justify-between items-start mb-2 border-b border-gray-100 pb-2">
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
                                                {order.status === 'completed' ? t('ชำระแล้ว') : 
                                                 order.status === 'cancelled' ? t('ยกเลิก') : 
                                                 order.status === 'served' ? t('เสิร์ฟแล้ว') : t('กำลังทำ')}
                                            </span>
                                        </div>
                                        <div className="space-y-2">
                                            {order.items.map((item, idx) => (
                                                <div key={idx} className="flex justify-between text-sm">
                                                    <span className="text-gray-700">
                                                        {item.quantity}x {language === 'EN' && item.nameEn ? item.nameEn : item.name}
                                                    </span>
                                                    <span className="font-medium">{(item.finalPrice * item.quantity).toLocaleString()}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="mt-3 pt-2 border-t border-gray-100 flex justify-between items-center font-bold">
                                            <span>{t('รวม')}</span>
                                            <span className="text-blue-600">
                                                {(order.items.reduce((acc, i) => acc + i.finalPrice * i.quantity, 0) + order.taxAmount).toLocaleString()} ฿
                                            </span>
                                        </div>
                                    </div>
                                ))
                            }
                            {activeOrders.length === 0 && completedOrders.length === 0 && (
                                <div className="text-center text-gray-500 mt-10">{t('ยังไม่มีรายการที่สั่ง')}</div>
                            )}
                        </div>
                        <div className="p-4 bg-white border-t rounded-b-xl">
                            <div className="flex justify-between items-center text-lg font-bold">
                                <span>{t('ยอดรวมทั้งโต๊ะ')}</span>
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
