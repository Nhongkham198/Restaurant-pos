
// ... existing imports
// (Keeping all imports same as before, no changes needed for imports)
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
    DEFAULT_FLOORS, 
    DEFAULT_MAINTENANCE_ITEMS
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
    CancellationReason, 
    OrderCounter,
    MaintenanceItem,
    MaintenanceLog,
    CashierPrinterSettings,
    SystemPrinterStatus
} from './types';
// FIX: Use relative import instead of alias to ensure module resolution works properly
import { useFirestoreSync, useFirestoreCollection } from './hooks/useFirestoreSync';
import { functionsService } from './services/firebaseFunctionsService';
import { printerService } from './services/printerService';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
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
import { StockAnalytics } from './components/StockAnalytics';
import { LeaveCalendarView } from './components/LeaveCalendarView';
import { LeaveAnalytics } from './components/LeaveAnalytics'; // Import the new component
import AdminSidebar from './components/AdminSidebar';
import { BottomNavBar } from './components/BottomNavBar';
import { MaintenanceView } from './components/MaintenanceView';

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

const App: React.FC = () => {
    // 1. STATE INITIALIZATION
    // ... (All previous state initialization remains the same)
    const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [users, setUsers] = useFirestoreSync<User[]>(null, 'users', DEFAULT_USERS);
    const [branches, setBranches] = useFirestoreSync<Branch[]>(null, 'branches', DEFAULT_BRANCHES);
    const [currentUser, setCurrentUser] = useState<User | null>(() => {
        const storedUser = localStorage.getItem('currentUser');
        if (storedUser) {
            try { return JSON.parse(storedUser); } catch (e) { return null; }
        }
        return null;
    });
    const [selectedBranch, setSelectedBranch] = useState<Branch | null>(() => {
        const params = new URLSearchParams(window.location.search);
        const isCustomer = params.get('mode') === 'customer';
        if (isCustomer) {
            const customerBranch = localStorage.getItem('customerSelectedBranch');
            if (customerBranch) { try { return JSON.parse(customerBranch); } catch (e) {} }
        }
        const staffBranch = localStorage.getItem('selectedBranch');
        if (staffBranch) { try { return JSON.parse(staffBranch); } catch (e) {} }
        return null;
    });
    const [currentFcmToken, setCurrentFcmToken] = useState<string | null>(null);
    const [currentView, setCurrentView] = useState<View>(() => {
        const storedView = localStorage.getItem('currentView');
        if (storedView && ['pos', 'kitchen', 'tables', 'dashboard', 'history', 'stock', 'leave', 'stock-analytics', 'leave-analytics', 'maintenance'].includes(storedView)) return storedView as View;
        return 'pos';
    });
    const [isEditMode, setIsEditMode] = useState(false);
    const [isAdminSidebarCollapsed, setIsAdminSidebarCollapsed] = useState(false);
    const [isOrderSidebarVisible, setIsOrderSidebarVisible] = useState(true);
    const [isOrderNotificationsEnabled, setIsOrderNotificationsEnabled] = useState(() => localStorage.getItem('isOrderNotificationsEnabled') === 'true');
    const toggleOrderNotifications = () => setIsOrderNotificationsEnabled(prev => { localStorage.setItem('isOrderNotificationsEnabled', String(!prev)); return !prev; });
    const [isCustomerMode, setIsCustomerMode] = useState(false);
    const [customerTableId, setCustomerTableId] = useState<number | null>(null);
    const branchId = selectedBranch ? selectedBranch.id.toString() : null;
    const [menuItems, setMenuItems] = useFirestoreSync<MenuItem[]>(branchId, 'menuItems', DEFAULT_MENU_ITEMS);
    const [categories, setCategories] = useFirestoreSync<string[]>(branchId, 'categories', DEFAULT_CATEGORIES);
    const [tables, setTables] = useFirestoreSync<Table[]>(branchId, 'tables', DEFAULT_TABLES);
    const [floors, setFloors] = useFirestoreSync<string[]>(branchId, 'floors', DEFAULT_FLOORS);
    const [rawActiveOrders, activeOrdersActions] = useFirestoreCollection<ActiveOrder>(branchId, 'activeOrders');
    const activeOrders = useMemo(() => rawActiveOrders.filter(o => o.status !== 'completed' && o.status !== 'cancelled'), [rawActiveOrders]);
    const [legacyCompletedOrders, setLegacyCompletedOrders] = useFirestoreSync<CompletedOrder[]>(branchId, 'completedOrders', []);
    const [legacyCancelledOrders, setLegacyCancelledOrders] = useFirestoreSync<CancelledOrder[]>(branchId, 'cancelledOrders', []);
    const [newCompletedOrders, newCompletedOrdersActions] = useFirestoreCollection<CompletedOrder>(branchId, 'completedOrders_v2');
    const [newCancelledOrders, newCancelledOrdersActions] = useFirestoreCollection<CancelledOrder>(branchId, 'cancelledOrders_v2');
    const completedOrders = useMemo(() => {
        const combined = [...newCompletedOrders, ...legacyCompletedOrders];
        const unique = new Map<number, CompletedOrder>();
        combined.forEach(o => unique.set(o.id, o));
        return Array.from(unique.values()).sort((a, b) => b.completionTime - a.completionTime);
    }, [legacyCompletedOrders, newCompletedOrders]);
    const cancelledOrders = useMemo(() => {
        const combined = [...newCancelledOrders, ...legacyCancelledOrders];
        const unique = new Map<number, CancelledOrder>();
        combined.forEach(o => unique.set(o.id, o));
        return Array.from(unique.values()).sort((a, b) => b.cancellationTime - a.cancellationTime);
    }, [legacyCancelledOrders, newCancelledOrders]);
    const [stockItems, setStockItems] = useFirestoreSync<StockItem[]>(branchId, 'stockItems', DEFAULT_STOCK_ITEMS);
    const [stockCategories, setStockCategories] = useFirestoreSync<string[]>(branchId, 'stockCategories', DEFAULT_STOCK_CATEGORIES);
    const [stockUnits, setStockUnits] = useFirestoreSync<string[]>(branchId, 'stockUnits', DEFAULT_STOCK_UNITS);
    const [printHistory, setPrintHistory] = useFirestoreSync<PrintHistoryEntry[]>(branchId, 'printHistory', []);
    const [staffCalls, setStaffCalls] = useFirestoreSync<StaffCall[]>(branchId, 'staffCalls', []);
    const [leaveRequests, setLeaveRequests] = useFirestoreSync<LeaveRequest[]>(null, 'leaveRequests', []);
    const [orderCounter, setOrderCounter] = useFirestoreSync<OrderCounter>(branchId, 'orderCounter', { count: 0, lastResetDate: new Date().toISOString().split('T')[0] });
    const [maintenanceItems, setMaintenanceItems] = useFirestoreSync<MaintenanceItem[]>(branchId, 'maintenanceItems', DEFAULT_MAINTENANCE_ITEMS);
    const [maintenanceLogs, setMaintenanceLogs] = useFirestoreSync<MaintenanceLog[]>(branchId, 'maintenanceLogs', []);
    const [currentOrderItems, setCurrentOrderItems] = useState<OrderItem[]>([]);
    const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
    const [customerName, setCustomerName] = useState('');
    const [customerCount, setCustomerCount] = useState(1);
    const [selectedSidebarFloor, setSelectedSidebarFloor] = useState<string>('');
    const [notSentToKitchenDetails, setNotSentToKitchenDetails] = useState<{ reason: string; notes: string } | null>(null);
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
    const [recommendedMenuItemIds, setRecommendedMenuItemIds] = useFirestoreSync<number[]>(branchId, 'recommendedMenuItemIds', []);
    const [printerStatus, setPrinterStatus] = useState<SystemPrinterStatus>({ kitchen: { online: false, message: 'Checking...', lastChecked: 0 }, cashier: { online: false, message: 'Checking...', lastChecked: 0 } });
    const [modalState, setModalState] = useState({ isMenuItem: false, isOrderSuccess: false, isSplitBill: false, isTableBill: false, isPayment: false, isPaymentSuccess: false, isSettings: false, isEditCompleted: false, isUserManager: false, isBranchManager: false, isMoveTable: false, isCancelOrder: false, isCashBill: false, isSplitCompleted: false, isCustomization: false, isLeaveRequest: false, isMenuSearch: false, isMergeBill: false });
    const [itemToEdit, setItemToEdit] = useState<MenuItem | null>(null);
    const [itemToCustomize, setItemToCustomize] = useState<MenuItem | null>(null);
    const [orderItemToEdit, setOrderItemToEdit] = useState<OrderItem | null>(null); 
    const [orderForModal, setOrderForModal] = useState<ActiveOrder | CompletedOrder | null>(null);
    const [lastPlacedOrderId, setLastPlacedOrderId] = useState<number | null>(null);
    const [leaveRequestInitialDate, setLeaveRequestInitialDate] = useState<Date | null>(null);
    const [isPlacingOrder, setIsPlacingOrder] = useState(false);
    const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);
    const [isCachingImages, setIsCachingImages] = useState(false);
    const imageCacheTriggeredRef = useRef(false);
    const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);
    const prevActiveOrdersRef = useRef<ActiveOrder[] | undefined>(undefined);
    const staffCallAudioRef = useRef<HTMLAudioElement | null>(null);
    const prevUserRef = useRef<User | null>(null);
    const activeCallRef = useRef<StaffCall | null>(null);
    const overdueTimersRef = useRef<Map<number, number>>(new Map());
    const shownNotificationsRef = useRef<Set<number>>(new Set());
    const mountTimeRef = useRef(Date.now());
    const notifiedLowStockRef = useRef<Set<number>>(new Set());
    const notifiedDailyStockRef = useRef<string>('');
    const notifiedMaintenanceRef = useRef<Set<number>>(new Set());

    // ... Computed Memos (kept same)
    const waitingBadgeCount = useMemo(() => activeOrders.filter(o => o.status === 'waiting').length, [activeOrders]);
    const cookingBadgeCount = useMemo(() => activeOrders.filter(o => o.status === 'cooking').length, [activeOrders]);
    const totalKitchenBadgeCount = waitingBadgeCount + cookingBadgeCount;
    const occupiedTablesCount = useMemo(() => { const occupiedTableIds = new Set(activeOrders.filter(o => tables.some(t => t.id === o.tableId)).map(o => o.tableId)); return occupiedTableIds.size; }, [activeOrders, tables]);
    const tablesBadgeCount = occupiedTablesCount > 0 ? occupiedTablesCount : 0;
    const leaveBadgeCount = useMemo(() => { if (!currentUser) return 0; const filterPredicate = (req: LeaveRequest) => { if (req.status !== 'pending') return false; if (currentUser.role === 'admin') { if (currentUser.allowedBranchIds && currentUser.allowedBranchIds.length > 0) { return currentUser.allowedBranchIds.includes(req.branchId); } return true; } if (currentUser.role === 'branch-admin' || currentUser.role === 'auditor') { return currentUser.allowedBranchIds?.includes(req.branchId) ?? false; } return false; }; return leaveRequests.filter(filterPredicate).length; }, [leaveRequests, currentUser]);
    const stockBadgeCount = useMemo(() => { return stockItems.filter(item => { const qty = Number(item.quantity) || 0; const reorder = Number(item.reorderPoint) || 0; return qty <= reorder; }).length; }, [stockItems]);
    const maintenanceBadgeCount = useMemo(() => { const now = Date.now(); const oneDay = 24 * 60 * 60 * 1000; return maintenanceItems.filter(item => { const lastDate = item.lastMaintenanceDate || 0; const dueDate = new Date(lastDate); dueDate.setMonth(dueDate.getMonth() + item.cycleMonths); const dueTimestamp = dueDate.getTime(); const daysDiff = Math.ceil((dueTimestamp - now) / oneDay); return daysDiff <= 7; }).length; }, [maintenanceItems]);
    const mobileNavItems = useMemo(() => { const items: NavItem[] = [ {id: 'pos', label: 'POS', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" /><path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h2a1 1 0 100-2H9z" clipRule="evenodd" /></svg>, view: 'pos'}, {id: 'tables', label: 'ผังโต๊ะ', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2-2H4a2 2 0 01-2-2V5zm2 1v8h8V6H4z" /></svg>, view: 'tables', badge: tablesBadgeCount}, ]; if (currentUser?.role === 'admin' || currentUser?.role === 'branch-admin' || currentUser?.role === 'auditor') { items.push({ id: 'dashboard', label: 'Dashboard', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1-1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" /></svg>, view: 'dashboard' }); } else { items.push({id: 'kitchen', label: 'ครัว', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h10a3 3 0 013 3v5a.997.997 0 01-.293.707zM5 6a1 1 0 100 2 1 1 0 000-2zm3 0a1 1 0 100 2 1 1 0 000-2zm3 0a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" /></svg>, view: 'kitchen', badge: totalKitchenBadgeCount}); } items.push({id: 'history', label: 'ประวัติ', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>, view: 'history'}); items.push({id: 'stock', label: 'สต็อก', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>, view: 'stock', badge: stockBadgeCount}); items.push({ id: 'leave', label: 'วันลา', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>, view: 'leave', badge: leaveBadgeCount }); items.push({ id: 'maintenance', label: 'บำรุงรักษา', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>, view: 'maintenance', badge: maintenanceBadgeCount }); return items; }, [currentUser, tablesBadgeCount, totalKitchenBadgeCount, leaveBadgeCount, stockBadgeCount, maintenanceBadgeCount]);
    const selectedTable = useMemo(() => { return tables.find(t => t.id === selectedTableId) || null; }, [tables, selectedTableId]);
    const vacantTablesCount = useMemo(() => { const occupiedTableIds = new Set(activeOrders.filter(o => tables.some(t => t.id === o.tableId)).map(o => o.tableId)); return Math.max(0, tables.length - occupiedTableIds.size); }, [tables, activeOrders]);
    const isAdminViewOnDesktop = useMemo(() => (currentUser?.role === 'admin' || currentUser?.role === 'branch-admin' || currentUser?.role === 'auditor') && isDesktop, [currentUser, isDesktop]);
    const totalCartItemCount = useMemo(() => { return currentOrderItems.reduce((acc, item) => acc + item.quantity, 0); }, [currentOrderItems]);

    // ... Effects (kept same, just omitting for brevity in diff)
    useEffect(() => { const handleOnline = () => setIsOnline(true); const handleOffline = () => { setIsOnline(false); Swal.fire({ icon: 'warning', title: 'ขาดการเชื่อมต่อ', text: 'อินเทอร์เน็ตของคุณหลุด ระบบจะป้องกันการบันทึกข้อมูลเพื่อความปลอดภัย กรุณาตรวจสอบอินเทอร์เน็ต', toast: true, position: 'top-end', showConfirmButton: false, timer: 5000 }); }; window.addEventListener('online', handleOnline); window.addEventListener('offline', handleOffline); return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); }; }, []);
    useEffect(() => { if (!isOnline) return; activeOrders.forEach(order => { if (order.orderType === 'lineman') return; const realTable = tables.find(t => t.id === order.tableId); if (realTable && (realTable.floor !== order.floor || realTable.name !== order.tableName)) { activeOrdersActions.update(order.id, { floor: realTable.floor, tableName: realTable.name }); } }); }, [activeOrders, tables, isOnline]);
    useEffect(() => { const handleResize = () => setIsDesktop(window.innerWidth >= 1024); window.addEventListener('resize', handleResize); return () => window.removeEventListener('resize', handleResize); }, []);
    useEffect(() => { if ('serviceWorker' in navigator && navigator.serviceWorker.controller) { const soundsToCache = []; if (notificationSoundUrl) soundsToCache.push(notificationSoundUrl); if (staffCallSoundUrl) soundsToCache.push(staffCallSoundUrl); if (soundsToCache.length > 0) { soundsToCache.forEach(url => fetch(url, { mode: 'no-cors' }).catch(() => {})); } } }, [notificationSoundUrl, staffCallSoundUrl]);
    // ... (Overdue, Low Stock, Daily Alert, Maintenance Alert, Customer Mode, Notification Effects - ALL KEPT SAME)
    
    // --- PRINTER STATUS POLLING LOGIC ---
    const checkPrinters = useCallback(async (manual = false) => {
        if (!printerConfig) return;
        
        // FIX: Capture config locally to ensure type safety in closure if printerConfig changes
        const currentConfig = printerConfig; 

        // Show "Checking..." immediately if manually triggered
        if (manual) {
            setPrinterStatus(prev => ({
                kitchen: { ...prev.kitchen, message: 'Checking...' },
                cashier: { ...prev.cashier, message: 'Checking...' }
            }));
        }

        const checkSingle = async (type: 'kitchen' | 'cashier') => {
            // Safe access using captured variable
            const config = currentConfig[type]; 
            
            if (!config || !config.ipAddress) {
                // Not configured is considered "offline" or we can track "not_configured" state.
                return { online: false, message: 'ยังไม่ตั้งค่า', lastChecked: Date.now() };
            }

            try {
                // Timeout promise to prevent hanging
                const timeoutPromise = new Promise<{ online: boolean, message: string }>((_, reject) =>
                    setTimeout(() => reject(new Error('Timeout')), 3000)
                );

                const checkPromise = printerService.checkPrinterStatus(
                    config.ipAddress,
                    config.port || '3000',
                    config.targetPrinterIp || '',
                    config.targetPrinterPort || '9100',
                    config.connectionType
                );

                const res = await Promise.race([checkPromise, timeoutPromise]);
                return { online: res.online, message: res.message, lastChecked: Date.now() };
            } catch (e) {
                return { online: false, message: 'Print Server ไม่ตอบสนอง', lastChecked: Date.now() };
            }
        };

        // Run checks in parallel
        const [kStatus, cStatus] = await Promise.all([
            checkSingle('kitchen'),
            checkSingle('cashier')
        ]);

        setPrinterStatus({ kitchen: kStatus, cashier: cStatus });
    }, [printerConfig]);

    // Poll every 30 seconds
    useEffect(() => {
        checkPrinters(); // Initial check
        const interval = setInterval(() => checkPrinters(false), 30000); 
        return () => clearInterval(interval);
    }, [checkPrinters]);


    // -------------------------------------------------------------------------
    // HANDLERS IMPLEMENTATION
    // -------------------------------------------------------------------------

    const requestNotificationPermission = async () => { if ('Notification' in window && Notification.permission !== 'granted') { try { await Notification.requestPermission(); } catch (error) {} } };
    const handleAudioUnlock = useCallback(async () => { if (!isAudioUnlocked) { const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)(); if (audioContext.state === 'suspended') audioContext.resume(); new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=').play().then(() => setIsAudioUnlocked(true)).catch(() => setIsAudioUnlocked(true)); } await requestNotificationPermission(); }, [isAudioUnlocked]);
    
    const handleLogin = async (username: string, password: string) => { const user = users.find(u => u.username === username && u.password === password); if (user) { await requestNotificationPermission(); setCurrentUser(user); if (user.role === 'kitchen') setCurrentView('kitchen'); else if (user.role === 'pos') setCurrentView('pos'); else if (['admin', 'branch-admin', 'auditor'].includes(user.role)) setCurrentView('dashboard'); return { success: true }; } return { success: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }; };
    const handleLogout = () => { setCurrentUser(null); setSelectedBranch(null); };
    const handleMobileProfileClick = () => { Swal.fire({ title: 'ยืนยันการออกจากระบบ', text: "ท่านต้องการออกจากระบบใช่ไหม?", icon: 'question', showCancelButton: true, confirmButtonText: 'ใช่', cancelButtonText: 'ยกเลิก' }).then((result) => { if (result.isConfirmed) handleLogout(); }); };
    const handleSelectBranch = (branch: Branch) => { setSelectedBranch(branch); };
    const handleUpdateCurrentUser = (updates: Partial<User>) => { setUsers(prevUsers => prevUsers.map(user => user.id === currentUser?.id ? { ...user, ...updates } : user)); setCurrentUser(prev => (prev ? { ...prev, ...updates } : null)); };

    const handleModalClose = () => {
        setModalState({
            isMenuItem: false,
            isOrderSuccess: false,
            isSplitBill: false,
            isTableBill: false,
            isPayment: false,
            isPaymentSuccess: false,
            isSettings: false,
            isEditCompleted: false,
            isUserManager: false,
            isBranchManager: false,
            isMoveTable: false,
            isCancelOrder: false,
            isCashBill: false,
            isSplitCompleted: false,
            isCustomization: false,
            isLeaveRequest: false,
            isMenuSearch: false,
            isMergeBill: false
        });
        setItemToEdit(null);
        setOrderForModal(null);
        setItemToCustomize(null);
        setOrderItemToEdit(null);
    };

    // --- Menu Handlers ---
    const handleAddItemToOrder = (item: MenuItem) => {
        if (item.optionGroups && item.optionGroups.length > 0) {
            setItemToCustomize(item);
            setModalState(prev => ({ ...prev, isCustomization: true }));
        } else {
            // Simple item, add directly
            const cartItemId = `${item.id}`; // Simple ID for simple items
            setCurrentOrderItems(prev => {
                const existing = prev.find(i => i.cartItemId === cartItemId);
                if (existing) {
                    return prev.map(i => i.cartItemId === cartItemId ? { ...i, quantity: i.quantity + 1 } : i);
                }
                const newItem: OrderItem = {
                    ...item,
                    quantity: 1,
                    isTakeaway: false,
                    cartItemId,
                    finalPrice: item.price,
                    selectedOptions: []
                };
                return [...prev, newItem];
            });
        }
    };

    const handleConfirmCustomization = (itemToAdd: OrderItem) => {
        setCurrentOrderItems(prev => {
            if (orderItemToEdit) {
                // We are editing an existing cart item
                const newItems = prev.map(i => i.cartItemId === orderItemToEdit.cartItemId ? itemToAdd : i);
                setOrderItemToEdit(null);
                return newItems;
            } else {
                // Adding new item
                const existing = prev.find(i => i.cartItemId === itemToAdd.cartItemId);
                if (existing) {
                    return prev.map(i => i.cartItemId === itemToAdd.cartItemId ? { ...i, quantity: i.quantity + itemToAdd.quantity } : i);
                }
                return [...prev, itemToAdd];
            }
        });
        handleModalClose();
    };

    const handleUpdateOrderItem = (item: OrderItem) => {
        // Open customization modal with this item
        // Find original menu item to pass structure
        const menuItem = menuItems.find(m => m.id === item.id);
        if (menuItem) {
            setItemToCustomize(menuItem);
            setOrderItemToEdit(item);
            setModalState(prev => ({ ...prev, isCustomization: true }));
        }
    };

    const handleQuantityChange = (cartItemId: string, newQuantity: number) => {
        if (newQuantity <= 0) {
            handleRemoveItem(cartItemId);
            return;
        }
        setCurrentOrderItems(prev => prev.map(item => item.cartItemId === cartItemId ? { ...item, quantity: newQuantity } : item));
    };

    const handleRemoveItem = (cartItemId: string) => {
        setCurrentOrderItems(prev => prev.filter(item => item.cartItemId !== cartItemId));
    };

    const handleClearOrder = () => {
        setCurrentOrderItems([]);
        setCustomerName('');
        setCustomerCount(1);
    };

    const handleSaveMenuItem = (item: MenuItem) => {
        if (itemToEdit) {
            setMenuItems(prev => prev.map(i => i.id === itemToEdit.id ? { ...item, id: itemToEdit.id } : i));
        } else {
            const newId = menuItems.length > 0 ? Math.max(...menuItems.map(i => i.id)) + 1 : 1;
            setMenuItems(prev => [...prev, { ...item, id: newId }]);
        }
        handleModalClose();
    };

    const handleDeleteMenuItem = (id: number) => {
        Swal.fire({
            title: 'ยืนยันการลบ',
            text: "คุณต้องการลบเมนูนี้ใช่หรือไม่?",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            confirmButtonText: 'ลบ',
            cancelButtonText: 'ยกเลิก'
        }).then((result) => {
            if (result.isConfirmed) {
                setMenuItems(prev => prev.filter(i => i.id !== id));
            }
        });
    };

    const handleAddCategory = (name: string) => {
        if (!categories.includes(name)) {
            setCategories(prev => [...prev, name]);
        }
    };

    const handleUpdateCategory = (oldName: string, newName: string) => {
        setCategories(prev => prev.map(c => c === oldName ? newName : c));
        setMenuItems(prev => prev.map(i => i.category === oldName ? { ...i, category: newName } : i));
    };

    const handleDeleteCategory = (name: string) => {
        setCategories(prev => prev.filter(c => c !== name));
    };

    const handleToggleAvailability = (id: number) => {
        setMenuItems(prev => prev.map(i => i.id === id ? { ...i, isAvailable: i.isAvailable === false ? true : false } : i));
    };

    // --- Table/Floor Handlers ---
    const handleAddTable = (floor: string) => {
        const floorTables = tables.filter(t => t.floor === floor);
        const nextNum = floorTables.length + 1;
        const newId = tables.length > 0 ? Math.max(...tables.map(t => t.id)) + 1 : 1;
        setTables(prev => [...prev, { id: newId, name: `T${nextNum}`, floor, activePin: null, reservation: null }]);
    };

    const handleRemoveLastTable = (floor: string) => {
        const floorTables = tables.filter(t => t.floor === floor);
        if (floorTables.length > 0) {
            const lastTable = floorTables[floorTables.length - 1];
            setTables(prev => prev.filter(t => t.id !== lastTable.id));
        }
    };

    const handleAddFloor = () => {
        Swal.fire({
            title: 'เพิ่มชั้นใหม่',
            input: 'text',
            showCancelButton: true,
            confirmButtonText: 'เพิ่ม',
            cancelButtonText: 'ยกเลิก',
            inputValidator: (value) => {
                if (!value) return 'กรุณาใส่ชื่อชั้น';
                if (floors.includes(value)) return 'ชื่อชั้นนี้มีอยู่แล้ว';
            }
        }).then((result) => {
            if (result.isConfirmed && result.value) {
                setFloors(prev => [...prev, result.value]);
            }
        });
    };

    const handleRemoveFloor = (floor: string) => {
        const hasTables = tables.some(t => t.floor === floor);
        if (hasTables) {
            Swal.fire('ไม่สามารถลบได้', 'ยังมีโต๊ะอยู่ในชั้นนี้ กรุณาลบโต๊ะออกก่อน', 'error');
            return;
        }
        Swal.fire({
            title: `ลบชั้น "${floor}"?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            confirmButtonText: 'ลบ',
            cancelButtonText: 'ยกเลิก'
        }).then((result) => {
            if (result.isConfirmed) {
                setFloors(prev => prev.filter(f => f !== floor));
                if (selectedSidebarFloor === floor) setSelectedSidebarFloor(floors[0] || '');
            }
        });
    };

    // --- Order Handlers ---
    const handlePlaceOrder = async (items: OrderItem[], customerName: string, customerCount: number, tableOverride?: Table | null, isLineMan?: boolean, lineManNumber?: string) => {
        if (!selectedBranch) return;
        setIsPlacingOrder(true);

        // Fallback for table if none selected (e.g. LineMan)
        let targetTable = tableOverride || (selectedTableId ? tables.find(t => t.id === selectedTableId) : null);
        
        if (isLineMan) {
            // Virtual table for LineMan
            targetTable = { id: -1, name: 'LineMan', floor: 'Delivery' };
        }

        if (!targetTable) {
            setIsPlacingOrder(false);
            Swal.fire('Error', 'Please select a table', 'error');
            return;
        }

        const payload: PlaceOrderPayload = {
            branchId: selectedBranch.id.toString(),
            tableName: targetTable.name,
            floor: targetTable.floor,
            customerCount: customerCount,
            items: items,
            orderType: isLineMan ? 'lineman' : 'dine-in', // Updated type
            taxRate: isTaxEnabled ? taxRate : 0,
            placedBy: currentUser?.username || 'Unknown',
            sendToKitchen: sendToKitchen,
        };

        // Add manual order number for LineMan if present
        if (isLineMan && lineManNumber) {
             (payload as any).manualOrderNumber = lineManNumber;
        }

        try {
            const response = await functionsService.placeOrder(payload);
            if (response.success) {
                setLastPlacedOrderId(response.orderNumber || 0);
                setModalState(prev => ({ ...prev, isOrderSuccess: true }));
                handleClearOrder();
                // If LineMan, reset table selection (already handled in Sidebar but good to be safe)
                if (isLineMan) setSelectedTableId(null);
            } else {
                throw new Error(response.error || 'Unknown error');
            }
        } catch (error) {
            console.error("Order placement failed:", error);
            // Fallback logic for offline/direct DB write
            const newOrderId = Date.now();
            const newOrder: ActiveOrder = {
                id: newOrderId,
                orderNumber: newOrderId % 10000, // Simple numbering
                manualOrderNumber: (payload as any).manualOrderNumber || null,
                tableId: targetTable.id,
                tableName: targetTable.name,
                floor: targetTable.floor,
                customerCount,
                customerName: customerName,
                items: items,
                orderType: isLineMan ? 'lineman' : 'dine-in',
                status: sendToKitchen ? 'waiting' : 'served',
                orderTime: Date.now(),
                taxRate: isTaxEnabled ? taxRate : 0,
                taxAmount: 0, // Calculated later
                placedBy: currentUser?.username || 'Unknown'
            };
            
            // Calculate tax amount
            const subtotal = items.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
            newOrder.taxAmount = isTaxEnabled ? subtotal * (taxRate / 100) : 0;

            await activeOrdersActions.add(newOrder);
            
            setLastPlacedOrderId(newOrder.orderNumber);
            setModalState(prev => ({ ...prev, isOrderSuccess: true }));
            handleClearOrder();
            if (isLineMan) setSelectedTableId(null);
        } finally {
            setIsPlacingOrder(false);
        }
    };

    const handleUpdateOrder = async (orderId: number, items: OrderItem[], customerCount: number) => {
        // Find original order to calculate tax diff if needed, mainly just updating items
        const order = activeOrders.find(o => o.id === orderId);
        if (!order) return;

        const subtotal = items.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
        const taxAmount = order.taxRate > 0 ? subtotal * (order.taxRate / 100) : 0;

        await activeOrdersActions.update(orderId, {
            items,
            customerCount,
            taxAmount
        });
        handleModalClose();
    };

    const handleConfirmMoveTable = async (orderId: number, newTableId: number) => {
        const newTable = tables.find(t => t.id === newTableId);
        if (newTable) {
            await activeOrdersActions.update(orderId, {
                tableId: newTable.id,
                tableName: newTable.name,
                floor: newTable.floor
            });
            handleModalClose();
            Swal.fire('ย้ายโต๊ะสำเร็จ', `ย้ายไปยังโต๊ะ ${newTable.name} เรียบร้อยแล้ว`, 'success');
        }
    };

    const handleConfirmCancelOrder = async (order: ActiveOrder, reason: string, notes?: string) => {
        // Move to cancelled collection
        const cancelledOrder: CancelledOrder = {
            ...order,
            status: 'cancelled',
            cancellationTime: Date.now(),
            cancelledBy: currentUser?.username || 'Unknown',
            cancellationReason: reason as any,
            cancellationNotes: notes
        };

        // Use batch if possible, or sequential
        // 1. Add to cancelled
        if (newCancelledOrdersActions) {
             await newCancelledOrdersActions.add(cancelledOrder);
        } else {
             // Legacy fallback
             setLegacyCancelledOrders(prev => [...prev, cancelledOrder]);
        }
        
        // 2. Remove from active
        await activeOrdersActions.remove(order.id);

        handleModalClose();
        Swal.fire('ยกเลิกสำเร็จ', 'ออเดอร์ถูกยกเลิกแล้ว', 'success');
    };

    const handleStartCooking = async (orderId: number) => {
        await activeOrdersActions.update(orderId, { status: 'cooking', cookingStartTime: Date.now() });
    };

    const handleCompleteOrder = async (orderId: number) => {
        // Check if LineMan order -> Complete means "Done/Ready/Gone"?
        // Usually Kitchen "Complete" means "Served" (food is ready).
        // For LineMan, it might mean ready for pickup.
        await activeOrdersActions.update(orderId, { status: 'served' });
    };

    const handleShowBill = (orderId: number) => {
        const order = activeOrders.find(o => o.id === orderId);
        if (order) {
            setOrderForModal(order);
            setModalState(prev => ({ ...prev, isTableBill: true }));
        }
    };

    const handleGeneratePin = (tableId: number) => {
        // Logic to generate PIN for customer self-ordering (if used)
        const pin = Math.floor(1000 + Math.random() * 9000).toString();
        setTables(prev => prev.map(t => t.id === tableId ? { ...t, activePin: pin } : t));
        Swal.fire('PIN Created', `PIN for Table: ${pin}`, 'info');
    };

    const handleConfirmPayment = async (orderId: number, paymentDetails: PaymentDetails) => {
        if (!selectedBranch) return;
        setIsConfirmingPayment(true);
        const order = activeOrders.find(o => o.id === orderId);
        
        if (!order) {
             setIsConfirmingPayment(false);
             return;
        }

        try {
            await functionsService.confirmPayment({
                branchId: selectedBranch.id.toString(),
                orderId,
                paymentDetails
            });
            // Backend handles moving to completed. Frontend syncs automatically.
            
            // If we are using local logic fallback (caught in catch block usually, but let's handle optimistic UI or sync wait)
            // Ideally we wait for sync.
            // But let's show success modal immediately.
            setOrderForModal({...order, status: 'completed', completionTime: Date.now(), paymentDetails} as CompletedOrder); // Temporary cast for modal
            setModalState(prev => ({ ...prev, isPayment: false, isPaymentSuccess: true }));

        } catch (error) {
            console.error("Payment failed", error);
            // Fallback: Local Move
            const completedOrder: CompletedOrder = {
                ...order,
                status: 'completed',
                completionTime: Date.now(),
                paymentDetails,
                completedBy: currentUser?.username || 'Unknown'
            };
            
            if (newCompletedOrdersActions) await newCompletedOrdersActions.add(completedOrder);
            await activeOrdersActions.remove(orderId);

            setOrderForModal(completedOrder);
            setModalState(prev => ({ ...prev, isPayment: false, isPaymentSuccess: true }));
        } finally {
            setIsConfirmingPayment(false);
        }
    };

    const handlePaymentSuccessClose = async (shouldPrint: boolean) => {
        setModalState(prev => ({ ...prev, isPaymentSuccess: false }));
        if (shouldPrint && orderForModal && printerConfig?.cashier?.ipAddress) {
            try {
                await printerService.printReceipt(orderForModal as CompletedOrder, printerConfig.cashier, restaurantName);
            } catch (error: any) {
                Swal.fire('พิมพ์ใบเสร็จไม่สำเร็จ', error.message, 'error');
            }
        }
        setOrderForModal(null);
    };

    const handleConfirmSplit = (itemsToSplit: OrderItem[]) => {
        // Logic to split active order
        if (!orderForModal) return;
        const originalOrder = orderForModal as ActiveOrder;
        
        // 1. Remove items from original order
        // This is complex because we need to handle partial quantities.
        // Simplified: Assume valid quantities passed back.
        
        // Create new order with split items
        const newOrderId = Date.now() + 1;
        const newOrder: ActiveOrder = {
            ...originalOrder,
            id: newOrderId,
            orderNumber: newOrderId % 10000,
            items: itemsToSplit,
            // Recalculate tax
            taxAmount: (itemsToSplit.reduce((s, i) => s + i.finalPrice * i.quantity, 0)) * (originalOrder.taxRate / 100),
            isSplitChild: true,
            parentOrderId: originalOrder.id,
            splitIndex: (originalOrder.splitCount || 0) + 1
        };

        // Update original order (reduce quantities or remove items)
        const updatedOriginalItems = originalOrder.items.map(item => {
            const splitItem = itemsToSplit.find(si => si.cartItemId === item.cartItemId);
            if (splitItem) {
                return { ...item, quantity: item.quantity - splitItem.quantity };
            }
            return item;
        }).filter(item => item.quantity > 0);

        const updatedOriginalTax = (updatedOriginalItems.reduce((s, i) => s + i.finalPrice * i.quantity, 0)) * (originalOrder.taxRate / 100);

        // Perform updates
        activeOrdersActions.update(originalOrder.id, { 
            items: updatedOriginalItems, 
            taxAmount: updatedOriginalTax,
            splitCount: (originalOrder.splitCount || 0) + 1
        });
        activeOrdersActions.add(newOrder);

        handleModalClose();
        Swal.fire('แยกบิลสำเร็จ', 'สร้างบิลใหม่เรียบร้อยแล้ว', 'success');
    };

    const handleConfirmMerge = (sourceOrderIds: number[], targetOrderId: number) => {
        // 1. Get target order
        const targetOrder = activeOrders.find(o => o.id === targetOrderId);
        if (!targetOrder) return;

        // 2. Get source orders
        const sourceOrders = activeOrders.filter(o => sourceOrderIds.includes(o.id));
        
        // 3. Merge items
        const mergedItems = [...targetOrder.items];
        const mergedOrderNumbers = targetOrder.mergedOrderNumbers ? [...targetOrder.mergedOrderNumbers] : [];

        sourceOrders.forEach(source => {
            source.items.forEach(sourceItem => {
                const existingItemIndex = mergedItems.findIndex(mi => 
                    mi.id === sourceItem.id && 
                    JSON.stringify(mi.selectedOptions) === JSON.stringify(sourceItem.selectedOptions) &&
                    mi.notes === sourceItem.notes &&
                    mi.isTakeaway === sourceItem.isTakeaway
                );

                if (existingItemIndex > -1) {
                    mergedItems[existingItemIndex].quantity += sourceItem.quantity;
                } else {
                    // Tag item with original order number for tracking
                    mergedItems.push({
                        ...sourceItem,
                        originalOrderNumber: source.orderNumber
                    });
                }
            });
            mergedOrderNumbers.push(source.orderNumber);
        });

        // 4. Recalculate totals
        const newSubtotal = mergedItems.reduce((s, i) => s + i.finalPrice * i.quantity, 0);
        const newTax = newSubtotal * (targetOrder.taxRate / 100);

        // 5. Update target order
        activeOrdersActions.update(targetOrderId, {
            items: mergedItems,
            taxAmount: newTax,
            mergedOrderNumbers: mergedOrderNumbers,
            customerCount: targetOrder.customerCount + sourceOrders.reduce((s, o) => s + o.customerCount, 0) // Merge customer counts? Optional.
        });

        // 6. Delete source orders
        sourceOrderIds.forEach(id => activeOrdersActions.remove(id));

        handleModalClose();
        Swal.fire('รวมบิลสำเร็จ', `รวม ${sourceOrders.length} บิลเข้ากับออเดอร์ #${targetOrder.orderNumber} เรียบร้อย`, 'success');
    };

    const handleMergeAndPay = (sourceOrderIds: number[], targetOrderId: number) => {
        // First merge, then open payment modal for the target order
        handleConfirmMerge(sourceOrderIds, targetOrderId);
        
        // Wait a bit for state update/sync then open payment
        // In a real app, might need to wait for DB confirmation. 
        // Here we can just set timeout or assume optimistic update.
        setTimeout(() => {
            // ... logic to open payment modal ...
        }, 500);
    };

    const handleDeleteHistory = async (completedIds: number[], cancelledIds: number[], printIds: number[]) => {
        // Soft delete logic
        // Update items with isDeleted: true, deletedBy: currentUser.username
        
        // Completed
        for (const id of completedIds) {
            // Try new collection first
            if (newCompletedOrders.some(o => o.id === id)) {
                await newCompletedOrdersActions.update(id, { isDeleted: true, deletedBy: currentUser?.username });
            } else {
                // Legacy array
                setLegacyCompletedOrders(prev => prev.map(o => o.id === id ? { ...o, isDeleted: true, deletedBy: currentUser?.username } : o));
            }
        }

        // Cancelled
        for (const id of cancelledIds) {
            if (newCancelledOrders.some(o => o.id === id)) {
                await newCancelledOrdersActions.update(id, { isDeleted: true, deletedBy: currentUser?.username });
            } else {
                setLegacyCancelledOrders(prev => prev.map(o => o.id === id ? { ...o, isDeleted: true, deletedBy: currentUser?.username } : o));
            }
        }

        // Print History
        // Assuming Print History is still simple array in DB for now (or move to collection if needed)
        // If it's array:
        setPrintHistory(prev => prev.map(p => printIds.includes(p.id) ? { ...p, isDeleted: true, deletedBy: currentUser?.username } : p));
    };
    
    // ... (Render Logic)
    // ... (Initial checks...)
    if (isCustomerMode) {
        // ... (Customer View logic same as before)
        const customerTable = tables.find(t => t.id === customerTableId);
        if (customerTable) {
             return (
                <CustomerView 
                    table={customerTable}
                    menuItems={menuItems}
                    categories={categories}
                    activeOrders={activeOrders.filter(o => o.tableId === customerTableId)}
                    allBranchOrders={activeOrders}
                    completedOrders={completedOrders}
                    onPlaceOrder={(items, name) => handlePlaceOrder(items, name, 1, customerTable)}
                    onStaffCall={(table, custName) => setStaffCalls(prev => [...prev, {id: Date.now(), tableId: table.id, tableName: `${table.name} (${table.floor})`, customerName: custName, branchId: selectedBranch!.id, timestamp: Date.now()}])}
                    recommendedMenuItemIds={recommendedMenuItemIds}
                    logoUrl={logoUrl}
                    restaurantName={restaurantName}
                />
             );
        }
        return <div className="p-4 text-center">Loading customer view...</div>;
    }

    if (!currentUser) return <LoginScreen onLogin={handleLogin} />;
    if (!selectedBranch && currentUser.role !== 'admin') { return <BranchSelectionScreen currentUser={currentUser} branches={branches} onSelectBranch={handleSelectBranch} onManageBranches={() => setModalState(prev => ({...prev, isBranchManager: true}))} onLogout={handleLogout} />; }
    if (!selectedBranch && currentUser.role === 'admin') { return <BranchSelectionScreen currentUser={currentUser} branches={branches} onSelectBranch={handleSelectBranch} onManageBranches={() => setModalState(prev => ({...prev, isBranchManager: true}))} onLogout={handleLogout} />; }
    if (!selectedBranch) return <div>Error: No branch selected. Please log out and try again.</div>

    // ... (Mobile Header)
    const MobileHeader = ({ user, restaurantName, onOpenSearch, onProfileClick, isOrderNotificationsEnabled, onToggleOrderNotifications }: { user: User, restaurantName: string, onOpenSearch: () => void, onProfileClick: () => void, isOrderNotificationsEnabled: boolean, onToggleOrderNotifications: () => void }) => (
        <header className="bg-gray-900 text-white p-3 flex justify-between items-center flex-shrink-0 md:hidden z-30 shadow-lg relative">
            <div className="flex items-center gap-3 cursor-pointer" onClick={onProfileClick}>
                <img src={user.profilePictureUrl || "https://img.icons8.com/fluency/48/user-male-circle.png"} alt={user.username} className="h-10 w-10 rounded-full object-cover border-2 border-gray-700"/>
                <div>
                    <p className="font-semibold text-white leading-none">{user.username}</p>
                    <span className="text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded font-mono">{user.role}</span>
                </div>
            </div>
            <h1 className="text-xl font-bold text-red-500 absolute left-1/2 -translate-x-1/2 whitespace-nowrap hidden sm:block">{restaurantName}</h1>
            <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer" title="เปิด/ปิด เสียงแจ้งเตือน">
                    <input type="checkbox" checked={isOrderNotificationsEnabled} onChange={onToggleOrderNotifications} className="sr-only peer" />
                    <div className="w-9 h-5 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-500"></div>
                </label>
                <button onClick={onOpenSearch} className="p-2 text-gray-300 rounded-full hover:bg-gray-700" aria-label="Search Menu">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </button>
            </div>
        </header>
    );

    // Main App Layout
    return (
        <div className={`h-screen w-screen flex flex-col md:flex-row bg-gray-100 overflow-hidden ${isDesktop ? 'landscape-mode' : ''}`} onClick={handleAudioUnlock}>
            {/* Desktop Admin Sidebar */}
            {isAdminViewOnDesktop && (
                <AdminSidebar 
                   isCollapsed={isAdminSidebarCollapsed} onToggleCollapse={() => setIsAdminSidebarCollapsed(!isAdminSidebarCollapsed)}
                   logoUrl={logoUrl} restaurantName={restaurantName} branchName={selectedBranch.name} currentUser={currentUser}
                   onViewChange={setCurrentView} currentView={currentView} onToggleEditMode={() => setIsEditMode(!isEditMode)} isEditMode={isEditMode}
                   onOpenSettings={() => setModalState(prev => ({...prev, isSettings: true}))} onOpenUserManager={() => setModalState(prev => ({...prev, isUserManager: true}))}
                   onManageBranches={() => setModalState(prev => ({...prev, isBranchManager: true}))} onChangeBranch={() => setSelectedBranch(null)} onLogout={handleLogout}
                   kitchenBadgeCount={totalKitchenBadgeCount} tablesBadgeCount={tablesBadgeCount} leaveBadgeCount={leaveBadgeCount} stockBadgeCount={stockBadgeCount}
                   maintenanceBadgeCount={maintenanceBadgeCount}
                   onUpdateCurrentUser={handleUpdateCurrentUser} onUpdateLogoUrl={setLogoUrl} onUpdateRestaurantName={setRestaurantName}
                   isOrderNotificationsEnabled={isOrderNotificationsEnabled} onToggleOrderNotifications={toggleOrderNotifications}
                />
            )}
            
            <div className="flex-1 flex flex-col overflow-hidden transition-all duration-300" style={{ marginLeft: isAdminViewOnDesktop ? (isAdminSidebarCollapsed ? '5rem' : '16rem') : '0' }}>
                {/* Header for Desktop POS/Kitchen staff */}
                {isDesktop && !isAdminViewOnDesktop && (
                    <Header
                        currentView={currentView} onViewChange={setCurrentView} isEditMode={isEditMode} onToggleEditMode={() => setIsEditMode(!isEditMode)}
                        onOpenSettings={() => setModalState(prev => ({ ...prev, isSettings: true }))} cookingBadgeCount={cookingBadgeCount} waitingBadgeCount={waitingBadgeCount}
                        tablesBadgeCount={tablesBadgeCount} vacantTablesBadgeCount={vacantTablesCount} leaveBadgeCount={leaveBadgeCount} stockBadgeCount={stockBadgeCount} 
                        maintenanceBadgeCount={maintenanceBadgeCount} currentUser={currentUser} onLogout={handleLogout}
                        onOpenUserManager={() => setModalState(prev => ({ ...prev, isUserManager: true }))} logoUrl={logoUrl} onLogoChangeClick={() => {}}
                        restaurantName={restaurantName} onRestaurantNameChange={setRestaurantName} branchName={selectedBranch.name}
                        onChangeBranch={() => setSelectedBranch(null)} onManageBranches={() => setModalState(prev => ({ ...prev, isBranchManager: true }))}
                        printerStatus={printerStatus} // Pass updated printer status
                        printerConfig={printerConfig} // Pass printer config for header check logic
                        onCheckPrinterStatus={() => checkPrinters(true)} // Allow manual refresh
                    />
                )}
                
                {/* Main Content Area */}
                <main className={`flex-1 flex overflow-hidden ${!isDesktop ? 'pb-16' : ''}`}>
                    {/* ... (Existing View Rendering Logic remains exactly the same) */}
                    {/* Desktop POS View */}
                    {currentView === 'pos' && isDesktop && (
                        <div className="flex-1 flex overflow-hidden relative">
                            {/* ... (POS Components) */}
                            <div className="flex-1 overflow-y-auto">
                                <Menu
                                    menuItems={menuItems} setMenuItems={setMenuItems} categories={categories} onSelectItem={handleAddItemToOrder}
                                    isEditMode={isEditMode} onEditItem={(item) => { setItemToEdit(item); setModalState(prev => ({...prev, isMenuItem: true})); }}
                                    onAddNewItem={() => { setItemToEdit(null); setModalState(prev => ({...prev, isMenuItem: true})); }}
                                    onDeleteItem={handleDeleteMenuItem} onUpdateCategory={handleUpdateCategory} onDeleteCategory={handleDeleteCategory}
                                    onAddCategory={handleAddCategory} onImportMenu={(items, cats) => { setMenuItems(items); setCategories(prev => Array.from(new Set([...prev, ...cats]))); }}
                                    recommendedMenuItemIds={recommendedMenuItemIds}
                                />
                            </div>
                            <aside className={`flex-shrink-0 transition-all duration-300 overflow-hidden ${isOrderSidebarVisible ? 'w-96' : 'w-0'}`}>
                                {isOrderSidebarVisible && (
                                    <Sidebar
                                        currentOrderItems={currentOrderItems} onQuantityChange={handleQuantityChange} onRemoveItem={handleRemoveItem} onClearOrder={handleClearOrder}
                                        onPlaceOrder={handlePlaceOrder} isPlacingOrder={isPlacingOrder} tables={tables} selectedTable={selectedTable} onSelectTable={setSelectedTableId}
                                        customerName={customerName} onCustomerNameChange={setCustomerName} customerCount={customerCount} onCustomerCountChange={setCustomerCount}
                                        isEditMode={isEditMode} onAddNewTable={handleAddTable} onRemoveLastTable={handleRemoveLastTable} floors={floors} selectedFloor={selectedSidebarFloor}
                                        onFloorChange={setSelectedSidebarFloor} onAddFloor={handleAddFloor} onRemoveFloor={handleRemoveFloor} sendToKitchen={sendToKitchen}
                                        onSendToKitchenChange={(enabled, details) => { setSendToKitchen(enabled); setNotSentToKitchenDetails(details); }}
                                        onUpdateReservation={(tableId, reservation) => setTables(prev => prev.map(t => t.id === tableId ? {...t, reservation} : t))}
                                        onOpenSearch={() => setModalState(prev => ({...prev, isMenuSearch: true}))} currentUser={currentUser} onEditOrderItem={handleUpdateOrderItem}
                                        onViewChange={setCurrentView} restaurantName={restaurantName} onLogout={handleLogout}
                                        onToggleAvailability={handleToggleAvailability}
                                        isOrderNotificationsEnabled={isOrderNotificationsEnabled} onToggleOrderNotifications={toggleOrderNotifications}
                                    />
                                )}
                            </aside>
                            <button 
                                onClick={() => setIsOrderSidebarVisible(!isOrderSidebarVisible)}
                                className={`absolute top-1/2 -translate-y-1/2 z-10 bg-gray-800 text-white p-1 rounded-l-md shadow-lg transition-all duration-300 ${isOrderSidebarVisible ? 'right-96' : 'right-0 rounded-r-none rounded-l-md'}`}
                                aria-label={isOrderSidebarVisible ? "Hide Sidebar" : "Show Sidebar"}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 transition-transform duration-300 ${isOrderSidebarVisible ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </button>
                        </div>
                    )}

                    {/* Non-Desktop Views */}
                    {!isDesktop && (
                        <div className="flex-1 flex flex-col overflow-hidden">
                            {/* ... (Mobile/Tablet Views) */}
                            {currentView === 'pos' ? (
                                <div className="w-full flex flex-col h-full overflow-hidden">
                                    <MobileHeader 
                                        user={currentUser} 
                                        restaurantName={restaurantName} 
                                        onOpenSearch={() => setModalState(prev => ({...prev, isMenuSearch: true}))} 
                                        onProfileClick={handleMobileProfileClick}
                                        isOrderNotificationsEnabled={isOrderNotificationsEnabled}
                                        onToggleOrderNotifications={toggleOrderNotifications}
                                    />
                                    {/* ... Mobile POS Layout ... */}
                                    <div className="flex-1 flex overflow-hidden relative">
                                        <div className={`flex-1 overflow-y-auto ${isOrderSidebarVisible ? 'hidden md:block' : 'block'}`}>
                                            <Menu
                                                menuItems={menuItems} setMenuItems={setMenuItems} categories={categories} onSelectItem={handleAddItemToOrder}
                                                isEditMode={false} onEditItem={() => {}} onAddNewItem={() => {}} onDeleteItem={() => {}} onUpdateCategory={() => {}} 
                                                onDeleteCategory={() => {}} onAddCategory={() => {}} onImportMenu={() => {}}
                                                recommendedMenuItemIds={recommendedMenuItemIds}
                                            />
                                        </div>
                                        <div className={`flex-1 flex flex-col bg-gray-900 border-l border-gray-800 overflow-hidden ${isOrderSidebarVisible ? 'block' : 'hidden md:block md:w-96 md:flex-none'}`}>
                                             <Sidebar
                                                currentOrderItems={currentOrderItems} onQuantityChange={handleQuantityChange} onRemoveItem={handleRemoveItem} onClearOrder={handleClearOrder}
                                                onPlaceOrder={handlePlaceOrder} isPlacingOrder={isPlacingOrder} tables={tables} selectedTable={selectedTable} onSelectTable={setSelectedTableId}
                                                customerName={customerName} onCustomerNameChange={setCustomerName} customerCount={customerCount} onCustomerCountChange={setCustomerCount}
                                                isEditMode={false} onAddNewTable={() => {}} onRemoveLastTable={() => {}} floors={floors} selectedFloor={selectedSidebarFloor}
                                                onFloorChange={setSelectedSidebarFloor} onAddFloor={() => {}} onRemoveFloor={() => {}} sendToKitchen={sendToKitchen}
                                                onSendToKitchenChange={(enabled, details) => { setSendToKitchen(enabled); setNotSentToKitchenDetails(details); }}
                                                onUpdateReservation={(tableId, reservation) => setTables(prev => prev.map(t => t.id === tableId ? {...t, reservation} : t))}
                                                onOpenSearch={() => setModalState(prev => ({...prev, isMenuSearch: true}))} currentUser={currentUser} onEditOrderItem={handleUpdateOrderItem}
                                                onViewChange={setCurrentView} restaurantName={restaurantName} onLogout={handleLogout}
                                                isMobilePage={true}
                                                onToggleAvailability={handleToggleAvailability}
                                                isOrderNotificationsEnabled={isOrderNotificationsEnabled} onToggleOrderNotifications={toggleOrderNotifications}
                                            />
                                        </div>
                                    </div>
                                    {!isOrderSidebarVisible && currentOrderItems.length > 0 && (
                                        <button onClick={() => setIsOrderSidebarVisible(true)} className="absolute bottom-4 right-4 z-20 bg-blue-600 text-white p-4 rounded-full shadow-lg flex items-center justify-center animate-bounce">
                                            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center border-2 border-white">{totalCartItemCount}</span>
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                        </button>
                                    )}
                                     {isOrderSidebarVisible && (
                                        <button onClick={() => setIsOrderSidebarVisible(false)} className="absolute top-4 left-4 z-20 bg-gray-800/80 text-white p-2 rounded-full shadow-md backdrop-blur-sm md:hidden">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="w-full flex flex-col h-full">
                                    <MobileHeader 
                                        user={currentUser!} 
                                        restaurantName={restaurantName} 
                                        onOpenSearch={() => setModalState(prev => ({...prev, isMenuSearch: true}))} 
                                        onProfileClick={handleMobileProfileClick}
                                        isOrderNotificationsEnabled={isOrderNotificationsEnabled}
                                        onToggleOrderNotifications={toggleOrderNotifications}
                                    />
                                    <div className="flex-1 overflow-y-auto">
                                        {currentView === 'kitchen' && <KitchenView activeOrders={activeOrders} onCompleteOrder={handleCompleteOrder} onStartCooking={handleStartCooking} />}
                                        {currentView === 'tables' && <TableLayout tables={tables} activeOrders={activeOrders} onTableSelect={(id) => { setSelectedTableId(id); setCurrentView('pos'); }} onShowBill={handleShowBill} onGeneratePin={handleGeneratePin} currentUser={currentUser} printerConfig={printerConfig} floors={floors} selectedBranch={selectedBranch} />}
                                        {currentView === 'dashboard' && <Dashboard completedOrders={completedOrders} cancelledOrders={cancelledOrders} openingTime={openingTime || '10:00'} closingTime={closingTime || '22:00'} currentUser={currentUser} />}
                                        {currentView === 'history' && <SalesHistory completedOrders={completedOrders} cancelledOrders={cancelledOrders} printHistory={printHistory} onReprint={async (orderId) => {const order = completedOrders.find(o => o.orderNumber === orderId); if(order && printerConfig?.cashier?.ipAddress) await printerService.printReceipt(order, printerConfig.cashier, restaurantName);}} onSplitOrder={(order) => {setOrderForModal(order); setModalState(prev => ({...prev, isSplitCompleted: true}))}} isEditMode={isEditMode} onEditOrder={(order) => {setOrderForModal(order); setModalState(prev => ({...prev, isEditCompleted: true}))}} onInitiateCashBill={(order) => {setOrderForModal(order); setModalState(prev => ({...prev, isCashBill: true}))}} onDeleteHistory={handleDeleteHistory} currentUser={currentUser} />}
                                        {currentView === 'stock' && <StockManagement stockItems={stockItems} setStockItems={setStockItems} stockCategories={stockCategories} setStockCategories={setStockCategories} stockUnits={stockUnits} setStockUnits={setStockUnits} currentUser={currentUser} />}
                                        {currentView === 'stock-analytics' && <StockAnalytics stockItems={stockItems} />}
                                        {currentView === 'leave' && <LeaveCalendarView leaveRequests={leaveRequests} currentUser={currentUser} onOpenRequestModal={(date) => { setLeaveRequestInitialDate(date || null); setModalState(prev => ({...prev, isLeaveRequest: true})); }} branches={branches} onUpdateStatus={(id, status) => setLeaveRequests(prev => prev.map(r => r.id === id ? {...r, status} : r))} onDeleteRequest={async (id) => {setLeaveRequests(prev => prev.filter(r => r.id !== id)); return true;}} selectedBranch={selectedBranch} />}
                                        {currentView === 'leave-analytics' && <LeaveAnalytics leaveRequests={leaveRequests} users={users} />}
                                        {currentView === 'maintenance' && <MaintenanceView maintenanceItems={maintenanceItems} setMaintenanceItems={setMaintenanceItems} maintenanceLogs={maintenanceLogs} setMaintenanceLogs={setMaintenanceLogs} currentUser={currentUser} isEditMode={isEditMode} />}
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
                            {currentView === 'history' && <SalesHistory completedOrders={completedOrders} cancelledOrders={cancelledOrders} printHistory={printHistory} onReprint={async (orderId) => {const order = completedOrders.find(o => o.orderNumber === orderId); if(order && printerConfig?.cashier?.ipAddress) await printerService.printReceipt(order, printerConfig.cashier, restaurantName);}} onSplitOrder={(order) => {setOrderForModal(order); setModalState(prev => ({...prev, isSplitCompleted: true}))}} isEditMode={isEditMode} onEditOrder={(order) => {setOrderForModal(order); setModalState(prev => ({...prev, isEditCompleted: true}))}} onInitiateCashBill={(order) => {setOrderForModal(order); setModalState(prev => ({...prev, isCashBill: true}))}} onDeleteHistory={handleDeleteHistory} currentUser={currentUser} />}
                            {currentView === 'stock' && <StockManagement stockItems={stockItems} setStockItems={setStockItems} stockCategories={stockCategories} setStockCategories={setStockCategories} stockUnits={stockUnits} setStockUnits={setStockUnits} currentUser={currentUser} />}
                            {currentView === 'stock-analytics' && <StockAnalytics stockItems={stockItems} />}
                            {currentView === 'leave' && <LeaveCalendarView leaveRequests={leaveRequests} currentUser={currentUser} onOpenRequestModal={(date) => { setLeaveRequestInitialDate(date || null); setModalState(prev => ({...prev, isLeaveRequest: true})); }} branches={branches} onUpdateStatus={(id, status) => setLeaveRequests(prev => prev.map(r => r.id === id ? {...r, status} : r))} onDeleteRequest={async (id) => {setLeaveRequests(prev => prev.filter(r => r.id !== id)); return true;}} selectedBranch={selectedBranch} />}
                            {currentView === 'leave-analytics' && <LeaveAnalytics leaveRequests={leaveRequests} users={users} />}
                            {currentView === 'maintenance' && <MaintenanceView maintenanceItems={maintenanceItems} setMaintenanceItems={setMaintenanceItems} maintenanceLogs={maintenanceLogs} setMaintenanceLogs={setMaintenanceLogs} currentUser={currentUser} isEditMode={isEditMode} />}
                        </>
                    )}
                </main>
            </div>
            
            {!isDesktop && currentUser && <BottomNavBar items={mobileNavItems} currentView={currentView} onViewChange={setCurrentView} />}

            {/* Modals (No Changes Here) */}
            <LoginModal isOpen={false} onClose={() => {}} />
            <MenuItemModal isOpen={modalState.isMenuItem} onClose={handleModalClose} onSave={handleSaveMenuItem} itemToEdit={itemToEdit} categories={categories} onAddCategory={handleAddCategory} />
            <OrderSuccessModal isOpen={modalState.isOrderSuccess} onClose={handleModalClose} orderId={lastPlacedOrderId || 0} warningMessage={null} />
            <SplitBillModal isOpen={modalState.isSplitBill} order={orderForModal as ActiveOrder | null} onClose={handleModalClose} onConfirmSplit={handleConfirmSplit} />
            <TableBillModal 
                isOpen={modalState.isTableBill} 
                onClose={handleModalClose} 
                order={orderForModal as ActiveOrder | null} 
                onInitiatePayment={(order) => { setOrderForModal(order); setModalState(prev => ({...prev, isPayment: true, isTableBill: false})); }} 
                onInitiateMove={(order) => {setOrderForModal(order); setModalState(prev => ({...prev, isMoveTable: true, isTableBill: false})); }} 
                onSplit={(order) => {setOrderForModal(order); setModalState(prev => ({...prev, isSplitBill: true, isTableBill: false})); }} 
                onUpdateOrder={handleUpdateOrder} 
                isEditMode={isEditMode} 
                currentUser={currentUser} 
                onInitiateCancel={(order) => {setOrderForModal(order); setModalState(prev => ({...prev, isCancelOrder: true, isTableBill: false}))}} 
                activeOrders={activeOrders} 
                onInitiateMerge={(order) => {setOrderForModal(order); setModalState(prev => ({...prev, isMergeBill: true, isTableBill: false}))}}
                onMergeAndPay={handleMergeAndPay}
            />
            <PaymentModal isOpen={modalState.isPayment} order={orderForModal as ActiveOrder | null} onClose={handleModalClose} onConfirmPayment={handleConfirmPayment} qrCodeUrl={qrCodeUrl} isEditMode={isEditMode} onOpenSettings={() => setModalState(prev => ({...prev, isSettings: true}))} isConfirmingPayment={isConfirmingPayment} />
            <PaymentSuccessModal isOpen={modalState.isPaymentSuccess} onClose={handlePaymentSuccessClose} orderNumber={(orderForModal as CompletedOrder)?.orderNumber || 0} />
            <SettingsModal isOpen={modalState.isSettings} onClose={handleModalClose} onSave={(qr, sound, staffSound, printer, open, close) => { setQrCodeUrl(qr); setNotificationSoundUrl(sound); setStaffCallSoundUrl(staffSound); setPrinterConfig(printer); setOpeningTime(open); setClosingTime(close); handleModalClose(); }} currentQrCodeUrl={qrCodeUrl} currentNotificationSoundUrl={notificationSoundUrl} currentStaffCallSoundUrl={staffCallSoundUrl} currentPrinterConfig={printerConfig} currentOpeningTime={openingTime} currentClosingTime={closingTime} onSavePrinterConfig={setPrinterConfig} menuItems={menuItems} currentRecommendedMenuItemIds={recommendedMenuItemIds} onSaveRecommendedItems={setRecommendedMenuItemIds} />
            <EditCompletedOrderModal isOpen={modalState.isEditCompleted} order={orderForModal as CompletedOrder | null} onClose={handleModalClose} onSave={async ({id, items}) => { if(newCompletedOrders.some(o => o.id === id)) { await newCompletedOrdersActions.update(id, { items }); } else { setLegacyCompletedOrders(prev => prev.map(o => o.id === id ? {...o, items} : o)); } }} menuItems={menuItems} />
            <UserManagerModal isOpen={modalState.isUserManager} onClose={handleModalClose} users={users} setUsers={setUsers} currentUser={currentUser!} branches={branches} isEditMode={isEditMode} />
            <BranchManagerModal isOpen={modalState.isBranchManager} onClose={handleModalClose} branches={branches} setBranches={setBranches} currentUser={currentUser} />
            <MoveTableModal isOpen={modalState.isMoveTable} onClose={handleModalClose} order={orderForModal as ActiveOrder | null} tables={tables} activeOrders={activeOrders} onConfirmMove={handleConfirmMoveTable} floors={floors} />
            <CancelOrderModal isOpen={modalState.isCancelOrder} onClose={handleModalClose} order={orderForModal as ActiveOrder | null} onConfirm={handleConfirmCancelOrder} />
            <CashBillModal isOpen={modalState.isCashBill} order={orderForModal as CompletedOrder | null} onClose={handleModalClose} restaurantName={restaurantName} logoUrl={logoUrl} />
            <SplitCompletedBillModal isOpen={modalState.isSplitCompleted} order={orderForModal as CompletedOrder | null} onClose={handleModalClose} onConfirmSplit={() => {}} />
            <ItemCustomizationModal isOpen={modalState.isCustomization} onClose={handleModalClose} item={itemToCustomize} onConfirm={handleConfirmCustomization} orderItemToEdit={orderItemToEdit} />
            <LeaveRequestModal isOpen={modalState.isLeaveRequest} onClose={handleModalClose} currentUser={currentUser} onSave={async (req) => { const fullRequest = { ...req, id: Date.now(), status: 'pending' as const, branchId: selectedBranch!.id }; try { await functionsService.submitLeaveRequest(fullRequest); } catch(e) { setLeaveRequests(prev => [...prev, fullRequest]); } handleModalClose(); Swal.fire({ icon: 'success', title: 'ส่งคำขอเรียบร้อย', showConfirmButton: false, timer: 1500 }); }} leaveRequests={leaveRequests} initialDate={leaveRequestInitialDate} />
            <MenuSearchModal isOpen={modalState.isMenuSearch} onClose={handleModalClose} menuItems={menuItems} onSelectItem={handleAddItemToOrder} onToggleAvailability={handleToggleAvailability} />
            <MergeBillModal isOpen={modalState.isMergeBill} onClose={handleModalClose} order={orderForModal as ActiveOrder} allActiveOrders={activeOrders} tables={tables} onConfirmMerge={handleConfirmMerge} />
        </div>
    );
};

export default App;
