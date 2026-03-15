
// ... existing imports ...
import React, { useState, useEffect, useMemo, useCallback, useRef, Suspense, lazy } from 'react';
import './datepicker.css';

// ... (Keep existing imports same as before) ...
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
    DEFAULT_MAINTENANCE_ITEMS,
    DEFAULT_DELIVERY_PROVIDERS
} from './constants';
// ... types import
import type { 
    MenuItem, 
    OrderItem, 
    Table, 
    ActiveOrder, 
    User, 
    CompletedOrder, 
    CancelledOrder, 
    Recipe,
    PrinterConfig, 
    Branch, 
    StockItem, 
    StockTag,
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
    DeliveryProvider
} from './types';
import { useFirestoreSync, useFirestoreCollection } from './hooks/useFirestoreSync';
import { useUI } from './contexts/UIContext';
import { useData } from './contexts/DataContext';
import { useOrderLogic } from './hooks/useOrderLogic';
import { useBillingLogic } from './hooks/useBillingLogic';
import { useTableLogic } from './hooks/useTableLogic';
import { useMenuLogic } from './hooks/useMenuLogic';
import { useHistoryLogic } from './hooks/useHistoryLogic';
import { functionsService } from './services/firebaseFunctionsService';
import { printerService } from './services/printerService';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import 'firebase/compat/messaging';
import { isFirebaseConfigured, db } from './firebaseConfig';

import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Menu } from './components/Menu';
// Lazy load heavy components
const KitchenView = lazy(() => import('./components/KitchenView').then(module => ({ default: module.KitchenView })));
const TableLayout = lazy(() => import('./components/TableLayout').then(module => ({ default: module.TableLayout })));
const Dashboard = lazy(() => import('./components/Dashboard').then(module => ({ default: module.Dashboard })));
const SalesHistory = lazy(() => import('./components/SalesHistory').then(module => ({ default: module.SalesHistory })));
const StockManagement = lazy(() => import('./components/StockManagement').then(module => ({ default: module.StockManagement })));
const StockAnalytics = lazy(() => import('./components/StockAnalytics').then(module => ({ default: module.StockAnalytics })));
const RecipeManagement = lazy(() => import('./components/RecipeManagement').then(module => ({ default: module.RecipeManagement })));
const LeaveCalendarView = lazy(() => import('./components/LeaveCalendarView').then(module => ({ default: module.LeaveCalendarView })));
const LeaveAnalytics = lazy(() => import('./components/LeaveAnalytics').then(module => ({ default: module.LeaveAnalytics })));
const AdminSidebar = lazy(() => import('./components/AdminSidebar')); // Default export
const MaintenanceView = lazy(() => import('./components/MaintenanceView').then(module => ({ default: module.MaintenanceView })));
const CustomerView = lazy(() => import('./components/CustomerView').then(module => ({ default: module.CustomerView })));
const QueueDisplay = lazy(() => import('./components/QueueDisplay').then(module => ({ default: module.QueueDisplay })));
const HRManagementView = lazy(() => import('./components/HRManagementView'));
const PrivacyPolicy = lazy(() => import('./components/PrivacyPolicy').then(module => ({ default: module.PrivacyPolicy })));

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
// Lazy load heavy settings modal
const SettingsModal = lazy(() => import('./components/SettingsModal').then(module => ({ default: module.SettingsModal })));
import { EditCompletedOrderModal } from './components/EditCompletedOrderModal';
import { UserManagerModal } from './components/UserManagerModal';
import { BranchManagerModal } from './components/BranchManagerModal';
import { MoveTableModal } from './components/MoveTableModal';
import { CancelOrderModal } from './components/CancelOrderModal';
import { CashBillModal } from './components/CashBillModal';
import { ItemCustomizationModal } from './components/ItemCustomizationModal';
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

// Loading Spinner Component
const PageLoading = () => (
    <div className="h-full w-full flex flex-col items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mb-4"></div>
        <p className="text-gray-500 font-medium">กำลังโหลด...</p>
    </div>
);

