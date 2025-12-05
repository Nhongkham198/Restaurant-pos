
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
    const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024 && window.innerWidth > window.innerHeight);

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

    const handleConfirmLogout = () => {
        Swal.fire({
            title: 'ยืนยันการออกจากระบบ',
            text: "คุณต้องการออกจากระบบใช่หรือไม่?",
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
    
            // 4. Reset the PIN for the paid table. This is the key step that triggers the 
            //    auto-logout on the customer's device.
            setTables(prevTables => 
                prevTables.map(table => {
                    if (table.id === orderToComplete.tableId) {
                        // Create a new object without the activePin property.
                        // When this updates in Firestore, the customer's view will detect
                        // that the PIN no longer matches and will log them out.
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
            // Branch admin performs a soft delete.
            const username = currentUser.username;
            setCompletedOrders(prev => prev.map(o => completedIdsToDelete.includes(o.id) ? { ...o, isDeleted: true, deletedBy: username } : o));
            setCancelledOrders(prev => prev.map(o => cancelledIdsToDelete.includes(o.id) ? { ...o, isDeleted: true, deletedBy: username } : o));
            setPrintHistory(prev => prev.map(p => printIdsToDelete.includes(p.id) ? { ...p, isDeleted: true, deletedBy: username } : p));
            Swal.fire('ลบแล้ว!', 'รายการถูกซ่อนจากประวัติเรียบร้อย', 'success');
        }
    };

    const handleUpdateCurrentUser = (updates: Partial<User>) => {
        if (!currentUser) return;
        
        const updatedUser = { ...currentUser, ...updates };
        setCurrentUser(updatedUser);
        localStorage.setItem('currentUser', JSON.stringify(updatedUser));

        // Also update the master users list
        setUsers(prevUsers => prevUsers.map(u => u.id === currentUser.id ? updatedUser : u));

        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: 'อัปเดตโปรไฟล์แล้ว',
            showConfirmButton: false,
            timer: 1500
        });
    };

    const handleStaffCall = (table: Table, customerName: string) => {
        if (!selectedBranch) return;
        const newCall: StaffCall = {
            id: Date.now(),
            tableId: table.id,
            tableName: table.name,
            customerName: customerName,
            branchId: selectedBranch.id,
            timestamp: Date.now()
        };
        setStaffCalls(prev => [...prev, newCall]);
    };
    
    // ============================================================================
    // 4. EFFECTS
    // ============================================================================

    // --- Responsive Design Effect ---
    useEffect(() => {
        const handleResize = () => setIsDesktop(window.innerWidth >= 1024 && window.innerWidth > window.innerHeight);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // --- Update localStorage on state changes ---
    useEffect(() => { localStorage.setItem('currentView', currentView); }, [currentView]);
    
    // --- Badge Animation ---
    useEffect(() => {
        if (totalItems > prevTotalItems.current && !isOrderSidebarVisible) {
            setIsBadgeAnimating(true);
            const timer = setTimeout(() => setIsBadgeAnimating(false), 500); // Duration of animation
            return () => clearTimeout(timer);
        }
        prevTotalItems.current = totalItems;
    }, [totalItems, isOrderSidebarVisible]);

    // --- Sound Notification Effect ---
    useEffect(() => {
        const newWaitingOrders = activeOrders.filter(o => o.status === 'waiting');
        const prevWaitingOrders = prevActiveOrdersRef.current?.filter(o => o.status === 'waiting') || [];

        if (newWaitingOrders.length > prevWaitingOrders.length && notificationSoundUrl) {
            // Only play sound for POS and Kitchen roles
            if (currentUser && (currentUser.role === 'pos' || currentUser.role === 'kitchen')) {
                const audio = new Audio(notificationSoundUrl);
                audio.play().catch(e => console.error("Error playing notification sound:", e));
            }
        }
        
        prevActiveOrdersRef.current = activeOrders;
    }, [activeOrders, notificationSoundUrl, currentUser]);
    
    // --- Staff Call Notification Effect ---
    useEffect(() => {
        if (staffCalls.length === 0) {
            activeCallRef.current = null; // Reset if all calls are cleared
            return;
        }

        const latestCall = staffCalls[staffCalls.length - 1];

        // Only play sound for a new, unacknowledged call
        if (latestCall && latestCall.id !== activeCallRef.current?.id) {
            // NEW: Check user role before showing notification
            if (!currentUser || currentUser.role === 'auditor') {
                return; // Do not show notification for auditor or if no user is logged in
            }
            
            activeCallRef.current = latestCall; // Mark this as the active call
            
            if (staffCallSoundUrl) {
                if (!staffCallAudioRef.current) {
                    staffCallAudioRef.current = new Audio(staffCallSoundUrl);
                    staffCallAudioRef.current.loop = true; // Loop the sound
                }
                staffCallAudioRef.current.play().catch(e => console.error("Error playing staff call sound:", e));
            }

            Swal.fire({
                title: 'ลูกค้าเรียกพนักงาน!',
                html: `โต๊ะ <strong>${latestCall.tableName}</strong> (คุณ ${latestCall.customerName}) ต้องการความช่วยเหลือ`,
                icon: 'info',
                confirmButtonText: 'รับทราบ',
                allowOutsideClick: false,
            }).then(() => {
                // Stop sound and clear the call from the list
                if (staffCallAudioRef.current) {
                    staffCallAudioRef.current.pause();
                    staffCallAudioRef.current.currentTime = 0;
                }
                // Remove only the acknowledged call
                setStaffCalls(prev => prev.filter(call => call.id !== latestCall.id));
                activeCallRef.current = null;
            });
        }

    }, [staffCalls, staffCallSoundUrl, setStaffCalls, currentUser]);

    // --- Customer Mode Setup Effect ---
    useEffect(() => {
        // --- Customer Mode Detection ---
        const params = new URLSearchParams(window.location.search);
        const mode = params.get('mode');
        const branchIdParam = params.get('branchId');
        const tableIdParam = params.get('tableId');

        if (mode === 'customer' && branchIdParam && tableIdParam) {
            setIsCustomerMode(true);
            const branch = branches.find(b => b.id === parseInt(branchIdParam, 10));
            if (branch) {
                setSelectedBranch(branch);
                localStorage.setItem('customerSelectedBranch', JSON.stringify(branch));
            }
            setCustomerTableId(parseInt(tableIdParam, 10));
        } else {
            setIsCustomerMode(false);
        }
    }, [branches]); // Depends on branches to find the correct one
    
    // --- Set Pending Order Count for Android Bridge ---
    useEffect(() => {
        if (window.AndroidBridge) {
            window.AndroidBridge.setPendingOrderCount(kitchenBadgeCount);
        }
    }, [kitchenBadgeCount]);

    // ============================================================================
    // 5. RENDER LOGIC
    // ============================================================================

    // --- Customer Mode View ---
    if (isCustomerMode) {
        if (!selectedBranch || customerTableId === null) {
            return <div className="p-4 text-center text-red-500">Error: Invalid branch or table information provided in URL.</div>;
        }
        const customerTable = tables.find(t => t.id === customerTableId);
        if (!customerTable) {
             return <div className="p-4 text-center text-red-500">Error: Table not found in the selected branch.</div>;
        }
        return (
            <CustomerView 
                table={customerTable}
                menuItems={menuItems}
                categories={categories}
                activeOrders={activeOrders.filter(o => o.tableId === customerTable.id)}
                allBranchOrders={activeOrders}
                onPlaceOrder={(items, name, count) => handlePlaceOrder(items, name, count)}
                onStaffCall={(table, name) => handleStaffCall(table, name)}
            />
        );
    }
    
    // --- Staff/Admin Views ---
    if (!currentUser) return <LoginScreen onLogin={handleLogin} />;
    if (!selectedBranch) return <BranchSelectionScreen onSelectBranch={handleBranchSelect} currentUser={currentUser} branches={branches} onManageBranches={() => setModalState(prev => ({ ...prev, isBranchManager: true }))} onLogout={handleLogout} />;

    const mainContent = () => {
        switch (currentView) {
            case 'pos': return <Menu 
                menuItems={menuItems}
                setMenuItems={setMenuItems}
                categories={categories}
                onSelectItem={handleAddItemToOrder}
                isEditMode={canEdit}
                onEditItem={(item) => { setItemToEdit(item); setModalState(prev => ({ ...prev, isMenuItem: true })); }}
                onAddNewItem={() => { setItemToEdit(null); setModalState(prev => ({ ...prev, isMenuItem: true })); }}
                onDeleteItem={(id) => setMenuItems(menuItems.filter(item => item.id !== id))}
                onAddCategory={(name) => setCategories([...categories, name])}
                onUpdateCategory={(oldName, newName) => {
                    setCategories(categories.map(c => c === oldName ? newName : c));
                    setMenuItems(menuItems.map(item => item.category === oldName ? { ...item, category: newName } : item));
                }}
                onDeleteCategory={(name) => setCategories(categories.filter(c => c !== name))}
                onImportMenu={(newItems, newCats) => {
                    // Merge new items with existing ones by ID
                    const itemMap = new Map(menuItems.map(item => [item.id, item]));
                    newItems.forEach(item => itemMap.set(item.id, item));
                    setMenuItems(Array.from(itemMap.values()));
            
                    // Merge categories
                    const catSet = new Set([...categories, ...newCats]);
                    setCategories(Array.from(catSet));
                }}
                totalItems={totalItems}
            />;
            case 'kitchen': return <KitchenView activeOrders={activeOrders} onStartCooking={handleStartCooking} onCompleteOrder={handleCompleteOrder} />;
            case 'tables': return <TableLayout 
                tables={tables} 
                activeOrders={activeOrders} 
                onTableSelect={(tableId) => {
                    setSelectedTableId(tableId);
                    setCurrentOrderItems([]);
                    setCustomerName('');
                    setCustomerCount(1);
                    setCurrentView('pos');
                }} 
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
            />;
            case 'dashboard': return <Dashboard completedOrders={completedOrders} cancelledOrders={cancelledOrders} openingTime={openingTime || '10:00'} closingTime={closingTime || '22:00'} currentUser={currentUser} />;
            case 'history': return <SalesHistory 
                completedOrders={completedOrders}
                cancelledOrders={cancelledOrders}
                printHistory={printHistory}
                onReprint={() => {}}
                onSplitOrder={() => {}}
                isEditMode={canEdit}
                onEditOrder={() => {}}
                onInitiateCashBill={(order) => {
                    setOrderForModal(order);
                    setModalState(prev => ({ ...prev, isCashBill: true }));
                }}
                onDeleteHistory={handleDeleteHistory}
                currentUser={currentUser}
            />;
            case 'stock': return <StockManagement stockItems={stockItems} setStockItems={setStockItems} stockCategories={stockCategories} setStockCategories={setStockCategories} stockUnits={stockUnits} setStockUnits={setStockUnits} />;
            case 'leave': return <LeaveCalendarView leaveRequests={leaveRequests} currentUser={currentUser} onOpenRequestModal={(date) => { setLeaveRequestInitialDate(date || null); setModalState(prev => ({ ...prev, isLeaveRequest: true })); }} />;
            default: return <div>Unknown View</div>;
        }
    };
    
    const handleModalClose = () => {
        setModalState({
            isMenuItem: false, isOrderSuccess: false, isSplitBill: false, isTableBill: false,
            isPayment: false, isPaymentSuccess: false, isSettings: false, isEditCompleted: false,
            isUserManager: false, isBranchManager: false, isMoveTable: false, isCancelOrder: false,
            isCashBill: false, isSplitCompleted: false, isCustomization: false, isLeaveRequest: false,
            isMenuSearch: false, isMergeBill: false
        });
        setItemToEdit(null);
        setItemToCustomize(null);
        setOrderForModal(null);
        setOrderItemToEdit(null);
        setLeaveRequestInitialDate(null);
    };

    const renderAllModals = () => (
        <>
            <MenuItemModal isOpen={modalState.isMenuItem} onClose={handleModalClose} onSave={(item) => {}} itemToEdit={itemToEdit} categories={categories} onAddCategory={(name) => setCategories([...categories, name])} />
            <OrderSuccessModal isOpen={modalState.isOrderSuccess} onClose={handleModalClose} orderId={lastPlacedOrderId!} />
            <TableBillModal
                isOpen={modalState.isTableBill}
                onClose={handleModalClose}
                order={orderForModal as ActiveOrder | null}
                onInitiatePayment={(order) => { setOrderForModal(order); setModalState(prev => ({ ...prev, isTableBill: false, isPayment: true })); }}
                onInitiateMove={(order) => { setOrderForModal(order); setModalState(prev => ({ ...prev, isTableBill: false, isMoveTable: true })); }}
                onSplit={() => {}}
                isEditMode={canEdit}
                onUpdateOrder={() => {}}
                currentUser={currentUser}
                onInitiateCancel={(order) => { setOrderForModal(order); setModalState(prev => ({ ...prev, isTableBill: false, isCancelOrder: true })); }}
                activeOrderCount={activeOrders.length}
                onInitiateMerge={(order) => { setOrderForModal(order); setModalState(prev => ({...prev, isTableBill: false, isMergeBill: true})); }}
            />
            <PaymentModal isOpen={modalState.isPayment} order={orderForModal as ActiveOrder | null} onClose={handleModalClose} onConfirmPayment={handleConfirmPayment} qrCodeUrl={qrCodeUrl} isEditMode={canEdit} onOpenSettings={() => setModalState(prev => ({ ...prev, isSettings: true }))} isConfirmingPayment={isConfirmingPayment}/>
            <PaymentSuccessModal isOpen={modalState.isPaymentSuccess} onClose={(shouldPrint) => handleClosePaymentSuccess(shouldPrint)} orderNumber={(orderForModal as CompletedOrder)?.orderNumber} />
            <SettingsModal 
                isOpen={modalState.isSettings}
                onClose={handleModalClose}
                onSave={(newQr, newSound, newStaffCallSound, newPrinterConfig, newOpen, newClose) => {
                    setQrCodeUrl(newQr);
                    setNotificationSoundUrl(newSound);
                    setStaffCallSoundUrl(newStaffCallSound);
                    setPrinterConfig(newPrinterConfig);
                    setOpeningTime(newOpen);
                    setClosingTime(newClose);
                    handleModalClose();
                }}
                currentQrCodeUrl={qrCodeUrl}
                currentNotificationSoundUrl={notificationSoundUrl}
                currentStaffCallSoundUrl={staffCallSoundUrl}
                currentPrinterConfig={printerConfig}
                currentOpeningTime={openingTime}
                currentClosingTime={closingTime}
                onSavePrinterConfig={setPrinterConfig}
             />
            <UserManagerModal isOpen={modalState.isUserManager} onClose={handleModalClose} users={users} setUsers={setUsers} currentUser={currentUser!} branches={branches} isEditMode={canEdit}/>
            <BranchManagerModal isOpen={modalState.isBranchManager} onClose={handleModalClose} branches={branches} setBranches={setBranches} />
            <MoveTableModal isOpen={modalState.isMoveTable} onClose={handleModalClose} order={orderForModal as ActiveOrder | null} tables={tables} activeOrders={activeOrders} onConfirmMove={()=>{}} floors={floors} />
            <CancelOrderModal isOpen={modalState.isCancelOrder} order={orderForModal as ActiveOrder | null} onClose={handleModalClose} onConfirm={handleCancelOrder} />
            <CashBillModal isOpen={modalState.isCashBill} order={orderForModal as CompletedOrder | null} onClose={handleModalClose} restaurantName={restaurantName} logoUrl={logoUrl}/>
            <ItemCustomizationModal isOpen={modalState.isCustomization} onClose={handleModalClose} item={itemToCustomize} orderItemToEdit={orderItemToEdit} onConfirm={handleConfirmCustomization} />
            <LeaveRequestModal isOpen={modalState.isLeaveRequest} onClose={handleModalClose} currentUser={currentUser} onSave={() => {}} initialDate={leaveRequestInitialDate} />
            <MenuSearchModal isOpen={modalState.isMenuSearch} onClose={handleModalClose} menuItems={menuItems} onSelectItem={handleAddItemToOrder} />
            <MergeBillModal isOpen={modalState.isMergeBill} onClose={handleModalClose} order={orderForModal as ActiveOrder | null} allActiveOrders={activeOrders} tables={tables} onConfirmMerge={() => {}} />
        </>
    );

    if (isDesktop) {
        return (
            <div className={`h-screen flex flex-col md:flex-row bg-gray-100 font-sans transition-all duration-300 ${shouldShowAdminSidebar && !isAdminSidebarCollapsed ? 'md:pl-64' : (shouldShowAdminSidebar ? 'md:pl-20' : '')}`}>
                {renderAllModals()}
    
                {shouldShowAdminSidebar && (
                    <AdminSidebar
                        isCollapsed={isAdminSidebarCollapsed}
                        onToggleCollapse={() => setIsAdminSidebarCollapsed(!isAdminSidebarCollapsed)}
                        logoUrl={logoUrl}
                        restaurantName={restaurantName}
                        branchName={selectedBranch.name}
                        currentUser={currentUser}
                        onViewChange={handleViewChange}
                        currentView={currentView}
                        onToggleEditMode={() => setIsEditMode(!isEditMode)}
                        isEditMode={isEditMode}
                        onOpenSettings={() => setModalState(prev => ({ ...prev, isSettings: true }))}
                        onOpenUserManager={() => setModalState(prev => ({ ...prev, isUserManager: true }))}
                        onManageBranches={() => { setSelectedBranch(null); localStorage.removeItem('selectedBranch'); }}
                        onChangeBranch={() => { setSelectedBranch(null); localStorage.removeItem('selectedBranch'); }}
                        onLogout={handleLogout}
                        kitchenBadgeCount={kitchenBadgeCount}
                        tablesBadgeCount={tablesBadgeCount}
                        leaveBadgeCount={leaveBadgeCount}
                        onUpdateCurrentUser={handleUpdateCurrentUser}
                        onUpdateLogoUrl={setLogoUrl}
                        onUpdateRestaurantName={setRestaurantName}
                    />
                )}
    
                <div className="flex-1 flex flex-col overflow-hidden relative">
                     {!shouldShowAdminSidebar && (
                        <Header
                            currentView={currentView}
                            onViewChange={handleViewChange}
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
                            onLogoChangeClick={()=>{}}
                            restaurantName={restaurantName}
                            onRestaurantNameChange={()=>{}}
                            branchName={selectedBranch.name}
                            onChangeBranch={() => { setSelectedBranch(null); localStorage.removeItem('selectedBranch'); }}
                            onManageBranches={() => { setSelectedBranch(null); localStorage.removeItem('selectedBranch'); }}
                        />
                    )}
                    
                    <main className="flex-1 flex overflow-hidden relative">
                        <div className="flex-1 h-full overflow-y-auto">
                            {mainContent()}
                        </div>
                        <div
                            className="relative h-full transition-all duration-300 ease-in-out"
                            style={{
                                width: isOrderSidebarVisible ? (isDesktop ? '24rem' : '100%') : '0',
                            }}
                        >
                            {isOrderSidebarVisible && (
                                <Sidebar
                                    currentOrderItems={currentOrderItems}
                                    onQuantityChange={handleQuantityChange}
                                    onRemoveItem={handleRemoveItemFromOrder}
                                    onClearOrder={() => setCurrentOrderItems([])}
                                    onPlaceOrder={handlePlaceOrder}
                                    isPlacingOrder={isPlacingOrder}
                                    tables={tables}
                                    selectedTable={tables.find(t => t.id === selectedTableId) || null}
                                    onSelectTable={(id) => setSelectedTableId(id)}
                                    customerName={customerName}
                                    onCustomerNameChange={setCustomerName}
                                    customerCount={customerCount}
                                    onCustomerCountChange={setCustomerCount}
                                    isEditMode={canEdit}
                                    onAddNewTable={handleAddNewTable}
                                    onRemoveLastTable={handleRemoveLastTable}
                                    floors={floors}
                                    selectedFloor={selectedSidebarFloor || floors[0]}
                                    onFloorChange={setSelectedSidebarFloor}
                                    onAddFloor={() => {}}
                                    onRemoveFloor={() => {}}
                                    sendToKitchen={sendToKitchen}
                                    onSendToKitchenChange={(enabled, details) => {
                                        setSendToKitchen(enabled);
                                        setNotSentToKitchenDetails(details);
                                    }}
                                    onUpdateReservation={() => {}}
                                    onOpenSearch={() => setModalState(prev => ({ ...prev, isMenuSearch: true }))}
                                    currentUser={currentUser}
                                    onEditOrderItem={handleEditOrderItem}
                                    onViewChange={handleViewChange}
                                    restaurantName={restaurantName}
                                    onLogout={handleLogout}
                                />
                            )}
                        </div>
                        
                        <button
                            onClick={() => setIsOrderSidebarVisible(!isOrderSidebarVisible)}
                            className={`absolute top-1/2 -translate-y-1/2 z-30 bg-gray-800 text-white rounded-l-full py-8 pl-1 pr-2 transform transition-all duration-300 ease-in-out hover:bg-gray-700 focus:outline-none shadow-lg ${isDesktop ? '' : 'hidden'}`}
                            style={{ right: isOrderSidebarVisible ? '24rem' : '0' }}
                            aria-label={isOrderSidebarVisible ? 'Hide order sidebar' : 'Show order sidebar'}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 transition-transform ${!isOrderSidebarVisible ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            {!isOrderSidebarVisible && totalItems > 0 && (
                                 <div className={`absolute -top-1 -left-1 flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-sm font-bold text-white border-2 border-gray-800 ${isBadgeAnimating ? 'animate-bounce' : ''}`}>
                                    {totalItems > 9 ? '9+' : totalItems}
                                </div>
                            )}
                        </button>
                    </main>
                </div>
            </div>
        );
    }

    // --- MOBILE / TABLET LAYOUT ---
    const mobileMainContent = () => {
        switch (currentView) {
            case 'pos':
                // The POS view on mobile is the Sidebar itself.
                return <Sidebar
                    isMobilePage={true}
                    currentOrderItems={currentOrderItems}
                    onQuantityChange={handleQuantityChange}
                    onRemoveItem={handleRemoveItemFromOrder}
                    onClearOrder={() => setCurrentOrderItems([])}
                    onPlaceOrder={handlePlaceOrder}
                    isPlacingOrder={isPlacingOrder}
                    tables={tables}
                    selectedTable={tables.find(t => t.id === selectedTableId) || null}
                    onSelectTable={(id) => setSelectedTableId(id)}
                    customerName={customerName}
                    onCustomerNameChange={setCustomerName}
                    customerCount={customerCount}
                    onCustomerCountChange={setCustomerCount}
                    isEditMode={canEdit}
                    onAddNewTable={handleAddNewTable}
                    onRemoveLastTable={handleRemoveLastTable}
                    floors={floors}
                    selectedFloor={selectedSidebarFloor || floors[0]}
                    onFloorChange={setSelectedSidebarFloor}
                    onAddFloor={() => {}}
                    onRemoveFloor={() => {}}
                    sendToKitchen={sendToKitchen}
                    onSendToKitchenChange={(enabled, details) => {
                        setSendToKitchen(enabled);
                        setNotSentToKitchenDetails(details);
                    }}
                    onUpdateReservation={() => {}}
                    onOpenSearch={() => setModalState(prev => ({ ...prev, isMenuSearch: true }))}
                    currentUser={currentUser}
                    onEditOrderItem={handleEditOrderItem}
                    onViewChange={handleViewChange}
                    restaurantName={restaurantName}
                    onLogout={handleLogout}
                />;
            case 'kitchen':
                return <KitchenView activeOrders={activeOrders} onStartCooking={handleStartCooking} onCompleteOrder={handleCompleteOrder} />;
            case 'tables':
            case 'dashboard':
            case 'history':
            case 'stock':
            case 'leave':
                 return (
                    <div className="bg-gray-100 h-full text-gray-800">
                        {mainContent()}
                    </div>
                );
            default:
                return <div className="bg-gray-100 h-full text-gray-800">Unknown View</div>;
        }
    };
    
    return (
        <div className="h-screen flex flex-col bg-gray-100 font-sans">
            {renderAllModals()}
            <header className="p-3 flex justify-between items-center border-b border-gray-800 flex-shrink-0 bg-gray-900 text-white">
                <div onClick={handleConfirmLogout} className="flex items-center gap-3 cursor-pointer">
                    <div className="w-10 h-10 rounded-full bg-gray-700 overflow-hidden border border-gray-600">
                        <img src={currentUser?.profilePictureUrl || "https://img.icons8.com/fluency/48/user-male-circle.png"} alt="Profile" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex flex-col">
                        <span className="font-bold text-white text-sm leading-tight">{currentUser?.username || 'Guest'}</span>
                        <span className="text-[10px] text-gray-400 bg-gray-800 px-1.5 rounded border border-gray-700 self-start mt-0.5">{currentUser?.role || 'Staff'}</span>
                    </div>
                </div>
                <div className="flex-1 text-center mx-2">
                    <h2 className="text-xl font-extrabold text-red-600 tracking-wider truncate" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.5)' }}>
                        {restaurantName || 'SeoulGood'}
                    </h2>
                </div>
                <button
                    onClick={() => setModalState(prev => ({ ...prev, isMenuSearch: true }))}
                    className="p-2 rounded-full hover:bg-gray-800 transition-colors text-gray-300 hover:text-white flex-shrink-0"
                    title="ค้นหาเมนู"
                >
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </button>
            </header>

            <main className="flex-1 overflow-y-auto relative pb-20">
                {mobileMainContent()}
            </main>
            
            <BottomNavBar 
                items={[
                    {id: 'pos', label: 'POS', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" /><path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h2a1 1 0 100-2H9z" clipRule="evenodd" /></svg>, view: 'pos'},
                    {id: 'tables', label: 'ผังโต๊ะ', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm2 1v8h8V6H4z" /></svg>, view: 'tables', badge: tablesBadgeCount},
                    {id: 'kitchen', label: 'ครัว', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h10a3 3 0 013 3v5a.997.997 0 01-.293.707zM5 6a1 1 0 100 2 1 1 0 000-2zm3 0a1 1 0 100 2 1 1 0 000-2zm3 0a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" /></svg>, view: 'kitchen', badge: kitchenBadgeCount},
                    {id: 'history', label: 'ประวัติ', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>, view: 'history'},
                    {id: 'stock', label: 'สต๊อก', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>, view: 'stock'},
                    {id: 'settings', label: 'ตั้งค่า', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924-1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>, onClick: () => setModalState(prev => ({...prev, isSettings: true}))}
                ]}
                currentView={currentView}
                onViewChange={handleViewChange}
            />
        </div>
    );
};

export default App;
