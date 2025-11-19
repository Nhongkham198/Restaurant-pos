
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';

import { 
    DEFAULT_BRANCHES, 
    DEFAULT_CATEGORIES, 
    DEFAULT_MENU_ITEMS, 
    DEFAULT_TABLES, 
    DEFAULT_USERS, 
    DEFAULT_STOCK_CATEGORIES, 
    DEFAULT_STOCK_UNITS, 
    DEFAULT_STOCK_ITEMS
} from './constants';
import type { 
    MenuItem, 
    OrderItem, 
    Table, 
    ActiveOrder, 
    User, 
    CompletedOrder, 
    CancelledOrder,
    PrinterConfig,
    Branch,
    StockItem,
    View,
    NavItem,
    PrintHistoryEntry,
    TakeawayCutleryOption
} from './types';
import { useFirestoreSync } from './hooks/useFirestoreSync';
import { functionsService } from './services/firebaseFunctionsService';
import { printerService } from './services/printerService';
import { isFirebaseConfigured } from './firebaseConfig';

import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Menu } from './components/Menu';
import { KitchenView } from './components/KitchenView';
import { TableLayout } from './components/TableLayout';
import { Dashboard } from './components/Dashboard';
import { SalesHistory } from './components/SalesHistory';
import { StockManagement } from './components/StockManagement';
import AdminSidebar from './components/AdminSidebar';
import { BottomNavBar } from './components/BottomNavBar';

import { LoginScreen } from './components/LoginScreen';
import { BranchSelectionScreen } from './components/BranchSelectionScreen';
import { LoginModal } from './components/LoginModal';
import { MenuItemModal } from './components/MenuItemModal';
import { OrderSuccessModal } from './components/OrderSuccessModal';
import { OrderTimeoutModal } from './components/OrderTimeoutModal';
import { SplitBillModal } from './components/SplitBillModal';
import { SplitCompletedBillModal } from './components/SplitCompletedBillModal';
import { TableBillModal } from './components/TableBillModal';
import { PaymentModal } from './components/PaymentModal';
import { PaymentSuccessModal } from './components/PaymentSuccessModal';
import { SettingsModal } from './components/SettingsModal';
import { EditCompletedOrderModal } from './components/EditCompletedOrderModal';
import { UserManagerModal } from './components/UserManagerModal';
import { BranchManagerModal } from './components/BranchManagerModal';
import { MoveTableModal } from './components/MoveTableModal';
import { CancelOrderModal } from './components/CancelOrderModal';
import { CashBillModal } from './components/CashBillModal';
import { ItemCustomizationModal } from './components/ItemCustomizationModal';
import { CustomerView } from './components/CustomerView';

import Swal from 'sweetalert2';

const isSameDay = (d1: Date, d2: Date) => {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
};

