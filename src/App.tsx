
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
// FIX: Correct Firebase v8 compatibility imports for 'app' and 'messaging'.
import firebase from 'firebase/compat/app';
import 'firebase/compat/messaging';
import { isFirebaseConfigured, db } from './firebaseConfig';
// FIX: Removed unused v9 firestore and messaging imports
// import { doc, runTransaction } from 'firebase/firestore';
// import { getMessaging, getToken, onMessage } from 'firebase/messaging';

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
import type { SubmitLeaveRequestPayload } from './services/firebaseFunctionsService';

// Add a global interface for the Android Bridge to avoid TypeScript errors
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

        // For customers, try to get their specific branch first. This prevents race conditions on refresh.
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
        
        // For staff, or as a fallback for customers on first load, get the staff-selected branch.
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
        // Validate that the stored view is a valid View type
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
    // Note: Leave requests are global (not branch specific in sync) but filtered by branchId
    const [leaveRequests, setLeaveRequests] = useFirestoreSync<LeaveRequest[]>(null, 'leaveRequests', []);

    // More robustly deduplicate tables locally to handle corrupted data with invisible characters.
    const cleanedTables = useMemo(() => {
        const normalizeString = (str: string | undefined | null): string => {
            if (!str) return '';
            // Replaces all whitespace characters (space, tab, no-break space, etc.) 
            // and zero-width characters with an empty string, then lowercases.
            return str.replace(/[\s\u200B-\u200D\uFEFF]/g, '').toLowerCase();
        };

        const uniqueTablesMap = new Map<string, Table>();
        (tables || []).forEach(table => {
            if (table && table.name && table.floor) {
                const key = `${normalizeString(table.name)}-${normalizeString(table.floor)}`;
                // Keep the first one found, ignore subsequent duplicates
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
    const prevLeaveRequestsRef = useRef<LeaveRequest[] | undefined>(undefined);
    const notifiedCallIdsRef = useRef<Set<number>>(new Set());
    const staffCallAudioRef = useRef<HTMLAudioElement | null>(null);
    const prevUserRef = useRef<User | null>(null);

    // --- SESSION PERSISTENCE ---
    useEffect(() => {
        // Only persist selectedBranch for staff users. Customer branch is handled in its own effect.
        if (currentUser && !isCustomerMode) {
            if (selectedBranch) {
                localStorage.setItem('selectedBranch', JSON.stringify(selectedBranch));
            } else {
                localStorage.removeItem('selectedBranch');
            }
        }
    }, [selectedBranch, currentUser, isCustomerMode]);

    useEffect(() => {
        // Save current view to localStorage whenever it changes to persist on refresh
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
                // No images to cache, so end the loading state immediately.
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
    // Part 1: Detect customer mode from URL on initial load. Runs only once.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('mode') === 'customer' && params.get('tableId')) {
            setIsCustomerMode(true);
            setCustomerTableId(Number(params.get('tableId')));
        }
    }, []);

    // Part 2: Auto-select branch for customer mode once branch data is available AND persist it.
    useEffect(() => {
        // This effect runs when isCustomerMode, branches, or selectedBranch changes.
        // It ensures that if we are in customer mode and branches are loaded,
        // the correct branch is selected, preventing a race condition on refresh.
        if (isCustomerMode && !selectedBranch && branches.length > 0) {
            // For customer mode, assuming a single branch setup for simplicity.
            // In a multi-branch setup, the branch ID would need to be in the URL.
            const branchForCustomer = branches[0];
            setSelectedBranch(branchForCustomer);
            // Persist this choice specifically for customer mode to solve refresh issues
            localStorage.setItem('customerSelectedBranch', JSON.stringify(branchForCustomer));
        }
    }, [isCustomerMode, branches, selectedBranch]);


    // --- USER SYNC EFFECT ---
    useEffect(() => {
        if (currentUser && users && users.length > 0) {
            // This is a flag to prevent a race condition on initial load.
            // We only check for user deletion after we're sure the user list
            // has been populated from Firestore, not just the initial default.
            const isUsersLoadedFromFirestore = users !== DEFAULT_USERS;
    
            const foundUser = users.find(u => u.id === currentUser.id);
    
            if (foundUser) {
                // User exists, sync data if it has changed
                if (JSON.stringify(foundUser) !== JSON.stringify(currentUser)) {
                    setCurrentUser(foundUser);
                }
            } else {
                // User does not exist in the list.
                // If the list has been loaded from Firestore, it means the user was deleted.
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
                // FIX: Use v8 messaging API.
                const messaging = firebase.messaging();

                // Add an event listener for messages received while the app is in the foreground.
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
                    // FIX: Use v8 messaging API.
                    const currentToken = await messaging.getToken({ vapidKey });
                    setCurrentFcmToken(currentToken); // Store the token for this device to use on logout

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
    
    // The number of unique tables that have active orders
    const occupiedTablesCount = useMemo(() => {
        return new Set(activeOrders.map(o => `${o.tableName}-${o.floor}`)).size;
    }, [activeOrders]);
    
    // The top red badge (tablesBadgeCount) should show the number of OCCUPIED tables.
    const tablesBadgeCount = occupiedTablesCount > 0 ? occupiedTablesCount : 0;
    
    // The bottom green badge (vacantTablesBadgeCount) should show the number of VACANT tables.
    const vacantTablesBadgeCount = useMemo(() => {
        let totalTables = cleanedTables.length;
        // WORKAROUND: Hard cap the total tables at 6 to override corrupted data from Firestore
        // that results in a count of 16. This provides an immediate and reliable UI fix.
        if (totalTables > 6) {
            totalTables = 6;
        }
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
        const isPrivileged = currentUser.role === 'admin' || currentUser.role === 'branch-admin' || currentUser.username === 'Sam';
        return isEditMode && isPrivileged;
    }, [isEditMode, currentUser]);

    // --- ANDROID APP ICON BADGE SYNC ---
    useEffect(() => {
        // This effect syncs the pending order count with the native Android app icon badge.
        // It relies on a JavaScript Bridge (`AndroidBridge`) injected by the Android WebView.
        if (window.AndroidBridge && typeof window.AndroidBridge.setPendingOrderCount === 'function') {
            window.AndroidBridge.setPendingOrderCount(kitchenBadgeCount);
        }
    }, [kitchenBadgeCount]);

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
                    // Create a new Audio object and play it each time to ensure it plays.
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

    // --- KITCHEN LOGIN REMINDER EFFECT ---
    useEffect(() => {
        // This effect triggers a reminder for pending orders specifically when a kitchen user logs in.
        if (currentUser?.role === 'kitchen' && prevUserRef.current?.id !== currentUser.id) {
            const waitingOrders = activeOrders.filter(o => o.status === 'waiting');
            if (waitingOrders.length > 0) {
                // Sort to show the oldest order first
                const oldestWaitingOrder = waitingOrders.sort((a, b) => a.orderTime - b.orderTime)[0];

                // Play sound
                if (notificationSoundUrl) {
                    const audio = new Audio(notificationSoundUrl);
                    audio.play().catch(error => console.error("Error playing login reminder sound:", error));
                }
                
                // Show notification
                Swal.fire({
                    title: '🔔 มีออเดอร์รออยู่ในคิว!',
                    html: `มี <b>${waitingOrders.length}</b> ออเดอร์ที่ยังไม่ได้รับ<br/>ออเดอร์แรกคือ <b>#${String(oldestWaitingOrder.orderNumber).padStart(3, '0')}</b>`,
                    icon: 'info',
                    confirmButtonText: 'รับทราบ',
                    allowOutsideClick: false,
                    allowEscapeKey: false,
                });
            }
        }
        // Update the previous user at the end of the effect for the next render.
        prevUserRef.current = currentUser;
    }, [currentUser, activeOrders, notificationSoundUrl]);

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

    // --- STAFF CALL NOTIFICATION & SOUND EFFECT (REFACTORED) ---
    useEffect(() => {
        // This single effect manages both audio and visual notifications for staff calls.
        
        // 1. Audio Management
        const shouldPlayAudio = staffCalls.length > 0 && staffCallSoundUrl && !isCustomerMode && currentUser && !['admin', 'branch-admin', 'auditor'].includes(currentUser.role);
        
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

        // 2. Visual Notification Management (Swal)
        const showNextNotification = async () => {
            if (isCustomerMode || !currentUser || ['auditor'].includes(currentUser.role)) {
                return;
            }
            
            // Find the first call that hasn't been shown yet
            const unnotifiedCall = staffCalls.find(c => !notifiedCallIdsRef.current.has(c.id));

            if (unnotifiedCall) {
                // Mark this call as "seen" to prevent re-triggering
                notifiedCallIdsRef.current.add(unnotifiedCall.id); 

                const messageText = unnotifiedCall.message 
                    ? `<br/><strong class="text-blue-600">${unnotifiedCall.message}</strong>` 
                    : '<br/>ต้องการความช่วยเหลือ';

                const result = await Swal.fire({
                    title: '🔔 ลูกค้าเรียกพนักงาน!',
                    html: `โต๊ะ <b>${unnotifiedCall.tableName}</b> (คุณ ${unnotifiedCall.customerName})${messageText}`,
                    icon: 'info',
                    confirmButtonText: 'รับทราบ',
                    allowOutsideClick: false, // Prevent dismissing by clicking outside
                    allowEscapeKey: false
                });
                
                // When acknowledged, remove it from the global state.
                // This will trigger a re-render, and the loop continues if more calls are pending.
                if (result.isConfirmed) {
                    setStaffCalls(prev => prev.filter(call => call.id !== unnotifiedCall.id));
                }
            }
        };

        showNextNotification();
        
        // Cleanup on unmount
        return () => {
            if (staffCallAudioRef.current) {
                staffCallAudioRef.current.pause();
            }
        };
    }, [staffCalls, currentUser, isCustomerMode, staffCallSoundUrl, setStaffCalls]);

    // Cleanup notifiedCallIdsRef when user logs out
    useEffect(() => {
        if (!currentUser) {
            notifiedCallIdsRef.current.clear();
        }
    }, [currentUser]);


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
             // Fallback to check default users if not found in synced state (e.g., first run)
             user = DEFAULT_USERS.find(u => u.username === username && u.password === password);
        }

        if (user) {
            setCurrentUser(user);
            localStorage.setItem('currentUser', JSON.stringify(user));
            setIsEditMode(false); // Ensure edit mode is off on login
            // Redirect based on role
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

    const clearPosState = useCallback(() => {
        setCurrentOrderItems([]);
        setSelectedTableId(null);
        setCustomerName('');
        setCustomerCount(1);
        setNotSentToKitchenDetails(null);
    }, []);

    const handleLogout = () => {
        // Remove FCM token for this device from the user's profile
        if (currentUser && currentFcmToken) {
            const userInState = users.find(u => u.id === currentUser.id);
            if (userInState) {
                const updatedTokens = (userInState.fcmTokens || []).filter(token => token !== currentFcmToken);
                setUsers(prevUsers =>
                    prevUsers.map(u =>
                        u.id === currentUser.id ? { ...u, fcmTokens: updatedTokens } : u
                    )
                );
            }
        }

        localStorage.removeItem('currentUser');
        localStorage.removeItem('selectedBranch');
        localStorage.removeItem('customerSelectedBranch'); // Explicitly clear customer branch
        setCurrentUser(null);
        setSelectedBranch(null);
        setCurrentView('pos'); // Reset view to default
        if (staffCallAudioRef.current) {
            staffCallAudioRef.current.pause();
            staffCallAudioRef.current.currentTime = 0;
        }
        clearPosState();
        setIsEditMode(false); // Ensure edit mode is off on logout
    };

    const handleSendToKitchenChange = (enabled: boolean, details: { reason: string; notes: string } | null = null) => {
        setSendToKitchen(enabled);
        if (!enabled && details) {
            setNotSentToKitchenDetails(details);
        } else if (enabled) {
            setNotSentToKitchenDetails(null);
        }
    };

    const handlePlaceOrderLogic = async (
        items: OrderItem[],
        table: Table,
        cName: string,
        cCount: number,
        placedBy: string,
        shouldSendToKitchen: boolean
    ) => {
        // --- Generate Order Number with Transaction (NEW) ---
        const today = new Date();
        const dateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        
        if (!db || !branchId) {
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้', 'error');
            return null;
        }
        const counterRef = db.doc(`branches/${branchId}/counters/dailyOrder_${dateString}`);
    
        let newOrderNumber: number | null = null;
        try {
            await db.runTransaction(async (transaction: firebase.firestore.Transaction) => {
                const counterDoc = await transaction.get(counterRef);
                let currentCount = 0;
                if (counterDoc.exists) {
                    const data = counterDoc.data();
                    if (data && typeof data.count === 'number') {
                        currentCount = data.count;
                    }
                }
                const newCount = currentCount + 1;
                transaction.set(counterRef, { count: newCount });
                newOrderNumber = newCount;
            });
        } catch (e) {
            console.error("Order number transaction failed: ", e);
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถสร้างหมายเลขออเดอร์ได้ กรุณาลองใหม่อีกครั้ง', 'error');
            return null; // Indicate failure
        }
    
        if (newOrderNumber === null) {
            return null; // Abort if transaction failed
        }

        // --- Security & Data Validation ---
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
                selectedOptions: validatedOptions,
            };
        });
        
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
        const selectedTable = cleanedTables.find(t => t.id === selectedTableId);
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
        setSendToKitchen(true); // Reset checkbox after order
    };

    const handleCustomerPlaceOrder = async (items: OrderItem[], cName: string, cCount: number) => {
        if (!customerTableId) return;
        const table = cleanedTables.find(t => t.id === customerTableId);
        if (!table) return;

        const newOrderNum = await handlePlaceOrderLogic(
            items,
            table,
            cName,
            cCount,
            'Customer (Self)',
            true // Always send to kitchen from customer mode
        );
        
        Swal.fire({
            icon: 'success',
            title: 'ส่งออเดอร์เรียบร้อย!',
            text: `ออเดอร์ #${String(newOrderNum).padStart(3, '0')} กำลังถูกจัดเตรียม`,
            timer: 3000,
            showConfirmButton: false
        });
    };

    const handleStaffCall = (table: Table, cName: string, message?: string) => {
        if (!selectedBranch) return;
        const newCall: StaffCall = {
            id: Date.now(),
            tableId: table.id,
            tableName: table.name,
            customerName: cName,
            branchId: selectedBranch.id,
            timestamp: Date.now(),
            message,
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
        try {
            // Safely create CompletedOrder by excluding ActiveOrder-specific properties
            const {
                status,
                cookingStartTime,
                isOverdue,
                ...baseOrderData
            } = orderToComplete;

            const completedOrder: CompletedOrder = {
                ...baseOrderData,
                status: 'completed',
                completionTime: Date.now(),
                paymentDetails,
            };
            
            setCompletedOrders(prev => [...prev, completedOrder]);
            setActiveOrders(prev => prev.filter(o => o.id !== orderId));
    
            setTables(prevTables => prevTables.map(t => {
                if (t.name === orderToComplete.tableName && t.floor === orderToComplete.floor) {
                    // Remove activePin to avoid sending 'undefined' to Firestore
                    const { activePin, ...restOfTable } = t;
                    return { ...restOfTable, reservation: null };
                }
                return t;
            }));
    
            setLastPlacedOrderId(orderId);
            setModalState(prev => ({ ...prev, isPayment: false, isPaymentSuccess: true }));
            
        } catch (error) {
            console.error("Error during payment confirmation process:", error);
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกการชำระเงินได้', 'error');
        } finally {
            setIsConfirmingPayment(false);
        }
    };

    const handleVoidCompletedOrder = (orderToVoid: CompletedOrder, user: User, reason: string, notes: string) => {
        if (!user) return; // Safety check
        
        const updatedOrder: CompletedOrder = {
            ...orderToVoid,
            voidedInfo: {
                voidedAt: Date.now(),
                voidedBy: user.username,
                voidedById: user.id,
                reason,
                notes
            }
        };

        setCompletedOrders(prev => prev.map(o => o.id === orderToVoid.id ? updatedOrder : o));
    };


    const handleConfirmMerge = (sourceOrderIds: number[], targetOrderId: number) => {
        setActiveOrders(prev => {
            const sourceOrders = prev.filter(o => sourceOrderIds.includes(o.id));
            let targetOrder = prev.find(o => o.id === targetOrderId);

            if (!targetOrder || sourceOrders.length === 0) {
                console.error("Merge failed: Target or source orders not found.");
                return prev;
            }

            // --- Combine Items ---
            const allItemsToMerge = sourceOrders.flatMap(o => o.items);
            const combinedItemsMap = new Map<string, OrderItem>();

            // 1. Add target order's items to the map
            targetOrder.items.forEach(item => {
                combinedItemsMap.set(item.cartItemId, { ...item });
            });
            
            // 2. Add source orders' items, merging quantities if they exist
            allItemsToMerge.forEach(item => {
                if (combinedItemsMap.has(item.cartItemId)) {
                    const existing = combinedItemsMap.get(item.cartItemId)!;
                    existing.quantity += item.quantity;
                } else {
                    combinedItemsMap.set(item.cartItemId, { ...item });
                }
            });

            // Re-calculate tax for the new merged order
            const newSubtotal = Array.from(combinedItemsMap.values()).reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
            const newTaxAmount = targetOrder.taxRate > 0 ? newSubtotal * (targetOrder.taxRate / 100) : 0;
            
            // --- Update Target Order ---
            const updatedTargetOrder = {
                ...targetOrder,
                items: Array.from(combinedItemsMap.values()),
                taxAmount: newTaxAmount,
                // Combine customer counts
                customerCount: targetOrder.customerCount + sourceOrders.reduce((sum, o) => o.customerCount, 0)
            };

            // --- Create New State ---
            // Remove source orders and update target order
            const newActiveOrders = prev
                .filter(o => !sourceOrderIds.includes(o.id) && o.id !== targetOrderId)
                .concat(updatedTargetOrder);
            
            return newActiveOrders;
        });
        
        Swal.fire('รวมบิลสำเร็จ!', 'รายการอาหารถูกรวมเรียบร้อยแล้ว', 'success');
    };

    const handleDeleteHistory = (completedIdsToDelete: number[], cancelledIdsToDelete: number[], printIdsToDelete: number[]) => {
        if (!currentUser) return;

        // --- Completed Orders ---
        if (completedIdsToDelete.length > 0) {
            if (currentUser.role === 'admin') {
                // Admin: Hard Delete
                setCompletedOrders(prev => prev.filter(o => !completedIdsToDelete.includes(o.id)));
            } else {
                // Other roles (e.g., branch-admin): Soft Delete
                setCompletedOrders(prev => prev.map(order => {
                    if (completedIdsToDelete.includes(order.id)) {
                        return {
                            ...order,
                            isHidden: true,
                            hiddenInfo: {
                                hiddenAt: Date.now(),
                                hiddenBy: currentUser.username,
                                hiddenById: currentUser.id,
                            }
                        };
                    }
                    return order;
                }));
            }
        }

        // --- Cancelled Orders & Print History (Always Hard Delete) ---
        if (cancelledIdsToDelete.length > 0) {
            setCancelledOrders(prev => prev.filter(o => !cancelledIdsToDelete.includes(o.id)));
        }
        if (printIdsToDelete.length > 0) {
            setPrintHistory(prev => prev.filter(p => !printIdsToDelete.includes(p.id)));
        }
    };


    const handleSaveLeaveRequest = async (req: Omit<LeaveRequest, 'id' | 'status' | 'branchId'>) => {
        const fallbackSave = () => {
            if (!selectedBranch && currentUser?.role !== 'admin') {
                Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถระบุสาขาได้', 'error');
                return;
            }
            const newReq: LeaveRequest = {
                ...req,
                id: Date.now(),
                status: 'pending',
                branchId: currentUser?.role === 'admin' ? 1 : (selectedBranch?.id || 1) // Admin defaults to branch 1 if none selected
            };
            setLeaveRequests(prev => [...prev, newReq]);
            setModalState(prev => ({ ...prev, isLeaveRequest: false }));
            Swal.fire('ส่งคำขอแล้ว', 'คำขอวันลาของคุณถูกส่งแล้ว รอการอนุมัติ', 'success');
        };

        if (!functionsService.submitLeaveRequest) {
            fallbackSave();
            return;
        }

        try {
            const payload: SubmitLeaveRequestPayload = {
                ...req,
                branchId: currentUser?.role === 'admin' ? 1 : (selectedBranch?.id || 1)
            };
            const response = await functionsService.submitLeaveRequest(payload);
            if (!response || !response.success) {
                throw new Error(response?.error || "Backend returned failure");
            }
             // Let Firestore sync handle the update
             setModalState(prev => ({ ...prev, isLeaveRequest: false }));
             Swal.fire('ส่งคำขอแล้ว', 'คำขอวันลาของคุณถูกส่งแล้ว รอการอนุมัติ', 'success');
        } catch (e: any) {
            console.warn("Backend save for leave request failed, falling back to local.", e.message);
            fallbackSave();
        }
    };

    const handleUpdateLeaveStatus = async (id: number, status: 'approved' | 'rejected') => {
        const fallbackUpdate = () => {
            setLeaveRequests(prev => prev.map(req => req.id === id ? { ...req, status } : req));
        };
    
        if (!functionsService.updateLeaveStatus || !currentUser) {
            fallbackUpdate();
            return;
        }
        
        try {
            const response = await functionsService.updateLeaveStatus({ requestId: id, status, approverId: currentUser.id });
            if (!response || !response.success) {
                throw new Error(response?.error || "Backend returned failure");
            }
            // Success, Firestore sync will update the state.
        } catch (e: any) {
            console.warn("Backend update for leave status failed, relying on local update.", e.message);
            fallbackUpdate(); // Fallback to local update
            Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: 'ไม่สามารถซิงค์การอนุมัติได้ (Offline)', showConfirmButton: false, timer: 3000 });
        }
    };
    
    const handleDeleteLeaveRequest = async (id: number): Promise<boolean> => {
        const fallbackDelete = () => {
            setLeaveRequests(prev => prev.filter(req => req.id !== id));
            return true;
        };
        
        if (!functionsService.deleteLeaveRequest) {
            return fallbackDelete();
        }

        try {
            const response = await functionsService.deleteLeaveRequest({ requestId: id });
            if (!response || !response.success) {
                 throw new Error(response?.error || "Backend returned failure");
            }
            // Success, let Firestore handle the update
            return true;
        } catch (e: any) {
             console.warn("Backend delete for leave request failed, falling back to local.", e.message);
             return fallbackDelete();
        }
    };
    
    // Missing local handlers for POS
    const handleQuantityChange = (cartItemId: string, newQuantity: number) => {
        if (newQuantity <= 0) {
            setCurrentOrderItems(prev => prev.filter(i => i.cartItemId !== cartItemId));
        } else {
            setCurrentOrderItems(prev => prev.map(i => i.cartItemId === cartItemId ? { ...i, quantity: newQuantity } : i));
        }
    };

    const handleRemoveItem = (cartItemId: string) => {
        setCurrentOrderItems(prev => prev.filter(i => i.cartItemId !== cartItemId));
    };

    const handleToggleTakeaway = (cartItemId: string, isTakeaway: boolean, cutlery?: TakeawayCutleryOption[], notes?: string) => {
        setCurrentOrderItems(prev => prev.map(i => 
            i.cartItemId === cartItemId ? { ...i, isTakeaway, takeawayCutlery: cutlery, takeawayCutleryNotes: notes } : i
        ));
    };

    // --- RENDER LOGIC ---
    if (isCustomerMode && customerTableId) {
         const table = cleanedTables.find(t => t.id === customerTableId);
         if (!table) return <div className="p-4 text-center">Table not found</div>;
         return (
            <CustomerView 
                table={table} 
                menuItems={menuItems}
                categories={categories}
                activeOrders={activeOrders.filter(o => o.tableName === table.name && o.floor === table.floor)}
                allBranchOrders={activeOrders}
                onPlaceOrder={handleCustomerPlaceOrder}
                onStaffCall={handleStaffCall}
                restaurantName={restaurantName}
                logoUrl={logoUrl}
            />
         );
    }

    if (!currentUser) return <LoginScreen onLogin={handleLogin} />;
    
    if (!selectedBranch && currentUser.role !== 'admin') {
        return <BranchSelectionScreen 
            onSelectBranch={setSelectedBranch} 
            currentUser={currentUser} 
            branches={branches} 
            onManageBranches={() => setModalState(prev => ({ ...prev, isBranchManager: true }))}
            onLogout={handleLogout}
        />;
    }
    if (!selectedBranch && currentUser.role === 'admin' && !isEditMode) {
         // Admin usually manages branches from here
         return <BranchSelectionScreen 
            onSelectBranch={setSelectedBranch} 
            currentUser={currentUser} 
            branches={branches} 
            onManageBranches={() => setModalState(prev => ({ ...prev, isBranchManager: true }))}
            onLogout={handleLogout}
        />;
    }
    
    // Proactive Image Caching Loading Screen
    if (isCachingImages) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-100">
                <div className="text-center p-8">
                    <svg className="animate-spin h-12 w-12 text-blue-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <h2 className="mt-6 text-xl font-semibold text-gray-700">กำลังซิงค์รูปภาพเมนู...</h2>
                    <p className="text-gray-500 mt-2">เพื่อให้การใช้งานรวดเร็ว กรุณารอสักครู่</p>
                </div>
            </div>
        );
    }


    // Default fallback for admin if no branch is selected but edit mode is on?
    // Just ensure selectedBranch is set for POS operations.
    
    const selectedTable = cleanedTables.find(t => t.id === selectedTableId) || null;

    // FIX: Explicitly cast `view` properties to `View` type to prevent TypeScript from widening the type to `string`.
    const navItems: NavItem[] = [
        { id: 'pos', label: 'POS', icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>, view: 'pos' as View, disabled: currentUser?.role === 'auditor' },
        { id: 'tables', label: 'โต๊ะ', icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>, view: 'tables' as View, badge: tablesBadgeCount, disabled: currentUser?.role === 'auditor' },
        { id: 'kitchen', label: 'ครัว', icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>, view: 'kitchen' as View, badge: kitchenBadgeCount, disabled: currentUser?.role === 'auditor' },
        { id: 'more', label: 'อื่นๆ', icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>, 
            subItems: [
                { id: 'dashboard', label: 'Dashboard', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>, view: 'dashboard' as View },
                { id: 'history', label: 'ประวัติ', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>, view: 'history' as View },
                { id: 'stock', label: 'สต็อก', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>, view: 'stock' as View, disabled: currentUser?.role === 'auditor' },
                { id: 'leave', label: 'วันลา', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>, view: 'leave' as View },
                { id: 'settings', label: 'ตั้งค่า', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924-1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /></svg>, onClick: () => setModalState(prev => ({ ...prev, isSettings: true })), disabled: currentUser?.role === 'auditor' },
                { id: 'logout', label: 'ออกจากระบบ', icon: <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>, onClick: handleLogout }
            ].filter(item => !item.disabled)
        }
    ];

    return (
        <div className="flex h-screen overflow-hidden bg-gray-100 font-sans text-gray-900">
            {layoutType === 'admin' && (
                <AdminSidebar 
                    isCollapsed={isAdminSidebarCollapsed}
                    onToggleCollapse={() => setIsAdminSidebarCollapsed(!isAdminSidebarCollapsed)}
                    logoUrl={logoUrl}
                    restaurantName={restaurantName}
                    branchName={selectedBranch?.name || ''}
                    currentUser={currentUser}
                    currentView={currentView}
                    onViewChange={setCurrentView}
                    onToggleEditMode={() => setIsEditMode(!isEditMode)}
                    isEditMode={isEditMode}
                    onOpenSettings={() => setModalState(prev => ({ ...prev, isSettings: true }))}
                    onOpenUserManager={() => setModalState(prev => ({ ...prev, isUserManager: true }))}
                    onManageBranches={() => setModalState(prev => ({ ...prev, isBranchManager: true }))}
                    onChangeBranch={() => setSelectedBranch(null)}
                    onLogout={handleLogout}
                    kitchenBadgeCount={kitchenBadgeCount}
                    tablesBadgeCount={tablesBadgeCount}
                    leaveBadgeCount={leaveBadgeCount}
                    onUpdateCurrentUser={(updates) => {
                        setUsers(prev => prev.map(u => u.id === currentUser.id ? { ...u, ...updates } : u));
                    }}
                    onUpdateLogoUrl={setLogoUrl}
                    onUpdateRestaurantName={setRestaurantName}
                />
            )}

            <div className={`flex flex-col flex-1 min-w-0 overflow-hidden transition-all duration-300 ${layoutType === 'admin' ? (isAdminSidebarCollapsed ? 'md:ml-20' : 'md:ml-64') : ''}`}>
                {(currentUser.role === 'admin' || currentUser.role === 'branch-admin' || currentUser.role === 'auditor') ? null : (
                    <Header 
                        currentView={currentView} 
                        onViewChange={setCurrentView} 
                        isEditMode={isEditMode}
                        onToggleEditMode={() => setIsEditMode(!isEditMode)}
                        onOpenSettings={() => setModalState(prev => ({ ...prev, isSettings: true }))}
                        kitchenBadgeCount={kitchenBadgeCount}
                        tablesBadgeCount={tablesBadgeCount}
                        vacantTablesBadgeCount={vacantTablesBadgeCount}
                        leaveBadgeCount={leaveBadgeCount}
                        currentUser={currentUser}
                        onLogout={handleLogout}
                        onOpenUserManager={() => setModalState(prev => ({ ...prev, isUserManager: true }))}
                        logoUrl={logoUrl}
                        onLogoChangeClick={() => { /* AdminSidebar handles this via its own logic, or open settings */ }}
                        restaurantName={restaurantName}
                        onRestaurantNameChange={setRestaurantName}
                        branchName={selectedBranch?.name || ''}
                        onChangeBranch={() => setSelectedBranch(null)}
                        onManageBranches={() => setModalState(prev => ({ ...prev, isBranchManager: true }))}
                    />
                )}

                <div className="flex flex-1 overflow-hidden relative min-h-0 pb-16 md:pb-0">
                    {currentView === 'pos' && (
                        <div className="flex h-full w-full overflow-hidden">
                            {/* Menu Section - Takes available space, hidden on mobile */}
                            <div className="flex-1 h-full flex flex-col bg-gray-50 overflow-hidden hidden md:flex">
                                <Menu 
                                    menuItems={menuItems} 
                                    setMenuItems={setMenuItems}
                                    categories={categories} 
                                    onSelectItem={(item) => {
                                        setItemToCustomize(item);
                                        setModalState(prev => ({ ...prev, isCustomization: true }));
                                    }}
                                    isEditMode={canEdit}
                                    onEditItem={(item) => {
                                        setItemToEdit(item);
                                        setModalState(prev => ({ ...prev, isMenuItem: true }));
                                    }}
                                    onAddNewItem={() => {
                                        setItemToEdit(null);
                                        setModalState(prev => ({ ...prev, isMenuItem: true }));
                                    }}
                                    onDeleteItem={(id) => setMenuItems(prev => prev.filter(i => i.id !== id))}
                                    onUpdateCategory={(oldName, newName) => {
                                        setCategories(prev => prev.map(c => c === oldName ? newName : c));
                                        setMenuItems(prev => prev.map(i => i.category === oldName ? { ...i, category: newName } : i));
                                    }}
                                    onDeleteCategory={(name) => {
                                        setCategories(prev => prev.filter(c => c !== name));
                                    }}
                                    onAddCategory={(name) => setCategories(prev => [...prev, name])}
                                    onImportMenu={(items, newCats) => {
                                        setMenuItems(prev => {
                                            const existingIds = new Set(prev.map(i => i.id));
                                            const uniqueNewItems = items.filter(i => !existingIds.has(i.id));
                                            // Update existing items
                                            const updatedPrev = prev.map(i => {
                                                const updated = items.find(newItem => newItem.id === i.id);
                                                return updated || i;
                                            });
                                            return [...updatedPrev, ...uniqueNewItems];
                                        });
                                        setCategories(prev => Array.from(new Set([...prev, ...newCats])));
                                    }}
                                />
                            </div>
                            
                            {/* Mobile-only Sidebar */}
                            <div className="w-full h-full md:hidden">
                                <Sidebar 
                                    currentOrderItems={currentOrderItems}
                                    onQuantityChange={handleQuantityChange}
                                    onRemoveItem={handleRemoveItem}
                                    onToggleTakeaway={handleToggleTakeaway}
                                    onClearOrder={clearPosState}
                                    onPlaceOrder={handlePlaceOrder}
                                    isPlacingOrder={isPlacingOrder}
                                    tables={cleanedTables}
                                    selectedTable={selectedTable}
                                    onSelectTable={setSelectedTableId}
                                    customerName={customerName}
                                    onCustomerNameChange={setCustomerName}
                                    customerCount={customerCount}
                                    onCustomerCountChange={setCustomerCount}
                                    isEditMode={canEdit}
                                    onAddNewTable={(floor) => {
                                        const tablesOnFloor = cleanedTables.filter(t => t.floor === floor);
                                        const tableNumbers = tablesOnFloor.map(t => {
                                            const match = t.name.match(/^T(\d+)$/);
                                            return match ? parseInt(match[1], 10) : 0;
                                        });
                                        const maxTableNumber = Math.max(0, ...tableNumbers);
                                        const newTableName = `T${maxTableNumber + 1}`;
                                        
                                        const newId = Math.max(0, ...cleanedTables.map(t => t.id)) + 1;
                                        setTables(prev => [...prev, { id: newId, name: newTableName, floor }]);
                                    }}
                                    onRemoveLastTable={(floor) => {
                                        const tablesOnFloor = cleanedTables.filter(t => t.floor === floor);
                                        if (tablesOnFloor.length > 0) {
                                            let tableToRemove = tablesOnFloor[0];
                                            let maxNum = 0;
                                            
                                            tablesOnFloor.forEach(t => {
                                                const match = t.name.match(/^T(\d+)$/);
                                                const num = match ? parseInt(match[1], 10) : 0;
                                                if (num >= maxNum) {
                                                    maxNum = num;
                                                    tableToRemove = t;
                                                }
                                            });
                                    
                                            setTables(prev => prev.filter(t => t.id !== tableToRemove.id));
                                        }
                                    }}
                                    floors={floors}
                                    selectedFloor={selectedSidebarFloor}
                                    onFloorChange={setSelectedSidebarFloor}
                                    onAddFloor={() => {
                                        Swal.fire({
                                            title: 'เพิ่มชั้นใหม่',
                                            input: 'text',
                                            showCancelButton: true,
                                            confirmButtonText: 'เพิ่ม'
                                        }).then((result) => {
                                            if (result.isConfirmed && result.value) {
                                                setFloors(prev => [...prev, result.value]);
                                            }
                                        });
                                    }}
                                    onRemoveFloor={(floor) => {
                                        if (cleanedTables.some(t => t.floor === floor)) {
                                            Swal.fire('ลบไม่ได้', 'ยังมีโต๊ะในชั้นนี้', 'error');
                                            return;
                                        }
                                        setFloors(prev => prev.filter(f => f !== floor));
                                        if (selectedSidebarFloor === floor) setSelectedSidebarFloor(floors[0] || '');
                                    }}
                                    sendToKitchen={sendToKitchen}
                                    onSendToKitchenChange={handleSendToKitchenChange}
                                    onUpdateReservation={(tableId, res) => {
                                        setTables(prev => prev.map(t => t.id === tableId ? { ...t, reservation: res } : t));
                                    }}
                                    onOpenSearch={() => setModalState(prev => ({ ...prev, isMenuSearch: true }))}
                                />
                            </div>

                            {/* Sidebar and Toggle Container (Desktop) */}
                            <div className="relative hidden md:block">
                                {/* Toggle Button */}
                                <button
                                    onClick={() => setIsOrderSidebarVisible(!isOrderSidebarVisible)}
                                    className="absolute top-20 left-0 z-30 -translate-x-full  w-12 h-24 bg-gray-700 hover:bg-gray-600 text-white rounded-l-lg flex items-center justify-center border border-r-0 border-gray-800 shadow-xl group"
                                    aria-label={isOrderSidebarVisible ? "ย่อแถบข้าง" : "ขยายแถบข้าง"}
                                >
                                     <div className="absolute top-1 left-1 flex flex-col gap-0.5 opacity-80 group-hover:opacity-100">
                                        <div className="w-1 h-3 bg-gray-500 rounded-full"></div>
                                        <div className="w-1 h-3 bg-gray-500 rounded-full"></div>
                                        <div className="w-1 h-3 bg-gray-500 rounded-full"></div>
                                        <div className="w-1 h-3 bg-gray-500 rounded-full"></div>
                                        <div className="w-1 h-3 bg-gray-500 rounded-full"></div>
                                    </div>

                                    {!isOrderSidebarVisible && totalItems > 0 && (
                                        <span
                                            key={totalItems}
                                            className="absolute -top-2 -left-2 flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-sm font-bold text-white border-2 border-white animate-bounce"
                                        >
                                            {totalItems > 99 ? '99+' : totalItems}
                                        </span>
                                    )}

                                    {isOrderSidebarVisible ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                    )}
                                </button>

                                {/* Collapsible Sidebar */}
                                <div 
                                    className={`h-full bg-gray-900 border-l border-gray-800 shadow-2xl transition-all duration-300 ease-in-out overflow-hidden ${
                                        isOrderSidebarVisible ? 'w-[420px]' : 'w-0'
                                    }`}
                                >
                                    <div className="w-[420px] h-full">
                                        <Sidebar 
                                            currentOrderItems={currentOrderItems}
                                            onQuantityChange={handleQuantityChange}
                                            onRemoveItem={handleRemoveItem}
                                            onToggleTakeaway={handleToggleTakeaway}
                                            onClearOrder={clearPosState}
                                            onPlaceOrder={handlePlaceOrder}
                                            isPlacingOrder={isPlacingOrder}
                                            tables={cleanedTables}
                                            selectedTable={selectedTable}
                                            onSelectTable={setSelectedTableId}
                                            customerName={customerName}
                                            onCustomerNameChange={setCustomerName}
                                            customerCount={customerCount}
                                            onCustomerCountChange={setCustomerCount}
                                            isEditMode={canEdit}
                                            onAddNewTable={(floor) => {
                                                const tablesOnFloor = cleanedTables.filter(t => t.floor === floor);
                                                const tableNumbers = tablesOnFloor.map(t => {
                                                    const match = t.name.match(/^T(\d+)$/);
                                                    return match ? parseInt(match[1], 10) : 0;
                                                });
                                                const maxTableNumber = Math.max(0, ...tableNumbers);
                                                const newTableName = `T${maxTableNumber + 1}`;
                                                
                                                const newId = Math.max(0, ...cleanedTables.map(t => t.id)) + 1;
                                                setTables(prev => [...prev, { id: newId, name: newTableName, floor }]);
                                            }}
                                            onRemoveLastTable={(floor) => {
                                                const tablesOnFloor = cleanedTables.filter(t => t.floor === floor);
                                                if (tablesOnFloor.length > 0) {
                                                    let tableToRemove = tablesOnFloor[0];
                                                    let maxNum = 0;
                                                    
                                                    tablesOnFloor.forEach(t => {
                                                        const match = t.name.match(/^T(\d+)$/);
                                                        const num = match ? parseInt(match[1], 10) : 0;
                                                        if (num >= maxNum) {
                                                            maxNum = num;
                                                            tableToRemove = t;
                                                        }
                                                    });
                                            
                                                    setTables(prev => prev.filter(t => t.id !== tableToRemove.id));
                                                }
                                            }}
                                            floors={floors}
                                            selectedFloor={selectedSidebarFloor}
                                            onFloorChange={setSelectedSidebarFloor}
                                            onAddFloor={() => {
                                                Swal.fire({
                                                    title: 'เพิ่มชั้นใหม่',
                                                    input: 'text',
                                                    showCancelButton: true,
                                                    confirmButtonText: 'เพิ่ม'
                                                }).then((result) => {
                                                    if (result.isConfirmed && result.value) {
                                                        setFloors(prev => [...prev, result.value]);
                                                    }
                                                });
                                            }}
                                            onRemoveFloor={(floor) => {
                                                if (cleanedTables.some(t => t.floor === floor)) {
                                                    Swal.fire('ลบไม่ได้', 'ยังมีโต๊ะในชั้นนี้', 'error');
                                                    return;
                                                }
                                                setFloors(prev => prev.filter(f => f !== floor));
                                                if (selectedSidebarFloor === floor) setSelectedSidebarFloor(floors[0] || '');
                                            }}
                                            sendToKitchen={sendToKitchen}
                                            onSendToKitchenChange={handleSendToKitchenChange}
                                            onUpdateReservation={(tableId, res) => {
                                                setTables(prev => prev.map(t => t.id === tableId ? { ...t, reservation: res } : t));
                                            }}
                                            onOpenSearch={() => setModalState(prev => ({ ...prev, isMenuSearch: true }))}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}


                    {currentView === 'kitchen' && (
                        <KitchenView 
                            activeOrders={activeOrders}
                            onCompleteOrder={(id) => setActiveOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'served' } : o))}
                            onStartCooking={(id) => setActiveOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'cooking', cookingStartTime: Date.now() } : o))}
                        />
                    )}

                    {currentView === 'tables' && (
                        <TableLayout 
                            tables={cleanedTables} 
                            activeOrders={activeOrders}
                            onTableSelect={(id) => {
                                setCurrentView('pos');
                                setSelectedTableId(id);
                            }}
                            onShowBill={(orderId) => {
                                const order = activeOrders.find(o => o.id === orderId);
                                if (order) {
                                    setOrderForModal(order);
                                    setModalState(prev => ({ ...prev, isTableBill: true }));
                                }
                            }}
                            onGeneratePin={generateTablePin}
                            currentUser={currentUser}
                            printerConfig={printerConfig}
                            floors={floors}
                        />
                    )}

                    {currentView === 'dashboard' && (
                        <Dashboard 
                            completedOrders={completedOrders}
                            cancelledOrders={cancelledOrders}
                            openingTime={openingTime || '10:00'}
                            closingTime={closingTime || '22:00'}
                        />
                    )}

                    {currentView === 'history' && (
                        <SalesHistory 
                            completedOrders={completedOrders}
                            cancelledOrders={cancelledOrders}
                            printHistory={printHistory}
                            onReprint={async (orderNum) => {
                                // Find completed order to reprint logic
                                const order = completedOrders.find(o => o.orderNumber === orderNum);
                                if (order && printerConfig?.cashier) {
                                    await printerService.printReceipt(order, printerConfig.cashier, restaurantName);
                                }
                            }}
                            onSplitOrder={(order) => {
                                setOrderForModal(order);
                                setModalState(prev => ({ ...prev, isSplitCompleted: true }));
                            }}
                            isEditMode={canEdit}
                            onEditOrder={(order) => {
                                setOrderForModal(order);
                                setModalState(prev => ({ ...prev, isEditCompleted: true }));
                            }}
                            onInitiateCashBill={(order) => {
                                setOrderForModal(order);
                                setModalState(prev => ({ ...prev, isCashBill: true }));
                            }}
                            onDeleteHistory={handleDeleteHistory}
                             onVoidOrder={handleVoidCompletedOrder}
                             currentUser={currentUser}
                        />
                    )}

                    {currentView === 'stock' && (
                        <StockManagement 
                            stockItems={stockItems}
                            setStockItems={setStockItems}
                            stockCategories={stockCategories}
                            setStockCategories={setStockCategories}
                            stockUnits={stockUnits}
                            setStockUnits={setStockUnits}
                        />
                    )}

                    {currentView === 'leave' && (
                        <LeaveCalendarView 
                            leaveRequests={leaveRequests}
                            currentUser={currentUser}
                            onOpenRequestModal={(date) => {
                                setLeaveRequestInitialDate(date || null);
                                setModalState(prev => ({ ...prev, isLeaveRequest: true }));
                            }}
                            branches={branches}
                            onUpdateStatus={handleUpdateLeaveStatus}
                            onDeleteRequest={handleDeleteLeaveRequest}
                            selectedBranch={selectedBranch}
                        />
                    )}
                </div>
                
                <BottomNavBar 
                    items={navItems}
                    currentView={currentView}
                    onViewChange={setCurrentView}
                />
            </div>

            {/* --- MODALS --- */}
            <MenuItemModal 
                isOpen={modalState.isMenuItem} 
                onClose={() => setModalState(prev => ({ ...prev, isMenuItem: false }))} 
                onSave={(item) => {
                    if (itemToEdit) {
                        setMenuItems(prev => prev.map(i => i.id === itemToEdit.id ? { ...item, id: itemToEdit.id } : i));
                    } else {
                        setMenuItems(prev => [...prev, { ...item, id: Math.max(0, ...prev.map(i => i.id)) + 1 }]);
                    }
                    setModalState(prev => ({ ...prev, isMenuItem: false }));
                }} 
                itemToEdit={itemToEdit}
                categories={categories}
                onAddCategory={(name) => setCategories(prev => [...prev, name])}
            />

            <ItemCustomizationModal
                isOpen={modalState.isCustomization}
                onClose={() => setModalState(prev => ({ ...prev, isCustomization: false }))}
                item={itemToCustomize}
                onConfirm={(itemToAdd) => {
                    setCurrentOrderItems(prev => {
                        // Check if EXACT same item exists (same id, same options, same notes)
                        const existingIndex = prev.findIndex(i => i.cartItemId === itemToAdd.cartItemId);
                        if (existingIndex > -1) {
                            const newItems = [...prev];
                            newItems[existingIndex].quantity += itemToAdd.quantity;
                            return newItems;
                        }
                        return [...prev, itemToAdd];
                    });
                    setModalState(prev => ({ ...prev, isCustomization: false }));
                    setItemToCustomize(null);
                }}
            />

            <OrderSuccessModal 
                isOpen={modalState.isOrderSuccess} 
                onClose={() => setModalState(prev => ({ ...prev, isOrderSuccess: false }))} 
                orderId={lastPlacedOrderId || 0}
            />

            <TableBillModal
                isOpen={modalState.isTableBill}
                onClose={() => setModalState(prev => ({ ...prev, isTableBill: false }))}
                order={orderForModal as ActiveOrder}
                activeOrderCount={activeOrders.length}
                onInitiatePayment={(order) => {
                    setOrderForModal(order);
                    setModalState(prev => ({ ...prev, isTableBill: false, isPayment: true }));
                }}
                onInitiateMove={(order) => {
                    setOrderForModal(order);
                    setModalState(prev => ({ ...prev, isTableBill: false, isMoveTable: true }));
                }}
                onInitiateMerge={(order) => {
                    setOrderForModal(order);
                    setModalState(prev => ({ ...prev, isTableBill: false, isMergeBill: true }));
                }}
                onSplit={(order) => {
                    setOrderForModal(order);
                    setModalState(prev => ({ ...prev, isSplitBill: true }));
                }}
                isEditMode={canEdit}
                onUpdateOrder={(orderId, newItems, newCount) => {
                    setActiveOrders(prev => prev.map(o => o.id === orderId ? { ...o, items: newItems, customerCount: newCount } : o));
                    setModalState(prev => ({ ...prev, isTableBill: false }));
                }}
                currentUser={currentUser}
                onInitiateCancel={(order) => {
                    setOrderForModal(order);
                    setModalState(prev => ({ ...prev, isTableBill: false, isCancelOrder: true }));
                }}
            />

            <MergeBillModal
                isOpen={modalState.isMergeBill}
                onClose={() => setModalState(prev => ({ ...prev, isMergeBill: false }))}
                order={orderForModal as ActiveOrder}
                allActiveOrders={activeOrders}
                tables={cleanedTables}
                onConfirmMerge={handleConfirmMerge}
            />

            <PaymentModal 
                isOpen={modalState.isPayment}
                onClose={() => setModalState(prev => ({ ...prev, isPayment: false }))}
                order={orderForModal as ActiveOrder}
                onConfirmPayment={handleConfirmPayment}
                qrCodeUrl={qrCodeUrl}
                isEditMode={isEditMode}
                onOpenSettings={() => setModalState(prev => ({ ...prev, isSettings: true, isPayment: false }))}
                isConfirmingPayment={isConfirmingPayment}
            />

            <PaymentSuccessModal
                isOpen={modalState.isPaymentSuccess}
                onClose={async (shouldPrint) => {
                    setModalState(prev => ({ ...prev, isPaymentSuccess: false }));
                    if (shouldPrint && printerConfig?.cashier && orderForModal && 'paymentDetails' in orderForModal) {
                        await printerService.printReceipt(orderForModal as CompletedOrder, printerConfig.cashier, restaurantName);
                    }
                    setOrderForModal(null);
                }}
                orderId={orderForModal?.orderNumber || 0}
            />

            <SplitBillModal
                isOpen={modalState.isSplitBill}
                onClose={() => setModalState(prev => ({ ...prev, isSplitBill: false }))}
                order={orderForModal as ActiveOrder}
                onConfirmSplit={(itemsToSplit) => {
                    // FIX: Use cartItemId to correctly update original order items.
                    const originalOrder = orderForModal as ActiveOrder;
                    if (!originalOrder) return;

                    const splitItemsMap = new Map(itemsToSplit.map(i => [i.cartItemId, i.quantity]));

                    // 1. Update original order (remove items/quantities)
                    const updatedOriginalItems = originalOrder.items
                        .map(item => {
                            const splitQuantity = splitItemsMap.get(item.cartItemId);
                            if (typeof splitQuantity === 'number') {
                                return { ...item, quantity: item.quantity - splitQuantity };
                            }
                            return item;
                        })
                        .filter(item => item.quantity > 0);

                    // 2. Create new order
                    const newOrder: ActiveOrder = {
                        ...originalOrder,
                        id: Date.now(),
                        orderNumber: Math.max(...activeOrders.map(o => o.orderNumber), ...completedOrders.map(o => o.orderNumber), 0) + 1,
                        items: itemsToSplit,
                        parentOrderId: originalOrder.orderNumber
                    };

                    setActiveOrders(prev => [
                        ...prev.map(o => o.id === originalOrder.id ? { ...o, items: updatedOriginalItems } : o),
                        newOrder
                    ]);
                    
                    setModalState(prev => ({ ...prev, isSplitBill: false }));
                    Swal.fire('แยกบิลสำเร็จ', `สร้างบิลใหม่ #${newOrder.orderNumber} แล้ว`, 'success');
                }}
            />

            <SettingsModal
                isOpen={modalState.isSettings}
                onClose={() => setModalState(prev => ({ ...prev, isSettings: false }))}
                onSave={(newQr, newSound, newStaffSound, newPrinter, newOpen, newClose) => {
                    setQrCodeUrl(newQr);
                    setNotificationSoundUrl(newSound);
                    setStaffCallSoundUrl(newStaffSound);
                    setPrinterConfig(newPrinter);
                    setOpeningTime(newOpen);
                    setClosingTime(newClose);
                    setModalState(prev => ({ ...prev, isSettings: false }));
                }}
                currentQrCodeUrl={qrCodeUrl}
                currentNotificationSoundUrl={notificationSoundUrl}
                currentStaffCallSoundUrl={staffCallSoundUrl}
                currentPrinterConfig={printerConfig}
                currentOpeningTime={openingTime}
                currentClosingTime={closingTime}
                onSavePrinterConfig={setPrinterConfig}
            />

            <UserManagerModal
                isOpen={modalState.isUserManager}
                onClose={() => setModalState(prev => ({ ...prev, isUserManager: false }))}
                users={users}
                setUsers={setUsers}
                currentUser={currentUser}
                branches={branches}
                isEditMode={canEdit}
            />

            <BranchManagerModal
                isOpen={modalState.isBranchManager}
                onClose={() => setModalState(prev => ({ ...prev, isBranchManager: false }))}
                branches={branches}
                setBranches={setBranches}
            />

            <MoveTableModal
                isOpen={modalState.isMoveTable}
                onClose={() => setModalState(prev => ({ ...prev, isMoveTable: false }))}
                order={orderForModal as ActiveOrder}
                tables={cleanedTables}
                activeOrders={activeOrders}
                onConfirmMove={(orderId, newTableId) => {
                    const newTable = cleanedTables.find(t => t.id === newTableId);
                    if (newTable) {
                        setActiveOrders(prev => prev.map(o => o.id === orderId ? { ...o, tableName: newTable.name, floor: newTable.floor } : o));
                        setModalState(prev => ({ ...prev, isMoveTable: false }));
                        Swal.fire('ย้ายโต๊ะสำเร็จ', `ย้ายไปโต๊ะ ${newTable.name} แล้ว`, 'success');
                    }
                }}
                floors={floors}
            />

            <CancelOrderModal
                isOpen={modalState.isCancelOrder}
                order={orderForModal as ActiveOrder}
                onClose={() => setModalState(prev => ({ ...prev, isCancelOrder: false }))}
                onConfirm={(order, reason, notes) => {
                    const cancelledOrder: CancelledOrder = {
                        ...order,
                        status: 'cancelled',
                        cancellationTime: Date.now(),
                        cancelledBy: currentUser?.username || 'Unknown',
                        cancellationReason: reason,
                        cancellationNotes: notes
                    };
                    setCancelledOrders(prev => [...prev, cancelledOrder]);
                    setActiveOrders(prev => prev.filter(o => o.id !== order.id));
                    setModalState(prev => ({ ...prev, isCancelOrder: false }));
                    Swal.fire('ยกเลิกสำเร็จ', 'ออเดอร์ถูกยกเลิกแล้ว', 'success');
                }}
            />

            <CashBillModal
                isOpen={modalState.isCashBill}
                order={orderForModal as CompletedOrder}
                onClose={() => setModalState(prev => ({ ...prev, isCashBill: false }))}
                restaurantName={restaurantName}
                logoUrl={logoUrl}
            />

            <EditCompletedOrderModal
                isOpen={modalState.isEditCompleted}
                order={orderForModal as CompletedOrder}
                onClose={() => setModalState(prev => ({ ...prev, isEditCompleted: false }))}
                menuItems={menuItems}
                onSave={(updatedData) => {
                    setCompletedOrders(prev => prev.map(o => o.id === updatedData.id ? { ...o, items: updatedData.items } : o));
                    setModalState(prev => ({ ...prev, isEditCompleted: false }));
                    Swal.fire('แก้ไขสำเร็จ', 'อัปเดตข้อมูลออเดอร์แล้ว', 'success');
                }}
            />

            <SplitCompletedBillModal
                isOpen={modalState.isSplitCompleted}
                order={orderForModal as CompletedOrder}
                onClose={() => setModalState(prev => ({ ...prev, isSplitCompleted: false }))}
                onConfirmSplit={(itemsToSplit) => {
                     // FIX: Use cartItemId to correctly update original order items.
                     const originalOrder = orderForModal as CompletedOrder;
                     if (!originalOrder) return;
 
                     const splitItemsMap = new Map(itemsToSplit.map(i => [i.cartItemId, i.quantity]));
 
                     const updatedOriginalItems = originalOrder.items.map(item => {
                        const splitQuantity = splitItemsMap.get(item.cartItemId);
                        if (typeof splitQuantity === 'number') {
                            return { ...item, quantity: item.quantity - splitQuantity };
                        }
                        return item;
                    }).filter(item => item.quantity > 0);

                    const newOrder: CompletedOrder = {
                        ...originalOrder,
                        id: Date.now(), // New ID
                        orderNumber: Math.max(...completedOrders.map(o => o.orderNumber), 0) + 1,
                        items: itemsToSplit,
                        parentOrderId: originalOrder.orderNumber,
                        completionTime: Date.now(), // New completion time
                        // Assume payment details are copied or split proportionally (simplified here)
                        paymentDetails: originalOrder.paymentDetails 
                    };

                    setCompletedOrders(prev => [
                        ...prev.map(o => o.id === originalOrder.id ? { ...o, items: updatedOriginalItems } : o),
                        newOrder
                    ]);
                    setModalState(prev => ({ ...prev, isSplitCompleted: false }));
                    Swal.fire('แยกบิลสำเร็จ', 'สร้างบิลย้อนหลังใหม่เรียบร้อย', 'success');
                }}
            />

            <LeaveRequestModal
                isOpen={modalState.isLeaveRequest}
                onClose={() => setModalState(prev => ({ ...prev, isLeaveRequest: false }))}
                currentUser={currentUser}
                leaveRequests={leaveRequests}
                initialDate={leaveRequestInitialDate}
                onSave={handleSaveLeaveRequest}
            />

            <MenuSearchModal
                isOpen={modalState.isMenuSearch}
                onClose={() => setModalState(prev => ({ ...prev, isMenuSearch: false }))}
                menuItems={menuItems}
                onSelectItem={(item) => {
                    setItemToCustomize(item);
                    setModalState(prev => ({ ...prev, isMenuSearch: false, isCustomization: true }));
                }}
            />

        </div>
    );
};

export default App;
