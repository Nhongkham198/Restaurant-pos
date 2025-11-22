import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';

import { 
    DEFAULT_BRANCHES, 
    DEFAULT_CATEGORIES, 
    DEFAULT_MENU_ITEMS, 
    DEFAULT_TABLES, 
    DEFAULT_USERS, 
    DEFAULT_STOCK_CATEGORIES, 
    DEFAULT_STOCK_UNITS, 
    DEFAULT_STOCK_ITEMS,
    DEFAULT_FLOORS
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
    TakeawayCutleryOption,
    Reservation,
    LeaveRequest,
    StaffCall
} from './types';
import { useFirestoreSync } from './hooks/useFirestoreSync';
import { functionsService } from './services/firebaseFunctionsService';
import { printerService } from './services/printerService';
import { isFirebaseConfigured, db } from './firebaseConfig';
import { doc, runTransaction } from 'firebase/firestore';
import { getMessaging, getToken } from 'firebase/messaging';

import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Menu } from './components/Menu';
import { KitchenView } from './components/KitchenView';
import { TableLayout } from './components/TableLayout';
import { Dashboard } from './components/Dashboard';
import { SalesHistory } from './components/SalesHistory';
import { StockManagement } from './components/StockManagement';
import { LeaveCalendarView } from './components/LeaveCalendarView';
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
import { LeaveRequestModal } from './components/LeaveRequestModal';
import { MenuSearchModal } from './components/MenuSearchModal';

