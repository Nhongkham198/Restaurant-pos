
import React, { useState, useMemo, useEffect } from 'react';
import { useData } from '../contexts/DataContext';
import { MenuItem, OrderItem, MenuOption, PreOrder } from '../types';
import { useFirestoreCollection } from '../hooks/useFirestoreSync';
import Swal from 'sweetalert2';
import { motion, AnimatePresence } from 'framer-motion';

export const PreOrderCustomer: React.FC = () => {
    const { 
        menuItems, 
        categories, 
        selectedBranch, 
        branchId,
        restaurantName,
        logoUrl,
        appLogoUrl,
        recommendedMenuItemIds,
        preOrdersActions
    } = useData();

    const [activeCategory, setActiveCategory] = useState<string>(categories[0] || 'ทั้งหมด');
    const [cart, setCart] = useState<OrderItem[]>([]);
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerCount, setCustomerCount] = useState<number>(1);
    const [orderType, setOrderType] = useState<'dine-in' | 'takeaway'>('dine-in');
    const [notes, setNotes] = useState('');
    const [isInAppBrowser, setIsInAppBrowser] = useState(false);
    const [hasSetCustomerCount, setHasSetCustomerCount] = useState(false);
    const isMonday = new Date().getDay() === 1;

    // NEW: Check for Monday closure
    useEffect(() => {
        if (isMonday) {
            Swal.fire({
                title: 'วันนี้ร้านปิดทำการค่ะ',
                text: 'ขออภัยด้วยนะคะ วันจันทร์ร้านปิดให้บริการ แต่ลูกค้ายังสามารถเลือกดูเมนูต่างๆ ได้ตามปกติค่ะ (ไม่สามารถส่งออเดอร์ได้)',
                icon: 'info',
                confirmButtonText: 'รับทราบและเลือกชมเมนู',
                confirmButtonColor: '#3b82f6',
                allowOutsideClick: false,
            });
        }
    }, [isMonday]);
    const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
    const [itemQuantity, setItemQuantity] = useState(1);
    const [selectedOptions, setSelectedOptions] = useState<MenuOption[]>([]);

    useEffect(() => {
        const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
        const isInApp = (ua.indexOf("FBAN") > -1) || (ua.indexOf("FBAV") > -1) || (ua.indexOf("Line") > -1) || (ua.indexOf("Instagram") > -1);
        
        if (isInApp) {
            setIsInAppBrowser(true);
            Swal.fire({
                title: 'เพื่อการใช้งานที่เสถียรกว่า',
                html: `
                    <div class="text-left space-y-3">
                        <p class="text-sm text-gray-600">คุณกำลังเปิดผ่านแอป (เช่น Line, Facebook) ซึ่งอาจส่งผลให้การสั่งอาหารไม่เสถียร</p>
                        <p class="text-sm font-bold text-blue-600">แนะนำให้เปิดผ่าน Browser ภายนอก (Safari หรือ Chrome) ครับ</p>
                    </div>
                `,
                icon: 'info',
                confirmButtonText: 'คัดลอกลิงก์เพื่อนำไปเปิดที่อื่น',
                showCancelButton: true,
                cancelButtonText: 'สั่งในนี้ต่อ',
                confirmButtonColor: '#3b82f6',
                cancelButtonColor: '#9ca3af',
            }).then((result) => {
                if (result.isConfirmed) {
                    handleCopyLink();
                }
            });
        }
    }, []);

    // NEW: Prompt for Order Type and Customer Count on initial menu view
    useEffect(() => {
        if (!selectedBranch || hasSetCustomerCount || isMonday) return;

        const timer = setTimeout(async () => {
            const { value: type } = await Swal.fire({
                title: 'สนใจรับประทานแบบไหนดีคะ?',
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'ทานที่ร้าน',
                cancelButtonText: 'สั่งกลับบ้าน',
                confirmButtonColor: '#3b82f6',
                cancelButtonColor: '#fbbf24',
                allowOutsideClick: false,
                reverseButtons: true
            });

            if (type) {
                // User chose Dine-in
                setOrderType('dine-in');
                const { value: count } = await Swal.fire({
                    title: 'มากี่ท่านคะ?',
                    text: 'เพื่อความสะดวกในการจัดเตรียมโต๊ะและอุปกรณ์สำหรับท่าน',
                    input: 'number',
                    inputValue: 1,
                    inputAttributes: {
                        min: '1',
                        max: '50',
                        step: '1'
                    },
                    confirmButtonText: 'ตกลง',
                    confirmButtonColor: '#3b82f6',
                    allowOutsideClick: false,
                    inputValidator: (value) => {
                        if (!value || parseInt(value) < 1) {
                            return 'กรุณาระบุจำนวนอย่างน้อย 1 ท่านค่ะ';
                        }
                        return null;
                    }
                });

                if (count) {
                    setCustomerCount(parseInt(count));
                    setHasSetCustomerCount(true);
                }
            } else {
                // User chose Takeaway (Clicked "cancel" button which we labeled "สั่งกลับบ้าน")
                setOrderType('takeaway');
                setCustomerCount(0);
                setHasSetCustomerCount(true);
            }
        }, 800);

        return () => clearTimeout(timer);
    }, [selectedBranch, hasSetCustomerCount]);

    const handleCopyLink = () => {
        const currentUrl = window.location.href;
        navigator.clipboard.writeText(currentUrl).then(() => {
            Swal.fire({
                icon: 'success',
                title: 'คัดลอกลิงก์สำเร็จ!',
                text: 'กรุณานำไปวางใน Browser (Chrome/Safari) ครับ',
                timer: 2500,
                showConfirmButton: false
            });
        }).catch(() => {
            // Fallback for copy
            const textArea = document.createElement("textarea");
            textArea.value = currentUrl;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            Swal.fire({
                icon: 'success',
                title: 'คัดลอกลิงก์สำเร็จ!',
                text: 'กรุณานำไปวางใน Browser (Chrome/Safari) ครับ',
                timer: 2500,
                showConfirmButton: false
            });
        });
    };

    const filteredItems = useMemo(() => {
        if (activeCategory === 'ทั้งหมด') return menuItems.filter(item => item.isVisible !== false);
        return menuItems.filter(item => item.category === activeCategory && item.isVisible !== false);
    }, [menuItems, activeCategory]);

    const totalAmount = useMemo(() => {
        return cart.reduce((sum, item) => sum + (item.finalPrice * item.quantity), 0);
    }, [cart]);

    const handleAddToCart = () => {
        if (!selectedItem) return;

        const basePrice = selectedItem.price;
        const optionsPrice = selectedOptions.reduce((sum, opt) => sum + opt.priceModifier, 0);
        const finalPrice = basePrice + optionsPrice;

        const newCartItem: OrderItem = {
            ...selectedItem,
            id: selectedItem.id,
            quantity: itemQuantity,
            isTakeaway: false,
            cartItemId: `${Date.now()}-${selectedItem.id}`,
            finalPrice,
            selectedOptions: [...selectedOptions]
        };

        setCart(prev => [...prev, newCartItem]);
        setSelectedItem(null);
        setItemQuantity(1);
        setSelectedOptions([]);
        
        Swal.fire({
            icon: 'success',
            title: 'เพิ่มลงตะกร้าแล้ว',
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 1500
        });
    };

    const handleRemoveFromCart = (cartItemId: string) => {
        setCart(prev => prev.filter(item => item.cartItemId !== cartItemId));
    };

    const handleSubmitPreOrder = async () => {
        if (isMonday) {
            Swal.fire({
                icon: 'error',
                title: 'ไม่สามารถสั่งอาหารได้',
                text: 'ขออภัยค่ะ วันจันทร์ร้านปิดทำการ ลูกค้าสามารถดูเมนูได้เท่านั้นค่ะ',
                confirmButtonColor: '#3b82f6'
            });
            return;
        }

        if (!customerName.trim() || !customerPhone.trim() || cart.length === 0) {
            Swal.fire({
                icon: 'error',
                title: 'ข้อมูลไม่ครบถ้วน',
                text: 'กรุณาระบุชื่อและเบอร์โทรศัพท์เพื่อให้พนักงานติดต่อกลับได้ครับ',
                confirmButtonColor: '#3b82f6'
            });
            return;
        }

        try {
            const preOrderId = `PRE-${Date.now()}`;
            await preOrdersActions.add({
                id: preOrderId,
                customerName: customerName.trim(),
                customerPhone: customerPhone.trim(),
                customerCount: orderType === 'takeaway' ? 0 : customerCount,
                orderType,
                items: cart,
                status: 'pending',
                timestamp: Date.now(),
                branchId: branchId ? Number(branchId) : 0,
                notes: notes.trim(),
                totalAmount
            });

            await Swal.fire({
                icon: 'success',
                title: 'ส่งรายการสั่งซื้อสำเร็จ!',
                text: 'กรุณารอพนักงานยืนยันออเดอร์เมื่อท่านเดินทางถึงร้าน',
                confirmButtonText: 'ตกลง',
                confirmButtonColor: '#3b82f6'
            });

            // Reset
            setCart([]);
            setIsCartOpen(false);
            setIsCheckoutOpen(false);
            setCustomerName('');
            setCustomerPhone('');
            setNotes('');
        } catch (error) {
            console.error("Error submitting preOrder:", error);
            Swal.fire('Error', 'ไม่สามารถส่งข้อมูลได้ กรุณาลองใหม่อีกครั้ง', 'error');
        }
    };

    if (!selectedBranch) {
        return (
            <div className="h-screen w-screen flex flex-col items-center justify-center p-6 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                <p>กำลังเตรียมข้อมูลเมนู...</p>
            </div>
        );
    }

    return (
        <div className="h-screen w-screen flex flex-col bg-gray-50 overflow-hidden font-sans text-gray-900">
            {/* Browser Warning Banner */}
            {isInAppBrowser && (
                <div className="bg-blue-600 text-white px-4 py-2.5 flex items-center justify-between shrink-0 relative z-[200]">
                    <div className="flex items-center gap-2">
                        <div className="bg-white/20 p-1 rounded-md animate-pulse">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-wider leading-tight">แนะนำให้เปิดผ่าน Browser ภายนอกเพื่อความเสถียร</span>
                    </div>
                    <button 
                        onClick={handleCopyLink}
                        className="bg-white text-blue-600 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase shadow-lg active:scale-95 transition-transform"
                    >
                        คัดลอกลิงก์
                    </button>
                </div>
            )}

            {/* Header */}
            <header className="bg-white border-b border-gray-100 flex flex-col items-center py-6 px-4 shrink-0">
                {isMonday && (
                    <div className="w-full max-w-sm mb-4 bg-rose-50 border border-rose-100 p-3 rounded-2xl flex items-center gap-3 animate-pulse">
                        <div className="bg-rose-500 text-white p-1.5 rounded-lg">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div className="flex-1 text-left">
                            <p className="text-[10px] font-black text-rose-600 uppercase tracking-wider">วันจันทร์ร้านปิดทำการ</p>
                            <p className="text-[11px] font-bold text-rose-400 leading-tight">ขออภัยค่ะ วันนี้รับชมเพื่อดูเมนูเท่านั้น ไม่สามารถส่งออเดอร์ได้ค่ะ</p>
                        </div>
                    </div>
                )}
                {appLogoUrl || logoUrl ? (
                    <img src={appLogoUrl || logoUrl || ''} alt="Logo" className="w-16 h-16 object-contain mb-3 rounded-2xl shadow-sm" />
                ) : (
                    <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-3">
                        <span className="text-2xl font-black text-blue-600 font-serif">{restaurantName?.charAt(0)}</span>
                    </div>
                )}
                <h1 className="text-xl font-black text-gray-900 leading-tight">{restaurantName}</h1>
                <p className="text-xs font-bold text-gray-400 mt-1 uppercase tracking-widest text-center">ยินดีต้อนรับ! สั่งอาหารล่วงหน้าได้เลยครับ</p>
                
                {/* Order Type Switcher */}
                <div className="mt-4 flex bg-gray-100 p-1 rounded-xl w-full max-w-[280px]">
                    <button 
                        onClick={() => !hasSetCustomerCount && setOrderType('dine-in')}
                        disabled={hasSetCustomerCount}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-black transition-all ${orderType === 'dine-in' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'} ${hasSetCustomerCount ? 'cursor-default' : ''}`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                            <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                        </svg>
                        ทานที่ร้าน
                    </button>
                    <button 
                        onClick={() => !hasSetCustomerCount && setOrderType('takeaway')}
                        disabled={hasSetCustomerCount}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-black transition-all ${orderType === 'takeaway' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'} ${hasSetCustomerCount ? 'cursor-default' : ''}`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4zm-6 3a1 1 0 112 0 1 1 0 01-2 0zm7-1a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
                        </svg>
                        สั่งกลับบ้าน
                    </button>
                </div>
            </header>

            {/* Categories */}
            <div className="bg-white border-b border-gray-50 flex overflow-x-auto py-4 px-2 gap-2 scrollbar-hide shrink-0">
                <button 
                    onClick={() => setActiveCategory('ทั้งหมด')}
                    className={`px-6 py-2.5 rounded-full text-sm font-black whitespace-nowrap transition-all duration-300 ${activeCategory === 'ทั้งหมด' ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}
                >
                    ทั้งหมด
                </button>
                {categories.map(cat => (
                    <button 
                        key={cat}
                        onClick={() => setActiveCategory(cat)}
                        className={`px-6 py-2.5 rounded-full text-sm font-black whitespace-nowrap transition-all duration-300 ${activeCategory === cat ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            {/* Menu Grid */}
            <main className="flex-1 overflow-y-auto p-4 tabletP:p-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 tabletP:gap-4">
                    {filteredItems.map(item => (
                        <div 
                            key={item.id}
                            onClick={() => setSelectedItem(item)}
                            className="bg-white rounded-2xl p-2 pb-3 shadow-sm hover:shadow-xl transition-all cursor-pointer group flex flex-col h-full border border-gray-100/50"
                        >
                            <div className="aspect-[4/3] w-full bg-gray-50 rounded-xl overflow-hidden mb-2 relative">
                                {item.imageUrl ? (
                                    <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-200">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002-2z" />
                                        </svg>
                                    </div>
                                )}
                                {recommendedMenuItemIds.includes(item.id) && (
                                    <div className="absolute top-2 right-2 bg-yellow-400 text-red-600 px-2 py-1 rounded-lg shadow-lg z-10 animate-bounce flex items-center gap-1">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                        </svg>
                                        <span className="text-[11px] font-black uppercase">แนะนำ</span>
                                    </div>
                                )}
                            </div>
                            <h3 className="text-sm font-black text-gray-900 line-clamp-2 leading-tight mb-2 min-h-[2.5rem]">{item.name}</h3>
                            <div className="mt-auto flex items-center justify-between">
                                <span className="text-sm font-black text-blue-600">{item.price.toLocaleString()}.-</span>
                                <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                                    </svg>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="h-32"></div> {/* Spacer for cart button */}
            </main>

            {/* Cart Button */}
            {cart.length > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-sm px-6">
                    <button 
                        onClick={() => setIsCartOpen(true)}
                        className="w-full bg-blue-600 text-white rounded-3xl py-5 px-6 shadow-2xl shadow-blue-200 flex items-center justify-between group active:scale-95 transition-all"
                    >
                        <div className="flex items-center gap-3">
                            <div className="bg-white/20 w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black">
                                {cart.length}
                            </div>
                            <span className="text-sm font-black uppercase tracking-widest leading-none">ดูตะกร้าสินค้า</span>
                        </div>
                        <span className="text-lg font-black">{totalAmount.toLocaleString()}.-</span>
                    </button>
                </div>
            )}

            {/* Item Customization Modal */}
            <AnimatePresence>
                {selectedItem && (
                    <div className="fixed inset-0 z-[110] flex items-end tabletP:items-center justify-center p-0 tabletP:p-4">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
                            onClick={() => setSelectedItem(null)}
                        ></motion.div>
                        <motion.div 
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            className="relative bg-white w-full max-w-lg rounded-t-[3rem] tabletP:rounded-[3rem] overflow-hidden"
                        >
                            <div className="p-8 pb-4">
                                <div className="flex justify-between items-start mb-6">
                                    <div className="flex-1">
                                        <h2 className="text-2xl font-black text-gray-900 leading-tight">{selectedItem.name}</h2>
                                        <p className="text-sm font-bold text-gray-400 mt-1">{selectedItem.category}</p>
                                    </div>
                                    <span className="text-2xl font-black text-blue-600">{selectedItem.price.toLocaleString()}.-</span>
                                </div>

                                {selectedItem.imageUrl && (
                                    <img src={selectedItem.imageUrl} alt={selectedItem.name} className="w-full h-48 object-cover rounded-[2rem] shadow-lg mb-6" />
                                )}

                                {/* Options would go here if item has optionGroups */}
                                {selectedItem.optionGroups?.map(group => (
                                    <div key={group.id} className="mb-6">
                                        <div className="flex justify-between items-center mb-3">
                                            <h4 className="font-black text-gray-800 text-sm">{group.name}</h4>
                                            {group.required && <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-lg font-black">จำเป็น</span>}
                                        </div>
                                        <div className="space-y-2">
                                            {group.options.map(opt => {
                                                const isSelected = selectedOptions.some(so => so.id === opt.id);
                                                return (
                                                    <button 
                                                        key={opt.id}
                                                        onClick={() => {
                                                            if (group.selectionType === 'single') {
                                                                setSelectedOptions(prev => [...prev.filter(so => !group.options.some(go => go.id === so.id)), opt]);
                                                            } else {
                                                                setSelectedOptions(prev => isSelected ? prev.filter(so => so.id !== opt.id) : [...prev, opt]);
                                                            }
                                                        }}
                                                        className={`w-full flex justify-between items-center p-4 rounded-2xl border-2 transition-all ${isSelected ? 'bg-blue-50 border-blue-600' : 'bg-white border-gray-100 active:border-blue-200'}`}
                                                    >
                                                        <span className={`text-sm font-bold ${isSelected ? 'text-blue-700' : 'text-gray-700'}`}>{opt.name}</span>
                                                        <span className="text-sm font-black text-gray-400">
                                                            {opt.priceModifier > 0 ? `+${opt.priceModifier}` : 'ฟรี'}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}

                                <div className="flex items-center justify-between bg-gray-50 p-4 rounded-3xl mb-8">
                                    <span className="text-sm font-black text-gray-400 uppercase tracking-widest">จำนวน</span>
                                    <div className="flex items-center gap-6">
                                        <button 
                                            onClick={() => setItemQuantity(Math.max(1, itemQuantity - 1))}
                                            className="w-10 h-10 bg-white shadow-sm border border-gray-100 rounded-xl flex items-center justify-center active:scale-90 transition-all"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M20 12H4" />
                                            </svg>
                                        </button>
                                        <span className="text-xl font-black text-gray-900 w-6 text-center">{itemQuantity}</span>
                                        <button 
                                            onClick={() => setItemQuantity(itemQuantity + 1)}
                                            className="w-10 h-10 bg-blue-600 text-white shadow-lg shadow-blue-100 rounded-xl flex items-center justify-center active:scale-95 transition-all"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="p-8 pt-0 flex gap-4">
                                <button 
                                    onClick={() => setSelectedItem(null)}
                                    className="flex-1 py-5 rounded-3xl font-black text-sm text-gray-400 hover:bg-gray-50 transition-all uppercase tracking-widest border-2 border-transparent"
                                >
                                    ยกเลิก
                                </button>
                                <button 
                                    onClick={handleAddToCart}
                                    className="flex-[2] py-5 rounded-3xl bg-blue-600 text-white font-black text-sm transition-all uppercase tracking-widest shadow-xl shadow-blue-100"
                                >
                                    ใส่ตะกร้า ({( (selectedItem.price + selectedOptions.reduce((s,o)=>s+o.priceModifier,0)) * itemQuantity).toLocaleString()})
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Cart Modal */}
            <AnimatePresence>
                {isCartOpen && (
                    <div className="fixed inset-0 z-[120] flex items-end justify-center p-0">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
                            onClick={() => setIsCartOpen(false)}
                        ></motion.div>
                        <motion.div 
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            className="relative bg-white w-full max-w-lg h-[80vh] rounded-t-[3rem] flex flex-col"
                        >
                            <div className="p-8 border-b border-gray-50 flex justify-between items-center shrink-0">
                                <h2 className="text-2xl font-black text-gray-900 tracking-tight">ตะกร้าของคุณ</h2>
                                <button onClick={() => setIsCartOpen(false)} className="p-2 hover:bg-gray-50 rounded-full transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-8 space-y-6">
                                {cart.map((item) => (
                                    <div key={item.cartItemId} className="flex gap-4 group">
                                        <div className="w-20 h-20 bg-gray-50 rounded-2xl overflow-hidden shrink-0">
                                            {item.imageUrl && <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />}
                                        </div>
                                        <div className="flex-1 flex flex-col justify-center">
                                            <div className="flex justify-between items-start">
                                                <h4 className="text-sm font-black text-gray-800 leading-tight pr-4">{item.name}</h4>
                                                <button 
                                                    onClick={() => handleRemoveFromCart(item.cartItemId)}
                                                    className="text-red-400 hover:text-red-600 p-1"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            </div>
                                            <div className="mt-1 flex items-center justify-between">
                                                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{item.quantity} จาน</span>
                                                <span className="text-sm font-black text-gray-900">{(item.finalPrice * item.quantity).toLocaleString()}.-</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="p-8 bg-gray-50 shrink-0">
                                <div className="flex justify-between items-center mb-6">
                                    <span className="text-sm font-black text-gray-400 uppercase tracking-widest">ยอดรวมทั้งหมด</span>
                                    <span className="text-3xl font-black text-blue-600">{totalAmount.toLocaleString()}.-</span>
                                </div>
                                <button 
                                    onClick={() => {
                                        setIsCartOpen(false);
                                        setIsCheckoutOpen(true);
                                    }}
                                    className="w-full py-5 rounded-3xl bg-blue-600 text-white font-black text-sm uppercase tracking-widest shadow-xl shadow-blue-100 flex items-center justify-center gap-3 active:scale-95 transition-all"
                                >
                                    ยืนยันรายการ (สั่งล่วงหน้า)
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                    </svg>
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Checkout Form Modal */}
            <AnimatePresence>
                {isCheckoutOpen && (
                    <div className="fixed inset-0 z-[130] flex items-end justify-center p-0">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
                            onClick={() => setIsCheckoutOpen(false)}
                        ></motion.div>
                        <motion.div 
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            className="relative bg-white w-full max-w-lg rounded-t-[3rem] p-8"
                        >
                            <h2 className="text-2xl font-black text-gray-900 tracking-tight mb-8">ข้อมูลสำหรับการติดต่อ</h2>
                            <div className="space-y-6 mb-8">
                                <div>
                                    <label className="block text-xs font-black text-gray-400 mb-2 uppercase tracking-widest">ข้อมูลการติดต่อ (คนสั่ง)</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <input 
                                            type="text" 
                                            value={customerName}
                                            onChange={(e) => setCustomerName(e.target.value)}
                                            placeholder="ระบุชื่อของคุณ"
                                            className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-600 focus:bg-white rounded-2xl p-4 text-sm font-bold transition-all outline-none"
                                        />
                                        <input 
                                            type="tel" 
                                            value={customerPhone}
                                            onChange={(e) => setCustomerPhone(e.target.value)}
                                            placeholder="เบอร์ติดต่อ"
                                            className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-600 focus:bg-white rounded-2xl p-4 text-sm font-bold transition-all outline-none"
                                        />
                                    </div>
                                </div>
                                {orderType === 'dine-in' && (
                                    <div>
                                        <label className="block text-xs font-black text-gray-400 mb-2 uppercase tracking-widest">จำนวนลูกค้า (ท่าน)</label>
                                        <div className="flex items-center gap-4 bg-gray-50 p-2 rounded-2xl">
                                            <button 
                                                onClick={() => !hasSetCustomerCount && setCustomerCount(Math.max(1, customerCount - 1))}
                                                disabled={hasSetCustomerCount}
                                                className={`w-12 h-12 bg-white shadow-sm border border-gray-100 rounded-xl flex items-center justify-center transition-all ${hasSetCustomerCount ? 'cursor-default opacity-50' : 'active:scale-90'}`}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M20 12H4" />
                                                </svg>
                                            </button>
                                            <span className="flex-1 text-center text-lg font-black text-gray-900">{customerCount}</span>
                                            <button 
                                                onClick={() => !hasSetCustomerCount && setCustomerCount(customerCount + 1)}
                                                disabled={hasSetCustomerCount}
                                                className={`w-12 h-12 text-white shadow-lg shadow-blue-100 rounded-xl flex items-center justify-center transition-all ${hasSetCustomerCount ? 'bg-gray-300 cursor-default shadow-none' : 'bg-blue-600 shadow-blue-100 active:scale-95'}`}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                )}
                                <div>
                                    <label className="block text-xs font-black text-gray-400 mb-2 uppercase tracking-widest">หมายเหตุเพิ่มเติม</label>
                                    <textarea 
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        placeholder="เช่น ขอไม่เอาพริก, ขอที่นั่งมุมสงบ"
                                        className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-600 focus:bg-white rounded-2xl p-4 text-sm font-bold transition-all outline-none h-24 resize-none"
                                    ></textarea>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <button 
                                    onClick={() => setIsCheckoutOpen(false)}
                                    className="flex-1 py-5 rounded-3xl font-black text-sm text-gray-400 hover:bg-gray-50 transition-all uppercase tracking-widest border border-gray-100"
                                >
                                    กลับ
                                </button>
                                <button 
                                    onClick={handleSubmitPreOrder}
                                    className={`flex-[2] py-5 rounded-3xl text-white font-black text-sm uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all ${isMonday ? 'bg-gray-300 shadow-none cursor-not-allowed' : 'bg-blue-600 shadow-blue-100'}`}
                                >
                                    {isMonday ? 'ร้านปิดทำการ (ดูเมนูได้อย่างเดียว)' : 'ส่งรายการสั่งซื้อ'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};