const App: React.FC = () => {
    // --- AUTH & BRANCH STATE ---
    const [users, setUsers] = useFirestoreSync<User[]>(null, 'users', DEFAULT_USERS);
    const [branches, setBranches] = useFirestoreSync<Branch[]>(null, 'branches', DEFAULT_BRANCHES);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);

    // --- VIEW & EDIT MODE STATE ---
    const [currentView, setCurrentView] = useState<View>('pos');
    const [isEditMode, setIsEditMode] = useState(false);
    const [isAdminSidebarCollapsed, setIsAdminSidebarCollapsed] = useState(false);
    const [isOrderSidebarVisible, setIsOrderSidebarVisible] = useState(true);

    // --- CUSTOMER MODE STATE ---
    const [isCustomerMode, setIsCustomerMode] = useState(false);
    const [customerTableId, setCustomerTableId] = useState<number | null>(null);
    
    // --- BRANCH-SPECIFIC STATE (SYNCED WITH FIRESTORE) ---
    const branchId = selectedBranch?.id.toString() ?? null;
    const [menuItems, setMenuItems] = useFirestoreSync<MenuItem[]>(branchId, 'menuItems', DEFAULT_MENU_ITEMS);
    const [categories, setCategories] = useFirestoreSync<string[]>(branchId, 'categories', DEFAULT_CATEGORIES);
    const [tables, setTables] = useFirestoreSync<Table[]>(branchId, 'tables', DEFAULT_TABLES);
    const [activeOrders, setActiveOrders] = useFirestoreSync<ActiveOrder[]>(branchId, 'activeOrders', []);
    const [completedOrders, setCompletedOrders] = useFirestoreSync<CompletedOrder[]>(branchId, 'completedOrders', []);
    const [cancelledOrders, setCancelledOrders] = useFirestoreSync<CancelledOrder[]>(branchId, 'cancelledOrders', []);
    const [stockItems, setStockItems] = useFirestoreSync<StockItem[]>(branchId, 'stockItems', DEFAULT_STOCK_ITEMS);
    const [stockCategories, setStockCategories] = useFirestoreSync<string[]>(branchId, 'stockCategories', DEFAULT_STOCK_CATEGORIES);
    const [stockUnits, setStockUnits] = useFirestoreSync<string[]>(branchId, 'stockUnits', DEFAULT_STOCK_UNITS);
    const [printHistory, setPrintHistory] = useFirestoreSync<PrintHistoryEntry[]>(branchId, 'printHistory', []);

    // --- POS-SPECIFIC LOCAL STATE ---
    const [currentOrderItems, setCurrentOrderItems] = useState<OrderItem[]>([]);
    const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
    const [customerName, setCustomerName] = useState('');
    const [customerCount, setCustomerCount] = useState(1);
    const [selectedSidebarFloor, setSelectedSidebarFloor] = useState<'lower' | 'upper'>('lower');
    const [notSentToKitchenDetails, setNotSentToKitchenDetails] = useState<{ reason: string; notes: string } | null>(null);


    // --- GENERAL SETTINGS STATE ---
    const [logoUrl, setLogoUrl] = useFirestoreSync<string | null>(branchId, 'logoUrl', null);
    const [restaurantName, setRestaurantName] = useFirestoreSync<string>(branchId, 'restaurantName', 'ชื่อร้านอาหาร');
    const [qrCodeUrl, setQrCodeUrl] = useFirestoreSync<string | null>(branchId, 'qrCodeUrl', null);
    const [notificationSoundUrl, setNotificationSoundUrl] = useFirestoreSync<string | null>(branchId, 'notificationSoundUrl', null);
    const [printerConfig, setPrinterConfig] = useFirestoreSync<PrinterConfig | null>(branchId, 'printerConfig', null);
    const [openingTime, setOpeningTime] = useFirestoreSync<string | null>(branchId, 'openingTime', '10:00');
    const [closingTime, setClosingTime] = useFirestoreSync<string | null>(branchId, 'closingTime', '22:00');
    const [isTaxEnabled, setIsTaxEnabled] = useFirestoreSync<boolean>(branchId, 'isTaxEnabled', false);
    const [taxRate, setTaxRate] = useFirestoreSync<number>(branchId, 'taxRate', 7);
    const [sendToKitchen, setSendToKitchen] = useFirestoreSync<boolean>(branchId, 'sendToKitchen', true);

    // --- MODAL STATES ---
    const [modalState, setModalState] = useState({
        isMenuItem: false, isOrderSuccess: false, isSplitBill: false, isTableBill: false,
        isPayment: false, isPaymentSuccess: false, isSettings: false, isEditCompleted: false,
        isUserManager: false, isBranchManager: false, isMoveTable: false, isCancelOrder: false,
        isCashBill: false, isSplitCompleted: false, isCustomization: false,
    });
    const [itemToEdit, setItemToEdit] = useState<MenuItem | null>(null);
    const [itemToCustomize, setItemToCustomize] = useState<MenuItem | null>(null);
    const [orderForModal, setOrderForModal] = useState<ActiveOrder | CompletedOrder | null>(null);
    const [lastPlacedOrderId, setLastPlacedOrderId] = useState<number | null>(null);
    const [notifiedOverdueOrders, setNotifiedOverdueOrders] = useState<Set<number>>(new Set());

    // --- ASYNC OPERATION STATE ---
    const [isPlacingOrder, setIsPlacingOrder] = useState(false);
    const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);

    // --- KITCHEN NOTIFICATION REF ---
    const prevActiveOrdersRef = useRef<ActiveOrder[] | undefined>(undefined);

    // --- CUSTOMER MODE INITIALIZATION ---
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('mode') === 'customer' && params.get('tableId')) {
            setIsCustomerMode(true);
            setCustomerTableId(Number(params.get('tableId')));
            
            // Auto-select branch for customer if not selected
             if (!selectedBranch && branches.length > 0) {
                setSelectedBranch(branches[0]);
            }
        }
    }, [branches, selectedBranch]);

    // --- USER SYNC EFFECT ---
    // Sync currentUser state when the users array changes (e.g. profile pic updated)
    useEffect(() => {
        if (currentUser) {
            const foundUser = users.find(u => u.id === currentUser.id);
            if (foundUser) {
                // Using JSON.stringify for deep comparison to catch ANY change including profilePictureUrl
                if (JSON.stringify(foundUser) !== JSON.stringify(currentUser)) {
                    setCurrentUser(foundUser);
                }
            }
        }
    }, [users, currentUser]);


    // --- COMPUTED VALUES ---
    const kitchenBadgeCount = useMemo(() => activeOrders.filter(o => o.status === 'waiting').length, [activeOrders]);
    const tablesBadgeCount = useMemo(() => activeOrders.length, [activeOrders]);
    const vacantTablesBadgeCount = useMemo(() => {
        const occupiedTables = new Set(activeOrders.map(o => o.tableName));
        return tables.length - occupiedTables.size;
    }, [tables, activeOrders]);
    const layoutType = useMemo(() => {
        if (currentUser?.role === 'admin' || currentUser?.role === 'branch-admin') {
            return 'admin';
        }
        return 'staff';
    }, [currentUser]);

    // Total Items Calculation for Badge
    const totalItems = useMemo(() => currentOrderItems.reduce((sum, item) => sum + item.quantity, 0), [currentOrderItems]);

    // --- KITCHEN NOTIFICATION EFFECT ---
    useEffect(() => {
        // Only run for kitchen staff and if not the initial render
        if (currentUser?.role === 'kitchen' && prevActiveOrdersRef.current) {
            const previousOrders = prevActiveOrdersRef.current;
            
            // Find new orders by comparing current and previous states
            if (activeOrders.length > previousOrders.length) {
                const previousOrderIds = new Set(previousOrders.map(o => o.id));
                const newOrders = activeOrders.filter(o => !previousOrderIds.has(o.id) && o.status === 'waiting');

                if (newOrders.length > 0) {
                    // 1. Play sound
                    if (notificationSoundUrl) {
                        const audio = new Audio(notificationSoundUrl);
                        audio.play().catch(error => console.error("Error playing notification sound:", error));
                    }

                    // 2. Show SweetAlert
                    const orderToShow = newOrders[0]; // Show alert for the first new order
                    Swal.fire({
                        title: '🔔 มีออเดอร์ใหม่!',
                        html: `<b>โต๊ะ ${orderToShow.tableName}</b> (ออเดอร์ #${String(orderToShow.orderNumber).padStart(3, '0')})`,
                        icon: 'info',
                        confirmButtonText: 'รับทราบ',
                        allowOutsideClick: false,
                        allowEscapeKey: false,
                    });
                }
            }
        }
        
        // Update the ref to the current state for the next render
        prevActiveOrdersRef.current = activeOrders;
    }, [activeOrders, currentUser, notificationSoundUrl]);

    // --- ORDER TIMEOUT NOTIFICATION EFFECT ---
    useEffect(() => {
        const ORDER_TIMEOUT_MINUTES = 15;
        const checkOverdueOrders = () => {
            const now = Date.now();
            const overdueLimit = ORDER_TIMEOUT_MINUTES * 60 * 1000;
            
            const newlyOverdueOrders: ActiveOrder[] = [];
            const orderIdsToMarkAsOverdue: number[] = [];
    
            activeOrders.forEach(order => {
                if (order.status === 'waiting' || order.status === 'cooking') {
                    const startTime = order.cookingStartTime || order.orderTime;
                    const elapsedTime = now - startTime;
    
                    if (elapsedTime > overdueLimit) {
                        if (!order.isOverdue) {
                            orderIdsToMarkAsOverdue.push(order.id);
                        }
                        if (!notifiedOverdueOrders.has(order.id)) {
                            newlyOverdueOrders.push(order);
                        }
                    }
                }
            });
    
            if (orderIdsToMarkAsOverdue.length > 0) {
                setActiveOrders(prevOrders =>
                    prevOrders.map(o =>
                        orderIdsToMarkAsOverdue.includes(o.id) ? { ...o, isOverdue: true } : o
                    )
                );
            }
    
            if (newlyOverdueOrders.length > 0) {
                newlyOverdueOrders.forEach(order => {
                    if (isCustomerMode) return; 

                    Swal.fire({
                        title: '🔔 ลูกค้ารอนานเกินไป!',
                        html: `ออเดอร์ <b>#${String(order.orderNumber).padStart(3, '0')}</b> (โต๊ะ ${order.tableName})<br/>รออาหารนานเกิน ${ORDER_TIMEOUT_MINUTES} นาทีแล้ว`,
                        icon: 'warning',
                        confirmButtonText: 'รับทราบ',
                    });
                });
    
                setNotifiedOverdueOrders(prevSet => {
                    const newSet = new Set(prevSet);
                    newlyOverdueOrders.forEach(o => newSet.add(o.id));
                    return newSet;
                });
            }
        };
    
        const intervalId = setInterval(checkOverdueOrders, 30 * 1000); // Check every 30 seconds
    
        return () => clearInterval(intervalId);
    }, [activeOrders, notifiedOverdueOrders, setActiveOrders, isCustomerMode]);


    // --- CORE LOGIC HANDLERS ---
    const handleLogin = (username: string, password: string) => {
        // Try to find in loaded users state
        let user = users.find(u => u.username === username && u.password === password);
        
        // Fallback: Check DEFAULT_USERS in case the database sync hasn't brought in the new hardcoded user yet
        // This ensures that if we add a new user in constants.ts, they can login even if the old DB data persists.
        if (!user) {
             user = DEFAULT_USERS.find(u => u.username === username && u.password === password);
        }

        if (user) {
            setCurrentUser(user);
            if (user.role === 'kitchen') {
                setCurrentView('kitchen');
            } else {
                setCurrentView('pos');
            }
            return { success: true };
        }
        return { success: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
    };

    const handleLogout = () => {
        setCurrentUser(null);
        setSelectedBranch(null);
        setCurrentView('pos');
    };

    const handleSendToKitchenChange = (enabled: boolean, details: { reason: string; notes: string } | null = null) => {
        setSendToKitchen(enabled);
        if (!enabled && details) {
            setNotSentToKitchenDetails(details);
        } else if (enabled) {
            setNotSentToKitchenDetails(null);
        }
    };


    const clearPosState = useCallback(() => {
        setCurrentOrderItems([]);
        setSelectedTableId(null);
        setCustomerName('');
        setCustomerCount(1);
        setNotSentToKitchenDetails(null);
    }, []);

    const handlePlaceOrderLogic = async (
        items: OrderItem[],
        table: Table,
        cName: string,
        cCount: number,
        placedBy: string,
        shouldSendToKitchen: boolean
    ) => {
        const allOrders = [...activeOrders, ...completedOrders, ...cancelledOrders];
        const todayDate = new Date();
        let newOrderNumber = 1;

        const todayOrders = allOrders.filter(o => isSameDay(new Date(o.orderTime), todayDate));

        if (todayOrders.length > 0) {
            newOrderNumber = Math.max(0, ...todayOrders.map(o => o.orderNumber)) + 1;
        }
        
        const subtotal = items.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
        const taxAmount = isTaxEnabled ? subtotal * (taxRate / 100) : 0;
        
        const newOrder: ActiveOrder = {
            id: Date.now(),
            orderNumber: newOrderNumber,
            tableName: table.name,
            customerName: cName,
            floor: table.floor,
            customerCount: cCount,
            items: items,
            orderType: 'dine-in' as const,
            taxRate: isTaxEnabled ? taxRate : 0,
            placedBy: placedBy,
            taxAmount,
            status: 'waiting',
            orderTime: Date.now(),
        };

        if (shouldSendToKitchen) {
            setActiveOrders(prev => [...prev, newOrder]);
            
            if (printerConfig?.kitchen) {
                 const logEntry: PrintHistoryEntry = {
                    id: Date.now(),
                    timestamp: Date.now(),
                    orderNumber: newOrder.orderNumber,
                    tableName: newOrder.tableName,
                    printedBy: newOrder.placedBy,
                    printerType: 'kitchen',
                    status: 'success',
                    errorMessage: null,
                    orderItemsPreview: newOrder.items.map(i => {
                        const optionsText = i.selectedOptions.map(opt => opt.name).join(', ');
                        const notesText = i.notes ? ` [**${i.notes}**]` : '';
                        const takeawayText = i.isTakeaway ? ' (กลับบ้าน)' : '';
                        return `${i.name}${takeawayText}${optionsText ? ` (${optionsText})` : ''} x${i.quantity}${notesText}`;
                    }),
                    isReprint: false,
                };
                try {
                    await printerService.printKitchenOrder(newOrder, printerConfig.kitchen);
                    setPrintHistory(prev => [logEntry, ...prev.slice(0, 99)]);
                } catch (err: any) {
                    logEntry.status = 'failed';
                    logEntry.errorMessage = err.message;
                    setPrintHistory(prev => [logEntry, ...prev.slice(0, 99)]);
                    Swal.fire({
                        icon: 'error',
                        title: 'พิมพ์เข้าครัวไม่สำเร็จ',
                        text: 'ออเดอร์ถูกบันทึกแล้ว แต่ส่งไปพิมพ์ไม่สำเร็จ',
                        timer: 4000
                    });
                }
            }
            return newOrderNumber;
        } else {
             // Logic for NOT sending to kitchen -> create a cancelled order (only applicable for staff mode usually)
            const fullReason = notSentToKitchenDetails 
                ? (notSentToKitchenDetails.reason === 'อื่นๆ' 
                    ? `ไม่ได้ส่งเข้าครัว: ${notSentToKitchenDetails.notes}`
                    : `ไม่ได้ส่งเข้าครัว: ${notSentToKitchenDetails.reason}`)
                : "ไม่ได้ส่งเข้าครัว";

            const cancelledOrder: CancelledOrder = {
                ...newOrder,
                status: 'cancelled',
                cancellationTime: Date.now(),
                cancelledBy: placedBy,
                cancellationReason: 'อื่นๆ',
                cancellationNotes: fullReason,
            };

            setCancelledOrders(prev => [...prev, cancelledOrder]);
             return newOrderNumber;
        }
    };

    const handlePlaceOrder = async () => {
        const selectedTable = tables.find(t => t.id === selectedTableId);
        if (!selectedTable || currentOrderItems.length === 0 || !currentUser || !branchId) return;

        setIsPlacingOrder(true);
        
        const newOrderNum = await handlePlaceOrderLogic(
            currentOrderItems,
            selectedTable,
            customerName,
            customerCount,
            currentUser.username,
            sendToKitchen
        );

        if (sendToKitchen) {
             setLastPlacedOrderId(newOrderNum);
             setModalState(prev => ({ ...prev, isOrderSuccess: true }));
        } else {
             Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: 'บันทึกออเดอร์ในประวัติยกเลิกแล้ว',
                showConfirmButton: false,
                timer: 2500
            });
        }
        
        setIsPlacingOrder(false);
        clearPosState();
        setSendToKitchen(true); 
    };

    const handleCustomerPlaceOrder = async (items: OrderItem[], cName: string, cCount: number) => {
        if (!customerTableId) return;
        const table = tables.find(t => t.id === customerTableId);
        if (!table) return;

        const newOrderNum = await handlePlaceOrderLogic(
            items,
            table,
            cName,
            cCount,
            'Customer (Self)',
            true // Always send to kitchen for customers
        );
        
        Swal.fire({
            icon: 'success',
            title: 'ส่งออเดอร์เรียบร้อย!',
            text: `ออเดอร์ #${String(newOrderNum).padStart(3, '0')} กำลังถูกจัดเตรียม`,
            timer: 3000,
            showConfirmButton: false
        });
    };

    const generateTablePin = (tableId: number) => {
        const pin = Math.floor(Math.random() * 900 + 100).toString(); // 3 digits: 100-999
        setTables(prev => prev.map(t => t.id === tableId ? { ...t, activePin: pin } : t));
    };
    
    const handleConfirmPayment = async (orderId: number, paymentDetails: any) => {
        const orderToComplete = activeOrders.find(o => o.id === orderId);
        if (!orderToComplete || !branchId) return;

        setIsConfirmingPayment(true);
        
        const completedOrder: CompletedOrder = {
            ...orderToComplete,
            status: 'completed',
            completionTime: Date.now(),
            paymentDetails,
        };
        setCompletedOrders(prev => [...prev, completedOrder]);
        setActiveOrders(prev => prev.filter(o => o.id !== orderId));

        // Reset the PIN for this table to prevent previous customers from accessing/ordering again
        setTables(prevTables => prevTables.map(t => {
            if (t.name === orderToComplete.tableName && t.floor === orderToComplete.floor) {
                const updatedTable = { ...t };
                delete updatedTable.activePin; // Clear the PIN
                return updatedTable;
            }
            return t;
        }));

        setNotifiedOverdueOrders(prevSet => {
            const newSet = new Set(prevSet);
            newSet.delete(orderId);
            return newSet;
        });

        setIsConfirmingPayment(false);

        // Show success toast for clearing PIN and payment
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: 'ชำระเงินสำเร็จ & ล้าง PIN โต๊ะแล้ว',
            showConfirmButton: false,
            timer: 2500
        });

        setModalState(prev => ({ ...prev, isPayment: false, isPaymentSuccess: true }));
        setLastPlacedOrderId(orderToComplete.orderNumber);
    };

    const handleConfirmSplit = (itemsToSplit: OrderItem[]) => {
        const originalOrder = orderForModal as ActiveOrder | null;
        if (!originalOrder) return;
    
        const newOrderNumber = Math.max(0, ...[...activeOrders, ...completedOrders].map(o => o.orderNumber)) + 1;
        const newSubtotal = itemsToSplit.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
        const newTaxAmount = isTaxEnabled ? newSubtotal * (taxRate / 100) : 0;
        
        const newSplitOrder: ActiveOrder = {
            ...originalOrder,
            id: Date.now(),
            orderNumber: newOrderNumber,
            items: itemsToSplit,
            taxAmount: newTaxAmount,
            parentOrderId: originalOrder.orderNumber,
        };
    
        const updatedOriginalItems = originalOrder.items.map(origItem => {
            const splitItem = itemsToSplit.find(si => si.cartItemId === origItem.cartItemId);
            if (splitItem) {
                return { ...origItem, quantity: origItem.quantity - splitItem.quantity };
            }
            return origItem;
        }).filter(item => item.quantity > 0);
        
        const updatedOriginalSubtotal = updatedOriginalItems.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
        const updatedOriginalTaxAmount = isTaxEnabled ? updatedOriginalSubtotal * (taxRate / 100) : 0;
    
        setActiveOrders(prev => {
            const withoutOriginal = prev.filter(o => o.id !== originalOrder.id);
            const updatedOriginalOrder = {
                ...originalOrder,
                items: updatedOriginalItems,
                taxAmount: updatedOriginalTaxAmount,
            };
            return [...withoutOriginal, updatedOriginalOrder, newSplitOrder];
        });
    
        setModalState(p => ({ ...p, isSplitBill: false }));
        setOrderForModal(null);
        Swal.fire('แยกบิลสำเร็จ!', `สร้างบิลใหม่ #${String(newOrderNumber).padStart(3, '0')} เรียบร้อยแล้ว`, 'success');
    };

    const handleSaveCompletedOrder = ({ id, items }: { id: number; items: OrderItem[] }) => {
        setCompletedOrders(prev => prev.map(order => {
            if (order.id === id) {
                const subtotal = items.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
                const taxAmount = order.taxRate > 0 ? subtotal * (order.taxRate / 100) : 0;
                return { ...order, items, taxAmount };
            }
            return order;
        }));
        setModalState(p => ({ ...p, isEditCompleted: false }));
        setOrderForModal(null);
        Swal.fire('บันทึกแล้ว', 'ออเดอร์ในประวัติได้รับการอัปเดต', 'success');
    };

    const handleSelectItem = (item: MenuItem) => {
        setItemToCustomize(item);
        setModalState(prev => ({...prev, isCustomization: true}));
    };

    const handleConfirmCustomization = (itemToAdd: OrderItem) => {
        setCurrentOrderItems(prev => {
            const existingItem = prev.find(i => i.cartItemId === itemToAdd.cartItemId);
            if (existingItem) {
                return prev.map(i => i.cartItemId === itemToAdd.cartItemId ? { ...i, quantity: i.quantity + itemToAdd.quantity } : i);
            }
            return [...prev, itemToAdd];
        });
        setModalState(prev => ({...prev, isCustomization: false}));
    };

    const handleImportMenu = (importedItems: MenuItem[], newCategories: string[]) => {
        // Merge Menu Items
        setMenuItems(prevItems => {
            const itemsMap = new Map(prevItems.map(item => [item.id, item]));
            importedItems.forEach(item => {
                itemsMap.set(item.id, item); // Add or overwrite based on ID
            });
            return Array.from(itemsMap.values());
        });
    
        // Merge Categories
        setCategories(prevCategories => {
            const allCategories = new Set([...prevCategories.filter(c => c !== 'ทั้งหมด'), ...newCategories]);
            const sorted = Array.from(allCategories).sort();
            return ['ทั้งหมด', ...sorted];
        });
    };

    const handleReprint = async (orderNumber: number) => {
        if (!printerConfig?.kitchen) {
            Swal.fire('ไม่ได้ตั้งค่า', 'กรุณาตั้งค่าเครื่องพิมพ์ครัวก่อน', 'warning');
            return;
        }
    
        const allOrders = [...activeOrders, ...completedOrders, ...cancelledOrders];
        const orderToReprint = allOrders.find(o => o.orderNumber === orderNumber);
    
        if (!orderToReprint) {
            Swal.fire('ไม่พบออเดอร์', `ไม่พบข้อมูลออเดอร์ #${orderNumber}`, 'error');
            return;
        }
    
        const orderAsActive = orderToReprint as ActiveOrder; // Cast for compatibility
        
        const logEntry: PrintHistoryEntry = {
            id: Date.now(),
            timestamp: Date.now(),
            orderNumber: orderToReprint.orderNumber,
            tableName: orderToReprint.tableName,
            printedBy: currentUser?.username ?? 'N/A',
            printerType: 'kitchen',
            status: 'success',
            errorMessage: null,
            orderItemsPreview: orderToReprint.items.map(i => {
                const optionsText = i.selectedOptions.map(opt => opt.name).join(', ');
                const notesText = i.notes ? ` [**${i.notes}**]` : '';
                const takeawayText = i.isTakeaway ? ' (กลับบ้าน)' : '';
                return `${i.name}${takeawayText}${optionsText ? ` (${optionsText})` : ''} x${i.quantity}${notesText}`;
            }),
            isReprint: true,
        };
    
        try {
            await printerService.printKitchenOrder(orderAsActive, printerConfig.kitchen);
            setPrintHistory(prev => [logEntry, ...prev.slice(0, 99)]);
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: `ส่งคำสั่งพิมพ์ซ้ำ #${String(orderToReprint.orderNumber).padStart(3, '0')} แล้ว`,
                showConfirmButton: false,
                timer: 2500
            });
        } catch (error: any) {
            logEntry.status = 'failed';
            logEntry.errorMessage = error.message;
            setPrintHistory(prev => [logEntry, ...prev.slice(0, 99)]);
            Swal.fire('พิมพ์ไม่สำเร็จ', `เกิดข้อผิดพลาด: ${error.message}`, 'error');
        }
    };
    

    // --- UI & MODAL HANDLERS ---
    const handleOpenItemModal = (item: MenuItem | null) => {
        setItemToEdit(item);
        setModalState(prev => ({ ...prev, isMenuItem: true }));
    };
    
    const handleAddNewItem = () => {
        handleOpenItemModal(null);
    }

    const handleSaveMenuItem = (item: Omit<MenuItem, 'id'> & { id?: number }) => {
        setMenuItems(prev => {
            if (item.id) {
                return prev.map(i => i.id === item.id ? { ...i, ...item } : i);
            }
            const newId = Math.max(0, ...prev.map(i => i.id)) + 1;
            return [...prev, { ...item, id: newId }];
        });
        setModalState(prev => ({...prev, isMenuItem: false}));
    };
    
    const handleDeleteMenuItem = (id: number) => {
        setMenuItems(prev => prev.filter(item => item.id !== id));
    };

    const bottomNavItems = useMemo(() => {
        const items: NavItem[] = [
             { id: 'pos', label: 'POS', view: 'pos', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v.01" /></svg> },
             { id: 'kitchen', label: 'ครัว', view: 'kitchen', badge: kitchenBadgeCount, disabled: currentUser?.role === 'pos', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.653-.125-1.274-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.653.125-1.274.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
             { id: 'tables', label: 'ผังโต๊ะ', view: 'tables', badge: tablesBadgeCount, icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg> },
        ];
        if (layoutType === 'admin') {
            items.push({ id: 'history', label: 'ประวัติ', view: 'history', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>});
            items.push({ id: 'more', label: 'เพิ่มเติม', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>, subItems: [
                { id: 'dashboard', label: 'Dashboard', view: 'dashboard', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1-1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" /></svg>},
                { id: 'stock', label: 'สต็อก', view: 'stock', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>},
                { id: 'users', label: 'จัดการผู้ใช้', onClick: () => setModalState(p=>({...p, isUserManager: true})), icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zm-1.5 5.5a3 3 0 00-3 0V12a1 1 0 00-1 1v-1.5a.5.5 0 00-1 0V12a2 2 0 002 2h2.5a.5.5 0 00.5-.5V12a1 1 0 00-1-1h-.5zM17 6a3 3 0 11-6 0 3 3 0 016 0zm-1.5 5.5a3 3 0 00-3 0V12a1 1 0 00-1 1v-1.5a.5.5 0 00-1 0V12a2 2 0 002 2h2.5a.5.5 0 00.5-.5V12a1 1 0 00-1-1h-.5z" /></svg> },
                ...(currentUser?.role === 'admin' ? [{ id: 'branches', label: 'จัดการสาขา', onClick: () => setModalState(p=>({...p, isBranchManager: true})), icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2 4.5A1.5 1.5 0 013.5 3h13A1.5 1.5 0 0118 4.5v2.755a3 3 0 01-1.5 2.599V15.5A1.5 1.5 0 0115 17h-1.5a1.5 1.5 0 01-1.5-1.5v-2.348a3 3 0 01-1.5-2.599V7.255a3 3 0 01-1.5 2.599V15.5A1.5 1.5 0 017.5 17H6a1.5 1.5 0 01-1.5-1.5v-5.146A3 3 0 013 7.255V4.5z" /></svg> }] : []),
                { id: 'settings', label: 'ตั้งค่า', onClick: () => setModalState(p=>({...p, isSettings: true})), icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924-1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
             ]});
        }

        return items;

    }, [layoutType, kitchenBadgeCount, tablesBadgeCount, currentUser]);


    // --- RENDER LOGIC ---
    
    // 1. Customer Self-Service Mode
    if (isCustomerMode && customerTableId && branches.length > 0) {
        const customerTable = tables.find(t => t.id === customerTableId);
        if (customerTable) {
            return (
                <CustomerView 
                    table={customerTable}
                    menuItems={menuItems}
                    categories={categories}
                    activeOrders={activeOrders.filter(o => o.tableName === customerTable.name)}
                    onPlaceOrder={handleCustomerPlaceOrder}
                />
            );
        } else {
            // Fallback if table ID from URL is not found yet (data sync lag) or invalid
             return (
                <div className="min-h-screen flex items-center justify-center bg-gray-100">
                    <p className="text-gray-500 animate-pulse">กำลังโหลดข้อมูลโต๊ะ...</p>
                </div>
             );
        }
    }

    // 2. Staff/Admin Mode Authentication
    if (!currentUser) {
        return <LoginScreen onLogin={handleLogin} />;
    }

    if (!selectedBranch) {
        return <BranchSelectionScreen 
            currentUser={currentUser}
            branches={branches}
            onSelectBranch={setSelectedBranch}
            onManageBranches={() => setModalState(prev => ({...prev, isBranchManager: true}))}
            onLogout={handleLogout}
        />;
    }

    return (
        <div className="h-screen w-screen bg-gray-100 flex">
             {layoutType === 'admin' && (
                <AdminSidebar
                    isCollapsed={isAdminSidebarCollapsed}
                    onToggleCollapse={() => setIsAdminSidebarCollapsed(!isAdminSidebarCollapsed)}
                    logoUrl={logoUrl}
                    restaurantName={restaurantName}
                    branchName={selectedBranch.name}
                    currentUser={currentUser}
                    onViewChange={setCurrentView}
                    currentView={currentView}
                    onToggleEditMode={() => setIsEditMode(!isEditMode)}
                    isEditMode={isEditMode}
                    onOpenSettings={() => setModalState(p=>({...p, isSettings: true}))}
                    onOpenUserManager={() => setModalState(p=>({...p, isUserManager: true}))}
                    onManageBranches={() => setModalState(p=>({...p, isBranchManager: true}))}
                    onChangeBranch={() => setSelectedBranch(null)}
                    onLogout={handleLogout}
                    kitchenBadgeCount={kitchenBadgeCount}
                    tablesBadgeCount={tablesBadgeCount}
                    onUpdateCurrentUser={(updates) => {
                        setUsers(prev => prev.map(u => u.id === currentUser.id ? {...u, ...updates} : u));
                        setCurrentUser(prev => prev ? { ...prev, ...updates } : null);
                    }}
                    onUpdateLogoUrl={setLogoUrl}
                    onUpdateRestaurantName={setRestaurantName}
                />
            )}

            <div className={`flex-1 flex flex-col transition-all duration-300 ${layoutType === 'admin' ? (isAdminSidebarCollapsed ? 'md:ml-20' : 'md:ml-64') : ''}`}>
                {layoutType === 'staff' && (
                    <Header
                        currentView={currentView as View}
                        onViewChange={setCurrentView}
                        isEditMode={isEditMode}
                        onToggleEditMode={() => setIsEditMode(!isEditMode)}
                        onOpenSettings={() => setModalState(prev => ({...prev, isSettings: true}))}
                        kitchenBadgeCount={kitchenBadgeCount}
                        tablesBadgeCount={tablesBadgeCount}
                        vacantTablesBadgeCount={vacantTablesBadgeCount}
                        currentUser={currentUser}
                        onLogout={handleLogout}
                        onOpenUserManager={() => setModalState(prev => ({...prev, isUserManager: true}))}
                        logoUrl={logoUrl}
                        onLogoChangeClick={() => {}}
                        restaurantName={restaurantName}
                        onRestaurantNameChange={setRestaurantName}
                        branchName={selectedBranch.name}
                        onChangeBranch={() => setSelectedBranch(null)}
                        onManageBranches={() => setModalState(prev => ({...prev, isBranchManager: true}))}
                    />
                )}

                <main className="flex-1 flex overflow-hidden">
                    {currentView === 'pos' && (
                        <div className="flex flex-1 w-full h-full">
                            <div className="flex-1 h-full"> {/* Menu Wrapper */}
                                <Menu
                                    menuItems={menuItems}
                                    setMenuItems={setMenuItems}
                                    categories={categories}
                                    onSelectItem={handleSelectItem}
                                    isEditMode={isEditMode}
                                    onEditItem={handleOpenItemModal}
                                    onAddNewItem={handleAddNewItem}
                                    onDeleteItem={handleDeleteMenuItem}
                                    onUpdateCategory={(oldName, newName) => {
                                        setCategories(cats => cats.map(c => c === oldName ? newName : c));
                                        setMenuItems(items => items.map(i => i.category === oldName ? {...i, category: newName} : i));
                                    }}
                                    onDeleteCategory={(name) => setCategories(cats => cats.filter(c => c !== name))}
                                    onAddCategory={(name) => setCategories(cats => [...cats, name])}
                                    onImportMenu={handleImportMenu}
                                />
                            </div>

                            {/* Sidebar Container */}
                            <div className="relative flex-shrink-0">
                                <div className={`h-full transition-[width] duration-300 ease-in-out ${isOrderSidebarVisible ? 'w-full md:w-96 lg:w-[420px]' : 'w-0'}`}>
                                    <div className="w-full md:w-96 lg:w-[420px] h-full overflow-hidden">
                                        <Sidebar
                                            currentOrderItems={currentOrderItems}
                                            onQuantityChange={(id, qty) => setCurrentOrderItems(p => p.map(i => i.cartItemId === id ? {...i, quantity: qty} : i).filter(i => i.quantity > 0))}
                                            onRemoveItem={(id) => setCurrentOrderItems(p => p.filter(i => i.cartItemId !== id))}
                                            onToggleTakeaway={(id, isTakeaway, cutlery, notes) => {
                                                setCurrentOrderItems(p => p.map(i => 
                                                    i.cartItemId === id 
                                                        ? { ...i, isTakeaway, takeawayCutlery: isTakeaway ? cutlery : undefined, takeawayCutleryNotes: isTakeaway ? notes : undefined } 
                                                        : i
                                                ));
                                            }}
                                            onClearOrder={clearPosState}
                                            onPlaceOrder={handlePlaceOrder}
                                            isPlacingOrder={isPlacingOrder}
                                            tables={tables}
                                            selectedTable={tables.find(t => t.id === selectedTableId) ?? null}
                                            onSelectTable={(id) => setSelectedTableId(id)}
                                            customerName={customerName}
                                            onCustomerNameChange={setCustomerName}
                                            customerCount={customerCount}
                                            onCustomerCountChange={setCustomerCount}
                                            isEditMode={isEditMode}
                                            onAddNewTable={(floor) => setTables(p => {
                                                const tablesOnFloor = p.filter(t => t.floor === floor);
                                                const tNumbers = tablesOnFloor
                                                    .map(table => {
                                                        const match = table.name.match(/^T(\d+)$/);
                                                        return match ? parseInt(match[1], 10) : null;
                                                    })
                                                    .filter((num): num is number => num !== null);
                                            
                                                const newTableNumber = tNumbers.length > 0 ? Math.max(...tNumbers) + 1 : 1;
                                                const newTableName = `T${newTableNumber}`;
                                                const newId = Math.max(0, ...p.map(t => t.id)) + 1;
                                            
                                                return [...p, { id: newId, name: newTableName, floor }];
                                            })}
                                            onRemoveLastTable={(floor) => setTables(p => p.slice(0, p.filter(t => t.floor === floor).length -1))}
                                            selectedFloor={selectedSidebarFloor}
                                            onFloorChange={setSelectedSidebarFloor}
                                            isTaxEnabled={isTaxEnabled}
                                            onTaxEnabledChange={setIsTaxEnabled}
                                            taxRate={taxRate}
                                            onTaxRateChange={setTaxRate}
                                            sendToKitchen={sendToKitchen}
                                            onSendToKitchenChange={handleSendToKitchenChange}
                                        />
                                    </div>
                                </div>
                                
                                {/* Toggle Button */}
                                <button 
                                    onClick={() => setIsOrderSidebarVisible(!isOrderSidebarVisible)}
                                    className="absolute top-1/2 -translate-y-1/2 -left-6 bg-gray-700 hover:bg-gray-600 text-white w-6 h-16 rounded-l-md flex items-center justify-center z-20 transition-all"
                                    title={isOrderSidebarVisible ? "ซ่อน" : "แสดง"}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 transition-transform ${isOrderSidebarVisible ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                    {!isOrderSidebarVisible && totalItems > 0 && (
                                        <span className="absolute -top-4 -left-4 flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-base font-bold text-white border-2 border-gray-800 shadow-lg z-30">
                                            {totalItems > 99 ? '99+' : totalItems}
                                        </span>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                    {currentView === 'kitchen' && <KitchenView activeOrders={activeOrders} onStartCooking={(id) => setActiveOrders(p => p.map(o => o.id === id ? {...o, status: 'cooking', cookingStartTime: Date.now()} : o))} onCompleteOrder={(id) => setActiveOrders(p => p.map(o => o.id === id ? {...o, status: 'served'} : o))} />}
                    {currentView === 'tables' && <TableLayout tables={tables} activeOrders={activeOrders} onTableSelect={(id) => { setSelectedTableId(id); setCurrentView('pos'); }} onShowBill={(id) => { setOrderForModal(activeOrders.find(o => o.id === id) ?? null); setModalState(p=>({...p, isTableBill: true})); }} onGeneratePin={generateTablePin} currentUser={currentUser} printerConfig={printerConfig} />}
                    {currentView === 'dashboard' && <Dashboard completedOrders={completedOrders} cancelledOrders={cancelledOrders} openingTime={String(openingTime)} closingTime={String(closingTime)} />}
                    {currentView === 'history' && <SalesHistory completedOrders={completedOrders} cancelledOrders={cancelledOrders} printHistory={printHistory} onReprint={handleReprint} isEditMode={isEditMode} onSplitOrder={(order) => { setOrderForModal(order); setModalState(p=>({...p, isSplitCompleted: true}));}} onEditOrder={(order) => { setOrderForModal(order); setModalState(p=>({...p, isEditCompleted: true})); }} onInitiateCashBill={(order) => { setOrderForModal(order); setModalState(p=>({...p, isCashBill: true}));}} onDeleteHistory={(c, ca, p) => { setCompletedOrders(prev => prev.filter(o => !c.includes(o.id))); setCancelledOrders(prev => prev.filter(o => !ca.includes(o.id))); setPrintHistory(prev => prev.filter(entry => !p.includes(entry.id))); }} />}
                    {currentView === 'stock' && <StockManagement stockItems={stockItems} setStockItems={setStockItems} stockCategories={stockCategories} setStockCategories={setStockCategories} stockUnits={stockUnits} setStockUnits={setStockUnits} />}
                </main>

                <div className="pb-16 md:pb-0"></div>
                <BottomNavBar items={bottomNavItems} currentView={currentView as View} onViewChange={setCurrentView} />

            </div>
            
            {/* Modals */}
            <ItemCustomizationModal isOpen={modalState.isCustomization} onClose={() => setModalState(p=>({...p, isCustomization: false}))} item={itemToCustomize} onConfirm={handleConfirmCustomization} />
            <MenuItemModal isOpen={modalState.isMenuItem} onClose={() => setModalState(p=>({...p, isMenuItem: false}))} onSave={handleSaveMenuItem} itemToEdit={itemToEdit} categories={categories} onAddCategory={(name) => setCategories(p => [...p, name])} />
            <OrderSuccessModal isOpen={modalState.isOrderSuccess} onClose={() => setModalState(p=>({...p, isOrderSuccess: false}))} orderId={lastPlacedOrderId ?? 0} />
            <TableBillModal isOpen={modalState.isTableBill} onClose={() => setModalState(p=>({...p, isTableBill: false}))} order={orderForModal as ActiveOrder | null} onInitiatePayment={(order) => { setOrderForModal(order); setModalState(p=>({...p, isTableBill: false, isPayment: true})); }} onInitiateMove={(order) => { setOrderForModal(order); setModalState(p=>({...p, isTableBill: false, isMoveTable: true})); }} onSplit={(order) => { setOrderForModal(order); setModalState(p=>({...p, isTableBill: false, isSplitBill: true})); }} isEditMode={isEditMode} onUpdateOrder={(id, items, customerCount) => { setActiveOrders(p => p.map(o => o.id === id ? {...o, items, customerCount} : o)); setModalState(p=>({...p, isTableBill: false})); }} currentUser={currentUser} onInitiateCancel={(order) => { setOrderForModal(order); setModalState(p=>({...p, isTableBill: false, isCancelOrder: true})); }} />
            <PaymentModal isOpen={modalState.isPayment} onClose={() => setModalState(p=>({...p, isPayment: false}))} order={orderForModal as ActiveOrder | null} onConfirmPayment={handleConfirmPayment} qrCodeUrl={qrCodeUrl} isEditMode={isEditMode} onOpenSettings={() => setModalState(p => ({...p, isSettings: true}))} isConfirmingPayment={isConfirmingPayment}/>
            <PaymentSuccessModal isOpen={modalState.isPaymentSuccess} onClose={(_shouldPrint) => {setModalState(p=>({...p, isPaymentSuccess: false}));}} orderId={lastPlacedOrderId ?? 0} />
            <SettingsModal isOpen={modalState.isSettings} onClose={() => setModalState(p=>({...p, isSettings: false}))} onSave={(qr, sound, printer, open, close) => { setQrCodeUrl(qr); setNotificationSoundUrl(sound); setPrinterConfig(printer); setOpeningTime(open); setClosingTime(close); setModalState(p=>({...p, isSettings: false}));}} currentQrCodeUrl={qrCodeUrl} currentNotificationSoundUrl={notificationSoundUrl} currentPrinterConfig={printerConfig} currentOpeningTime={openingTime} currentClosingTime={closingTime} onSavePrinterConfig={setPrinterConfig} />
            <UserManagerModal isOpen={modalState.isUserManager} onClose={() => setModalState(p => ({...p, isUserManager: false}))} users={users} setUsers={setUsers} currentUser={currentUser} branches={branches} isEditMode={isEditMode} />
            <BranchManagerModal isOpen={modalState.isBranchManager} onClose={() => setModalState(p => ({...p, isBranchManager: false}))} branches={branches} setBranches={setBranches} />
            <CancelOrderModal isOpen={modalState.isCancelOrder} onClose={() => setModalState(p=>({...p, isCancelOrder: false}))} order={orderForModal as ActiveOrder | null} onConfirm={(order, reason, notes) => { const cancelled: CancelledOrder = {...order, status: 'cancelled', cancellationTime: Date.now(), cancelledBy: currentUser.username, cancellationReason: reason, cancellationNotes: notes}; setCancelledOrders(p => [...p, cancelled]); setActiveOrders(p => p.filter(o => o.id !== order.id)); setNotifiedOverdueOrders(prevSet => { const newSet = new Set(prevSet); newSet.delete(order.id); return newSet; }); setModalState(p=>({...p, isCancelOrder: false})); }} />
            <CashBillModal isOpen={modalState.isCashBill} onClose={() => setModalState(p=>({...p, isCashBill: false}))} order={orderForModal as CompletedOrder | null} restaurantName={restaurantName} logoUrl={logoUrl} />
            <SplitBillModal isOpen={modalState.isSplitBill} order={orderForModal as ActiveOrder | null} onClose={() => setModalState(p => ({ ...p, isSplitBill: false }))} onConfirmSplit={handleConfirmSplit} />
            <EditCompletedOrderModal isOpen={modalState.isEditCompleted} order={orderForModal as CompletedOrder | null} onClose={() => setModalState(p => ({ ...p, isEditCompleted: false }))} onSave={handleSaveCompletedOrder} menuItems={menuItems}/>
            <SplitCompletedBillModal isOpen={modalState.isSplitCompleted} order={orderForModal as CompletedOrder | null} onClose={() => setModalState(p => ({ ...p, isSplitCompleted: false }))} onConfirmSplit={(items) => { /* TODO */ }} />
            <MoveTableModal isOpen={modalState.isMoveTable} onClose={() => setModalState(p=>({...p, isMoveTable: false}))} order={orderForModal as ActiveOrder | null} tables={tables} activeOrders={activeOrders} onConfirmMove={(orderId, newTableId) => { const newTable = tables.find(t=>t.id === newTableId); if(!newTable) return; setActiveOrders(p => p.map(o => o.id === orderId ? {...o, tableName: newTable.name, floor: newTable.floor} : o)); setModalState(p=>({...p, isMoveTable: false})); }} />

        </div>
    );
}

export default App;
