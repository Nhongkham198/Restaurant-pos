

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
    const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024); // Tailwind's lg breakpoint is 1024px

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
    const staffCallAudioRef = useRef<HTMLAudioElement | null>(null);
    const prevUserRef = useRef<User | null>(null);
    const activeCallRef = useRef<StaffCall | null>(null);

    // ============================================================================
    // 2. COMPUTED VALUES (MEMO)
    // ============================================================================

    const kitchenBadgeCount = useMemo(() => activeOrders.filter(o => o.status === 'waiting').length, [activeOrders]);
    const occupiedTablesCount = useMemo(() => new Set(activeOrders.map(o => o.tableId)).size, [activeOrders]);
    const tablesBadgeCount = occupiedTablesCount > 0 ? occupiedTablesCount : 0;
    
    const vacantTablesBadgeCount = useMemo(() => {
        const totalTables = tables.length;
        return Math.max(0, totalTables - occupiedTablesCount);
    }, [tables.length, occupiedTablesCount]);

    const layoutType = useMemo(() => {
        if (currentUser?.role === 'admin' || currentUser?.role === 'branch-admin' || currentUser?.role === 'auditor') {
            return 'admin';
        }
        return 'staff';
    }, [currentUser]);

    const totalItems = useMemo(() => currentOrderItems.reduce((sum, item) => sum + item.quantity, 0), [currentOrderItems]);
    
    const [isBadgeAnimating, setIsBadgeAnimating] = useState(false);
    const prevTotalItems = useRef(totalItems);

    const canEdit = useMemo(() => {
        if (!currentUser) return false;
        const isPrivileged = currentUser.role === 'admin' || currentUser.role === 'branch-admin';
        return isEditMode && isPrivileged;
    }, [isEditMode, currentUser]);

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

    const shouldShowAdminSidebar = useMemo(() => {
        if (isCustomerMode || !currentUser) {
            return false;
        }
        const isAdminRole = !['pos', 'kitchen'].includes(currentUser.role);
        
        if (isAdminRole) {
            return isDesktop;
        }

        return false;
    }, [currentUser, isCustomerMode, isDesktop]);

    // ============================================================================
    // 3. HANDLERS (Defined BEFORE Effects)
    // ============================================================================

    const handleLogin = (username: string, password: string) => {
        let user = users.find(u => u.username === username && u.password === password);
        if (!user) {
             user = DEFAULT_USERS.find(u => u.username === username && u.password === password);
        }

        if (user) {
            setCurrentUser(user);
            return { success: true };
        }
        return { success: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
    };

    const handleLogout = () => {
        setCurrentUser(null);
        setSelectedBranch(null);
        localStorage.removeItem('currentUser');
        localStorage.removeItem('selectedBranch');
    };

    const handleBranchSelect = (branch: Branch) => {
        setSelectedBranch(branch);
        localStorage.setItem('selectedBranch', JSON.stringify(branch));
    };

    const handleViewChange = (view: View) => {
        setCurrentView(view);
    };

    const handleAddItemToOrder = (item: MenuItem) => {
        // Open the customization modal immediately
        setItemToCustomize(item);
        setModalState(prev => ({ ...prev, isCustomization: true, isMenuSearch: false }));
    };

    const handleConfirmCustomization = (itemToAdd: OrderItem) => {
         setCurrentOrderItems(prev => {
            // If we are editing, remove the old item and add the new one.
            if (orderItemToEdit) {
                const itemsWithoutOld = prev.filter(i => i.cartItemId !== orderItemToEdit.cartItemId);
                
                // Check if an item with the *new* cartItemId already exists (e.g., changed options to match another item)
                const existingSimilarItem = itemsWithoutOld.find(i => i.cartItemId === itemToAdd.cartItemId);
                if (existingSimilarItem) {
                    // If so, merge quantities
                    return itemsWithoutOld.map(i => i.cartItemId === itemToAdd.cartItemId ? { ...i, quantity: i.quantity + itemToAdd.quantity } : i);
                }
                return [...itemsWithoutOld, itemToAdd];
            } else {
                // If not editing, check for an existing item with the same generated cartItemId
                const existingItem = prev.find(i => i.cartItemId === itemToAdd.cartItemId);
                if (existingItem) {
                    // If it exists, just update its quantity.
                    return prev.map(i => i.cartItemId === itemToAdd.cartItemId ? { ...i, quantity: i.quantity + itemToAdd.quantity } : i);
                }
                // Otherwise, add it as a new item.
                return [...prev, itemToAdd];
            }
        });
        setModalState(prev => ({ ...prev, isCustomization: false }));
        setItemToCustomize(null);
        setOrderItemToEdit(null); // IMPORTANT: Reset this
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: orderItemToEdit ? 'แก้ไขรายการแล้ว' : 'เพิ่มรายการแล้ว',
            showConfirmButton: false,
            timer: 1500
        });
    };

    const handleRemoveItemFromOrder = (cartItemId: string) => {
        setCurrentOrderItems(prev => prev.filter(item => item.cartItemId !== cartItemId));
    };

    const handleQuantityChange = (cartItemId: string, newQuantity: number) => {
        if (newQuantity <= 0) {
            handleRemoveItemFromOrder(cartItemId);
        } else {
            setCurrentOrderItems(prev => prev.map(item => item.cartItemId === cartItemId ? { ...item, quantity: newQuantity } : item));
        }
    };

    const handleToggleTakeaway = (cartItemId: string, isTakeaway: boolean, cutlery?: TakeawayCutleryOption[], notes?: string) => {
        setCurrentOrderItems(prev => prev.map(item => {
            if (item.cartItemId === cartItemId) {
                const updatedItem: OrderItem = { ...item, isTakeaway };
                if (isTakeaway) {
                    updatedItem.takeawayCutlery = cutlery;
                    updatedItem.takeawayCutleryNotes = notes;
                } else {
                    delete (updatedItem as Partial<OrderItem>).takeawayCutlery;
                    delete (updatedItem as Partial<OrderItem>).takeawayCutleryNotes;
                }
                return updatedItem;
            }
            return item;
        }));
    };

    const handleEditOrderItem = (itemToEdit: OrderItem) => {
        // The customization modal works with a MenuItem, not an OrderItem.
        // We extract the base MenuItem properties to populate the modal header.
        setOrderItemToEdit(itemToEdit); // Store the full OrderItem to be edited
        setItemToCustomize(itemToEdit as MenuItem); // Use the item's data to populate the modal
        setModalState(prev => ({ ...prev, isCustomization: true }));
    };

    const handlePlaceOrder = async (itemsToOrder = currentOrderItems, orderCustomerName = customerName, orderCustomerCount = customerCount) => {
        if (!selectedBranch) return;
        if (itemsToOrder.length === 0) return;
    
        setIsPlacingOrder(true);
        
        const tableFromSelection = tables.find(t => t.id === selectedTableId);
        // Customer mode uses a different table object from URL params
        const finalTable = isCustomerMode ? tables.find(t => t.id === customerTableId) : tableFromSelection;
    
        if (!finalTable) {
            Swal.fire('เกิดข้อผิดพลาด', isCustomerMode ? 'ไม่พบข้อมูลโต๊ะ' : 'กรุณาเลือกโต๊ะก่อนสั่งอาหาร', 'error');
            setIsPlacingOrder(false);
            return;
        }
    
        try {
            // --- Client-side Implementation for Order Placement ---
            const subtotal = itemsToOrder.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
            const effectiveTaxRate = isTaxEnabled ? taxRate : 0;
            const taxAmount = subtotal * (effectiveTaxRate / 100);
    
            // --- New Order Number Logic (Daily Reset & Role-based Visibility) ---
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayStartTime = todayStart.getTime();
    
            // Get all orders created today
            const todaysCompletedOrders = completedOrders.filter(o => o.orderTime >= todayStartTime);
            const todaysActiveOrders = activeOrders.filter(o => o.orderTime >= todayStartTime);
            
            let todaysOrdersForNumbering = [...todaysActiveOrders, ...todaysCompletedOrders];
    
            // For branch admins and other non-admin roles, we only count non-deleted orders
            // to make the sequence appear continuous, hiding the fact that some were deleted.
            // Admins see the true sequence including deleted ones.
            if (currentUser?.role !== 'admin') {
                todaysOrdersForNumbering = todaysOrdersForNumbering.filter(o => !o.isDeleted);
            }
            
            const allTodaysOrderNumbers = todaysOrdersForNumbering.map(o => o.orderNumber);
            const maxOrderNumberToday = allTodaysOrderNumbers.length > 0 ? Math.max(...allTodaysOrderNumbers) : 0;
            const newOrderNumber = maxOrderNumberToday + 1;
            
            const newId = Date.now(); // Using timestamp for a unique ID
    
            const newOrder: ActiveOrder = {
                id: newId,
                orderNumber: newOrderNumber,
                tableId: finalTable.id,
                tableName: finalTable.name,
                floor: finalTable.floor,
                customerName: orderCustomerName,
                customerCount: orderCustomerCount,
                items: itemsToOrder,
                orderType: 'dine-in', // Default type
                taxRate: effectiveTaxRate,
                taxAmount: taxAmount,
                placedBy: currentUser ? currentUser.username : (isCustomerMode ? 'Customer' : 'Staff'),
                status: 'waiting',
                orderTime: Date.now(),
            };
    
            // Update state (which triggers Firestore update via useFirestoreSync)
            setActiveOrders(prevOrders => [...prevOrders, newOrder]);
    
            // --- Success Path ---
            setLastPlacedOrderId(newOrderNumber);
            if (!isCustomerMode) {
                setModalState(prev => ({ ...prev, isOrderSuccess: true }));
                setCurrentOrderItems([]);
                setCustomerName('');
                setCustomerCount(1);
                setSelectedTableId(null);
                setNotSentToKitchenDetails(null); 
                setSendToKitchen(true); // Reset send to kitchen toggle
            } else {
                 Swal.fire({
                    icon: 'success',
                    title: 'สั่งอาหารสำเร็จ!',
                    text: `ออเดอร์ #${newOrderNumber} ถูกส่งไปที่ครัวแล้ว`,
                    timer: 2000,
                    showConfirmButton: false
                });
                // In customer mode, the cart is cleared by the CustomerView component itself.
            }
    
            // If kitchen printing is enabled and configured, trigger it
            if (sendToKitchen && printerConfig?.kitchen) {
                try {
                    await printerService.printKitchenOrder(newOrder, printerConfig.kitchen);
                } catch (printError) {
                    console.error("Kitchen print failed:", printError);
                    Swal.fire({
                        icon: 'warning',
                        title: 'สั่งอาหารสำเร็จ แต่พิมพ์ไม่สำเร็จ',
                        text: 'ออเดอร์ถูกส่งเข้าระบบแล้ว แต่ไม่สามารถพิมพ์ใบสั่งอาหารได้ กรุณาตรวจสอบเครื่องพิมพ์',
                    });
                }
            }
            
        } catch (error: any) {
            console.error("Critical error during client-side order placement:", error);
            if (error.message.includes("Unsupported field value: undefined")) {
                Swal.fire('เกิดข้อผิดพลาดร้ายแรง', `ไม่สามารถสั่งอาหารได้: พบข้อมูลที่ไม่ถูกต้อง (undefined) ในออเดอร์ กรุณาลองใหม่อีกครั้ง`, 'error');
            } else {
                Swal.fire('เกิดข้อผิดพลาดร้ายแรง', `ไม่สามารถสั่งอาหารได้: ${error.message}`, 'error');
            }
        } finally {
            setIsPlacingOrder(false);
        }
    };

    const handleTableSelect = (tableId: number) => {
        setSelectedTableId(tableId);
        const table = tables.find(t => t.id === tableId);
        if (table) {
            // If table has orders, maybe load customer name? 
            // For now, simpler logic: just select.
        }
    };

    const handleAddNewTable = (floor: string) => {
        setTables(prevTables => {
            const tablesOnFloor = prevTables.filter(t => t.floor === floor);
            const tableNumbers = tablesOnFloor.map(t => parseInt(t.name.replace(/[^0-9]/g, ''), 10)).filter(n => !isNaN(n));
            const maxTableNum = tableNumbers.length > 0 ? Math.max(...tableNumbers) : 0;
            const newTableName = `T${maxTableNum + 1}`;
    
            const newId = prevTables.length > 0 ? Math.max(...prevTables.map(t => t.id)) + 1 : 1;
    
            const newTable: Table = {
                id: newId,
                name: newTableName,
                floor: floor,
            };
            return [...prevTables, newTable];
        });
    };
    
    const handleRemoveLastTable = (floor: string) => {
        const tablesOnFloor = tables.filter(t => t.floor === floor);
        if (tablesOnFloor.length === 0) return;
    
        const tableNumbers = tablesOnFloor.map(t => ({...t, num: parseInt(t.name.replace(/[^0-9]/g, ''), 10)}));
        const lastTable = tableNumbers.sort((a, b) => b.num - a.num)[0];
    
        const hasActiveOrder = activeOrders.some(order => order.tableId === lastTable.id);
    
        if (hasActiveOrder) {
            Swal.fire('ไม่สามารถลบได้', `โต๊ะ ${lastTable.name} (${lastTable.floor}) มีออเดอร์ค้างอยู่`, 'error');
            return;
        }
        
        Swal.fire({
            title: 'ยืนยันการลบ',
            text: `คุณต้องการลบโต๊ะ ${lastTable.name} (${lastTable.floor}) หรือไม่?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'ใช่, ลบเลย',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#d33'
        }).then(result => {
            if (result.isConfirmed) {
                setTables(prevTables => prevTables.filter(t => t.id !== lastTable.id));
            }
        });
    };

    const handleConfirmPayment = async (orderId: number, paymentDetails: PaymentDetails) => {
        if (!selectedBranch) return;
        setIsConfirmingPayment(true);
        try {
            const orderToComplete = activeOrders.find(o => o.id === orderId);
            if (!orderToComplete) {
                throw new Error("Order not found in active orders.");
            }
    
            // --- Client-side Implementation for Payment Confirmation ---
    
            // 1. Create the completed order object
            const completedOrder: CompletedOrder = {
                ...orderToComplete,
                status: 'completed',
                completionTime: Date.now(),
                paymentDetails: paymentDetails,
            };
    
            // 2. Update active orders state (remove the completed one)
            setActiveOrders(prevOrders => prevOrders.filter(o => o.id !== orderId));
            
            // 3. Update completed orders state (add the new one)
            setCompletedOrders(prevOrders => [...prevOrders, completedOrder]);
    
            // 4. Reset the PIN for the paid table
            setTables(prevTables => 
                prevTables.map(table => {
                    if (table.id === orderToComplete.tableId) {
                        // Create a new object without the activePin property to avoid 'undefined' issues with Firestore.
                        const newTable = { ...table };
                        delete newTable.activePin;
                        return newTable;
                    }
                    return table;
                })
            );
    
            // 5. Update modal state
            setModalState(prev => ({ ...prev, isPayment: false, isPaymentSuccess: true }));
            
        } catch (error: any) {
            console.error("Error confirming payment:", error);
            Swal.fire('เกิดข้อผิดพลาด', `ไม่สามารถชำระเงินได้: ${error.message}`, 'error');
        } finally {
            setIsConfirmingPayment(false);
        }
    };

    const handleClosePaymentSuccess = async (shouldPrint: boolean) => {
        setModalState(prev => ({ ...prev, isPaymentSuccess: false }));
        if (shouldPrint && orderForModal && printerConfig?.cashier) {
             try {
                Swal.fire({
                    title: 'กำลังพิมพ์ใบเสร็จ...',
                    didOpen: () => { Swal.showLoading(); }
                });
                const completedOrderSnapshot = { 
                    ...orderForModal, 
                    status: 'completed', 
                    completionTime: Date.now(),
                    paymentDetails: { method: 'cash', cashReceived: 0, changeGiven: 0 } 
                } as CompletedOrder;

                await printerService.printReceipt(completedOrderSnapshot, printerConfig.cashier, restaurantName);
                
                Swal.fire({
                    icon: 'success',
                    title: 'พิมพ์ใบเสร็จแล้ว',
                    timer: 1500,
                    showConfirmButton: false
                });
            } catch (error) {
                Swal.fire({
                    icon: 'error',
                    title: 'พิมพ์ใบเสร็จไม่สำเร็จ',
                    text: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }
        setOrderForModal(null);
    };

    const handleGeneratePin = (tableId: number) => {
        const newPin = String(Math.floor(100 + Math.random() * 900));
        setTables(prevTables => 
            prevTables.map(table => 
                table.id === tableId ? { ...table, activePin: newPin } : table
            )
        );
    };

    const handleStartCooking = (orderId: number) => {
        setActiveOrders(prevOrders =>
            prevOrders.map(order =>
                order.id === orderId
                    ? { ...order, status: 'cooking', cookingStartTime: Date.now() }
                    : order
            )
        );
    };
    
    const handleCompleteOrder = (orderId: number) => {
        setActiveOrders(prevOrders =>
            prevOrders.map(order =>
                order.id === orderId
                    ? { ...order, status: 'served' }
                    : order
            )
        );
    };
    
    const handleCancelOrder = (orderToCancel: ActiveOrder, reason: CancellationReason, notes?: string) => {
        if (!currentUser) return;
    
        const cancelledOrder: Partial<CancelledOrder> = {
            ...orderToCancel,
            status: 'cancelled',
            cancellationTime: Date.now(),
            cancelledBy: currentUser.username,
            cancellationReason: reason,
        };

        if (notes && notes.trim()) {
            cancelledOrder.cancellationNotes = notes.trim();
        }
    
        setActiveOrders(prev => prev.filter(o => o.id !== orderToCancel.id));
        setCancelledOrders(prev => [...prev, cancelledOrder as CancelledOrder]);
    
        setModalState(prev => ({ ...prev, isCancelOrder: false }));
        setOrderForModal(null);
    
        Swal.fire('ยกเลิกแล้ว', `ออเดอร์ #${orderToCancel.orderNumber} ถูกยกเลิกเรียบร้อย`, 'success');
    };

    const handleDeleteHistory = (completedIdsToDelete: number[], cancelledIdsToDelete: number[], printIdsToDelete: number[]) => {
        if (!currentUser) return;
    
        if (currentUser.role === 'admin') {
            // Admin performs a hard delete.
            setCompletedOrders(prev => prev.filter(o => !completedIdsToDelete.includes(o.id)));
            setCancelledOrders(prev => prev.filter(o => !cancelledIdsToDelete.includes(o.id)));
            setPrintHistory(prev => prev.filter(p => !printIdsToDelete.includes(p.id)));
            Swal.fire('ลบถาวรแล้ว!', 'รายการถูกลบออกจากระบบเรียบร้อย', 'success');
        } else { 
            // Other roles with permission (like branch-admin) perform a soft delete.
            const username = currentUser.username;
            setCompletedOrders(prev => prev.map(o => 
                completedIdsToDelete.includes(o.id) ? { ...o, isDeleted: true, deletedBy: username } : o
            ));
            setCancelledOrders(prev => prev.map(o => 
                cancelledIdsToDelete.includes(o.id) ? { ...o, isDeleted: true, deletedBy: username } : o
            ));
            setPrintHistory(prev => prev.map(p => 
                printIdsToDelete.includes(p.id) ? { ...p, isDeleted: true, deletedBy: username } : p
            ));
            Swal.fire('ลบรายการแล้ว', 'รายการที่เลือกถูกลบถาวรเรียบร้อย', 'success');
        }
    };

    const handleSaveSettings = (
        newQrCodeUrl: string,
        newSoundUrl: string,
        newStaffCallSoundUrl: string,
        newPrinterConfig: PrinterConfig,
        newOpeningTime: string,
        newClosingTime: string
    ) => {
        setQrCodeUrl(newQrCodeUrl);
        setNotificationSoundUrl(newSoundUrl);
        setStaffCallSoundUrl(newStaffCallSoundUrl);
        setPrinterConfig(newPrinterConfig);
        setOpeningTime(newOpeningTime);
        setClosingTime(newClosingTime);
        setModalState(prev => ({ ...prev, isSettings: false }));
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: 'บันทึกการตั้งค่าทั้งหมดแล้ว',
            showConfirmButton: false,
            timer: 2000
        });
    };

    const handleSavePrinterConfig = (newPrinterConfig: PrinterConfig) => {
        setPrinterConfig(newPrinterConfig);
    };

    const handleMoveTable = (orderId: number, newTableId: number) => {
        const orderToMove = activeOrders.find(o => o.id === orderId);
        const newTable = tables.find(t => t.id === newTableId);
    
        if (!orderToMove || !newTable) {
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่พบออเดอร์หรือโต๊ะที่เลือก', 'error');
            return;
        }
    
        setActiveOrders(prev => prev.map(o => 
            o.id === orderId ? { ...o, tableId: newTable.id, tableName: newTable.name, floor: newTable.floor } : o
        ));
        
        setModalState(prev => ({ ...prev, isMoveTable: false }));
        setOrderForModal(null);
        Swal.fire('สำเร็จ', `ย้ายออเดอร์ #${orderToMove.orderNumber} ไปที่โต๊ะ ${newTable.name} แล้ว`, 'success');
    };
    
    const handleConfirmSplit = (itemsToSplit: OrderItem[]) => {
        if (!orderForModal || orderForModal.status === 'completed') return;
        const originalOrder = orderForModal as ActiveOrder;
    
        const maxOrderNumber = Math.max(0, ...activeOrders.map(o => o.orderNumber), ...completedOrders.map(o => o.orderNumber));
        const newOrderNumber = maxOrderNumber + 1;
        const newId = Date.now();
    
        const subtotal = itemsToSplit.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
        const taxAmount = subtotal * (originalOrder.taxRate / 100);
    
        const newSplitOrder: ActiveOrder = {
            ...originalOrder,
            id: newId,
            orderNumber: newOrderNumber,
            items: itemsToSplit,
            taxAmount: taxAmount,
            parentOrderId: originalOrder.id,
            orderTime: Date.now(),
            status: 'served', // Assume only served items can be split
        };
    
        const updatedOriginalItems: OrderItem[] = [];
        for (const originalItem of originalOrder.items) {
            const splitItem = itemsToSplit.find(si => si.cartItemId === originalItem.cartItemId);
            if (splitItem) {
                const remainingQuantity = originalItem.quantity - splitItem.quantity;
                if (remainingQuantity > 0) {
                    updatedOriginalItems.push({ ...originalItem, quantity: remainingQuantity });
                }
            } else {
                updatedOriginalItems.push(originalItem);
            }
        }
    
        const updatedOriginalOrder = { ...originalOrder, items: updatedOriginalItems };
        const originalSubtotal = updatedOriginalOrder.items.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
        updatedOriginalOrder.taxAmount = originalSubtotal * (updatedOriginalOrder.taxRate / 100);
    
        setActiveOrders(prev => {
            const otherOrders = prev.filter(o => o.id !== originalOrder.id);
            return updatedOriginalOrder.items.length > 0
                ? [...otherOrders, updatedOriginalOrder, newSplitOrder]
                : [...otherOrders, newSplitOrder];
        });
    
        setModalState(prev => ({ ...prev, isSplitBill: false }));
        setOrderForModal(null);
        Swal.fire('สำเร็จ', `แยกบิล #${newSplitOrder.orderNumber} เรียบร้อย`, 'success');
    };
    
    const handleConfirmMerge = (sourceOrderIds: number[], targetOrderId: number) => {
        const targetOrder = activeOrders.find(o => o.id === targetOrderId);
        const sourceOrders = activeOrders.filter(o => sourceOrderIds.includes(o.id));
    
        if (!targetOrder || sourceOrders.length === 0) {
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่พบออเดอร์ที่ต้องการรวม', 'error');
            return;
        }
    
        const combinedItems = [...targetOrder.items];
        
        const isInterTableMerge = sourceOrders.some(so => so.tableId !== targetOrder.tableId);
        
        let totalCustomerCount = targetOrder.customerCount;
        if (isInterTableMerge) {
            totalCustomerCount += sourceOrders.reduce((sum, o) => sum + o.customerCount, 0);
        }
    
        for (const sourceOrder of sourceOrders) {
            for (const sourceItem of sourceOrder.items) {
                const existingItemIndex = combinedItems.findIndex(ci => ci.cartItemId === sourceItem.cartItemId);
                if (existingItemIndex > -1) {
                    combinedItems[existingItemIndex].quantity += sourceItem.quantity;
                } else {
                    combinedItems.push(sourceItem);
                }
            }
        }
    
        const updatedTargetOrder = { ...targetOrder, items: combinedItems, customerCount: totalCustomerCount };
        const subtotal = updatedTargetOrder.items.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
        updatedTargetOrder.taxAmount = subtotal * (updatedTargetOrder.taxRate / 100);
    
        setActiveOrders(prev => {
            const remainingOrders = prev.filter(o => !sourceOrderIds.includes(o.id) && o.id !== targetOrderId);
            return [...remainingOrders, updatedTargetOrder];
        });
    
        setModalState(prev => ({ ...prev, isMergeBill: false }));
        setOrderForModal(null);
        Swal.fire('สำเร็จ', 'รวมบิลเรียบร้อยแล้ว', 'success');
    };

    const handleInitiateCashBill = (order: CompletedOrder) => {
        setOrderForModal(order);
        setModalState(prev => ({ ...prev, isCashBill: true }));
    };

    const handleSaveLeaveRequest = (requestData: Omit<LeaveRequest, 'id' | 'status' | 'branchId'>) => {
        if (!selectedBranch) {
            Swal.fire('เกิดข้อผิดพลาด', 'กรุณาเลือกสาขาก่อนส่งคำขอ', 'error');
            return;
        }

        const newLeaveRequest: LeaveRequest = {
            ...requestData,
            id: Date.now(), // Use timestamp for a unique ID
            status: 'pending',
            branchId: selectedBranch.id,
            acknowledgedBy: [], // Initialize acknowledgedBy
        };

        setLeaveRequests(prevRequests => [...prevRequests, newLeaveRequest]);
        
        setModalState(prev => ({...prev, isLeaveRequest: false}));

        Swal.fire({
            icon: 'success',
            title: 'ส่งคำขอสำเร็จ!',
            text: 'คำขอวันลาของคุณได้ถูกส่งเข้าระบบเรียบร้อยแล้ว',
            timer: 2000,
            showConfirmButton: false,
        });
    };
    
    const handleUpdateLeaveStatus = (requestId: number, status: 'approved' | 'rejected') => {
        const request = leaveRequests.find(r => r.id === requestId);
        if (!request) {
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่พบคำขอลา', 'error');
            return;
        }
    
        const user = users.find(u => u.id === request.userId);
        if (!user) {
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่พบผู้ใช้สำหรับคำขอนี้', 'error');
            return;
        }
    
        if (status === 'approved') {
            const startDay = new Date(request.startDate);
            startDay.setHours(0, 0, 0, 0);
            const endDay = new Date(request.endDate);
            endDay.setHours(0, 0, 0, 0);
    
            const durationInMs = endDay.getTime() - startDay.getTime();
            const durationInDays = request.isHalfDay ? 0.5 : (durationInMs / (1000 * 60 * 60 * 24)) + 1;
    
            const usedDays = leaveRequests.reduce((acc, req) => {
                if (req.userId === user.id && req.status === 'approved' && req.type === request.type) {
                    const reqStartDay = new Date(req.startDate);
                    reqStartDay.setHours(0, 0, 0, 0);
                    const reqEndDay = new Date(req.endDate);
                    reqEndDay.setHours(0, 0, 0, 0);
                    const reqDurationInMs = reqEndDay.getTime() - reqStartDay.getTime();
                    const reqDuration = req.isHalfDay ? 0.5 : (reqDurationInMs / (1000 * 60 * 60 * 24)) + 1;
                    return acc + reqDuration;
                }
                return acc;
            }, 0);
    
            const totalQuota = (user.leaveQuotas && user.leaveQuotas[request.type as keyof typeof user.leaveQuotas]) ?? 0;
            const remainingDays = totalQuota - usedDays;
    
            if (['sick', 'personal', 'vacation'].includes(request.type)) {
                if (durationInDays > remainingDays) {
                    const typeLabel = request.type === 'sick' ? 'ลาป่วย' : request.type === 'personal' ? 'ลากิจ' : 'ลาพักร้อน';
                    Swal.fire(
                        'วันลาไม่เพียงพอ',
                        `ไม่สามารถอนุมัติได้ พนักงานมี${typeLabel}เหลือ ${remainingDays} วัน (ขอ ${durationInDays} วัน)`,
                        'error'
                    );
                    return;
                }
            }
    
            setLeaveRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: 'approved' } : r));
            Swal.fire('อนุมัติแล้ว!', 'คำขอวันลาได้รับการอนุมัติ', 'success');
        } else { // 'rejected'
            setLeaveRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: 'rejected' } : r));
            Swal.fire('ปฏิเสธแล้ว', 'คำขอวันลาถูกปฏิเสธ', 'info');
        }
    };

    const handleDeleteLeaveRequest = async (requestId: number): Promise<boolean> => {
        try {
            setLeaveRequests(prev => prev.filter(req => req.id !== requestId));
            return true;
        } catch (error) {
            console.error("Error deleting leave request from state:", error);
            return false;
        }
    };

    const handleUpdateCurrentUser = (updates: Partial<User>) => {
        if (currentUser) {
            const updatedUser = { ...currentUser, ...updates };
            setCurrentUser(updatedUser);
            setUsers(prevUsers => prevUsers.map(u => u.id === currentUser.id ? updatedUser : u));
        }
    };

    // ============================================================================
    // 4. EFFECTS
    // ============================================================================
    
    // --- RESPONSIVE EFFECT ---
    useEffect(() => {
        const handleResize = () => {
            setIsDesktop(window.innerWidth >= 1024);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // --- INITIALIZATION EFFECTS ---
    useEffect(() => {
        if (floors && floors.length > 0) {
            if (!selectedSidebarFloor || !floors.includes(selectedSidebarFloor)) {
                setSelectedSidebarFloor(floors[0]);
            }
        } else {
            setSelectedSidebarFloor('');
        }
    }, [floors, selectedSidebarFloor]);

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
        const mode = params.get('mode');
        const tableIdParam = params.get('tableId');
        const branchIdParam = params.get('branchId');

        if (mode === 'customer' && tableIdParam) {
            setIsCustomerMode(true);
            setCustomerTableId(Number(tableIdParam));

            // Wait for branches to be loaded before setting the branch
            if (branches.length > 0) {
                let branchToSet: Branch | undefined;
                if (branchIdParam) {
                    branchToSet = branches.find(b => b.id === Number(branchIdParam));
                }

                if (!branchToSet) {
                    console.warn(`Customer mode: branchId "${branchIdParam}" not found or not provided. Falling back to the first available branch.`);
                    branchToSet = branches[0];
                }
                
                if (branchToSet) {
                    setSelectedBranch(branchToSet);
                    localStorage.setItem('customerSelectedBranch', JSON.stringify(branchToSet));
                }
            }
        }
    }, [branches]);


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

    // --- Badge Animation Effect ---
    useEffect(() => {
        // Animate badge on item add when sidebar is collapsed
        if (totalItems > prevTotalItems.current && !isOrderSidebarVisible) {
            setIsBadgeAnimating(true);
            // The bounce animation is 1s long. We remove the class after it finishes.
            const timer = setTimeout(() => setIsBadgeAnimating(false), 1000); 
            return () => clearTimeout(timer);
        }
        prevTotalItems.current = totalItems;
    }, [totalItems, isOrderSidebarVisible]);

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

        // Allow Kitchen, POS, Branch Admin, and Admin to receive notifications
        const allowedRoles = ['kitchen', 'pos', 'branch-admin', 'admin'];
        if (currentUser && !isCustomerMode && allowedRoles.includes(currentUser.role)) {
            setupPushNotifications(currentUser);
        }
    }, [currentUser, setUsers, isCustomerMode]);

    useEffect(() => {
        if (window.AndroidBridge?.setPendingOrderCount) {
            window.AndroidBridge.setPendingOrderCount(kitchenBadgeCount);
        }
    }, [kitchenBadgeCount]);

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

    // --- KITCHEN LOGIN REMINDER & DEFAULT VIEW EFFECT ---
    useEffect(() => {
        const isNewLogin = currentUser && prevUserRef.current?.id !== currentUser.id;
    
        if (isNewLogin) {
            // Set default view on new login based on role
            if (currentUser.role === 'kitchen') {
                setCurrentView('kitchen');
    
                // Existing kitchen login reminder logic
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
            } else if (currentUser.role === 'pos') {
                setCurrentView('pos');
            }
        }
    
        prevUserRef.current = currentUser;
    }, [currentUser, activeOrders, notificationSoundUrl]);

    // --- LEAVE REQUEST ACKNOWLEDGEMENT NOTIFICATION EFFECT ---
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

    // --- STAFF CALL NOTIFICATION & SOUND EFFECT ---
    useEffect(() => {
        const shouldPlayAudio = staffCalls.length > 0 && staffCallSoundUrl && !isCustomerMode && currentUser && ['pos', 'kitchen', 'admin', 'branch-admin'].includes(currentUser.role);
    
        // Initialize or update audio object if URL is available
        if (staffCallSoundUrl) {
            if (!staffCallAudioRef.current) {
                staffCallAudioRef.current = new Audio(staffCallSoundUrl);
                staffCallAudioRef.current.loop = true;
            } else if (staffCallAudioRef.current.src !== staffCallSoundUrl) {
                // If the sound source changed in settings, update it
                staffCallAudioRef.current.src = staffCallSoundUrl;
            }
        }
    
        if (shouldPlayAudio && staffCallAudioRef.current) {
            // Attempt to play, and catch any browser autoplay policy errors
            if (staffCallAudioRef.current.paused) {
                staffCallAudioRef.current.play().catch(e => console.error("Error playing staff call sound:", e));
            }
        } else if (staffCallAudioRef.current && !staffCallAudioRef.current.paused) {
            // Stop playing if conditions are not met
            staffCallAudioRef.current.pause();
            staffCallAudioRef.current.currentTime = 0;
        }
    
        // Cleanup on component unmount
        return () => {
            if (staffCallAudioRef.current) {
                staffCallAudioRef.current.pause();
            }
        };
    }, [staffCalls.length, staffCallSoundUrl, isCustomerMode, currentUser]);

    useEffect(() => {
        const showOrHideNotification = async () => {
            // Guard clauses to prevent showing modal in wrong context
            if (isCustomerMode || !currentUser || !['pos', 'kitchen', 'admin', 'branch-admin'].includes(currentUser.role)) {
                // If a modal is somehow visible, close it
                if (Swal.isVisible()) {
                    Swal.close();
                    activeCallRef.current = null;
                }
                return;
            }

            // Get the first active call from the queue
            const activeCall = staffCalls.length > 0 ? staffCalls[0] : null;

            if (activeCall) {
                // Check if a modal for this specific call is already being managed by this client
                if (activeCallRef.current?.id !== activeCall.id) {
                    // Close any previously visible modal before showing a new one
                    if (Swal.isVisible()) {
                        Swal.close();
                    }
                    
                    // Track the new call this client is now handling
                    activeCallRef.current = activeCall;

                    const result = await Swal.fire({
                        title: '🔔 ลูกค้าเรียกพนักงาน!',
                        html: `โต๊ะ <b>${activeCall.tableName}</b> (คุณ ${activeCall.customerName})<br/>ต้องการความช่วยเหลือ`,
                        icon: 'info',
                        confirmButtonText: 'รับทราบ',
                        allowOutsideClick: false,
                        allowEscapeKey: false
                    });

                    if (result.isConfirmed) {
                        // User acknowledged the call. Remove it from the central state.
                        setStaffCalls(prev => prev.filter(call => call.id !== activeCall.id));
                    }
                    // Reset the ref after interaction is complete
                    activeCallRef.current = null;
                }
            } else {
                // No active calls, so ensure any modal this client was tracking is closed.
                if (activeCallRef.current) {
                    if (Swal.isVisible()) {
                        Swal.close();
                    }
                    activeCallRef.current = null;
                }
            }
        };

        showOrHideNotification();
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
                if (order.status === 'cooking' && order.cookingStartTime) {
                    const startTime = order.cookingStartTime;
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


    // ============================================================================
    // 5. RENDER HELPERS
    // ============================================================================
    
    // Sidebar for Order Summary - always visible now
    const orderSummarySidebar = (
        <Sidebar
            currentOrderItems={currentOrderItems}
            onQuantityChange={handleQuantityChange}
            onRemoveItem={handleRemoveItemFromOrder}
            onEditOrderItem={handleEditOrderItem}
            onClearOrder={() => setCurrentOrderItems([])}
            onPlaceOrder={() => handlePlaceOrder()}
            isPlacingOrder={isPlacingOrder}
            tables={tables}
            selectedTable={tables.find(t => t.id === selectedTableId) || null}
            onSelectTable={setSelectedTableId}
            customerName={customerName}
            onCustomerNameChange={setCustomerName}
            customerCount={customerCount}
            onCustomerCountChange={setCustomerCount}
            isEditMode={canEdit}
            onAddNewTable={handleAddNewTable}
            onRemoveLastTable={handleRemoveLastTable}
            floors={floors}
            selectedFloor={selectedSidebarFloor}
            onFloorChange={setSelectedSidebarFloor}
            onAddFloor={() => {}} // Placeholder
            onRemoveFloor={() => {}} // Placeholder
            sendToKitchen={sendToKitchen}
            onSendToKitchenChange={(enabled, details) => {
                setSendToKitchen(enabled);
                setNotSentToKitchenDetails(details);
            }}
            onUpdateReservation={() => {}} // Placeholder
            onOpenSearch={() => setModalState(prev => ({ ...prev, isMenuSearch: true }))}
            currentUser={currentUser}
            onViewChange={setCurrentView}
            restaurantName={restaurantName}
            onLogout={handleLogout}
        />
    );

    if (isCustomerMode) {
        const table = tables.find(t => t.id === customerTableId);
        if (!table) return (
            <div className="h-screen w-screen flex items-center justify-center bg-gray-100 text-center">
                <div>
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-xl font-semibold text-gray-700">กำลังโหลดข้อมูลโต๊ะ...</p>
                </div>
            </div>
        );

        return (
            <CustomerView
                table={table}
                menuItems={menuItems}
                categories={categories}
                activeOrders={activeOrders.filter(o => o.tableId === table.id)}
                allBranchOrders={activeOrders}
                onPlaceOrder={(items, name, count) => handlePlaceOrder(items, name, count)}
                onStaffCall={(tableToCall, name) => {
                    if (!selectedBranch) return;
                    const newCall: StaffCall = {
                        id: Date.now(),
                        tableId: tableToCall.id,
                        tableName: tableToCall.name,
                        customerName: name,
                        branchId: selectedBranch.id,
                        timestamp: Date.now()
                    };
                    setStaffCalls(prev => [...prev, newCall]);
                }}
            />
        );
    }

    if (!currentUser) {
        return <LoginScreen onLogin={handleLogin} />;
    }

    if (!selectedBranch) {
        return (
            <BranchSelectionScreen
                onSelectBranch={handleBranchSelect}
                currentUser={currentUser}
                branches={branches}
                onManageBranches={() => setModalState(prev => ({ ...prev, isBranchManager: true }))}
                onLogout={handleLogout}
            />
        );
    }

    return (
        <div className="flex h-screen overflow-hidden bg-gray-100">
            {/* Admin/Main Navigation Sidebar (Left) */}
            {shouldShowAdminSidebar && (
                <AdminSidebar
                    isCollapsed={isAdminSidebarCollapsed}
                    onToggleCollapse={() => setIsAdminSidebarCollapsed(!isAdminSidebarCollapsed)}
                    logoUrl={logoUrl}
                    restaurantName={restaurantName}
                    branchName={selectedBranch?.name || ''}
                    currentUser={currentUser}
                    onViewChange={setCurrentView}
                    currentView={currentView}
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
                    onUpdateCurrentUser={handleUpdateCurrentUser}
                    onUpdateLogoUrl={setLogoUrl}
                    onUpdateRestaurantName={setRestaurantName}
                />
            )}

            {/* Main Content Area */}
            <div className={`flex-1 flex flex-col min-w-0 overflow-hidden relative transition-all duration-300 ${shouldShowAdminSidebar && (isAdminSidebarCollapsed ? 'md:ml-20' : 'md:ml-64')}`}>
                {!shouldShowAdminSidebar && !(currentView === 'pos' && !isDesktop) && (
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
                        onLogoChangeClick={() => {}} // Placeholder
                        restaurantName={restaurantName}
                        onRestaurantNameChange={setRestaurantName}
                        branchName={selectedBranch?.name || ''}
                        onChangeBranch={() => setSelectedBranch(null)}
                        onManageBranches={() => setModalState(prev => ({ ...prev, isBranchManager: true }))}
                    />
                )}
                
                <main className="flex-1 overflow-hidden relative">
                    {currentView === 'pos' && (
                        <>
                            {shouldShowAdminSidebar ? (
                                // For admin-like roles, always show the Menu in the main content on POS view.
                                <div className="h-full">
                                    <Menu
                                        menuItems={menuItems}
                                        setMenuItems={setMenuItems}
                                        categories={categories}
                                        onSelectItem={handleAddItemToOrder}
                                        isEditMode={canEdit}
                                        onEditItem={(item) => { setItemToEdit(item); setModalState(prev => ({ ...prev, isMenuItem: true })); }}
                                        onAddNewItem={() => { setItemToEdit(null); setModalState(prev => ({ ...prev, isMenuItem: true })); }}
                                        onDeleteItem={() => {}} // Placeholder
                                        onUpdateCategory={() => {}} // Placeholder
                                        onDeleteCategory={() => {}} // Placeholder
                                        onAddCategory={() => {}} // Placeholder
                                        onImportMenu={() => {}} // Placeholder
                                        totalItems={totalItems}
                                    />
                                </div>
                            ) : (
                                // For staff roles (pos/kitchen), show Menu on desktop and OrderSummary on mobile.
                                <>
                                    <div className="hidden lg:block h-full">
                                        <Menu
                                            menuItems={menuItems}
                                            setMenuItems={setMenuItems}
                                            categories={categories}
                                            onSelectItem={handleAddItemToOrder}
                                            isEditMode={canEdit}
                                            onEditItem={(item) => { setItemToEdit(item); setModalState(prev => ({ ...prev, isMenuItem: true })); }}
                                            onAddNewItem={() => { setItemToEdit(null); setModalState(prev => ({ ...prev, isMenuItem: true })); }}
                                            onDeleteItem={() => {}} // Placeholder
                                            onUpdateCategory={() => {}} // Placeholder
                                            onDeleteCategory={() => {}} // Placeholder
                                            onAddCategory={() => {}} // Placeholder
                                            onImportMenu={() => {}} // Placeholder
                                            totalItems={totalItems}
                                        />
                                    </div>
                                    <div className="lg:hidden h-full">
                                        {orderSummarySidebar}
                                    </div>
                                </>
                            )}
                        </>
                    )}
                    {currentView === 'kitchen' && (
                        <KitchenView 
                            activeOrders={activeOrders}
                            onCompleteOrder={handleCompleteOrder}
                            onStartCooking={handleStartCooking}
                        />
                    )}
                    {currentView === 'tables' && (
                        <TableLayout 
                            tables={tables}
                            activeOrders={activeOrders}
                            onTableSelect={handleTableSelect}
                            onShowBill={(orderId) => {
                                const order = activeOrders.find(o => o.id === orderId);
                                if (order) {
                                    setOrderForModal(order);
                                    setModalState(prev => ({ ...prev, isTableBill: true }));
                                }
                            }}
                            onGeneratePin={handleGeneratePin}
                            currentUser={currentUser}
                            printerConfig={printerConfig}
                            floors={floors}
                            selectedBranch={selectedBranch}
                        />
                    )}
                    {currentView === 'dashboard' && (
                        <Dashboard 
                            completedOrders={completedOrders}
                            cancelledOrders={cancelledOrders}
                            openingTime={openingTime || '10:00'}
                            closingTime={closingTime || '22:00'}
                            currentUser={currentUser}
                        />
                    )}
                    {currentView === 'history' && (
                        <SalesHistory 
                            completedOrders={completedOrders}
                            cancelledOrders={cancelledOrders}
                            printHistory={printHistory}
                            onReprint={() => {}} // Placeholder
                            onSplitOrder={() => {}} // Placeholder
                            isEditMode={canEdit}
                            onEditOrder={() => {}} // Placeholder
                            onInitiateCashBill={handleInitiateCashBill}
                            onDeleteHistory={handleDeleteHistory} 
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
                            onOpenRequestModal={() => setModalState(prev => ({ ...prev, isLeaveRequest: true }))}
                            branches={branches}
                            onUpdateStatus={handleUpdateLeaveStatus}
                            onDeleteRequest={handleDeleteLeaveRequest}
                            selectedBranch={selectedBranch}
                        />
                    )}
                </main>
                
                {/* Hide BottomNavBar on POS view because Sidebar (which is shown on mobile POS) has its own navigation */}
                {!isCustomerMode && currentView !== 'pos' && !shouldShowAdminSidebar && (
                    <BottomNavBar 
                        items={[
                            { id: 'pos', label: 'POS', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" /><path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h2a1 1 0 100-2H9z" clipRule="evenodd" /></svg>, view: 'pos' },
                            { id: 'history', label: 'ประวัติ', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>, view: 'history' },
                            { id: 'dashboard', label: 'Dash', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1-1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" /></svg>, view: 'dashboard' },
                            { id: 'leave', label: 'วันลา', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>, view: 'leave', badge: leaveBadgeCount },
                            { id: 'stock', label: 'สต็อก', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>, view: 'stock' },
                            { id: 'tables', label: 'ผังโต๊ะ', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm2 1v8h8V6H4z" /></svg>, view: 'tables', badge: tablesBadgeCount },
                        ]}
                        currentView={currentView}
                        onViewChange={setCurrentView}
                    />
                )}
            </div>

            {/* Right Sidebar and Toggle Button Wrapper */}
            {!isCustomerMode && (
                <div className="hidden lg:flex flex-shrink-0 relative">
                    {/* Toggle Button */}
                    <button
                        onClick={() => setIsOrderSidebarVisible(!isOrderSidebarVisible)}
                        className="absolute top-1/2 -translate-y-1/2 -left-12 z-30 h-24 w-12 bg-gray-800/80 text-white hover:bg-gray-700/90 transition-all duration-300 backdrop-blur-sm flex items-center justify-center group rounded-l-lg pr-1"
                        title={isOrderSidebarVisible ? 'ซ่อนรายการออเดอร์' : 'แสดงรายการออเดอร์'}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-8 w-8 transition-transform duration-300 ${isOrderSidebarVisible ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                         <span
                            className={`absolute -top-1 -left-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-red-500 text-sm font-bold text-white transition-all duration-300 ease-in-out transform group-hover:scale-110
                                ${!isOrderSidebarVisible && totalItems > 0 ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}
                                ${isBadgeAnimating ? 'animate-bounce' : ''}
                            `}
                        >
                            {totalItems > 99 ? '99+' : totalItems}
                        </span>
                    </button>
                    {/* Right Sidebar */}
                    <div
                        className={`transition-all duration-300 ease-in-out overflow-hidden ${isOrderSidebarVisible ? (isAdminSidebarCollapsed ? 'w-96' : 'w-80') : 'w-0'}`}
                    >
                        <div className={`h-full ${isAdminSidebarCollapsed ? 'w-96' : 'w-80'}`}>
                            {orderSummarySidebar}
                        </div>
                    </div>
                </div>
            )}

            {/* Modals */}
            <MenuItemModal
                isOpen={modalState.isMenuItem}
                onClose={() => setModalState(prev => ({ ...prev, isMenuItem: false }))}
                onSave={() => {}} // Placeholder
                itemToEdit={itemToEdit}
                categories={categories}
                onAddCategory={() => {}} // Placeholder
            />
            <ItemCustomizationModal 
                isOpen={modalState.isCustomization}
                onClose={() => {
                    setModalState(prev => ({ ...prev, isCustomization: false }));
                    setItemToCustomize(null);
                    setOrderItemToEdit(null); // Also clear the item being edited on close
                }}
                item={itemToCustomize}
                onConfirm={handleConfirmCustomization}
                orderItemToEdit={orderItemToEdit}
            />
            <MenuSearchModal 
                isOpen={modalState.isMenuSearch}
                onClose={() => setModalState(prev => ({ ...prev, isMenuSearch: false }))}
                menuItems={menuItems}
                onSelectItem={handleAddItemToOrder}
            />
            <OrderSuccessModal 
                isOpen={modalState.isOrderSuccess}
                onClose={() => setModalState(prev => ({ ...prev, isOrderSuccess: false }))}
                orderId={lastPlacedOrderId || 0}
            />
            <PaymentModal 
                isOpen={modalState.isPayment}
                onClose={() => setModalState(prev => ({ ...prev, isPayment: false }))}
                order={orderForModal as ActiveOrder}
                onConfirmPayment={handleConfirmPayment}
                qrCodeUrl={qrCodeUrl}
                isEditMode={canEdit}
                onOpenSettings={() => setModalState(prev => ({ ...prev, isSettings: true }))}
                isConfirmingPayment={isConfirmingPayment}
            />
            <PaymentSuccessModal 
                isOpen={modalState.isPaymentSuccess}
                onClose={handleClosePaymentSuccess}
                orderNumber={orderForModal?.orderNumber || 0}
            />
            <TableBillModal 
                isOpen={modalState.isTableBill}
                onClose={() => setModalState(prev => ({ ...prev, isTableBill: false }))}
                order={orderForModal as ActiveOrder}
                onInitiatePayment={() => setModalState(prev => ({ ...prev, isPayment: true, isTableBill: false }))}
                onInitiateMove={() => setModalState(prev => ({ ...prev, isMoveTable: true, isTableBill: false }))}
                onSplit={() => setModalState(prev => ({ ...prev, isSplitBill: true, isTableBill: false }))}
                isEditMode={canEdit}
                onUpdateOrder={() => {}} // Placeholder
                currentUser={currentUser}
                onInitiateCancel={() => setModalState(prev => ({ ...prev, isCancelOrder: true, isTableBill: false }))}
                activeOrderCount={activeOrders.filter(o => o.tableId === orderForModal?.tableId).length}
                onInitiateMerge={() => setModalState(prev => ({ ...prev, isMergeBill: true, isTableBill: false }))}
            />
            <CancelOrderModal
                isOpen={modalState.isCancelOrder}
                onClose={() => setModalState(prev => ({ ...prev, isCancelOrder: false }))}
                order={orderForModal as ActiveOrder}
                onConfirm={handleCancelOrder}
            />
            <MoveTableModal
                isOpen={modalState.isMoveTable}
                onClose={() => setModalState(prev => ({ ...prev, isMoveTable: false }))}
                order={orderForModal as ActiveOrder}
                tables={tables}
                activeOrders={activeOrders}
                onConfirmMove={handleMoveTable}
                floors={floors}
            />
            <SplitBillModal
                isOpen={modalState.isSplitBill}
                onClose={() => setModalState(prev => ({ ...prev, isSplitBill: false }))}
                order={orderForModal as ActiveOrder}
                onConfirmSplit={handleConfirmSplit}
            />
            <MergeBillModal
                isOpen={modalState.isMergeBill}
                onClose={() => setModalState(prev => ({ ...prev, isMergeBill: false }))}
                order={orderForModal as ActiveOrder}
                allActiveOrders={activeOrders}
                tables={tables}
                onConfirmMerge={handleConfirmMerge}
            />
            <SettingsModal 
                isOpen={modalState.isSettings}
                onClose={() => setModalState(prev => ({ ...prev, isSettings: false }))}
                onSave={handleSaveSettings}
                currentQrCodeUrl={qrCodeUrl}
                currentNotificationSoundUrl={notificationSoundUrl}
                currentStaffCallSoundUrl={staffCallSoundUrl}
                currentPrinterConfig={printerConfig}
                currentOpeningTime={openingTime}
                currentClosingTime={closingTime}
                onSavePrinterConfig={handleSavePrinterConfig}
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
            <LeaveRequestModal 
                isOpen={modalState.isLeaveRequest}
                onClose={() => setModalState(prev => ({ ...prev, isLeaveRequest: false }))}
                currentUser={currentUser}
                onSave={handleSaveLeaveRequest}
                leaveRequests={leaveRequests}
                initialDate={leaveRequestInitialDate}
            />
            <CashBillModal
                isOpen={modalState.isCashBill}
                order={orderForModal as CompletedOrder}
                onClose={() => setModalState(prev => ({ ...prev, isCashBill: false }))}
                restaurantName={restaurantName}
                logoUrl={logoUrl}
            />
        </div>
    );
};

export default App;