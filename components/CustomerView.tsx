
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { MenuItem, Table, OrderItem, ActiveOrder, StaffCall, CompletedOrder } from '../types';
import { Menu } from './Menu';
import { ItemCustomizationModal } from './ItemCustomizationModal';
import Swal from 'sweetalert2';
import { db } from '../firebaseConfig'; // Import db to enable peeking

declare var html2canvas: any;

// ... (KEEP DICTIONARY CONSTANTS AS IS - NO CHANGE)
// ... existing code ...
const RAW_DICTIONARY: Record<string, string> = {
    // UI Elements
    'เมนูอาหาร 🍽️': 'Menu 🍽️',
    'เมนูอาหาร': 'Menu', 
    'ค้นหาเมนู...': 'Search menu...', // Added for search placeholder
    'โต๊ะ': 'Table',
    'คุณ': 'Guest: ',
    'เรียกพนักงาน': 'Call Staff',
    'เรียก': 'Call',
    'ยอดของฉัน': 'My Total',
    'ดูตะกร้า': 'View Cart',
    'ยังไม่รวมกับยอดบิล': 'Not ordered yet',
    'รายการในตะกร้า (ยังไม่สั่ง)': 'Cart (Not Ordered)',
    'ไม่มีสินค้าในตะกร้า': 'Cart is empty',
    'ยอดในตะกร้า': 'Cart Total',
    'ยืนยันสั่งอาหาร 🚀': 'Confirm Order 🚀',
    'ลบ': 'Remove',
    'บันทึกรายการของฉัน': 'Save My Items',
    'เริ่มรายการใหม่': 'Start New Order',
    'เริ่มรายการใหม่?': 'Start New Order?',
    'รายการอาหารเก่าจะถูกลบออกจากหน้าจอ': 'Old orders will be cleared from screen.',
    'ใช่, เริ่มใหม่': 'Yes, Start New',
    'เริ่มรายการใหม่แล้ว': 'New Order Started',
    'ปิด': 'Close',
    'รายการของฉัน': 'My Orders',
    'ยังไม่มีรายการที่สั่ง': 'No orders yet',
    'รายการของคุณ': 'Your Items',
    'รายการของเพื่อนร่วมโต๊ะ': 'Table Items',
    'ยอดรวมทั้งโต๊ะ': 'Table Total',
    '* ราคานี้เป็นเฉพาะรายการที่คุณสั่ง': '* Price for your items only',
    'ยืนยันการสั่งอาหาร?': 'Confirm Order?',
    'สั่งอาหาร': 'Order',
    'รายการ': 'items',
    'สั่งเลย': 'Order Now',
    'ตรวจสอบก่อน': 'Check First',
    'กำลังส่งรายการ...': 'Sending order...',
    'สั่งอาหารสำเร็จ!': 'Order Success!',
    'รายการอาหารถูกส่งเข้าครัวแล้ว': 'Your order has been sent to the kitchen',
    'เกิดข้อผิดพลาด': 'Error',
    'ไม่สามารถสั่งอาหารได้ กรุณาลองใหม่อีกครั้ง': 'Cannot place order. Please try again.',
    'ส่งสัญญาณเรียกพนักงานแล้ว': 'Staff called',
    'กรุณารอสักครู่...': 'Please wait...',
    'กำลังสร้างรูปภาพ...': 'Generating image...',
    'กรุณารอสักครู่': 'Please wait',
    'ไม่สามารถสร้างรูปภาพได้': 'Cannot generate image',
    'เพิ่มลงตะกร้าแล้ว': 'Added to cart',
    'รอคิว': 'Waiting',
    'กำลังปรุง... 🍳': 'Cooking... 🍳',
    'เสิร์ฟครบแล้ว 😋': 'Served 😋',
    'คิวที่ 1': '1st Queue',
    'อีก': 'More',
    'คิว': 'Queues',
    'บันทึกสำเร็จ!': 'Saved!',
    'ขอบคุณที่ใช้บริการ...': 'Thank you...',
    'ไม่สามารถบันทึกบิลได้': 'Cannot save bill',
    'ไม่ระบุชื่อ': 'Anonymous',
    'ราคาเริ่มต้น': 'Starts at',
    'หมายเหตุ (ถ้ามี):': 'Note (Optional):',
    'รับเครื่องใช้': 'Cutlery',
    'รับช้อนส้อม': 'Spoon & Fork',
    'รับตะเกียบ': 'Chopsticks',
    'อื่นๆ (ระบุ)': 'Other (Specify)',
    'ไม่รับ': 'No Cutlery',
    'สั่งกลับบ้าน': 'Take Away',
    'เบอร์โทรศัพท์ติดต่อ': 'Contact Phone',
    'ระบุตำแหน่ง GPS': 'GPS Location',
    'เช็คตำแหน่งปัจจุบัน': 'Refresh Location',
    'กำลังระบุตำแหน่ง...': 'Locating...',
    'กรุณาใส่เบอร์โทรศัพท์': 'Please enter phone number',
    'เพิ่มOrder': 'Add to Cart',
    'บันทึกการแก้ไข': 'Save Changes',
    'ล้างที่เลือก': 'Clear',
    'จำนวน': 'Qty',
    'ออกจากระบบ': 'Logout',
    'ยืนยันการออกจากระบบ': 'Confirm Logout',
    'คุณต้องการออกจากระบบใช่หรือไม่?': 'Are you sure you want to logout?',
    'ใช่': 'Yes',
    'ยกเลิก': 'Cancel',
    
    // Categories
    'ทั้งหมด': 'All',
    'อาหารจานเดียว': 'A La Carte',
    'อาหารเกาหลี': 'Korean Food',
    'ของทานเล่น': 'Appetizers',
    'เครื่องดื่ม': 'Drinks',
    'เมนู ซุป': 'Soup Menu',
    'เมนู ข้าว': 'Rice Menu',
    'เมนู เส้น': 'Noodle Menu',
    'อาหารจานหลัก': 'Main Course',
    'เมนู ทานเล่น': 'Snacks',
    'เมนู เซต': 'Set Menu',
    // Add specific known variations just in case
    'เมนูข้าว': 'Rice Menu',
    'เมนูซุป': 'Soup Menu',
    'เมนูเส้น': 'Noodle Menu',
    'เมนูเซต': 'Set Menu',
    'เมนูทานเล่น': 'Snacks'
};