export const App: React.FC = () => {
    // 1. STATE INITIALIZATION
    const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    // --- AUTH & BRANCH STATE ---
    const {
        users, setUsers,
        branches, setBranches,
        currentUser, setCurrentUser,
        isCustomerMode, setIsCustomerMode,
        selectedBranch, setSelectedBranch,
        customerTableId, setCustomerTableId,
        branchId, heavyDataBranchId, shouldLoadHeavyData,
        // Essential Data
        menuItems, setMenuItems,
        recipes, setRecipes,
        categories, setCategories,
        tables, setTables,
        floors, setFloors,
        recommendedMenuItemIds, setRecommendedMenuItemIds,
        activeOrders, rawActiveOrders, activeOrdersActions,
        // Heavy Data
        legacyCompletedOrders, setLegacyCompletedOrders,
        legacyCancelledOrders, setLegacyCancelledOrders,
        newCompletedOrders, newCompletedOrdersActions,
        newCancelledOrders, newCancelledOrdersActions,
        completedOrders, cancelledOrders,
        stockItems, setStockItems,
        stockTags, setStockTags,
        stockCategories, setStockCategories,
        stockUnits, setStockUnits,
        stockLogs, stockLogsActions,
        printHistory, setPrintHistory,
        maintenanceItems, setMaintenanceItems,
        maintenanceLogs, setMaintenanceLogs,
        orderCounter, setOrderCounter,
        staffCalls, setStaffCalls,
        leaveRequests, setLeaveRequests,
        // Settings
        logoUrl, setLogoUrl,
        appLogoUrl, setAppLogoUrl,
        restaurantName, setRestaurantName,
        restaurantAddress, setRestaurantAddress,
        restaurantPhone, setRestaurantPhone,
        taxId, setTaxId,
        signatureUrl, setSignatureUrl,
        qrCodeUrl, setQrCodeUrl,
        notificationSoundUrl, setNotificationSoundUrl,
        staffCallSoundUrl, setStaffCallSoundUrl,
        printerConfig, setPrinterConfig,
        openingTime, setOpeningTime,
        closingTime, setClosingTime,
        isTaxEnabled, setIsTaxEnabled,
        taxRate, setTaxRate,
        sendToKitchen, setSendToKitchen,
        deliveryProviders, setDeliveryProviders,
        facebookAppId, setFacebookAppId,
        facebookAppSecret, setFacebookAppSecret,
        lineNotifyToken, setLineNotifyToken,
        lineMessagingToken, setLineMessagingToken,
        lineUserId, setLineUserId,
        telegramBotToken, setTelegramBotToken,
        telegramChatId, setTelegramChatId,
        lineOaUrl, setLineOaUrl,
        facebookPageUrl, setFacebookPageUrl
    } = useData();

    // Re-introduce urlBranchId for local logic checks
    const urlBranchId = useMemo(() => new URLSearchParams(window.location.search).get('branchId'), []);

    // --- NEW: Handle URL parameters for Auto-Login (LINE OA / QR Code) ---
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const tableIdParam = params.get('tableId');
        const branchIdParam = params.get('branchId');

        if (tableIdParam && branchIdParam) {
            const tId = parseInt(tableIdParam, 10);
            const bId = parseInt(branchIdParam, 10);

            if (!isNaN(tId) && !isNaN(bId)) {
                // 1. Handle User Login
                const isSameUser = currentUser?.role === 'table' && 
                                   currentUser.assignedTableId === tId &&
                                   currentUser.allowedBranchIds?.includes(bId);

                if (!isSameUser) {
                    const tempUserId = 900000000 + (bId * 10000) + tId;
                    const tableUser: User = {
                        id: tempUserId,
                        username: `Table ${tId}`,
                        password: '',
                        role: 'table',
                        allowedBranchIds: [bId],
                        assignedTableId: tId
                    };
                    setCurrentUser(tableUser);
                    setIsCustomerMode(true);
                    setCustomerTableId(tId);
                }

                // 2. Handle Branch Selection
                // Only attempt if branches are loaded
                if (branches.length > 0) {
                    if (selectedBranch?.id !== bId) {
                        const branch = branches.find(b => b.id === bId);
                        if (branch) {
                            setSelectedBranch(branch);
                        }
                    }
                }
            }
        }
    }, [currentUser, branches, selectedBranch, setCurrentUser, setIsCustomerMode, setCustomerTableId, setSelectedBranch]);

    // --- SPECIAL DISPLAY MODES ---
    const [isQueueMode, setIsQueueMode] = useState(() => window.location.pathname === '/queue');
    const [isPrivacyPolicyMode, setIsPrivacyPolicyMode] = useState(() => 
        window.location.pathname === '/privacy-policy' || 
        window.location.hash === '#/privacy-policy' ||
        window.location.hash === '#privacy-policy'
    );
    const [currentFcmToken, setCurrentFcmToken] = useState<string | null>(null);

    // --- VIEW & EDIT MODE STATE ---
    const {
        currentView, setCurrentView,
        isEditMode, setIsEditMode,
        isAdminSidebarCollapsed, setIsAdminSidebarCollapsed,
        isOrderSidebarVisible, setIsOrderSidebarVisible,
        modalState, setModalState,
        itemToEdit, setItemToEdit,
        itemToCustomize, setItemToCustomize,
        orderItemToEdit, setOrderItemToEdit,
        orderForModal, setOrderForModal,
        selectedOrderIdForModal, setSelectedOrderIdForModal,
        leaveRequestInitialDate, setLeaveRequestInitialDate,
        selectedSidebarFloor, setSelectedSidebarFloor
    } = useUI();

    const [initialNewUserForModal, setInitialNewUserForModal] = useState<Partial<User> | null>(null);

    const handleOpenUserManagerWithData = (userData: Partial<User>) => {
        setInitialNewUserForModal(userData);
        setModalState(prev => ({ ...prev, isUserManager: true }));
    };

    // --- NOTIFICATION TOGGLE STATE ---
    const [isOrderNotificationsEnabled, setIsOrderNotificationsEnabled] = useState(() => {
        return localStorage.getItem('isOrderNotificationsEnabled') === 'true';
    });

    const toggleOrderNotifications = () => {
        setIsOrderNotificationsEnabled(prev => {
            const newValue = !prev;
            localStorage.setItem('isOrderNotificationsEnabled', String(newValue));
            return newValue;
        });
    };

    // --- AUTO PRINT TOGGLE STATE ---
    const [isAutoPrintEnabled, setIsAutoPrintEnabled] = useState(() => {
        return localStorage.getItem('isAutoPrintEnabled') === 'true';
    });

    const toggleAutoPrint = () => {
        setIsAutoPrintEnabled(prev => {
            const newValue = !prev;
            localStorage.setItem('isAutoPrintEnabled', String(newValue));
            return newValue;
        });
    };
    
    // --- BRANCH & AUTH LOGIC MOVED TO DATA CONTEXT ---


    // --- DATA STATES MOVED TO DATA CONTEXT ---

    // --- POS-SPECIFIC LOCAL STATE ---
    const [currentOrderItems, setCurrentOrderItems] = useState<OrderItem[]>([]);
    const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
    const [customerName, setCustomerName] = useState('');
    const [customerCount, setCustomerCount] = useState(1);

    const [notSentToKitchenDetails, setNotSentToKitchenDetails] = useState<{ reason: string; notes: string } | null>(null);

    // --- SETTINGS MOVED TO DATA CONTEXT ---

    // ... (Keep modal state and other hooks) ...
    // --- MODAL STATES ---
    // MOVED TO UI CONTEXT
    
    // --- LOGIC HOOKS ---
    const { 
        placeOrder, 
        isPlacingOrder, 
        lastPlacedOrderId,
        handleUpdateOrderFromModal,
        handleCancelOrder,
        handleStartCooking,
        handleCompleteOrder,
        handlePrintKitchenOrder
    } = useOrderLogic();
    const { 
        isConfirmingPayment, 
        handleShowBill, 
        handleConfirmPayment, 
        handlePaymentSuccessClose, 
        handleReprintReceipt, 
        handleConfirmSplit, 
        handleConfirmMerge, 
        handleMergeAndPay,
        handleConfirmCancelOrder
    } = useBillingLogic();

    const {
        handleAddTable,
        handleRemoveLastTable,
        handleAddFloor,
        handleRemoveFloor,
        handleConfirmMoveTable,
        handleGeneratePin
    } = useTableLogic();

    const {
        handleSaveMenuItem,
        handleDeleteMenuItem,
        handleAddCategory,
        handleUpdateCategory,
        handleDeleteCategory,
        handleToggleAvailability,
        handleToggleVisibility
    } = useMenuLogic();

    const handleSaveMenuItemAndCloseModal = (itemData: Omit<MenuItem, 'id'> & { id?: number }) => {
        handleSaveMenuItem(itemData);
        handleModalClose();
    };

    const { handleDeleteHistory } = useHistoryLogic();
    const [isCachingImages, setIsCachingImages] = useState(false);
    const imageCacheTriggeredRef = useRef(false);
    const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);

    // --- REFS ---
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
    // Ref to track processed auto-prints to avoid duplication
    // const autoPrintProcessedIds = useRef<Set<number>>(new Set()); // REPLACED
    // NEW: Ref to track the latest staff call time to prevent duplicate alerts on refresh
    const latestStaffCallTimeRef = useRef(Date.now());
    // NEW: Ref to track active orders for change detection (better auto print)
    const prevOrdersForAutoPrint = useRef<ActiveOrder[] | null>(null);
    // NEW: Ref to track max leave request ID to detect new ones
    const maxKnownLeaveIdRef = useRef<number>(-1);

    // ... Computed Values ... (Same as before)
    const waitingBadgeCount = useMemo(() => activeOrders.filter(o => o.status === 'waiting' || o.status === 'pending_payment').length, [activeOrders]);
    const cookingBadgeCount = useMemo(() => activeOrders.filter(o => o.status === 'cooking').length, [activeOrders]);
    const totalKitchenBadgeCount = waitingBadgeCount + cookingBadgeCount;

    const occupiedTablesCount = useMemo(() => {
        const occupiedTableIds = new Set(
            activeOrders
                .filter(o => tables.some(t => t.id === o.tableId))
                .map(o => o.tableId)
        );
        return occupiedTableIds.size;
    }, [activeOrders, tables]);
    const tablesBadgeCount = occupiedTablesCount > 0 ? occupiedTablesCount : 0;

    const leaveBadgeCount = useMemo(() => {
        if (!currentUser) return 0;
        const filterPredicate = (req: LeaveRequest) => {
            if (req.status !== 'pending') return false;
            if (currentUser.role === 'admin') {
                return req.branchId === 1;
            }
            if (currentUser.role === 'branch-admin' || currentUser.role === 'auditor') {
                return currentUser.allowedBranchIds?.includes(req.branchId) ?? false;
            }
            return false;
        };
        return leaveRequests.filter(filterPredicate).length;
    }, [leaveRequests, currentUser]);

    const stockBadgeCount = useMemo(() => {
        return stockItems.filter(item => {
            const qty = Number(item.quantity) || 0;
            const reorder = Number(item.reorderPoint) || 0;
            return qty <= reorder;
        }).length;
    }, [stockItems]);

    const payrollBadgeCount = useMemo(() => {
        if (!currentUser) return 0;
        // Count approved unpaid leaves that haven't been processed (simplified logic: just count approved unpaid leaves)
        // In a real app, you'd check if they are already deducted in a payroll record.
        // For this request, we just count approved unpaid leaves to show the notification.
        return leaveRequests.filter(req => 
            req.type === 'leave-without-pay' && 
            req.status === 'approved' &&
            (currentUser.role === 'admin' || (currentUser.role === 'branch-admin' && currentUser.allowedBranchIds?.includes(req.branchId)))
        ).length;
    }, [leaveRequests, currentUser]);

    const maintenanceBadgeCount = useMemo(() => {
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;
        return maintenanceItems.filter(item => {
            const lastDate = item.lastMaintenanceDate || 0;
            const dueDate = new Date(lastDate);
            dueDate.setMonth(dueDate.getMonth() + item.cycleMonths);
            const dueTimestamp = dueDate.getTime();
            const daysDiff = Math.ceil((dueTimestamp - now) / oneDay);
            return daysDiff <= 7;
        }).length;
    }, [maintenanceItems]);

    const mobileNavItems = useMemo(() => {
        const items: NavItem[] = [
            {id: 'pos', label: 'POS', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" /><path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h2a1 1 0 100-2H9z" clipRule="evenodd" /></svg>, view: 'pos'},
        ];

        // Show Kitchen tab for everyone except auditor (so admin/branch-admin can see it too)
        if (currentUser?.role !== 'auditor') {
             items.push({id: 'kitchen', label: 'ครัว', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h10a3 3 0 013 3v5a.997.997 0 01-.293.707zM5 6a1 1 0 100 2 1 1 0 000-2zm3 0a1 1 0 100 2 1 1 0 000-2zm3 0a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" /></svg>, view: 'kitchen', badge: totalKitchenBadgeCount});
        }

        items.push({id: 'tables', label: 'ผังโต๊ะ', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2-2H4a2 2 0 01-2-2V5zm2 1v8h8V6H4z" /></svg>, view: 'tables', badge: tablesBadgeCount});

        if (currentUser?.role === 'admin' || currentUser?.role === 'branch-admin' || currentUser?.role === 'auditor') {
             items.push({
                id: 'dashboard',
                label: 'Dashboard',
                icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1-1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" /></svg>,
                view: 'dashboard'
            });
            
            // Add Recipe tab for admin only
            if (currentUser?.role === 'admin') {
                items.push({
                    id: 'recipes',
                    label: 'สูตรอาหาร',
                    icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>,
                    view: 'recipes'
                });
            }
        }
        if (currentUser?.role === 'admin' || currentUser?.role === 'branch-admin' || currentUser?.role === 'auditor') {
            items.push({id: 'history', label: 'ประวัติ', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>, view: 'history'});
        }
        
        if (currentUser?.role !== 'pos') {
            items.push({id: 'stock', label: 'สต็อก', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>, view: 'stock', badge: stockBadgeCount});
            items.push({
                id: 'leave',
                label: 'วันลา',
                icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>,
                view: 'leave',
                badge: leaveBadgeCount
            });
        }
        
        // Add Payroll Tab for Admin/Branch Admin
        if (currentUser?.role === 'admin' || currentUser?.role === 'branch-admin') {
            items.push({
                id: 'payroll',
                label: 'เงินเดือน',
                icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
                view: 'hr-payroll',
                badge: payrollBadgeCount
            });
        }

        items.push({

            id: 'maintenance',
            label: 'บำรุงรักษา',
            icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
            view: 'maintenance',
            badge: maintenanceBadgeCount
        });
        return items;
    }, [currentUser, tablesBadgeCount, totalKitchenBadgeCount, leaveBadgeCount, stockBadgeCount, maintenanceBadgeCount]);

    const selectedTable = useMemo(() => {
        return tables.find(t => t.id === selectedTableId) || null;
    }, [tables, selectedTableId]);
    
    const vacantTablesCount = useMemo(() => {
        const occupiedTableIds = new Set(
            activeOrders
                .filter(o => tables.some(t => t.id === o.tableId))
                .map(o => o.tableId)
        );
        return Math.max(0, tables.length - occupiedTableIds.size);
    }, [tables, activeOrders]);

    const isAdminViewOnDesktop = useMemo(() => 
        (currentUser?.role === 'admin' || currentUser?.role === 'branch-admin' || currentUser?.role === 'auditor') && isDesktop,
        [currentUser, isDesktop]
    );
    
    const totalCartItemCount = useMemo(() => {
        return currentOrderItems.reduce((acc, item) => acc + item.quantity, 0);
    }, [currentOrderItems]);

    // ... Effects ... (Online, Resize, Sound Cache, Overdue, Low Stock, Maintenance)
    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => { setIsOnline(false); Swal.fire({ icon: 'warning', title: 'ขาดการเชื่อมต่อ', text: 'อินเทอร์เน็ตของคุณหลุด ระบบจะป้องกันการบันทึกข้อมูลเพื่อความปลอดภัย กรุณาตรวจสอบอินเทอร์เน็ต', toast: true, position: 'top-end', showConfirmButton: false, timer: 5000 }); };
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
    }, []);
    
    // Ensure table users always stay in customer mode
    useEffect(() => {
        if (currentUser?.role === 'table') {
            setIsCustomerMode(true);
            if (currentUser.assignedTableId) {
                setCustomerTableId(currentUser.assignedTableId);
            }
            
            // AUTO-SELECT BRANCH for 'table' user based on their allowedBranchIds
            // FIX: Only set if NO URL branchId is present to prevent override
            if (!urlBranchId && currentUser.allowedBranchIds && currentUser.allowedBranchIds.length > 0) {
                const branch = branches.find(b => b.id === currentUser.allowedBranchIds![0]);
                if (branch) {
                    setSelectedBranch(branch);
                    localStorage.setItem('selectedBranch', JSON.stringify(branch));
                }
            }
        }
    }, [currentUser, urlBranchId, branches]); // Added dependencies

    useEffect(() => {
        if (!isOnline) return;
        activeOrders.forEach(order => {
            if (order.orderType === 'lineman') return;
            const realTable = tables.find(t => t.id === order.tableId);
            if (realTable && (realTable.floor !== order.floor || realTable.name !== order.tableName)) {
                activeOrdersActions.update(order.id, { floor: realTable.floor, tableName: realTable.name });
            }
        });
    }, [activeOrders, tables, isOnline]);
    useEffect(() => { const handleResize = () => setIsDesktop(window.innerWidth >= 1024); window.addEventListener('resize', handleResize); return () => window.removeEventListener('resize', handleResize); }, []);
    useEffect(() => { if ('serviceWorker' in navigator && navigator.serviceWorker.controller) { const soundsToCache = []; if (notificationSoundUrl) soundsToCache.push(notificationSoundUrl); if (staffCallSoundUrl) soundsToCache.push(staffCallSoundUrl); if (soundsToCache.length > 0) { soundsToCache.forEach(url => fetch(url, { mode: 'no-cors' }).catch(() => {})); } } }, [notificationSoundUrl, staffCallSoundUrl]);
    
    // ... Notifications ...
    useEffect(() => {
        if (prevActiveOrdersRef.current === undefined) { prevActiveOrdersRef.current = activeOrders; return; }
        const shouldNotify = (currentUser?.role === 'kitchen' || isOrderNotificationsEnabled) && notificationSoundUrl && isAudioUnlocked;
        if (!shouldNotify) { prevActiveOrdersRef.current = activeOrders; return; }
        const newOrders = activeOrders.filter(order => 
            !prevActiveOrdersRef.current!.some(prevOrder => prevOrder.id === order.id) && 
            order.id > mountTimeRef.current && 
            order.tableName && 
            order.orderNumber &&
            !order.isSplitChild && 
            (!order.mergedOrderNumbers || order.mergedOrderNumbers.length === 0)
        );
        if (newOrders.length > 0) {
            const audio = new Audio(notificationSoundUrl!);
            audio.play().catch(() => {});
            newOrders.forEach(async (order) => {
                Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: '🔔 มีออเดอร์ใหม่!', html: `<b>โต๊ะ ${order.tableName}</b> (ออเดอร์ #${String(order.orderNumber).padStart(3, '0')})`, showConfirmButton: true, confirmButtonText: 'ไปที่หน้าครัว', timer: 10000, timerProgressBar: true, }).then((result) => { if (result.isConfirmed) setCurrentView('kitchen'); });
                

            });
        }
        prevActiveOrdersRef.current = activeOrders;
    }, [activeOrders, currentUser, notificationSoundUrl, isAudioUnlocked, isOrderNotificationsEnabled]);

    // NEW: Staff Call Notification Watcher
    useEffect(() => {
        // Filter for calls that happened AFTER the app was loaded (or last checked)
        // This prevents alerting for old calls stored in the database when refreshing the page
        const newCalls = staffCalls.filter(call => call.timestamp > latestStaffCallTimeRef.current);

        if (newCalls.length > 0) {
            // Update the ref to the latest timestamp to avoid re-alerting
            const maxTimestamp = Math.max(...newCalls.map(c => c.timestamp));
            latestStaffCallTimeRef.current = maxTimestamp;

            // Only alert if the user is a staff member (not a customer table)
            if (currentUser && currentUser.role !== 'table') {
                
                // 1. Play Sound
                if (staffCallSoundUrl && isAudioUnlocked) {
                    const audio = new Audio(staffCallSoundUrl);
                    audio.play().catch(console.error);
                }

                // 2. Show Visual Popup
                // Get the most recent call details
                const latestCall = newCalls.sort((a, b) => b.timestamp - a.timestamp)[0];
                
                Swal.fire({
                    title: '🔔 มีลูกค้าเรียก!',
                    html: `
                        <div class="text-lg font-bold text-gray-800">โต๊ะ ${latestCall.tableName}</div>
                        <div class="text-sm text-gray-600">ลูกค้า: ${latestCall.customerName}</div>
                    `,
                    icon: 'info',
                    position: 'top', // Changed from 'top-center'
                    showConfirmButton: true,
                    confirmButtonText: 'รับทราบ',
                    timer: 10000, // 10 seconds
                    timerProgressBar: true,
                    backdrop: `rgba(0,0,0,0.4)` // Dim background slightly to grab attention
                });


            }
        }
    }, [staffCalls, staffCallSoundUrl, isAudioUnlocked, currentUser, telegramBotToken, telegramChatId]);

    // NEW: Leave Request Notification Watcher (Popup)
    useEffect(() => {
        // Wait for initial load
        if (leaveRequests.length === 0) return;

        const currentMaxId = Math.max(0, ...leaveRequests.map(r => r.id));

        // Initial set to avoid alerting on existing data (first load)
        if (maxKnownLeaveIdRef.current === -1) {
            maxKnownLeaveIdRef.current = currentMaxId;
            return;
        }

        // Check for new items (ID greater than max known)
        if (currentMaxId > maxKnownLeaveIdRef.current) {
            // Find the specific new requests that are PENDING
            const newRequests = leaveRequests.filter(req => req.id > maxKnownLeaveIdRef.current && req.status === 'pending');

            // Define who sees the alert (same permissions as badge)
            const canApprove = currentUser?.role === 'admin' ||
                               currentUser?.role === 'branch-admin' ||
                               currentUser?.role === 'auditor';

            // Filter by branch permission if not Admin
            const visibleNewRequests = newRequests.filter(req => {
                if (currentUser?.role === 'admin') return true;
                return currentUser?.allowedBranchIds?.includes(req.branchId);
            });

            if (visibleNewRequests.length > 0 && canApprove) {
                // Play sound (Reuse notification sound if available)
                if (notificationSoundUrl && isAudioUnlocked) {
                    const audio = new Audio(notificationSoundUrl);
                    audio.play().catch(() => {});
                }

                // Show Popup
                const count = visibleNewRequests.length;
                const latest = visibleNewRequests[visibleNewRequests.length - 1]; // Get latest
                const typeLabel = latest.type === 'sick' ? 'ลาป่วย' : latest.type === 'personal' ? 'ลากิจ' : 'อื่นๆ';
                
                Swal.fire({
                    title: '📝 มีคำขอวันลาใหม่!',
                    html: `
                        <div class="text-left text-sm">
                            <p><strong>พนักงาน:</strong> ${latest.username}</p>
                            <p><strong>ประเภท:</strong> ${typeLabel}</p>
                            <p><strong>เหตุผล:</strong> ${latest.reason}</p>
                            ${count > 1 ? `<p class="mt-2 text-blue-600 font-bold">และอีก ${count - 1} รายการ...</p>` : ''}
                        </div>
                    `,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'ตรวจสอบทันที',
                    confirmButtonColor: '#3b82f6',
                    cancelButtonText: 'ไว้ทีหลัง',
                    backdrop: `rgba(0,0,0,0.4)`
                }).then((result) => {
                    if (result.isConfirmed) {
                        setCurrentView('leave');
                    }
                });


            }

            // Always update ref to avoid loops
            maxKnownLeaveIdRef.current = currentMaxId;
        }
    }, [leaveRequests, currentUser, notificationSoundUrl, isAudioUnlocked, telegramBotToken, telegramChatId]);

    // NEW: Global Auto Print Effect (Replaces logic in KitchenView)
    useEffect(() => {
        if (prevOrdersForAutoPrint.current === null) {
            prevOrdersForAutoPrint.current = activeOrders;
            return;
        }
    
        if (!isAutoPrintEnabled || !currentUser || currentUser.role === 'table' || !printerConfig?.kitchen?.ipAddress || !branchId) {
            prevOrdersForAutoPrint.current = activeOrders;
            return;
        }
    
        const prevIds = new Set(prevOrdersForAutoPrint.current.map(o => o.id));
        const newOrders = activeOrders.filter(o => !prevIds.has(o.id));
    
        newOrders.forEach(async (order) => {
            // Only auto-print 'waiting' orders that haven't been printed yet (e.g., from customers)
            if (order.status === 'waiting' && !order.isPrintedToKitchen) {
                console.log(`[AutoPrint] Detected unprinted order #${order.orderNumber}. Attempting to print.`);
                
                // "Claim" the print job by updating Firestore. This prevents other devices from printing it.
                try {
                    const orderRef = db.collection(`branches/${branchId}/activeOrders`).doc(order.id.toString());
                    // We update first to minimize race conditions.
                    await orderRef.update({ isPrintedToKitchen: true });
    
                    // Now that we've claimed it, print it.
                    await printerService.printKitchenOrder(order, printerConfig.kitchen!);
                    console.log(`[AutoPrint] Success #${order.orderNumber}`);
                } catch (err) {
                     console.error(`[AutoPrint] Failed to claim or print order #${order.orderNumber}:`, err);
                     // If printing fails, we don't revert the flag to avoid print loops.
                     // A manual reprint might be necessary.
                }
            }
        });
    
        prevOrdersForAutoPrint.current = activeOrders;
    
    }, [activeOrders, isAutoPrintEnabled, currentUser, printerConfig, branchId]);

    // ... (Other effects for maintenance, stock alerts - omitted for brevity but preserved in logic) ...

    // Ref to track the previous view to detect navigation INTO stock page
    const prevViewForStockAlertRef = useRef<View | null>(null);

    // NEW: Effect to show out-of-stock popup when entering stock view
    useEffect(() => {
        const isEnteringStock = currentView === 'stock' && prevViewForStockAlertRef.current !== 'stock';
        
        if (isEnteringStock) {
            // Filter out-of-stock items (quantity <= 0)
            const outOfStockItems = stockItems.filter(item => {
                const qty = Number(item.quantity) || 0;
                return qty <= 0;
            });

            if (outOfStockItems.length > 0) {
                const listHtml = outOfStockItems.map(item => 
                    `<li style="text-align: left; margin-bottom: 4px;">
                        <span style="font-weight: bold; color: #374151;">${item.name}</span> 
                        <span style="color: #dc2626; font-size: 0.9em;">(คงเหลือ: ${item.quantity} ${item.unit})</span>
                    </li>`
                ).join('');

                Swal.fire({
                    title: '⚠️ แจ้งเตือนสินค้าหมด!',
                    html: `
                        <div style="font-size: 0.95rem; color: #4b5563;">
                            <p style="margin-bottom: 12px;">พบสินค้าหมดสต็อกจำนวน <strong style="color: #dc2626; font-size: 1.1rem;">${outOfStockItems.length}</strong> รายการ:</p>
                            <ul style="background-color: #fef2f2; border: 1px solid #fee2e2; border-radius: 8px; padding: 12px 12px 12px 28px; max-height: 250px; overflow-y: auto;">
                                ${listHtml}
                            </ul>
                        </div>
                    `,
                    icon: 'warning',
                    confirmButtonText: 'รับทราบ',
                    confirmButtonColor: '#ef4444' // Red button
                });
            }
        }

        // Update ref for next render
        prevViewForStockAlertRef.current = currentView;
    }, [currentView, stockItems]);

    // --- USER PERSISTENCE ---
    useEffect(() => {
        if (currentUser) {
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            if (isFirebaseConfigured && firebase.messaging.isSupported()) {
                const messaging = firebase.messaging();
                messaging.getToken({ vapidKey: 'BDBGk_J108hNL-aQh-fFzAIpMwlD8TztXugeAnQj2hcmLAAjY0p8hWlGF3a0cSIwJhY_Jd3Tj3Y-2-fB8dJL_4' }).then((token) => { if (token) { setCurrentFcmToken(token); const userHasToken = prevUserRef.current?.fcmTokens?.includes(token); if (!userHasToken) { const updatedTokens = Array.from(new Set([...(currentUser.fcmTokens || []), token])); setUsers(prevUsers => prevUsers.map(u => u.id === currentUser.id ? { ...u, fcmTokens: updatedTokens } : u)); } } }).catch(() => {});
            }
        } 
        
        prevUserRef.current = currentUser;
    }, [currentUser, setUsers]);

    useEffect(() => { if (selectedBranch) localStorage.setItem('selectedBranch', JSON.stringify(selectedBranch)); else if (!isCustomerMode) localStorage.removeItem('selectedBranch'); }, [selectedBranch, isCustomerMode]);
    useEffect(() => { localStorage.setItem('currentView', currentView); }, [currentView]);
    useEffect(() => { if (floors.length > 0 && !selectedSidebarFloor) setSelectedSidebarFloor(floors[0]); }, [floors, selectedSidebarFloor]);
    useEffect(() => { if (window.AndroidBridge && typeof window.AndroidBridge.setPendingOrderCount === 'function') { window.AndroidBridge.setPendingOrderCount(totalKitchenBadgeCount); } }, [totalKitchenBadgeCount]);
    useEffect(() => { if (menuItems.length > 0 && !imageCacheTriggeredRef.current) { imageCacheTriggeredRef.current = true; const imageUrls = menuItems.map(item => item.imageUrl).filter(url => url && typeof url === 'string'); if ('serviceWorker' in navigator && navigator.serviceWorker.controller) { navigator.serviceWorker.controller.postMessage({ type: 'CACHE_IMAGES', urls: imageUrls }); } const handleMessage = (event: MessageEvent) => { if (event.data && event.data.type === 'CACHE_IMAGES_COMPLETE') { setIsCachingImages(false); navigator.serviceWorker.removeEventListener('message', handleMessage); } }; if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', handleMessage); } }, [menuItems]);


    // ============================================================================
    // 4. HANDLERS
    // ============================================================================
    
    // ... (Keep handler functions same as before) ...
    const requestNotificationPermission = async () => {
        if ('Notification' in window && Notification.permission !== 'granted') {
            try { await Notification.requestPermission(); } catch (error) {}
        }
    };

    const handleAudioUnlock = useCallback(async () => {
        if (!isAudioUnlocked) {
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            if (audioContext.state === 'suspended') audioContext.resume();
            new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=').play().then(() => setIsAudioUnlocked(true)).catch(() => setIsAudioUnlocked(true));
        }
        await requestNotificationPermission();
    }, [isAudioUnlocked]);
    
    const handleLogin = async (username: string, password: string) => {
        const user = users.find(u => u.username === username && u.password === password);
        if (user) {
            await requestNotificationPermission();
            
            // Fix: Immediately persist user to localStorage to avoid race conditions on refresh
            localStorage.setItem('currentUser', JSON.stringify(user));
            setCurrentUser(user);
            
            // Check for 'table' role to force Customer Mode
            if (user.role === 'table') {
                setIsCustomerMode(true);
                // Assign to specific table if set, otherwise potentially null (or handle Guest)
                // Note: CustomerView handles null tableId gracefully or shows loading/error
                if (user.assignedTableId) {
                    setCustomerTableId(user.assignedTableId);
                } else {
                    setCustomerTableId(null); 
                }

                // AUTO-SELECT BRANCH for 'table' user based on their allowedBranchIds
                // FIX: Only if not already set by URL params above to prevent override
                if (!urlBranchId && user.allowedBranchIds && user.allowedBranchIds.length > 0) {
                    const branch = branches.find(b => b.id === user.allowedBranchIds![0]);
                    if (branch) {
                        setSelectedBranch(branch);
                        // Explicitly save selected branch for persistence
                        localStorage.setItem('selectedBranch', JSON.stringify(branch));
                    }
                }
            } else if (user.role === 'kitchen') {
                setCurrentView('kitchen');
                // NEW LOGIC: Branch Selection for Kitchen
                if (user.allowedBranchIds && user.allowedBranchIds.length > 1) {
                    setSelectedBranch(null); 
                    localStorage.removeItem('selectedBranch');
                } else if (user.allowedBranchIds && user.allowedBranchIds.length === 1) {
                    const branch = branches.find(b => b.id === user.allowedBranchIds![0]);
                    if (branch) {
                        setSelectedBranch(branch);
                        localStorage.setItem('selectedBranch', JSON.stringify(branch));
                    }
                }
            } else if (user.role === 'pos') {
                setCurrentView('pos');
                // NEW LOGIC: Branch Selection for POS
                if (user.allowedBranchIds && user.allowedBranchIds.length > 1) {
                    setSelectedBranch(null); 
                    localStorage.removeItem('selectedBranch');
                } else if (user.allowedBranchIds && user.allowedBranchIds.length === 1) {
                    const branch = branches.find(b => b.id === user.allowedBranchIds![0]);
                    if (branch) {
                        setSelectedBranch(branch);
                        localStorage.setItem('selectedBranch', JSON.stringify(branch));
                    }
                }
            } else if (['admin', 'branch-admin', 'auditor'].includes(user.role)) {
                setCurrentView('dashboard');
                // NEW LOGIC: Branch Selection for Admin/Manager/Auditor
                if (user.role === 'admin' || (user.allowedBranchIds && user.allowedBranchIds.length > 1)) {
                    setSelectedBranch(null); 
                    localStorage.removeItem('selectedBranch');
                } else if (user.allowedBranchIds && user.allowedBranchIds.length === 1) {
                    const branch = branches.find(b => b.id === user.allowedBranchIds![0]);
                    if (branch) {
                        setSelectedBranch(branch);
                        localStorage.setItem('selectedBranch', JSON.stringify(branch));
                    }
                }
            }
            return { success: true };
        }
        return { success: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
    };

    const handleLogout = () => { 
        setCurrentUser(null); 
        setSelectedBranch(null); 
        setIsCustomerMode(false); // Fix: Reset customer mode
        setCustomerTableId(null); // Fix: Clear assigned table
        localStorage.removeItem('currentUser'); 
        localStorage.removeItem('selectedBranch'); 
    };
    
    const handleMobileProfileClick = () => {
        Swal.fire({ title: 'ยืนยันการออกจากระบบ', text: "ท่านต้องการออกจากระบบใช่ไหม?", icon: 'question', showCancelButton: true, confirmButtonText: 'ใช่', cancelButtonText: 'ยกเลิก' }).then((result) => { if (result.isConfirmed) handleLogout(); });
    };
    
    const handleSelectBranch = (branch: Branch) => { 
        setSelectedBranch(branch); 
        localStorage.removeItem('intentToChangeBranch'); // Clear the flag when a selection is made
    };
    const handleUpdateCurrentUser = (updates: Partial<User>) => {
        setUsers(prevUsers => prevUsers.map(user => user.id === currentUser?.id ? { ...user, ...updates } : user));
        setCurrentUser(prev => (prev ? { ...prev, ...updates } : null));
    };

    const handleChangeBranch = () => {
        localStorage.setItem('intentToChangeBranch', 'true');
        setSelectedBranch(null);
    };

    const handleUpdateLeaveStatus = async (requestId: number, status: 'approved' | 'rejected') => {
        const request = leaveRequests.find(r => r.id === requestId);
        if (!request) return;

        // 1. Update the request status
        const updatedRequests = leaveRequests.map(r => r.id === requestId ? { ...r, status } : r);
        setLeaveRequests(updatedRequests);

        // 2. If approved, deduct quota from user
        if (status === 'approved') {
            const user = users.find(u => u.id === request.userId);
            if (user && user.leaveQuotas) {
                let duration = 0;
                if (request.isHalfDay) {
                    duration = 0.5;
                } else {
                    const diffTime = Math.abs(request.endDate - request.startDate);
                    duration = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
                }

                const newQuotas = { ...user.leaveQuotas };
                if (request.type === 'sick') {
                    newQuotas.sick = Math.max(0, newQuotas.sick - duration);
                } else if (request.type === 'personal') {
                    newQuotas.personal = Math.max(0, newQuotas.personal - duration);
                } else if (request.type === 'vacation') {
                    newQuotas.vacation = Math.max(0, newQuotas.vacation - duration);
                }

                // Update users collection
                const updatedUsers = users.map(u => u.id === user.id ? { ...u, leaveQuotas: newQuotas } : u);
                setUsers(updatedUsers);
                
                // If the updated user is the current user, update current user state too
                if (currentUser && currentUser.id === user.id) {
                    setCurrentUser({ ...currentUser, leaveQuotas: newQuotas });
                    localStorage.setItem('currentUser', JSON.stringify({ ...currentUser, leaveQuotas: newQuotas }));
                }

                Swal.fire({
                    icon: 'success',
                    title: 'อนุมัติเรียบร้อย',
                    text: `หักลบวันลา ${duration} วัน เรียบร้อยแล้ว`,
                    timer: 2000,
                    showConfirmButton: false
                });
            }
        } else if (status === 'rejected') {
            Swal.fire({
                icon: 'info',
                title: 'ปฏิเสธคำขอ',
                text: 'คำขอลาถูกปฏิเสธแล้ว',
                timer: 2000,
                showConfirmButton: false
            });
        }
    };

    const handleSaveLeaveRequest = (req: Omit<LeaveRequest, 'id' | 'status' | 'branchId'>) => {
        const newId = Math.max(0, ...leaveRequests.map(r => r.id)) + 1;
        const newRequest: LeaveRequest = {
            ...req,
            id: newId,
            status: 'pending',
            branchId: selectedBranch?.id || 1,
            submittedAt: Date.now()
        };
        setLeaveRequests(prev => [...prev, newRequest]);
        handleModalClose();
        
        Swal.fire({
            icon: 'success',
            title: 'ส่งคำขอเรียบร้อย',
            text: 'กรุณารอการอนุมัติจากผู้ดูแล',
            timer: 2000,
            showConfirmButton: false
        });
    };

    const handleDeleteLeaveRequest = async (id: number) => {
        setLeaveRequests(prev => prev.filter(r => r.id !== id));
        return true;
    };

    const handleModalClose = () => {
        setModalState({
            isMenuItem: false, isOrderSuccess: false, isSplitBill: false, isTableBill: false,
            isPayment: false, isPaymentSuccess: false, isSettings: false, isEditCompleted: false,
            isUserManager: false, isBranchManager: false, isMoveTable: false, isCancelOrder: false,
            isCashBill: false, isSplitCompleted: false, isCustomization: false, isLeaveRequest: false,
            isMenuSearch: false, isMergeBill: false, isTagRegistration: false
        });
        setItemToEdit(null); setOrderForModal(null); setSelectedOrderIdForModal(null); setItemToCustomize(null); setOrderItemToEdit(null);
    };
    
    const handleClearOrder = () => { setCurrentOrderItems([]); setCustomerName(''); setCustomerCount(1); setSelectedTableId(null); };
    const handleAddItemToOrder = (item: MenuItem) => { setItemToCustomize(item); setModalState(prev => ({ ...prev, isCustomization: true, isMenuSearch: false })); };
    const handleConfirmCustomization = (itemToAdd: OrderItem) => { setCurrentOrderItems(prevItems => { const existingItemIndex = prevItems.findIndex(i => i.cartItemId === (orderItemToEdit?.cartItemId || itemToAdd.cartItemId)); if (orderItemToEdit) { const newItems = [...prevItems]; newItems[existingItemIndex] = { ...itemToAdd, quantity: orderItemToEdit.quantity }; return newItems; } else { if (existingItemIndex !== -1) { const newItems = [...prevItems]; newItems[existingItemIndex].quantity += itemToAdd.quantity; return newItems; } else { return [...prevItems, itemToAdd]; } } }); handleModalClose(); };
    const handleUpdateOrderItem = (itemToUpdate: OrderItem) => { setItemToCustomize(itemToUpdate); setOrderItemToEdit(itemToUpdate); setModalState(prev => ({ ...prev, isCustomization: true })); };
    const handleQuantityChange = (cartItemId: string, newQuantity: number) => { setCurrentOrderItems(prevItems => { if (newQuantity <= 0) return prevItems.filter(i => i.cartItemId !== cartItemId); return prevItems.map(i => i.cartItemId === cartItemId ? { ...i, quantity: newQuantity } : i); }); };
    const handleRemoveItem = (cartItemId: string) => { setCurrentOrderItems(prevItems => prevItems.filter(i => i.cartItemId !== cartItemId)); };
    
    const handlePlaceOrder = async (orderItems: OrderItem[] = currentOrderItems, custName: string = customerName, custCount: number = customerCount, tableOverride: Table | null = selectedTable, isLineMan: boolean = false, lineManNumber?: string, deliveryProviderName?: string, paymentSlipUrl?: string): Promise<number | undefined> => { 
        try {
            const orderNumber = await placeOrder(orderItems, custName, custCount, tableOverride, isLineMan, lineManNumber, deliveryProviderName, paymentSlipUrl);
            
            // Clear local state on success (only if not customer mode)
            if (orderNumber && !isCustomerMode) {
                 setCurrentOrderItems([]); 
                 setCustomerName(''); 
                 setCustomerCount(1); 
                 setSelectedTableId(null); 
            }
            return orderNumber;
        } catch (error) {
            // Re-throw to let caller handle it (e.g. stop loading spinner)
            throw error;
        }
    };






    
    // RENDER LOGIC
    
    // 0. Render Queue Display Mode
    if (isPrivacyPolicyMode) {
        return (
            <Suspense fallback={<PageLoading />}>
                <PrivacyPolicy />
            </Suspense>
        );
    }

    if (isQueueMode) {
        if (!branchId) {
            return (
                <div className="h-screen w-screen flex flex-col items-center justify-center bg-gray-900 text-white">
                    <h1 className="text-2xl font-bold">กรุณาระบุสาขา</h1>
                    <p className="text-gray-400 mt-2">โปรดเพิ่ม `?branchId=...` ใน URL ของคุณ</p>
                </div>
            );
        }
        if (!selectedBranch) return <PageLoading />;

        return (
            <Suspense fallback={<PageLoading />}>
                <QueueDisplay
                    activeOrders={activeOrders}
                    restaurantName={restaurantName}
                    logoUrl={appLogoUrl || logoUrl}
                />
            </Suspense>
        );
    }



    // 1. Force Customer View for Table Role OR explicit Customer Mode
    if (isCustomerMode || currentUser?.role === 'table') {
        let targetTableId = customerTableId;
        if (currentUser?.role === 'table' && currentUser.assignedTableId) {
            targetTableId = currentUser.assignedTableId;
        }

        // --- IMPROVEMENT: NON-BLOCKING CUSTOMER MODE ---
        
        let targetTableIdNum = Number(targetTableId);
        let customerTable = tables.find(t => t.id === targetTableIdNum);

        // FORCE VIRTUAL TABLES for -1 and -2 (Takeaway/Delivery)
        // This prevents them from falling into "Loading..." state if not found in tables list
        if (targetTableIdNum === -1) {
            customerTable = {
                id: -1,
                name: 'สั่งกลับบ้าน (Takeaway)',
                floor: 'Online',
                activePin: null,
                reservation: null
            };
        } else if (targetTableIdNum === -2) {
            customerTable = {
                id: -2,
                name: 'เดลิเวอรี่ (Delivery)',
                floor: 'Online',
                activePin: null,
                reservation: null
            };
        }

        // OPTIMISTIC LOADING: If table not found in list yet, create a dummy immediately
        if (!customerTable && targetTableId) {
             customerTable = {
                id: targetTableIdNum,
                name: 'กำลังโหลด...',
                floor: '-',
                activePin: null,
                reservation: null
            };
        }

        // If the table is found OR we made a temp one, render the main customer view.
        if (customerTable) {
             const visibleMenuItems = menuItems.filter(item => item.isVisible !== false);
             return (
                <Suspense fallback={<PageLoading />}>
                    <CustomerView 
                        table={customerTable}
                        menuItems={visibleMenuItems}
                        categories={categories}
                        activeOrders={activeOrders.filter(o => o.tableId === targetTableId)}
                        allBranchOrders={activeOrders}
                        completedOrders={completedOrders}
                        onPlaceOrder={(items, name, slipUrl) => handlePlaceOrder(items, name, 1, customerTable, false, undefined, undefined, slipUrl)}
                        onStaffCall={(table, custName) => setStaffCalls(prev => [...prev, {id: Date.now(), tableId: table.id, tableName: `${table.name} (${table.floor})`, customerName: custName, branchId: selectedBranch ? selectedBranch.id : Number(branchId || 0), timestamp: Date.now()}])}
                        recommendedMenuItemIds={recommendedMenuItemIds}
                        logoUrl={appLogoUrl || logoUrl}
                        qrCodeUrl={qrCodeUrl}
                        restaurantName={restaurantName}
                        // NEW: Pass branchName prop to display it on customer view
                        branchName={selectedBranch ? selectedBranch.name : (branches.find(b => b.id.toString() === branchId)?.name || '')}
                        onLogout={handleLogout}
                        // FIX: Pass branchId to enable peeking feature for instant updates
                        branchId={branchId}
                        lineOaUrl={lineOaUrl}
                        facebookPageUrl={facebookPageUrl}
                    />
                </Suspense>
             );
        }

        // If after loading tables, the specific table ID is still not found AND we aren't loading anymore, show the error screen.
        // This is now a confirmed error, not a race condition.
        return (
            <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gray-100 p-4 text-center">
                <div className="bg-white p-8 rounded-2xl shadow-lg max-w-sm w-full">
                    <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-red-100 mb-6">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">เกิดข้อผิดพลาด</h2>
                    <p className="text-gray-600 mb-4">
                        ไม่พบข้อมูลโต๊ะที่ท่านสแกน QR Code อาจไม่อัปเดตหรือไม่ถูกต้อง
                    </p>
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <p className="font-semibold text-yellow-800">กรุณาแจ้งพนักงานเพื่อดำเนินการ</p>
                        <p className="mt-2 text-xs text-yellow-700">
                            (สำหรับพนักงาน: Table ID <code className="font-mono bg-yellow-200 px-1 rounded">{targetTableId || 'Not Set'}</code> ไม่ถูกต้อง)
                        </p>
                    </div>
                </div>
                <p className="text-xs text-gray-400 mt-6">
                    POS System by SEOUL GOOD
                </p>
            </div>
        );
    }

    if (!currentUser) return <LoginScreen onLogin={handleLogin} />;

    if (!selectedBranch && currentUser.role !== 'admin') {
         return <BranchSelectionScreen currentUser={currentUser} branches={branches} onSelectBranch={handleSelectBranch} onManageBranches={() => setModalState(prev => ({...prev, isBranchManager: true}))} onLogout={handleLogout} />;
    }
    
    if (!selectedBranch && currentUser.role === 'admin') {
         return <BranchSelectionScreen currentUser={currentUser} branches={branches} onSelectBranch={handleSelectBranch} onManageBranches={() => setModalState(prev => ({...prev, isBranchManager: true}))} onLogout={handleLogout} />;
    }

    if (!selectedBranch) return <div>Error: No branch selected. Please log out and try again.</div>

    // ... (Keep MobileHeader component) ...
    const MobileHeader = ({ 
        user, 
        restaurantName, 
        onOpenSearch, 
        onProfileClick, 
        isOrderNotificationsEnabled, 
        onToggleOrderNotifications, 
        onOpenSettings,
        isEditMode,
        onToggleEditMode,
        currentView,
        onOpenTagRegistration
    }: { 
        user: User, 
        restaurantName: string, 
        onOpenSearch: () => void, 
        onProfileClick: () => void, 
        isOrderNotificationsEnabled: boolean, 
        onToggleOrderNotifications: () => void, 
        onOpenSettings: () => void,
        isEditMode: boolean,
        onToggleEditMode: () => void,
        currentView: View,
        onOpenTagRegistration: () => void
    }) => (
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
                {/* Tag Registration Button (Stock View Only) */}
                {currentView === 'stock' && (
                    <button onClick={onOpenTagRegistration} className="p-2 text-gray-300 rounded-full hover:bg-gray-700">
                        <span className="text-xl">🏷️</span>
                    </button>
                )}
                {/* Edit Mode Toggle */}
                {['admin', 'branch-admin'].includes(user.role) && ['history', 'hr', 'hr-payroll'].includes(currentView) && (
                    <label className="relative inline-flex items-center cursor-pointer mr-1" title="โหมดแก้ไข">
                        <input type="checkbox" checked={isEditMode} onChange={onToggleEditMode} className="sr-only peer" />
                        <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-500"></div>
                    </label>
                )}
                <button onClick={onOpenSettings} className="p-2 text-gray-300 rounded-full hover:bg-gray-700" aria-label="Settings">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                </button>
                <button 
                    onClick={onToggleOrderNotifications} 
                    className={`p-2 rounded-full hover:bg-gray-700 transition-colors ${isOrderNotificationsEnabled ? 'text-yellow-400' : 'text-gray-400'}`} 
                    title={isOrderNotificationsEnabled ? "ปิดเสียงแจ้งเตือน" : "เปิดเสียงแจ้งเตือน"}
                >
                    {isOrderNotificationsEnabled ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" />
                        </svg>
                    )}
                </button>
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
                <Suspense fallback={<div className="w-64 bg-gray-800 h-full animate-pulse"></div>}>
                    <AdminSidebar 
                        isCollapsed={isAdminSidebarCollapsed} onToggleCollapse={() => setIsAdminSidebarCollapsed(!isAdminSidebarCollapsed)}
                        logoUrl={appLogoUrl || logoUrl} // Prioritize App Logo (Red)
                        restaurantName={restaurantName} branchName={selectedBranch.name} currentUser={currentUser}
                        onViewChange={setCurrentView} currentView={currentView} onToggleEditMode={() => setIsEditMode(!isEditMode)} isEditMode={isEditMode}
                        onOpenSettings={() => setModalState(prev => ({...prev, isSettings: true}))} onOpenUserManager={() => setModalState(prev => ({...prev, isUserManager: true}))}
                        onManageBranches={() => setModalState(prev => ({...prev, isBranchManager: true}))} onChangeBranch={handleChangeBranch} onLogout={handleLogout}
                        kitchenBadgeCount={totalKitchenBadgeCount} tablesBadgeCount={tablesBadgeCount} leaveBadgeCount={leaveBadgeCount} stockBadgeCount={stockBadgeCount}
                        maintenanceBadgeCount={maintenanceBadgeCount}
                        onUpdateCurrentUser={handleUpdateCurrentUser} onUpdateLogoUrl={setLogoUrl} onUpdateRestaurantName={setRestaurantName}
                        isOrderNotificationsEnabled={isOrderNotificationsEnabled} onToggleOrderNotifications={toggleOrderNotifications}
                        printerConfig={printerConfig}
                    />
                </Suspense>
            )}
            
            <div className="flex-1 flex flex-col overflow-hidden transition-all duration-300" style={{ marginLeft: isAdminViewOnDesktop ? (isAdminSidebarCollapsed ? '5rem' : '16rem') : '0' }}>
                {/* Header for Desktop POS/Kitchen staff */}
                {isDesktop && !isAdminViewOnDesktop && (
                    <Header
                        currentView={currentView} onViewChange={setCurrentView} isEditMode={isEditMode} onToggleEditMode={() => setIsEditMode(!isEditMode)}
                        onOpenSettings={() => setModalState(prev => ({ ...prev, isSettings: true }))} cookingBadgeCount={cookingBadgeCount} waitingBadgeCount={waitingBadgeCount}
                        tablesBadgeCount={tablesBadgeCount} vacantTablesBadgeCount={vacantTablesCount} leaveBadgeCount={leaveBadgeCount} stockBadgeCount={stockBadgeCount} 
                        maintenanceBadgeCount={maintenanceBadgeCount} currentUser={currentUser} onLogout={handleLogout}
                        onOpenUserManager={() => setModalState(prev => ({ ...prev, isUserManager: true }))} 
                        logoUrl={appLogoUrl || logoUrl} // Prioritize App Logo (Red)
                        onLogoChangeClick={() => {}}
                        restaurantName={restaurantName} onRestaurantNameChange={setRestaurantName} branchName={selectedBranch.name}
                        onChangeBranch={handleChangeBranch} onManageBranches={() => setModalState(prev => ({ ...prev, isBranchManager: true }))}
                        printerConfig={printerConfig}
                        isAutoPrintEnabled={isAutoPrintEnabled}
                        onToggleAutoPrint={toggleAutoPrint}
                    />
                )}
                
                <main className={`flex-1 flex overflow-hidden ${!isDesktop ? 'pb-16' : ''}`}>
                    {/* ... (Keep POS View logic) ... */}
                    {currentView === 'pos' && isDesktop && (
                        <div className="flex-1 flex overflow-hidden relative">
                            <div className="flex-1 overflow-y-auto">
                                <Menu
                                    menuItems={menuItems} setMenuItems={setMenuItems} categories={categories} onSelectItem={handleAddItemToOrder}
                                    isEditMode={isEditMode} onEditItem={(item) => { setItemToEdit(item); setModalState(prev => ({...prev, isMenuItem: true})); }}
                                    onAddNewItem={() => { setItemToEdit(null); setModalState(prev => ({...prev, isMenuItem: true})); }}
                                    onDeleteItem={handleDeleteMenuItem} onUpdateCategory={handleUpdateCategory} onDeleteCategory={handleDeleteCategory}
                                    onAddCategory={handleAddCategory} onImportMenu={(items, cats) => { setMenuItems(items); setCategories(prev => Array.from(new Set([...prev, ...cats]))); }}
                                    recommendedMenuItemIds={recommendedMenuItemIds}
                                    onToggleVisibility={handleToggleVisibility}
                                    // New Props for Toggle Button in Menu
                                    onToggleOrderSidebar={() => setIsOrderSidebarVisible(!isOrderSidebarVisible)}
                                    isOrderSidebarVisible={isOrderSidebarVisible}
                                    cartItemCount={totalCartItemCount}
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
                                        isOrderNotificationsEnabled={isOrderNotificationsEnabled}
                                        onToggleOrderNotifications={toggleOrderNotifications}
                                        deliveryProviders={deliveryProviders}
                                        onOpenSettings={() => setModalState(prev => ({ ...prev, isSettings: true }))}
                                    />
                                )}
                            </aside>
                            {/* Old Floating Button Removed */}
                        </div>
                    )}

                    {!isDesktop && (
                        <div className="flex-1 flex flex-col overflow-hidden">
                            {currentView === 'pos' ? (
                                <div className="w-full flex flex-col h-full overflow-hidden">
                                    <Sidebar
                                        isMobilePage={true} currentOrderItems={currentOrderItems} onQuantityChange={handleQuantityChange} onRemoveItem={handleRemoveItem}
                                        onClearOrder={handleClearOrder} onPlaceOrder={handlePlaceOrder} isPlacingOrder={isPlacingOrder} tables={tables} selectedTable={selectedTable}
                                        onSelectTable={setSelectedTableId} customerName={customerName} onCustomerNameChange={setCustomerName} customerCount={customerCount}
                                        onCustomerCountChange={setCustomerCount} isEditMode={isEditMode} onAddNewTable={handleAddTable} onRemoveLastTable={handleRemoveLastTable}
                                        floors={floors} selectedFloor={selectedSidebarFloor} onFloorChange={setSelectedSidebarFloor} onAddFloor={handleAddFloor} onRemoveFloor={handleRemoveFloor}
                                        sendToKitchen={sendToKitchen} onSendToKitchenChange={(enabled, details) => { setSendToKitchen(enabled); setNotSentToKitchenDetails(details); }}
                                        onUpdateReservation={(tableId, reservation) => setTables(prev => prev.map(t => t.id === tableId ? {...t, reservation} : t))}
                                        onOpenSearch={() => setModalState(prev => ({...prev, isMenuSearch: true}))} currentUser={currentUser} onEditOrderItem={handleUpdateOrderItem}
                                        onViewChange={setCurrentView} restaurantName={restaurantName} onLogout={handleLogout}
                                        onToggleAvailability={handleToggleAvailability}
                                        isOrderNotificationsEnabled={isOrderNotificationsEnabled}
                                        onToggleOrderNotifications={toggleOrderNotifications}
                                        deliveryProviders={deliveryProviders}
                                        onToggleEditMode={() => setIsEditMode(!isEditMode)}
                                        onOpenSettings={() => setModalState(prev => ({ ...prev, isSettings: true }))}
                                    />
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
                                        onOpenSettings={() => setModalState(prev => ({ ...prev, isSettings: true }))}
                                        isEditMode={isEditMode}
                                        onToggleEditMode={() => setIsEditMode(!isEditMode)}
                                        currentView={currentView}
                                        onOpenTagRegistration={() => setModalState(prev => ({ ...prev, isTagRegistration: true }))}
                                    />
                                    <div className="flex-1 overflow-y-auto">
                                        <Suspense fallback={<PageLoading />}>
                                            {/* KitchenView passed with NEW Props */}
                                            {currentView === 'kitchen' && (
                                                <KitchenView 
                                                    activeOrders={activeOrders} 
                                                    onCompleteOrder={handleCompleteOrder} 
                                                    onStartCooking={handleStartCooking} 
                                                    onPrintOrder={handlePrintKitchenOrder}
                                                    onCancelOrder={handleCancelOrder}
                                                    isAutoPrintEnabled={isAutoPrintEnabled} // Pass prop
                                                    onToggleAutoPrint={toggleAutoPrint}     // Pass handler
                                                />
                                            )}
                                            {/* ... Other mobile views ... */}
                                            {currentView === 'tables' && <TableLayout tables={tables} activeOrders={activeOrders} onTableSelect={(id) => { setSelectedTableId(id); setCurrentView('pos'); }} onShowBill={handleShowBill} onGeneratePin={handleGeneratePin} currentUser={currentUser} printerConfig={printerConfig} floors={floors} selectedBranch={selectedBranch} restaurantName={restaurantName} logoUrl={logoUrl} qrCodeUrl={qrCodeUrl} />}
                                            {currentView === 'dashboard' && <Dashboard completedOrders={completedOrders} cancelledOrders={cancelledOrders} openingTime={openingTime || '10:00'} closingTime={closingTime || '22:00'} currentUser={currentUser} recipes={recipes} />}
                                            {currentView === 'history' && <SalesHistory completedOrders={completedOrders} cancelledOrders={cancelledOrders} printHistory={printHistory} onReprint={() => {}} onSplitOrder={(order) => {setOrderForModal(order); setModalState(prev => ({...prev, isSplitCompleted: true}))}} isEditMode={isEditMode} onEditOrder={(order) => {setOrderForModal(order); setModalState(prev => ({...prev, isEditCompleted: true}))}} onInitiateCashBill={(order) => {setOrderForModal(order); setModalState(prev => ({...prev, isCashBill: true}))}} onDeleteHistory={handleDeleteHistory} currentUser={currentUser} onReprintReceipt={handleReprintReceipt} />}
                                            {currentView === 'stock' && <StockManagement stockItems={stockItems} setStockItems={setStockItems} stockTags={stockTags} setStockTags={setStockTags} stockCategories={stockCategories} setStockCategories={setStockCategories} stockUnits={stockUnits} setStockUnits={setStockUnits} stockLogs={stockLogs} stockLogsActions={stockLogsActions} currentUser={currentUser} isTagModalOpen={modalState.isTagRegistration} onOpenTagModal={() => setModalState(prev => ({ ...prev, isTagRegistration: true }))} onCloseTagModal={() => setModalState(prev => ({ ...prev, isTagRegistration: false }))} />}
                                            {currentView === 'recipes' && <RecipeManagement menuItems={menuItems} recipes={recipes} setRecipes={setRecipes} stockItems={stockItems} currentUser={currentUser} />}
                                            {currentView === 'stock-analytics' && <StockAnalytics stockItems={stockItems} />}
                                            {currentView === 'leave' && (
                                                <LeaveCalendarView 
                                                    leaveRequests={leaveRequests} 
                                                    currentUser={currentUser} 
                                                    onOpenRequestModal={(date) => { 
                                                        setLeaveRequestInitialDate(date); 
                                                        setModalState(prev => ({...prev, isLeaveRequest: true})); 
                                                    }} 
                                                    branches={branches} 
                                                    onUpdateStatus={handleUpdateLeaveStatus} 
                                                    onDeleteRequest={handleDeleteLeaveRequest} 
                                                    selectedBranch={selectedBranch} 
                                                />
                                            )}
                                            {currentView === 'leave-analytics' && <LeaveAnalytics leaveRequests={leaveRequests} users={users} />}
                                            {currentView === 'maintenance' && (
                                                <MaintenanceView 
                                                    maintenanceItems={maintenanceItems}
                                                    setMaintenanceItems={setMaintenanceItems}
                                                    maintenanceLogs={maintenanceLogs}
                                                    setMaintenanceLogs={setMaintenanceLogs}
                                                    currentUser={currentUser}
                                                    isEditMode={isEditMode}
                                                />
                                            )}
                                            {(currentView === 'hr' || currentView === 'hr-payroll') && (
                                                <HRManagementView 
                                                    isEditMode={isEditMode} 
                                                    onOpenUserManager={handleOpenUserManagerWithData} 
                                                    initialTab={currentView === 'hr-payroll' ? 'payroll' : 'application'}
                                                />
                                            )}
                                        </Suspense>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Desktop Other Views */}
                    {isDesktop && currentView !== 'pos' && (
                        <Suspense fallback={<PageLoading />}>
                            {/* KitchenView passed with NEW Props */}
                            {currentView === 'kitchen' && (
                                <KitchenView 
                                    activeOrders={activeOrders} 
                                    onCompleteOrder={handleCompleteOrder} 
                                    onStartCooking={handleStartCooking} 
                                    onPrintOrder={handlePrintKitchenOrder}
                                    onCancelOrder={handleCancelOrder}
                                    isAutoPrintEnabled={isAutoPrintEnabled} // Pass prop
                                    onToggleAutoPrint={toggleAutoPrint}     // Pass handler
                                />
                            )}
                            {currentView === 'tables' && <TableLayout tables={tables} activeOrders={activeOrders} onTableSelect={(id) => { setSelectedTableId(id); setCurrentView('pos'); }} onShowBill={handleShowBill} onGeneratePin={handleGeneratePin} currentUser={currentUser} printerConfig={printerConfig} floors={floors} selectedBranch={selectedBranch} restaurantName={restaurantName} logoUrl={logoUrl} qrCodeUrl={qrCodeUrl} />}
                            {currentView === 'dashboard' && <Dashboard completedOrders={completedOrders} cancelledOrders={cancelledOrders} openingTime={openingTime || '10:00'} closingTime={closingTime || '22:00'} currentUser={currentUser} recipes={recipes} />}
                            {currentView === 'history' && <SalesHistory completedOrders={completedOrders} cancelledOrders={cancelledOrders} printHistory={printHistory} onReprint={() => {}} onSplitOrder={(order) => {setOrderForModal(order); setModalState(prev => ({...prev, isSplitCompleted: true}))}} isEditMode={isEditMode} onEditOrder={(order) => {setOrderForModal(order); setModalState(prev => ({...prev, isEditCompleted: true}))}} onInitiateCashBill={(order) => {setOrderForModal(order); setModalState(prev => ({...prev, isCashBill: true}))}} onDeleteHistory={handleDeleteHistory} currentUser={currentUser} onReprintReceipt={handleReprintReceipt} />}
                            {currentView === 'stock' && <StockManagement stockItems={stockItems} setStockItems={setStockItems} stockTags={stockTags} setStockTags={setStockTags} stockCategories={stockCategories} setStockCategories={setStockCategories} stockUnits={stockUnits} setStockUnits={setStockUnits} stockLogs={stockLogs} stockLogsActions={stockLogsActions} currentUser={currentUser} isTagModalOpen={modalState.isTagRegistration} onOpenTagModal={() => setModalState(prev => ({ ...prev, isTagRegistration: true }))} onCloseTagModal={() => setModalState(prev => ({ ...prev, isTagRegistration: false }))} />}
                            {currentView === 'recipes' && <RecipeManagement menuItems={menuItems} recipes={recipes} setRecipes={setRecipes} stockItems={stockItems} currentUser={currentUser} />}
                            {currentView === 'stock-analytics' && <StockAnalytics stockItems={stockItems} />}
                            {currentView === 'leave' && (
                                <LeaveCalendarView 
                                    leaveRequests={leaveRequests} 
                                    currentUser={currentUser} 
                                    onOpenRequestModal={(date) => { 
                                        setLeaveRequestInitialDate(date); 
                                        setModalState(prev => ({...prev, isLeaveRequest: true})); 
                                    }} 
                                    branches={branches} 
                                    onUpdateStatus={handleUpdateLeaveStatus} 
                                    onDeleteRequest={handleDeleteLeaveRequest} 
                                    selectedBranch={selectedBranch} 
                                />
                            )}
                            {currentView === 'leave-analytics' && <LeaveAnalytics leaveRequests={leaveRequests} users={users} />}
                            {currentView === 'maintenance' && (
                                <MaintenanceView 
                                    maintenanceItems={maintenanceItems}
                                    setMaintenanceItems={setMaintenanceItems}
                                    maintenanceLogs={maintenanceLogs}
                                    setMaintenanceLogs={setMaintenanceLogs}
                                    currentUser={currentUser}
                                    isEditMode={isEditMode}
                                />
                            )}
                            {(currentView === 'hr' || currentView === 'hr-payroll') && (
                                <HRManagementView 
                                    isEditMode={isEditMode} 
                                    onOpenUserManager={handleOpenUserManagerWithData} 
                                    initialTab={currentView === 'hr-payroll' ? 'payroll' : 'application'}
                                />
                            )}
                        </Suspense>
                    )}
                </main>
            </div>
            
            {!isDesktop && currentUser && <BottomNavBar items={mobileNavItems} currentView={currentView} onViewChange={setCurrentView} />}

            {/* Modals ... (Keep existing modals) ... */}
            <LoginModal isOpen={false} onClose={() => {}} />
            <MenuItemModal isOpen={modalState.isMenuItem} onClose={handleModalClose} onSave={handleSaveMenuItemAndCloseModal} itemToEdit={itemToEdit} categories={categories} onAddCategory={handleAddCategory} />
            <OrderSuccessModal isOpen={modalState.isOrderSuccess} onClose={handleModalClose} orderId={lastPlacedOrderId!} />
            <SplitBillModal isOpen={modalState.isSplitBill} order={orderForModal as ActiveOrder | null} onClose={handleModalClose} onConfirmSplit={handleConfirmSplit} />
            <TableBillModal 
                isOpen={modalState.isTableBill} 
                onClose={handleModalClose} 
                order={(selectedOrderIdForModal ? activeOrders.find(o => o.id === selectedOrderIdForModal) : orderForModal) as ActiveOrder | null} 
                onInitiatePayment={(order) => { setSelectedOrderIdForModal(order.id); setOrderForModal(order); setModalState(prev => ({...prev, isPayment: true, isTableBill: false})); }} 
                onInitiateMove={(order) => {setSelectedOrderIdForModal(order.id); setOrderForModal(order); setModalState(prev => ({...prev, isMoveTable: true, isTableBill: false})); }} 
                onSplit={(order) => {setSelectedOrderIdForModal(order.id); setOrderForModal(order); setModalState(prev => ({...prev, isSplitBill: true, isTableBill: false})); }} 
                onUpdateOrder={(id, items, count) => handleUpdateOrderFromModal(id, items, count)}
                isEditMode={isEditMode} 
                currentUser={currentUser} 
                onInitiateCancel={(order) => {setSelectedOrderIdForModal(order.id); setOrderForModal(order); setModalState(prev => ({...prev, isCancelOrder: true, isTableBill: false}))}} 
                activeOrders={activeOrders} 
                onInitiateMerge={(order) => {setSelectedOrderIdForModal(order.id); setOrderForModal(order); setModalState(prev => ({...prev, isMergeBill: true, isTableBill: false}))}}
                onMergeAndPay={handleMergeAndPay}
            />
            <PaymentModal isOpen={modalState.isPayment} order={orderForModal as ActiveOrder | null} onClose={handleModalClose} onConfirmPayment={handleConfirmPayment} qrCodeUrl={qrCodeUrl} isEditMode={isEditMode} onOpenSettings={() => setModalState(prev => ({...prev, isSettings: true}))} isConfirmingPayment={isConfirmingPayment} />
            <PaymentSuccessModal isOpen={modalState.isPaymentSuccess} onClose={handlePaymentSuccessClose} orderNumber={(orderForModal as CompletedOrder)?.orderNumber || 0} />
            
            <Suspense fallback={null}>
                <SettingsModal 
                    isOpen={modalState.isSettings} 
                    onClose={handleModalClose} 
                    onSave={(newLogo, newAppLogo, qr, sound, staffSound, printer, open, close, address, phone, tax, signature, telToken, telChat, lineOa, fbPage) => { 
                        setLogoUrl(newLogo); 
                        setAppLogoUrl(newAppLogo); 
                        setQrCodeUrl(qr); 
                        setNotificationSoundUrl(sound); 
                        setStaffCallSoundUrl(staffSound); 
                        setPrinterConfig(printer); 
                        setOpeningTime(open); 
                        setClosingTime(close); 
                        setRestaurantAddress(address);
                        setRestaurantPhone(phone);
                        setTaxId(tax);
                        setSignatureUrl(signature);
                        setTelegramBotToken(telToken || '');
                        setTelegramChatId(telChat || '');
                        setLineOaUrl(lineOa);
                        setFacebookPageUrl(fbPage);
                        handleModalClose(); 
                    }} 
                    currentLogoUrl={logoUrl} 
                    currentAppLogoUrl={appLogoUrl} 
                    currentQrCodeUrl={qrCodeUrl} 
                    currentNotificationSoundUrl={notificationSoundUrl} 
                    currentStaffCallSoundUrl={staffCallSoundUrl} 
                    currentPrinterConfig={printerConfig} 
                    currentOpeningTime={openingTime} 
                    currentClosingTime={closingTime} 
                    onSavePrinterConfig={setPrinterConfig} 
                    menuItems={menuItems} 
                    currentRecommendedMenuItemIds={recommendedMenuItemIds} 
                    onSaveRecommendedItems={setRecommendedMenuItemIds} 
                    deliveryProviders={deliveryProviders} 
                    onSaveDeliveryProviders={setDeliveryProviders}
                    currentRestaurantAddress={restaurantAddress}
                    currentRestaurantPhone={restaurantPhone}
                    currentTaxId={taxId}
                    currentSignatureUrl={signatureUrl}
                    currentLineOaUrl={lineOaUrl}
                    currentFacebookPageUrl={facebookPageUrl}
                    currentFacebookAppId={facebookAppId}
                    currentFacebookAppSecret={facebookAppSecret}
                    onSaveFacebookConfig={(appId, appSecret) => {
                        setFacebookAppId(appId);
                        setFacebookAppSecret(appSecret);
                    }}
                    currentLineNotifyToken={lineNotifyToken}
                    onSaveLineNotifyToken={setLineNotifyToken}
                    currentLineMessagingToken={lineMessagingToken}
                    onSaveLineMessagingToken={setLineMessagingToken}
                    currentLineUserId={lineUserId}
                    onSaveLineUserId={setLineUserId}
                    currentTelegramBotToken={telegramBotToken}
                    onSaveTelegramBotToken={setTelegramBotToken}
                    currentTelegramChatId={telegramChatId}
                    onSaveTelegramChatId={setTelegramChatId}
                />
            </Suspense>

            <EditCompletedOrderModal isOpen={modalState.isEditCompleted} order={orderForModal as CompletedOrder | null} onClose={handleModalClose} onSave={async ({id, items}) => { if(newCompletedOrders.some(o => o.id === id)) { await newCompletedOrdersActions.update(id, { items }); } else { setLegacyCompletedOrders(prev => prev.map(o => o.id === id ? {...o, items} : o)); } }} menuItems={menuItems} />
            <UserManagerModal isOpen={modalState.isUserManager} onClose={() => { handleModalClose(); setInitialNewUserForModal(null); }} users={users} setUsers={setUsers} currentUser={currentUser!} branches={branches} isEditMode={isEditMode} tables={tables} initialNewUser={initialNewUserForModal} />
            <BranchManagerModal isOpen={modalState.isBranchManager} onClose={handleModalClose} branches={branches} setBranches={setBranches} currentUser={currentUser} />
            <MoveTableModal isOpen={modalState.isMoveTable} onClose={handleModalClose} order={orderForModal as ActiveOrder | null} tables={tables} activeOrders={activeOrders} onConfirmMove={handleConfirmMoveTable} floors={floors} />
            <CancelOrderModal isOpen={modalState.isCancelOrder} onClose={handleModalClose} order={orderForModal as ActiveOrder | null} onConfirm={handleConfirmCancelOrder} />
            <CashBillModal 
                isOpen={modalState.isCashBill} 
                order={orderForModal as CompletedOrder | null} 
                onClose={handleModalClose} 
                restaurantName={restaurantName} 
                logoUrl={logoUrl}
                restaurantAddress={restaurantAddress}
                restaurantPhone={restaurantPhone}
                taxId={taxId}
                signatureUrl={signatureUrl}
                menuItems={menuItems}
                printerConfig={printerConfig}
            />
            <SplitCompletedBillModal isOpen={modalState.isSplitCompleted} order={orderForModal as CompletedOrder | null} onClose={handleModalClose} onConfirmSplit={() => {}} />
            <ItemCustomizationModal isOpen={modalState.isCustomization} onClose={handleModalClose} item={itemToCustomize} onConfirm={handleConfirmCustomization} orderItemToEdit={orderItemToEdit} />
            <LeaveRequestModal 
                isOpen={modalState.isLeaveRequest} 
                onClose={handleModalClose} 
                currentUser={currentUser} 
                onSave={handleSaveLeaveRequest} 
                leaveRequests={leaveRequests} 
                initialDate={leaveRequestInitialDate} 
            />
            <MenuSearchModal isOpen={modalState.isMenuSearch} onClose={handleModalClose} menuItems={menuItems} onSelectItem={handleAddItemToOrder} onToggleAvailability={handleToggleAvailability} />
            <MergeBillModal isOpen={modalState.isMergeBill} onClose={handleModalClose} order={orderForModal as ActiveOrder} allActiveOrders={activeOrders} tables={tables} onConfirmMerge={handleConfirmMerge} />
        </div>
    );
};

export default App;
