import React, { useState, useEffect, useMemo, useRef } from 'react';

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
    StaffCall,
    PaymentDetails
} from './types';
import { useFirestoreSync } from './hooks/useFirestoreSync';
import { functionsService } from './services/firebaseFunctionsService';
import { printerService } from './services/printerService';
import firebase from 'firebase/compat/app';
import 'firebase/compat/messaging';
import { db } from './firebaseConfig';

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
import { MergeBillModal } from './components/MergeBillModal';

import Swal from 'sweetalert2';
import type { SubmitLeaveRequestPayload, PlaceOrderPayload } from './services/firebaseFunctionsService';

declare global {
    interface Window {
        AndroidBridge?: {
            setPendingOrderCount: (count: number) => void;
        };
    }
}

const isSameDay = (d1: Date, d2: Date) => {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
};

const App: React.FC = () => {
    // --- AUTH & BRANCH STATE ---
    const [users, setUsers] = useFirestoreSync<User[]>(null, 'users', DEFAULT_USERS);
    const [branches, setBranches] = useFirestoreSync<Branch[]>(null, 'branches', DEFAULT_BRANCHES);
    const [currentUser, setCurrentUser] = useState<User | null>(() => {
        const storedUser = localStorage.getItem('currentUser');
        if (storedUser) {
            try {
                return JSON.parse(storedUser);
            } catch (e) {
                console.error('Error parsing stored user', e);
                localStorage.removeItem('currentUser');
                return null;
            }
        }
        return null;
    });
    const [selectedBranch, setSelectedBranch] = useState<Branch | null>(() => {
        const params = new URLSearchParams(window.location.search);
        const isCustomer = params.get('mode') === 'customer';

        if (isCustomer) {
            const customerBranch = localStorage.getItem('customerSelectedBranch');
            if (customerBranch) {
                try {
                    return JSON.parse(customerBranch);
                } catch (e) {
                    console.error('Error parsing customer branch from localStorage', e);
                    localStorage.removeItem('customerSelectedBranch');
                }
            }
        }
        
        const staffBranch = localStorage.getItem('selectedBranch');
        if (staffBranch) {
            try {
                return JSON.parse(staffBranch);
            } catch (e) {
                console.error('Error parsing staff branch from localStorage', e);
                localStorage.removeItem('selectedBranch');
            }
        }

        return null;
    });
    const [currentFcmToken, setCurrentFcmToken] = useState<string | null>(null);

    // --- VIEW & EDIT MODE STATE ---
    const [currentView, setCurrentView] = useState<View>(() => {
        const storedView = localStorage.getItem('currentView');
        if (storedView && ['pos', 'kitchen', 'tables', 'dashboard', 'history', 'stock', 'leave'].includes(storedView)) {
            return storedView as View;
        }
        return 'pos';
    });
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
    const [leaveRequests, setLeaveRequests] = useFirestoreSync<LeaveRequest[]>(null, 'leaveRequests', []);

    const cleanedTables = useMemo(() => {
        const normalizeString = (str: string | undefined | null): string => {
            if (!str) return '';
            return str.replace(/[\s\u200B-\u200D\uFEFF]/g, '').toLowerCase();
        };

        const uniqueTablesMap = new Map<string, Table>();
        (tables || []).forEach(table => {
            if (table && table.name && table.floor) {
                const key = `${normalizeString(table.name)}-${normalizeString(table.floor)}`;
                if (!uniqueTablesMap.has(key)) {
                    uniqueTablesMap.set(key, table);
                }
            }
        });
        return Array.from(uniqueTablesMap.values());
    }, [tables]);


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
        isMenuSearch: false, isMergeBill: false
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
    const [isCachingImages, setIsCachingImages] = useState(false);
    const imageCacheTriggeredRef = useRef(false);


    // --- REFS ---
    const prevActiveOrdersRef = useRef<ActiveOrder[] | undefined>(undefined);
    const isShowingLeaveAlertRef = useRef(false);
    const notifiedCallIdsRef = useRef<Set<number>>(new Set());
    const staffCallAudioRef = useRef<HTMLAudioElement | null>(null);
    const prevUserRef = useRef<User | null>(null);

    // --- SESSION PERSISTENCE ---
    useEffect(() => {
        if (currentUser && !isCustomerMode) {
            if (selectedBranch) {
                localStorage.setItem('selectedBranch', JSON.stringify(selectedBranch));
            } else {
                localStorage.removeItem('selectedBranch');
            }
        }
    }, [selectedBranch, currentUser, isCustomerMode]);

    useEffect(() => {
        localStorage.setItem('currentView', currentView);
    }, [currentView]);

    // --- PROACTIVE IMAGE CACHING ---
    useEffect(() => {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller && currentUser && !isCustomerMode && menuItems && menuItems.length > 0 && !imageCacheTriggeredRef.current) {
            
            setIsCachingImages(true);
            imageCacheTriggeredRef.current = true; // Mark as triggered for this session

            const imageUrls = [...new Set(menuItems.map(item => item.imageUrl).filter(Boolean))];
            if (imageUrls.length > 0) {
                console.log(`[App] Sending ${imageUrls.length} image URLs to Service Worker for precaching.`);
                navigator.serviceWorker.controller.postMessage({
                    type: 'CACHE_IMAGES',
                    urls: imageUrls
                });
            } else {
                setIsCachingImages(false);
            }
        }
    }, [menuItems, currentUser, isCustomerMode]);

    useEffect(() => {
        const handleServiceWorkerMessage = (event: MessageEvent) => {
            if (event.data && event.data.type === 'CACHE_IMAGES_COMPLETE') {
                console.log('[App] Received CACHE_IMAGES_COMPLETE from Service Worker.');
                setIsCachingImages(false);
            }
        };

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
        }

        return () => {
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
            }
        };
    }, []);



    // --- CUSTOMER MODE INITIALIZATION ---
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('mode') === 'customer' && params.get('tableId')) {
            setIsCustomerMode(true);
            setCustomerTableId(Number(params.get('tableId')));
        }
    }, []);

    useEffect(() => {
        if (isCustomerMode && !selectedBranch && branches.length > 0) {
            const branchForCustomer = branches[0];
            setSelectedBranch(branchForCustomer);
            localStorage.setItem('customerSelectedBranch', JSON.stringify(branchForCustomer));
        }
    }, [isCustomerMode, branches, selectedBranch]);


    // --- USER SYNC EFFECT ---
    useEffect(() => {
        if (currentUser && users && users.length > 0) {
            const isUsersLoadedFromFirestore = users !== DEFAULT_USERS;
    
            const foundUser = users.find(u => u.id === currentUser.id);
    
            if (foundUser) {
                if (JSON.stringify(foundUser) !== JSON.stringify(currentUser)) {
                    setCurrentUser(foundUser);
                }
            } else {
                if (isUsersLoadedFromFirestore) {
                    handleLogout();
                }
            }
        }
    }, [users, currentUser]);

    // --- AUDITOR VIEW ENFORCEMENT ---
    useEffect(() => {
        if (currentUser?.role === 'auditor') {
            const allowedViews: View[] = ['dashboard', 'history', 'leave'];
            if (!allowedViews.includes(currentView)) {
                setCurrentView('dashboard');
            }
        }
    }, [currentUser, currentView]);


    // --- Push Notification Setup ---
    useEffect(() => {
        const setupPushNotifications = async (userToUpdate: User) => {
            if (!db || !('serviceWorker' in navigator) || !('PushManager' in window)) {
                console.log("Push notifications are not supported in this browser.");
                return;
            }

            try {
                const messaging = firebase.messaging();

                messaging.onMessage((payload) => {
                    console.log('Message received. ', payload);
                    const notificationTitle = payload.notification?.title || 'แจ้งเตือนใหม่';
                    const notificationBody = payload.notification?.body || 'คุณมีข้อความใหม่';
                    Swal.fire({
                        title: notificationTitle,
                        text: notificationBody,
                        icon: 'info',
                    });
                });
                
                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                    console.log('Notification permission granted.');
                    
                    const vapidKey = 'BMIo7v3beGbvOlEciEL3TN5lFAZBZ-52zkg-vqgo8gudi4QW4UyIR4HDEk17Q2pYb3FFDCgzyq5oYFKIGXGfpJU'; 
                    const currentToken = await messaging.getToken({ vapidKey });
                    setCurrentFcmToken(currentToken);

                    if (currentToken) {
                        const existingTokens = userToUpdate.fcmTokens || [];
                        if (!existingTokens.includes(currentToken)) {
                            console.log('Adding new FCM token to user profile:', currentToken);
                            const newTokens = [...existingTokens, currentToken];
                            setUsers(prevUsers =>
                                prevUsers.map(u =>
                                    u.id === userToUpdate.id ? { ...u, fcmTokens: newTokens } : u
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
            setupPushNotifications(currentUser);
        }
    }, [currentUser, setUsers]);


    // --- COMPUTED VALUES ---
    const kitchenBadgeCount = useMemo(() => activeOrders.filter(o => o.status === 'waiting').length, [activeOrders]);
    const occupiedTablesCount = useMemo(() => new Set(activeOrders.map(o => `${o.tableName}-${o.floor}`)).size, [activeOrders]);
    const tablesBadgeCount = occupiedTablesCount > 0 ? occupiedTablesCount : 0;
    
    const vacantTablesBadgeCount = useMemo(() => {
        let totalTables = cleanedTables.length;
        if (totalTables > 6) totalTables = 6;
        return Math.max(0, totalTables - occupiedTablesCount);
    }, [cleanedTables.length, occupiedTablesCount]);


    const layoutType = useMemo(() => {
        if (currentUser?.role === 'admin' || currentUser?.role === 'branch-admin' || currentUser?.role === 'auditor') {
            return 'admin';
        }
        return 'staff';
    }, [currentUser]);

    const totalItems = useMemo(() => currentOrderItems.reduce((sum, item) => sum + item.quantity, 0), [currentOrderItems]);
    
    const canEdit = useMemo(() => {
        if (!currentUser) return false;
        const isPrivileged = currentUser.role === 'admin' || currentUser.role === 'branch-admin';
        return isEditMode && isPrivileged;
    }, [isEditMode, currentUser]);

    useEffect(() => {
        if (window.AndroidBridge?.setPendingOrderCount) {
            window.AndroidBridge.setPendingOrderCount(kitchenBadgeCount);
        }
    }, [kitchenBadgeCount]);

    const leaveBadgeCount = useMemo(() => {
        if (!currentUser) return 0;
        
        if (currentUser.role === 'admin') {
            return leaveRequests.filter(req => req.status === 'pending').length;
        }
        
        if (currentUser.role === 'branch-admin' || currentUser.role === 'auditor') {
            return leaveRequests.filter(req => 
                req.status === 'pending' && 
                currentUser.allowedBranchIds?.includes(req.branchId)
            ).length;
        }

        return 0;
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
                        html: `<b>โต๊ะ ${orderToShow.tableName}</b> (ออเดอร์ #${orderToShow.orderNumber.toString().padStart(3, '0')})`,
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

    // --- KITCHEN LOGIN REMINDER EFFECT ---
    useEffect(() => {
        if (currentUser?.role === 'kitchen' && prevUserRef.current?.id !== currentUser.id) {
            const waitingOrders = activeOrders.filter(o => o.status === 'waiting');
            if (waitingOrders.length > 0) {
                const oldestWaitingOrder = waitingOrders.sort((a, b) => a.orderTime - b.orderTime)[0];

                if (notificationSoundUrl) {
                    const audio = new Audio(notificationSoundUrl);
                    audio.play().catch(error => console.error("Error playing login reminder sound:", error));
                }
                
                Swal.fire({
                    title: '🔔 มีออเดอร์รออยู่ในคิว!',
                    html: `มี <b>${waitingOrders.length}</b> ออเดอร์ที่ยังไม่ได้รับ<br/>ออเดอร์แรกคือ <b>#${oldestWaitingOrder.orderNumber.toString().padStart(3, '0')}</b>`,
                    icon: 'info',
                    confirmButtonText: 'รับทราบ',
                    allowOutsideClick: false,
                    allowEscapeKey: false,
                });
            }
        }
        prevUserRef.current = currentUser;
    }, [currentUser, activeOrders, notificationSoundUrl]);

    // --- LEAVE REQUEST ACKNOWLEDGEMENT NOTIFICATION EFFECT (REWRITTEN) ---
    useEffect(() => {
        if (isShowingLeaveAlertRef.current || !currentUser || !['admin', 'branch-admin', 'auditor'].includes(currentUser.role)) {
            return;
        }
    
        const requestToNotify = leaveRequests
            .sort((a, b) => a.id - b.id) // Process oldest requests first
            .find(req => {
                const isAcknowledged = req.acknowledgedBy?.includes(currentUser.id);
                if (isAcknowledged) {
                    return false;
                }
                
                let isResponsible = false;
                if (currentUser.role === 'admin') {
                    isResponsible = true;
                } else if ((currentUser.role === 'branch-admin' || currentUser.role === 'auditor') && currentUser.allowedBranchIds?.includes(req.branchId)) {
                    isResponsible = true;
                }
    
                return isResponsible;
            });
    
        if (requestToNotify) {
            isShowingLeaveAlertRef.current = true;
    
            Swal.fire({
                title: '📝 มีคำขอวันลาใหม่',
                html: `<b>${requestToNotify.username}</b> ได้ส่งคำขอลา<br>เหตุผล: ${requestToNotify.reason}`,
                icon: 'info',
                confirmButtonText: 'รับทราบ',
                allowOutsideClick: false,
                allowEscapeKey: false,
            }).then(() => {
                setLeaveRequests(prev => prev.map(leave => {
                    if (leave.id === requestToNotify.id) {
                        const newAckBy = [...new Set([...(leave.acknowledgedBy || []), currentUser.id])];
                        return { ...leave, acknowledgedBy: newAckBy };
                    }
                    return leave;
                }));
                isShowingLeaveAlertRef.current = false;
            });
        }
    }, [leaveRequests, currentUser, setLeaveRequests]);

    useEffect(() => {
        notifiedCallIdsRef.current.clear();
    }, [currentUser]);

    // --- STAFF CALL NOTIFICATION & SOUND EFFECT ---
    useEffect(() => {
        const shouldPlayAudio = staffCalls.length > 0 && staffCallSoundUrl && !isCustomerMode && currentUser?.role !== 'admin' && currentUser?.role !== 'branch-admin' && currentUser?.role !== 'auditor';

        if (shouldPlayAudio) {
            if (!staffCallAudioRef.current) {
                staffCallAudioRef.current = new Audio(staffCallSoundUrl);
                staffCallAudioRef.current.loop = true;
            }
            if (staffCallAudioRef.current.paused) {
                staffCallAudioRef.current.play().catch(e => console.error("Error playing staff call sound:", e));
            }
        } else if (staffCallAudioRef.current && !staffCallAudioRef.current.paused) {
            staffCallAudioRef.current.pause();
            staffCallAudioRef.current.currentTime = 0;
        }

        return () => {
            if (staffCallAudioRef.current) {
                staffCallAudioRef.current.pause();
            }
        };
    }, [staffCalls.length, staffCallSoundUrl, isCustomerMode, currentUser]);

    useEffect(() => {
        const showNotifications = async () => {
            if (isCustomerMode || !currentUser || !['pos', 'kitchen', 'admin', 'branch-admin'].includes(currentUser.role)) {
                return;
            }
            if (currentUser.role === 'auditor') return;

            const unnotifiedCalls = staffCalls.filter(c => !notifiedCallIdsRef.current.has(c.id));

            if (unnotifiedCalls.length > 0) {
                const callToNotify = unnotifiedCalls[0];
                notifiedCallIdsRef.current.add(callToNotify.id); 

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
                        // If this is the last call being removed, imperatively stop the audio.
                        if (prev.length === 1 && staffCallAudioRef.current) {
                            staffCallAudioRef.current.pause();
                            staffCallAudioRef.current.currentTime = 0;
                        }
                        return prev.filter(call => call.id !== callToNotify.id);
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

        showNotifications();
    }, [staffCalls, currentUser, isCustomerMode, setStaffCalls]);


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
                        html: `ออเดอร์ #${order.orderNumber.toString().padStart(3, '0')} (โต๊ะ ${order.tableName})<br/>รออาหารนานเกิน ${ORDER_TIMEOUT_MINUTES} นาทีแล้ว`,
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
            localStorage.setItem('currentUser', JSON.stringify(user));
            setIsEditMode(false);
            if (user.role === 'kitchen') {
                setCurrentView('kitchen');
            } else if (user.role === 'auditor') {
                setCurrentView('dashboard');
            }
            else {
                setCurrentView('pos');
            }
            return { success: true };
        }
        return { success: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
    };
    
    const handleLogout = () => {
        if (currentUser && currentFcmToken) {
            const updatedTokens = (currentUser.fcmTokens || []).filter(token => token !== currentFcmToken);
            setUsers(prevUsers =>
                prevUsers.map(u =>
                    u.id === currentUser.id ? { ...u, fcmTokens: updatedTokens } : u
                )
            );
        }
        setCurrentUser(null);
        setSelectedBranch(null);
        localStorage.removeItem('currentUser');
        localStorage.removeItem('selectedBranch');
        localStorage.removeItem('customerSelectedBranch'); // Also clear customer branch
        setCurrentView('pos');
        setIsEditMode(false);
    };

    const handleSelectBranch = (branch: Branch) => {
        setSelectedBranch(branch);
        // Reset view to default when changing branch
        if (currentUser?.role === 'kitchen') {
            setCurrentView('kitchen');
        } else if (currentUser?.role === 'auditor') {
            setCurrentView('dashboard');
        } else {
            setCurrentView('pos');
        }
    };
    
    const handleAddItemToOrder = (item: MenuItem) => {
        setModalState(prev => ({ ...prev, isCustomization: true }));
        setItemToCustomize(item);
    };
    
    const handleConfirmCustomization = (itemToAdd: OrderItem) => {
        setCurrentOrderItems(prev => {
            const existingItem = prev.find(i => i.cartItemId === itemToAdd.cartItemId);
            if (existingItem) {
                return prev.map(i => i.cartItemId === itemToAdd.cartItemId ? { ...i, quantity: i.quantity + itemToAdd.quantity } : i);
            }
            return [...prev, itemToAdd];
        });
        setModalState(prev => ({ ...prev, isCustomization: false }));
        setItemToCustomize(null);
    };
    
    const resetOrderInfo = () => {
        setCurrentOrderItems([]);
        setSelectedTableId(null);
        setCustomerName('');
        setCustomerCount(1);
    };
    
    const handlePlaceOrder = async (items?: OrderItem[], name?: string, count?: number) => {
        setIsPlacingOrder(true);
        const orderItems = items || currentOrderItems;
        const finalCustomerName = name || customerName;
        const finalCustomerCount = count || customerCount;
        const table = tables.find(t => t.id === (isCustomerMode ? customerTableId : selectedTableId));

        if (!table || orderItems.length === 0 || !selectedBranch) {
            Swal.fire('ข้อมูลไม่ครบถ้วน', 'กรุณาเลือกโต๊ะและรายการอาหาร', 'warning');
            setIsPlacingOrder(false);
            return;
        }

        const subtotal = orderItems.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
        const taxAmount = isTaxEnabled ? subtotal * (taxRate / 100) : 0;
        
        const payload: PlaceOrderPayload = {
            branchId: selectedBranch.id.toString(),
            tableName: table.name,
            floor: table.floor,
            customerCount: finalCustomerCount,
            items: orderItems,
            orderType: 'dine-in', // Default for now
            taxRate: isTaxEnabled ? taxRate : 0,
            placedBy: isCustomerMode ? `ลูกค้า (${finalCustomerName})` : (currentUser?.username || 'Unknown'),
            sendToKitchen: sendToKitchen
        };

        let newOrder: ActiveOrder | null = null;
        let fallbackUsed = false;
        
        try {
            const result = await functionsService.placeOrder(payload);
            if (!result.success || !result.orderNumber) {
                throw new Error(result.error || "Backend returned unsuccessful response.");
            }
            newOrder = {
                ...payload,
                taxAmount,
                id: Date.now(),
                orderNumber: result.orderNumber,
                status: 'waiting',
                orderTime: Date.now(),
            };
            
        } catch (error: any) {
             fallbackUsed = true;
             console.warn("placeOrder function failed, falling back to client-side logic.", error);
             const nextOrderNumber = (Math.max(0, ...activeOrders.map(o => o.orderNumber), ...completedOrders.map(c => c.orderNumber)) + 1);
             newOrder = {
                ...payload,
                taxAmount,
                id: Date.now(),
                orderNumber: nextOrderNumber,
                status: 'waiting',
                orderTime: Date.now()
             };
             setActiveOrders(prev => [...prev, newOrder!]);
        }
        
        if (newOrder) {
            if (sendToKitchen && printerConfig?.kitchen) {
                const orderWithCorrectTax = { ...newOrder, taxAmount };
                try {
                    await printerService.printKitchenOrder(orderWithCorrectTax, printerConfig.kitchen);
                } catch (printError) {
                    Swal.fire('คำเตือน', 'ออเดอร์ถูกบันทึกแล้ว แต่ไม่สามารถสั่งพิมพ์ได้', 'warning');
                }
            }

            setLastPlacedOrderId(newOrder.orderNumber);
            setModalState(prev => ({ ...prev, isOrderSuccess: true }));
            if (!isCustomerMode) resetOrderInfo();
        }

        setIsPlacingOrder(false);
    };

    const handleConfirmPayment = async (orderId: number, paymentDetails: PaymentDetails) => {
        setIsConfirmingPayment(true);
        const orderToComplete = activeOrders.find(o => o.id === orderId);
        if (!orderToComplete || !selectedBranch) {
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่พบออเดอร์ที่ต้องการชำระเงิน', 'error');
            setIsConfirmingPayment(false);
            return;
        }

        const completedOrder: CompletedOrder = {
            ...(orderToComplete as Omit<ActiveOrder, 'status' | 'cookingStartTime' | 'isOverdue'>),
            status: 'completed',
            completionTime: Date.now(),
            paymentDetails
        };
        
        try {
            const payload = { branchId: selectedBranch.id.toString(), orderId: orderToComplete.id, paymentDetails };
            const result = await functionsService.confirmPayment(payload);
            if (!result.success) {
                throw new Error(result.error || "Backend returned unsuccessful response.");
            }
        } catch (error: any) {
            console.warn("confirmPayment function failed, falling back to client-side logic.", error);
            setCompletedOrders(prev => [...prev, completedOrder]);
            setActiveOrders(prev => prev.filter(o => o.id !== orderId));
        }

        const tableToClear = tables.find(t => t.name === orderToComplete.tableName && t.floor === orderToComplete.floor);
        if (tableToClear) {
            setTables(prevTables => 
                prevTables.map(t => 
                    t.id === tableToClear.id ? { ...t, activePin: undefined } : t
                )
            );
        }

        setModalState(prev => ({ ...prev, isTableBill: false, isPayment: false, isPaymentSuccess: true }));
        setOrderForModal(orderToComplete);
        setIsConfirmingPayment(false);
    };

    const handleCompleteOrder = (orderId: number) => {
        setActiveOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'served' } : o));
    };

    const handleStartCooking = (orderId: number) => {
        setActiveOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'cooking', cookingStartTime: Date.now() } : o));
    };
    
    // --- LEAVE MANAGEMENT ---
    const handleSaveLeaveRequest = async (request: Omit<LeaveRequest, 'id' | 'status' | 'branchId' | 'acknowledgedBy'>) => {
        if (!selectedBranch || !currentUser) {
            Swal.fire('ข้อผิดพลาด', 'ไม่สามารถระบุสาขาหรือผู้ใช้ได้', 'error');
            return;
        }
    
        const newRequest: LeaveRequest = {
            ...request,
            id: Date.now(),
            status: 'pending',
            branchId: selectedBranch.id,
            acknowledgedBy: [currentUser.id] // The user submitting it has "acknowledged" it.
        };
    
        // Optimistically update the UI first for a responsive feel
        setLeaveRequests(prev => [...prev, newRequest]);
        setModalState(prev => ({ ...prev, isLeaveRequest: false }));
        Swal.fire('ส่งคำขอสำเร็จ', 'คำขอวันลาของคุณถูกส่งเรียบร้อยแล้ว', 'success');
    
        try {
            await functionsService.submitLeaveRequest(newRequest);
        } catch (error: any) {
            console.warn("submitLeaveRequest function failed, using client-side fallback (already updated).", error);
        }
    };
    
    const handleUpdateLeaveStatus = async (requestId: number, status: 'approved' | 'rejected') => {
        if (!currentUser) return;
        
        // Optimistic update
        setLeaveRequests(prev => prev.map(req => req.id === requestId ? { ...req, status } : req));
        
        try {
            await functionsService.updateLeaveStatus({ requestId, status, approverId: currentUser.id });
        } catch (error: any) {
            console.warn("updateLeaveStatus function failed, using client-side fallback (already updated).", error);
        }
    };
    
    const handleDeleteLeaveRequest = async (requestId: number): Promise<boolean> => {
        // Optimistic update
        setLeaveRequests(prev => prev.filter(req => req.id !== requestId));
        
        try {
            await functionsService.deleteLeaveRequest({ requestId });
            return true;
        } catch (error: any) {
            console.warn("deleteLeaveRequest function failed, using client-side fallback (already updated).", error);
            return true;
        }
    };
    
    // --- HISTORY MANAGEMENT ---
    const onDeleteHistory = (completedIdsToDelete: number[], cancelledIdsToDelete: number[], printIdsToDelete: number[]) => {
        if (!currentUser) return;

        const isAdmin = currentUser.role === 'admin';

        Swal.fire({
            title: isAdmin ? 'ยืนยันการลบถาวร?' : 'ยืนยันการลบรายการ?',
            html: isAdmin
                ? `คุณเป็น Admin และกำลังจะลบ <b>${completedIdsToDelete.length + cancelledIdsToDelete.length + printIdsToDelete.length}</b> รายการออกจากระบบอย่างถาวร<br/><br/><b class="text-red-600">การกระทำนี้ไม่สามารถย้อนกลับได้!</b>`
                : `คุณกำลังจะลบข้อมูล <b>${completedIdsToDelete.length + cancelledIdsToDelete.length + printIdsToDelete.length}</b> รายการที่เลือก<br/><br/>รายการเหล่านี้จะถูกลบข้อมูลถาวรและไม่สามารถกู้คืนได้`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: isAdmin ? 'ใช่, ลบถาวร!' : 'ใช่, ลบเลย!',
            cancelButtonText: 'ยกเลิก'
        }).then((result) => {
            if (result.isConfirmed) {
                if (isAdmin) {
                    // ADMIN: HARD DELETE
                    setCompletedOrders(prev => prev.filter(o => !completedIdsToDelete.includes(o.id)));
                    setCancelledOrders(prev => prev.filter(o => !cancelledIdsToDelete.includes(o.id)));
                    setPrintHistory(prev => prev.filter(p => !printIdsToDelete.includes(p.id)));
                } else {
                    // NON-ADMIN: SOFT DELETE
                    setCompletedOrders(prev => prev.map(o => completedIdsToDelete.includes(o.id) ? { ...o, isDeleted: true, deletedBy: currentUser.username } : o));
                    setCancelledOrders(prev => prev.map(o => cancelledIdsToDelete.includes(o.id) ? { ...o, isDeleted: true, deletedBy: currentUser.username } : o));
                    setPrintHistory(prev => prev.map(p => printIdsToDelete.includes(p.id) ? { ...p, isDeleted: true, deletedBy: currentUser.username } : p));
                }
                 Swal.fire('ลบแล้ว', 'รายการที่เลือกถูกลบเรียบร้อยแล้ว', 'success');
            }
        });
    };
    
    // --- MODAL HANDLERS ---
    const handleModalClose = () => {
        setModalState({
            isMenuItem: false, isOrderSuccess: false, isSplitBill: false, isTableBill: false,
            isPayment: false, isPaymentSuccess: false, isSettings: false, isEditCompleted: false,
            isUserManager: false, isBranchManager: false, isMoveTable: false, isCancelOrder: false,
            isCashBill: false, isSplitCompleted: false, isCustomization: false, isLeaveRequest: false,
            isMenuSearch: false, isMergeBill: false
        });
        setOrderForModal(null);
        setItemToEdit(null);
        setItemToCustomize(null);
    };

    const handleOpenSettings = () => setModalState(prev => ({ ...prev, isSettings: true }));
    const handleOpenUserManager = () => setModalState(prev => ({ ...prev, isUserManager: true }));
    const handleOpenBranchManager = () => setModalState(prev => ({ ...prev, isBranchManager: true }));
    const handleOpenMenuSearch = () => setModalState(prev => ({ ...prev, isMenuSearch: true }));

    const handleShowBill = (orderId: number) => {
        const order = activeOrders.find(o => o.id === orderId);
        if (order) {
            setOrderForModal(order);
            setModalState(prev => ({ ...prev, isTableBill: true }));
        }
    };

    const handleInitiatePayment = (order: ActiveOrder) => {
        setOrderForModal(order);
        setModalState(prev => ({ ...prev, isPayment: true }));
    };
    
    const handleInitiateSplit = (order: ActiveOrder) => {
        setOrderForModal(order);
        setModalState(prev => ({ ...prev, isSplitBill: true }));
    };

    const handleInitiateSplitCompleted = (order: CompletedOrder) => {
        setOrderForModal(order);
        setModalState(prev => ({ ...prev, isSplitCompleted: true }));
    };
    
    const handleInitiateMove = (order: ActiveOrder) => {
        setOrderForModal(order);
        setModalState(prev => ({ ...prev, isMoveTable: true }));
    };

    const handleInitiateCancel = (order: ActiveOrder) => {
        setOrderForModal(order);
        setModalState(prev => ({ ...prev, isCancelOrder: true }));
    };
    
    const handleInitiateCashBill = (order: CompletedOrder) => {
        setOrderForModal(order);
        setModalState(prev => ({ ...prev, isCashBill: true }));
    };

    const handleInitiateMerge = (order: ActiveOrder) => {
        setOrderForModal(order);
        setModalState(prev => ({ ...prev, isMergeBill: true }));
    };

    const handleEditCompletedOrder = (order: CompletedOrder) => {
        setOrderForModal(order);
        setModalState(prev => ({ ...prev, isEditCompleted: true }));
    };
    
    // --- RENDER LOGIC ---
    if (isCustomerMode) {
        const tableForCustomer = tables.find(t => t.id === customerTableId);
        if (!tableForCustomer) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-gray-100">
                    <p className="text-red-500 font-bold">Error: ไม่พบข้อมูลโต๊ะ (Invalid Table ID)</p>
                </div>
            );
        }
        return (
            <CustomerView
                table={tableForCustomer}
                menuItems={menuItems}
                categories={categories}
                activeOrders={activeOrders.filter(o => o.tableName === tableForCustomer.name && o.floor === tableForCustomer.floor)}
                allBranchOrders={activeOrders}
                onPlaceOrder={(items, name, count) => handlePlaceOrder(items, name, count)}
                onStaffCall={(table, name) => setStaffCalls(prev => [...prev, { id: Date.now(), tableId: table.id, tableName: table.name, customerName: name, branchId: selectedBranch!.id, timestamp: Date.now() }])}
            />
        );
    }
    
    if (!currentUser) {
        return <LoginScreen onLogin={handleLogin} />;
    }

    if (!selectedBranch) {
        const userBranches = branches.filter(b => currentUser.allowedBranchIds?.includes(b.id));
        if (userBranches.length === 1 && currentUser.role !== 'admin') {
            handleSelectBranch(userBranches[0]);
            return null; // Render will be triggered again
        }
         return (
            <BranchSelectionScreen 
                onSelectBranch={handleSelectBranch}
                currentUser={currentUser}
                branches={branches}
                onManageBranches={handleOpenBranchManager}
                onLogout={handleLogout}
            />
        );
    }

    const mainContent = (() => {
        switch(currentView) {
            case 'pos':
                return <Menu menuItems={menuItems} setMenuItems={setMenuItems} categories={categories} onSelectItem={handleAddItemToOrder} isEditMode={canEdit} onEditItem={(item: MenuItem) => { setItemToEdit(item); setModalState(prev => ({ ...prev, isMenuItem: true })); }} onAddNewItem={() => { setItemToEdit(null); setModalState(prev => ({ ...prev, isMenuItem: true })); }} onDeleteItem={(id: number) => setMenuItems(menuItems.filter(item => item.id !== id))} onUpdateCategory={(o, n) => setCategories(cats => cats.map(c => c === o ? n : c))} onDeleteCategory={(n) => setCategories(cats => cats.filter(c => c !== n))} onAddCategory={n => setCategories(cats => [...cats, n])} onImportMenu={(items, newCats) => { setMenuItems(items); setCategories(cats => Array.from(new Set([...cats, ...newCats]))); }} />;
            case 'kitchen':
                return <KitchenView activeOrders={activeOrders} onCompleteOrder={handleCompleteOrder} onStartCooking={handleStartCooking} />;
            case 'tables':
                return <TableLayout tables={cleanedTables} activeOrders={activeOrders} onTableSelect={(tableId) => { setSelectedTableId(tableId); setCurrentView('pos'); }} onShowBill={handleShowBill} onGeneratePin={(tableId) => setTables(tbls => tbls.map(t => t.id === tableId ? { ...t, activePin: (Math.floor(100 + Math.random() * 900)).toString() } : t))} currentUser={currentUser} printerConfig={printerConfig} floors={floors} />;
            case 'dashboard':
                return <Dashboard completedOrders={completedOrders} cancelledOrders={cancelledOrders} openingTime={openingTime || '10:00'} closingTime={closingTime || '22:00'} currentUser={currentUser} />;
            case 'history':
                return <SalesHistory completedOrders={completedOrders} cancelledOrders={cancelledOrders} printHistory={printHistory} onReprint={(orderNum) => {}} onSplitOrder={handleInitiateSplitCompleted} isEditMode={canEdit} onEditOrder={handleEditCompletedOrder} onInitiateCashBill={handleInitiateCashBill} onDeleteHistory={onDeleteHistory} currentUser={currentUser} />;
            case 'stock':
                return <StockManagement stockItems={stockItems} setStockItems={setStockItems} stockCategories={stockCategories} setStockCategories={setStockCategories} stockUnits={stockUnits} setStockUnits={setStockUnits} />;
            case 'leave':
                return <LeaveCalendarView leaveRequests={leaveRequests} currentUser={currentUser} onOpenRequestModal={(date) => { setLeaveRequestInitialDate(date || null); setModalState(prev => ({...prev, isLeaveRequest: true})); }} branches={branches} onUpdateStatus={handleUpdateLeaveStatus} onDeleteRequest={handleDeleteLeaveRequest} selectedBranch={selectedBranch} />;
            default:
                return <div>View not found</div>;
        }
    })();

    const orderSummarySidebar = (
        <div className={`relative transition-all duration-300 ease-in-out h-full ${isOrderSidebarVisible ? 'w-full md:w-[400px]' : 'w-0'}`}>
            <Sidebar
                currentOrderItems={currentOrderItems}
                onQuantityChange={(cartItemId, newQuantity) => setCurrentOrderItems(prev => prev.map(i => i.cartItemId === cartItemId ? {...i, quantity: newQuantity} : i).filter(i => i.quantity > 0))}
                onRemoveItem={cartItemId => setCurrentOrderItems(prev => prev.filter(i => i.cartItemId !== cartItemId))}
                onClearOrder={resetOrderInfo}
                onPlaceOrder={() => handlePlaceOrder()}
                isPlacingOrder={isPlacingOrder}
                tables={cleanedTables}
                selectedTable={tables.find(t => t.id === selectedTableId) || null}
                onSelectTable={setSelectedTableId}
                customerName={customerName}
                onCustomerNameChange={setCustomerName}
                customerCount={customerCount}
                onCustomerCountChange={setCustomerCount}
                isEditMode={canEdit}
                onAddNewTable={(floor) => setTables(prev => [...prev, {id: Date.now(), name: `T${prev.filter(t=>t.floor === floor).length + 1}`, floor: floor}])}
                onRemoveLastTable={(floor) => setTables(prev => { const toRemove = prev.filter(t=>t.floor === floor).pop(); return prev.filter(t => t.id !== toRemove?.id); })}
                floors={floors}
                selectedFloor={selectedSidebarFloor}
                onFloorChange={setSelectedSidebarFloor}
                onAddFloor={() => setFloors(prev => [...prev, `ชั้น ${prev.length + 1}`])}
                onRemoveFloor={(floor) => setFloors(prev => prev.filter(f => f !== floor))}
                sendToKitchen={sendToKitchen}
                onSendToKitchenChange={(enabled, details) => { setSendToKitchen(enabled); setNotSentToKitchenDetails(details); }}
                onToggleTakeaway={(cartItemId, isTakeaway, cutlery, notes) => setCurrentOrderItems(prev => prev.map(i => i.cartItemId === cartItemId ? {...i, isTakeaway, takeawayCutlery: cutlery, takeawayCutleryNotes: notes} : i))}
                onUpdateReservation={(tableId, reservation) => setTables(prev => prev.map(t => t.id === tableId ? {...t, reservation} : t))}
                onOpenSearch={handleOpenMenuSearch}
            />
        </div>
    );
    
    // --- Define Bottom Nav Items ---
    const bottomNavItems: NavItem[] = [
        { id: 'pos', label: 'POS', view: 'pos', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" /><path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h2a1 1 0 100-2H9z" clipRule="evenodd" /></svg> },
        { id: 'kitchen', label: 'ครัว', view: 'kitchen', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h10a3 3 0 013 3v5a.997.997 0 01-.293.707zM5 6a1 1 0 100 2 1 1 0 000-2zm3 0a1 1 0 100 2 1 1 0 000-2zm3 0a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" /></svg>, badge: kitchenBadgeCount },
        { id: 'tables', label: 'โต๊ะ', view: 'tables', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm2 1v8h8V6H4z" /></svg>, badge: tablesBadgeCount },
        { id: 'leave', label: 'วันลา', view: 'leave', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg> },
        { id: 'more', label: 'เพิ่มเติม', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>,
            subItems: [
                { id: 'history', label: 'ประวัติ', view: 'history', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
                { id: 'stock', label: 'สต็อก', view: 'stock', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg> },
            ]
        },
    ];

    const roleText = useMemo(() => {
        if (!currentUser) return '';
        switch (currentUser.role) {
            case 'admin': return 'ผู้ดูแลระบบ';
            case 'branch-admin': return 'ผู้ดูแลสาขา';
            case 'pos': return 'พนักงาน POS';
            case 'kitchen': return 'พนักงานครัว';
            case 'auditor': return 'Auditor';
            default: return '';
        }
    }, [currentUser]);

    return (
        <div className="h-screen w-screen flex flex-col bg-gray-100 overflow-hidden">
             {/* Mobile User Profile Bar */}
             {layoutType === 'staff' && currentUser && (
                <div className="md:hidden bg-white shadow-sm p-2 flex justify-between items-center sticky top-0 z-30 border-b">
                    <div className="flex items-center gap-3">
                        <img src={currentUser.profilePictureUrl || "https://img.icons8.com/fluency/48/user-male-circle.png"} alt={currentUser.username} className="h-9 w-9 rounded-full object-cover" />
                        <div>
                            <p className="font-semibold text-gray-800 text-sm leading-tight">{currentUser.username}</p>
                            <p className={`text-xs font-semibold leading-tight ${
                                currentUser.role === 'kitchen' ? 'text-orange-600' : 'text-blue-600'
                            }`}>{roleText}</p>
                        </div>
                    </div>
                    <button onClick={handleLogout} className="p-2 text-gray-500 rounded-full hover:bg-gray-100" title="ออกจากระบบ">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                    </button>
                </div>
            )}
            
            {layoutType === 'staff' ? (
                <Header 
                    currentView={currentView}
                    onViewChange={setCurrentView}
                    isEditMode={canEdit}
                    onToggleEditMode={() => setIsEditMode(!isEditMode)}
                    onOpenSettings={handleOpenSettings}
                    kitchenBadgeCount={kitchenBadgeCount}
                    tablesBadgeCount={tablesBadgeCount}
                    vacantTablesBadgeCount={vacantTablesBadgeCount}
                    leaveBadgeCount={leaveBadgeCount}
                    currentUser={currentUser}
                    onLogout={handleLogout}
                    onOpenUserManager={handleOpenUserManager}
                    logoUrl={logoUrl}
                    onLogoChangeClick={() => {}}
                    restaurantName={restaurantName}
                    onRestaurantNameChange={(name) => setRestaurantName(name)}
                    branchName={selectedBranch.name}
                    onChangeBranch={() => setSelectedBranch(null)}
                    onManageBranches={handleOpenBranchManager}
                />
            ) : (
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
                    isEditMode={canEdit}
                    onOpenSettings={handleOpenSettings}
                    onOpenUserManager={handleOpenUserManager}
                    onManageBranches={handleOpenBranchManager}
                    onChangeBranch={() => setSelectedBranch(null)}
                    onLogout={handleLogout}
                    kitchenBadgeCount={kitchenBadgeCount}
                    tablesBadgeCount={tablesBadgeCount}
                    leaveBadgeCount={leaveBadgeCount}
                    onUpdateCurrentUser={(updates) => setUsers(prev => prev.map(u => u.id === currentUser.id ? {...u, ...updates} : u))}
                    onUpdateLogoUrl={setLogoUrl}
                    onUpdateRestaurantName={setRestaurantName}
                />
            )}

            <main className={`flex flex-1 overflow-hidden ${layoutType === 'admin' ? (isAdminSidebarCollapsed ? 'md:pl-20' : 'md:pl-64') : ''}`}>
                <div className={`flex-1 flex overflow-hidden min-w-0 h-full`}>
                    <div className="flex-1 overflow-y-auto min-w-0 pb-24 md:pb-0">
                        {mainContent}
                    </div>
                    {(currentView === 'pos' || currentView === 'tables') && (
                        <div className="relative h-full flex">
                            <button
                                onClick={() => setIsOrderSidebarVisible(!isOrderSidebarVisible)}
                                className={`absolute top-1/2 -left-6 z-20 bg-gray-800 text-white p-2 rounded-l-xl shadow-xl hover:bg-gray-700 transition-colors border border-gray-700 border-r-0 flex items-center justify-center`}
                                style={{ transform: 'translateY(-50%)', height: '120px', width: '32px' }}
                            >
                                <div className="w-1.5 h-16 bg-gray-400 rounded-full"></div>
                            </button>
                            {orderSummarySidebar}
                        </div>
                    )}
                </div>
                {totalItems > 0 && !isOrderSidebarVisible && (currentView === 'pos' || currentView === 'tables') && (
                     <button
                        onClick={() => setIsOrderSidebarVisible(true)}
                        className="fixed bottom-24 right-6 z-30 bg-blue-600 text-white w-16 h-16 rounded-full shadow-lg flex items-center justify-center animate-pulse"
                    >
                        <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-sm font-bold">{totalItems}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    </button>
                )}
            </main>
            
            {layoutType === 'staff' && (
                <BottomNavBar items={bottomNavItems} currentView={currentView} onViewChange={setCurrentView} />
            )}

            <ItemCustomizationModal isOpen={modalState.isCustomization} onClose={handleModalClose} item={itemToCustomize} onConfirm={handleConfirmCustomization} />
            <OrderSuccessModal isOpen={modalState.isOrderSuccess} onClose={handleModalClose} orderId={lastPlacedOrderId!} />
            <TableBillModal isOpen={modalState.isTableBill} onClose={handleModalClose} order={orderForModal as ActiveOrder} onInitiatePayment={handleInitiatePayment} onInitiateMove={handleInitiateMove} onSplit={handleInitiateSplit} isEditMode={canEdit} onUpdateOrder={(orderId, items, customerCount) => setActiveOrders(prev => prev.map(o => o.id === orderId ? {...o, items, customerCount} : o))} currentUser={currentUser} onInitiateCancel={handleInitiateCancel} activeOrderCount={activeOrders.length} onInitiateMerge={handleInitiateMerge} />
            <PaymentModal isOpen={modalState.isPayment} onClose={handleModalClose} order={orderForModal as ActiveOrder} onConfirmPayment={handleConfirmPayment} qrCodeUrl={qrCodeUrl} isEditMode={canEdit} onOpenSettings={handleOpenSettings} isConfirmingPayment={isConfirmingPayment} />
            <PaymentSuccessModal isOpen={modalState.isPaymentSuccess} onClose={(shouldPrint) => { if(shouldPrint && printerConfig?.cashier && orderForModal) { printerService.printReceipt(orderForModal as CompletedOrder, printerConfig.cashier, restaurantName).catch(e => Swal.fire('Print Error', e.message, 'error')); } handleModalClose(); }} orderId={orderForModal?.orderNumber!} />
            <SettingsModal isOpen={modalState.isSettings} onClose={handleModalClose} onSave={(qr, sound, staffSound, printer, open, close) => { setQrCodeUrl(qr); setNotificationSoundUrl(sound); setStaffCallSoundUrl(staffSound); setPrinterConfig(printer); setOpeningTime(open); setClosingTime(close); handleModalClose(); }} currentQrCodeUrl={qrCodeUrl} currentNotificationSoundUrl={notificationSoundUrl} currentStaffCallSoundUrl={staffCallSoundUrl} currentPrinterConfig={printerConfig} currentOpeningTime={openingTime} currentClosingTime={closingTime} onSavePrinterConfig={setPrinterConfig} />
            <UserManagerModal isOpen={modalState.isUserManager} onClose={handleModalClose} users={users} setUsers={setUsers} currentUser={currentUser} branches={branches} isEditMode={canEdit} />
            <BranchManagerModal isOpen={modalState.isBranchManager} onClose={handleModalClose} branches={branches} setBranches={setBranches} />
            <MenuItemModal isOpen={modalState.isMenuItem} onClose={handleModalClose} onSave={(item) => { const saveItem = {...item, id: item.id || Date.now()}; setMenuItems(prev => item.id ? prev.map(i => i.id === item.id ? saveItem : i) : [...prev, saveItem]); handleModalClose(); }} itemToEdit={itemToEdit} categories={categories} onAddCategory={name => setCategories(prev => [...prev, name])} />
            <LeaveRequestModal isOpen={modalState.isLeaveRequest} onClose={handleModalClose} currentUser={currentUser} onSave={handleSaveLeaveRequest} leaveRequests={leaveRequests} initialDate={leaveRequestInitialDate} />
            <MenuSearchModal isOpen={modalState.isMenuSearch} onClose={handleModalClose} menuItems={menuItems} onSelectItem={handleAddItemToOrder} />
            <MoveTableModal isOpen={modalState.isMoveTable} onClose={handleModalClose} order={orderForModal as ActiveOrder} tables={cleanedTables} activeOrders={activeOrders} onConfirmMove={(orderId, newTableId) => { const newTable = tables.find(t=>t.id===newTableId); if(!newTable) return; setActiveOrders(prev => prev.map(o => o.id === orderId ? {...o, tableName: newTable.name, floor: newTable.floor} : o)); handleModalClose(); }} floors={floors} />
            <SplitBillModal isOpen={modalState.isSplitBill} onClose={handleModalClose} order={orderForModal as ActiveOrder} onConfirmSplit={(itemsToSplit) => { const newOrderNumber = Math.max(0, ...activeOrders.map(o=>o.orderNumber), ...completedOrders.map(o=>o.orderNumber)) + 1; const newOrder:ActiveOrder = {...(orderForModal as ActiveOrder), id: Date.now(), orderNumber: newOrderNumber, items: itemsToSplit, parentOrderId: orderForModal!.orderNumber}; setActiveOrders(prev => [...prev.map(o => o.id === orderForModal!.id ? {...o, items: o.items.map(i => { const split = itemsToSplit.find(si=>si.id===i.id); return split ? {...i, quantity: i.quantity - split.quantity} : i; }).filter(i => i.quantity > 0) } : o), newOrder]); handleModalClose(); }} />
            <SplitCompletedBillModal isOpen={modalState.isSplitCompleted} onClose={handleModalClose} order={orderForModal as CompletedOrder} onConfirmSplit={(itemsToSplit) => { const newOrderNumber = Math.max(0, ...activeOrders.map(o=>o.orderNumber), ...completedOrders.map(o=>o.orderNumber)) + 1; const newOrder:CompletedOrder = {...(orderForModal as CompletedOrder), id: Date.now(), orderNumber: newOrderNumber, items: itemsToSplit, parentOrderId: orderForModal!.orderNumber}; setCompletedOrders(prev => [...prev.map(o => o.id === orderForModal!.id ? {...o, items: o.items.map(i => { const split = itemsToSplit.find(si=>si.id===i.id); return split ? {...i, quantity: i.quantity - split.quantity} : i; }).filter(i => i.quantity > 0) } : o), newOrder]); handleModalClose(); }} />
            <CancelOrderModal isOpen={modalState.isCancelOrder} onClose={handleModalClose} order={orderForModal as ActiveOrder} onConfirm={(order, reason, notes) => { const cancelled: CancelledOrder = {...order, status: 'cancelled', cancellationTime: Date.now(), cancelledBy: currentUser.username, cancellationReason: reason, cancellationNotes: notes}; setCancelledOrders(prev => [...prev, cancelled]); setActiveOrders(prev => prev.filter(o => o.id !== order.id)); handleModalClose(); }} />
            <CashBillModal isOpen={modalState.isCashBill} onClose={handleModalClose} order={orderForModal as CompletedOrder} restaurantName={restaurantName} logoUrl={logoUrl} />
            <EditCompletedOrderModal isOpen={modalState.isEditCompleted} onClose={handleModalClose} order={orderForModal as CompletedOrder} onSave={(updated) => {setCompletedOrders(prev => prev.map(o => o.id === updated.id ? {...o, items: updated.items} : o)); handleModalClose(); }} menuItems={menuItems} />
            <MergeBillModal isOpen={modalState.isMergeBill} onClose={handleModalClose} order={orderForModal as ActiveOrder} allActiveOrders={activeOrders} tables={cleanedTables} onConfirmMerge={(sourceIds, targetId) => { const targetOrder = activeOrders.find(o => o.id === targetId)!; const sourceOrders = activeOrders.filter(o => sourceIds.includes(o.id)); const allItems = [...targetOrder.items, ...sourceOrders.flatMap(o => o.items)]; setActiveOrders(prev => [...prev.filter(o => !sourceIds.includes(o.id) && o.id !== targetId), {...targetOrder, items: allItems}]); handleModalClose(); }} />
        </div>
    );
};

export default App;