const NORMALIZED_DICTIONARY = Object.keys(RAW_DICTIONARY).reduce((acc, key) => {
    // Remove all whitespace from the key
    const normalizedKey = key.replace(/\s+/g, '');
    acc[normalizedKey] = RAW_DICTIONARY[key];
    return acc;
}, {} as Record<string, string>);

interface CustomerViewProps {
    table: Table;
    menuItems: MenuItem[];
    categories: string[];
    activeOrders: ActiveOrder[];
    allBranchOrders: ActiveOrder[]; 
    completedOrders: CompletedOrder[];
    onPlaceOrder: (items: OrderItem[], customerName: string, paymentSlipUrl?: string, customerPhone?: string, latitude?: number, longitude?: number, nearbyLocations?: string) => Promise<number | void | undefined>;
    onStaffCall: (table: Table, customerName: string) => void;
    recommendedMenuItemIds: number[];
    logoUrl: string | null;
    qrCodeUrl: string | null; // NEW: Added qrCodeUrl for payment slip
    restaurantName: string;
    branchName?: string; 
    onLogout?: () => void;
    branchId?: string | null; // NEW: Added branchId to support direct peeking
    lineOaUrl?: string;
    facebookPageUrl?: string;
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
    qrCodeUrl,
    restaurantName,
    branchName,
    onLogout,
    branchId,
    lineOaUrl,
    facebookPageUrl
}) => {
    // ... (Keep existing state hooks)
    const [lang, setLang] = useState<'TH' | 'EN'>('TH');

    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [customerName, setCustomerName] = useState('ลูกค้า'); 
    
    const [isSessionCompleted, setIsSessionCompleted] = useState(() => {
        return sessionStorage.getItem(`customer_completed_${table.id}`) === 'true';
    });

    // --- NEW: Loading Screen State ---
    const [isLoadingScreen, setIsLoadingScreen] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState(0);

    useEffect(() => {
        // No longer using artificial delay for "instant" feel
        setIsLoadingScreen(false);
    }, []);

    // --- NEW: Peeking Logic (แอบมองบิลที่เพิ่งจ่าย) ---
    const [recentTableCompletedOrders, setRecentTableCompletedOrders] = useState<CompletedOrder[]>([]);

    useEffect(() => {
        // "Peek" Logic: Subscribe directly to completed orders ONLY for this table to detect payment
        if (!db || !branchId || !table.id) return;

        // Query: branches/{id}/completedOrders_v2 where tableId == x
        const unsubscribe = db.collection(`branches/${branchId}/completedOrders_v2`)
            .where('tableId', '==', table.id)
            .limit(3) // Check only last 3 orders for this table is enough
            .onSnapshot((snapshot) => {
                // Strict Filter: Must be within last 5 minutes (300,000 ms)
                const fiveMinsAgo = Date.now() - 300000;
                const recent = snapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        ...data,
                        id: parseInt(doc.id) || 0
                    } as CompletedOrder;
                }).filter(o => o.completionTime > fiveMinsAgo);
                
                if (recent.length > 0) {
                    console.log("Peeked new payment!", recent);
                    setRecentTableCompletedOrders(recent);
                }
            }, (err) => {
                console.warn("Peek completed orders failed", err);
            });

        return () => unsubscribe();
    }, [branchId, table.id]);
    // ----------------------------------------------------

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

    const myOrdersKey = `customer_my_orders_${table.id}`;
    const [myOrderNumbers, setMyOrderNumbers] = useState<number[]>(() => {
        const saved = localStorage.getItem(myOrdersKey);
        try {
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });

    const t = useCallback((text: string) => {
        if (lang === 'TH') return text;
        if (!text || typeof text !== 'string') return text;
        if (RAW_DICTIONARY[text]) return RAW_DICTIONARY[text];
        const trimmed = text.trim();
        if (RAW_DICTIONARY[trimmed]) return RAW_DICTIONARY[trimmed];
        const normalized = text.replace(/\s+/g, '');
        return NORMALIZED_DICTIONARY[normalized] || text;
    }, [lang]);

    const localizedCategories = useMemo(() => {
        return categories.map(c => t(c));
    }, [categories, t]);

    const localizedMenuItems = useMemo(() => {
        return menuItems.map(item => ({
            ...item,
            name: lang === 'EN' ? (item.nameEn || item.name) : item.name,
            category: t(item.category),
            optionGroups: item.optionGroups?.map(group => ({
                ...group,
                name: lang === 'EN' ? (group.nameEn || group.name) : group.name,
                options: (group.options || []).map(opt => ({
                    ...opt,
                    name: lang === 'EN' ? (opt.nameEn || opt.name) : opt.name
                }))
            }))
        }));
    }, [menuItems, lang, t]);

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
    
    // NEW: Payment Slip Modal State
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [paymentSlipBase64, setPaymentSlipBase64] = useState<string | null>(null);
    const [customerPhone, setCustomerPhone] = useState('');
    const [nearbyLocations, setNearbyLocations] = useState('');
    const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [isLocating, setIsLocating] = useState(false);
    const slipInputRef = useRef<HTMLInputElement>(null);

    const getCurrentLocation = () => {
        if (!navigator.geolocation) {
            Swal.fire(t('เกิดข้อผิดพลาด'), 'เบราว์เซอร์ของคุณไม่รองรับการระบุตำแหน่ง', 'error');
            return;
        }

        setIsLocating(true);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setLocation({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                });
                setIsLocating(false);
            },
            (error) => {
                console.error("Error getting location:", error);
                setIsLocating(false);
                Swal.fire(t('เกิดข้อผิดพลาด'), 'ไม่สามารถระบุตำแหน่งได้ กรุณาตรวจสอบสิทธิ์การเข้าถึงตำแหน่ง', 'error');
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    const prevMyItemsCountRef = useRef<number>(0);
    const isProcessingPaymentRef = useRef(false);

    // Helper to resize image
    const resizeImage = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target?.result as string;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 800;
                    const MAX_HEIGHT = 800;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.7));
                };
                img.onerror = (e) => reject(e);
            };
            reader.onerror = (e) => reject(e);
        });
    };
    
    useEffect(() => {
        if (isSessionCompleted) return;

        const sessionKey = `customer_session_${table.id}`;
        const savedSession = localStorage.getItem(sessionKey);
        
        if (savedSession) {
            try {
                const { name } = JSON.parse(savedSession);
                // Force re-initialization if the name is the old format (less than 6 digits) or 'ลูกค้า'
                if (!name || name === 'ลูกค้า' || (name.startsWith('Guest-') && name.length < 12)) {
                    initializeSession(sessionKey);
                } else {
                    setCustomerName(name);
                    setIsAuthenticated(true);
                }
            } catch (e) {
                initializeSession(sessionKey);
            }
        } else {
            initializeSession(sessionKey);
        }
    }, [table.id, isSessionCompleted]);

    const initializeSession = (sessionKey: string) => {
        // Generate a 6-digit random number to ensure uniqueness across different devices
        const randomSuffix = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
        const name = `Guest-${randomSuffix}`;
        localStorage.setItem(sessionKey, JSON.stringify({ name }));
        setCustomerName(name);
        setIsAuthenticated(true);
    };

    const handlePaymentCompleteLock = () => {
        localStorage.removeItem(cartKey);
        localStorage.removeItem(myOrdersKey);
        sessionStorage.setItem(`customer_completed_${table.id}`, 'true');
        setIsSessionCompleted(true);
    };

    useEffect(() => {
        if (myOrderNumbers.length === 0 || isSessionCompleted) return;

        // Find all active orders for this user
        const myActiveOrders = allBranchOrders.filter(o => 
            (myOrderNumbers.includes(o.orderNumber) || (o.mergedOrderNumbers && o.mergedOrderNumbers.some(n => myOrderNumbers.includes(n)))) &&
            o.status !== 'completed' &&
            o.status !== 'cancelled'
        );

        if (myActiveOrders.length === 0) return;

        // Get all unique table IDs where the user has active orders
        const activeTableIds = new Set(myActiveOrders.map(o => String(o.tableId)));
        
        // Check if the current table is one of the active tables
        const isCurrentTableActive = activeTableIds.has(String(table.id));

        // Only redirect if:
        // 1. The current table is NOT in the list of active tables (meaning we are at the wrong table)
        // 2. We have a target table to go to (pick the first one found)
        // 3. The target table is a valid physical table (> 0) - we don't auto-redirect to Takeaway/Online
        if (!isCurrentTableActive) {
            const targetOrder = myActiveOrders.find(o => o.tableId > 0);
            
            if (targetOrder) {
                const newTableId = targetOrder.tableId;
                
                // Double check to prevent loop (should be covered by isCurrentTableActive, but safety first)
                if (String(newTableId) === String(table.id)) return;

                const currentUrl = new URL(window.location.href);
                
                // FIX: Remove conflicting parameters that force 'Takeaway/Online' mode
                // This ensures App.tsx respects the new 'tableId' parameter
                currentUrl.searchParams.delete('orderType'); 
                currentUrl.searchParams.set('mode', 'customer'); // Ensure we stay in customer mode
                currentUrl.searchParams.set('tableId', String(newTableId));

                const oldSessionKey = `customer_session_${table.id}`;
                const newSessionKey = `customer_session_${newTableId}`;
                const sessionData = localStorage.getItem(oldSessionKey);
                if (sessionData && !localStorage.getItem(newSessionKey)) {
                    localStorage.setItem(newSessionKey, sessionData);
                }

                const oldOrdersKey = `customer_my_orders_${table.id}`;
                const newOrdersKey = `customer_my_orders_${newTableId}`;
                const ordersData = localStorage.getItem(oldOrdersKey);
                if (ordersData) {
                    const existing = JSON.parse(localStorage.getItem(newOrdersKey) || '[]');
                    const old = JSON.parse(ordersData);
                    const combined = [...new Set([...existing, ...old])];
                    localStorage.setItem(newOrdersKey, JSON.stringify(combined));
                }

                const oldCartKey = `customer_cart_${table.id}`;
                const newCartKey = `customer_cart_${newTableId}`;
                const cartData = localStorage.getItem(oldCartKey);
                if (cartData && !localStorage.getItem(newCartKey)) {
                    localStorage.setItem(newCartKey, cartData);
                }

                window.location.replace(currentUrl.toString());
            }
        }
    }, [allBranchOrders, myOrderNumbers, table.id, isSessionCompleted]);

    // --- CLEANUP STALE ORDERS ---
    useEffect(() => {
        if (myOrderNumbers.length === 0) return;

        const now = Date.now();
        const ONE_DAY = 24 * 60 * 60 * 1000;
        
        // Find orders that are either:
        // 1. Not in allBranchOrders (deleted from DB)
        // 2. Older than 24 hours
        // 3. (Optional) "Served" and older than 4 hours for Online tables? -> Let's stick to 24h for safety
        
        const validOrderNumbers = myOrderNumbers.filter(id => {
            const order = allBranchOrders.find(o => o.orderNumber === id);
            if (!order) return false; // Order deleted from DB
            if (now - order.orderTime > ONE_DAY) return false; // Too old
            return true;
        });

        if (validOrderNumbers.length !== myOrderNumbers.length) {
            setMyOrderNumbers(validOrderNumbers);
            localStorage.setItem(myOrdersKey, JSON.stringify(validOrderNumbers));
        }
    }, [allBranchOrders, myOrderNumbers, myOrdersKey]);

    const handleStartNewOrder = () => {
        const sessionKey = `customer_session_${table.id}`;
        Swal.fire({
            title: t('เริ่มรายการใหม่?'),
            text: t('รายการอาหารเก่าจะถูกลบออกจากหน้าจอ'),
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: t('ใช่, เริ่มใหม่'),
            cancelButtonText: t('ยกเลิก')
        }).then((result) => {
            if (result.isConfirmed) {
                // Clear local storage for this table
                localStorage.removeItem(myOrdersKey);
                localStorage.removeItem(cartKey);
                localStorage.removeItem(sessionKey);
                
                // Reset state
                setMyOrderNumbers([]);
                setCartItems([]);
                
                // Generate new session
                initializeSession(sessionKey);
                
                Swal.fire(t('เริ่มรายการใหม่แล้ว'), '', 'success');
            }
        });
    };

    const { myItems, otherItems } = useMemo(() => {
        const mine: any[] = [];
        const others: { item: any, owner: string }[] = [];
        const myOrderSet = new Set(myOrderNumbers);
        const currentNormName = customerName?.trim().toLowerCase();
        const isOnlineTable = table.floor === 'Online' || table.id < 0;

        const tableOrders = Array.isArray(allBranchOrders) 
            ? allBranchOrders.filter(o => String(o.tableId) === String(table.id) && o.status !== 'cancelled' && o.status !== 'completed')
            : [];

        tableOrders.forEach(order => {
            const orderName = order.customerName || t('ไม่ระบุชื่อ');
            const orderNormName = order.customerName?.trim().toLowerCase();
            const isMyOrderByName = isAuthenticated && currentNormName && orderNormName === currentNormName;

            order.items.forEach(item => {
                const originId = item.originalOrderNumber ?? order.orderNumber;
                const isMyItemById = myOrderSet.has(originId);

                const originalItem = menuItems.find(m => m.id === item.id);
                
                const displayItem = {
                    ...item,
                    name: lang === 'EN' ? (originalItem?.nameEn || item.name) : item.name,
                    selectedOptions: item.selectedOptions.map(opt => ({
                        ...opt,
                        name: lang === 'EN' ? (opt.nameEn || opt.name) : opt.name
                    }))
                };

                if (isMyItemById || isMyOrderByName) {
                    mine.push(displayItem);
                } else if (!isOnlineTable) {
                    // Only show "Friends' items" if it's a real physical table.
                    // For Online/Takeaway, we must isolate each customer.
                    others.push({ item: displayItem, owner: orderName });
                }
            });
        });

        return { myItems: mine, otherItems: others };
    }, [allBranchOrders, myOrderNumbers, isAuthenticated, customerName, table.id, table.floor, lang, menuItems, t]);

    const myTotal = useMemo(() => {
        return myItems.reduce((sum, item) => sum + (item.finalPrice * item.quantity), 0);
    }, [myItems]);

    const grandTotal = myTotal + otherItems.reduce((sum, { item }) => sum + (item.finalPrice * item.quantity), 0);

    useEffect(() => {
        if (!isAuthenticated || !customerName) return;
        try {
            const currentNormName = customerName.trim().toLowerCase();
            const newMyOrderIds: number[] = [];
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

    useEffect(() => {
        if (!isAuthenticated || isSessionCompleted) return;
    
        const currentCount = myItems.length;
        const prevCount = prevMyItemsCountRef.current;
        const isTransitioning = prevCount > 0 && currentCount === 0;
        
        if (isTransitioning || (isProcessingPaymentRef.current && currentCount === 0)) {
            isProcessingPaymentRef.current = true;
    
            // Combine normal props with our peeking state
            const allCompletedSources = [...completedOrders, ...recentTableCompletedOrders];
            
            const myJustCompletedOrders = allCompletedSources.filter(o =>
                myOrderNumbers.some(myNum =>
                    o.orderNumber === myNum || (o.mergedOrderNumbers && o.mergedOrderNumbers.includes(myNum))
                )
            );
    
            if (myJustCompletedOrders.length === 0) return; 

            const latestCompletedOrder = myJustCompletedOrders.sort((a, b) => b.completionTime - a.completionTime)[0];
            const processedKey = `processed_complete_${latestCompletedOrder.id}`;
            if (sessionStorage.getItem(processedKey)) return;
            sessionStorage.setItem(processedKey, 'true');
    
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
                timer: 15000, 
                timerProgressBar: true,
                preConfirm: async () => {
                    const billElement = document.getElementById('customer-final-bill');
                    if (billElement) {
                        try {
                            const canvas = await html2canvas(billElement, { scale: 2, useCORS: true });
                            return canvas.toDataURL('image/png');
                        } catch (err) {
                            return null;
                        }
                    }
                    return null;
                }
            }).then((result) => {
                if (result.isConfirmed && result.value) {
                    const link = document.createElement('a');
                    link.href = result.value;
                    link.download = `bill-${latestCompletedOrder.tableName}-${customerName}.png`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }
                handlePaymentCompleteLock();
                // Reset state inside the .then block to avoid race conditions
                isProcessingPaymentRef.current = false;
                prevMyItemsCountRef.current = 0;
            });
            
            return;
        }
    
        isProcessingPaymentRef.current = false;
        prevMyItemsCountRef.current = currentCount;

    }, [myItems.length, isAuthenticated, completedOrders, recentTableCompletedOrders, myOrderNumbers, logoUrl, restaurantName, customerName, isSessionCompleted, t]);
    
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
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: t('เพิ่มลงตะกร้าแล้ว'), showConfirmButton: false, timer: 1500 });
    };

    const handleRemoveItem = (cartItemId: string) => {
        setCartItems(prev => prev.filter(i => i.cartItemId !== cartItemId));
    };

    const handleSubmitOrder = async () => {
        if (cartItems.length === 0) return;

        // Require payment slip ONLY for Online/Link system (Takeaway/Delivery)
        // For Dine-in (Scan at table), place order directly without slip
        if (table.floor === 'Online' || table.id < 0) {
            setIsPaymentModalOpen(true);
            // Auto-locate when opening payment modal
            if (!location) {
                getCurrentLocation();
            }
        } else {
            executePlaceOrder();
        }
    };

    const executePlaceOrder = async (slipBase64?: string) => {
        if ((table.floor === 'Online' || table.id < 0) && !customerPhone) {
            Swal.fire(t('เกิดข้อผิดพลาด'), t('กรุณาใส่เบอร์โทรศัพท์'), 'error');
            return;
        }
        
        Swal.fire({ title: t('กำลังส่งรายการ...'), allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

        try {
            // ... (rest of the logic)
            const itemsToSend = cartItems.map(cartItem => {
                const originalItem = menuItems.find(m => m.id === cartItem.id);
                return {
                    ...cartItem,
                    name: originalItem ? originalItem.name : cartItem.name,
                    nameEn: originalItem?.nameEn || null,
                    selectedOptions: (cartItem.selectedOptions || []).map(opt => {
                        const originalGroup = originalItem?.optionGroups?.find(g => g.options.some(o => o.id === opt.id));
                        const originalOpt = originalGroup?.options.find(o => o.id === opt.id);
                        return {
                            ...opt,
                            name: originalOpt ? originalOpt.name : opt.name,
                            nameEn: originalOpt?.nameEn || null
                        };
                    })
                };
            });

            const newOrderNumber = await onPlaceOrder(
                itemsToSend, 
                customerName, 
                slipBase64, 
                customerPhone, 
                location?.lat, 
                location?.lng,
                nearbyLocations
            );
            
            // Only show success and update state if an order number was successfully returned.
            if (newOrderNumber) {
                setMyOrderNumbers(prev => [...prev, newOrderNumber]);
                setCartItems([]);
                setIsCartOpen(false);
                setIsPaymentModalOpen(false);
                setPaymentSlipBase64(null);

                const successTitle = t('สั่งอาหารสำเร็จ!');
                const successText = slipBase64 
                    ? `ออเดอร์ของคุณคือ #${String(newOrderNumber).padStart(3, '0')}<br/>กรุณารอพนักงานตรวจสอบยอดเงินสักครู่`
                    : `ออเดอร์ของคุณคือ #${String(newOrderNumber).padStart(3, '0')}<br/>รายการอาหารถูกส่งเข้าครัวแล้ว`;

                await Swal.fire({ 
                    icon: 'success', 
                    title: successTitle, 
                    html: successText,
                    timer: 3500,
                    showConfirmButton: false 
                });
            } else {
                // If undefined returned but no error thrown (rare), close loading
                Swal.close();
            }
        } catch (error) {
            console.error("Order placement failed:", error);
            // Ensure Swal is updated to show error instead of stuck loading
            Swal.fire({
                icon: 'error',
                title: t('เกิดข้อผิดพลาด'),
                text: t('ไม่สามารถส่งรายการอาหารได้ กรุณาลองใหม่อีกครั้ง'),
                confirmButtonText: t('ตกลง')
            });
        }
    };

    const handleCallStaffClick = () => {
        onStaffCall(table, customerName);
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: t('ส่งสัญญาณเรียกพนักงานแล้ว'), text: t('กรุณารอสักครู่...'), showConfirmButton: false, timer: 3000 });
    };

    const handleSaveBillAsImage = async () => {
        if (!billContentRef.current) return;
        Swal.fire({ title: t('กำลังสร้างรูปภาพ...'), text: t('กรุณารอสักครู่'), allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
        try {
            const canvas = await html2canvas(billContentRef.current, { scale: 2, useCORS: true });
            const image = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.href = image;
            link.download = `bill-table-${table.name}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            Swal.close();
        } catch (error) {
            Swal.fire({ icon: 'error', title: t('เกิดข้อผิดพลาด'), text: t('ไม่สามารถสร้างรูปภาพได้') });
        }
    };

    const handleLogoutClick = () => {
        if (onLogout) {
            Swal.fire({
                title: t('ยืนยันการออกจากระบบ'),
                text: t('คุณต้องการออกจากระบบใช่หรือไม่?'),
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                confirmButtonText: t('ใช่'),
                cancelButtonText: t('ยกเลิก')
            }).then((result) => {
                if (result.isConfirmed) {
                    onLogout();
                }
            });
        }
    };

    const cartTotalAmount = useMemo(() => cartItems.reduce((sum, i) => sum + (i.finalPrice * i.quantity), 0), [cartItems]);
    const totalCartItemsCount = useMemo(() => cartItems.reduce((sum, i) => sum + i.quantity, 0), [cartItems]);

    const orderStatus = useMemo(() => {
        try {
            if (myItems.length === 0) return null;
            if (!Array.isArray(allBranchOrders)) return null;

            const myTableOrders = allBranchOrders.filter(o => String(o.tableId) === String(table.id));
            if (myTableOrders.length === 0) return { text: t('รอคิว'), color: 'bg-blue-600 text-white border-blue-700' };

            if (myTableOrders.some(o => o.status === 'cooking')) return { text: t('กำลังปรุง... 🍳'), color: 'bg-orange-500 text-white border-orange-600' };

            const waitingOrders = myTableOrders.filter(o => o.status === 'waiting');
            if (waitingOrders.length > 0) {
                const myEarliestOrderTime = Math.min(...waitingOrders.map(o => o.orderTime));
                const queueCount = allBranchOrders.filter(o => (o.status === 'waiting' || o.status === 'cooking') && o.orderTime < myEarliestOrderTime).length;
                if (queueCount === 0) return { text: `${t('รอคิว')} (${t('คิวที่ 1')} ☝️)`, color: 'bg-blue-600 text-white border-blue-700' };
                return { text: `${t('รอคิว...')} (${t('อีก')} ${queueCount} ${t('คิว')}) ⏳`, color: 'bg-blue-600 text-white border-blue-700' };
            }

            if (myTableOrders.every(o => o.status === 'served')) return { text: t('เสิร์ฟครบแล้ว 😋'), color: 'bg-green-500 text-white border-green-600' };

            return { text: t('รอคิว'), color: 'bg-blue-600 text-white border-blue-700' };
        } catch (e) {
            return myItems.length > 0 ? { text: t('รอคิว'), color: 'bg-blue-600 text-white border-blue-700' } : null;
        }
    }, [allBranchOrders, isAuthenticated, table.id, myItems.length, t]);

    if (isSessionCompleted) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center animate-fade-in">
                 <div className="bg-white p-10 rounded-2xl shadow-xl w-full max-w-sm border-t-8 border-green-500">
                    <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">{restaurantName}</h2>
                    <h3 className="text-xl font-semibold text-gray-700 mb-4">{t('ขอบคุณที่ใช้บริการ')}</h3>
                    <div className="space-y-2 text-gray-500 text-sm mb-8">
                        <p>การชำระเงินของคุณเสร็จสมบูรณ์แล้ว</p>
                        <p>หวังว่าคุณจะมีความสุขกับมื้ออาหาร</p>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-blue-800 text-sm">
                        <p className="font-semibold mb-1">ต้องการสั่งอาหารเพิ่ม?</p>
                        <p className="opacity-80">กรุณาสแกน QR Code ที่โต๊ะใหม่อีกครั้ง</p>
                    </div>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                <p className="mt-4 text-gray-600">กำลังเข้าสู่ระบบ...</p>
            </div>
        );
    }

    return (
        <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
            <header className="bg-white shadow-md z-30 relative">
                <div className="flex justify-between items-center px-4 py-2 border-b border-gray-100 bg-gray-50/50">
                    <h1 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                        {t('เมนูอาหาร 🍽️')}
                    </h1>
                    <div className="flex items-center gap-3">
                         {/* NEW: Start New Order Button for Online/Takeaway in Header */}
                         {(table.floor === 'Online' || table.id < 0) && (
                            <button 
                                onClick={handleStartNewOrder}
                                className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-200"
                                title={t('เริ่มรายการใหม่')}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                            </button>
                        )}
                        
                         <div className="flex bg-gray-200 rounded-lg p-1">
                            <button onClick={() => setLang('TH')} className={`px-3 py-1 rounded-md text-sm font-bold transition-all ${lang === 'TH' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>🇹🇭 TH</button>
                            <button onClick={() => setLang('EN')} className={`px-3 py-1 rounded-md text-sm font-bold transition-all ${lang === 'EN' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>🇬🇧 EN</button>
                        </div>
                    </div>
                </div>

                <div className="px-4 py-3 flex justify-between items-start">
                    <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-gray-600 bg-gray-100 px-3 py-1 rounded-full border border-gray-200 whitespace-nowrap">
                                {t('โต๊ะ')} <span className="text-gray-900 font-bold">{table.name} ({table.floor})</span>
                            </span>
                            {/* Branch Name Display */}
                            {branchName && (
                                <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md border border-blue-200">
                                    {branchName}
                                </span>
                            )}
                            {orderStatus && (
                                <span className={`text-xs font-bold px-3 py-1 rounded-full border shadow-sm ${orderStatus.color} whitespace-nowrap flex items-center gap-1 z-10`}>
                                    {orderStatus.text}
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-gray-400 pl-1">{t('คุณ')}{customerName}</p>
                    </div>

                    <div className="flex items-start gap-2 flex-shrink-0">
                        <button onClick={handleCallStaffClick} className="flex flex-col items-center justify-center p-2 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-lg shadow-sm hover:bg-yellow-100 transition-colors" title={t('เรียกพนักงาน')}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" /></svg>
                            <span className="text-[10px] font-bold mt-0.5">{t('เรียก')}</span>
                        </button>
                        <div className="flex flex-col items-end gap-1 cursor-pointer hover:opacity-80 transition-opacity group bg-white p-1 rounded" onClick={() => setIsActiveOrderListOpen(true)}>
                            <div className="text-right">
                                <div className="flex items-center justify-end gap-1 text-gray-400 text-[10px]">
                                    <span>{t('ยอดของฉัน')}</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                </div>
                                <div className="flex items-center gap-1 justify-end">
                                    <span className="text-base font-bold text-blue-600 leading-none border-b border-dashed border-blue-300 group-hover:text-blue-700 transition-colors">{myTotal.toLocaleString()} ฿</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </header>
            
            <div className="flex-1 overflow-hidden relative">
                <Menu 
                    menuItems={localizedMenuItems}
                    setMenuItems={() => {}}
                    categories={localizedCategories}
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
                    hideCategories={true}
                    title={t('เมนูอาหาร')} 
                    searchPlaceholder={t('ค้นหาเมนู...')}
                />
            </div>

            {totalCartItemsCount > 0 && (
                <div className="absolute bottom-6 left-4 right-4 z-20">
                    <button onClick={() => setIsCartOpen(true)} className="w-full bg-blue-600 text-white shadow-xl rounded-xl p-4 flex justify-between items-center animate-bounce-in">
                        <div className="flex items-center gap-3">
                            <span className="bg-white text-blue-600 font-bold w-8 h-8 rounded-full flex items-center justify-center">{totalCartItemsCount}</span>
                            <div className="text-left leading-tight">
                                <span className="font-bold text-lg block">{t('ดูตะกร้า')}</span>
                                <span className="text-xs font-light text-blue-100">{t('ยังไม่รวมกับยอดบิล')}</span>
                            </div>
                        </div>
                        <span className="font-bold text-lg">{cartTotalAmount.toLocaleString()} ฿</span>
                    </button>
                </div>
            )}

            {isActiveOrderListOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-end sm:items-center" onClick={() => setIsActiveOrderListOpen(false)}>
                    <div className="bg-white w-full sm:max-w-md h-[80vh] sm:h-auto sm:max-h-[90vh] rounded-t-2xl sm:rounded-xl shadow-2xl flex flex-col overflow-hidden animate-slide-up" onClick={e => e.stopPropagation()}>
                        <div ref={billContentRef} className="flex-grow overflow-y-auto">
                            <div className="p-4 border-b bg-gray-50 flex flex-col items-center sticky top-0 z-10">
                                {logoUrl && <img src={logoUrl} alt="Logo" className="h-16 w-auto object-contain mb-2" crossOrigin="anonymous" />}
                                <h3 className="font-bold text-gray-800 text-lg">{t('รายการของฉัน')} ({t('คุณ')}{customerName}) 🧾</h3>
                                <p className="text-sm text-gray-600">{t('โต๊ะ')} {table.name} ({table.floor})</p>
                                
                                {/* NEW: Start New Order Button for Online/Takeaway */}
                                {(table.floor === 'Online' || table.id < 0) && (
                                    <button 
                                        onClick={handleStartNewOrder}
                                        className="mt-2 text-xs bg-red-100 text-red-600 px-3 py-1 rounded-full hover:bg-red-200 transition-colors"
                                    >
                                        {t('เริ่มรายการใหม่')} 🔄
                                    </button>
                                )}
                            </div>
                            <div className="p-4 space-y-4">
                                {myItems.length === 0 && otherItems.length === 0 ? (
                                    <div className="text-center text-gray-400 py-10">{t('ยังไม่มีรายการที่สั่ง')}</div>
                                ) : (
                                    <>
                                        {myItems.length > 0 && (
                                            <div className="bg-blue-50/50 p-2 rounded-lg border border-blue-100">
                                                <h4 className="font-bold text-blue-800 text-sm mb-2 flex items-center gap-1">{t('รายการของคุณ')} <span className="text-xs font-normal text-blue-600">({customerName})</span> 👤</h4>
                                                <ul className="space-y-3">
                                                    {myItems.map((item, idx) => (
                                                        <li key={`mine-${idx}`} className="flex justify-between text-sm text-gray-700 border-b border-blue-100 pb-2 last:border-0">
                                                            <div>
                                                                <span className="font-medium">{item.quantity}x {item.name}</span>
                                                                {item.isTakeaway && <span className="text-purple-600 text-xs ml-1">({t('สั่งกลับบ้าน')})</span>}
                                                                {item.selectedOptions.length > 0 && <div className="text-xs text-gray-500 ml-1">{item.selectedOptions.map(o => o.name).join(', ')}</div>}
                                                            </div>
                                                            <span className="font-mono text-gray-600 font-bold">{(item.finalPrice * item.quantity).toLocaleString()}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        {otherItems.length > 0 && (
                                            <div className="bg-gray-50 p-2 rounded-lg border border-gray-200 mt-2">
                                                <h4 className="font-bold text-gray-600 text-sm mb-2">{t('รายการของเพื่อนร่วมโต๊ะ')} 👥</h4>
                                                <ul className="space-y-3">
                                                    {otherItems.map(({ item, owner }, idx) => (
                                                        <li key={`other-${idx}`} className="flex justify-between text-sm text-gray-700 border-b border-gray-200 pb-2 last:border-0">
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-medium">{item.quantity}x {item.name}</span>
                                                                    <span className="text-[10px] bg-gray-200 px-1.5 rounded text-gray-600">{owner}</span>
                                                                </div>
                                                                {item.isTakeaway && <span className="text-purple-600 text-xs ml-1">({t('สั่งกลับบ้าน')})</span>}
                                                                {item.selectedOptions.length > 0 && <div className="text-xs text-gray-500 ml-1">{item.selectedOptions.map(o => o.name).join(', ')}</div>}
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
                                <p className="text-xs text-gray-500 text-center mt-2">{t('* ราคานี้เป็นเฉพาะรายการที่คุณสั่ง')}</p>
                            </div>
                        </div>
                        <div className="p-3 bg-white border-t flex flex-col gap-2">
                            <button onClick={handleSaveBillAsImage} disabled={myItems.length === 0} className="w-full bg-green-600 text-white font-bold py-3 rounded-xl shadow-lg hover:bg-green-700 transition-colors text-base flex items-center justify-center gap-2 disabled:bg-gray-400">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 9.293a1 1 0 011.414 0L10 11.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 011.414-1.414L9 9.586V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                                {t('บันทึกรายการของฉัน')}
                            </button>
                            <button onClick={() => setIsActiveOrderListOpen(false)} className="w-full py-2 text-gray-700 font-semibold rounded-lg hover:bg-gray-100">{t('ปิด')}</button>
                        </div>
                    </div>
                </div>
            )}

            {isCartOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-end sm:justify-center items-end sm:items-center">
                    <div className="bg-white w-full sm:max-w-md h-[90vh] sm:h-[80vh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col animate-slide-up">
                        <div className="p-4 border-b flex justify-between items-center">
                            <h2 className="text-xl font-bold text-gray-800">{t('รายการในตะกร้า (ยังไม่สั่ง)')}</h2>
                            <button onClick={() => setIsCartOpen(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {cartItems.map(item => (
                                <div key={item.cartItemId} className="flex justify-between items-start border-b pb-4">
                                    <div className="flex-1">
                                        <p className="font-bold text-gray-800">{item.name}</p>
                                        <p className="text-sm text-gray-500">{(item.selectedOptions || []).map(o => o.name).join(', ')}</p>
                                        {item.notes && <p className="text-sm text-yellow-600">** {item.notes}</p>}
                                        <p className="text-blue-600 font-semibold mt-1">{item.finalPrice.toLocaleString()} ฿ x {item.quantity}</p>
                                    </div>
                                    <button onClick={() => handleRemoveItem(item.cartItemId)} className="text-red-500 p-2">{t('ลบ')}</button>
                                </div>
                            ))}
                            {cartItems.length === 0 && <div className="text-center text-gray-400 py-10">{t('ไม่มีสินค้าในตะกร้า')}</div>}
                        </div>
                        <div className="p-4 border-t bg-gray-50">
                            <div className="flex justify-between mb-4 text-lg font-bold">
                                <span>{t('ยอดในตะกร้า')}</span>
                                <span>{cartTotalAmount.toLocaleString()} ฿</span>
                            </div>
                            <button onClick={handleSubmitOrder} className="w-full bg-green-600 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-green-700 transition-colors text-lg">{t('ยืนยันสั่งอาหาร 🚀')}</button>
                        </div>
                    </div>
                </div>
            )}

            {isPaymentModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex justify-center items-center p-4">
                    <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col animate-slide-up overflow-hidden max-h-[90vh]">
                        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                            <h2 className="text-xl font-bold text-gray-800">{t('ชำระเงิน')}</h2>
                            <button onClick={() => { setIsPaymentModalOpen(false); setPaymentSlipBase64(null); }} className="p-2 bg-gray-200 rounded-full hover:bg-gray-300">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1 flex flex-col items-center space-y-6">
                            <p className="text-gray-600 text-center">{t('กรุณาสแกน QR Code เพื่อชำระเงินและแนบสลิป')}</p>
                            
                            <div className="bg-blue-50 text-blue-800 font-bold text-2xl py-3 px-6 rounded-lg shadow-sm border border-blue-100 w-full text-center">
                                {t('ยอดรวม')}: {cartItems.reduce((sum, item) => sum + (item.finalPrice * item.quantity), 0)} {t('฿')}
                            </div>

                            {/* NEW: Phone Number Input */}
                            <div className="w-full">
                                <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                    </svg>
                                    {t('เบอร์โทรศัพท์ติดต่อ')}
                                </label>
                                <input 
                                    type="tel" 
                                    value={customerPhone}
                                    onChange={(e) => setCustomerPhone(e.target.value)}
                                    placeholder="08x-xxx-xxxx"
                                    className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono text-lg"
                                />
                            </div>

                            {/* NEW: GPS Location Section */}
                            <div className="w-full bg-gray-50 p-4 rounded-xl border border-gray-200">
                                <div className="flex justify-between items-center mb-3">
                                    <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                        {t('ระบุตำแหน่ง GPS')}
                                    </label>
                                    <button 
                                        onClick={getCurrentLocation}
                                        disabled={isLocating}
                                        className="text-xs bg-white border border-gray-300 px-3 py-1.5 rounded-lg text-blue-600 font-bold hover:bg-blue-50 transition-colors flex items-center gap-1 shadow-sm"
                                    >
                                        {isLocating ? (
                                            <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                        ) : (
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                            </svg>
                                        )}
                                        {isLocating ? t('กำลังระบุตำแหน่ง...') : t('เช็คตำแหน่งปัจจุบัน')}
                                    </button>
                                </div>
                                {location ? (
                                    <div className="space-y-3">
                                        <div className="bg-green-50 border border-green-200 p-3 rounded-lg flex items-center gap-3">
                                            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-green-800">ระบุตำแหน่งสำเร็จ</p>
                                                <p className="text-[10px] text-green-600 font-mono">{location.lat.toFixed(6)}, {location.lng.toFixed(6)}</p>
                                            </div>
                                        </div>
                                        {/* NEW: Mini Map Display */}
                                        <div className="w-full h-48 rounded-xl overflow-hidden border border-gray-300 shadow-inner bg-gray-200">
                                            <iframe 
                                                width="100%" 
                                                height="100%" 
                                                style={{ border: 0 }}
                                                loading="lazy"
                                                allowFullScreen
                                                referrerPolicy="no-referrer-when-downgrade"
                                                src={`https://maps.google.com/maps?q=${location.lat},${location.lng}&z=16&output=embed`}
                                            ></iframe>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-orange-50 border border-orange-200 p-3 rounded-lg flex items-center gap-3">
                                        <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                            </svg>
                                        </div>
                                        <p className="text-xs text-orange-800 font-medium">ยังไม่ได้ระบุตำแหน่ง กรุณากดปุ่มเช็คตำแหน่ง</p>
                                    </div>
                                )}

                                {/* NEW: Nearby Locations Scrollable Section */}
                                <div className="mt-4">
                                    <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                        </svg>
                                        {t('ระบุตำแหน่งพื้นที่ใกล้เคียง')} (Nearby Locations)
                                    </label>
                                    <textarea 
                                        value={nearbyLocations}
                                        onChange={(e) => setNearbyLocations(e.target.value)}
                                        placeholder={t('เช่น ใกล้เซเว่น, ตรงข้ามธนาคาร, บ้านสีเขียว...')}
                                        className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm min-h-[80px] max-h-[150px] overflow-y-auto"
                                    />
                                </div>
                            </div>

                            {qrCodeUrl ? (
                                <img src={qrCodeUrl} alt="QR Code" className="w-48 h-48 object-contain border rounded-lg p-2 bg-white shadow-sm" />
                            ) : (
                                <div className="w-48 h-48 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 text-sm text-center p-4">
                                    {t('ร้านยังไม่ได้ตั้งค่า QR Code')}
                                </div>
                            )}

                            <div className="w-full">
                                <label className="block text-sm font-bold text-gray-700 mb-2">{t('แนบสลิปโอนเงิน')}</label>
                                <input 
                                    type="file" 
                                    accept="image/*" 
                                    ref={slipInputRef}
                                    className="hidden"
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            try {
                                                Swal.fire({ title: 'กำลังประมวลผลรูปภาพ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                                                const resizedBase64 = await resizeImage(file);
                                                setPaymentSlipBase64(resizedBase64);
                                                Swal.close();
                                            } catch (error) {
                                                console.error("Image resize failed:", error);
                                                Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถอ่านไฟล์รูปภาพได้', 'error');
                                            }
                                        }
                                    }}
                                />
                                {paymentSlipBase64 ? (
                                    <div className="relative w-full h-48 border rounded-lg overflow-hidden bg-gray-50">
                                        <img src={paymentSlipBase64} alt="Slip Preview" className="w-full h-full object-contain" />
                                        <button 
                                            onClick={() => setPaymentSlipBase64(null)}
                                            className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-md"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                ) : (
                                    <button 
                                        onClick={() => slipInputRef.current?.click()}
                                        className="w-full py-4 border-2 border-dashed border-blue-300 rounded-lg text-blue-600 font-medium hover:bg-blue-50 transition-colors flex flex-col items-center gap-2"
                                    >
                                        <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                                        {t('กดเพื่อเลือกรูปสลิป')}
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="p-4 border-t bg-gray-50">
                            <button 
                                onClick={() => executePlaceOrder(paymentSlipBase64!)}
                                disabled={!paymentSlipBase64}
                                className={`w-full py-3 rounded-xl font-bold text-lg shadow-md transition-all ${paymentSlipBase64 ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
                            >
                                {t('ยืนยันการสั่งอาหาร')} 🚀
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

            {/* Floating Contact Buttons */}
            {(lineOaUrl || facebookPageUrl) && (
                <div className="fixed bottom-32 right-4 flex flex-col gap-3 z-40 animate-fade-in">
                    {lineOaUrl && (
                        <a 
                            href={lineOaUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="w-12 h-12 bg-[#00b900] rounded-full flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-transform border-2 border-white"
                            title="Line OA"
                        >
                            <img src="https://upload.wikimedia.org/wikipedia/commons/4/41/LINE_logo.svg" alt="Line" className="w-7 h-7" />
                        </a>
                    )}
                    {facebookPageUrl && (
                        <a 
                            href={facebookPageUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="w-12 h-12 bg-[#1877f2] rounded-full flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-transform border-2 border-white"
                            title="Facebook Page"
                        >
                            <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                            </svg>
                        </a>
                    )}
                </div>
            )}
        </div>
    );
};