import Swal from 'sweetalert2';
import type { SubmitLeaveRequestPayload } from './services/firebaseFunctionsService';

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
    const [floors, setFloors] = useFirestoreSync<string[]>(branchId, 'floors', DEFAULT_FLOORS);
    const [activeOrders, setActiveOrders] = useFirestoreSync<ActiveOrder[]>(branchId, 'activeOrders', []);
    const [completedOrders, setCompletedOrders] = useFirestoreSync<CompletedOrder[]>(branchId, 'completedOrders', []);
    const [cancelledOrders, setCancelledOrders] = useFirestoreSync<CancelledOrder[]>(branchId, 'cancelledOrders', []);
    const [stockItems, setStockItems] = useFirestoreSync<StockItem[]>(branchId, 'stockItems', DEFAULT_STOCK_ITEMS);
    const [stockCategories, setStockCategories] = useFirestoreSync<string[]>(branchId, 'stockCategories', DEFAULT_STOCK_CATEGORIES);
    const [stockUnits, setStockUnits] = useFirestoreSync<string[]>(branchId, 'stockUnits', DEFAULT_STOCK_UNITS);
    const [printHistory, setPrintHistory] = useFirestoreSync<PrintHistoryEntry[]>(branchId, 'printHistory', []);
    const [staffCalls, setStaffCalls] = useFirestoreSync<StaffCall[]>(branchId, 'staffCalls', []);
    // Note: Leave requests are global (not branch specific in sync) but filtered by branchId
    const [leaveRequests, setLeaveRequests] = useFirestoreSync<LeaveRequest[]>(null, 'leaveRequests', []);

    // --- POS-SPECIFIC LOCAL STATE ---
    const [currentOrderItems, setCurrentOrderItems] = useState<OrderItem[]>([]);
    const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
    const [customerName, setCustomerName] = useState('');
    const [customerCount, setCustomerCount] = useState(1);
    const [selectedSidebarFloor, setSelectedSidebarFloor] = useState<string>('');
    const [notSentToKitchenDetails, setNotSentToKitchenDetails] = useState<{ reason: string; notes: string } | null>(null);

    useEffect(() => {
        if (floors && floors.length > 0) {
            if (!selectedSidebarFloor || !floors.includes(selectedSidebarFloor)) {
                setSelectedSidebarFloor(floors[0]);
            }
        } else {
            setSelectedSidebarFloor('');
        }
    }, [floors, selectedSidebarFloor]);


    // --- GENERAL SETTINGS STATE ---
    const [logoUrl, setLogoUrl] = useFirestoreSync<string | null>(branchId, 'logoUrl', null);
    const [restaurantName, setRestaurantName] = useFirestoreSync<string>(branchId, 'restaurantName', 'ชื่อร้านอาหาร');
    const [qrCodeUrl, setQrCodeUrl] = useFirestoreSync<string | null>(branchId, 'qrCodeUrl', null);
    const [notificationSoundUrl, setNotificationSoundUrl] = useFirestoreSync<string | null>(branchId, 'notificationSoundUrl', null);
    const [staffCallSoundUrl, setStaffCallSoundUrl] = useFirestoreSync<string | null>(branchId, 'staffCallSoundUrl', null);
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
        isCashBill: false, isSplitCompleted: false, isCustomization: false, isLeaveRequest: false,
        isMenuSearch: false
    });
    const [itemToEdit, setItemToEdit] = useState<MenuItem | null>(null);
    const [itemToCustomize, setItemToCustomize] = useState<MenuItem | null>(null);
    const [orderForModal, setOrderForModal] = useState<ActiveOrder | CompletedOrder | null>(null);
    const [lastPlacedOrderId, setLastPlacedOrderId] = useState<number | null>(null);
    const [notifiedOverdueOrders, setNotifiedOverdueOrders] = useState<Set<number>>(new Set());
    const [leaveRequestInitialDate, setLeaveRequestInitialDate] = useState<Date | null>(null);

    // --- ASYNC OPERATION STATE ---
    const [isPlacingOrder, setIsPlacingOrder] = useState(false);
    const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);

    // --- REFS ---
    const prevActiveOrdersRef = useRef<ActiveOrder[] | undefined>(undefined);
    const prevLeaveRequestsRef = useRef<LeaveRequest[] | undefined>(undefined);
    const notifiedCallIdsRef = useRef<Set<number>>(new Set());
    const staffCallAudioRef = useRef<HTMLAudioElement | null>(null);

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
    useEffect(() => {
        if (currentUser) {
            const foundUser = users.find(u => u.id === currentUser.id);
            if (foundUser) {
                if (JSON.stringify(foundUser) !== JSON.stringify(currentUser)) {
                    setCurrentUser(foundUser);
                }
            }
        }
    }, [users, currentUser]);

    // --- Push Notification Setup ---
    useEffect(() => {
        const setupPushNotifications = async (userToUpdate: User) => {
            if (!db || !('serviceWorker' in navigator) || !('PushManager' in window)) {
                console.log("Push notifications are not supported in this browser.");
                return;
            }

            try {
                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                    console.log('Notification permission granted.');
                    const messaging = getMessaging(db.app);
                    
                    // IMPORTANT: Replace with your key from Firebase Console > Project Settings > Cloud Messaging > Web Push certificates
                    const vapidKey = 'BMIo7v3beGbvOlEciEL3TN5lFAZBZ-52zkg-vqgo8gudi4QW4UyIR4HDEk17Q2pYb3FFDCgzyq5oYFKIGXGfpJU'; 
                    const currentToken = await getToken(messaging, { vapidKey });

                    if (currentToken) {
                        // Save the token to the user's profile if it's new or different
                        if (userToUpdate.fcmToken !== currentToken) {
                            console.log('New or updated FCM token found, saving to user profile:', currentToken);
                            setUsers(prevUsers =>
                                prevUsers.map(u =>
                                    u.id === userToUpdate.id ? { ...u, fcmToken: currentToken } : u
                                )
                            );
                        }
                    } else {
                        console.log('No registration token available. Request permission to generate one.');
                    }
                } else {
                    console.log('Unable to get permission to notify.');
                }
            } catch (err) {
                console.error('An error occurred while setting up push notifications.', err);
            }
        };

        if (currentUser && currentUser.role === 'kitchen') {
            // Only setup for kitchen staff
            setupPushNotifications(currentUser);
        }
    }, [currentUser, setUsers]);


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

    const totalItems = useMemo(() => currentOrderItems.reduce((sum, item) => sum + item.quantity, 0), [currentOrderItems]);

    // --- LEAVE BADGE LOGIC ---
    const leaveBadgeCount = useMemo(() => {
        if (!currentUser) return 0;
        
        // Admin sees all pending requests across all branches.
        if (currentUser.role === 'admin') {
            return leaveRequests.filter(req => req.status === 'pending').length;
        }
        
        // Branch Admin sees pending requests only for their allowed branches.
        if (currentUser.role === 'branch-admin') {
            return leaveRequests.filter(req => 
                req.status === 'pending' && 
                currentUser.allowedBranchIds?.includes(req.branchId)
            ).length;
        }

        return 0; // Regular staff don't approve, so no badge needed
    }, [leaveRequests, currentUser]);


    // --- KITCHEN NOTIFICATION EFFECT ---
    useEffect(() => {
        if (currentUser?.role === 'kitchen' && prevActiveOrdersRef.current) {
            const previousOrders = prevActiveOrdersRef.current;
            if (activeOrders.length > previousOrders.length) {
                const previousOrderIds = new Set(previousOrders.map(o => o.id));
                const newOrders = activeOrders.filter(o => !previousOrderIds.has(o.id) && o.status === 'waiting');

                if (newOrders.length > 0) {
                    if (notificationSoundUrl) {
                        const audio = new Audio(notificationSoundUrl);
                        audio.play().catch(error => console.error("Error playing notification sound:", error));
                    }
                    const orderToShow = newOrders[0];
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
        prevActiveOrdersRef.current = activeOrders;
    }, [activeOrders, currentUser, notificationSoundUrl]);

    // --- LEAVE REQUEST NOTIFICATION EFFECT ---
    useEffect(() => {
        if (prevLeaveRequestsRef.current && currentUser) {
            const prevRequests = prevLeaveRequestsRef.current;
            // Only notify if length increased (new request added)
            if (leaveRequests.length > prevRequests.length) {
                const prevIds = new Set(prevRequests.map(r => r.id));
                const newRequests = leaveRequests.filter(r => !prevIds.has(r.id));

                newRequests.forEach(req => {
                    let shouldNotify = false;
                    
                    // 1. Kalasin Branch (ID: 1) -> Only notify Admin
                    if (req.branchId === 1 && currentUser.role === 'admin') {
                        shouldNotify = true;
                    }
                    // 2. Other Branches -> Notify Branch Admin of that branch
                    else if (req.branchId !== 1 && currentUser.role === 'branch-admin' && currentUser.allowedBranchIds?.includes(req.branchId)) {
                        shouldNotify = true;
                    }

                    if (shouldNotify) {
                        Swal.fire({
                            title: '📝 มีคำขอวันลาใหม่',
                            html: `<b>${req.username}</b> ได้ส่งคำขอลา<br>เหตุผล: ${req.reason}`,
                            icon: 'info',
                            toast: true,
                            position: 'top-end',
                            showConfirmButton: false,
                            timer: 5000,
                            timerProgressBar: true
                        });
                    }
                });
            }
        }
        prevLeaveRequestsRef.current = leaveRequests;
    }, [leaveRequests, currentUser]);

    // Reset the "seen" notifications when the user changes, so a new user can see pending calls.
    useEffect(() => {
        notifiedCallIdsRef.current.clear();
    }, [currentUser]);

    // --- STAFF CALL NOTIFICATION EFFECT ---
    useEffect(() => {
        const handleNewCalls = async () => {
            if (isCustomerMode || !currentUser || !['pos', 'kitchen', 'admin', 'branch-admin'].includes(currentUser.role)) {
                return;
            }
    
            const unnotifiedCalls = staffCalls.filter(c => !notifiedCallIdsRef.current.has(c.id));
    
            if (unnotifiedCalls.length > 0) {
                const callToNotify = unnotifiedCalls[0];
                notifiedCallIdsRef.current.add(callToNotify.id);
    
                if (staffCallSoundUrl) {
                    if (!staffCallAudioRef.current) {
                        staffCallAudioRef.current = new Audio(staffCallSoundUrl);
                        staffCallAudioRef.current.loop = true;
                    }
                    if (staffCallAudioRef.current.paused) {
                        staffCallAudioRef.current.play().catch(e => console.error("Error playing staff call sound:", e));
                    }
                }
    
                const result = await Swal.fire({
                    title: '🔔 ลูกค้าเรียกพนักงาน!',
                    html: `โต๊ะ <b>${callToNotify.tableName}</b> (คุณ ${callToNotify.customerName})<br/>ต้องการความช่วยเหลือ`,
                    icon: 'info',
                    confirmButtonText: 'รับทราบ',
                    timer: 15000,
                    timerProgressBar: true,
                    allowOutsideClick: false,
                    allowEscapeKey: false
                });
    
                if (result.isConfirmed || result.dismiss === Swal.DismissReason.timer) {
                    setStaffCalls(prev => {
                        const updatedCalls = prev.filter(call => call.id !== callToNotify.id);
                        if (updatedCalls.length === 0 && staffCallAudioRef.current) {
                            staffCallAudioRef.current.pause();
                            staffCallAudioRef.current.currentTime = 0;
                        }
                        return updatedCalls;
                    });
                }
            }
    
            const currentCallIds = new Set(staffCalls.map(c => c.id));
            notifiedCallIdsRef.current.forEach(id => {
                if (!currentCallIds.has(id)) {
                    notifiedCallIdsRef.current.delete(id);
                }
            });
        };
    
        handleNewCalls();
    }, [staffCalls, currentUser, isCustomerMode, staffCallSoundUrl, setStaffCalls]);


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
    
        const intervalId = setInterval(checkOverdueOrders, 30 * 1000);
        return () => clearInterval(intervalId);
    }, [activeOrders, notifiedOverdueOrders, setActiveOrders, isCustomerMode]);


    // --- CORE LOGIC HANDLERS ---
    const handleLogin = (username: string, password: string) => {
        let user = users.find(u => u.username === username && u.password === password);
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
        if (staffCallAudioRef.current) {
            staffCallAudioRef.current.pause();
            staffCallAudioRef.current.currentTime = 0;
        }
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
        const validatedItems = items.map(cartItem => {
            const masterItem = menuItems.find(m => m.id === cartItem.id);
            if (!masterItem) {
                console.warn(`Security Warning: Item ID ${cartItem.id} not found in master menu.`);
                return cartItem; 
            }
            let optionsTotal = 0;
            const validatedOptions = cartItem.selectedOptions.map(cartOpt => {
                let masterOption = null;
                masterItem.optionGroups?.forEach(group => {
                    const found = group.options.find(o => o.id === cartOpt.id);
                    if (found) masterOption = found;
                });
                if (masterOption) {
                    optionsTotal += masterOption.priceModifier;
                    return { ...masterOption };
                }
                return cartOpt;
            });
            return {
                ...cartItem,
                name: masterItem.name,
                price: masterItem.price,
                finalPrice: masterItem.price + optionsTotal,
                selectedOptions: validatedOptions
            };
        });

        const allOrders = [...activeOrders, ...completedOrders, ...cancelledOrders];
        const todayDate = new Date();
        let newOrderNumber = 1;

        const todayOrders = allOrders.filter(o => isSameDay(new Date(o.orderTime), todayDate));

        if (todayOrders.length > 0) {
            newOrderNumber = Math.max(0, ...todayOrders.map(o => o.orderNumber)) + 1;
        }
        
        const subtotal = validatedItems.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
        const taxAmount = isTaxEnabled ? subtotal * (taxRate / 100) : 0;
        
        const newOrder: ActiveOrder = {
            id: Date.now(),
            orderNumber: newOrderNumber,
            tableName: table.name,
            customerName: cName,
            floor: table.floor,
            customerCount: cCount,
            items: validatedItems,
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
            true 
        );
        
        Swal.fire({
            icon: 'success',
            title: 'ส่งออเดอร์เรียบร้อย!',
            text: `ออเดอร์ #${String(newOrderNum).padStart(3, '0')} กำลังถูกจัดเตรียม`,
            timer: 3000,
            showConfirmButton: false
        });
    };

    const handleStaffCall = (table: Table, cName: string) => {
        if (!selectedBranch) return;
        const newCall: StaffCall = {
            id: Date.now(),
            tableId: table.id,
            tableName: table.name,
            customerName: cName,
            branchId: selectedBranch.id,
            timestamp: Date.now()
        };
        setStaffCalls(prev => [newCall, ...prev.slice(0, 49)]); // Keep last 50 calls
    };

    const generateTablePin = (tableId: number) => {
        const pin = Math.floor(Math.random() * 900 + 100).toString();
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

        setTables(prevTables => prevTables.map(t => {
            if (t.name === orderToComplete.tableName && t.floor === orderToComplete.floor) {
                const updatedTable = { ...t };
                delete updatedTable.activePin;
                if (updatedTable.reservation) {
                     delete updatedTable.reservation;
                }
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

    const handleClosePaymentSuccess = async (shouldPrint: boolean) => {
        setModalState(p => ({ ...p, isPaymentSuccess: false }));
    
        if (shouldPrint) {
            if (!printerConfig?.cashier?.ipAddress) {
                Swal.fire('ไม่ได้ตั้งค่า', 'กรุณาตั้งค่า IP เครื่องพิมพ์ใบเสร็จก่อน', 'warning');
                return;
            }
    
            const orderToPrint = completedOrders.find(o => o.orderNumber === lastPlacedOrderId);
            if (!orderToPrint) {
                console.error("Could not find completed order to print receipt for:", lastPlacedOrderId);
                Swal.fire('ผิดพลาด', 'ไม่พบข้อมูลออเดอร์สำหรับพิมพ์ใบเสร็จ', 'error');
                return;
            }
            
            const logEntry: PrintHistoryEntry = {
                id: Date.now(),
                timestamp: Date.now(),
                orderNumber: orderToPrint.orderNumber,
                tableName: orderToPrint.tableName,
                printedBy: currentUser?.username ?? 'N/A',
                printerType: 'receipt',
                status: 'success', // optimistic
                errorMessage: null,
                orderItemsPreview: orderToPrint.items.map(i => `${i.name} x${i.quantity}`),
                isReprint: false,
            };
    
            try {
                await printerService.printReceipt(orderToPrint, printerConfig.cashier, restaurantName);
                setPrintHistory(prev => [logEntry, ...prev.slice(0, 99)]);
            } catch (err: any) {
                logEntry.status = 'failed';
                logEntry.errorMessage = err.message;
                setPrintHistory(prev => [logEntry, ...prev.slice(0, 99)]);
                Swal.fire({
                    icon: 'error',
                    title: 'พิมพ์ใบเสร็จไม่สำเร็จ',
                    text: err.message || 'ไม่สามารถเชื่อมต่อกับ Print Server ได้',
                });
            }
        }
    };
    
    const handleUpdateTableReservation = (tableId: number, reservation: Reservation | null) => {
        setTables(prev => prev.map(t => t.id === tableId ? { ...t, reservation } : t));
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
        setMenuItems(prevItems => {
            const itemsMap = new Map(prevItems.map(item => [item.id, item]));
            importedItems.forEach(item => {
                itemsMap.set(item.id, item);
            });
            return Array.from(itemsMap.values());
        });
    
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
    
        const orderAsActive = orderToReprint as ActiveOrder; 
        
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

    const handleSaveLeaveRequest = async (request: Omit<LeaveRequest, 'id' | 'status' | 'branchId'>) => {
        if (!selectedBranch || !selectedBranch.id) {
            Swal.fire('เกิดข้อผิดพลาด', 'กรุณาเลือกสาขาก่อนส่งคำขอลา', 'error');
            return;
        }
        
        const newId = Date.now();
        const branchId = selectedBranch.id;
        
        const newRequest: LeaveRequest = {
            ...request,
            id: newId,
            status: 'pending',
            branchId: branchId
        };

        try {
            const payload: SubmitLeaveRequestPayload = {
                userId: request.userId,
                username: request.username,
                startDate: request.startDate,
                endDate: request.endDate,
                type: request.type,
                reason: request.reason,
                branchId: branchId,
                isHalfDay: request.isHalfDay
            };
            const result = await functionsService.submitLeaveRequest(payload);
            
            if (!result.success) {
                throw new Error(result.error || "Backend indicated failure");
            }
        } catch (e: any) {
            console.warn("Backend submit unavailable or failed, falling back to atomic DB write.", e);
            const docRef = doc(db, 'leaveRequests', 'data');
            try {
                await runTransaction(db, async (transaction) => {
                    const docSnap = await transaction.get(docRef);
                    const currentRequests = docSnap.exists() ? (docSnap.data().value as LeaveRequest[]) : [];
                    if (currentRequests.some(r => r.id === newRequest.id)) {
                        return; // Prevent duplicate on retry
                    }
                    const updatedRequests = [...currentRequests, newRequest];
                    transaction.set(docRef, { value: updatedRequests });
                });
            } catch (transactionError) {
                console.error("Leave request fallback transaction failed: ", transactionError);
                Swal.fire('เกิดข้อผิดพลาดร้ายแรง', 'ไม่สามารถบันทึกข้อมูลการลาได้ โปรดลองอีกครั้ง', 'error');
                return;
            }
        }

        setModalState(prev => ({ ...prev, isLeaveRequest: false }));
        Swal.fire({
            icon: 'success',
            title: 'บันทึกการลาแล้ว',
            text: 'รอการอนุมัติจากหัวหน้างาน',
            timer: 2000,
            showConfirmButton: false
        });
    };

    const handleUpdateLeaveStatus = async (requestId: number, status: 'approved' | 'rejected') => {
        try {
            const result = await functionsService.updateLeaveStatus({
                requestId,
                status,
                approverId: currentUser?.id || 0
            });
            if (!result.success) {
                throw new Error(result.error || "Backend indicated failure");
            }
        } catch (e: any) {
            console.warn("Backend update unavailable or failed, falling back to atomic DB write.", e);
            const docRef = doc(db, 'leaveRequests', 'data');
            try {
               await runTransaction(db, async (transaction) => {
                   const docSnap = await transaction.get(docRef);
                   if (!docSnap.exists()) {
                       throw "Document does not exist!";
                   }
                   const currentRequests = docSnap.data().value as LeaveRequest[];
                   const updatedRequests = currentRequests.map(req => 
                       req.id === requestId ? { ...req, status } : req
                   );
                   transaction.update(docRef, { value: updatedRequests });
               });
            } catch (transactionError) {
               console.error("Leave status update fallback transaction failed: ", transactionError);
               Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถอัปเดตสถานะการลาได้', 'error');
            }
        }
    };

    const handleDeleteLeaveRequest = async (requestId: number): Promise<boolean> => {
        try {
            const result = await functionsService.deleteLeaveRequest({ requestId });
            if (!result.success) {
                throw new Error(result.error || "Backend indicated failure");
            }
            return true;
        } catch (e: any) {
            console.warn("Backend delete unavailable or failed, falling back to atomic DB write.", e);
            const docRef = doc(db, 'leaveRequests', 'data');
            try {
                await runTransaction(db, async (transaction) => {
                    const docSnap = await transaction.get(docRef);
                    if (!docSnap.exists()) {
                        throw new Error("Leave requests document not found.");
                    }
                    const currentData = docSnap.data();
                    if (!currentData || !Array.isArray(currentData.value)) {
                        throw new Error("Invalid data structure in leave requests document.");
                    }
                    const currentRequests = currentData.value as LeaveRequest[];
                    const updatedRequests = currentRequests.filter(req => req.id !== requestId);
                    transaction.update(docRef, { value: updatedRequests });
                });
                return true; // Success from fallback
            } catch (transactionError) {
                console.error("Leave delete fallback transaction failed: ", transactionError);
                Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถลบข้อมูลได้', 'error');
                return false; // Failure from fallback
            }
        }
    };
    
    // --- FLOOR & TABLE MANAGEMENT HANDLERS ---
    const handleAddFloor = async () => {
        const { value: floorName } = await Swal.fire({
            title: 'เพิ่มชั้นใหม่',
            input: 'text',
            inputPlaceholder: 'ชื่อชั้น (เช่น ชั้น 3, โซนสวน)',
            showCancelButton: true,
            confirmButtonText: 'เพิ่ม',
            cancelButtonText: 'ยกเลิก',
            inputValidator: (value) => {
                if (!value) return 'กรุณาใส่ชื่อชั้น';
                if (floors.includes(value)) return 'ชื่อชั้นนี้มีอยู่แล้ว';
            }
        });
        if (floorName) {
            setFloors(prev => [...prev, floorName]);
        }
    };

    const handleRemoveFloor = async (floorToRemove: string) => {
        if (tables.some(table => table.floor === floorToRemove)) {
            Swal.fire('ไม่สามารถลบได้', `กรุณาย้ายหรือลบโต๊ะทั้งหมดใน "${floorToRemove}" ก่อน`, 'error');
            return;
        }
        const result = await Swal.fire({
            title: `ลบชั้น "${floorToRemove}"?`,
            text: 'การกระทำนี้ไม่สามารถย้อนกลับได้',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            confirmButtonText: 'ใช่, ลบเลย'
        });
        if (result.isConfirmed) {
            setFloors(prev => prev.filter(f => f !== floorToRemove));
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
        
        const subItems: NavItem[] = [
            { id: 'leave', label: 'วันลา', view: 'leave', badge: leaveBadgeCount, icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" /></svg>},
        ];

        if (currentUser?.role === 'admin' || currentUser?.role === 'branch-admin') {
            subItems.push({ id: 'dashboard', label: 'Dashboard', view: 'dashboard', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1-1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" /></svg>});
            subItems.push({ id: 'history', label: 'ประวัติ', view: 'history', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>});
            subItems.push({ id: 'stock', label: 'สต็อก', view: 'stock', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>});
        }
        
        items.push({ 
            id: 'more', 
            label: 'เพิ่มเติม', 
            icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" /></svg>,
            subItems: subItems,
        });
        
        return items;

    }, [currentUser, kitchenBadgeCount, tablesBadgeCount, leaveBadgeCount]);


    // Additional handlers for completing the component
    const handleStartCooking = (orderId: number) => {
        setActiveOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'cooking', cookingStartTime: Date.now() } : o));
    };
    const handleServeOrder = (orderId: number) => {
        setActiveOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'served' } : o));
    };
    const handleUpdateCategory = (oldName: string, newName: string) => {
        setCategories(prev => prev.map(c => c === oldName ? newName : c));
        setMenuItems(prev => prev.map(item => item.category === oldName ? { ...item, category: newName } : item));
    };
    const handleDeleteCategory = (name: string) => {
        setCategories(prev => prev.filter(c => c !== name));
    };
    const handleAddCategory = (name: string) => {
        setCategories(prev => {
            if (prev.includes(name)) return prev;
            const newCats = [...prev.filter(c => c !== 'ทั้งหมด'), name].sort();
            return ['ทั้งหมด', ...newCats];
        });
    };
    const handleCartQuantityChange = (cartItemId: string, newQuantity: number) => {
        if (newQuantity <= 0) {
            handleRemoveFromCart(cartItemId);
        } else {
            setCurrentOrderItems(prev => prev.map(i => i.cartItemId === cartItemId ? { ...i, quantity: newQuantity } : i));
        }
    };
    const handleRemoveFromCart = (cartItemId: string) => {
        setCurrentOrderItems(prev => prev.filter(i => i.cartItemId !== cartItemId));
    };
    const handleToggleTakeaway = (cartItemId: string, isTakeaway: boolean, cutlery?: TakeawayCutleryOption[], notes?: string) => {
        setCurrentOrderItems(prev => prev.map(item =>
            item.cartItemId === cartItemId
                ? { ...item, isTakeaway, takeawayCutlery: cutlery, takeawayCutleryNotes: notes }
                : item
        ));
    };
    const handleAddNewTable = (floor: string) => {
        setTables(prev => {
            const maxId = Math.max(0, ...prev.map(t => t.id));
            const tablesOnFloor = prev.filter(t => t.floor === floor);
            const newTableName = `${floor} ${tablesOnFloor.length + 1}`;
            return [...prev, { id: maxId + 1, name: newTableName, floor }];
        });
    };
    const handleRemoveLastTable = (floor: string) => {
        setTables(prev => {
            const tablesOnFloor = prev.filter(t => t.floor === floor).sort((a,b) => a.id - b.id);
            if (tablesOnFloor.length === 0) return prev;
            const lastTableId = tablesOnFloor[tablesOnFloor.length - 1].id;
            return prev.filter(t => t.id !== lastTableId);
        });
    };
    const handleDeleteHistory = (completedIds: number[], cancelledIds: number[], printIds: number[]) => {
        if (completedIds.length > 0) setCompletedOrders(prev => prev.filter(o => !completedIds.includes(o.id)));
        if (cancelledIds.length > 0) setCancelledOrders(prev => prev.filter(o => !cancelledIds.includes(o.id)));
        if (printIds.length > 0) setPrintHistory(prev => prev.filter(p => !printIds.includes(p.id)));
    };
     const handleUpdateCurrentUser = (updates: Partial<User>) => {
        if (currentUser) {
            const updatedUser = { ...currentUser, ...updates };
            setCurrentUser(updatedUser);
            setUsers(prev => prev.map(u => u.id === currentUser.id ? updatedUser : u));
        }
    };


    // --- RENDER LOGIC ---

    if (isCustomerMode) {
        const tableForCustomer = tables.find(t => t.id === customerTableId);
        if (!selectedBranch || !tableForCustomer) {
            return <div className="h-screen w-screen flex items-center justify-center bg-gray-100">กำลังโหลดข้อมูลลูกค้า...</div>;
        }
        return (
            <CustomerView 
                table={tableForCustomer}
                menuItems={menuItems}
                categories={categories}
                activeOrders={activeOrders.filter(o => o.tableName === tableForCustomer.name && o.floor === tableForCustomer.floor)}
                allBranchOrders={activeOrders}
                onPlaceOrder={handleCustomerPlaceOrder}
                onStaffCall={handleStaffCall}
            />
        );
    }
    
    if (!currentUser) {
        return <LoginScreen onLogin={handleLogin} />;
    }

    if (!selectedBranch && (currentUser.role !== 'admin' || branches.length > 0)) {
       if ((currentUser.allowedBranchIds && currentUser.allowedBranchIds.length > 0) || currentUser.role === 'admin') {
            return (
                <BranchSelectionScreen
                    currentUser={currentUser}
                    branches={branches}
                    onSelectBranch={setSelectedBranch}
                    onManageBranches={() => setModalState(p => ({ ...p, isBranchManager: true }))}
                    onLogout={handleLogout}
                />
            );
       }
    }

    const renderView = () => {
        switch (currentView) {
            case 'kitchen':
                return <KitchenView activeOrders={activeOrders} onStartCooking={handleStartCooking} onCompleteOrder={handleServeOrder} />;
            case 'tables':
                return <TableLayout tables={tables} activeOrders={activeOrders} onTableSelect={setSelectedTableId} onShowBill={(orderId) => { setOrderForModal(activeOrders.find(o => o.id === orderId) || null); setModalState(p => ({ ...p, isTableBill: true })); }} onGeneratePin={generateTablePin} currentUser={currentUser} printerConfig={printerConfig} floors={floors} />;
            case 'dashboard':
                return <Dashboard completedOrders={completedOrders} cancelledOrders={cancelledOrders} openingTime={openingTime || '10:00'} closingTime={closingTime || '22:00'} />;
            case 'history':
                return <SalesHistory completedOrders={completedOrders} cancelledOrders={cancelledOrders} printHistory={printHistory} onReprint={handleReprint} onSplitOrder={(order) => { setOrderForModal(order); setModalState(p => ({ ...p, isSplitCompleted: true })); }} isEditMode={isEditMode} onEditOrder={(order) => { setOrderForModal(order); setModalState(p => ({ ...p, isEditCompleted: true })); }} onInitiateCashBill={(order) => { setOrderForModal(order); setModalState(p => ({ ...p, isCashBill: true })); }} onDeleteHistory={handleDeleteHistory} />;
            case 'stock':
                return <StockManagement stockItems={stockItems} setStockItems={setStockItems} stockCategories={stockCategories} setStockCategories={setStockCategories} stockUnits={stockUnits} setStockUnits={setStockUnits} />;
            case 'leave':
                return <LeaveCalendarView leaveRequests={leaveRequests} currentUser={currentUser} onOpenRequestModal={(date) => { setLeaveRequestInitialDate(date || null); setModalState(p => ({ ...p, isLeaveRequest: true })); }} branches={branches} onUpdateStatus={handleUpdateLeaveStatus} onDeleteRequest={handleDeleteLeaveRequest} selectedBranch={selectedBranch} />;
            case 'pos':
            default:
                return (
                     <div className="flex flex-col md:flex-row h-full relative">
                        {/* Sidebar Toggle Button - Desktop Only */}
                        <div className="absolute top-1/2 -translate-y-1/2 right-0 z-20 hidden md:block transition-all duration-300" style={{ right: isOrderSidebarVisible ? '420px' : '0px' }}>
                            <button
                                onClick={() => setIsOrderSidebarVisible(!isOrderSidebarVisible)}
                                className="relative w-8 h-16 bg-gray-700 text-white rounded-l-lg hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-center"
                                title={isOrderSidebarVisible ? "ซ่อนรายการ" : "แสดงรายการ"}
                            >
                                {isOrderSidebarVisible ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                )}
                                {!isOrderSidebarVisible && totalItems > 0 && (
                                    <span className="absolute -top-2 -left-4 flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-base font-bold text-white border-2 border-white">
                                        {totalItems > 99 ? '99+' : totalItems}
                                    </span>
                                )}
                            </button>
                        </div>
                        {/* Menu - Hidden on mobile */}
                        <div className="hidden md:block md:flex-1 overflow-hidden">
                            <Menu 
                                menuItems={menuItems} 
                                setMenuItems={setMenuItems}
                                categories={categories}
                                onSelectItem={handleSelectItem}
                                isEditMode={isEditMode}
                                onEditItem={handleOpenItemModal}
                                onAddNewItem={handleAddNewItem}
                                onDeleteItem={handleDeleteMenuItem}
                                onUpdateCategory={handleUpdateCategory}
                                onDeleteCategory={handleDeleteCategory}
                                onAddCategory={handleAddCategory}
                                onImportMenu={handleImportMenu}
                            />
                        </div>
                        {/* Sidebar Wrapper for correct scrolling on mobile */}
                        <div className="flex-1 md:flex-initial min-h-0">
                           {/* Show Sidebar on mobile, or on desktop if toggled visible */}
                            <div className="md:hidden h-full">
                                <Sidebar 
                                    currentOrderItems={currentOrderItems}
                                    onQuantityChange={handleCartQuantityChange}
                                    onRemoveItem={handleRemoveFromCart}
                                    onToggleTakeaway={handleToggleTakeaway}
                                    onClearOrder={clearPosState}
                                    onPlaceOrder={handlePlaceOrder}
                                    isPlacingOrder={isPlacingOrder}
                                    tables={tables}
                                    selectedTable={tables.find(t => t.id === selectedTableId) || null}
                                    onSelectTable={(id) => setSelectedTableId(id)}
                                    customerName={customerName}
                                    onCustomerNameChange={setCustomerName}
                                    customerCount={customerCount}
                                    onCustomerCountChange={setCustomerCount}
                                    isEditMode={isEditMode}
                                    onAddNewTable={handleAddNewTable}
                                    onRemoveLastTable={handleRemoveLastTable}
                                    floors={floors}
                                    selectedFloor={selectedSidebarFloor}
                                    onFloorChange={setSelectedSidebarFloor}
                                    onAddFloor={handleAddFloor}
                                    onRemoveFloor={handleRemoveFloor}
                                    sendToKitchen={sendToKitchen}
                                    onSendToKitchenChange={handleSendToKitchenChange}
                                    onUpdateReservation={handleUpdateTableReservation}
                                    onOpenSearch={() => setModalState(p => ({ ...p, isMenuSearch: true }))}
                                />
                            </div>
                            <div className="hidden md:block h-full">
                                {isOrderSidebarVisible && (
                                    <Sidebar 
                                        currentOrderItems={currentOrderItems}
                                        onQuantityChange={handleCartQuantityChange}
                                        onRemoveItem={handleRemoveFromCart}
                                        onToggleTakeaway={handleToggleTakeaway}
                                        onClearOrder={clearPosState}
                                        onPlaceOrder={handlePlaceOrder}
                                        isPlacingOrder={isPlacingOrder}
                                        tables={tables}
                                        selectedTable={tables.find(t => t.id === selectedTableId) || null}
                                        onSelectTable={(id) => setSelectedTableId(id)}
                                        customerName={customerName}
                                        onCustomerNameChange={setCustomerName}
                                        customerCount={customerCount}
                                        onCustomerCountChange={setCustomerCount}
                                        isEditMode={isEditMode}
                                        onAddNewTable={handleAddNewTable}
                                        onRemoveLastTable={handleRemoveLastTable}
                                        floors={floors}
                                        selectedFloor={selectedSidebarFloor}
                                        onFloorChange={setSelectedSidebarFloor}
                                        onAddFloor={handleAddFloor}
                                        onRemoveFloor={handleRemoveFloor}
                                        sendToKitchen={sendToKitchen}
                                        onSendToKitchenChange={handleSendToKitchenChange}
                                        onUpdateReservation={handleUpdateTableReservation}
                                        onOpenSearch={() => setModalState(p => ({ ...p, isMenuSearch: true }))}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                );
        }
    };
    
    return (
        <>
            <div className={`flex h-screen bg-gray-100 font-sans ${layoutType === 'admin' ? 'md:pl-20' : ''}`}>
                 {layoutType === 'admin' && (
                    <AdminSidebar
                        isCollapsed={isAdminSidebarCollapsed}
                        onToggleCollapse={() => setIsAdminSidebarCollapsed(!isAdminSidebarCollapsed)}
                        logoUrl={logoUrl}
                        restaurantName={restaurantName}
                        branchName={selectedBranch?.name || 'No Branch'}
                        currentUser={currentUser}
                        onViewChange={setCurrentView}
                        currentView={currentView}
                        onToggleEditMode={() => setIsEditMode(!isEditMode)}
                        isEditMode={isEditMode}
                        onOpenSettings={() => setModalState(p => ({ ...p, isSettings: true }))}
                        onOpenUserManager={() => setModalState(p => ({ ...p, isUserManager: true }))}
                        onManageBranches={() => setModalState(p => ({ ...p, isBranchManager: true }))}
                        onChangeBranch={() => setSelectedBranch(null)}
                        onLogout={handleLogout}
                        kitchenBadgeCount={kitchenBadgeCount}
                        tablesBadgeCount={tablesBadgeCount}
                        leaveBadgeCount={leaveBadgeCount}
                        onUpdateCurrentUser={handleUpdateCurrentUser}
                        onUpdateLogoUrl={setLogoUrl}
                        onUpdateRestaurantName={setRestaurantName}
                    />
                )}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {layoutType === 'staff' && (
                        <Header 
                            currentView={currentView}
                            onViewChange={setCurrentView}
                            isEditMode={isEditMode}
                            onToggleEditMode={() => setIsEditMode(!isEditMode)}
                            onOpenSettings={() => setModalState(p => ({ ...p, isSettings: true }))}
                            kitchenBadgeCount={kitchenBadgeCount}
                            tablesBadgeCount={tablesBadgeCount}
                            vacantTablesBadgeCount={vacantTablesBadgeCount}
                            leaveBadgeCount={leaveBadgeCount}
                            currentUser={currentUser}
                            onLogout={handleLogout}
                            onOpenUserManager={() => setModalState(p => ({ ...p, isUserManager: true }))}
                            logoUrl={logoUrl}
                            onLogoChangeClick={() => {}} // Placeholder
                            restaurantName={restaurantName}
                            onRestaurantNameChange={setRestaurantName}
                            branchName={selectedBranch?.name || 'No Branch'}
                            onChangeBranch={() => setSelectedBranch(null)}
                            onManageBranches={() => setModalState(p => ({...p, isBranchManager: true}))}
                        />
                    )}
                     <main className="flex-1 flex flex-col overflow-hidden">
                        {renderView()}
                     </main>
                    {layoutType === 'staff' && <div className="h-16 flex-shrink-0 md:hidden" />}
                </div>
            </div>
             {layoutType === 'staff' && (
                 <BottomNavBar 
                    items={bottomNavItems}
                    currentView={currentView}
                    onViewChange={setCurrentView}
                />
            )}
            
            {/* --- ALL MODALS --- */}
            <MenuItemModal isOpen={modalState.isMenuItem} onClose={() => setModalState(p => ({...p, isMenuItem: false}))} onSave={handleSaveMenuItem} itemToEdit={itemToEdit} categories={categories} onAddCategory={handleAddCategory} />
            <OrderSuccessModal isOpen={modalState.isOrderSuccess} onClose={() => setModalState(p => ({...p, isOrderSuccess: false}))} orderId={lastPlacedOrderId || 0} />
            <SplitBillModal isOpen={modalState.isSplitBill} onClose={() => setModalState(p => ({...p, isSplitBill: false}))} order={orderForModal as ActiveOrder} onConfirmSplit={handleConfirmSplit} />
            <TableBillModal isOpen={modalState.isTableBill} onClose={() => setModalState(p => ({...p, isTableBill: false}))} order={orderForModal as ActiveOrder} onInitiatePayment={(order) => { setOrderForModal(order); setModalState(p => ({...p, isTableBill: false, isPayment: true})); }} onInitiateMove={(order) => { setOrderForModal(order); setModalState(p => ({...p, isTableBill: false, isMoveTable: true})); }} onSplit={(order) => { setOrderForModal(order); setModalState(p => ({...p, isTableBill: false, isSplitBill: true})); }} isEditMode={isEditMode} onUpdateOrder={() => {}} currentUser={currentUser} onInitiateCancel={(order) => {setOrderForModal(order); setModalState(p => ({...p, isTableBill: false, isCancelOrder: true})); }} />
            <PaymentModal isOpen={modalState.isPayment} onClose={() => setModalState(p => ({...p, isPayment: false}))} order={orderForModal as ActiveOrder} onConfirmPayment={handleConfirmPayment} qrCodeUrl={qrCodeUrl} isEditMode={false} onOpenSettings={() => setModalState(p => ({...p, isSettings: true}))} isConfirmingPayment={isConfirmingPayment} />
            <PaymentSuccessModal isOpen={modalState.isPaymentSuccess} onClose={handleClosePaymentSuccess} orderId={lastPlacedOrderId || 0} />
            <SettingsModal isOpen={modalState.isSettings} onClose={() => setModalState(p => ({...p, isSettings: false}))} onSave={(qr, sound, staffSound, printer, open, close) => { setQrCodeUrl(qr); setNotificationSoundUrl(sound); setStaffCallSoundUrl(staffSound); setPrinterConfig(printer); setOpeningTime(open); setClosingTime(close); }} currentQrCodeUrl={qrCodeUrl} currentNotificationSoundUrl={notificationSoundUrl} currentStaffCallSoundUrl={staffCallSoundUrl} currentPrinterConfig={printerConfig} currentOpeningTime={openingTime} currentClosingTime={closingTime} onSavePrinterConfig={setPrinterConfig} />
            <EditCompletedOrderModal isOpen={modalState.isEditCompleted} onClose={() => setModalState(p => ({...p, isEditCompleted: false}))} order={orderForModal as CompletedOrder} onSave={handleSaveCompletedOrder} menuItems={menuItems} />
            <UserManagerModal isOpen={modalState.isUserManager} onClose={() => setModalState(p => ({...p, isUserManager: false}))} users={users} setUsers={setUsers} currentUser={currentUser!} branches={branches} isEditMode={isEditMode} />
            <BranchManagerModal isOpen={modalState.isBranchManager} onClose={() => setModalState(p => ({...p, isBranchManager: false}))} branches={branches} setBranches={setBranches} />
            <MoveTableModal isOpen={modalState.isMoveTable} onClose={() => setModalState(p => ({...p, isMoveTable: false}))} order={orderForModal as ActiveOrder} tables={tables} activeOrders={activeOrders} onConfirmMove={(orderId, newTableId) => { setActiveOrders(prev => prev.map(o => o.id === orderId ? {...o, tableName: tables.find(t=>t.id===newTableId)?.name || o.tableName, floor: tables.find(t=>t.id===newTableId)?.floor || o.floor} : o)); setModalState(p => ({...p, isMoveTable: false})); }} floors={floors} />
            <CancelOrderModal isOpen={modalState.isCancelOrder} onClose={() => setModalState(p => ({...p, isCancelOrder: false}))} order={orderForModal as ActiveOrder} onConfirm={(order, reason, notes) => { const cancelled: CancelledOrder = {...order, status: 'cancelled', cancellationTime: Date.now(), cancelledBy: currentUser?.username || 'N/A', cancellationReason: reason, cancellationNotes: notes}; setCancelledOrders(p => [...p, cancelled]); setActiveOrders(p => p.filter(o => o.id !== order.id)); setModalState(p => ({...p, isCancelOrder: false})); }} />
            <CashBillModal isOpen={modalState.isCashBill} onClose={() => setModalState(p => ({...p, isCashBill: false}))} order={orderForModal as CompletedOrder} restaurantName={restaurantName} logoUrl={logoUrl} />
            <ItemCustomizationModal isOpen={modalState.isCustomization} onClose={() => setModalState(p => ({...p, isCustomization: false}))} item={itemToCustomize} onConfirm={handleConfirmCustomization} />
            <LeaveRequestModal isOpen={modalState.isLeaveRequest} onClose={() => setModalState(p => ({...p, isLeaveRequest: false}))} currentUser={currentUser} onSave={handleSaveLeaveRequest} leaveRequests={leaveRequests} initialDate={leaveRequestInitialDate} />
            <SplitCompletedBillModal isOpen={modalState.isSplitCompleted} onClose={() => setModalState(p => ({...p, isSplitCompleted: false}))} order={orderForModal as CompletedOrder} onConfirmSplit={() => {}} />
            <MenuSearchModal 
                isOpen={modalState.isMenuSearch} 
                onClose={() => setModalState(p => ({ ...p, isMenuSearch: false }))} 
                menuItems={menuItems} 
                onSelectItem={handleSelectItem}
            />
            <LoginModal isOpen={false} onClose={() => {}} />
            <OrderTimeoutModal isOpen={false} onClose={() => {}} orderId={null} />
        </>
    );
};

export default App;