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
    StaffCall,
    PaymentDetails,
    CancellationReason
} from './types';
import { useFirestoreSync } from './hooks/useFirestoreSync';
import { functionsService } from './services/firebaseFunctionsService';
import { printerService } from './services/printerService';
import firebase from 'firebase/compat/app';
import 'firebase/compat/messaging';
import { isFirebaseConfigured, db } from './firebaseConfig';

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
    // ============================================================================
    // 1. STATE INITIALIZATION
    // ============================================================================

    // --- RESPONSIVE STATE ---
    const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);

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
    const branchId = selectedBranch ? selectedBranch.id.toString() : null;
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
    const [orderCounter, setOrderCounter] = useFirestoreSync<number>(branchId, 'orderCounter', 0);


    // --- POS-SPECIFIC LOCAL STATE ---
    const [currentOrderItems, setCurrentOrderItems] = useState<OrderItem[]>([]);
    const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
    const [customerName, setCustomerName] = useState('');
    const [customerCount, setCustomerCount] = useState(1);
    const [selectedSidebarFloor, setSelectedSidebarFloor] = useState<string>('');
    const [notSentToKitchenDetails, setNotSentToKitchenDetails] = useState<{ reason: string; notes: string } | null>(null);

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
    const [orderItemToEdit, setOrderItemToEdit] = useState<OrderItem | null>(null); // State for the specific OrderItem being edited
    const [orderForModal, setOrderForModal] = useState<ActiveOrder | CompletedOrder | null>(null);
    const [lastPlacedOrderId, setLastPlacedOrderId] = useState<number | null>(null);
    const [leaveRequestInitialDate, setLeaveRequestInitialDate] = useState<Date | null>(null);

    // --- ASYNC OPERATION STATE ---
    const [isPlacingOrder, setIsPlacingOrder] = useState(false);
    const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);
    const [isCachingImages, setIsCachingImages] = useState(false);
    const imageCacheTriggeredRef = useRef(false);
    const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);

    // --- REFS ---
    const prevActiveOrdersRef = useRef<ActiveOrder[] | undefined>(undefined);
    const prevLeaveRequestsRef = useRef<LeaveRequest[]>([]);
    const isInitialLeaveLoadRef = useRef(true);
    const staffCallAudioRef = useRef<HTMLAudioElement | null>(null);
    const prevUserRef = useRef<User | null>(null);
    const activeCallRef = useRef<StaffCall | null>(null);
    const overdueTimersRef = useRef<Map<number, number>>(new Map());

    // ============================================================================
    // 2. COMPUTED VALUES (MEMO)
    // ============================================================================
    
    const waitingBadgeCount = useMemo(() => activeOrders.filter(o => o.status === 'waiting').length, [activeOrders]);
    const cookingBadgeCount = useMemo(() => activeOrders.filter(o => o.status === 'cooking').length, [activeOrders]);
    const totalKitchenBadgeCount = waitingBadgeCount + cookingBadgeCount;

    const occupiedTablesCount = useMemo(() => {
        const occupiedTableIds = new Set(
            activeOrders
                .filter(o => tables.some(t => t.id === o.tableId)) // Only count orders for existing tables
                .map(o => o.tableId)
        );
        return occupiedTableIds.size;
    }, [activeOrders, tables]);
    const tablesBadgeCount = occupiedTablesCount > 0 ? occupiedTablesCount : 0;

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

    const mobileNavItems = useMemo(() => {
        const items: NavItem[] = [
            {id: 'pos', label: 'POS', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" /><path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h2a1 1 0 100-2H9z" clipRule="evenodd" /></svg>, view: 'pos'},
            {id: 'tables', label: 'ผังโต๊ะ', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm2 1v8h8V6H4z" /></svg>, view: 'tables', badge: tablesBadgeCount},
        ];

        if (currentUser?.role === 'admin' || currentUser?.role === 'branch-admin' || currentUser?.role === 'auditor') {
             items.push({
                id: 'dashboard',
                label: 'Dashboard',
                icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1-1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" /></svg>,
                view: 'dashboard'
            });
        } else {
             items.push({id: 'kitchen', label: 'ครัว', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h10a3 3 0 013 3v5a.997.997 0 01-.293.707zM5 6a1 1 0 100 2 1 1 0 000-2zm3 0a1 1 0 100 2 1 1 0 000-2zm3 0a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" /></svg>, view: 'kitchen', badge: totalKitchenBadgeCount});
        }
        
        items.push({id: 'history', label: 'ประวัติ', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>, view: 'history'});
        items.push({id: 'stock', label: 'สต็อก', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>, view: 'stock'});

        items.push({
            id: 'leave',
            label: 'วันลา',
            icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>,
            view: 'leave',
            badge: leaveBadgeCount
        });

        if (currentUser && (currentUser.role === 'pos' || currentUser.role === 'kitchen')) {
            // No settings button for these roles on mobile
        } else if (currentUser && ['admin', 'branch-admin', 'auditor'].includes(currentUser.role)) {
            // Also no settings for admin roles on mobile, logout is via profile
        } else {
            // This case should not be reached for the specified roles.
        }
        
        return items;
    }, [currentUser, tablesBadgeCount, totalKitchenBadgeCount, leaveBadgeCount]);

    const selectedTable = useMemo(() => {
        return tables.find(t => t.id === selectedTableId) || null;
    }, [tables, selectedTableId]);
    
    const vacantTablesCount = useMemo(() => {
        const occupiedTableIds = new Set(activeOrders.map(o => o.tableId));
        return tables.length - occupiedTableIds.size;
    }, [tables, activeOrders]);

    const isAdminViewOnDesktop = useMemo(() => 
        (currentUser?.role === 'admin' || currentUser?.role === 'branch-admin' || currentUser?.role === 'auditor') && isDesktop,
        [currentUser, isDesktop]
    );
    
    const totalCartItemCount = useMemo(() => {
        return currentOrderItems.reduce((acc, item) => acc + item.quantity, 0);
    }, [currentOrderItems]);


    // ============================================================================
    // 3. EFFECTS
    // ============================================================================
    
    // --- EFFECT: Handle Responsive Layout ---
    useEffect(() => {
        const handleResize = () => {
            setIsDesktop(window.innerWidth >= 1024);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // --- EFFECT: Overdue Order Timer Management (setTimeout per order) ---
    useEffect(() => {
        const activeCookingOrderIds = new Set<number>();
        const fifteenMinutes = 15 * 60 * 1000;

        activeOrders.forEach(order => {
            if (order.status === 'cooking' && order.cookingStartTime) {
                activeCookingOrderIds.add(order.id);

                // If a timer doesn't already exist for this cooking order, create one.
                if (!overdueTimersRef.current.has(order.id)) {
                    const elapsedTime = Date.now() - order.cookingStartTime;
                    const remainingTime = fifteenMinutes - elapsedTime;

                    if (remainingTime <= 0) {
                        // Already overdue on load, trigger immediately if not already marked.
                        if (!order.isOverdue) {
                             setActiveOrders(prevOrders => prevOrders.map(o => o.id === order.id ? { ...o, isOverdue: true } : o));
                             Swal.fire({
                                title: `ออเดอร์ #${String(order.orderNumber).padStart(3, '0')} ล่าช้า!`,
                                html: `<b>โต๊ะ ${order.tableName}</b> ใช้เวลาทำอาหารเกิน 15 นาทีแล้ว`,
                                icon: 'warning',
                                confirmButtonText: 'รับทราบ'
                             });
                        }
                    } else {
                        // Set a new timer for the remaining time.
                        const timerId = window.setTimeout(() => {
                             setActiveOrders(currentOrders => {
                                 const targetOrder = currentOrders.find(o => o.id === order.id);
                                 // Check if it's still cooking when the timer fires
                                 if (targetOrder && targetOrder.status === 'cooking' && !targetOrder.isOverdue) {
                                     Swal.fire({
                                        title: `แจ้งเตือนออเดอร์ล่าช้า!`,
                                        html: `ออเดอร์ <b>#${String(targetOrder.orderNumber).padStart(3, '0')}</b> (โต๊ะ ${targetOrder.tableName})<br/>ใช้เวลาทำอาหารเกิน 15 นาทีแล้ว`,
                                        icon: 'warning',
                                        confirmButtonText: 'รับทราบ'
                                     });
                                     // Update the order to be overdue
                                     return currentOrders.map(o => o.id === order.id ? { ...o, isOverdue: true } : o);
                                 }
                                 return currentOrders; // No change needed
                             });
                             // Remove from ref after it has fired
                             overdueTimersRef.current.delete(order.id);
                        }, remainingTime);
                        overdueTimersRef.current.set(order.id, timerId);
                    }
                }
            }
        });

        // Cleanup: Clear timers for orders that are no longer cooking.
        overdueTimersRef.current.forEach((timerId, orderId) => {
            if (!activeCookingOrderIds.has(orderId)) {
                clearTimeout(timerId);
                overdueTimersRef.current.delete(orderId);
            }
        });
        
        // Cleanup on component unmount
        return () => {
            overdueTimersRef.current.forEach(timerId => clearTimeout(timerId));
        };
    }, [activeOrders, setActiveOrders]);

    // --- EFFECT: Initialize Customer Mode ---
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const mode = params.get('mode');
        const branchIdParam = params.get('branchId');
        const tableIdParam = params.get('tableId');

        if (mode === 'customer' && branchIdParam && tableIdParam) {
            const branch = branches.find(b => b.id === Number(branchIdParam));
            if (branch) {
                setSelectedBranch(branch);
                localStorage.setItem('customerSelectedBranch', JSON.stringify(branch));
                setCustomerTableId(Number(tableIdParam));
                setIsCustomerMode(true);
            } else {
                // Handle case where branch is not found
                console.error(`Branch with ID ${branchIdParam} not found for customer mode.`);
            }
        }
    }, [branches]); // Depends on branches being loaded

    // --- EFFECT: Notification Sound for New Orders ---
    useEffect(() => {
        if (currentView !== 'kitchen' || !notificationSoundUrl || !isAudioUnlocked) return;

        const newOrders = activeOrders.filter(order =>
            !prevActiveOrdersRef.current?.some(prevOrder => prevOrder.id === order.id)
        );

        if (newOrders.length > 0) {
            const audio = new Audio(notificationSoundUrl);
            audio.play().catch(error => {
                console.error("Audio playback failed:", error);
            });
        }

        prevActiveOrdersRef.current = activeOrders;
    }, [activeOrders, currentView, notificationSoundUrl, isAudioUnlocked]);
    
    // --- EFFECT: Staff Call Notification Sound & Alert ---
    useEffect(() => {
        const latestCall = staffCalls.length > 0 ? staffCalls[staffCalls.length - 1] : null;

        if (latestCall && latestCall.tableName && latestCall.id !== activeCallRef.current?.id) {
            if (staffCallSoundUrl && isAudioUnlocked) {
                if (staffCallAudioRef.current) {
                    staffCallAudioRef.current.src = staffCallSoundUrl;
                } else {
                    staffCallAudioRef.current = new Audio(staffCallSoundUrl);
                }
                staffCallAudioRef.current.play().catch(e => console.error("Staff call audio failed:", e));
            }

            activeCallRef.current = latestCall;
            Swal.fire({
                title: 'ลูกค้าเรียกพนักงาน!',
                html: `โต๊ะ <b>${latestCall.tableName}</b> (คุณ <b>${latestCall.customerName || 'ลูกค้า'}</b>) ต้องการความช่วยเหลือ`,
                icon: 'info',
                confirmButtonText: 'รับทราบ',
                timer: 30000,
                timerProgressBar: true,
            }).then(() => {
                setStaffCalls(prevCalls => prevCalls.filter(call => call.id !== latestCall.id));
                activeCallRef.current = null;
            });
        }
        
        const oneMinuteAgo = Date.now() - 60000;
        const freshCalls = staffCalls.filter(call => call.timestamp > oneMinuteAgo && call.tableName);
        if (freshCalls.length < staffCalls.length) {
            setStaffCalls(freshCalls);
        }

    }, [staffCalls, setStaffCalls, staffCallSoundUrl, isAudioUnlocked]);
    
    // --- EFFECT: New Leave Request Notification ---
    useEffect(() => {
        if (isInitialLeaveLoadRef.current) {
            isInitialLeaveLoadRef.current = false;
            prevLeaveRequestsRef.current = leaveRequests;
            return;
        }

        if (leaveRequests.length > prevLeaveRequestsRef.current.length) {
            const prevIds = new Set(prevLeaveRequestsRef.current.map(r => r.id));
            const newRequests = leaveRequests.filter(r => !prevIds.has(r.id));
            
            newRequests.forEach(req => {
                if (!currentUser) return;

                let shouldNotify = false;
                
                if (currentUser.role === 'admin' && req.branchId === 1) { // Admin for branch 1 only
                    shouldNotify = true;
                } else if (['branch-admin', 'auditor'].includes(currentUser.role)) {
                    if (currentUser.allowedBranchIds?.includes(req.branchId)) {
                        shouldNotify = true;
                    }
                }

                if (shouldNotify) {
                    const branchName = branches.find(b => b.id === req.branchId)?.name || `สาขา #${req.branchId}`;
                    const leaveType = req.type === 'sick' ? 'ลาป่วย' : req.type === 'personal' ? 'ลากิจ' : 'ลาพักร้อน/อื่นๆ';

                    Swal.fire({
                        toast: true,
                        position: 'top-end',
                        icon: 'info',
                        title: 'มีคำขอวันลาใหม่',
                        html: `<b>${req.username}</b> (${branchName})<br/>ได้ส่งคำขอ<b>${leaveType}</b>`,
                        showConfirmButton: false,
                        timer: 10000,
                        timerProgressBar: true
                    });
                }
            });
        }

        prevLeaveRequestsRef.current = leaveRequests;
    }, [leaveRequests, currentUser, branches]);

    // --- EFFECT: Manage User State Persistence & FCM Token ---
    useEffect(() => {
        if (currentUser) {
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            
            // Handle FCM Token Logic
            if (isFirebaseConfigured && firebase.messaging.isSupported()) {
                const messaging = firebase.messaging();
                messaging.getToken({ vapidKey: 'BKo-M6Q2dJz_7L5_FkC5q_w3O2u6G7mY9e0z5N6n_Y1mQ8z_Z0z3z_X9y_Y9y_X9y_X' })
                .then((token) => {
                    if (token) {
                        setCurrentFcmToken(token);
                        // Check if this token is already in the user's list.
                        // We use `prevUserRef` to prevent re-renders on user object changes.
                        const userHasToken = prevUserRef.current?.fcmTokens?.includes(token);
                        if (!userHasToken) {
                            console.log("New FCM token detected. Updating user profile...");
                            const updatedTokens = Array.from(new Set([...(currentUser.fcmTokens || []), token]));
                            setUsers(prevUsers => prevUsers.map(u => 
                                u.id === currentUser.id ? { ...u, fcmTokens: updatedTokens } : u
                            ));
                        }
                    } else {
                        console.log('No registration token available. Request permission to generate one.');
                    }
                }).catch((err) => {
                    console.log('An error occurred while retrieving token. ', err);
                });
            }

        } else {
            localStorage.removeItem('currentUser');
            localStorage.removeItem('selectedBranch');
            localStorage.removeItem('currentView');
        }
        prevUserRef.current = currentUser;
    }, [currentUser, setUsers]);
    
    // --- EFFECT: Manage Branch State Persistence ---
    useEffect(() => {
        if (selectedBranch) {
            localStorage.setItem('selectedBranch', JSON.stringify(selectedBranch));
        } else {
            // Don't clear if it's customer mode, as that has its own storage
            if (!isCustomerMode) {
                 localStorage.removeItem('selectedBranch');
            }
        }
    }, [selectedBranch, isCustomerMode]);

    // --- EFFECT: Manage View State Persistence ---
    useEffect(() => {
        localStorage.setItem('currentView', currentView);
    }, [currentView]);

    // --- EFFECT: Set default sidebar floor when floors load ---
    useEffect(() => {
        if (floors.length > 0 && !selectedSidebarFloor) {
            setSelectedSidebarFloor(floors[0]);
        }
    }, [floors, selectedSidebarFloor]);

    // --- EFFECT: Badge on App Icon for Android PWA ---
    useEffect(() => {
        if (window.AndroidBridge && typeof window.AndroidBridge.setPendingOrderCount === 'function') {
            const totalPending = waitingBadgeCount + cookingBadgeCount;
            window.AndroidBridge.setPendingOrderCount(totalPending);
        }
    }, [waitingBadgeCount, cookingBadgeCount]);

    // --- EFFECT: Proactive Image Caching ---
    useEffect(() => {
        // This effect runs only once when the app loads and menu items are available.
        if (menuItems.length > 0 && !imageCacheTriggeredRef.current) {
            imageCacheTriggeredRef.current = true; // Prevent re-running
            
            const imageUrls = menuItems
                .map(item => item.imageUrl)
                .filter(url => url && typeof url === 'string'); // Filter out empty or invalid URLs

            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                 console.log(`[App] Requesting Service Worker to cache ${imageUrls.length} images.`);
                 navigator.serviceWorker.controller.postMessage({
                    type: 'CACHE_IMAGES',
                    urls: imageUrls
                });
            }

            // Listen for completion message from Service Worker
            const handleMessage = (event: MessageEvent) => {
                if (event.data && event.data.type === 'CACHE_IMAGES_COMPLETE') {
                    console.log('[App] Service Worker finished caching images.');
                    setIsCachingImages(false);
                    // Remove listener after completion
                    navigator.serviceWorker.removeEventListener('message', handleMessage);
                }
            };
            
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.addEventListener('message', handleMessage);
            }
        }
    }, [menuItems]);


    // ============================================================================
    // 4. HANDLERS
    // ============================================================================
    const handleAudioUnlock = useCallback(() => {
        if (isAudioUnlocked) return;

        // A common technique to unlock audio context in browsers.
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }

        // Play a tiny, silent audio file. This can also help.
        const silentAudio = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
        silentAudio.play().then(() => {
            setIsAudioUnlocked(true);
            console.log("Audio playback unlocked successfully.");
        }).catch(error => {
            console.warn("Attempt to unlock audio failed.", error);
            // Be optimistic and assume context resume might have worked.
            setIsAudioUnlocked(true);
        });
    }, [isAudioUnlocked]);
    
    // --- Auth & Branch Handlers ---
    const handleLogin = (username: string, password: string): { success: boolean, error?: string } => {
        const user = users.find(u => u.username === username && u.password === password);
        if (user) {
            setCurrentUser(user);
            
            // Auto-navigate based on role
            const role = user.role;
            if (role === 'kitchen') {
                setCurrentView('kitchen');
            } else if (role === 'pos') {
                setCurrentView('pos');
            } else if (['admin', 'branch-admin', 'auditor'].includes(role)) {
                setCurrentView('dashboard');
            }
            
            return { success: true };
        }
        return { success: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
    };

    const handleLogout = () => {
        setCurrentUser(null);
        setSelectedBranch(null);
        // Do not clear customer mode data on staff logout
    };

    const handleMobileProfileClick = () => {
        Swal.fire({
            title: 'ยืนยันการออกจากระบบ',
            text: "ท่านต้องการออกจากระบบใช่ไหม?",
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'ใช่, ออกจากระบบ',
            cancelButtonText: 'ยกเลิก'
        }).then((result) => {
            if (result.isConfirmed) {
                handleLogout();
            }
        });
    };
    
    const handleSelectBranch = (branch: Branch) => {
        setSelectedBranch(branch);
    };

    // --- Modal Handlers ---
    const handleModalClose = () => {
        setModalState({
            isMenuItem: false, isOrderSuccess: false, isSplitBill: false, isTableBill: false,
            isPayment: false, isPaymentSuccess: false, isSettings: false, isEditCompleted: false,
            isUserManager: false, isBranchManager: false, isMoveTable: false, isCancelOrder: false,
            isCashBill: false, isSplitCompleted: false, isCustomization: false, isLeaveRequest: false,
            isMenuSearch: false, isMergeBill: false
        });
        setItemToEdit(null);
        setOrderForModal(null);
        setItemToCustomize(null);
        setOrderItemToEdit(null); // Clear the specific item being edited
    };

    // --- Order & POS Handlers ---
    const handleClearOrder = () => {
        setCurrentOrderItems([]);
        setCustomerName('');
        setCustomerCount(1);
        setSelectedTableId(null);
    };
    
    const handleAddItemToOrder = (item: MenuItem) => {
        // Always open the customization modal for any item.
        setItemToCustomize(item);
        setModalState(prev => ({ ...prev, isCustomization: true, isMenuSearch: false }));
    };
    
    const handleConfirmCustomization = (itemToAdd: OrderItem) => {
        setCurrentOrderItems(prevItems => {
            const existingItemIndex = prevItems.findIndex(i => i.cartItemId === (orderItemToEdit?.cartItemId || itemToAdd.cartItemId));
            
            if (orderItemToEdit) {
                // If we were editing, replace the old item with the new one
                const newItems = [...prevItems];
                newItems[existingItemIndex] = { ...itemToAdd, quantity: orderItemToEdit.quantity };
                return newItems;
            } else {
                // If adding a new item
                if (existingItemIndex !== -1) {
                    // Item with same config exists, just increase quantity
                    const newItems = [...prevItems];
                    newItems[existingItemIndex].quantity += itemToAdd.quantity;
                    return newItems;
                } else {
                    // It's a brand new configuration
                    return [...prevItems, itemToAdd];
                }
            }
        });
        handleModalClose();
    };

    const handleUpdateOrderItem = (itemToUpdate: OrderItem) => {
        setItemToCustomize(itemToUpdate); // The base menu item
        setOrderItemToEdit(itemToUpdate);   // The specific order item with its current state
        setModalState(prev => ({ ...prev, isCustomization: true }));
    };

    const handleQuantityChange = (cartItemId: string, newQuantity: number) => {
        setCurrentOrderItems(prevItems => {
            if (newQuantity <= 0) {
                return prevItems.filter(i => i.cartItemId !== cartItemId);
            }
            return prevItems.map(i => i.cartItemId === cartItemId ? { ...i, quantity: newQuantity } : i);
        });
    };

    const handleRemoveItem = (cartItemId: string) => {
        setCurrentOrderItems(prevItems => prevItems.filter(i => i.cartItemId !== cartItemId));
    };

    const handlePlaceOrder = async (
        orderItems: OrderItem[] = currentOrderItems,
        custName: string = customerName,
        custCount: number = customerCount,
        tableOverride: Table | null = selectedTable
    ) => {
        if (!tableOverride || orderItems.length === 0) return;
    
        setIsPlacingOrder(true);
        const nextOrderId = orderCounter + 1;

        const itemsWithOrigin = orderItems.map(item => ({
            ...item,
            originalOrderNumber: nextOrderId,
        }));

        const orderPayload: PlaceOrderPayload = {
            branchId: String(selectedBranch!.id),
            tableName: tableOverride.name,
            floor: tableOverride.floor,
            customerCount: custCount,
            items: itemsWithOrigin,
            orderType: 'dine-in',
            taxRate: isTaxEnabled ? taxRate : 0,
            placedBy: currentUser!.username,
            sendToKitchen: sendToKitchen
        };
    
        try {
            if (!functionsService.placeOrder) {
                throw new Error("Cloud Function not available.");
            }
            const response = await functionsService.placeOrder(orderPayload);
            if (!response.success) {
                throw new Error(response.error || "Backend function returned an error.");
            }
            setLastPlacedOrderId(response.orderNumber!);
            setModalState(prev => ({ ...prev, isOrderSuccess: true }));
    
        } catch (error: any) {
            console.warn("Backend function call failed for placeOrder. Using client-side fallback.", error);
            
            const newOrder: ActiveOrder = {
                id: Date.now(),
                orderNumber: nextOrderId,
                tableId: tableOverride.id,
                tableName: tableOverride.name,
                customerName: custName,
                floor: tableOverride.floor,
                customerCount: custCount,
                items: itemsWithOrigin,
                status: sendToKitchen ? 'waiting' : 'served',
                orderTime: Date.now(),
                orderType: 'dine-in',
                taxRate: isTaxEnabled ? taxRate : 0,
                taxAmount: 0, 
                placedBy: currentUser!.username,
            };
            const subtotal = newOrder.items.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
            newOrder.taxAmount = newOrder.taxRate > 0 ? subtotal * (newOrder.taxRate / 100) : 0;
            
            setActiveOrders(prev => [...prev, newOrder]);
            setOrderCounter(nextOrderId);
            setLastPlacedOrderId(newOrder.orderNumber);
            setModalState(prev => ({ ...prev, isOrderSuccess: true }));

            // Automatically print to kitchen if enabled
            if (sendToKitchen && printerConfig?.kitchen) {
                try {
                    await printerService.printKitchenOrder(newOrder, printerConfig.kitchen);
                    setPrintHistory(prev => [...prev, {
                        id: Date.now(),
                        timestamp: Date.now(),
                        orderNumber: newOrder.orderNumber,
                        tableName: newOrder.tableName,
                        printedBy: currentUser!.username,
                        printerType: 'kitchen',
                        status: 'success',
                        errorMessage: null,
                        orderItemsPreview: newOrder.items.map(i => `${i.quantity}x ${i.name}`),
                        isReprint: false,
                    }]);
                } catch (printError: any) {
                    console.error("Kitchen print failed:", printError);
                    setPrintHistory(prev => [...prev, {
                        id: Date.now(),
                        timestamp: Date.now(),
                        orderNumber: newOrder.orderNumber,
                        tableName: newOrder.tableName,
                        printedBy: currentUser!.username,
                        printerType: 'kitchen',
                        status: 'failed',
                        errorMessage: printError.message || 'Unknown print error',
                        orderItemsPreview: newOrder.items.map(i => `${i.quantity}x ${i.name}`),
                        isReprint: false,
                    }]);
                    Swal.fire('พิมพ์ไม่สำเร็จ', 'ไม่สามารถเชื่อมต่อเครื่องพิมพ์ครัวได้', 'error');
                }
            }
    
        } finally {
            setIsPlacingOrder(false);
            if (!isCustomerMode) {
                setCurrentOrderItems([]);
                setCustomerName('');
                setCustomerCount(1);
                setSelectedTableId(null);
            }
        }
    };
    
    // --- Kitchen & Table Handlers ---
    const handleStartCooking = (orderId: number) => {
        setActiveOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'cooking', cookingStartTime: Date.now() } : o));
    };

    const handleCompleteOrder = (orderId: number) => {
        setActiveOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'served' } : o));
    };
    
    const handleShowBill = (orderId: number) => {
        const order = activeOrders.find(o => o.id === orderId);
        if (order) {
            setOrderForModal(order);
            setModalState(prev => ({ ...prev, isTableBill: true }));
        }
    };

    const handleConfirmPayment = async (orderId: number, paymentDetails: PaymentDetails) => {
        setIsConfirmingPayment(true);
        const orderToComplete = activeOrders.find(o => o.id === orderId);
        if (!orderToComplete) {
            setIsConfirmingPayment(false);
            return;
        }
    
        try {
            if (!functionsService.confirmPayment) throw new Error("Cloud Function not available.");
            const response = await functionsService.confirmPayment({
                branchId: String(selectedBranch!.id),
                orderId: orderToComplete.id,
                paymentDetails: paymentDetails
            });
            if (!response.success) {
                throw new Error(response.error || "Backend function returned an error.");
            }
    
        } catch (error) {
            console.warn("Backend function call failed for confirmPayment. Using client-side fallback.", error);
            // --- Fallback Logic: Direct client-side write ---
            const completed: CompletedOrder = {
                ...orderToComplete,
                status: 'completed',
                completionTime: Date.now(),
                paymentDetails: paymentDetails
            };
            setCompletedOrders(prev => [...prev, completed]);
            setActiveOrders(prev => prev.filter(o => o.id !== orderId));
            
            // Clear PIN for this table if it exists to log out customer
            setTables(prevTables => prevTables.map(t => {
                if (t.id === orderToComplete.tableId && t.activePin) {
                    return { ...t, activePin: null };
                }
                return t;
            }));
        } finally {
            setIsConfirmingPayment(false);
            setModalState(prev => ({ ...prev, isPayment: false, isPaymentSuccess: true }));
            setOrderForModal(orderToComplete); // Keep order context for success modal
        }
    };

    const handlePaymentSuccessClose = async (shouldPrint: boolean) => {
        const order = orderForModal as CompletedOrder;
        handleModalClose();
        if (shouldPrint && order && printerConfig?.cashier) {
             try {
                await printerService.printReceipt(order, printerConfig.cashier, restaurantName);
                setPrintHistory(prev => [...prev, {
                    id: Date.now(), timestamp: Date.now(), orderNumber: order.orderNumber,
                    tableName: order.tableName, printedBy: currentUser!.username,
                    printerType: 'receipt', status: 'success', errorMessage: null,
                    orderItemsPreview: [`ยอดรวม: ${order.items.reduce((s, i) => s + (i.finalPrice * i.quantity), 0) + order.taxAmount}฿`],
                    isReprint: false,
                }]);
            } catch (printError: any) {
                console.error("Receipt print failed:", printError);
                setPrintHistory(prev => [...prev, {
                    id: Date.now(), timestamp: Date.now(), orderNumber: order.orderNumber,
                    tableName: order.tableName, printedBy: currentUser!.username,
                    printerType: 'receipt', status: 'failed', errorMessage: printError.message || 'Unknown error',
                    orderItemsPreview: [`ยอดรวม: ${order.items.reduce((s, i) => s + (i.finalPrice * i.quantity), 0) + order.taxAmount}฿`],
                    isReprint: false,
                }]);
                Swal.fire('พิมพ์ไม่สำเร็จ', 'ไม่สามารถเชื่อมต่อเครื่องพิมพ์ใบเสร็จได้', 'error');
            }
        }
    };
    
    // --- CRUD Handlers (Menu, Tables, etc.) ---
    const handleSaveMenuItem = (itemData: Omit<MenuItem, 'id'> & { id?: number }) => {
        setMenuItems(prev => {
            if (itemData.id) { // Editing existing item
                return prev.map(item => item.id === itemData.id ? { ...item, ...itemData } as MenuItem : item);
            } else { // Adding new item
                const newId = Math.max(0, ...prev.map(i => i.id)) + 1;
                return [...prev, { ...itemData, id: newId }];
            }
        });
        handleModalClose();
    };

    const handleDeleteMenuItem = (id: number) => {
        Swal.fire({
            title: 'ยืนยันการลบ?',
            text: "คุณต้องการลบเมนูนี้ใช่หรือไม่?",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            confirmButtonText: 'ใช่, ลบเลย!',
            cancelButtonText: 'ยกเลิก',
        }).then((result) => {
            if (result.isConfirmed) {
                setMenuItems(prev => prev.filter(item => item.id !== id));
            }
        });
    };

    const handleAddCategory = (name: string) => {
        if (!categories.includes(name)) {
            setCategories(prev => [...prev, name]);
        }
    };
    
    const handleUpdateCategory = (oldName: string, newName: string) => {
        setCategories(prev => {
            const newCats = prev.map(c => c === oldName ? newName : c);
            return Array.from(new Set(newCats)); // Ensure uniqueness
        });
        // Also update menu items using the old category
        setMenuItems(prev => prev.map(item => item.category === oldName ? { ...item, category: newName } : item));
    };

    const handleDeleteCategory = (name: string) => {
        setCategories(prev => prev.filter(c => c !== name));
    };
    
    const handleAddTable = (floor: string) => {
        const newId = Math.max(0, ...tables.map(t => t.id)) + 1;
        const tablesOnFloor = tables.filter(t => t.floor === floor);
        const newTableName = `T${tablesOnFloor.length + 1}`;
        const newTable: Table = { id: newId, name: newTableName, floor: floor, activePin: null, reservation: null };
        setTables(prev => [...prev, newTable]);
    };
    
    const handleRemoveLastTable = (floor: string) => {
        const tablesOnFloor = tables.filter(t => t.floor === floor).sort((a,b) => a.id - b.id);
        if (tablesOnFloor.length > 0) {
            const lastTable = tablesOnFloor[tablesOnFloor.length - 1];
            // Prevent deleting if table is occupied
            const isOccupied = activeOrders.some(o => o.tableId === lastTable.id);
            if (isOccupied) {
                Swal.fire('ไม่สามารถลบได้', `โต๊ะ ${lastTable.name} (${lastTable.floor}) กำลังมีออเดอร์อยู่`, 'error');
                return;
            }
            setTables(prev => prev.filter(t => t.id !== lastTable.id));
        }
    };

    const handleAddFloor = () => {
        Swal.fire({
            title: 'เพิ่มชั้นใหม่',
            input: 'text',
            inputPlaceholder: 'เช่น ชั้นดาดฟ้า',
            showCancelButton: true,
            confirmButtonText: 'เพิ่ม',
            cancelButtonText: 'ยกเลิก',
            inputValidator: (value) => {
                if (!value) return 'กรุณาใส่ชื่อชั้น!';
                if (floors.includes(value)) return 'ชื่อชั้นนี้มีอยู่แล้ว!';
            }
        }).then((result) => {
            if (result.isConfirmed && result.value) {
                setFloors(prev => [...prev, result.value]);
            }
        });
    };
    
    const handleRemoveFloor = (floor: string) => {
        const isFloorInUse = tables.some(t => t.floor === floor);
        if (isFloorInUse) {
            Swal.fire('ไม่สามารถลบได้', `ชั้น "${floor}" ยังมีโต๊ะอยู่ กรุณาลบโต๊ะทั้งหมดในชั้นนี้ก่อน`, 'error');
            return;
        }
        Swal.fire({
            title: `ลบชั้น "${floor}"?`,
            text: 'การกระทำนี้ไม่สามารถย้อนกลับได้',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'ใช่, ลบเลย',
            confirmButtonColor: '#d33',
        }).then((result) => {
            if (result.isConfirmed) {
                setFloors(prev => prev.filter(f => f !== floor));
                // If the deleted floor was the selected one, switch to the first available floor
                if (selectedSidebarFloor === floor) {
                    setSelectedSidebarFloor(floors[0] || '');
                }
            }
        });
    };

    const handleDeleteHistory = (completedIds: number[], cancelledIds: number[], printIds: number[]) => {
        if (!currentUser) return;
    
        const isAdmin = currentUser.role === 'admin';
    
        // Admin performs a hard delete
        if (isAdmin) {
            setCompletedOrders(prev => prev.filter(o => !completedIds.includes(o.id)));
            setCancelledOrders(prev => prev.filter(o => !cancelledIds.includes(o.id)));
            setPrintHistory(prev => prev.filter(p => !printIds.includes(p.id)));
        } else {
            // Other roles (branch-admin) perform a soft delete
            const username = currentUser.username;
            setCompletedOrders(prev => prev.map(o => 
                completedIds.includes(o.id) ? { ...o, isDeleted: true, deletedBy: username } : o
            ));
            setCancelledOrders(prev => prev.map(o => 
                cancelledIds.includes(o.id) ? { ...o, isDeleted: true, deletedBy: username } : o
            ));
            setPrintHistory(prev => prev.map(p => 
                // FIX: Corrected typo 'o' to 'p' to match the map function's parameter.
                printIds.includes(p.id) ? { ...p, isDeleted: true, deletedBy: username } : p
            ));
        }
    };

    // --- Customer Self-Service Handlers ---
    const handleGeneratePin = (tableId: number) => {
        const pin = String(Math.floor(100 + Math.random() * 900)); // Generate 3-digit PIN
        setTables(prev => prev.map(t => t.id === tableId ? { ...t, activePin: pin } : t));
    };

    // --- Order Modification Handlers ---
    const handleConfirmSplit = (itemsToSplit: OrderItem[]) => {
        if (!orderForModal || orderForModal.status === 'completed') return;
        const originalOrder = orderForModal as ActiveOrder;
    
        const newSplitCount = (originalOrder.splitCount || 0) + 1;
    
        // 1. Create the new (split) order
        const nextOrderId = orderCounter + 1;
        const newSplitOrder: ActiveOrder = {
            ...originalOrder,
            id: Date.now(),
            orderNumber: nextOrderId,
            items: itemsToSplit,
            parentOrderId: originalOrder.orderNumber,
            isSplitChild: true,
            splitIndex: newSplitCount,
            mergedOrderNumbers: [], // Reset merged numbers for the new bill
        };
    
        // 2. Update the original order by removing/reducing quantities
        const updatedOriginalItems: OrderItem[] = [];
        originalOrder.items.forEach(origItem => {
            const splitItem = itemsToSplit.find(si => si.cartItemId === origItem.cartItemId);
            if (splitItem) {
                const remainingQty = origItem.quantity - splitItem.quantity;
                if (remainingQty > 0) {
                    updatedOriginalItems.push({ ...origItem, quantity: remainingQty });
                }
            } else {
                updatedOriginalItems.push(origItem);
            }
        });
    
        // 3. Update state
        setActiveOrders(prev => [
            ...prev.map(o => o.id === originalOrder.id ? { ...o, items: updatedOriginalItems, splitCount: newSplitCount } : o),
            newSplitOrder
        ]);
        setOrderCounter(nextOrderId);
    
        handleModalClose();
    };
    
    const handleConfirmMoveTable = (orderId: number, newTableId: number) => {
        const newTable = tables.find(t => t.id === newTableId);
        if (!newTable) return;
        
        setActiveOrders(prev => prev.map(o => 
            o.id === orderId ? { ...o, tableId: newTable.id, tableName: newTable.name, floor: newTable.floor } : o
        ));
        
        handleModalClose();
    };

    const handleConfirmCancelOrder = (orderToCancel: ActiveOrder, reason: CancellationReason, notes?: string) => {
        const cancelledOrder: CancelledOrder = {
            ...orderToCancel,
            status: 'cancelled',
            cancellationTime: Date.now(),
            cancelledBy: currentUser!.username,
            cancellationReason: reason,
            cancellationNotes: notes,
        };
        
        setCancelledOrders(prev => [...prev, cancelledOrder]);
        setActiveOrders(prev => prev.filter(o => o.id !== orderToCancel.id));
        
        handleModalClose();
    };
    
    const handleConfirmMerge = (sourceOrderIds: number[], targetOrderId: number) => {
        const targetOrder = activeOrders.find(o => o.id === targetOrderId);
        if (!targetOrder) return;
    
        const sourceOrders = activeOrders.filter(o => sourceOrderIds.includes(o.id));
        const allItemsToMerge = sourceOrders.flatMap(o => o.items);
        const sourceOrderNumbers = sourceOrders.map(o => o.orderNumber);
    
        setActiveOrders(prev => prev.map(o => {
            if (o.id === targetOrderId) {
                // Concatenate item arrays instead of merging quantities
                const newItems = [...o.items, ...allItemsToMerge];
    
                const newMergedNumbers = Array.from(new Set([
                    ...(o.mergedOrderNumbers || []),
                    ...sourceOrderNumbers
                ])).sort((a, b) => a - b);
    
                return { ...o, items: newItems, mergedOrderNumbers: newMergedNumbers };
            }
            return o;
        }));
    
        setActiveOrders(prev => prev.filter(o => !sourceOrderIds.includes(o.id)));
        
        handleModalClose();
    };
    
    if (isCustomerMode) {
        const customerTable = tables.find(t => t.id === customerTableId);
        if (customerTable) {
             return (
                <CustomerView 
                    table={customerTable}
                    menuItems={menuItems}
                    categories={categories}
                    activeOrders={activeOrders.filter(o => o.tableId === customerTableId)}
                    allBranchOrders={activeOrders}
                    onPlaceOrder={(items, name) => handlePlaceOrder(items, name, 1, customerTable)}
                    onStaffCall={(table, custName) => setStaffCalls(prev => [...prev, {id: Date.now(), tableId: table.id, tableName: table.name, customerName: custName, branchId: selectedBranch!.id, timestamp: Date.now()}])}
                />
             );
        }
        return <div className="p-4 text-center">Loading customer view...</div>; // Or an error screen
    }

    if (!currentUser) {
        return <LoginScreen onLogin={handleLogin} />;
    }

    if (!selectedBranch && currentUser.role !== 'admin') {
         return (
            <BranchSelectionScreen 
                currentUser={currentUser} 
                branches={branches}
                onSelectBranch={handleSelectBranch} 
                onManageBranches={() => setModalState(prev => ({...prev, isBranchManager: true}))}
                onLogout={handleLogout}
            />
        );
    }
    
    // Admin without branch selected has a different screen
    if (!selectedBranch && currentUser.role === 'admin') {
         return (
            <BranchSelectionScreen 
                currentUser={currentUser} 
                branches={branches}
                onSelectBranch={handleSelectBranch} 
                onManageBranches={() => setModalState(prev => ({...prev, isBranchManager: true}))}
                onLogout={handleLogout}
            />
        );
    }

    if (!selectedBranch) {
        // This case should ideally not be reached if logic is correct
        return <div>Error: No branch selected. Please log out and try again.</div>
    }

    const MobileHeader = ({ user, restaurantName, onOpenSearch, onProfileClick }: { user: User, restaurantName: string, onOpenSearch: () => void, onProfileClick: () => void }) => (
        <header className="bg-gray-900 text-white p-3 flex justify-between items-center flex-shrink-0 md:hidden z-30 shadow-lg relative">
            <div className="flex items-center gap-3 cursor-pointer" onClick={onProfileClick}>
                <img 
                    src={user.profilePictureUrl || "https://img.icons8.com/fluency/48/user-male-circle.png"} 
                    alt={user.username} 
                    className="h-10 w-10 rounded-full object-cover border-2 border-gray-700"
                />
                <div>
                    <p className="font-semibold text-white leading-none">{user.username}</p>
                    <span className="text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded font-mono">{user.role}</span>
                </div>
            </div>
            <h1 className="text-xl font-bold text-red-500 absolute left-1/2 -translate-x-1/2">
                {restaurantName}
            </h1>
            <button 
                onClick={onOpenSearch} 
                className="p-2 text-gray-300 rounded-full hover:bg-gray-700"
                aria-label="Search Menu"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
            </button>
        </header>
    );

    // Main App Layout
    return (
        <div 
            className={`h-screen w-screen flex flex-col md:flex-row bg-gray-100 overflow-hidden ${isDesktop ? 'landscape-mode' : ''}`}
            onClick={handleAudioUnlock}
        >
            {/* Desktop Admin Sidebar */}
            {isAdminViewOnDesktop && (
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
                   onOpenSettings={() => setModalState(prev => ({...prev, isSettings: true}))}
                   onOpenUserManager={() => setModalState(prev => ({...prev, isUserManager: true}))}
                   onManageBranches={() => setModalState(prev => ({...prev, isBranchManager: true}))}
                   onChangeBranch={() => setSelectedBranch(null)}
                   onLogout={handleLogout}
                   kitchenBadgeCount={totalKitchenBadgeCount}
                   tablesBadgeCount={tablesBadgeCount}
                   leaveBadgeCount={leaveBadgeCount}
                   onUpdateCurrentUser={(updates) => setCurrentUser(prev => prev ? {...prev, ...updates} : null)}
                   onUpdateLogoUrl={setLogoUrl}
                   onUpdateRestaurantName={setRestaurantName}
                />
            )}
            
            <div 
                className="flex-1 flex flex-col overflow-hidden transition-all duration-300"
                style={{ marginLeft: isAdminViewOnDesktop ? (isAdminSidebarCollapsed ? '5rem' : '16rem') : '0' }}
            >
                {/* Header for Desktop POS/Kitchen staff */}
                {isDesktop && !isAdminViewOnDesktop && (
                    <Header
                        currentView={currentView}
                        onViewChange={setCurrentView}
                        isEditMode={isEditMode}
                        onToggleEditMode={() => setIsEditMode(!isEditMode)}
                        onOpenSettings={() => setModalState(prev => ({ ...prev, isSettings: true }))}
                        cookingBadgeCount={cookingBadgeCount}
                        waitingBadgeCount={waitingBadgeCount}
                        tablesBadgeCount={tablesBadgeCount}
                        vacantTablesBadgeCount={vacantTablesCount}
                        leaveBadgeCount={leaveBadgeCount}
                        currentUser={currentUser}
                        onLogout={handleLogout}
                        onOpenUserManager={() => setModalState(prev => ({ ...prev, isUserManager: true }))}
                        logoUrl={logoUrl}
                        onLogoChangeClick={() => {}}
                        restaurantName={restaurantName}
                        onRestaurantNameChange={setRestaurantName}
                        branchName={selectedBranch.name}
                        onChangeBranch={() => setSelectedBranch(null)}
                        onManageBranches={() => setModalState(prev => ({ ...prev, isBranchManager: true }))}
                    />
                )}
                
                <main className={`flex-1 flex overflow-hidden ${!isDesktop ? 'pb-20' : ''}`}>
                    {/* Desktop POS View */}
                    {currentView === 'pos' && isDesktop && (
                        <>
                            <div className="flex-1 overflow-hidden">
                                <Menu
                                    menuItems={menuItems}
                                    setMenuItems={setMenuItems}
                                    categories={categories}
                                    onSelectItem={handleAddItemToOrder}
                                    isEditMode={isEditMode}
                                    onEditItem={(item) => { setItemToEdit(item); setModalState(prev => ({...prev, isMenuItem: true})); }}
                                    onAddNewItem={() => { setItemToEdit(null); setModalState(prev => ({...prev, isMenuItem: true})); }}
                                    onDeleteItem={handleDeleteMenuItem}
                                    onAddCategory={handleAddCategory}
                                    onUpdateCategory={handleUpdateCategory}
                                    onDeleteCategory={handleDeleteCategory}
                                    onImportMenu={(newItems, newCats) => {
                                        setMenuItems(newItems);
                                        setCategories(prev => Array.from(new Set([...prev, ...newCats])));
                                    }}
                                />
                            </div>
                            <aside className={`transition-all duration-300 ${isOrderSidebarVisible ? 'w-96' : 'w-0'}`}>
                                <Sidebar
                                    currentOrderItems={currentOrderItems}
                                    onQuantityChange={handleQuantityChange}
                                    onRemoveItem={handleRemoveItem}
                                    onClearOrder={handleClearOrder}
                                    onPlaceOrder={handlePlaceOrder}
                                    isPlacingOrder={isPlacingOrder}
                                    tables={tables}
                                    selectedTable={selectedTable}
                                    onSelectTable={setSelectedTableId}
                                    customerName={customerName}
                                    onCustomerNameChange={setCustomerName}
                                    customerCount={customerCount}
                                    onCustomerCountChange={setCustomerCount}
                                    isEditMode={isEditMode}
                                    onAddNewTable={handleAddTable}
                                    onRemoveLastTable={handleRemoveLastTable}
                                    floors={floors}
                                    selectedFloor={selectedSidebarFloor}
                                    onFloorChange={setSelectedSidebarFloor}
                                    onAddFloor={handleAddFloor}
                                    onRemoveFloor={handleRemoveFloor}
                                    sendToKitchen={sendToKitchen}
                                    onSendToKitchenChange={(enabled, details) => { setSendToKitchen(enabled); setNotSentToKitchenDetails(details); }}
                                    onUpdateReservation={(tableId, reservation) => setTables(prev => prev.map(t => t.id === tableId ? {...t, reservation} : t))}
                                    onOpenSearch={() => setModalState(prev => ({...prev, isMenuSearch: true}))}
                                    currentUser={currentUser}
                                    onEditOrderItem={handleUpdateOrderItem}
                                    onViewChange={setCurrentView}
                                    restaurantName={restaurantName}
                                    onLogout={handleLogout}
                                />
                            </aside>
                            <button
                                onClick={() => setIsOrderSidebarVisible(!isOrderSidebarVisible)}
                                className="absolute right-0 top-1/2 -translate-y-1/2 bg-gray-800 text-white p-3 rounded-l-full z-20 shadow-lg"
                                style={{ right: isOrderSidebarVisible ? '24rem' : '0' }}
                                title={isOrderSidebarVisible ? "ซ่อน" : "แสดง"}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className={`h-8 w-8 transition-transform ${isOrderSidebarVisible ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7" /></svg>
                                {totalCartItemCount > 0 && (
                                    <span className={`absolute -top-1 -left-1 flex h-9 w-9 items-center justify-center rounded-full bg-red-500 text-base font-bold text-white border-2 border-white transition-opacity ${isOrderSidebarVisible ? 'opacity-0' : 'opacity-100'}`}>
                                        {totalCartItemCount > 99 ? '99+' : totalCartItemCount}
                                    </span>
                                )}
                            </button>
                        </>
                    )}

                    {/* Non-Desktop Views */}
                    {!isDesktop && (
                        <div className="flex-1 flex flex-col overflow-hidden">
                            {currentView === 'pos' ? (
                                <div className="flex-1 flex overflow-hidden">
                                    <div className="flex-1 overflow-hidden">
                                        <Sidebar
                                            isMobilePage={true}
                                            currentOrderItems={currentOrderItems}
                                            onQuantityChange={handleQuantityChange}
                                            onRemoveItem={handleRemoveItem}
                                            onClearOrder={handleClearOrder}
                                            onPlaceOrder={handlePlaceOrder}
                                            isPlacingOrder={isPlacingOrder}
                                            tables={tables}
                                            selectedTable={selectedTable}
                                            onSelectTable={setSelectedTableId}
                                            customerName={customerName}
                                            onCustomerNameChange={setCustomerName}
                                            customerCount={customerCount}
                                            onCustomerCountChange={setCustomerCount}
                                            isEditMode={isEditMode}
                                            onAddNewTable={handleAddTable}
                                            onRemoveLastTable={handleRemoveLastTable}
                                            floors={floors}
                                            selectedFloor={selectedSidebarFloor}
                                            onFloorChange={setSelectedSidebarFloor}
                                            onAddFloor={handleAddFloor}
                                            onRemoveFloor={handleRemoveFloor}
                                            sendToKitchen={sendToKitchen}
                                            onSendToKitchenChange={(enabled, details) => { setSendToKitchen(enabled); setNotSentToKitchenDetails(details); }}
                                            onUpdateReservation={(tableId, reservation) => setTables(prev => prev.map(t => t.id === tableId ? {...t, reservation} : t))}
                                            onOpenSearch={() => setModalState(prev => ({...prev, isMenuSearch: true}))}
                                            currentUser={currentUser}
                                            onEditOrderItem={handleUpdateOrderItem}
                                            onViewChange={setCurrentView}
                                            restaurantName={restaurantName}
                                            onLogout={handleLogout}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="w-full flex flex-col h-full">
                                    <MobileHeader 
                                        user={currentUser!}
                                        restaurantName={restaurantName}
                                        onOpenSearch={() => setModalState(prev => ({...prev, isMenuSearch: true}))}
                                        onProfileClick={handleMobileProfileClick}
                                    />
                                    <div className="flex-1 overflow-y-auto">
                                        {currentView === 'kitchen' && <KitchenView activeOrders={activeOrders} onCompleteOrder={handleCompleteOrder} onStartCooking={handleStartCooking} />}
                                        {currentView === 'tables' && <TableLayout tables={tables} activeOrders={activeOrders} onTableSelect={(id) => { setSelectedTableId(id); setCurrentView('pos'); }} onShowBill={handleShowBill} onGeneratePin={handleGeneratePin} currentUser={currentUser} printerConfig={printerConfig} floors={floors} selectedBranch={selectedBranch} />}
                                        {currentView === 'dashboard' && <Dashboard completedOrders={completedOrders} cancelledOrders={cancelledOrders} openingTime={openingTime || '10:00'} closingTime={closingTime || '22:00'} currentUser={currentUser} />}
                                        {currentView === 'history' && <SalesHistory completedOrders={completedOrders} cancelledOrders={cancelledOrders} printHistory={printHistory} onReprint={() => {}} onSplitOrder={(order) => {setOrderForModal(order); setModalState(prev => ({...prev, isSplitCompleted: true}))}} isEditMode={isEditMode} onEditOrder={(order) => {setOrderForModal(order); setModalState(prev => ({...prev, isEditCompleted: true}))}} onInitiateCashBill={(order) => {setOrderForModal(order); setModalState(prev => ({...prev, isCashBill: true}))}} onDeleteHistory={handleDeleteHistory} currentUser={currentUser} />}
                                        {currentView === 'stock' && <StockManagement stockItems={stockItems} setStockItems={setStockItems} stockCategories={stockCategories} setStockCategories={setStockCategories} stockUnits={stockUnits} setStockUnits={setStockUnits} />}
                                        {currentView === 'leave' && <LeaveCalendarView leaveRequests={leaveRequests} currentUser={currentUser} onOpenRequestModal={(date) => { setLeaveRequestInitialDate(date); setModalState(prev => ({...prev, isLeaveRequest: true})); }} branches={branches} onUpdateStatus={(id, status) => setLeaveRequests(prev => prev.map(r => r.id === id ? {...r, status} : r))} onDeleteRequest={async (id) => {setLeaveRequests(prev => prev.filter(r => r.id !== id)); return true;}} selectedBranch={selectedBranch} />}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Desktop Other Views */}
                    {isDesktop && currentView !== 'pos' && (
                        <>
                            {currentView === 'kitchen' && <KitchenView activeOrders={activeOrders} onCompleteOrder={handleCompleteOrder} onStartCooking={handleStartCooking} />}
                            {currentView === 'tables' && <TableLayout tables={tables} activeOrders={activeOrders} onTableSelect={(id) => { setSelectedTableId(id); setCurrentView('pos'); }} onShowBill={handleShowBill} onGeneratePin={handleGeneratePin} currentUser={currentUser} printerConfig={printerConfig} floors={floors} selectedBranch={selectedBranch} />}
                            {currentView === 'dashboard' && <Dashboard completedOrders={completedOrders} cancelledOrders={cancelledOrders} openingTime={openingTime || '10:00'} closingTime={closingTime || '22:00'} currentUser={currentUser} />}
                            {currentView === 'history' && <SalesHistory completedOrders={completedOrders} cancelledOrders={cancelledOrders} printHistory={printHistory} onReprint={() => {}} onSplitOrder={(order) => {setOrderForModal(order); setModalState(prev => ({...prev, isSplitCompleted: true}))}} isEditMode={isEditMode} onEditOrder={(order) => {setOrderForModal(order); setModalState(prev => ({...prev, isEditCompleted: true}))}} onInitiateCashBill={(order) => {setOrderForModal(order); setModalState(prev => ({...prev, isCashBill: true}))}} onDeleteHistory={handleDeleteHistory} currentUser={currentUser} />}
                            {currentView === 'stock' && <StockManagement stockItems={stockItems} setStockItems={setStockItems} stockCategories={stockCategories} setStockCategories={setStockCategories} stockUnits={stockUnits} setStockUnits={setStockUnits} />}
                            {currentView === 'leave' && <LeaveCalendarView leaveRequests={leaveRequests} currentUser={currentUser} onOpenRequestModal={(date) => { setLeaveRequestInitialDate(date); setModalState(prev => ({...prev, isLeaveRequest: true})); }} branches={branches} onUpdateStatus={(id, status) => setLeaveRequests(prev => prev.map(r => r.id === id ? {...r, status} : r))} onDeleteRequest={async (id) => {setLeaveRequests(prev => prev.filter(r => r.id !== id)); return true;}} selectedBranch={selectedBranch} />}
                        </>
                    )}
                </main>
            </div>
            
            {!isDesktop && currentUser && <BottomNavBar items={mobileNavItems} currentView={currentView} onViewChange={setCurrentView} />}

            {/* Modals */}
            <LoginModal isOpen={false} onClose={() => {}} />
            <MenuItemModal isOpen={modalState.isMenuItem} onClose={handleModalClose} onSave={handleSaveMenuItem} itemToEdit={itemToEdit} categories={categories} onAddCategory={handleAddCategory} />
            <OrderSuccessModal isOpen={modalState.isOrderSuccess} onClose={handleModalClose} orderId={lastPlacedOrderId!} />
            <SplitBillModal isOpen={modalState.isSplitBill} order={orderForModal as ActiveOrder | null} onClose={handleModalClose} onConfirmSplit={handleConfirmSplit} />
            <TableBillModal isOpen={modalState.isTableBill} onClose={handleModalClose} order={orderForModal as ActiveOrder | null} onInitiatePayment={(order) => { setOrderForModal(order); setModalState(prev => ({...prev, isPayment: true, isTableBill: false})); }} onInitiateMove={(order) => {setOrderForModal(order); setModalState(prev => ({...prev, isMoveTable: true, isTableBill: false})); }} onSplit={(order) => {setOrderForModal(order); setModalState(prev => ({...prev, isSplitBill: true, isTableBill: false})); }} onUpdateOrder={(id, items, count) => { setActiveOrders(prev => prev.map(o => o.id === id ? {...o, items: items, customerCount: count} : o)); handleModalClose(); }} isEditMode={isEditMode} currentUser={currentUser} onInitiateCancel={(order) => {setOrderForModal(order); setModalState(prev => ({...prev, isCancelOrder: true, isTableBill: false}))}} activeOrderCount={activeOrders.length} onInitiateMerge={(order) => {setOrderForModal(order); setModalState(prev => ({...prev, isMergeBill: true, isTableBill: false}))}} />
            <PaymentModal isOpen={modalState.isPayment} order={orderForModal as ActiveOrder | null} onClose={handleModalClose} onConfirmPayment={handleConfirmPayment} qrCodeUrl={qrCodeUrl} isEditMode={isEditMode} onOpenSettings={() => setModalState(prev => ({...prev, isSettings: true}))} isConfirmingPayment={isConfirmingPayment} />
            <PaymentSuccessModal isOpen={modalState.isPaymentSuccess} onClose={handlePaymentSuccessClose} orderNumber={(orderForModal as CompletedOrder)?.orderNumber || 0} />
            <SettingsModal isOpen={modalState.isSettings} onClose={handleModalClose} onSave={(qr, sound, staffSound, printer, open, close) => { setQrCodeUrl(qr); setNotificationSoundUrl(sound); setStaffCallSoundUrl(staffSound); setPrinterConfig(printer); setOpeningTime(open); setClosingTime(close); handleModalClose(); }} currentQrCodeUrl={qrCodeUrl} currentNotificationSoundUrl={notificationSoundUrl} currentStaffCallSoundUrl={staffCallSoundUrl} currentPrinterConfig={printerConfig} currentOpeningTime={openingTime} currentClosingTime={closingTime} onSavePrinterConfig={setPrinterConfig} />
            <EditCompletedOrderModal isOpen={modalState.isEditCompleted} order={orderForModal as CompletedOrder | null} onClose={handleModalClose} onSave={({id, items}) => setCompletedOrders(prev => prev.map(o => o.id === id ? {...o, items} : o))} menuItems={menuItems} />
            <UserManagerModal isOpen={modalState.isUserManager} onClose={handleModalClose} users={users} setUsers={setUsers} currentUser={currentUser!} branches={branches} isEditMode={isEditMode} />
            <BranchManagerModal isOpen={modalState.isBranchManager} onClose={handleModalClose} branches={branches} setBranches={setBranches} />
            <MoveTableModal isOpen={modalState.isMoveTable} onClose={handleModalClose} order={orderForModal as ActiveOrder | null} tables={tables} activeOrders={activeOrders} onConfirmMove={handleConfirmMoveTable} floors={floors} />
            <CancelOrderModal isOpen={modalState.isCancelOrder} onClose={handleModalClose} order={orderForModal as ActiveOrder | null} onConfirm={handleConfirmCancelOrder} />
            <CashBillModal isOpen={modalState.isCashBill} order={orderForModal as CompletedOrder | null} onClose={handleModalClose} restaurantName={restaurantName} logoUrl={logoUrl} />
            <SplitCompletedBillModal isOpen={modalState.isSplitCompleted} order={orderForModal as CompletedOrder | null} onClose={handleModalClose} onConfirmSplit={() => {}} />
            <ItemCustomizationModal isOpen={modalState.isCustomization} onClose={handleModalClose} item={itemToCustomize} onConfirm={handleConfirmCustomization} orderItemToEdit={orderItemToEdit} />
            <LeaveRequestModal isOpen={modalState.isLeaveRequest} onClose={handleModalClose} currentUser={currentUser} onSave={(req) => {const newId = Math.max(0, ...leaveRequests.map(r => r.id)) + 1; setLeaveRequests(prev => [...prev, {...req, id: newId, status: 'pending', branchId: selectedBranch!.id}]); handleModalClose(); }} leaveRequests={leaveRequests} initialDate={leaveRequestInitialDate} />
            <MenuSearchModal isOpen={modalState.isMenuSearch} onClose={handleModalClose} menuItems={menuItems} onSelectItem={handleAddItemToOrder} />
            <MergeBillModal isOpen={modalState.isMergeBill} onClose={handleModalClose} order={orderForModal as ActiveOrder} allActiveOrders={activeOrders} tables={tables} onConfirmMerge={handleConfirmMerge} />
        </div>
    );
};

export default App;